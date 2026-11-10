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
import type { CalendarEventMenuActions } from "@/components/calendar/calendar_event_context_menu";
import type { TranslationKey } from "@/lib/i18n";
import type {
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { IslandIconButton, Tooltip } from "@aster/ui";

import { CalendarEventContextMenu } from "@/components/calendar/calendar_event_context_menu";
import { EventKindIcon } from "@/components/calendar/event_kind_icon";
import { use_event_tooltip } from "@/components/calendar/calendar_event_tooltip";
import {
  add_days,
  build_month_grid,
  events_for_day,
  start_of_day,
  format_alternate_day,
  task_title_class,
  is_same_day,
  is_weekend,
  iso_week_number,
  resolve_event_color,
  trim_month_grid,
  build_month_chip_style,
  event_color_token,
  event_occurrence_key,
} from "@/components/calendar/calendar_utils";
import { calendar_now } from "@/services/calendar/view_zone";
import { use_calendar_today } from "@/components/calendar/use_calendar_now_tick";
import { format_time } from "@/utils/date_format";
import { is_holiday_event } from "@/services/calendar/holidays";
import { is_birthday_event } from "@/services/calendar/birthdays";
import { is_subscription_event } from "@/services/calendar/subscriptions";
import { is_booking_event } from "@/services/calendar/appointments";

const MIN_ROW_HEIGHT_PX = 88;
const PHONE_ROW_HEIGHT_PX = 64;
const PHONE_DOT_LIMIT = 3;
const CELL_HEADER_PX = 36;
const CHIP_LINE_PX = 27;
const GRID_LINE_COLOR = "var(--calendar_grid_line)";

const WEEKDAY_KEYS: TranslationKey[] = [
  "calendar.weekday_sun",
  "calendar.weekday_mon",
  "calendar.weekday_tue",
  "calendar.weekday_wed",
  "calendar.weekday_thu",
  "calendar.weekday_fri",
  "calendar.weekday_sat",
];

const MONTH_SHORT_KEYS: TranslationKey[] = [
  "calendar.month_short_jan",
  "calendar.month_short_feb",
  "calendar.month_short_mar",
  "calendar.month_short_apr",
  "calendar.month_short_may",
  "calendar.month_short_jun",
  "calendar.month_short_jul",
  "calendar.month_short_aug",
  "calendar.month_short_sep",
  "calendar.month_short_oct",
  "calendar.month_short_nov",
  "calendar.month_short_dec",
];

function compact_time(date: Date, time_format: "12h" | "24h"): string {
  const compact = format_time(date, { date_format: "MM/DD/YYYY", time_format })
    .replace(" ", "")
    .toLowerCase();

  return time_format === "12h" ? compact.replace(":00", "") : compact;
}

function visible_event_count(total: number, max_per_cell: number): number {
  return total === max_per_cell + 1 ? total : max_per_cell;
}

const DRAG_THRESHOLD_PX = 4;
const DROP_OUTLINE = "1px solid var(--accent-color)";
const WHEEL_NAVIGATE_THRESHOLD = 120;
const WHEEL_LOCKOUT_MS = 400;
const DAY_MS = 86_400_000;

interface ChipDragState {
  event: DecryptedCalendarEvent;
  frame: number;
  ghost: HTMLElement | null;
  is_active: boolean;
  offset_x: number;
  offset_y: number;
  origin_key: string;
  grab_day: Date;
  pointer_x: number;
  pointer_y: number;
  source: HTMLElement;
  start_x: number;
  start_y: number;
  target_cell: HTMLElement | null;
}

function mark_drop_target(cell: HTMLElement | null, origin_key: string) {
  if (!cell || cell.getAttribute("data-day-key") === origin_key) {
    return;
  }

  cell.style.outline = DROP_OUTLINE;
  cell.style.outlineOffset = "-1px";
}

function clear_drop_target(cell: HTMLElement | null) {
  if (!cell) {
    return;
  }

  cell.style.outline = "";
  cell.style.outlineOffset = "";
}

function activate_chip_drag(drag: ChipDragState) {
  const bounds = drag.source.getBoundingClientRect();

  drag.is_active = true;
  drag.offset_x = drag.start_x - bounds.left;
  drag.offset_y = drag.start_y - bounds.top;

  const clone = drag.source.cloneNode(true) as HTMLElement;

  clone.removeAttribute("data-event-id");
  clone.style.width = "100%";
  clone.style.height = "100%";
  clone.style.margin = "0";
  clone.style.transition = "none";
  clone.style.opacity = "0.9";

  const ghost = document.createElement("div");

  ghost.setAttribute("data-calendar-surface", "");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.position = "fixed";
  ghost.style.top = "0";
  ghost.style.left = "0";
  ghost.style.width = `${bounds.width}px`;
  ghost.style.height = `${bounds.height}px`;
  ghost.style.zIndex = "70";
  ghost.style.pointerEvents = "none";
  ghost.style.willChange = "transform";
  ghost.style.transform = `translate3d(${bounds.left}px, ${bounds.top}px, 0)`;
  ghost.appendChild(clone);

  document.body.appendChild(ghost);

  drag.ghost = ghost;
  drag.source.style.transition = "none";
  drag.source.style.opacity = "0.4";
  document.body.style.cursor = "grabbing";
  document.body.style.userSelect = "none";
}

function end_chip_drag(drag: ChipDragState) {
  if (drag.frame !== 0) {
    window.cancelAnimationFrame(drag.frame);
    drag.frame = 0;
  }

  drag.ghost?.remove();
  drag.ghost = null;
  clear_drop_target(drag.target_cell);
  drag.target_cell = null;

  if (drag.is_active) {
    drag.source.style.opacity = "";
    drag.source.style.transition = "";
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }
}

interface MonthChipApi {
  actions: CalendarEventMenuActions;
  bind_tooltip: (event: DecryptedCalendarEvent) => Record<string, unknown>;
  chip_pointer_down: (
    pointer: React.PointerEvent<HTMLElement>,
    event: DecryptedCalendarEvent,
  ) => void;
  did_drag: () => boolean;
  on_event_click: (event: DecryptedCalendarEvent) => void;
  open_overflow: (target: {
    day: Date;
    left: number;
    top: number;
    width: number;
  }) => void;
}

interface MonthDayChipsProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  api: MonthChipApi;
  day: Date;
  day_events: DecryptedCalendarEvent[];
  shown_count: number;
  active_event_id: string | null;
  calendar_by_id: Map<string, DecryptedCalendar>;
  calendars: DecryptedCalendar[];
  time_format: "12h" | "24h";
  dim_past_events: boolean;
}

const MonthDayChips = memo(function MonthDayChips({
  t,
  api,
  day,
  day_events,
  shown_count,
  active_event_id,
  calendar_by_id,
  calendars,
  time_format,
  dim_past_events,
}: MonthDayChipsProps) {
  const overflow_count = day_events.length - shown_count;

  return (
    <div className="@container relative flex-1 min-h-0 flex flex-col gap-[3px] overflow-hidden">
      {day_events.slice(0, shown_count).map((event) => {
        const calendar = calendar_by_id.get(event.calendar_id);
        const color = resolve_event_color(event, calendar?.color);
        const is_active = event_occurrence_key(event) === active_event_id;

        return (
          <CalendarEventContextMenu
            actions={api.actions}
            calendars={calendars}
            event={event}
            key={event.id}
            t={t}
          >
            <button
              data-event-id={event.id}
              data-event-block=""
              data-chip-row={event.is_all_day ? undefined : ""}
              className={`w-full flex touch-none select-none items-center gap-2 ps-2 pe-2 h-6 text-[12px] leading-[1.4] overflow-hidden xl:text-[12.5px] max-sm:text-[11px] max-sm:gap-1 ${event.is_all_day ? "" : "hover:bg-[var(--aster-hover)]"} focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--accent-color)] ${
                event.is_all_day ? "font-medium" : ""
              }`}
              style={build_month_chip_style(color, {
                is_active,
                is_all_day: event.is_all_day,
                is_past:
                  dim_past_events &&
                  !is_active &&
                  new Date(event.ends_at).getTime() < calendar_now().getTime(),
              })}
              aria-label={
                event.is_all_day
                  ? t("calendar.a11y_all_day_event_chip", {
                      calendar: calendar?.name ?? "",
                      title: event.title || t("calendar.untitled_event"),
                    })
                  : t("calendar.a11y_timed_event_chip", {
                      calendar: calendar?.name ?? "",
                      time: compact_time(
                        new Date(event.starts_at),
                        time_format,
                      ),
                      title: event.title || t("calendar.untitled_event"),
                    })
              }
              {...(is_active ? {} : api.bind_tooltip(event))}
              type="button"
              onClick={(e) => {
                e.stopPropagation();

                if (api.did_drag()) {
                  return;
                }

                api.on_event_click(event);
              }}
              onPointerDown={(pointed) => api.chip_pointer_down(pointed, event)}
              onDoubleClick={(dbl) => {
                dbl.stopPropagation();
                api.actions.on_edit(event);
              }}
            >
              {!event.is_all_day && (
                <span
                  aria-hidden="true"
                  className="h-2 w-2 flex-shrink-0 rounded-full max-sm:h-1.5 max-sm:w-1.5"
                  style={{ backgroundColor: "var(--cal_color)" }}
                />
              )}
              <EventKindIcon kind={event.event_kind} />
              {!event.is_all_day && (
                <span
                  className="tabular-nums flex-shrink-0 text-txt-muted max-md:hidden @[208px]:hidden"
                  dir="ltr"
                >
                  {compact_time(new Date(event.starts_at), time_format)}
                </span>
              )}
              <span
                className={`flex-1 truncate min-w-0 text-start max-sm:[text-overflow:clip]${event.is_all_day ? "" : " font-medium"}${task_title_class(event)}`}
              >
                {event.title || t("calendar.untitled_event")}
              </span>
              {!event.is_all_day && (
                <span
                  className="hidden tabular-nums flex-shrink-0 text-[11.5px] text-txt-muted xl:text-[12px] @[208px]:inline"
                  dir="ltr"
                >
                  {compact_time(new Date(event.starts_at), time_format)}
                </span>
              )}
            </button>
          </CalendarEventContextMenu>
        );
      })}

      {overflow_count > 0 && (
        <button
          className="w-full text-start ps-2 pe-1.5 h-5 rounded-[var(--calendar_event_radius,6px)] text-[11.5px] font-medium leading-none flex items-center text-txt-muted xl:h-6 xl:text-[12.5px] transition-colors duration-150 ease-out hover:bg-[var(--aster-hover)] hover:text-txt-primary focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--accent-color)] focus-visible:bg-[var(--bg-hover)]"
          type="button"
          onClick={(e) => {
            e.stopPropagation();

            const cell = e.currentTarget.closest("[data-month-cell]");
            const bounds = (cell ?? e.currentTarget).getBoundingClientRect();
            const width = Math.min(
              Math.max(bounds.width + 24, 248),
              320,
              window.innerWidth - 16,
            );

            api.open_overflow({
              day,
              left: Math.max(
                8,
                Math.min(
                  bounds.left + bounds.width / 2 - width / 2,
                  window.innerWidth - width - 8,
                ),
              ),
              top: Math.max(
                8,
                Math.min(bounds.top - 8, window.innerHeight - 240),
              ),
              width,
            });
          }}
        >
          {t("calendar.more_events", { count: overflow_count })}
        </button>
      )}
    </div>
  );
});

interface CalendarMonthViewProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  anchor_date: Date;
  selected_date: Date;
  week_start_day: number;
  events: DecryptedCalendarEvent[];
  calendar_by_id: Map<string, DecryptedCalendar>;
  calendars: DecryptedCalendar[];
  event_menu_actions: CalendarEventMenuActions;
  time_format: "12h" | "24h";
  selected_event_id: string | null;
  show_weekends: boolean;
  show_week_numbers: boolean;
  alternate_calendar: string;
  language: string;
  max_events_per_cell: number;
  is_phone: boolean;
  draft_day: Date | null;
  on_day_click: (day: Date) => void;
  on_day_number_click: (day: Date) => void;
  on_day_double_click: (day: Date) => void;
  on_week_number_click: (day: Date) => void;
  on_event_click: (event: DecryptedCalendarEvent) => void;
  on_event_move_day: (event: DecryptedCalendarEvent, target_day: Date) => void;
  on_wheel_navigate: (direction: 1 | -1) => void;
  on_range_select: (start: Date, end: Date, is_all_day: boolean) => void;
  default_duration_minutes: number;
  dim_past_events?: boolean;
}

export const CalendarMonthView = memo(function CalendarMonthView({
  t,
  anchor_date,
  selected_date,
  week_start_day,
  events,
  calendar_by_id,
  calendars,
  event_menu_actions,
  time_format,
  selected_event_id,
  show_weekends,
  show_week_numbers,
  alternate_calendar,
  language,
  max_events_per_cell,
  is_phone,
  draft_day,
  on_day_click,
  on_day_number_click,
  on_day_double_click,
  on_week_number_click,
  on_event_click,
  on_event_move_day,
  on_wheel_navigate,
  on_range_select,
  default_duration_minutes,
  dim_past_events = false,
}: CalendarMonthViewProps) {
  const [overflow_day, set_overflow_day] = useState<{
    day: Date;
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const chip_drag_ref = useRef<ChipDragState | null>(null);
  const hide_tooltip_ref = useRef<() => void>(() => {});
  const did_drag_ref = useRef(false);
  const wheel_lock_ref = useRef(0);
  const wheel_delta_ref = useRef(0);
  const on_event_move_day_ref = useRef(on_event_move_day);
  const overflow_return_focus_ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    on_event_move_day_ref.current = on_event_move_day;
  }, [on_event_move_day]);
  const grid_scroll_ref = useRef<HTMLDivElement | null>(null);
  const [grid_height, set_grid_height] = useState(0);
  const [range_drag, set_range_drag] = useState<{
    anchor: number;
    current: number;
  } | null>(null);
  const range_drag_cleanup_ref = useRef<(() => void) | null>(null);
  const suppress_cell_click_ref = useRef(false);

  useEffect(() => () => range_drag_cleanup_ref.current?.(), []);

  useEffect(() => {
    const node = grid_scroll_ref.current;

    if (!node) {
      return;
    }

    const measure = () => set_grid_height(node.clientHeight);

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const paint = () => {
      const drag = chip_drag_ref.current;

      if (!drag) {
        return;
      }

      drag.frame = 0;

      if (!drag.is_active) {
        return;
      }

      if (drag.ghost) {
        drag.ghost.style.transform = `translate3d(${drag.pointer_x - drag.offset_x}px, ${drag.pointer_y - drag.offset_y}px, 0)`;
      }

      const cell =
        document
          .elementFromPoint(drag.pointer_x, drag.pointer_y)
          ?.closest<HTMLElement>("[data-month-cell]") ?? null;

      if (cell !== drag.target_cell) {
        clear_drop_target(drag.target_cell);
        drag.target_cell = cell;
        mark_drop_target(cell, drag.origin_key);
      }
    };

    const request_paint = () => {
      const drag = chip_drag_ref.current;

      if (!drag || drag.frame !== 0) {
        return;
      }

      drag.frame = window.requestAnimationFrame(paint);
    };

    const handle_move = (pointer: PointerEvent) => {
      const drag = chip_drag_ref.current;

      if (!drag) {
        return;
      }

      drag.pointer_x = pointer.clientX;
      drag.pointer_y = pointer.clientY;

      if (!drag.is_active) {
        if (
          Math.hypot(
            pointer.clientX - drag.start_x,
            pointer.clientY - drag.start_y,
          ) < DRAG_THRESHOLD_PX
        ) {
          return;
        }

        activate_chip_drag(drag);
        did_drag_ref.current = true;
        hide_tooltip_ref.current();
      }

      pointer.preventDefault();
      request_paint();
    };

    const handle_up = (pointer: PointerEvent) => {
      const drag = chip_drag_ref.current;

      chip_drag_ref.current = null;

      if (!drag) {
        return;
      }

      const was_active = drag.is_active;

      end_chip_drag(drag);

      if (!was_active) {
        return;
      }

      const day_key = document
        .elementFromPoint(pointer.clientX, pointer.clientY)
        ?.closest("[data-month-cell]")
        ?.getAttribute("data-day-key");

      if (day_key && day_key !== drag.origin_key) {
        const delta_days = Math.round(
          (start_of_day(new Date(day_key)).getTime() -
            start_of_day(drag.grab_day).getTime()) /
            DAY_MS,
        );

        if (delta_days !== 0) {
          on_event_move_day_ref.current(
            drag.event,
            add_days(start_of_day(new Date(drag.event.starts_at)), delta_days),
          );
        }
      }

      window.setTimeout(() => {
        did_drag_ref.current = false;
      }, 0);
    };

    const handle_cancel = () => {
      const drag = chip_drag_ref.current;

      chip_drag_ref.current = null;

      if (drag) {
        end_chip_drag(drag);
        did_drag_ref.current = false;
      }
    };

    window.addEventListener("pointermove", handle_move, { passive: false });
    window.addEventListener("pointerup", handle_up);
    window.addEventListener("pointercancel", handle_cancel);

    return () => {
      window.removeEventListener("pointermove", handle_move);
      window.removeEventListener("pointerup", handle_up);
      window.removeEventListener("pointercancel", handle_cancel);
      handle_cancel();
    };
  }, []);

  const chip_pointer_down = (
    pointer: React.PointerEvent<HTMLElement>,
    event: DecryptedCalendarEvent,
  ) => {
    if (
      pointer.button !== 0 ||
      is_holiday_event(event) ||
      is_birthday_event(event) ||
      is_subscription_event(event) ||
      is_booking_event(event)
    ) {
      return;
    }

    const grab_key =
      pointer.currentTarget
        .closest("[data-month-cell]")
        ?.getAttribute("data-day-key") ??
      new Date(event.starts_at).toDateString();

    chip_drag_ref.current = {
      event,
      frame: 0,
      ghost: null,
      is_active: false,
      offset_x: 0,
      offset_y: 0,
      origin_key: grab_key,
      grab_day: new Date(grab_key),
      pointer_x: pointer.clientX,
      pointer_y: pointer.clientY,
      source: pointer.currentTarget,
      start_x: pointer.clientX,
      start_y: pointer.clientY,
      target_cell: null,
    };
  };
  const overflow_ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!overflow_day) {
      return;
    }

    const handle_down = (pointer: MouseEvent | TouchEvent) => {
      const target = pointer.target as Node | null;

      if (target && overflow_ref.current?.contains(target)) {
        return;
      }

      set_overflow_day(null);
    };

    const handle_key = (key_event: KeyboardEvent) => {
      if (key_event.key === "Escape") {
        key_event.stopPropagation();
        set_overflow_day(null);
      }
    };

    const first_focusable =
      overflow_ref.current?.querySelector<HTMLElement>("[data-event-block]") ??
      overflow_ref.current?.querySelector<HTMLElement>("button");

    first_focusable?.focus();

    window.addEventListener("mousedown", handle_down);
    window.addEventListener("touchstart", handle_down, { passive: true });
    window.addEventListener("keydown", handle_key, true);

    return () => {
      window.removeEventListener("mousedown", handle_down);
      window.removeEventListener("touchstart", handle_down);
      window.removeEventListener("keydown", handle_key, true);

      const return_target = overflow_return_focus_ref.current;

      overflow_return_focus_ref.current = null;

      if (return_target?.isConnected) {
        return_target.focus();
      }
    };
  }, [overflow_day]);

  const anchor_key = `${anchor_date.getFullYear()}-${anchor_date.getMonth()}`;
  const grid = useMemo(() => {
    const full = trim_month_grid(
      build_month_grid(anchor_date, week_start_day),
      anchor_date,
    );

    return show_weekends ? full : full.filter((day) => !is_weekend(day));
  }, [anchor_key, week_start_day, show_weekends]);
  const events_by_day = useMemo(() => {
    const grouped = new Map<string, DecryptedCalendarEvent[]>();

    for (const day of grid) {
      grouped.set(day.toDateString(), events_for_day(events, day));
    }

    return grouped;
  }, [grid, events]);
  const today = use_calendar_today();
  const anchor_month = anchor_date.getMonth();

  const weekday_order = Array.from(
    { length: 7 },
    (_, index) => (index + week_start_day) % 7,
  );
  const visible_weekdays = show_weekends
    ? weekday_order
    : weekday_order.filter((day) => day !== 0 && day !== 6);
  const weekday_keys: TranslationKey[] = visible_weekdays.map(
    (day) => WEEKDAY_KEYS[day],
  );
  const column_count = visible_weekdays.length;

  const today_column = grid.some((day) => is_same_day(day, today))
    ? visible_weekdays.indexOf(today.getDay())
    : -1;

  const handle_wheel = (wheel: React.WheelEvent) => {
    if (overflow_day || chip_drag_ref.current) {
      return;
    }

    const now = Date.now();

    if (now - wheel_lock_ref.current < WHEEL_LOCKOUT_MS) {
      wheel_delta_ref.current = 0;

      return;
    }

    if (
      wheel_delta_ref.current !== 0 &&
      Math.sign(wheel_delta_ref.current) !== Math.sign(wheel.deltaY)
    ) {
      wheel_delta_ref.current = 0;
    }

    wheel_delta_ref.current += wheel.deltaY;

    if (Math.abs(wheel_delta_ref.current) < WHEEL_NAVIGATE_THRESHOLD) {
      return;
    }

    const direction = wheel_delta_ref.current > 0 ? 1 : -1;

    wheel_delta_ref.current = 0;
    wheel_lock_ref.current = now;
    on_wheel_navigate(direction);
  };

  const event_tooltip = use_event_tooltip();

  hide_tooltip_ref.current = event_tooltip.hide;

  const tooltip_content_of = (event: DecryptedCalendarEvent) => ({
    calendar: calendar_by_id.get(event.calendar_id)?.name,
    location: event.location,
    time: event.is_all_day
      ? t("calendar.all_day")
      : `${compact_time(new Date(event.starts_at), time_format)} - ${compact_time(new Date(event.ends_at), time_format)}`,
    title: event.title || t("calendar.untitled_event"),
  });

  const chip_latest_ref = useRef({
    bind_tooltip: (event: DecryptedCalendarEvent) =>
      event_tooltip.bind(tooltip_content_of(event)) as Record<string, unknown>,
    chip_pointer_down,
    event_menu_actions,
    on_event_click,
  });

  chip_latest_ref.current = {
    bind_tooltip: (event: DecryptedCalendarEvent) =>
      event_tooltip.bind(tooltip_content_of(event)) as Record<string, unknown>,
    chip_pointer_down,
    event_menu_actions,
    on_event_click,
  };

  const chip_api = useMemo<MonthChipApi>(
    () => ({
      actions: {
        on_copy_link: (event) =>
          chip_latest_ref.current.event_menu_actions.on_copy_link(event),
        on_delete_request: (event) =>
          chip_latest_ref.current.event_menu_actions.on_delete_request(event),
        on_duplicate: (event) =>
          chip_latest_ref.current.event_menu_actions.on_duplicate(event),
        on_edit: (event) =>
          chip_latest_ref.current.event_menu_actions.on_edit(event),
        on_move_to_calendar: (event, calendar_id) =>
          chip_latest_ref.current.event_menu_actions.on_move_to_calendar(
            event,
            calendar_id,
          ),
        on_open: (event) =>
          chip_latest_ref.current.event_menu_actions.on_open(event),
        on_set_color: (event, color) =>
          chip_latest_ref.current.event_menu_actions.on_set_color(event, color),
        on_toggle_task_done: (event) =>
          chip_latest_ref.current.event_menu_actions.on_toggle_task_done(event),
      },
      bind_tooltip: (event) => chip_latest_ref.current.bind_tooltip(event),
      chip_pointer_down: (pointer, event) =>
        chip_latest_ref.current.chip_pointer_down(pointer, event),
      did_drag: () => did_drag_ref.current,
      on_event_click: (event) => chip_latest_ref.current.on_event_click(event),
      open_overflow: (target) => {
        overflow_return_focus_ref.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        set_overflow_day(target);
      },
    }),
    [],
  );

  const day_label_format = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        day: "numeric",
        month: "long",
        weekday: "long",
        year: "numeric",
      }),
    [language],
  );
  const overflow_title_id = "calendar-month-overflow-title";
  const overflow_is_today =
    overflow_day !== null && is_same_day(overflow_day.day, calendar_now());
  const row_count = Math.max(1, Math.ceil(grid.length / column_count));
  const row_height = Math.max(MIN_ROW_HEIGHT_PX, grid_height / row_count);
  const fitted_lines = Math.floor(
    (row_height - CELL_HEADER_PX + 3) / CHIP_LINE_PX,
  );
  const start_range_drag = (
    pointed: React.PointerEvent<HTMLDivElement>,
    anchor_index: number,
  ) => {
    suppress_cell_click_ref.current = false;

    if (
      is_phone ||
      pointed.button !== 0 ||
      pointed.pointerType === "touch" ||
      (pointed.target as HTMLElement).closest("button, a, input, textarea")
    ) {
      return;
    }

    range_drag_cleanup_ref.current?.();

    let current_index = anchor_index;

    const handle_move = (moved: PointerEvent) => {
      const cell = document
        .elementFromPoint(moved.clientX, moved.clientY)
        ?.closest<HTMLElement>("[data-month-index]");
      const next_index = cell ? Number(cell.dataset.monthIndex) : NaN;

      if (Number.isNaN(next_index) || next_index === current_index) {
        return;
      }

      current_index = next_index;
      window.getSelection()?.removeAllRanges();
      set_range_drag({ anchor: anchor_index, current: next_index });
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handle_move);
      window.removeEventListener("pointerup", handle_up);
      window.removeEventListener("pointercancel", cleanup);
      window.removeEventListener("keydown", handle_key);
      range_drag_cleanup_ref.current = null;
      set_range_drag(null);
    };

    const handle_key = (pressed: KeyboardEvent) => {
      if (pressed.key === "Escape") {
        cleanup();
      }
    };

    const handle_up = () => {
      cleanup();

      if (current_index === anchor_index) {
        return;
      }

      const low = grid[Math.min(anchor_index, current_index)];
      const high = grid[Math.max(anchor_index, current_index)];

      if (!low || !high) {
        return;
      }

      suppress_cell_click_ref.current = true;

      const start = new Date(low);

      start.setHours(0, 0, 0, 0);

      const end = new Date(high);

      end.setHours(23, 59, 0, 0);

      on_day_click(low);
      on_range_select(start, end, true);
    };

    window.addEventListener("pointermove", handle_move);
    window.addEventListener("pointerup", handle_up);
    window.addEventListener("pointercancel", cleanup);
    window.addEventListener("keydown", handle_key);
    range_drag_cleanup_ref.current = cleanup;
  };

  const fitted_max_events =
    grid_height > 0
      ? Math.max(1, Math.min(max_events_per_cell, fitted_lines - 1))
      : max_events_per_cell;

  return (
    <div
      className="flex flex-col h-full min-h-0 bg-[var(--bg-primary)]"
      onWheel={handle_wheel}
    >
      {event_tooltip.element}
      <div
        className="grid flex-shrink-0"
        style={{
          gridTemplateColumns: `repeat(${column_count}, minmax(0, 1fr))`,
        }}
      >
        {weekday_keys.map((key, index) => (
          <div
            key={key}
            className="flex h-6 items-end justify-center px-1 text-[11px] font-medium uppercase leading-none tracking-[0.04em] max-sm:text-[10px]"
            style={{
              borderLeft:
                index === 0 ? undefined : `1px solid ${GRID_LINE_COLOR}`,
              color:
                index === today_column
                  ? "var(--calendar_accent_text, var(--accent-color))"
                  : "var(--text-muted)",
            }}
          >
            {t(key)}
          </div>
        ))}
      </div>

      <div ref={grid_scroll_ref} className="flex-1 min-h-0 overflow-auto">
        <div
          className="grid h-full"
          style={{
            gridAutoRows: `minmax(${is_phone ? PHONE_ROW_HEIGHT_PX : MIN_ROW_HEIGHT_PX}px, 1fr)`,
            gridTemplateColumns: `repeat(${column_count}, minmax(0, 1fr))`,
          }}
        >
          {grid.map((day, index) => {
            const day_events = events_by_day.get(day.toDateString()) ?? [];
            const is_current_month = day.getMonth() === anchor_month;
            const is_today = is_same_day(day, today);
            const is_selected = is_same_day(day, selected_date);
            const shown_count = visible_event_count(
              day_events.length,
              fitted_max_events,
            );
            const is_last_row = index >= grid.length - column_count;
            const is_month_start = day.getDate() === 1;
            const alternate_day = format_alternate_day(
              day,
              alternate_calendar,
              language,
            );

            const is_in_range_drag =
              range_drag !== null &&
              range_drag.anchor !== range_drag.current &&
              index >= Math.min(range_drag.anchor, range_drag.current) &&
              index <= Math.max(range_drag.anchor, range_drag.current);

            return (
              <div
                key={day.toISOString()}
                data-month-cell=""
                data-month-index={index}
                data-day-key={day.toDateString()}
                data-cell-hover-target=""
                className={`group/cell relative px-1.5 pb-1.5 min-h-0 flex flex-col cursor-pointer max-sm:px-0.5${
                  is_last_row ? "" : " border-b"
                }`}
                style={{
                  backgroundColor: is_in_range_drag
                    ? "var(--indicator-bg)"
                    : undefined,
                  borderBottomColor: is_last_row ? undefined : GRID_LINE_COLOR,
                  borderLeft:
                    index % column_count === 0
                      ? undefined
                      : `1px solid ${GRID_LINE_COLOR}`,
                }}
                data-quick-anchor={
                  draft_day && is_same_day(day, draft_day) ? "true" : undefined
                }
                onPointerDown={(pointed) => start_range_drag(pointed, index)}
                onClick={(clicked) => {
                  if (!clicked.currentTarget.contains(clicked.target as Node)) {
                    return;
                  }

                  if (suppress_cell_click_ref.current) {
                    suppress_cell_click_ref.current = false;

                    return;
                  }

                  if (is_phone) {
                    on_day_number_click(day);

                    return;
                  }

                  on_day_click(day);

                  const now = calendar_now();
                  const start = new Date(day);

                  if (is_same_day(day, now)) {
                    start.setHours(now.getHours(), 0, 0, 0);
                  } else {
                    start.setHours(9, 0, 0, 0);
                  }

                  const end = new Date(
                    start.getTime() + default_duration_minutes * 60_000,
                  );

                  on_range_select(start, end, false);
                }}
                onDoubleClick={() => on_day_double_click(day)}
              >
                {show_week_numbers && index % column_count === 0 && (
                  <button
                    aria-label={t("calendar.open_week_number", {
                      number: iso_week_number(day),
                    })}
                    className="absolute left-1 top-1 z-[3] inline-flex h-5 cursor-pointer items-center rounded-[var(--aster-island-radius-inner,6px)] px-1 text-[10px] font-medium tabular-nums text-txt-muted transition-colors duration-150 hover:bg-[var(--aster-hover)] hover:text-txt-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                    data-testid="calendar-week-number"
                    type="button"
                    onClick={(clicked) => {
                      clicked.stopPropagation();
                      on_week_number_click(day);
                    }}
                    onDoubleClick={(dbl) => dbl.stopPropagation()}
                    onPointerDown={(pointed) => pointed.stopPropagation()}
                  >
                    {t("calendar.week_number_short", {
                      number: iso_week_number(day),
                    })}
                  </button>
                )}

                <div className="relative flex flex-shrink-0 items-center justify-center gap-1.5 pt-1 pb-0.5">
                  <button
                    aria-current={is_today ? "date" : undefined}
                    aria-label={day_label_format.format(day)}
                    data-selected={is_selected ? "" : undefined}
                    className={`inline-flex h-6 items-center justify-center gap-1 rounded-full ${is_month_start ? "px-2" : "min-w-6 px-1"} text-[12px] leading-none tabular-nums transition-[background-color,color] duration-150 ease-out focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-color)] max-sm:text-[12px] ${is_today ? "" : "hover:bg-[var(--aster-hover)]"}`}
                    style={{
                      backgroundColor: is_today
                        ? "var(--calendar_today_marker_bg, var(--accent-color))"
                        : undefined,
                      color: is_today
                        ? "var(--calendar_today_marker_text, var(--accent-fg, #ffffff))"
                        : is_current_month
                          ? "color-mix(in srgb, var(--text-primary) 82%, transparent)"
                          : "color-mix(in srgb, var(--text-primary) 58%, transparent)",
                      fontWeight: is_today || is_month_start ? 500 : 400,
                    }}
                    type="button"
                    onClick={(clicked) => {
                      clicked.stopPropagation();
                      on_day_number_click(day);
                    }}
                  >
                    {is_month_start && (
                      <span>{t(MONTH_SHORT_KEYS[day.getMonth()])}</span>
                    )}
                    <span>{day.getDate()}</span>
                  </button>
                  {alternate_day !== "" && (
                    <span className="text-[10px] leading-none tabular-nums text-txt-muted">
                      {alternate_day}
                    </span>
                  )}
                </div>

                {is_phone ? (
                  <div
                    className="flex flex-shrink-0 items-center justify-center gap-1 pb-1"
                    data-month-dots=""
                  >
                    {day_events.slice(0, PHONE_DOT_LIMIT).map((event) => {
                      const calendar = calendar_by_id.get(event.calendar_id);

                      return (
                        <span
                          key={`${event.id}-${event.starts_at}`}
                          aria-hidden="true"
                          className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                          style={{
                            backgroundColor: event_color_token(
                              resolve_event_color(event, calendar?.color),
                            ),
                          }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <MonthDayChips
                    active_event_id={
                      selected_event_id !== null &&
                      day_events.some(
                        (event) =>
                          event_occurrence_key(event) === selected_event_id,
                      )
                        ? selected_event_id
                        : null
                    }
                    api={chip_api}
                    calendar_by_id={calendar_by_id}
                    dim_past_events={dim_past_events}
                    calendars={calendars}
                    day={day}
                    day_events={day_events}
                    shown_count={shown_count}
                    t={t}
                    time_format={time_format}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {overflow_day &&
        createPortal(
          <div
            ref={overflow_ref}
            className="aster_floating aster_floating_anim fixed z-[60] flex flex-col overflow-hidden"
            data-calendar-surface=""
            aria-labelledby={overflow_title_id}
            data-state="open"
            role="dialog"
            style={{
              left: overflow_day.left,
              top: overflow_day.top,
              width: overflow_day.width,
              maxHeight: Math.min(
                440,
                window.innerHeight - overflow_day.top - 8,
              ),
            }}
          >
            <div className="relative flex flex-shrink-0 flex-col items-center gap-1 px-10 pt-3 pb-2">
              <span
                aria-hidden="true"
                className="text-[11px] font-medium uppercase tracking-[0.06em] text-txt-muted"
              >
                {new Intl.DateTimeFormat(language, {
                  weekday: "short",
                }).format(overflow_day.day)}
              </span>
              <button
                aria-current={overflow_is_today ? "date" : undefined}
                aria-label={day_label_format.format(overflow_day.day)}
                className={`flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-[22px] leading-none tabular-nums focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-color)] ${
                  overflow_is_today
                    ? "bg-[var(--accent-color)] font-medium text-white"
                    : "text-txt-primary hover:bg-[var(--aster-hover)]"
                }`}
                id={overflow_title_id}
                type="button"
                onClick={() => {
                  const day = overflow_day.day;

                  set_overflow_day(null);
                  on_day_number_click(day);
                }}
              >
                {new Intl.DateTimeFormat(language, {
                  day: "numeric",
                }).format(overflow_day.day)}
              </button>
              <div className="absolute end-1.5 top-1.5">
                <Tooltip tip={t("common.close")}>
                  <IslandIconButton
                    className="text-txt-muted"
                    label={t("common.close")}
                    size="sm"
                    onClick={() => set_overflow_day(null)}
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </IslandIconButton>
                </Tooltip>
              </div>
            </div>
            <div className="flex min-h-0 flex-col gap-[3px] overflow-y-auto aster_scrollbar_thin px-2 pb-2">
              {(events_by_day.get(overflow_day.day.toDateString()) ?? []).map(
                (event) => {
                  const calendar = calendar_by_id.get(event.calendar_id);
                  const color = resolve_event_color(event, calendar?.color);
                  const is_active =
                    event_occurrence_key(event) === selected_event_id;

                  return (
                    <button
                      key={`${event.id}-${event.starts_at}`}
                      data-event-id={event.id}
                      data-event-block=""
                      data-chip-row={event.is_all_day ? undefined : ""}
                      className={`w-full flex flex-shrink-0 items-center gap-2 ps-2 pe-2 h-7 text-[13px] leading-[1.4] overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--accent-color)] ${
                        event.is_all_day ? "font-medium" : ""
                      }`}
                      style={build_month_chip_style(color, {
                        is_active,
                        is_all_day: event.is_all_day,
                        is_past:
                          dim_past_events &&
                          !is_active &&
                          new Date(event.ends_at).getTime() <
                            calendar_now().getTime(),
                      })}
                      type="button"
                      onClick={(clicked) => {
                        clicked.stopPropagation();
                        set_overflow_day(null);
                        on_event_click(event);
                      }}
                    >
                      {!event.is_all_day && (
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: "var(--cal_color)" }}
                        />
                      )}
                      <EventKindIcon kind={event.event_kind} />
                      {!event.is_all_day && (
                        <span
                          className="tabular-nums flex-shrink-0 text-[color-mix(in_srgb,var(--text-primary)_62%,transparent)]"
                          dir="ltr"
                        >
                          {compact_time(new Date(event.starts_at), time_format)}
                        </span>
                      )}
                      <span
                        className={`flex-1 truncate min-w-0 text-start${task_title_class(event)}`}
                      >
                        {event.title || t("calendar.untitled_event")}
                      </span>
                    </button>
                  );
                },
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
});
