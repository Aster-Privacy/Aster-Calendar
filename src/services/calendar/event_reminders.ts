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
import type { TranslationKey } from "@/lib/i18n";

export const MAX_EVENT_REMINDERS = 5;
export const MAX_REMINDER_MINUTES = 40320;

export const EVENT_REMINDER_CHOICES = [
  0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080, 20160,
];
export const ALL_DAY_EVENT_REMINDER_CHOICES = [
  0, 420, 540, 1440, 2880, 10080, 20160,
];
export const DEFAULT_REMINDER_OPTIONS = [-1, ...EVENT_REMINDER_CHOICES];
export const DEFAULT_ALL_DAY_REMINDER_OPTIONS = [
  -1, 0, 420, 1440, 2880, 10080, 20160,
];
export const PREFERRED_TIMED_REMINDER = 10;
export const PREFERRED_ALL_DAY_REMINDER = 540;

export type ReminderUnit = "minutes" | "hours" | "days" | "weeks";

export const REMINDER_UNITS: ReminderUnit[] = [
  "minutes",
  "hours",
  "days",
  "weeks",
];

export const REMINDER_UNIT_FACTORS: Record<ReminderUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
  weeks: 10080,
};

export interface ReminderFields {
  reminder_minutes: number | null;
  reminders?: number[] | null;
}

function is_valid_minutes(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_REMINDER_MINUTES
  );
}

export function normalize_reminder_list(
  values: readonly unknown[] | null | undefined,
): number[] | null {
  if (!Array.isArray(values)) {
    return null;
  }

  const unique = Array.from(new Set(values.filter(is_valid_minutes)));

  return unique.sort((a, b) => a - b).slice(0, MAX_EVENT_REMINDERS);
}

export function normalize_reminder_minutes(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function resolve_reminders(
  reminder_minutes: number | null | undefined,
  reminders: readonly unknown[] | null | undefined,
): number[] | null {
  const legacy = reminder_minutes ?? null;
  const list = normalize_reminder_list(reminders);

  if (list === null || (list[0] ?? null) !== legacy) {
    return legacy === null ? null : [legacy];
  }

  return list;
}

export function effective_reminders(source: ReminderFields): number[] | null {
  return resolve_reminders(source.reminder_minutes, source.reminders);
}

export function scheduled_reminder_minutes(
  explicit: readonly number[] | null,
  fallback: number,
): number[] {
  const list = explicit ?? (fallback >= 0 ? [fallback] : []);

  return list.filter(is_valid_minutes);
}

export function reminder_fields(list: readonly number[]): {
  reminder_minutes: number | null;
  reminders: number[];
} {
  const normalized = normalize_reminder_list(list) ?? [];

  return { reminder_minutes: normalized[0] ?? null, reminders: normalized };
}

export function default_reminder_list(minutes: number): number[] {
  return is_valid_minutes(minutes) ? [minutes] : [];
}

export function add_reminder(current: readonly number[], minutes: number) {
  return normalize_reminder_list([...current, minutes]) ?? [];
}

export function replace_reminder(
  current: readonly number[],
  old: number,
  minutes: number,
): number[] {
  return (
    normalize_reminder_list([
      ...current.filter((value) => value !== old),
      minutes,
    ]) ?? []
  );
}

export function remove_reminder(current: readonly number[], minutes: number) {
  return current.filter((value) => value !== minutes);
}

export function custom_reminder_minutes(
  amount: number | null,
  unit: ReminderUnit,
): number | null {
  if (amount === null || !Number.isInteger(amount) || amount < 0) {
    return null;
  }

  const total = amount * REMINDER_UNIT_FACTORS[unit];

  return total > MAX_REMINDER_MINUTES ? null : total;
}

export function split_reminder(minutes: number): {
  amount: number;
  unit: ReminderUnit;
} {
  for (const unit of ["weeks", "days", "hours"] as const) {
    const factor = REMINDER_UNIT_FACTORS[unit];

    if (minutes > 0 && minutes % factor === 0) {
      return { amount: minutes / factor, unit };
    }
  }

  return { amount: minutes, unit: "minutes" };
}

export function next_reminder_choice(
  current: readonly number[],
  choices: readonly number[],
  preferred: number,
): number | null {
  if (current.length === 0 && choices.includes(preferred)) {
    return preferred;
  }

  const highest = current.length > 0 ? Math.max(...current) : -1;

  return (
    choices.find((value) => !current.includes(value) && value > highest) ??
    choices.find((value) => !current.includes(value)) ??
    null
  );
}

export function remap_reminder(
  value: number,
  from: readonly number[],
  to: readonly number[],
): number {
  if (to.includes(value)) {
    return value;
  }

  const index = from.indexOf(value);

  if (index >= 0 && index < to.length) {
    return to[index];
  }

  let nearest = value;
  let distance = Number.POSITIVE_INFINITY;

  for (const option of to) {
    const next = Math.abs(option - value);

    if (next < distance) {
      distance = next;
      nearest = option;
    }
  }

  return nearest;
}

export function remap_reminders(
  values: readonly number[],
  from: readonly number[],
  to: readonly number[],
): number[] {
  return (
    normalize_reminder_list(
      values.map((value) => remap_reminder(value, from, to)),
    ) ?? []
  );
}

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export function format_reminder(minutes: number | null, t: Translate): string {
  if (minutes === null || minutes < 0) {
    return t("calendar.reminder_none");
  }

  if (minutes === 0) {
    return t("calendar.reminder_at_start");
  }

  if (minutes % 10080 === 0) {
    return t("calendar.reminder_weeks_before", { count: minutes / 10080 });
  }

  if (minutes % 1440 === 0) {
    return t("calendar.reminder_days_before", { count: minutes / 1440 });
  }

  if (minutes % 60 === 0) {
    return t("calendar.reminder_hours_before", { count: minutes / 60 });
  }

  return t("calendar.reminder_minutes_before", { count: minutes });
}

export function format_default_reminder(minutes: number, t: Translate): string {
  if (minutes < 0) {
    return t("calendar.reminder_none");
  }

  if (minutes === 420) {
    return t("calendar.reminder_day_before_evening");
  }

  if (minutes === 60) {
    return t("calendar.reminder_hour_before");
  }

  if (minutes === 1440) {
    return t("calendar.reminder_day_before");
  }

  if (minutes === 10080) {
    return t("calendar.reminder_week_before");
  }

  return format_reminder(minutes, t);
}
