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

import {
  BIRTHDAY_CALENDAR_ID,
  BIRTHDAY_COLOR,
  BIRTHDAY_EVENT_PREFIX,
  is_birthday_kind,
} from "@/services/calendar/birthdays";
import {
  HOLIDAY_CALENDAR_ID,
  HOLIDAY_COLOR,
  HOLIDAY_EVENT_PREFIX,
} from "@/services/calendar/holidays";
import { BOOKING_EVENT_PREFIX } from "@/services/calendar/appointments";
import { SUBSCRIPTION_EVENT_PREFIX } from "@/services/calendar/subscriptions";
import { parse_occurrence_id } from "@/services/calendar/recurrence";

export type EventColorOverrides = Record<string, string>;

export interface DisplayColorPreferences {
  calendar_birthdays_color?: string;
  calendar_holidays_color?: string;
  calendar_event_color_overrides?: EventColorOverrides;
}

export const EVENT_COLOR_OVERRIDE_MAX_ENTRIES = 500;
export const SYNTHETIC_CALENDAR_NAME_MAX_LENGTH = 120;

const OVERRIDE_KEY_MAX_LENGTH = 512;
const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const DATED_SUFFIX = /-\d{4}-\d{2}-\d{2}$/;
const HOLIDAY_DATE = /^([^-]+)-\d{4}-\d{2}-\d{2}-(.*)$/;

export function normalize_hex(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!HEX_PATTERN.test(trimmed)) {
    return null;
  }

  const lower = trimmed.toLowerCase();

  if (lower.length === 4) {
    return `#${lower[1]}${lower[1]}${lower[2]}${lower[2]}${lower[3]}${lower[3]}`;
  }

  return lower;
}

export function resolve_birthdays_color(
  prefs: DisplayColorPreferences,
): string {
  return normalize_hex(prefs.calendar_birthdays_color) ?? BIRTHDAY_COLOR;
}

export function resolve_holidays_color(prefs: DisplayColorPreferences): string {
  return normalize_hex(prefs.calendar_holidays_color) ?? HOLIDAY_COLOR;
}

export function resolve_birthdays_name(
  custom_name: string | undefined,
  default_name: string,
): string {
  const trimmed = (custom_name ?? "")
    .trim()
    .slice(0, SYNTHETIC_CALENDAR_NAME_MAX_LENGTH);

  return trimmed.length > 0 ? trimmed : default_name;
}

export function is_read_only_event(event: { id: string }): boolean {
  return (
    event.id.startsWith(HOLIDAY_EVENT_PREFIX) ||
    event.id.startsWith(BIRTHDAY_EVENT_PREFIX) ||
    event.id.startsWith(SUBSCRIPTION_EVENT_PREFIX) ||
    event.id.startsWith(BOOKING_EVENT_PREFIX)
  );
}

export function event_color_override_key(event: { id: string }): string {
  const master = parse_occurrence_id(event.id).master_id;

  if (master.startsWith(BIRTHDAY_EVENT_PREFIX)) {
    return master.replace(DATED_SUFFIX, "");
  }

  if (master.startsWith(HOLIDAY_EVENT_PREFIX)) {
    const match = HOLIDAY_DATE.exec(master.slice(HOLIDAY_EVENT_PREFIX.length));

    if (match) {
      return `${HOLIDAY_EVENT_PREFIX}${match[1]}-${match[2]}`;
    }
  }

  return master;
}

export function sanitize_event_color_overrides(
  raw: unknown,
): EventColorOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const entries: [string, string][] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (entries.length >= EVENT_COLOR_OVERRIDE_MAX_ENTRIES) {
      break;
    }

    const color = normalize_hex(value);

    if (
      !color ||
      key.length === 0 ||
      key.length > OVERRIDE_KEY_MAX_LENGTH ||
      !is_read_only_event({ id: key })
    ) {
      continue;
    }

    entries.push([key, color]);
  }

  return Object.fromEntries(entries);
}

export function with_event_color_override(
  overrides: EventColorOverrides | null | undefined,
  event: { id: string },
  color: string | null,
): EventColorOverrides {
  const key = event_color_override_key(event);
  const entries = Object.entries(overrides ?? {}).filter(
    ([existing]) => existing !== key,
  );
  const normalized = color === null ? null : normalize_hex(color);

  if (normalized) {
    entries.push([key, normalized]);
  }

  return Object.fromEntries(entries.slice(-EVENT_COLOR_OVERRIDE_MAX_ENTRIES));
}

export function event_color_override(
  overrides: EventColorOverrides | null | undefined,
  event: { id: string },
): string | null {
  if (!overrides) {
    return null;
  }

  const key = event_color_override_key(event);

  return Object.prototype.hasOwnProperty.call(overrides, key)
    ? normalize_hex(overrides[key])
    : null;
}

export function apply_display_colors<T extends DecryptedCalendarEvent>(
  events: T[],
  prefs: DisplayColorPreferences,
): T[] {
  const birthdays_color = resolve_birthdays_color(prefs);
  const holidays_color = resolve_holidays_color(prefs);
  const overrides = prefs.calendar_event_color_overrides;

  return events.map((event) => {
    let color = event.color;

    if (event.calendar_id === BIRTHDAY_CALENDAR_ID) {
      color = birthdays_color;
    } else if (event.calendar_id === HOLIDAY_CALENDAR_ID) {
      color = holidays_color;
    } else if (color === null && is_birthday_kind(event)) {
      color = birthdays_color;
    }

    if (is_read_only_event(event)) {
      color = event_color_override(overrides, event) ?? color;
    }

    return color === event.color ? event : { ...event, color };
  });
}
