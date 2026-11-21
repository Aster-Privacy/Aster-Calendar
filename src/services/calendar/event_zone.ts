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

import {
  is_valid_time_zone,
  wall_clock_of,
  zone_offset_ms,
  zoned_wall_to_utc,
} from "@/services/calendar/recurrence";
import {
  from_view_date,
  get_active_view_zone,
  to_view_date,
} from "@/services/calendar/view_zone";

const MAX_TIME_ZONE_LENGTH = 64;
const DATE_VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_VALUE_PATTERN = /^(\d{2}):(\d{2})$/;

export interface ZonedFields {
  date_value: string;
  time_value: string;
}

export function normalize_event_time_zone(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_TIME_ZONE_LENGTH ||
    !is_valid_time_zone(trimmed)
  ) {
    return null;
  }

  return trimmed;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function local_fields(date: Date): ZonedFields {
  return {
    date_value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time_value: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

export function zoned_fields_to_view_date(
  date_value: string,
  time_value: string,
  zone: string | null,
  view_zone: string | null = get_active_view_zone(),
): Date {
  if (!zone) {
    return new Date(`${date_value}T${time_value}:00`);
  }

  const date_match = DATE_VALUE_PATTERN.exec(date_value);
  const time_match = TIME_VALUE_PATTERN.exec(time_value);

  if (!date_match || !time_match) {
    return new Date(Number.NaN);
  }

  const year = Number(date_match[1]);
  const month = Number(date_match[2]);
  const day = Number(date_match[3]);
  const hour = Number(time_match[1]);
  const minute = Number(time_match[2]);

  const days_in_month = new Date(Date.UTC(year, month, 0)).getUTCDate();

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days_in_month ||
    hour > 23 ||
    minute > 59
  ) {
    return new Date(Number.NaN);
  }

  const instant = zoned_wall_to_utc(year, month, day, hour, minute, 0, zone);

  if (!instant || Number.isNaN(instant.getTime())) {
    return new Date(Number.NaN);
  }

  return to_view_date(instant, view_zone);
}

export function view_date_to_zoned_fields(
  view_date: Date,
  zone: string | null,
  view_zone: string | null = get_active_view_zone(),
): ZonedFields {
  if (!zone || Number.isNaN(view_date.getTime())) {
    return local_fields(view_date);
  }

  const instant = from_view_date(view_date, view_zone);

  if (zone_offset_ms(zone, instant.getTime()) === null) {
    return local_fields(view_date);
  }

  const wall = wall_clock_of(instant.getTime(), zone);

  return {
    date_value: `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`,
    time_value: `${pad(wall.hour)}:${pad(wall.minute)}`,
  };
}

export function format_time_with_zone(
  view_date: Date,
  zone: string,
  language: string,
  hour12: boolean,
  view_zone: string | null = get_active_view_zone(),
): string {
  const instant = from_view_date(view_date, view_zone);

  try {
    return new Intl.DateTimeFormat(language, {
      hour: "numeric",
      minute: "2-digit",
      hour12,
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).format(instant);
  } catch {
    return "";
  }
}
