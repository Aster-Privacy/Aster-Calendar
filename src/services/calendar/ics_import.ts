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
import type { ImportedIcsEvent } from "@/services/calendar/ics_file";
import type { CalendarEventDraft } from "@/types/calendar";

import {
  create_event,
  create_events_batch,
  delete_events_batch,
  list_events,
} from "@/services/api/calendar";
import { parse_ics_events } from "@/services/calendar/ics_file";

export interface IcsImportResult {
  parsed: number;
  imported: number;
}

export async function import_ics_text(
  text: string,
  calendar_id: string,
): Promise<IcsImportResult> {
  const parsed = parse_ics_events(text);

  let imported = 0;

  for (const entry of parsed) {
    const created = await create_event({
      attendees: entry.attendees,
      availability: entry.availability,
      calendar_id,
      color: null,
      conference_url: entry.conference_url,
      description: entry.description,
      ends_at: entry.ends_at,
      event_kind: "default",
      guests_can_invite: true,
      guests_can_modify: false,
      guests_can_see_guests: true,
      is_all_day: entry.is_all_day,
      is_completed: false,
      location: entry.location,
      recurrence: entry.recurrence,
      recurrence_exceptions: entry.recurrence_exceptions,
      recurrence_id: entry.recurrence_id,
      reminder_minutes: entry.reminder_minutes,
      ...(entry.reminders ? { reminders: entry.reminders } : {}),
      starts_at: entry.starts_at,
      status: entry.status,
      tags: [],
      title: entry.title,
      uid: entry.uid,
      visibility: entry.visibility,
      working_location: null,
    });

    if (created.data) {
      imported += 1;
    }
  }

  return { imported, parsed: parsed.length };
}

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_FILES = 20;
const MAX_IMPORT_TOTAL_EVENTS = 5000;
const PREVIEW_SPAN_PADDING_MS = 24 * 60 * 60 * 1000;

export function is_ics_file(file: File): boolean {
  const name = file.name.toLowerCase();

  return (
    name.endsWith(".ics") ||
    name.endsWith(".ical") ||
    file.type === "text/calendar"
  );
}

export interface ImportSplit {
  new_entries: ImportedIcsEvent[];
  existing_count: number;
}

const IMPORT_CHUNK_SIZE = 50;

export function import_entry_key(entry: {
  uid: string | null;
  recurrence_id: string | null;
}): string | null {
  if (!entry.uid || entry.uid.trim().length === 0) {
    return null;
  }

  return `${entry.uid.trim()}|${entry.recurrence_id ?? ""}`;
}

export function existing_import_keys(
  events: Array<{ uid?: string | null; recurrence_id?: string | null }>,
): Set<string> {
  const keys = new Set<string>();

  for (const event of events) {
    const key = import_entry_key({
      uid: event.uid ?? null,
      recurrence_id: event.recurrence_id ?? null,
    });

    if (key) {
      keys.add(key);
    }
  }

  return keys;
}

export function split_import_entries(
  parsed: ImportedIcsEvent[],
  existing: Set<string>,
): ImportSplit {
  const seen = new Set<string>();
  const new_entries: ImportedIcsEvent[] = [];
  let existing_count = 0;

  for (const entry of parsed) {
    const key = import_entry_key(entry);

    if (key && existing.has(key)) {
      existing_count += 1;

      continue;
    }

    if (key) {
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
    }

    new_entries.push(entry);
  }

  return { new_entries, existing_count };
}

export function import_span(
  parsed: ImportedIcsEvent[],
): { start: Date; end: Date } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const entry of parsed) {
    const starts = new Date(entry.starts_at).getTime();
    const ends = new Date(entry.ends_at).getTime();

    if (!Number.isNaN(starts)) {
      min = Math.min(min, starts);
      max = Math.max(max, starts);
    }

    if (!Number.isNaN(ends)) {
      max = Math.max(max, ends);
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  return { start: new Date(min), end: new Date(max) };
}

export function import_entry_draft(
  entry: ImportedIcsEvent,
  calendar_id: string,
): CalendarEventDraft {
  return {
    attendees: entry.attendees,
    availability: entry.availability,
    calendar_id,
    color: null,
    conference_url: entry.conference_url,
    description: entry.description,
    ends_at: entry.ends_at,
    event_kind: "default",
    guests_can_invite: true,
    guests_can_modify: false,
    guests_can_see_guests: true,
    is_all_day: entry.is_all_day,
    is_completed: false,
    location: entry.location,
    recurrence: entry.recurrence,
    recurrence_exceptions: entry.recurrence_exceptions,
    recurrence_id: entry.recurrence_id,
    reminder_minutes: entry.reminder_minutes,
    ...(entry.reminders ? { reminders: entry.reminders } : {}),
    starts_at: entry.starts_at,
    status: entry.status,
    tags: [],
    title: entry.title,
    uid: entry.uid,
    visibility: entry.visibility,
    working_location: null,
  };
}

export async function import_entries(
  entries: ImportedIcsEvent[],
  calendar_id: string,
  on_progress?: (done: number, total: number) => void,
): Promise<string[]> {
  const created: string[] = [];

  for (let index = 0; index < entries.length; index += IMPORT_CHUNK_SIZE) {
    const chunk = entries.slice(index, index + IMPORT_CHUNK_SIZE);
    const result = await create_events_batch(
      chunk.map((entry) => import_entry_draft(entry, calendar_id)),
    );

    if (!result.data) {
      throw new Error("calendar import failed");
    }

    for (const row of result.data) {
      created.push(row.event_id);
    }

    on_progress?.(
      Math.min(index + chunk.length, entries.length),
      entries.length,
    );
  }

  return created;
}

export async function undo_import(event_ids: string[]): Promise<void> {
  for (let index = 0; index < event_ids.length; index += IMPORT_CHUNK_SIZE) {
    const result = await delete_events_batch(
      event_ids.slice(index, index + IMPORT_CHUNK_SIZE),
    );

    if (!result.data) {
      throw new Error("calendar import undo failed");
    }
  }
}

export interface ImportPreview {
  file_names: string[];
  parsed: ImportedIcsEvent[];
  new_entries: ImportedIcsEvent[];
  existing_count: number;
  dropped_time_zones: string[];
}

const MAX_REPORTED_DROPPED_ZONES = 5;

export function collect_dropped_time_zones(
  entries: ImportedIcsEvent[],
): string[] {
  const zones = new Set<string>();

  for (const entry of entries) {
    for (const zone of entry.dropped_time_zones ?? []) {
      zones.add(zone);
    }
  }

  return Array.from(zones).sort().slice(0, MAX_REPORTED_DROPPED_ZONES);
}

export async function read_import_preview(
  files: File[],
): Promise<ImportPreview> {
  const parsed: ImportedIcsEvent[] = [];

  for (const file of files.slice(0, MAX_IMPORT_FILES)) {
    const remaining = MAX_IMPORT_TOTAL_EVENTS - parsed.length;

    if (remaining <= 0) {
      break;
    }

    parsed.push(...parse_ics_events(await file.text()).slice(0, remaining));
  }

  const span = import_span(parsed);
  let existing = new Set<string>();

  if (span) {
    try {
      const result = await list_events(
        new Date(span.start.getTime() - PREVIEW_SPAN_PADDING_MS),
        new Date(span.end.getTime() + PREVIEW_SPAN_PADDING_MS),
      );

      existing = existing_import_keys(result.data);
    } catch {
      existing = new Set<string>();
    }
  }

  const split = split_import_entries(parsed, existing);

  return {
    file_names: files.map((file) => file.name),
    parsed,
    new_entries: split.new_entries,
    existing_count: split.existing_count,
    dropped_time_zones: collect_dropped_time_zones(parsed),
  };
}
