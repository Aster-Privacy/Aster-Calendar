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
export const SCHEDULE_RANGES = [
  "upcoming",
  "next_7_days",
  "next_30_days",
  "next_3_months",
  "next_6_months",
  "this_year",
  "next_year",
  "custom",
] as const;

export type ScheduleRange = (typeof SCHEDULE_RANGES)[number];

export type ScheduleCustomError = "invalid" | "end_before_start" | "too_long";

export const DEFAULT_SCHEDULE_RANGE: ScheduleRange = "upcoming";
export const SCHEDULE_UPCOMING_DAYS = 30;
export const SCHEDULE_CUSTOM_MAX_DAYS = 731;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function day_start(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function day_end(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
}

function plus_days(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function plus_months(date: Date, months: number): Date {
  const total = date.getFullYear() * 12 + date.getMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const last_day = new Date(year, month + 1, 0).getDate();

  return new Date(year, month, Math.min(date.getDate(), last_day));
}

export function is_schedule_range(value: unknown): value is ScheduleRange {
  return (
    typeof value === "string" &&
    (SCHEDULE_RANGES as readonly string[]).includes(value)
  );
}

export function parse_schedule_date(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = DATE_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function format_schedule_date(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function schedule_day_count(start: Date, end: Date): number {
  const first = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const last = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());

  return Math.round((last - first) / DAY_MS) + 1;
}

export function validate_schedule_custom(
  start: unknown,
  end: unknown,
): ScheduleCustomError | null {
  const start_date = parse_schedule_date(start);
  const end_date = parse_schedule_date(end);

  if (!start_date || !end_date) {
    return "invalid";
  }

  const days = schedule_day_count(start_date, end_date);

  if (days < 1) {
    return "end_before_start";
  }

  if (days > SCHEDULE_CUSTOM_MAX_DAYS) {
    return "too_long";
  }

  return null;
}

export function resolve_schedule_range(
  range: unknown,
  custom_start: unknown,
  custom_end: unknown,
): ScheduleRange {
  if (!is_schedule_range(range)) {
    return DEFAULT_SCHEDULE_RANGE;
  }

  if (
    range === "custom" &&
    validate_schedule_custom(custom_start, custom_end) !== null
  ) {
    return DEFAULT_SCHEDULE_RANGE;
  }

  return range;
}

export function get_schedule_range(
  range: ScheduleRange,
  anchor: Date,
  custom_start = "",
  custom_end = "",
): { range_start: Date; range_end: Date } {
  const first = day_start(anchor);
  const last = (() => {
    switch (range) {
      case "next_7_days":
        return plus_days(first, 6);
      case "next_30_days":
        return plus_days(first, 29);
      case "next_3_months":
        return plus_days(plus_months(first, 3), -1);
      case "next_6_months":
        return plus_days(plus_months(first, 6), -1);
      default:
        return plus_days(first, SCHEDULE_UPCOMING_DAYS);
    }
  })();

  if (range === "this_year" || range === "next_year") {
    const year = first.getFullYear() + (range === "next_year" ? 1 : 0);

    return {
      range_start: new Date(year, 0, 1),
      range_end: day_end(new Date(year, 11, 31)),
    };
  }

  if (range === "custom") {
    const start_date = parse_schedule_date(custom_start);
    const end_date = parse_schedule_date(custom_end);

    if (start_date && end_date && !validate_schedule_custom(custom_start, custom_end)) {
      return { range_start: start_date, range_end: day_end(end_date) };
    }
  }

  return { range_start: first, range_end: day_end(last) };
}

export function shift_schedule_anchor(
  range: ScheduleRange,
  anchor: Date,
  direction: number,
): Date {
  switch (range) {
    case "next_7_days":
      return plus_days(anchor, direction * 7);
    case "next_30_days":
      return plus_days(anchor, direction * 30);
    case "next_3_months":
      return plus_months(anchor, direction * 3);
    case "next_6_months":
      return plus_months(anchor, direction * 6);
    case "this_year":
    case "next_year":
      return plus_months(anchor, direction * 12);
    case "custom":
      return anchor;
    default:
      return plus_days(anchor, direction * SCHEDULE_UPCOMING_DAYS);
  }
}

export function is_schedule_range_pageable(range: ScheduleRange): boolean {
  return range !== "custom";
}
