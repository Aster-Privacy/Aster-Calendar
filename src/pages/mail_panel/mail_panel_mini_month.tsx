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
import type { KeyboardEvent } from "react";
import type { DayBuckets } from "@/pages/mail_panel/mail_panel_days";

import { memo, useEffect, useMemo, useRef } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

import {
  add_days,
  build_month_grid,
  events_for_day,
  is_same_day,
} from "@/components/calendar/calendar_utils";
import { use_i18n } from "@/lib/i18n/context";
import { day_key } from "@/pages/mail_panel/mail_panel_days";

export { day_key };

const FOCUS_RING =
  "focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-0";
const MINI_NAV =
  "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] text-[var(--icon-secondary)] transition-colors duration-150 hover:bg-[var(--aster-hover)] hover:text-[var(--icon-active)]";

const KEY_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

export function days_with_events(
  grid: Date[],
  events: DecryptedCalendarEvent[],
): Set<string> {
  const keys = new Set<string>();

  if (events.length === 0) return keys;

  for (const day of grid) {
    if (events_for_day(events, day).length > 0) keys.add(day_key(day));
  }

  return keys;
}

function days_with_bucketed_events(
  grid: Date[],
  buckets: DayBuckets,
): Set<string> {
  const keys = new Set<string>();

  for (const day of grid) {
    const key = day_key(day);

    if ((buckets.get(key)?.length ?? 0) > 0) keys.add(key);
  }

  return keys;
}

interface MailPanelMiniMonthProps {
  view_month: Date;
  selected_date: Date;
  today: Date;
  day_buckets: DayBuckets;
  week_start_day: number;
  on_select_day: (day: Date) => void;
  on_change_month: (delta: number) => void;
  on_reset: () => void;
}

export const MailPanelMiniMonth = memo(function MailPanelMiniMonth({
  view_month,
  selected_date,
  today,
  day_buckets,
  week_start_day,
  on_select_day,
  on_change_month,
  on_reset,
}: MailPanelMiniMonthProps) {
  const { t, language } = use_i18n();
  const grid_ref = useRef<HTMLDivElement>(null);
  const pending_focus_ref = useRef<string | null>(null);
  const view_month_ms = view_month.getTime();
  const month_index = view_month.getMonth();

  const grid = useMemo(
    () => build_month_grid(new Date(view_month_ms), week_start_day),
    [view_month_ms, week_start_day],
  );

  const rows = useMemo(() => {
    const result: Date[][] = [];

    for (let index = 0; index < grid.length; index += 7) {
      result.push(grid.slice(index, index + 7));
    }

    return result;
  }, [grid]);

  const event_days = useMemo(
    () => days_with_bucketed_events(grid, day_buckets),
    [grid, day_buckets],
  );

  const formatters = useMemo(
    () => ({
      month: new Intl.DateTimeFormat(language, {
        month: "long",
        year: "numeric",
      }),
      weekday: new Intl.DateTimeFormat(language, { weekday: "narrow" }),
      weekday_long: new Intl.DateTimeFormat(language, { weekday: "long" }),
      full: new Intl.DateTimeFormat(language, { dateStyle: "full" }),
    }),
    [language],
  );

  const weekdays = useMemo(
    () =>
      grid.slice(0, 7).map((day) => ({
        short: formatters.weekday.format(day),
        long: formatters.weekday_long.format(day),
      })),
    [grid, formatters],
  );

  const focus_target =
    grid.find((day) => is_same_day(day, selected_date)) ??
    grid.find((day) => is_same_day(day, today)) ??
    grid.find((day) => day.getMonth() === month_index) ??
    grid[0];

  useEffect(() => {
    const key = pending_focus_ref.current;

    if (!key) return;

    pending_focus_ref.current = null;
    grid_ref.current
      ?.querySelector<HTMLButtonElement>(`[data-day-key="${key}"]`)
      ?.focus();
  }, [grid, selected_date]);

  const handle_key_down = (
    keyboard_event: KeyboardEvent<HTMLButtonElement>,
    day: Date,
  ) => {
    const step = KEY_STEPS[keyboard_event.key];

    if (step === undefined) return;

    keyboard_event.preventDefault();

    const is_rtl =
      getComputedStyle(keyboard_event.currentTarget).direction === "rtl";
    const signed_step = is_rtl && Math.abs(step) === 1 ? -step : step;
    const next = add_days(day, signed_step);

    pending_focus_ref.current = day_key(next);
    on_select_day(next);
  };

  const month_label = formatters.month.format(view_month);

  return (
    <div className="mb-2 px-2 pt-1 pb-2">
      <div className="mb-1 flex h-8 items-center gap-0.5">
        <button
          className={`inline-flex h-8 min-w-0 flex-1 items-center rounded-[10px] px-2 text-[14px] font-medium text-txt-primary transition-colors duration-150 hover:bg-[var(--aster-hover)] ${FOCUS_RING}`}
          title={t("calendar.today")}
          type="button"
          onClick={on_reset}
        >
          <span aria-live="polite" className="truncate">
            {month_label}
          </span>
        </button>
        <button
          aria-label={t("calendar.previous_month")}
          className={`${MINI_NAV} ${FOCUS_RING}`}
          type="button"
          onClick={() => on_change_month(-1)}
        >
          <ChevronLeftIcon className="h-4 w-4 rtl:-scale-x-100" />
        </button>
        <button
          aria-label={t("calendar.next_month")}
          className={`${MINI_NAV} ${FOCUS_RING}`}
          type="button"
          onClick={() => on_change_month(1)}
        >
          <ChevronRightIcon className="h-4 w-4 rtl:-scale-x-100" />
        </button>
      </div>
      <div
        ref={grid_ref}
        aria-label={month_label}
        className="flex flex-col"
        role="grid"
      >
        <div className="grid grid-cols-7" role="row">
          {weekdays.map((weekday, index) => (
            <span
              key={`${weekday.long}_${index}`}
              aria-label={weekday.long}
              className="inline-flex h-7 items-center justify-center text-[10px] font-semibold uppercase tracking-[0.05em] text-txt-secondary"
              role="columnheader"
            >
              {weekday.short}
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <div
            key={day_key(row[0])}
            className="grid grid-cols-7 gap-y-0.5"
            role="row"
          >
            {row.map((day) => {
              const key = day_key(day);
              const is_current_month = day.getMonth() === month_index;
              const is_today = is_same_day(day, today);
              const is_selected = is_same_day(day, selected_date);
              const has_events = event_days.has(key);

              return (
                <span
                  key={key}
                  aria-selected={is_selected}
                  className="flex"
                  role="gridcell"
                >
                  <button
                    aria-current={is_today ? "date" : undefined}
                    aria-label={formatters.full.format(day)}
                    className={`group/day relative flex h-7 w-full items-center justify-center rounded-[8px] ${FOCUS_RING}`}
                    data-day-key={key}
                    tabIndex={is_same_day(day, focus_target) ? 0 : -1}
                    type="button"
                    onClick={() => on_select_day(day)}
                    onKeyDown={(keyboard_event) =>
                      handle_key_down(keyboard_event, day)
                    }
                  >
                    <span
                      className={`relative flex h-7 w-7 items-center justify-center rounded-[8px] text-[12px] leading-none tabular-nums transition-colors duration-150 ease-out ${
                        is_today
                          ? "bg-[var(--calendar_today_marker_bg,var(--accent-color))] font-semibold text-[var(--calendar_today_marker_text,var(--accent-fg,#ffffff))]"
                          : is_selected
                            ? "bg-[var(--aster-selected)] font-semibold text-txt-primary"
                            : is_current_month
                              ? "text-txt-primary group-hover/day:bg-[var(--aster-hover)]"
                              : "text-txt-muted group-hover/day:bg-[var(--aster-hover)]"
                      }`}
                    >
                      {day.getDate()}
                      {has_events && (
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none absolute bottom-[3px] left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full ${
                            is_today
                              ? "bg-[var(--accent-fg,#ffffff)]"
                              : "bg-[var(--accent-color)]"
                          } ${is_current_month ? "" : "opacity-50"}`}
                        />
                      )}
                    </span>
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});
