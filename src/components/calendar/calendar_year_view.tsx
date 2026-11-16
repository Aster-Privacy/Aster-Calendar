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
import type { DecryptedCalendarEvent } from "@/types/calendar";

import { memo, useEffect, useMemo, useRef } from "react";

import {
  build_month_grid,
  build_year_months,
  is_same_day,
  start_of_day,
} from "@/components/calendar/calendar_utils";
import { calendar_now } from "@/services/calendar/view_zone";
import { use_calendar_today } from "@/components/calendar/use_calendar_now_tick";

const WEEKDAY_ANCHOR = new Date(2024, 0, 7);
const MAX_DENSITY_EVENTS = 4;

interface CalendarYearViewProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  anchor_date: Date;
  selected_date: Date;
  language: string;
  week_start_day: number;
  events: DecryptedCalendarEvent[];
  on_day_click: (day: Date) => void;
  on_month_click?: (month: Date) => void;
}

function day_key(day: Date): string {
  return `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
}

export const CalendarYearView = memo(function CalendarYearView({
  t,
  anchor_date,
  selected_date,
  language,
  week_start_day,
  events,
  on_day_click,
  on_month_click,
}: CalendarYearViewProps) {
  const months = useMemo(() => build_year_months(anchor_date), [anchor_date]);
  const scroll_ref = useRef<HTMLDivElement>(null);
  const anchor_year = anchor_date.getFullYear();

  useEffect(() => {
    const container = scroll_ref.current;

    if (!container) {
      return;
    }

    const now = calendar_now();

    if (anchor_year !== now.getFullYear()) {
      container.scrollTop = 0;

      return;
    }

    const target = container.querySelector<HTMLElement>(
      "[data-current-month='true']",
    );

    if (!target) {
      return;
    }

    const container_box = container.getBoundingClientRect();
    const target_box = target.getBoundingClientRect();

    if (target_box.bottom <= container_box.bottom) {
      container.scrollTop = 0;

      return;
    }

    const offset =
      target_box.top - container_box.top + container.scrollTop - 16;

    container.scrollTop = Math.max(0, offset);
  }, [anchor_year]);

  const day_label_formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [language],
  );

  const weekday_labels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(language, { weekday: "narrow" });

    return Array.from({ length: 7 }, (_, index) => {
      const offset = index + week_start_day;

      return formatter.format(
        new Date(
          WEEKDAY_ANCHOR.getFullYear(),
          WEEKDAY_ANCHOR.getMonth(),
          WEEKDAY_ANCHOR.getDate() + offset,
        ),
      );
    });
  }, [language, week_start_day]);

  const density_by_day = useMemo(() => {
    const counts = new Map<string, number>();

    for (const event of events) {
      const start = start_of_day(new Date(event.starts_at));
      const end = new Date(event.ends_at);

      if (Number.isNaN(start.getTime())) {
        continue;
      }

      const cursor = new Date(start);
      let guard = 0;

      while (cursor.getTime() < end.getTime() && guard < 400) {
        const key = day_key(cursor);

        counts.set(key, (counts.get(key) ?? 0) + 1);
        cursor.setDate(cursor.getDate() + 1);
        guard += 1;
      }

      if (guard === 0) {
        const key = day_key(start);

        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    return counts;
  }, [events]);

  const month_formatter = useMemo(
    () => new Intl.DateTimeFormat(language, { month: "long" }),
    [language],
  );

  const today = use_calendar_today();

  return (
    <div
      ref={scroll_ref}
      aria-label={t("calendar.year_view_label", {
        year: anchor_date.getFullYear(),
      })}
      className="h-full overflow-y-auto aster_scrollbar_thin px-4 pt-4 pb-10 sm:px-6"
      role="region"
    >
      <div className="mx-auto grid w-full max-w-[2200px] grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[1700px]:gap-x-12 min-[1700px]:gap-y-9">
        {months.map((month) => {
          const grid = build_month_grid(month, week_start_day);
          const is_current_month =
            month.getFullYear() === today.getFullYear() &&
            month.getMonth() === today.getMonth();

          return (
            <div
              key={month.getMonth()}
              className="flex flex-col gap-1"
              data-current-month={is_current_month ? "true" : undefined}
            >
              {on_month_click ? (
                <button
                  className="-ms-1 mb-1 self-start rounded-[var(--aster-radius-item,8px)] px-2 py-0.5 text-start text-[13px] font-semibold transition-colors duration-150 ease-out hover:bg-[var(--aster-hover)] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[color:var(--accent-color)]"
                  style={{
                    color: is_current_month
                      ? "var(--accent-color)"
                      : "var(--text-primary)",
                  }}
                  type="button"
                  onClick={() => on_month_click(month)}
                >
                  {month_formatter.format(month)}
                </button>
              ) : (
                <span
                  className="px-1 pb-1 text-[13px] font-semibold"
                  style={{
                    color: is_current_month
                      ? "var(--accent-color)"
                      : "var(--text-primary)",
                  }}
                >
                  {month_formatter.format(month)}
                </span>
              )}

              <div className="grid grid-cols-7 gap-y-0.5">
                {weekday_labels.map((label, index) => (
                  <span
                    key={`${label}-${index}`}
                    className="flex h-6 items-center justify-center text-[10.5px] font-medium text-txt-muted"
                  >
                    {label}
                  </span>
                ))}

                {grid.map((day) => {
                  const in_month = day.getMonth() === month.getMonth();
                  const is_today = is_same_day(day, today);
                  const is_selected = is_same_day(day, selected_date);
                  const density = Math.min(
                    density_by_day.get(day_key(day)) ?? 0,
                    MAX_DENSITY_EVENTS,
                  );

                  if (!in_month) {
                    return (
                      <span
                        key={day_key(day)}
                        aria-hidden="true"
                        className="h-7 min-[1700px]:h-8"
                      />
                    );
                  }

                  const is_past = day.getTime() < today.getTime();

                  return (
                    <span
                      key={day_key(day)}
                      className="flex h-7 items-center justify-center min-[1700px]:h-8"
                    >
                      <button
                        aria-current={is_today ? "date" : undefined}
                        aria-label={t("calendar.open_day", {
                          date: day_label_formatter.format(day),
                        })}
                        className="relative flex h-7 w-7 items-center justify-center rounded-full text-[12px] min-[1700px]:h-8 min-[1700px]:w-8 min-[1700px]:text-[13px] tabular-nums transition-colors duration-150 ease-out hover:bg-[var(--aster-hover)] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[color:var(--accent-color)]"
                        style={{
                          backgroundColor: is_today
                            ? "var(--calendar_today_marker_bg, var(--accent-color))"
                            : is_selected
                              ? "var(--indicator-bg)"
                              : undefined,
                          color: is_today
                            ? "var(--calendar_today_marker_text, var(--accent-fg, #ffffff))"
                            : is_selected
                              ? "var(--accent-color)"
                              : is_past
                                ? "var(--text-muted)"
                                : "var(--text-primary)",
                          fontWeight: is_today || is_selected ? 600 : 400,
                        }}
                        type="button"
                        onClick={() => on_day_click(day)}
                      >
                        {day.getDate()}
                        {density > 0 && (
                          <span
                            aria-hidden="true"
                            className="absolute bottom-[2px] left-1/2 h-[4px] -translate-x-1/2 rounded-full"
                            style={{
                              backgroundColor: is_today
                                ? "var(--accent-fg, #ffffff)"
                                : "var(--accent-color)",
                              opacity: is_today
                                ? 1
                                : Math.min(1, 0.7 + density * 0.1),
                              width: `${4 + density * 2}px`,
                            }}
                          />
                        )}
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
