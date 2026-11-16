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
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { IslandDivider, IslandIconButton, Tooltip } from "@aster/ui";

import {
  add_days,
  add_months,
  build_month_grid,
  is_same_day,
  start_of_day,
  trim_month_grid,
} from "@/components/calendar/calendar_utils";
import { use_calendar_today } from "@/components/calendar/use_calendar_now_tick";
import { use_i18n } from "@/lib/i18n/context";

interface DatePickerProps {
  value: Date | null;
  week_start_day: number;
  autofocus?: boolean;
  class_name?: string;
  size?: "sm" | "md";
  show_today?: boolean;
  on_select: (date: Date) => void;
}

function month_anchor(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function is_same_month(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth()
  );
}

function days_in_month(anchor: Date): number {
  return new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
}

export function DatePicker({
  value,
  week_start_day,
  autofocus = false,
  class_name,
  size = "sm",
  show_today = true,
  on_select,
}: DatePickerProps) {
  const is_md = size === "md";
  const { t, language } = use_i18n();
  const grid_ref = useRef<HTMLDivElement>(null);
  const today = use_calendar_today();
  const selected = value ? start_of_day(value) : null;
  const [view_month, set_view_month] = useState(() =>
    month_anchor(selected ?? today),
  );
  const [focused_day, set_focused_day] = useState(() => selected ?? today);
  const [wants_focus, set_wants_focus] = useState(autofocus);

  const selected_key = selected?.getTime() ?? null;

  useEffect(() => {
    if (selected_key === null) {
      return;
    }

    const next = new Date(selected_key);

    set_view_month(month_anchor(next));
    set_focused_day(next);
  }, [selected_key]);

  useEffect(() => {
    if (!wants_focus) {
      return;
    }

    const target = grid_ref.current?.querySelector<HTMLButtonElement>(
      "button[tabindex='0']",
    );

    target?.focus();
    set_wants_focus(false);
  }, [wants_focus, focused_day, view_month]);

  const days = useMemo(
    () =>
      trim_month_grid(build_month_grid(view_month, week_start_day), view_month),
    [view_month, week_start_day],
  );

  const month_formatter = useMemo(
    () => new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }),
    [language],
  );
  const weekday_formatter = useMemo(
    () => new Intl.DateTimeFormat(language, { weekday: "short" }),
    [language],
  );
  const day_formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [language],
  );

  const weekday_labels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, offset) =>
        weekday_formatter.format(
          new Date(2024, 0, 7 + ((week_start_day + offset) % 7)),
        ),
      ),
    [weekday_formatter, week_start_day],
  );

  const move_focus = (next: Date) => {
    set_focused_day(next);

    if (!is_same_month(next, view_month)) {
      set_view_month(month_anchor(next));
    }

    set_wants_focus(true);
  };

  const shift_month = (delta: number) => {
    const next_month = add_months(view_month, delta);

    set_view_month(next_month);

    if (!is_same_month(focused_day, next_month)) {
      set_focused_day(
        new Date(
          next_month.getFullYear(),
          next_month.getMonth(),
          Math.min(focused_day.getDate(), days_in_month(next_month)),
        ),
      );
    }
  };

  const handle_grid_key = (pressed: ReactKeyboardEvent<HTMLDivElement>) => {
    const is_rtl = document.documentElement.dir === "rtl";
    const steps: Record<string, number> = {
      ArrowLeft: is_rtl ? 1 : -1,
      ArrowRight: is_rtl ? -1 : 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };

    if (pressed.key in steps) {
      pressed.preventDefault();
      move_focus(add_days(focused_day, steps[pressed.key]));

      return;
    }

    if (pressed.key === "PageUp" || pressed.key === "PageDown") {
      pressed.preventDefault();
      move_focus(add_months(focused_day, pressed.key === "PageUp" ? -1 : 1));

      return;
    }

    if (pressed.key === "Home" || pressed.key === "End") {
      pressed.preventDefault();

      const offset = (focused_day.getDay() - week_start_day + 7) % 7;

      move_focus(
        add_days(focused_day, pressed.key === "Home" ? -offset : 6 - offset),
      );
    }
  };

  const nav_button_class =
    "!h-7 !w-7 text-[var(--icon-secondary)] [&>svg]:!h-4 [&>svg]:!w-4";

  return (
    <div
      className={`flex flex-col ${is_md ? "w-full" : "w-[252px]"} ${class_name ?? ""}`}
    >
      <div
        className={`flex items-center justify-between ${is_md ? "h-9" : "h-8"}`}
      >
        <Tooltip tip={t("calendar.previous_month")}>
          <IslandIconButton
            className={nav_button_class}
            label={t("calendar.previous_month")}
            size="sm"
            onClick={() => shift_month(-1)}
          >
            <ChevronLeftIcon className="rtl:-scale-x-100" strokeWidth={1.75} />
          </IslandIconButton>
        </Tooltip>
        <span
          aria-live="polite"
          className={`font-semibold text-txt-primary ${is_md ? "text-[15px]" : "text-[13px]"}`}
        >
          {month_formatter.format(view_month)}
        </span>
        <Tooltip tip={t("calendar.next_month")}>
          <IslandIconButton
            className={nav_button_class}
            label={t("calendar.next_month")}
            size="sm"
            onClick={() => shift_month(1)}
          >
            <ChevronRightIcon className="rtl:-scale-x-100" strokeWidth={1.75} />
          </IslandIconButton>
        </Tooltip>
      </div>

      <div className="mt-1 grid grid-cols-7">
        {weekday_labels.map((label, index) => (
          <span
            key={index}
            aria-hidden="true"
            className={`flex items-center justify-center font-medium text-txt-muted ${
              is_md ? "h-8 text-[11px]" : "h-7 text-[10px] uppercase tracking-[0.05em] font-semibold"
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      <div
        ref={grid_ref}
        className="grid grid-cols-7 gap-y-0.5"
        onKeyDown={handle_grid_key}
      >
        {days.map((day) => {
          const is_today = is_same_day(day, today);
          const is_selected = selected !== null && is_same_day(day, selected);
          const is_focused = is_same_day(day, focused_day);
          const in_month = is_same_month(day, view_month);
          const tone = is_selected
            ? "rounded-full bg-[var(--aster-selected)] font-semibold text-txt-primary"
            : is_today
              ? "rounded-full bg-[var(--calendar_today_marker_bg,var(--accent-color))] font-semibold text-[var(--calendar_today_marker_text,var(--accent-fg,#ffffff))]"
              : in_month
                ? "rounded-full text-txt-primary group-hover/day:bg-[var(--aster-hover)]"
                : "rounded-full text-txt-muted group-hover/day:bg-[var(--aster-hover)]";

          return (
            <button
              key={day.getTime()}
              aria-current={is_today ? "date" : undefined}
              aria-label={day_formatter.format(day)}
              aria-pressed={is_selected}
              className={`group/day flex w-full items-center ${is_md ? "h-10" : "h-7"} justify-center focus:outline-none focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-inset focus-visible:[&>span]:ring-[var(--accent-color)]`}
              tabIndex={is_focused ? 0 : -1}
              type="button"
              onClick={() => on_select(day)}
              onFocus={() => set_focused_day(day)}
            >
              <span
                className={`flex items-center justify-center leading-none ${
                  is_md ? "h-9 w-9 text-[13px]" : "h-7 w-7 text-[12px]"
                } tabular-nums transition-colors duration-150 ${tone}`}
              >
                {day.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {show_today && <IslandDivider className="mt-1.5" />}
      {show_today && (
      <div className="mt-1.5 flex items-center justify-end">
        <button
          className="inline-flex items-center gap-1.5 rounded-[var(--aster-radius-item)] px-2 py-1.5 text-sm font-medium text-[var(--accent-color)] hover:bg-[var(--aster-island-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
          type="button"
          onClick={() => {
            set_view_month(month_anchor(today));
            set_focused_day(today);
            on_select(today);
          }}
        >
          {t("common.today")}
        </button>
      </div>
      )}
    </div>
  );
}
