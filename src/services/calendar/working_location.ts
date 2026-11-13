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
  CalendarWorkingLocation,
  DecryptedCalendarEvent,
} from "@/types/calendar";

export type UsualLocation = "office" | "home" | null;

export const WEEKDAY_KEYS = ["0", "1", "2", "3", "4", "5", "6"] as const;

export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export type WorkingWeek = Record<WeekdayKey, UsualLocation>;

export const EMPTY_WORKING_WEEK: WorkingWeek = {
  "0": null,
  "1": null,
  "2": null,
  "3": null,
  "4": null,
  "5": null,
  "6": null,
};

export interface DayWorkingLocation {
  location: CalendarWorkingLocation;
  place: string;
  source: "event" | "usual";
  event: DecryptedCalendarEvent | null;
  is_single_day: boolean;
}

const DAY_MS = 86_400_000;

function is_usual_location(value: unknown): value is "office" | "home" {
  return value === "office" || value === "home";
}

export function normalize_working_week(value: unknown): WorkingWeek {
  const week: WorkingWeek = { ...EMPTY_WORKING_WEEK };

  if (!value || typeof value !== "object") {
    return week;
  }

  for (const key of WEEKDAY_KEYS) {
    const entry = (value as Record<string, unknown>)[key];

    week[key] = is_usual_location(entry) ? entry : null;
  }

  return week;
}

export function is_working_location_event(
  event: Pick<DecryptedCalendarEvent, "event_kind">,
): boolean {
  return event.event_kind === "working_location";
}

function day_bounds(day: Date): { start: number; end: number } {
  const start = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
  ).getTime();
  const end = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate() + 1,
  ).getTime();

  return { start, end };
}

function covers_day(event: DecryptedCalendarEvent, day: Date): boolean {
  const { start, end } = day_bounds(day);
  const event_start = new Date(event.starts_at).getTime();
  const event_end = new Date(event.ends_at).getTime();

  if (Number.isNaN(event_start) || Number.isNaN(event_end)) {
    return false;
  }

  if (event_end <= event_start) {
    return event_start >= start && event_start < end;
  }

  return event_start < end && event_end > start;
}

function spans_one_day(event: DecryptedCalendarEvent): boolean {
  const event_start = new Date(event.starts_at).getTime();
  const event_end = new Date(event.ends_at).getTime();

  return event_end - event_start <= DAY_MS + 3_600_000;
}

function is_day_change(event: DecryptedCalendarEvent): boolean {
  return (
    spans_one_day(event) && !event.recurrence && !event.recurrence_master_id
  );
}

function updated_ms(event: DecryptedCalendarEvent): number {
  const value = new Date(event.updated_at).getTime();

  return Number.isNaN(value) ? 0 : value;
}

export function resolve_day_working_location(
  day: Date,
  events: DecryptedCalendarEvent[],
  week: WorkingWeek,
): DayWorkingLocation | null {
  let latest: DecryptedCalendarEvent | null = null;

  for (const event of events) {
    if (
      !is_working_location_event(event) ||
      event.working_location === null ||
      !covers_day(event, day)
    ) {
      continue;
    }

    if (!latest) {
      latest = event;
      continue;
    }

    const rank = Number(is_day_change(event)) - Number(is_day_change(latest));

    if (rank > 0 || (rank === 0 && updated_ms(event) > updated_ms(latest))) {
      latest = event;
    }
  }

  if (latest && latest.working_location) {
    return {
      location: latest.working_location,
      place: latest.working_location === "other" ? latest.location.trim() : "",
      source: "event",
      event: latest,
      is_single_day: is_day_change(latest),
    };
  }

  const usual = week[String(day.getDay()) as WeekdayKey];

  if (!usual) {
    return null;
  }

  return {
    location: usual,
    place: "",
    source: "usual",
    event: null,
    is_single_day: false,
  };
}
