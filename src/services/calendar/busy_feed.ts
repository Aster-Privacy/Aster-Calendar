//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { ApiResponse } from "@/services/api/client/helpers";
import type { DecryptedCalendarEvent } from "@/types/calendar";

import { api_client } from "@/services/api/client";
import { list_event_masters } from "@/services/api/calendar";
import { expand_events } from "@/services/calendar/recurrence";
import { is_own_address } from "@/services/calendar/own_addresses";
import { calendar_sync_engine } from "@/services/calendar/sync_engine";

export const BUSY_BLOCK_STEP_SECONDS = 300;
export const BUSY_PAST_DAYS = 7;
export const BUSY_FUTURE_DAYS = 90;
export const MAX_BUSY_BLOCKS = 2000;

const DAY_SECONDS = 86_400;
const EXPANSION_BUDGET = 50_000;
const BUSY_FEEDS_ENDPOINT = "/calendar/v1/busy_feeds";
const EXCLUDED_KINDS = new Set(["task", "working_location", "birthday"]);

export type BusyBlock = [number, number];

export interface BusyUpload {
  window_start: number;
  window_end: number;
  blocks: BusyBlock[];
}

export interface BusyFeedSummary {
  calendar_id: string;
  created_at: string;
  published_at: string | null;
  window_start: string | null;
  window_end: string | null;
  block_count: number;
}

export interface BusyFeedLink {
  calendar_id: string;
  feed_url: string;
  created_at: string;
  published_at: string | null;
}

export interface BusyPublishResult {
  published_at: string;
  block_count: number;
}

function floor_step(seconds: number): number {
  return (
    Math.floor(seconds / BUSY_BLOCK_STEP_SECONDS) * BUSY_BLOCK_STEP_SECONDS
  );
}

function ceil_step(seconds: number): number {
  return Math.ceil(seconds / BUSY_BLOCK_STEP_SECONDS) * BUSY_BLOCK_STEP_SECONDS;
}

export function busy_window(now: Date): { start: number; end: number } {
  const anchor = floor_step(Math.floor(now.getTime() / 1000));

  return {
    start: anchor - BUSY_PAST_DAYS * DAY_SECONDS,
    end: anchor + BUSY_FUTURE_DAYS * DAY_SECONDS,
  };
}

function local_midnight(value: Date): Date {
  const day = new Date(value.getTime());

  day.setHours(0, 0, 0, 0);

  return day;
}

function all_day_bounds(event: DecryptedCalendarEvent): BusyBlock | null {
  const starts = new Date(event.starts_at);
  const ends = new Date(event.ends_at);

  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
    return null;
  }

  const first_day = local_midnight(starts);
  const end_day = local_midnight(ends);

  if (end_day.getTime() !== ends.getTime() || end_day <= first_day) {
    end_day.setDate(end_day.getDate() + 1);
  }

  return [
    Math.floor(first_day.getTime() / 1000),
    Math.floor(end_day.getTime() / 1000),
  ];
}

function timed_bounds(event: DecryptedCalendarEvent): BusyBlock | null {
  const start = new Date(event.starts_at).getTime();
  const end = new Date(event.ends_at).getTime();

  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return null;
  }

  return [Math.floor(start / 1000), Math.ceil(end / 1000)];
}

function declined_by_me(
  event: DecryptedCalendarEvent,
  self_email: string | null | undefined,
): boolean {
  return event.attendees.some(
    (attendee) =>
      !attendee.is_organizer &&
      attendee.response === "declined" &&
      is_own_address(attendee.email, self_email),
  );
}

export function counts_as_busy(
  event: DecryptedCalendarEvent,
  self_email: string | null | undefined,
): boolean {
  if (event.trashed_at) return false;
  if (event.status === "cancelled") return false;
  if (event.availability === "free") return false;
  if (EXCLUDED_KINDS.has(event.event_kind)) return false;

  return !declined_by_me(event, self_email);
}

function merge_blocks(blocks: BusyBlock[]): BusyBlock[] {
  const sorted = [...blocks].sort((left, right) =>
    left[0] === right[0] ? left[1] - right[1] : left[0] - right[0],
  );
  const merged: BusyBlock[] = [];

  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];

    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  return merged;
}

function cap_blocks(blocks: BusyBlock[], now_seconds: number): BusyBlock[] {
  if (blocks.length <= MAX_BUSY_BLOCKS) {
    return blocks;
  }

  const upcoming = blocks.filter(([, end]) => end > now_seconds);
  const past = blocks.filter(([, end]) => end <= now_seconds);
  const kept_upcoming = upcoming.slice(0, MAX_BUSY_BLOCKS);
  const room = MAX_BUSY_BLOCKS - kept_upcoming.length;
  const kept_past = room > 0 ? past.slice(past.length - room) : [];

  return [...kept_past, ...kept_upcoming];
}

export function compute_busy_upload(
  events: DecryptedCalendarEvent[],
  calendar_id: string,
  now: Date,
  self_email: string | null | undefined,
): BusyUpload {
  const window = busy_window(now);
  const range_start = new Date(window.start * 1000);
  const range_end = new Date(window.end * 1000);
  const candidates = events.filter(
    (event) =>
      event.calendar_id === calendar_id && counts_as_busy(event, self_email),
  );
  const occurrences = expand_events(candidates, range_start, range_end, {
    candidate_budget: EXPANSION_BUDGET,
  });
  const raw: BusyBlock[] = [];

  for (const occurrence of occurrences) {
    const bounds = occurrence.is_all_day
      ? all_day_bounds(occurrence)
      : timed_bounds(occurrence);

    if (!bounds) continue;

    const start = Math.max(floor_step(bounds[0]), window.start);
    const end = Math.min(ceil_step(bounds[1]), window.end);

    if (end > start) {
      raw.push([start, end]);
    }
  }

  return {
    window_start: window.start,
    window_end: window.end,
    blocks: cap_blocks(merge_blocks(raw), Math.floor(now.getTime() / 1000)),
  };
}

export function busy_upload_fingerprint(upload: BusyUpload): string {
  return upload.blocks.map(([start, end]) => `${start}-${end}`).join(",");
}

export async function list_busy_feeds(): Promise<
  ApiResponse<{ feeds: BusyFeedSummary[] }>
> {
  return api_client.get<{ feeds: BusyFeedSummary[] }>(BUSY_FEEDS_ENDPOINT, {
    silent_statuses: [404],
    skip_cache: true,
  });
}

export async function create_busy_feed_link(
  calendar_id: string,
): Promise<ApiResponse<BusyFeedLink>> {
  return api_client.post<BusyFeedLink>(
    `${BUSY_FEEDS_ENDPOINT}/${encodeURIComponent(calendar_id)}/token`,
    {},
  );
}

export async function revoke_busy_feed(
  calendar_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `${BUSY_FEEDS_ENDPOINT}/${encodeURIComponent(calendar_id)}`,
    { silent_statuses: [404] },
  );
}

export async function upload_busy_blocks(
  calendar_id: string,
  upload: BusyUpload,
): Promise<ApiResponse<BusyPublishResult>> {
  return api_client.put<BusyPublishResult>(
    `${BUSY_FEEDS_ENDPOINT}/${encodeURIComponent(calendar_id)}/busy`,
    upload,
  );
}

const published_fingerprints = new Map<string, string>();

export interface BusyPublishOptions {
  force?: boolean;
  now?: Date;
  should_continue?: () => boolean;
}

function may_continue(options: BusyPublishOptions): boolean {
  return options.should_continue ? options.should_continue() : true;
}

function cache_is_trustworthy(calendar_id: string): boolean {
  return (
    calendar_sync_engine.has_settled_first_sync() &&
    calendar_sync_engine.has_completed_pull() &&
    calendar_sync_engine.get_calendar(calendar_id) !== undefined
  );
}

export function forget_busy_fingerprints(): void {
  published_fingerprints.clear();
}

export async function publish_busy_calendar(
  calendar_id: string,
  self_email: string | null | undefined,
  options: BusyPublishOptions = {},
): Promise<BusyPublishResult | null> {
  const now = options.now ?? new Date();
  const window = busy_window(now);
  const masters = await list_event_masters(
    new Date(window.start * 1000),
    new Date(window.end * 1000),
  );

  if (!may_continue(options) || !cache_is_trustworthy(calendar_id)) {
    return null;
  }

  const upload = compute_busy_upload(
    masters.data,
    calendar_id,
    now,
    self_email,
  );
  const fingerprint = busy_upload_fingerprint(upload);

  if (
    !options.force &&
    published_fingerprints.get(calendar_id) === fingerprint
  ) {
    return null;
  }

  const result = await upload_busy_blocks(calendar_id, upload);

  if (!result.data) {
    return null;
  }

  published_fingerprints.set(calendar_id, fingerprint);

  return result.data;
}

export async function publish_all_busy_feeds(
  self_email: string | null | undefined,
  options: { force?: boolean; should_continue?: () => boolean } = {},
): Promise<number> {
  const listed = await list_busy_feeds();
  const feeds = listed.data?.feeds ?? [];
  let published = 0;

  for (const feed of feeds) {
    if (options.should_continue && !options.should_continue()) break;

    try {
      const result = await publish_busy_calendar(feed.calendar_id, self_email, {
        force: options.force,
        should_continue: options.should_continue,
      });

      if (result) published += 1;
    } catch {
      continue;
    }
  }

  return published;
}
