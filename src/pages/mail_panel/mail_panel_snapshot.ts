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
import type {
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";

export type RowStamp = (event: DecryptedCalendarEvent) => string;

export function events_in_window(
  events: DecryptedCalendarEvent[],
  start_ms: number,
  end_ms: number,
): DecryptedCalendarEvent[] {
  return events.filter((event) => {
    const event_start = new Date(event.starts_at).getTime();
    const event_end = new Date(event.ends_at).getTime();

    return event_end >= start_ms && event_start <= end_ms;
  });
}

function event_key(event: DecryptedCalendarEvent, row_stamp: RowStamp): string {
  return `${event.id}:${event.updated_at}:${row_stamp(event)}`;
}

function calendar_key(calendar: DecryptedCalendar): string {
  return [
    calendar.id,
    calendar.name,
    calendar.color,
    calendar.icon,
    calendar.is_visible ? 1 : 0,
    calendar.is_default ? 1 : 0,
  ].join(":");
}

export function build_snapshot_key(
  range_start_ms: number,
  range_end_ms: number,
  events: DecryptedCalendarEvent[],
  up_next: DecryptedCalendarEvent[],
  calendars: DecryptedCalendar[],
  row_stamp: RowStamp,
): string {
  return JSON.stringify([
    range_start_ms,
    range_end_ms,
    events.map((event) => event_key(event, row_stamp)),
    up_next.map((event) => event_key(event, row_stamp)),
    calendars.map(calendar_key),
  ]);
}
