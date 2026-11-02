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
import type { DecryptedCalendarEvent } from "@/types/calendar";

import { api_client } from "@/services/api/client";
import { parse_ics_events } from "@/services/calendar/ics_file";

export const SUBSCRIPTION_EVENT_PREFIX = "subscription-";
export const SUBSCRIPTION_CALENDAR_PREFIX = "__subscription_";
const SUBSCRIPTION_COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;
const SUBSCRIPTION_FALLBACK_COLOR = "#6366f1";

export interface IcsSubscription {
  id: string;
  url: string;
  name: string;
  color: string;
}

export const SUBSCRIPTION_EXPANSION_BUDGET = 400_000;
export const MAX_SUBSCRIPTION_RECURRING_EVENTS = 500;

function feed_entry_key(
  entry: { uid: string | null; recurrence_id: string | null },
  index: number,
): string {
  if (!entry.uid) {
    return `n${index}`;
  }

  const uid_key = `u${encodeURIComponent(entry.uid)}`;

  return entry.recurrence_id
    ? `${uid_key}.${encodeURIComponent(entry.recurrence_id)}`
    : uid_key;
}

function unique_event_id(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 1;

  while (used.has(candidate)) {
    suffix += 1;
    candidate = `${base}~${suffix}`;
  }

  used.add(candidate);

  return candidate;
}

export function is_subscription_event(event: { id: string }): boolean {
  return event.id.startsWith(SUBSCRIPTION_EVENT_PREFIX);
}

export async function fetch_subscription_events(
  subscription: IcsSubscription,
): Promise<DecryptedCalendarEvent[]> {
  const response = await api_client.post<{ ics: string }>(
    "/calendar/v1/subscriptions/fetch",
    { url: subscription.url },
  );

  if (!response.data) {
    return [];
  }

  const used_ids = new Set<string>();
  let recurring_kept = 0;
  const entries = parse_ics_events(response.data.ics)
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => {
      if (!entry.recurrence) {
        return true;
      }

      recurring_kept += 1;

      return recurring_kept <= MAX_SUBSCRIPTION_RECURRING_EVENTS;
    });

  return entries.map(({ entry, index }) => ({
    attendees: [],
    availability: "free",
    calendar_id: `${SUBSCRIPTION_CALENDAR_PREFIX}${subscription.id}__`,
    color: SUBSCRIPTION_COLOR_PATTERN.test(subscription.color)
      ? subscription.color
      : SUBSCRIPTION_FALLBACK_COLOR,
    conference_url: "",
    created_at: entry.starts_at,
    description: entry.description,
    ends_at: entry.ends_at,
    event_kind: "default",
    guests_can_invite: false,
    guests_can_modify: false,
    guests_can_see_guests: false,
    id: unique_event_id(
      `${SUBSCRIPTION_EVENT_PREFIX}${subscription.id}-${feed_entry_key(entry, index)}`,
      used_ids,
    ),
    is_all_day: entry.is_all_day,
    is_completed: false,
    location: entry.location,
    occurrence_start: null,
    recurrence: entry.recurrence,
    recurrence_exceptions: entry.recurrence_exceptions,
    recurrence_master_id: null,
    reminder_minutes: null,
    starts_at: entry.starts_at,
    status: entry.status,
    tags: [],
    title: entry.title,
    updated_at: entry.starts_at,
    visibility: "default",
    working_location: null,
  }));
}

export async function check_subscription(url: string): Promise<number | null> {
  try {
    const response = await api_client.post<{ ics: string }>(
      "/calendar/v1/subscriptions/fetch",
      { url },
    );

    if (!response.data) {
      return null;
    }

    return parse_ics_events(response.data.ics).length;
  } catch {
    return null;
  }
}
