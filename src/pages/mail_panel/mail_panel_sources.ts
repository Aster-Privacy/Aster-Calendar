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
import type { BirthdaySource } from "@/services/calendar/birthdays";
import type { HolidayRegion } from "@/services/calendar/holidays";
import type { IcsSubscription } from "@/services/calendar/subscriptions";

import { end_of_day, start_of_day } from "@/components/calendar/calendar_utils";
import { normalize_hex } from "@/services/calendar/display_colors";
import {
  BIRTHDAY_CALENDAR_ID,
  BIRTHDAY_COLOR,
  BIRTHDAY_EVENT_PREFIX,
  birthdays_in_range,
} from "@/services/calendar/birthdays";
import {
  HOLIDAY_CALENDAR_ID,
  HOLIDAY_COLOR,
  HOLIDAY_EVENT_PREFIX,
  holidays_in_range,
} from "@/services/calendar/holidays";
import {
  fetch_subscription_events,
  SUBSCRIPTION_EXPANSION_BUDGET,
} from "@/services/calendar/subscriptions";
import { decrypt_contact, list_contacts } from "@/services/api/contacts";
import { expand_events } from "@/services/calendar/recurrence";
import { is_own_address } from "@/services/calendar/own_addresses";

const CONTACT_PAGE_LIMIT = 20;
const CONTACT_PAGE_SIZE = 200;

function all_day_event(
  id: string,
  calendar_id: string,
  color: string,
  title: string,
  date: Date,
): DecryptedCalendarEvent {
  const day_start = start_of_day(date);
  const day_end = end_of_day(date);

  return {
    attendees: [],
    availability: "free",
    calendar_id,
    color,
    conference_url: "",
    created_at: day_start.toISOString(),
    description: "",
    ends_at: day_end.toISOString(),
    event_kind: "default",
    guests_can_invite: false,
    guests_can_modify: false,
    guests_can_see_guests: false,
    id,
    is_all_day: true,
    is_completed: false,
    location: "",
    occurrence_start: null,
    recurrence: null,
    recurrence_exceptions: [],
    recurrence_master_id: null,
    reminder_minutes: null,
    starts_at: day_start.toISOString(),
    status: "confirmed",
    tags: [],
    title,
    updated_at: day_start.toISOString(),
    visibility: "default",
    working_location: null,
  } as DecryptedCalendarEvent;
}

export function is_declined_by(
  event: DecryptedCalendarEvent,
  self_email: string,
): boolean {
  if (self_email.length === 0) return false;

  return event.attendees.some(
    (attendee) =>
      is_own_address(attendee.email, self_email) &&
      attendee.response === "declined",
  );
}

export function build_holiday_events(
  region: HolidayRegion,
  view_start: Date,
  view_end: Date,
  color?: string,
): DecryptedCalendarEvent[] {
  if (region === "none") return [];

  return holidays_in_range(region, view_start, view_end).map((holiday) =>
    all_day_event(
      `${HOLIDAY_EVENT_PREFIX}${region}-${start_of_day(holiday.date).toISOString().slice(0, 10)}-${holiday.title}`,
      HOLIDAY_CALENDAR_ID,
      normalize_hex(color) ?? HOLIDAY_COLOR,
      holiday.title,
      holiday.date,
    ),
  );
}

export function build_birthday_events(
  sources: BirthdaySource[],
  view_start: Date,
  view_end: Date,
  title_for: (name: string) => string,
  color?: string,
): DecryptedCalendarEvent[] {
  if (sources.length === 0) return [];

  return birthdays_in_range(sources, view_start, view_end).map((occurrence) =>
    all_day_event(
      `${BIRTHDAY_EVENT_PREFIX}${occurrence.contact_id}-${start_of_day(occurrence.date).toISOString().slice(0, 10)}`,
      BIRTHDAY_CALENDAR_ID,
      normalize_hex(color) ?? BIRTHDAY_COLOR,
      title_for(occurrence.name),
      occurrence.date,
    ),
  );
}

export function expand_subscription_events(
  raw: DecryptedCalendarEvent[],
  real_start: Date,
  real_end: Date,
): DecryptedCalendarEvent[] {
  if (raw.length === 0) return [];

  const from = real_start.getTime();
  const to = real_end.getTime();

  return expand_events(raw, real_start, real_end, {
    candidate_budget: SUBSCRIPTION_EXPANSION_BUDGET,
  }).filter((event) => {
    const start = new Date(event.starts_at).getTime();
    const end = new Date(event.ends_at).getTime();

    return !Number.isNaN(start) && end >= from && start <= to;
  });
}

export async function load_subscription_events(
  subscriptions: IcsSubscription[],
): Promise<DecryptedCalendarEvent[]> {
  const collected: DecryptedCalendarEvent[] = [];

  for (const subscription of subscriptions) {
    try {
      collected.push(...(await fetch_subscription_events(subscription)));
    } catch {
      continue;
    }
  }

  return collected;
}

export async function load_birthday_sources(): Promise<BirthdaySource[]> {
  const sources: BirthdaySource[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < CONTACT_PAGE_LIMIT; page += 1) {
    const response = await list_contacts({
      cursor: cursor ?? undefined,
      limit: CONTACT_PAGE_SIZE,
    });

    if (!response.data) break;

    for (const contact of response.data.items) {
      try {
        const decrypted = await decrypt_contact(contact);
        const name = `${decrypted.first_name} ${decrypted.last_name}`.trim();

        if (decrypted.birthday && name.length > 0) {
          sources.push({
            birthday: decrypted.birthday,
            id: decrypted.id,
            name,
          });
        }
      } catch {
        continue;
      }
    }

    if (!response.data.has_more || !response.data.next_cursor) break;

    cursor = response.data.next_cursor;
  }

  return sources;
}
