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
import type { DecryptedCalendar } from "@/types/calendar";
import type { UserPreferences } from "@/services/api/preferences";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  IslandRow,
  IslandSection,
  IslandSections,
  SettingControlRow,
  SettingNote,
  SettingToggleRow,
  show_toast,
} from "@aster/ui";
import { Button } from "@/components/ui/button";
import {
  BellAlertIcon,
  CalendarDaysIcon,
  ClockIcon,
  CommandLineIcon,
  EllipsisHorizontalIcon,
  GlobeAltIcon,
  PlusIcon,
  Squares2X2Icon,
  ViewColumnsIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { SettingsSaveIndicatorInline } from "./settings_save_indicator";

import {} from "@/components/ui/modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import {
  CalendarClearDialog,
  CalendarDeleteDialog,
  CalendarEditDialog,
} from "@/components/calendar/calendar_edit_dialog";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InfoPopover } from "@/components/ui/info_popover";
import { TimeZonePicker } from "@/components/settings/appearance/time_zone_picker";
import { InviteSenderSettingRow } from "@/components/settings/invite_sender_setting_row";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { list_calendars } from "@/services/api/calendar";
import {
  apply_calendar_visibility,
  set_calendar_hidden,
} from "@/services/calendar/local_visibility";
import { use_local_calendar_visibility } from "@/hooks/use_local_calendar_visibility";
import {
  clamp_custom_view_days,
  CUSTOM_VIEW_DAY_OPTIONS,
  EVENT_COLOR_OPTIONS,
  find_event_color_option,
  week_start_day_index,
} from "@/components/calendar/calendar_utils";
import {
  DEFAULT_ALL_DAY_REMINDER_OPTIONS,
  DEFAULT_REMINDER_OPTIONS,
  format_default_reminder,
} from "@/services/calendar/event_reminders";
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const REMINDER_OPTIONS = DEFAULT_REMINDER_OPTIONS.filter((value) => value >= 0);
const ALL_DAY_REMINDER_OPTIONS = DEFAULT_ALL_DAY_REMINDER_OPTIONS.filter(
  (value) => value >= 0,
);
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => hour);
const MONTH_MAX_EVENT_OPTIONS = [2, 3, 4, 5, 6];
const CONTROL_WIDTH = 220;
const MAX_DEFAULT_LOCATION_LENGTH = 500;
const MAX_CONFERENCE_URL_LENGTH = 2048;
const MAX_SUBSCRIPTION_URL_LENGTH = 2048;

function is_https_url(value: string): boolean {
  if (value.length > MAX_SUBSCRIPTION_URL_LENGTH) {
    return false;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function with_current_option(options: number[], current: number): number[] {
  if (current < 0 || options.includes(current)) {
    return options;
  }

  return [...options, current].sort((a, b) => a - b);
}

const WEEKDAY_KEYS: TranslationKey[] = [
  "calendar.weekday_sun",
  "calendar.weekday_mon",
  "calendar.weekday_tue",
  "calendar.weekday_wed",
  "calendar.weekday_thu",
  "calendar.weekday_fri",
  "calendar.weekday_sat",
];

function resolve_local_timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function info_popover(title: string, info: string | undefined) {
  if (!info) {
    return undefined;
  }

  return <InfoPopover description={info} title={title} />;
}

interface SettingSelectProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  on_change: (value: string) => void;
}

function SettingSelect({
  label,
  value,
  options,
  on_change,
}: SettingSelectProps) {
  return (
    <Select value={value} onValueChange={on_change}>
      <SelectTrigger aria-label={label} className="h-10 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface SelectRowProps extends SettingSelectProps {
  description: string;
  info?: string;
}

function SelectRow({
  label,
  description,
  info,
  value,
  options,
  on_change,
}: SelectRowProps) {
  return (
    <SettingControlRow
      control={
        <SettingSelect
          label={label}
          options={options}
          value={value}
          on_change={on_change}
        />
      }
      control_width={CONTROL_WIDTH}
      description={description}
      info={info_popover(label, info)}
      label={label}
    />
  );
}

interface DraftInputProps {
  label: string;
  placeholder: string;
  value: string;
  max_length?: number;
  on_commit: (value: string) => void;
}

function DraftInput({
  label,
  placeholder,
  value,
  max_length,
  on_commit,
}: DraftInputProps) {
  const [draft, set_draft] = useState(value);

  useEffect(() => {
    set_draft(value);
  }, [value]);

  return (
    <Input
      aria-label={label}
      className="w-full text-[13px] font-medium"
      maxLength={max_length}
      placeholder={placeholder}
      size="md"
      type="text"
      value={draft}
      onBlur={() => on_commit(draft.trim())}
      onChange={(change_event) => set_draft(change_event.target.value)}
      onKeyDown={(key_event) => {
        if (key_event.key === "Enter") {
          key_event.currentTarget.blur();
        }
      }}
    />
  );
}

export function CalendarViewsSection() {
  const { t, language } = use_i18n();
  const { preferences, update_preference } = use_preferences();

  const local_timezone = useMemo(resolve_local_timezone, []);
  const use_24h = preferences.time_format === "24h";

  const hour_label = (hour: number) =>
    new Intl.DateTimeFormat(language, {
      hour: "numeric",
      hour12: preferences.time_format === "12h",
    }).format(new Date(2020, 0, 1, hour));

  const working_start = Math.min(
    Math.max(preferences.calendar_working_hours_start, 0),
    23,
  );
  const working_end =
    preferences.calendar_working_hours_end > working_start
      ? Math.min(preferences.calendar_working_hours_end, 24)
      : working_start + 1;

  const working_days = preferences.calendar_working_days ?? [1, 2, 3, 4, 5];
  const week_start_index = week_start_day_index(
    preferences.calendar_week_starts_on,
  );
  const ordered_weekdays = Array.from(
    { length: 7 },
    (_, index) => (index + week_start_index) % 7,
  );

  const weekday_short = (day_index: number) =>
    new Intl.DateTimeFormat(language, { weekday: "short" }).format(
      new Date(2023, 0, 1 + day_index),
    );

  const working_day_runs: number[][] = [];

  ordered_weekdays.forEach((day_index, position) => {
    if (!working_days.includes(day_index)) {
      return;
    }

    const last_run = working_day_runs[working_day_runs.length - 1];
    const previous_day =
      position > 0 ? ordered_weekdays[position - 1] : undefined;

    if (last_run && last_run[last_run.length - 1] === previous_day) {
      last_run.push(day_index);
    } else {
      working_day_runs.push([day_index]);
    }
  });

  const working_day_segments = working_day_runs.flatMap((run) =>
    run.length >= 3
      ? [
          t("calendar.settings_working_days_range", {
            start: weekday_short(run[0]),
            end: weekday_short(run[run.length - 1]),
          }),
        ]
      : run.map(weekday_short),
  );

  const list_format = (
    Intl as unknown as {
      ListFormat?: new (
        locale?: string,
        options?: { style?: string; type?: string },
      ) => { format: (items: string[]) => string };
    }
  ).ListFormat;

  const working_days_text = list_format
    ? new list_format(language, { style: "narrow", type: "unit" }).format(
        working_day_segments,
      )
    : working_day_segments.join(", ");

  const working_hours_summary =
    working_day_segments.length === 0
      ? t("calendar.settings_working_hours_no_days")
      : t("calendar.settings_working_hours_summary", {
          days: working_days_text,
          start: hour_label(working_start),
          end: hour_label(working_end),
        });

  const toggle_working_day = (day_index: number) => {
    const next = working_days.includes(day_index)
      ? working_days.filter((day) => day !== day_index)
      : [...working_days, day_index].sort((a, b) => a - b);

    update_preference("calendar_working_days", next);
  };

  const add_world_clock = (value: string) => {
    if (
      value === "add" ||
      preferences.calendar_world_clock_timezones.includes(value)
    ) {
      return;
    }

    update_preference("calendar_world_clock_timezones", [
      ...preferences.calendar_world_clock_timezones,
      value,
    ]);
  };

  const remove_world_clock = (zone: string) => {
    update_preference(
      "calendar_world_clock_timezones",
      preferences.calendar_world_clock_timezones.filter(
        (value) => value !== zone,
      ),
    );
  };

  return (
    <IslandSections>
      <SettingsSaveIndicatorInline />
      <SettingNote>{t("calendar.settings_sync_note")}</SettingNote>

      <IslandSection
        divided
        description={t("calendar.settings_group_layout_desc")}
        icon={<ViewColumnsIcon />}
        title={t("settings_search.layout")}
      >
        <SelectRow
          description={t("calendar.settings_default_view_desc")}
          info={t("calendar.settings_info_default_view")}
          label={t("calendar.settings_default_view")}
          options={[
            { value: "day", label: t("calendar.day") },
            { value: "week", label: t("calendar.week") },
            { value: "month", label: t("calendar.month") },
            { value: "year", label: t("calendar.year") },
            { value: "agenda", label: t("calendar.agenda") },
            { value: "custom", label: t("calendar.custom_view") },
          ]}
          value={preferences.calendar_default_view}
          on_change={(value) =>
            update_preference(
              "calendar_default_view",
              value as "month" | "week" | "day" | "agenda" | "year" | "custom",
            )
          }
        />

        <SelectRow
          description={t("calendar.settings_custom_view_desc")}
          info={t("calendar.settings_info_custom_view")}
          label={t("calendar.settings_custom_view")}
          options={CUSTOM_VIEW_DAY_OPTIONS.map((count) => ({
            value: String(count),
            label: t("calendar.custom_view_days", { count }),
          }))}
          value={String(preferences.calendar_custom_view_days)}
          on_change={(value) =>
            update_preference(
              "calendar_custom_view_days",
              clamp_custom_view_days(Number(value)),
            )
          }
        />

        <SelectRow
          description={t("calendar.settings_week_start_desc")}
          info={t("calendar.settings_info_week_start")}
          label={t("calendar.settings_week_start")}
          options={[
            { value: "saturday", label: t("calendar.settings_saturday") },
            { value: "sunday", label: t("calendar.settings_sunday") },
            { value: "monday", label: t("calendar.settings_monday") },
          ]}
          value={preferences.calendar_week_starts_on}
          on_change={(value) =>
            update_preference(
              "calendar_week_starts_on",
              value as "sunday" | "monday" | "saturday",
            )
          }
        />

        <SettingToggleRow
          checked={preferences.calendar_show_weekends}
          description={t("calendar.settings_show_weekends_desc")}
          label={t("calendar.settings_show_weekends")}
          on_change={(next) =>
            update_preference("calendar_show_weekends", next)
          }
        />

        <SettingToggleRow
          checked={preferences.calendar_show_week_numbers}
          description={t("calendar.settings_show_week_numbers_desc")}
          label={t("calendar.settings_show_week_numbers")}
          on_change={(next) =>
            update_preference("calendar_show_week_numbers", next)
          }
        />
      </IslandSection>

      <IslandSection
        divided
        description={t("calendar.settings_group_extras_desc")}
        icon={<GlobeAltIcon />}
        title={t("calendar.settings_group_extras")}
      >
        <SelectRow
          description={t("calendar.settings_alternate_calendar_desc")}
          info={t("calendar.settings_info_alternate_calendar")}
          label={t("calendar.settings_alternate_calendar")}
          options={[
            { value: "none", label: t("calendar.alternate_none") },
            { value: "chinese", label: t("calendar.alternate_chinese") },
            { value: "hebrew", label: t("calendar.alternate_hebrew") },
            { value: "islamic", label: t("calendar.alternate_islamic") },
            { value: "persian", label: t("calendar.alternate_persian") },
            { value: "indian", label: t("calendar.alternate_indian") },
          ]}
          value={preferences.calendar_alternate_calendar}
          on_change={(value) =>
            update_preference(
              "calendar_alternate_calendar",
              value as UserPreferences["calendar_alternate_calendar"],
            )
          }
        />

        <SelectRow
          description={t("calendar.settings_holidays_desc")}
          info={t("calendar.settings_info_holidays")}
          label={t("calendar.settings_holidays")}
          options={[
            { value: "none", label: t("calendar.alternate_none") },
            { value: "us", label: t("calendar.holiday_region_us") },
            { value: "uk", label: t("calendar.holiday_region_uk") },
            { value: "de", label: t("calendar.holiday_region_de") },
            { value: "fr", label: t("calendar.holiday_region_fr") },
            { value: "ca", label: t("calendar.holiday_region_ca") },
            { value: "au", label: t("calendar.holiday_region_au") },
            { value: "pt", label: t("calendar.holiday_region_pt") },
            { value: "br", label: t("calendar.holiday_region_br") },
            { value: "in", label: t("calendar.holiday_region_in") },
          ]}
          value={preferences.calendar_holiday_region ?? "none"}
          on_change={(value) =>
            update_preference(
              "calendar_holiday_region",
              value as UserPreferences["calendar_holiday_region"],
            )
          }
        />

        <SettingToggleRow
          checked={preferences.calendar_day_split_by_calendar}
          description={t("calendar.settings_day_split_desc")}
          info={info_popover(
            t("calendar.settings_day_split"),
            t("calendar.settings_info_day_split"),
          )}
          label={t("calendar.settings_day_split")}
          on_change={(next) =>
            update_preference("calendar_day_split_by_calendar", next)
          }
        />
      </IslandSection>

      <IslandSection
        divided
        description={t("calendar.settings_group_display_desc")}
        icon={<Squares2X2Icon />}
        title={t("calendar.settings_group_display")}
      >
        <SettingToggleRow
          checked={preferences.calendar_show_event_location}
          description={t("calendar.settings_show_location_desc")}
          label={t("calendar.settings_show_location")}
          on_change={(next) =>
            update_preference("calendar_show_event_location", next)
          }
        />

        <SettingToggleRow
          checked={preferences.calendar_show_declined_events}
          description={t("calendar.settings_show_declined_desc")}
          label={t("calendar.settings_show_declined")}
          on_change={(next) =>
            update_preference("calendar_show_declined_events", next)
          }
        />

        <SettingToggleRow
          checked={preferences.calendar_dim_past_events}
          description={t("calendar.settings_dim_past_events_desc")}
          label={t("calendar.settings_dim_past_events")}
          on_change={(next) =>
            update_preference("calendar_dim_past_events", next)
          }
        />

        <SelectRow
          description={t("calendar.settings_density_desc")}
          info={t("calendar.settings_info_density")}
          label={t("calendar.settings_density")}
          options={[
            {
              value: "responsive",
              label: t("calendar.settings_density_responsive"),
            },
            { value: "compact", label: t("calendar.settings_density_compact") },
          ]}
          value={preferences.calendar_density}
          on_change={(value) =>
            update_preference(
              "calendar_density",
              value as "responsive" | "compact",
            )
          }
        />

        <SettingToggleRow
          checked={preferences.calendar_short_events_full_size}
          description={t("calendar.settings_short_events_full_size_desc")}
          info={info_popover(
            t("calendar.settings_short_events_full_size"),
            t("calendar.settings_info_short_events"),
          )}
          label={t("calendar.settings_short_events_full_size")}
          on_change={(next) =>
            update_preference("calendar_short_events_full_size", next)
          }
        />

        <SettingToggleRow
          checked={preferences.calendar_show_current_time_indicator}
          description={t("calendar.settings_show_current_time_desc")}
          label={t("calendar.settings_show_current_time")}
          on_change={(next) =>
            update_preference("calendar_show_current_time_indicator", next)
          }
        />

        <SettingToggleRow
          checked={preferences.calendar_scroll_to_first_event}
          description={t("calendar.settings_scroll_to_first_event_desc")}
          info={info_popover(
            t("calendar.settings_scroll_to_first_event"),
            t("calendar.settings_info_scroll_first_event"),
          )}
          label={t("calendar.settings_scroll_to_first_event")}
          on_change={(next) =>
            update_preference("calendar_scroll_to_first_event", next)
          }
        />

        <SelectRow
          description={t("calendar.settings_month_max_events_desc")}
          info={t("calendar.settings_info_month_max_events")}
          label={t("calendar.settings_month_max_events")}
          options={MONTH_MAX_EVENT_OPTIONS.map((count) => ({
            value: String(count),
            label: t("calendar.settings_events_count", { count }),
          }))}
          value={String(preferences.calendar_month_max_events)}
          on_change={(value) =>
            update_preference("calendar_month_max_events", Number(value))
          }
        />
      </IslandSection>

      <IslandSection
        divided
        description={t("calendar.settings_group_timezone_desc")}
        icon={<GlobeAltIcon />}
        title={t("calendar.settings_timezone")}
      >
        <SettingControlRow
          control={
            <TimeZonePicker
              auto_label={t("calendar.settings_calendar_timezone_device", {
                zone: local_timezone,
              })}
              auto_secondary=""
              auto_value="device"
              trigger_class_name="w-full"
              use_24h={use_24h}
              value={preferences.calendar_timezone || "device"}
              on_change={(value) =>
                update_preference(
                  "calendar_timezone",
                  value === "device" ? "" : value,
                )
              }
            />
          }
          control_width={CONTROL_WIDTH}
          description={t("calendar.settings_calendar_timezone_desc")}
          label={t("calendar.settings_calendar_timezone")}
        />

        <SettingControlRow
          control={
            <TimeZonePicker
              auto_label={t("calendar.settings_secondary_timezone_none")}
              auto_secondary=""
              auto_value="none"
              trigger_class_name="w-full"
              use_24h={use_24h}
              value={preferences.calendar_secondary_timezone || "none"}
              on_change={(value) =>
                update_preference(
                  "calendar_secondary_timezone",
                  value === "none" ? "" : value,
                )
              }
            />
          }
          control_width={CONTROL_WIDTH}
          description={t("calendar.settings_secondary_timezone_desc")}
          info={info_popover(
            t("calendar.settings_secondary_timezone"),
            t("calendar.settings_info_secondary_timezone"),
          )}
          label={t("calendar.settings_secondary_timezone")}
        />

        <SettingControlRow
          control={
            <TimeZonePicker
              exclude={preferences.calendar_world_clock_timezones}
              show_auto={false}
              trigger_class_name="w-full"
              trigger_label={t("calendar.settings_world_clock_add")}
              use_24h={use_24h}
              value="add"
              on_change={add_world_clock}
            />
          }
          control_width={CONTROL_WIDTH}
          description={t("calendar.settings_world_clock_desc")}
          info={info_popover(
            t("calendar.settings_world_clock"),
            t("calendar.settings_info_world_clock"),
          )}
          label={t("calendar.settings_world_clock")}
        />

        {preferences.calendar_world_clock_timezones.length > 0 && (
          <IslandRow
            label={
              <span className="flex flex-wrap gap-2">
                {preferences.calendar_world_clock_timezones.map((zone) => (
                  <span
                    key={zone}
                    className="inline-flex items-center gap-1 rounded-full bg-surf-primary ps-3 pe-1.5 py-1 text-sm font-medium text-txt-primary"
                  >
                    {zone}
                    <button
                      aria-label={t("common.remove")}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-txt-muted transition-colors hover:bg-[var(--aster-island-hover)] hover:text-txt-primary"
                      type="button"
                      onClick={() => remove_world_clock(zone)}
                    >
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </span>
            }
            layout="block"
          />
        )}
      </IslandSection>

      <IslandSection
        divided
        description={t("calendar.settings_group_working_hours_desc")}
        icon={<ClockIcon />}
        title={t("calendar.settings_working_hours")}
      >
        <SettingControlRow
          control={
            <div className="flex items-center gap-2">
              <Select
                value={String(working_start)}
                onValueChange={(value) =>
                  update_preference(
                    "calendar_working_hours_start",
                    Number(value),
                  )
                }
              >
                <SelectTrigger
                  aria-label={t("calendar.settings_working_hours_start")}
                  className="h-10 w-[112px]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUR_OPTIONS.filter((hour) => hour < working_end).map(
                    (hour) => (
                      <SelectItem key={hour} value={String(hour)}>
                        {hour_label(hour)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              <span className="text-sm text-txt-muted">
                {t("calendar.settings_working_hours_to")}
              </span>
              <Select
                value={String(working_end)}
                onValueChange={(value) =>
                  update_preference("calendar_working_hours_end", Number(value))
                }
              >
                <SelectTrigger
                  aria-label={t("calendar.settings_working_hours_end")}
                  className="h-10 w-[112px]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...HOUR_OPTIONS, 24]
                    .filter((hour) => hour > working_start)
                    .map((hour) => (
                      <SelectItem key={hour} value={String(hour)}>
                        {hour_label(hour)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          }
          control_width="auto"
          description={working_hours_summary}
          info={info_popover(
            t("calendar.settings_working_hours_row"),
            t("calendar.settings_info_working_hours"),
          )}
          label={t("calendar.settings_working_hours_row")}
        />

        <SettingToggleRow
          checked={preferences.calendar_dim_non_working_hours}
          description={t("calendar.settings_dim_non_working_desc")}
          label={t("calendar.settings_dim_non_working")}
          on_change={(next) =>
            update_preference("calendar_dim_non_working_hours", next)
          }
        />

        <SettingControlRow
          control={ordered_weekdays.map((day_index) => {
            const is_on = working_days.includes(day_index);

            return (
              <button
                aria-pressed={is_on}
                className="h-8 w-8 rounded-full border text-[12px] font-medium transition-colors duration-150 ease-out"
                key={day_index}
                style={{
                  backgroundColor: is_on
                    ? "var(--accent-color)"
                    : "transparent",
                  borderColor: is_on
                    ? "var(--accent-color)"
                    : "var(--border-primary)",
                  color: is_on
                    ? "var(--accent-fg, #ffffff)"
                    : "var(--text-secondary)",
                }}
                type="button"
                onClick={() => toggle_working_day(day_index)}
              >
                {t(WEEKDAY_KEYS[day_index])}
              </button>
            );
          })}
          control_width="auto"
          description={t("calendar.settings_working_days_desc")}
          info={info_popover(
            t("calendar.settings_working_days"),
            t("calendar.settings_info_working_days"),
          )}
          label={t("calendar.settings_working_days")}
        />
      </IslandSection>
    </IslandSections>
  );
}

export function CalendarEventsSection() {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const [calendars, set_calendars] = useState<DecryptedCalendar[]>([]);

  useEffect(() => {
    let cancelled = false;

    list_calendars()
      .then((result) => {
        if (!cancelled) {
          set_calendars(result.data);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const duration_label = (minutes: number) => {
    if (minutes < 60) {
      return t("calendar.settings_minutes", { count: minutes });
    }

    if (minutes === 60) {
      return t("calendar.settings_hour");
    }

    return t("calendar.settings_hours", { count: minutes / 60 });
  };

  const reminder_label = (minutes: number) =>
    format_default_reminder(minutes, t);

  return (
    <IslandSections>
      <SettingsSaveIndicatorInline />
      <SettingNote>{t("calendar.settings_sync_note")}</SettingNote>

      <IslandSection
        divided
        description={t("calendar.settings_group_events_desc")}
        icon={<CalendarDaysIcon />}
        title={t("calendar.settings_events")}
      >
        <SelectRow
          description={t("calendar.settings_default_duration_desc")}
          label={t("calendar.settings_default_duration")}
          options={DURATION_OPTIONS.map((minutes) => ({
            value: String(minutes),
            label: duration_label(minutes),
          }))}
          value={String(preferences.calendar_default_event_duration)}
          on_change={(value) =>
            update_preference("calendar_default_event_duration", Number(value))
          }
        />

        <SelectRow
          description={t("calendar.settings_default_calendar_desc")}
          label={t("calendar.settings_default_calendar")}
          options={
            calendars.length > 0
              ? calendars.map((calendar) => ({
                  value: calendar.id,
                  label: calendar.name,
                }))
              : [
                  {
                    value: "primary",
                    label: t("calendar.settings_use_primary"),
                  },
                ]
          }
          value={
            calendars.find(
              (calendar) =>
                calendar.id === preferences.calendar_default_calendar_id,
            )?.id ??
            calendars.find((calendar) => calendar.is_default)?.id ??
            calendars[0]?.id ??
            "primary"
          }
          on_change={(value) =>
            update_preference(
              "calendar_default_calendar_id",
              value === "primary" ? "" : value,
            )
          }
        />

        <SettingControlRow
          control={
            <DraftInput
              label={t("calendar.settings_default_location")}
              max_length={MAX_DEFAULT_LOCATION_LENGTH}
              placeholder={t("calendar.settings_default_location_placeholder")}
              value={preferences.calendar_default_event_location}
              on_commit={(value) =>
                update_preference(
                  "calendar_default_event_location",
                  value.slice(0, MAX_DEFAULT_LOCATION_LENGTH),
                )
              }
            />
          }
          control_width={CONTROL_WIDTH}
          description={t("calendar.settings_default_location_desc")}
          info={info_popover(
            t("calendar.settings_default_location"),
            t("calendar.settings_info_default_location"),
          )}
          label={t("calendar.settings_default_location")}
        />

        <SettingControlRow
          control={
            <DraftInput
              label={t("calendar.settings_default_conference")}
              max_length={MAX_CONFERENCE_URL_LENGTH}
              placeholder={t(
                "calendar.settings_default_conference_placeholder",
              )}
              value={preferences.calendar_default_conference_url}
              on_commit={(value) => {
                if (value.length > 0 && !is_https_url(value)) {
                  show_toast(
                    t("calendar.settings_conference_url_invalid"),
                    "error",
                  );

                  return;
                }

                update_preference("calendar_default_conference_url", value);
              }}
            />
          }
          control_width={CONTROL_WIDTH}
          description={t("calendar.settings_default_conference_desc")}
          info={info_popover(
            t("calendar.settings_default_conference"),
            t("calendar.settings_info_default_conference"),
          )}
          label={t("calendar.settings_default_conference")}
        />

        <SettingToggleRow
          checked={preferences.calendar_speedy_meetings}
          description={t("calendar.settings_speedy_meetings_desc")}
          info={info_popover(
            t("calendar.settings_speedy_meetings"),
            t("calendar.settings_info_speedy_meetings"),
          )}
          label={t("calendar.settings_speedy_meetings")}
          on_change={(next) =>
            update_preference("calendar_speedy_meetings", next)
          }
        />

        <SelectRow
          description={t("calendar.settings_default_availability_desc")}
          info={t("calendar.settings_info_default_availability")}
          label={t("calendar.settings_default_availability")}
          options={[
            { value: "busy", label: t("calendar.availability_busy") },
            { value: "free", label: t("calendar.availability_free") },
          ]}
          value={preferences.calendar_default_event_availability}
          on_change={(value) =>
            update_preference(
              "calendar_default_event_availability",
              value as "busy" | "free",
            )
          }
        />

        <SelectRow
          description={t("calendar.settings_default_visibility_desc")}
          info={t("calendar.settings_info_default_visibility")}
          label={t("calendar.settings_default_visibility")}
          options={[
            { value: "default", label: t("calendar.visibility_default") },
            { value: "public", label: t("calendar.visibility_public") },
            { value: "private", label: t("calendar.visibility_private") },
          ]}
          value={preferences.calendar_default_event_visibility}
          on_change={(value) =>
            update_preference(
              "calendar_default_event_visibility",
              value as "default" | "public" | "private",
            )
          }
        />

        <SelectRow
          description={t("calendar.settings_default_event_color_desc")}
          label={t("calendar.settings_default_event_color")}
          options={[
            {
              value: "calendar",
              label: t("calendar.color_calendar_default"),
            },
            ...EVENT_COLOR_OPTIONS.map((option) => ({
              value: option.hex,
              label: t(option.name_key),
            })),
          ]}
          value={
            preferences.calendar_default_event_color
              ? (find_event_color_option(
                  preferences.calendar_default_event_color,
                )?.hex ?? preferences.calendar_default_event_color)
              : "calendar"
          }
          on_change={(value) =>
            update_preference(
              "calendar_default_event_color",
              value === "calendar" ? "" : value,
            )
          }
        />

        <SettingToggleRow
          checked={preferences.calendar_confirm_before_delete}
          description={t("calendar.settings_confirm_before_delete_desc")}
          label={t("calendar.settings_confirm_before_delete")}
          on_change={(next) =>
            update_preference("calendar_confirm_before_delete", next)
          }
        />

        <SettingToggleRow
          checked={preferences.calendar_default_guests_can_modify}
          description={t("calendar.settings_guests_can_modify_desc")}
          info={info_popover(
            t("calendar.settings_guests_can_modify"),
            t("calendar.settings_info_guest_permissions"),
          )}
          label={t("calendar.settings_guests_can_modify")}
          on_change={(next) =>
            update_preference("calendar_default_guests_can_modify", next)
          }
        />

        <SettingToggleRow
          checked={preferences.calendar_default_guests_can_invite}
          description={t("calendar.settings_guests_can_invite_desc")}
          label={t("calendar.settings_guests_can_invite")}
          on_change={(next) =>
            update_preference("calendar_default_guests_can_invite", next)
          }
        />

        <SettingToggleRow
          checked={preferences.calendar_default_guests_can_see_guests}
          description={t("calendar.settings_guests_can_see_guests_desc")}
          label={t("calendar.settings_guests_can_see_guests")}
          on_change={(next) =>
            update_preference("calendar_default_guests_can_see_guests", next)
          }
        />

        <InviteSenderSettingRow />
      </IslandSection>

      <IslandSection
        divided
        description={t("calendar.settings_group_reminder_desc")}
        icon={<BellAlertIcon />}
        title={t("calendar.reminder")}
      >
        <SelectRow
          description={t("calendar.settings_default_reminder_desc")}
          label={t("calendar.settings_default_reminder")}
          options={[
            { value: "none", label: t("calendar.reminder_none") },
            ...with_current_option(
              REMINDER_OPTIONS,
              preferences.calendar_default_reminder_minutes,
            ).map((minutes) => ({
              value: String(minutes),
              label: reminder_label(minutes),
            })),
          ]}
          value={
            preferences.calendar_default_reminder_minutes < 0
              ? "none"
              : String(preferences.calendar_default_reminder_minutes)
          }
          on_change={(value) =>
            update_preference(
              "calendar_default_reminder_minutes",
              value === "none" ? -1 : Number(value),
            )
          }
        />

        <SelectRow
          description={t("calendar.settings_default_all_day_reminder_desc")}
          info={t("calendar.settings_info_all_day_reminder")}
          label={t("calendar.settings_default_all_day_reminder")}
          options={[
            { value: "none", label: t("calendar.reminder_none") },
            ...with_current_option(
              ALL_DAY_REMINDER_OPTIONS,
              preferences.calendar_default_all_day_reminder_minutes,
            ).map((minutes) => ({
              value: String(minutes),
              label: reminder_label(minutes),
            })),
          ]}
          value={
            preferences.calendar_default_all_day_reminder_minutes < 0
              ? "none"
              : String(preferences.calendar_default_all_day_reminder_minutes)
          }
          on_change={(value) =>
            update_preference(
              "calendar_default_all_day_reminder_minutes",
              value === "none" ? -1 : Number(value),
            )
          }
        />
      </IslandSection>
    </IslandSections>
  );
}

export function CalendarNotificationsSection() {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const [permission, set_permission] = useState<NotificationPermission | null>(
    null,
  );

  useEffect(() => {
    if (typeof Notification === "undefined") {
      return;
    }

    set_permission(Notification.permission);
  }, []);

  const request_permission = async () => {
    if (typeof Notification === "undefined") {
      return;
    }

    try {
      const result = await Notification.requestPermission();

      set_permission(result);
    } catch {
      set_permission("denied");
    }
  };

  const wants_desktop = preferences.calendar_notifications_mode === "desktop";
  const notifications_off = preferences.calendar_notifications_mode === "off";

  return (
    <IslandSections>
      <SettingsSaveIndicatorInline />
      <SettingNote>{t("calendar.settings_sync_note")}</SettingNote>

      <IslandSection
        divided
        description={t("calendar.settings_group_notifications_desc")}
        icon={<BellAlertIcon />}
        title={t("calendar.settings_notifications")}
      >
        <SelectRow
          description={t("calendar.settings_notification_mode_desc")}
          label={t("calendar.settings_notification_mode")}
          options={[
            { value: "off", label: t("calendar.settings_notification_off") },
            {
              value: "alerts",
              label: t("calendar.settings_notification_alerts"),
            },
            {
              value: "desktop",
              label: t("calendar.settings_notification_desktop"),
            },
          ]}
          value={preferences.calendar_notifications_mode}
          on_change={(value) =>
            update_preference(
              "calendar_notifications_mode",
              value as "off" | "alerts" | "desktop",
            )
          }
        />

        {wants_desktop && permission !== null && permission !== "granted" && (
          <IslandRow
            label={t("calendar.settings_notification_desktop")}
            description={
              permission === "denied"
                ? t("calendar.settings_notification_permission_blocked")
                : t("calendar.settings_notification_desktop_desc")
            }
            trailing={
              permission === "default" ? (
                <Button
                  size="md"
                  variant="secondary"
                  onClick={() => void request_permission()}
                >
                  {t("calendar.settings_grant_notification_permission")}
                </Button>
              ) : undefined
            }
          />
        )}

        {wants_desktop && permission === "granted" && (
          <IslandRow
            description={t("calendar.settings_notification_permission_granted")}
            label={t("calendar.settings_notification_desktop")}
          />
        )}

        {!notifications_off && (
          <IslandRow
            description={t("calendar.settings_notification_background_note")}
            label={t("calendar.settings_notification_background")}
          />
        )}

        <SettingToggleRow
          checked={preferences.calendar_notification_sound}
          description={t("calendar.settings_notification_sound_desc")}
          disabled={notifications_off}
          label={t("calendar.settings_notification_sound")}
          on_change={(next) =>
            update_preference("calendar_notification_sound", next)
          }
        />

        <SettingToggleRow
          checked={preferences.calendar_notify_only_accepted}
          description={t("calendar.settings_notify_only_accepted_desc")}
          disabled={notifications_off}
          label={t("calendar.settings_notify_only_accepted")}
          on_change={(next) =>
            update_preference("calendar_notify_only_accepted", next)
          }
        />
      </IslandSection>

      <IslandSection
        divided
        description={t("calendar.settings_group_shortcuts_desc")}
        icon={<CommandLineIcon />}
        title={t("calendar.settings_keyboard_shortcuts")}
      >
        <SettingToggleRow
          checked={preferences.calendar_keyboard_shortcuts_enabled}
          description={t("calendar.settings_keyboard_shortcuts_desc")}
          info={info_popover(
            t("calendar.settings_keyboard_shortcuts"),
            t("calendar.settings_info_keyboard_shortcuts"),
          )}
          label={t("calendar.settings_keyboard_shortcuts")}
          on_change={(next) =>
            update_preference("calendar_keyboard_shortcuts_enabled", next)
          }
        />
      </IslandSection>
    </IslandSections>
  );
}

export { CalendarImportExportSection } from "./calendar_import_export_section";

export function CalendarListSection() {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const [server_calendars, set_calendars] = useState<DecryptedCalendar[]>([]);
  const { visibility, update: update_visibility } =
    use_local_calendar_visibility({
      calendars: server_calendars,
      subscriptions: preferences.calendar_ics_subscriptions ?? [],
      birthdays_hidden: preferences.calendar_birthdays_hidden === true,
    });
  const calendars = useMemo(
    () => apply_calendar_visibility(server_calendars, visibility),
    [server_calendars, visibility],
  );
  const [is_loading, set_is_loading] = useState(true);
  const [editor, set_editor] = useState<{
    is_open: boolean;
    calendar: DecryptedCalendar | null;
  }>({ is_open: false, calendar: null });
  const [delete_target, set_delete_target] = useState<DecryptedCalendar | null>(
    null,
  );
  const [clear_target, set_clear_target] = useState<DecryptedCalendar | null>(
    null,
  );
  const close_clear = useCallback(() => set_clear_target(null), []);

  const reload = async () => {
    try {
      const result = await list_calendars();

      set_calendars(result.data);
    } catch {
      return;
    }
  };

  useEffect(() => {
    let cancelled = false;

    list_calendars()
      .then((result) => {
        if (!cancelled) {
          set_calendars(result.data);
          set_is_loading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          set_is_loading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const default_calendar_id =
    calendars.find(
      (entry) => entry.id === preferences.calendar_default_calendar_id,
    )?.id ??
    calendars.find((entry) => entry.is_default)?.id ??
    calendars[0]?.id ??
    "";

  const toggle_visibility = (calendar: DecryptedCalendar, next: boolean) =>
    update_visibility((current) =>
      set_calendar_hidden(current, calendar.id, !next),
    );

  const set_as_default = (calendar: DecryptedCalendar) => {
    void update_preference("calendar_default_calendar_id", calendar.id);
    show_toast(t("calendar.settings_default_calendar_set"), "success");
  };

  const handle_deleted = (removed_id: string) => {
    if (preferences.calendar_default_calendar_id === removed_id) {
      void update_preference("calendar_default_calendar_id", "");
    }

    void reload();
  };

  return (
    <IslandSections>
      <SettingNote>{t("calendar.settings_sync_note")}</SettingNote>

      <IslandSection
        divided
        description={t("calendar.settings_group_calendars_desc")}
        icon={<Squares2X2Icon />}
        title={t("calendar.settings_calendars")}
        trailing={
          <Button
            size="md"
            variant="depth"
            onClick={() => set_editor({ is_open: true, calendar: null })}
          >
            <PlusIcon className="w-4 h-4 me-1.5" />
            {t("calendar.settings_create_calendar")}
          </Button>
        }
      >
        {!is_loading && calendars.length === 0 && (
          <IslandRow label={t("calendar.settings_no_calendars")} />
        )}

        {calendars.map((calendar) => (
          <IslandRow
            key={calendar.id}
            description={
              calendar.is_visible
                ? t("calendar.settings_calendar_visible")
                : t("calendar.settings_calendar_hidden")
            }
            icon={
              <span
                className="block h-3 w-3 rounded-[4px]"
                style={{ backgroundColor: calendar.color }}
              />
            }
            label={
              <span className="flex min-w-0 max-w-full items-center gap-2">
                <span className="min-w-0 truncate">{calendar.name}</span>
                {calendar.id === default_calendar_id && (
                  <Badge className="flex-shrink-0" color="blue">
                    {t("calendar.settings_default_badge")}
                  </Badge>
                )}
              </span>
            }
            toggle={{
              aria_label: calendar.name,
              checked: calendar.is_visible,
              on_change: (next) => toggle_visibility(calendar, next),
            }}
            trailing={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={t("calendar.calendar_options")}
                    className="h-8 w-8 rounded-full"
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <EllipsisHorizontalIcon className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="min-w-[190px]">
                  <DropdownMenuItem
                    onSelect={() => set_editor({ is_open: true, calendar })}
                  >
                    {t("calendar.edit_calendar")}
                  </DropdownMenuItem>
                  {calendar.id !== default_calendar_id && (
                    <DropdownMenuItem onSelect={() => set_as_default(calendar)}>
                      {t("calendar.settings_set_default_calendar")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="text-danger focus:text-danger"
                    onSelect={() => set_clear_target(calendar)}
                  >
                    {t("calendar.clear_calendar_events")}
                  </DropdownMenuItem>
                  {!calendar.is_default && (
                    <DropdownMenuItem
                      className="text-danger focus:text-danger"
                      onSelect={() => set_delete_target(calendar)}
                    >
                      {t("calendar.settings_delete_calendar")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        ))}
      </IslandSection>

      <CalendarEditDialog
        calendar={editor.calendar}
        is_open={editor.is_open}
        on_close={() =>
          set_editor((current) => ({ ...current, is_open: false }))
        }
        on_delete_request={set_delete_target}
        on_saved={() => void reload()}
      />

      <CalendarDeleteDialog
        calendar={delete_target}
        on_close={() => set_delete_target(null)}
        on_deleted={handle_deleted}
      />

      <CalendarClearDialog calendar={clear_target} on_close={close_clear} />
    </IslandSections>
  );
}
