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
import type { RecurrenceFrequency, RecurrenceRule } from "@/types/calendar";

import { useState } from "react";
import { SegmentedToggle } from "@aster/ui";

import { DateField } from "@/components/calendar/date_field";
import { CalendarSelect } from "@/components/calendar/calendar_select";
import { Input } from "@/components/ui/input";

const WEEKDAY_PRESET = [1, 2, 3, 4, 5];
const WEEKDAY_SHORT_KEYS: TranslationKey[] = [
  "calendar.weekday_sun",
  "calendar.weekday_mon",
  "calendar.weekday_tue",
  "calendar.weekday_wed",
  "calendar.weekday_thu",
  "calendar.weekday_fri",
  "calendar.weekday_sat",
];
const UNIT_KEYS: Record<RecurrenceFrequency, TranslationKey> = {
  daily: "calendar.repeat_unit_day",
  weekly: "calendar.repeat_unit_week",
  monthly: "calendar.repeat_unit_month",
  yearly: "calendar.repeat_unit_year",
};

export type RecurrencePreset =
  | "none"
  | "daily"
  | "weekly"
  | "weekdays"
  | "monthly"
  | "yearly"
  | "custom";

function to_local_date(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function is_weekday_preset(rule: RecurrenceRule): boolean {
  return (
    rule.frequency === "weekly" &&
    rule.interval === 1 &&
    rule.by_weekday.length === WEEKDAY_PRESET.length &&
    WEEKDAY_PRESET.every((day) => rule.by_weekday.includes(day))
  );
}

export function has_advanced_rules(rule: RecurrenceRule): boolean {
  return (
    (rule.by_month_day?.length ?? 0) > 0 ||
    (rule.by_set_pos?.length ?? 0) > 0 ||
    (rule.by_month?.length ?? 0) > 0 ||
    (rule.extra_dates?.length ?? 0) > 0 ||
    (typeof rule.time_zone === "string" && rule.time_zone.length > 0)
  );
}

function carried_fields(
  previous: RecurrenceRule | null,
): Pick<RecurrenceRule, "week_start" | "time_zone"> {
  const carried: Pick<RecurrenceRule, "week_start" | "time_zone"> = {};

  if (previous?.week_start !== undefined) {
    carried.week_start = previous.week_start;
  }

  if (previous?.time_zone) {
    carried.time_zone = previous.time_zone;
  }

  return carried;
}

export function recurrence_preset(
  rule: RecurrenceRule | null,
  start: Date,
): RecurrencePreset {
  if (!rule) {
    return "none";
  }

  if (
    rule.count !== null ||
    rule.until !== null ||
    rule.interval !== 1 ||
    has_advanced_rules(rule)
  ) {
    return "custom";
  }

  if (is_weekday_preset(rule)) {
    return "weekdays";
  }

  if (rule.frequency === "weekly") {
    const days = rule.by_weekday;

    return days.length === 0 ||
      (days.length === 1 && days[0] === start.getDay())
      ? "weekly"
      : "custom";
  }

  return rule.frequency;
}

export function preset_to_rule(
  preset: RecurrencePreset,
  start: Date,
  previous: RecurrenceRule | null,
): RecurrenceRule | null {
  if (preset === "none") {
    return null;
  }

  if (preset === "weekdays") {
    return {
      ...carried_fields(previous),
      frequency: "weekly",
      interval: 1,
      by_weekday: [...WEEKDAY_PRESET],
      count: null,
      until: null,
    };
  }

  if (preset === "custom") {
    return (
      previous ?? {
        frequency: "weekly",
        interval: 1,
        by_weekday: [start.getDay()],
        count: null,
        until: null,
      }
    );
  }

  return {
    ...carried_fields(previous),
    frequency: preset,
    interval: 1,
    by_weekday: preset === "weekly" ? [start.getDay()] : [],
    count: null,
    until: null,
  };
}

const POSITION_KEYS: Record<number, TranslationKey> = {
  1: "calendar.recurrence_position_first",
  2: "calendar.recurrence_position_second",
  3: "calendar.recurrence_position_third",
  4: "calendar.recurrence_position_fourth",
  [-1]: "calendar.recurrence_position_last",
};

function describe_advanced(
  rule: RecurrenceRule,
  base: string,
  days: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  const positions = rule.by_set_pos ?? [];
  const position_key = positions.length === 1 ? POSITION_KEYS[positions[0]] : undefined;
  const uses_only_position =
    rule.frequency === "monthly" &&
    position_key !== undefined &&
    rule.by_weekday.length > 0 &&
    (rule.by_month_day?.length ?? 0) === 0 &&
    (rule.by_month?.length ?? 0) === 0 &&
    (rule.extra_dates?.length ?? 0) === 0;

  if (uses_only_position) {
    return t("calendar.recurrence_monthly_by_position", {
      position: t(position_key),
      rule: base,
      weekday: days,
    });
  }

  return t("calendar.recurrence_has_advanced_rules", { rule: base });
}

export function describe_recurrence(
  rule: RecurrenceRule,
  start: Date,
  language: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  const weekday_formatter = new Intl.DateTimeFormat(language, {
    weekday: "long",
  });
  const days = (
    rule.by_weekday.length > 0 ? rule.by_weekday : [start.getDay()]
  )
    .slice()
    .sort((left, right) => left - right)
    .map((day) => {
      const sample = new Date(2024, 0, 7 + day);

      return weekday_formatter.format(sample);
    })
    .join(", ");

  let base = "";

  if (rule.frequency === "daily") {
    base =
      rule.interval === 1
        ? t("calendar.repeat_summary_daily")
        : t("calendar.repeat_summary_every_days", { count: rule.interval });
  } else if (rule.frequency === "weekly") {
    base =
      rule.interval === 1
        ? t("calendar.repeat_summary_weekly", { days })
        : t("calendar.repeat_summary_every_weeks", {
            count: rule.interval,
            days,
          });
  } else if (rule.frequency === "monthly") {
    base =
      rule.interval === 1
        ? t("calendar.repeat_summary_monthly")
        : t("calendar.repeat_summary_every_months", { count: rule.interval });
  } else {
    base =
      rule.interval === 1
        ? t("calendar.repeat_summary_yearly")
        : t("calendar.repeat_summary_every_years", { count: rule.interval });
  }

  if (has_advanced_rules(rule)) {
    base = describe_advanced(rule, base, days, t);
  }

  if (rule.until) {
    return t("calendar.repeat_summary_until", {
      date: new Intl.DateTimeFormat(language, {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(rule.until)),
      rule: base,
    });
  }

  if (rule.count !== null) {
    return t("calendar.repeat_summary_count", { count: rule.count, rule: base });
  }

  return base;
}

interface RecurrenceFieldProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  language: string;
  start: Date;
  value: RecurrenceRule | null;
  week_start_day: number;
  on_change: (value: RecurrenceRule | null) => void;
}

export function RecurrenceField({
  t,
  language,
  start,
  value,
  week_start_day,
  on_change,
}: RecurrenceFieldProps) {
  const [custom_rule, set_custom_rule] = useState<RecurrenceRule | null>(
    null,
  );
  const derived_preset = recurrence_preset(value, start);
  const preset: RecurrencePreset =
    value !== null && value === custom_rule ? "custom" : derived_preset;
  const weekday_name = new Intl.DateTimeFormat(language, {
    weekday: "long",
  }).format(start);
  const month_day = new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "long",
  }).format(start);

  const preset_label = (option: RecurrencePreset) => {
    if (option === "none") {
      return t("calendar.repeat_none");
    }

    if (option === "daily") {
      return t("calendar.repeat_daily");
    }

    if (option === "weekly") {
      return t("calendar.repeat_weekly", { weekday: weekday_name });
    }

    if (option === "weekdays") {
      return t("calendar.repeat_weekdays");
    }

    if (option === "monthly") {
      return t("calendar.repeat_monthly", { day: start.getDate() });
    }

    if (option === "yearly") {
      return t("calendar.repeat_yearly", { date: month_day });
    }

    return t("calendar.repeat_custom");
  };

  const emit = (next: RecurrenceRule | null, stay_custom: boolean) => {
    set_custom_rule(stay_custom ? next : null);
    on_change(next);
  };

  const select_preset = (next: RecurrencePreset) => {
    if (next === "custom") {
      const base = preset_to_rule("custom", start, value);

      emit(base ? { ...base, by_weekday: [...base.by_weekday] } : null, true);

      return;
    }

    emit(preset_to_rule(next, start, value), false);
  };

  const update = (patch: Partial<RecurrenceRule>) => {
    if (!value) {
      return;
    }

    emit({ ...value, ...patch }, preset === "custom");
  };

  const end_mode = !value
    ? "never"
    : value.until !== null
      ? "on"
      : value.count !== null
        ? "after"
        : "never";

  const selected_weekdays =
    value && value.by_weekday.length > 0 ? value.by_weekday : [start.getDay()];

  const toggle_weekday = (day: number) => {
    if (!value) {
      return;
    }

    const next = selected_weekdays.includes(day)
      ? selected_weekdays.filter((entry) => entry !== day)
      : [...selected_weekdays, day].sort((left, right) => left - right);

    if (next.length === 0) {
      return;
    }

    update({ by_weekday: next });
  };

  const end_options = [
    { value: "never", label: t("calendar.repeat_ends_never") },
    { value: "on", label: t("calendar.repeat_ends_on") },
    { value: "after", label: t("calendar.repeat_ends_after") },
  ];

  const set_end_mode = (next: string) => {
    if (next === "never") {
      update({ count: null, until: null });

      return;
    }

    if (next === "after") {
      update({ count: 10, until: null });

      return;
    }

    const until = new Date(start);

    until.setMonth(until.getMonth() + 3);

    update({ count: null, until: until.toISOString() });
  };

  const label_class = "w-[88px] shrink-0 text-[13px] text-txt-secondary";
  const count_input_class = "aster_input_tonal w-16";
  const start_day = to_local_date(start);
  const until_before_start =
    value?.until !== null &&
    value?.until !== undefined &&
    to_local_date(new Date(value.until)) < start_day;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <CalendarSelect
        aria_label={t("calendar.repeat")}
        class_name="min-w-[14rem]"
        options={(
          [
            "none",
            "daily",
            "weekly",
            "weekdays",
            "monthly",
            "yearly",
            "custom",
          ] as RecurrencePreset[]
        ).map((option) => ({ value: option, label: preset_label(option) }))}
        value={preset}
        on_change={(next) => select_preset(next as RecurrencePreset)}
      />

      {preset === "custom" && value && (
        <div className="flex flex-col gap-3 rounded-[var(--aster-radius-panel,12px)] border border-[var(--border-secondary)] p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={label_class}>
              {t("calendar.repeat_every")}
            </span>
            <Input
              aria-label={t("calendar.repeat_every")}
              className={count_input_class}
              max={365}
              min={1}
              size="md"
              type="number"
              value={String(value.interval)}
              onChange={(input_event) =>
                update({
                  interval: Math.min(
                    365,
                    Math.max(1, Number(input_event.target.value) || 1),
                  ),
                })
              }
            />
            <CalendarSelect
              aria_label={t("calendar.repeat")}
              class_name="min-w-[7rem]"
              options={(
                [
                  "daily",
                  "weekly",
                  "monthly",
                  "yearly",
                ] as RecurrenceFrequency[]
              ).map((option) => ({
                value: option,
                label: t(UNIT_KEYS[option]),
              }))}
              value={value.frequency}
              on_change={(next) =>
                update({
                  frequency: next as RecurrenceFrequency,
                  by_weekday: next === "weekly" ? [start.getDay()] : [],
                })
              }
            />
          </div>

          {value.frequency === "weekly" && (
            <div
              aria-label={t("calendar.repeat")}
              className="grid grid-cols-7 gap-1"
              role="group"
            >
              {WEEKDAY_SHORT_KEYS.map((_key, offset) => {
                const day = (offset + week_start_day) % 7;
                const is_selected = selected_weekdays.includes(day);

                return (
                  <button
                    key={day}
                    aria-pressed={is_selected}
                    className={`flex h-8 min-w-0 items-center justify-center truncate rounded-[var(--aster-radius-item,8px)] border text-[12px] font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] ${
                      is_selected
                        ? "border-[var(--text-primary)] bg-[var(--aster-selected)] text-txt-primary"
                        : "border-[var(--border-secondary)] text-txt-secondary hover:bg-[var(--aster-hover)] hover:text-txt-primary"
                    }`}
                    type="button"
                    onClick={() => toggle_weekday(day)}
                  >
                    {t(WEEKDAY_SHORT_KEYS[day])}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={label_class}>
              {t("calendar.repeat_ends")}
            </span>
            <SegmentedToggle
              aria-label={t("calendar.repeat_ends")}
              name="calendar_recurrence_end"
              options={end_options}
              value={end_mode}
              on_change={set_end_mode}
            />

            {end_mode === "after" && (
              <>
                <Input
                  aria-label={t("calendar.repeat_occurrences")}
                  className={count_input_class}
                  max={730}
                  min={1}
                  size="md"
                  type="number"
                  value={String(value.count ?? 1)}
                  onChange={(input_event) =>
                    update({
                      count: Math.min(
                        730,
                        Math.max(1, Number(input_event.target.value) || 1),
                      ),
                    })
                  }
                />
                <span className="text-sm text-txt-muted">
                  {t("calendar.repeat_occurrences")}
                </span>
              </>
            )}

            {end_mode === "on" && (
              <DateField
                aria_label={t("calendar.repeat_ends_on")}
                value={to_local_date(value.until ? new Date(value.until) : start)}
                week_start_day={week_start_day}
                on_change={(next) => {
                  const clamped = next < start_day ? start_day : next;
                  const parsed = new Date(`${clamped}T23:59:00`);

                  if (!Number.isNaN(parsed.getTime())) {
                    update({ count: null, until: parsed.toISOString() });
                  }
                }}
              />
            )}
          </div>

          {end_mode === "on" && until_before_start && (
            <p
              className="text-[12px] text-[var(--color-danger)] sm:ps-[96px]"
              role="alert"
            >
              {t("calendar.recurrence_ends_before_start")}
            </p>
          )}

          <p
            aria-live="polite"
            className="border-t border-[var(--border-secondary)] pt-3 text-xs leading-snug text-txt-muted"
          >
            {describe_recurrence(value, start, language, t)}
          </p>
        </div>
      )}
    </div>
  );
}
