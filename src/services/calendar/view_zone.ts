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
  CalendarEventDraft,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { get_device_time_zone } from "@/lib/time_zones";
import {
  is_valid_time_zone,
  wall_clock_of,
  zone_offset_ms,
  zoned_wall_to_utc,
} from "@/services/calendar/recurrence";

let active_view_zone: string | null = null;

export function resolve_view_zone(
  preference: string | null | undefined,
): string | null {
  const trimmed = (preference ?? "").trim();

  if (trimmed.length === 0 || !is_valid_time_zone(trimmed)) {
    return null;
  }

  return trimmed === get_device_time_zone() ? null : trimmed;
}

export function set_active_view_zone(zone: string | null): void {
  active_view_zone = zone;
}

export function get_active_view_zone(): string | null {
  return active_view_zone;
}

export function to_view_date(
  instant: Date | string | number,
  zone: string | null = active_view_zone,
): Date {
  const source = instant instanceof Date ? instant : new Date(instant);

  if (!zone || Number.isNaN(source.getTime())) {
    return new Date(source.getTime());
  }

  const wall = wall_clock_of(source.getTime(), zone);

  return new Date(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.millisecond,
  );
}

export function from_view_date(
  date: Date,
  zone: string | null = active_view_zone,
): Date {
  if (!zone || Number.isNaN(date.getTime())) {
    return new Date(date.getTime());
  }

  return (
    zoned_wall_to_utc(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      zone,
      date.getMilliseconds(),
    ) ?? new Date(date.getTime())
  );
}

export function calendar_now(zone: string | null = active_view_zone): Date {
  return to_view_date(Date.now(), zone);
}

export function view_zone_offset_minutes(
  at: Date,
  zone: string | null = active_view_zone,
): number {
  if (!zone) {
    return -at.getTimezoneOffset();
  }

  const offset = zone_offset_ms(zone, from_view_date(at, zone).getTime());

  return offset === null ? -at.getTimezoneOffset() : offset / 60_000;
}

function shift_iso(value: string, zone: string, to_view: boolean): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return (
    to_view ? to_view_date(parsed, zone) : from_view_date(parsed, zone)
  ).toISOString();
}

export function shift_event_to_view<T extends DecryptedCalendarEvent>(
  event: T,
  zone: string | null = active_view_zone,
): T {
  if (!zone || event.is_all_day) {
    return event;
  }

  return {
    ...event,
    ends_at: shift_iso(event.ends_at, zone, true),
    starts_at: shift_iso(event.starts_at, zone, true),
  };
}

export function unshift_event_from_view<T extends DecryptedCalendarEvent>(
  event: T,
  zone: string | null = active_view_zone,
): T {
  if (!zone || event.is_all_day) {
    return event;
  }

  return {
    ...event,
    ends_at: shift_iso(event.ends_at, zone, false),
    starts_at: shift_iso(event.starts_at, zone, false),
  };
}

export function shift_events_to_view<T extends DecryptedCalendarEvent>(
  events: T[],
  zone: string | null = active_view_zone,
): T[] {
  return zone ? events.map((event) => shift_event_to_view(event, zone)) : events;
}

export function unshift_draft_from_view(
  draft: CalendarEventDraft,
  zone: string | null = active_view_zone,
): CalendarEventDraft {
  if (!zone || draft.is_all_day) {
    return draft;
  }

  return {
    ...draft,
    ends_at: shift_iso(draft.ends_at, zone, false),
    starts_at: shift_iso(draft.starts_at, zone, false),
  };
}

export function stamp_draft_zone(
  draft: CalendarEventDraft,
  zone: string | null = active_view_zone,
): CalendarEventDraft {
  if (!draft.recurrence || draft.recurrence.time_zone) {
    return draft;
  }

  return {
    ...draft,
    recurrence: {
      ...draft.recurrence,
      time_zone: zone ?? get_device_time_zone(),
    },
  };
}
