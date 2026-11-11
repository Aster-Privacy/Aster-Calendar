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

import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  SyntheticEvent,
} from "react";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { CalendarEventContextMenu } from "@/components/calendar/calendar_event_context_menu";
import { event_render_key } from "@/services/calendar/event_render_key";
import { EventKindIcon } from "@/components/calendar/event_kind_icon";
import {
  WorkingLocationBadge,
  type WorkingLocationHandlers,
} from "@/components/calendar/working_location_badge";
import { use_event_tooltip } from "@/components/calendar/calendar_event_tooltip";
import {
  MINUTES_PER_DAY,
  assign_calendar_split_columns,
  assign_overlap_columns,
  PHONE_CUSTOM_DAY_COUNT,
  build_custom_days,
  build_phone_week_days,
  build_week_days,
  events_for_day,
  task_title_class,
  format_alternate_day,
  get_event_day_bounds,
  is_same_day,
  is_weekend,
  iso_week_number,
  is_offset_in_view,
  minutes_from_midnight,
  PAST_EVENT_OPACITY,
  resolve_event_color,
  build_event_block_style,
  event_color_token,
  event_occurrence_key,
  start_of_day,
} from "@/components/calendar/calendar_utils";
import { format_time, local_date_key } from "@/utils/date_format";
import {
  calendar_now,
  from_view_date,
  view_zone_offset_minutes,
} from "@/services/calendar/view_zone";
import { use_calendar_now_tick } from "@/components/calendar/use_calendar_now_tick";
import { is_holiday_event } from "@/services/calendar/holidays";
import { is_birthday_event } from "@/services/calendar/birthdays";
import { is_subscription_event } from "@/services/calendar/subscriptions";
import { is_booking_event } from "@/services/calendar/appointments";

const BASE_HOUR_HEIGHT_PX = 48;
const COMPACT_HOUR_HEIGHT_PX = 40;
const NOW_LABEL_CLEARANCE_PX = 18;
const BASE_GUTTER_WIDTH_PX = 60;
const WIDE_GUTTER_WIDTH_PX = 112;
const PHONE_GUTTER_WIDTH_PX = 40;
const SWIPE_THRESHOLD_PX = 48;
const HOUR_LABEL_REFERENCE = new Date(2026, 0, 15);
const NOW_COLOR = "var(--calendar_now_line, var(--accent-color))";
const GRID_LINE_COLOR = "var(--calendar_grid_line)";
const PLACEHOLDER_STYLE = {
  borderRadius: "var(--calendar_event_radius, 6px)",
  color: "var(--calendar_event_text, #ffffff)",
  opacity: "var(--calendar_placeholder_opacity, 0.7)",
} as const;
const ALL_DAY_ROW_MIN_HEIGHT_PX = 30;
const ALL_DAY_ROW_MAX_HEIGHT_PX = 240;
const ALL_DAY_COLLAPSED_LIMIT = 2;
const SLOTS_PER_DAY = MINUTES_PER_DAY / 30;
const DRAG_THRESHOLD_PX = 4;
const RESIZE_HANDLE_PX = 7;
const TOUCH_RESIZE_HANDLE_PX = 16;
const TOUCH_LONG_PRESS_MS = 350;
const TOUCH_HOLD_CANCEL_PX = 8;
const ALL_DAY_RESIZE_HANDLE_PX = 9;
const ALL_DAY_JOIN_START_PX = 5;
const ALL_DAY_JOIN_END_PX = 4;
const MIN_EVENT_MINUTES = 15;
const STACK_OFFSET_PX = 12;
const MIN_CHIP_WIDTH_PX = 28;

interface AllDaySegment {
  event: DecryptedCalendarEvent;
  is_start: boolean;
  is_end: boolean;
  span_days: number;
}

type AllDayRow = AllDaySegment | null;

interface AllDayRun {
  event: DecryptedCalendarEvent;
  key: string;
  first: number;
  last: number;
}

function layout_all_day_rows(lists: DecryptedCalendarEvent[][]): AllDayRow[][] {
  const runs: AllDayRun[] = [];
  const open_runs = new Map<string, AllDayRun>();

  lists.forEach((list, day_index) => {
    for (const event of list) {
      const key = `${event.id}|${event.starts_at}`;
      const open_run = open_runs.get(key);

      if (open_run && open_run.last === day_index - 1) {
        open_run.last = day_index;
        continue;
      }

      const run = { event, key, first: day_index, last: day_index };

      open_runs.set(key, run);
      runs.push(run);
    }
  });

  runs.sort(
    (left, right) =>
      left.first - right.first ||
      right.last - right.first - (left.last - left.first),
  );

  const rows: AllDayRow[][] = lists.map(() => []);

  for (const run of runs) {
    let lane = 0;

    while (
      rows
        .slice(run.first, run.last + 1)
        .some((day_rows) => Boolean(day_rows[lane]))
    ) {
      lane += 1;
    }

    for (let day_index = run.first; day_index <= run.last; day_index += 1) {
      const day_rows = rows[day_index];

      while (day_rows.length < lane) {
        day_rows.push(null);
      }

      day_rows[lane] = {
        event: run.event,
        is_start: day_index === run.first,
        is_end: day_index === run.last,
        span_days: run.last - day_index + 1,
      };
    }
  }

  return rows;
}

function all_day_segment_style(
  base: CSSProperties,
  is_start: boolean,
  is_end: boolean,
  is_active: boolean,
): CSSProperties {
  if (is_start && is_end) {
    return base;
  }

  const radius = "var(--calendar_event_radius, 6px)";
  const is_rtl = document.documentElement.dir === "rtl";
  const start_sign = is_rtl ? -1 : 1;
  const ring = "var(--accent-color)";
  const shadows = [
    "0 -1px 0 0 var(--bg-primary)",
    "0 1px 0 0 var(--bg-primary)",
  ];

  if (is_active) {
    shadows.push(`inset 0 2px 0 0 ${ring}`, `inset 0 -2px 0 0 ${ring}`);

    if (is_start) {
      shadows.push(`inset ${2 * start_sign}px 0 0 0 ${ring}`);
    }

    if (is_end) {
      shadows.push(`inset ${-2 * start_sign}px 0 0 0 ${ring}`);
    }
  }

  const extra_px =
    (is_start ? 0 : ALL_DAY_JOIN_START_PX) + (is_end ? 0 : ALL_DAY_JOIN_END_PX);

  return {
    ...base,
    borderRadius: 0,
    borderStartStartRadius: is_start ? radius : 0,
    borderEndStartRadius: is_start ? radius : 0,
    borderStartEndRadius: is_end ? radius : 0,
    borderEndEndRadius: is_end ? radius : 0,
    boxShadow: shadows.join(", "),
    marginInlineStart: is_start ? undefined : -ALL_DAY_JOIN_START_PX,
    marginInlineEnd: is_end ? undefined : -ALL_DAY_JOIN_END_PX,
    outline: undefined,
    outlineOffset: undefined,
    width: `calc(100% + ${extra_px}px)`,
  };
}

let remembered_scroll_top: number | null = null;

const WEEKDAY_KEYS: TranslationKey[] = [
  "calendar.weekday_sun",
  "calendar.weekday_mon",
  "calendar.weekday_tue",
  "calendar.weekday_wed",
  "calendar.weekday_thu",
  "calendar.weekday_fri",
  "calendar.weekday_sat",
];

function format_gmt_offset(date: Date): string {
  const total_minutes = view_zone_offset_minutes(date);
  const sign = total_minutes < 0 ? "-" : "+";
  const absolute = Math.abs(total_minutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;

  return minutes === 0
    ? `GMT${sign}${hours}`
    : `GMT${sign}${hours}:${String(minutes).padStart(2, "0")}`;
}

interface CalendarTimeGridViewProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  anchor_date: Date;
  selected_date: Date;
  week_start_day: number;
  is_single_day: boolean;
  custom_day_count: number | null;
  is_phone: boolean;
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
  show_event_location: boolean;
  working_hours_start: number;
  working_hours_end: number;
  dim_non_working_hours: boolean;
  working_days: number[];
  short_events_full_size: boolean;
  show_current_time_indicator: boolean;
  split_calendar_order: string[] | null;
  scroll_to_first_event: boolean;
  default_duration_minutes: number;
  density: "responsive" | "compact";
  dim_past_events: boolean;
  working_location?: WorkingLocationHandlers;
  secondary_timezone: string;
  draft_range: {
    start: Date;
    end: Date;
    is_all_day: boolean;
    title?: string;
    color?: string;
  } | null;
  on_day_number_click: (day: Date) => void;
  on_slot_double_click: (start: Date) => void;
  on_week_number_click: (day: Date) => void;
  recenter_token: number;
  on_swipe_navigate: (direction: 1 | -1) => void;
  on_event_click: (event: DecryptedCalendarEvent) => void;
  on_range_select: (start: Date, end: Date, is_all_day?: boolean) => void;
  on_event_reschedule: (
    event: DecryptedCalendarEvent,
    start: Date,
    end: Date,
  ) => void;
}

interface SwipeTracking {
  pointer_id: number;
  start_x: number;
  start_y: number;
  delta_x: number;
  is_swipe: boolean;
}

interface TouchHold {
  pointer_id: number;
  timer: number;
  start_x: number;
  start_y: number;
  element: HTMLElement;
  event: DecryptedCalendarEvent;
  day: Date;
  day_index: number;
  mode: "move" | "resize";
}

const prevent_touch_scroll = (touched: TouchEvent) => {
  if (touched.cancelable) {
    touched.preventDefault();
  }
};

interface RangeDrag {
  day_index: number;
  anchor_slot: number;
  current_slot: number;
  moved: boolean;
}

interface EventDrag {
  event: DecryptedCalendarEvent;
  mode: "move" | "resize";
  day_index: number;
  origin_day_index: number;
  start_minute: number;
  end_minute: number;
  grab_offset_minutes: number;
  pointer_start_y: number;
  pointer_start_x: number;
  moved: boolean;
}

interface AllDayRangeDrag {
  anchor_index: number;
  current_index: number;
  moved: boolean;
}

interface AllDayEventDrag {
  event: DecryptedCalendarEvent;
  mode: "move" | "resize";
  start_index: number;
  end_index: number;
  grab_index: number;
  grab_offset_days: number;
  pointer_start_x: number;
  moved: boolean;
}

function shifted_by_days(value: string, delta_days: number) {
  const next = new Date(value);

  next.setDate(next.getDate() + delta_days);

  return next;
}

function snap_minutes(value: number) {
  return Math.round(value / 15) * 15;
}

const KEY_STEP_MINUTES = 15;

function shifted_by_minutes(value: string, delta_minutes: number) {
  return new Date(new Date(value).getTime() + delta_minutes * 60_000);
}

function shifted_by_days_and_minutes(
  value: string,
  delta_days: number,
  delta_minutes: number,
) {
  return shifted_by_minutes(
    shifted_by_days(value, delta_days).toISOString(),
    delta_minutes,
  );
}

function is_readonly_event(event: DecryptedCalendarEvent): boolean {
  return (
    is_holiday_event(event) ||
    is_birthday_event(event) ||
    is_subscription_event(event) ||
    is_booking_event(event)
  );
}

function event_ends_within_day(event: DecryptedCalendarEvent, day: Date) {
  return (
    new Date(event.ends_at).getTime() <=
    start_of_day(day).getTime() + MINUTES_PER_DAY * 60_000
  );
}

function focus_sibling_chip(target: HTMLElement, direction: 1 | -1) {
  const column = target.closest<HTMLElement>(
    "[data-day-index], [data-all-day-column]",
  );

  if (!column) {
    return false;
  }

  const chips = Array.from(
    column.querySelectorAll<HTMLElement>("[data-event-block]"),
  );
  const next = chips[chips.indexOf(target) + direction];

  if (!next) {
    return false;
  }

  next.focus();

  return true;
}

export const CalendarTimeGridView = memo(function CalendarTimeGridView({
  t,
  anchor_date,
  selected_date,
  week_start_day,
  is_single_day,
  custom_day_count,
  is_phone,
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
  show_event_location,
  working_hours_start,
  working_hours_end,
  dim_non_working_hours,
  working_days,
  short_events_full_size,
  show_current_time_indicator,
  split_calendar_order,
  scroll_to_first_event,
  default_duration_minutes,
  density,
  dim_past_events,
  working_location,
  secondary_timezone,
  draft_range,
  on_day_number_click,
  on_slot_double_click,
  on_week_number_click,
  recenter_token,
  on_swipe_navigate,
  on_event_click,
  on_range_select,
  on_event_reschedule,
}: CalendarTimeGridViewProps) {
  const [fill_hour_height, set_fill_hour_height] = useState(0);
  const HOUR_HEIGHT_PX = Math.max(
    density === "compact" ? COMPACT_HOUR_HEIGHT_PX : BASE_HOUR_HEIGHT_PX,
    fill_hour_height,
  );
  const HALF_HOUR_HEIGHT_PX = HOUR_HEIGHT_PX / 2;
  const GUTTER_WIDTH_PX = is_phone
    ? PHONE_GUTTER_WIDTH_PX
    : secondary_timezone.length > 0
      ? WIDE_GUTTER_WIDTH_PX
      : BASE_GUTTER_WIDTH_PX;

  const scroll_ref = useRef<HTMLDivElement>(null);
  const has_user_scrolled_ref = useRef(false);
  const columns_ref = useRef<HTMLDivElement>(null);
  const all_day_columns_ref = useRef<HTMLDivElement>(null);
  const suppress_click_ref = useRef(false);
  const now = use_calendar_now_tick();
  const [scrollbar_width, set_scrollbar_width] = useState(0);
  const [range_drag, set_range_drag] = useState<RangeDrag | null>(null);
  const [event_drag, set_event_drag] = useState<EventDrag | null>(null);
  const [all_day_range_drag, set_all_day_range_drag] =
    useState<AllDayRangeDrag | null>(null);
  const [all_day_event_drag, set_all_day_event_drag] =
    useState<AllDayEventDrag | null>(null);
  const [all_day_expanded, set_all_day_expanded] = useState(false);
  const [is_grid_scrolled, set_is_grid_scrolled] = useState(false);
  const swipe_ref = useRef<SwipeTracking | null>(null);
  const touch_hold_ref = useRef<TouchHold | null>(null);
  const touch_drag_element_ref = useRef<HTMLElement | null>(null);
  const placeholder_color = event_color_token(
    calendars.find((calendar) => calendar.is_default)?.color ??
      calendars[0]?.color,
  );

  const split_active =
    is_single_day &&
    split_calendar_order !== null &&
    split_calendar_order.length > 1;

  useLayoutEffect(() => {
    const node = scroll_ref.current;

    if (!node) {
      return;
    }

    const measure = () => {
      const next = node.clientHeight / 24;

      set_fill_hour_height((current) =>
        Math.abs(current - next) < 0.01 ? current : next,
      );
    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const days = useMemo(() => {
    if (is_single_day) {
      return [anchor_date];
    }

    if (custom_day_count !== null) {
      return build_custom_days(
        anchor_date,
        is_phone
          ? Math.min(custom_day_count, PHONE_CUSTOM_DAY_COUNT)
          : custom_day_count,
      );
    }

    if (is_phone) {
      return build_phone_week_days(anchor_date, week_start_day);
    }

    const week = build_week_days(anchor_date, week_start_day);

    return show_weekends ? week : week.filter((day) => !is_weekend(day));
  }, [
    is_single_day,
    custom_day_count,
    is_phone,
    anchor_date,
    week_start_day,
    show_weekends,
  ]);

  const now_minutes = minutes_from_midnight(now);
  const [now_position, set_now_position] = useState<
    "visible" | "above" | "below"
  >("visible");

  const is_jumping_to_now_ref = useRef(false);
  const cancel_jump_to_now_ref = useRef<(() => void) | null>(null);
  const ignore_grid_input_until_ref = useRef(0);

  const update_now_position = useCallback(() => {
    const node = scroll_ref.current;

    if (!node || is_jumping_to_now_ref.current) {
      return;
    }

    const offset =
      (minutes_from_midnight(calendar_now()) / 60) * HOUR_HEIGHT_PX;

    const max_scroll = node.scrollHeight - node.clientHeight;
    const pinned_to_edge =
      (offset > node.scrollTop && node.scrollTop >= max_scroll - 1) ||
      (offset < node.scrollTop && node.scrollTop <= 1);

    set_now_position(
      pinned_to_edge ||
        is_offset_in_view(offset, node.scrollTop, node.clientHeight - 8)
        ? "visible"
        : offset < node.scrollTop
          ? "above"
          : "below",
    );
  }, [HOUR_HEIGHT_PX]);

  useLayoutEffect(() => {
    update_now_position();
  }, [update_now_position, now, days.length]);

  useEffect(() => {
    const node = scroll_ref.current;

    if (!node || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => update_now_position());

    observer.observe(node);

    return () => observer.disconnect();
  }, [update_now_position]);

  const snap_offset_to_hour = (node: HTMLDivElement, offset: number) => {
    const max_offset = node.scrollHeight - node.clientHeight;
    const hour = Math.round((offset + 12) / HOUR_HEIGHT_PX);

    return Math.min(
      Math.max(0, max_offset),
      Math.max(0, hour * HOUR_HEIGHT_PX - 12),
    );
  };

  const scroll_grid_to_now = (node: HTMLDivElement) => {
    has_user_scrolled_ref.current = true;

    const now_offset =
      (minutes_from_midnight(calendar_now()) / 60) * HOUR_HEIGHT_PX;
    const target = snap_offset_to_hour(
      node,
      now_offset - node.clientHeight / 2.6,
    );
    let settle_timer = 0;
    const release = () => {
      window.clearTimeout(settle_timer);
      node.removeEventListener("scrollend", settle);

      if (cancel_jump_to_now_ref.current === release) {
        cancel_jump_to_now_ref.current = null;
      }
    };
    const settle = () => {
      release();
      is_jumping_to_now_ref.current = false;
      update_now_position();
    };

    cancel_jump_to_now_ref.current?.();
    cancel_jump_to_now_ref.current = release;
    is_jumping_to_now_ref.current = true;
    set_now_position("visible");
    node.addEventListener("scrollend", settle, { once: true });
    settle_timer = window.setTimeout(settle, 900);
    node.scrollTo({ behavior: "smooth", top: target });

    if (Math.abs(node.scrollTop - target) <= 1) {
      settle();
    }
  };

  const scroll_to_now = () => {
    const node = scroll_ref.current;

    if (node) {
      ignore_grid_input_until_ref.current = performance.now() + 500;
      scroll_grid_to_now(node);
    }
  };

  useEffect(() => () => cancel_jump_to_now_ref.current?.(), []);

  const swallow_input_after_jump = (event: SyntheticEvent) => {
    if (performance.now() < ignore_grid_input_until_ref.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  useLayoutEffect(() => {
    const node = scroll_ref.current;

    if (!node) {
      return;
    }

    const first_event_minutes = scroll_to_first_event
      ? events
          .filter(
            (event) =>
              !event.is_all_day &&
              days.some((day) => is_same_day(day, new Date(event.starts_at))),
          )
          .reduce(
            (earliest, event) =>
              Math.min(
                earliest,
                minutes_from_midnight(new Date(event.starts_at)),
              ),
            Number.POSITIVE_INFINITY,
          )
      : Number.POSITIVE_INFINITY;
    const anchor_hour = Number.isFinite(first_event_minutes)
      ? Math.max(0, first_event_minutes / 60 - 0.5)
      : working_hours_start;
    const initial_offset =
      remembered_scroll_top ?? anchor_hour * HOUR_HEIGHT_PX;
    let snapped_top: number | null = null;
    const snap_to_hour = () => {
      const max_offset = node.scrollHeight - node.clientHeight;
      const hour = Math.min(
        Math.round((initial_offset + 12) / HOUR_HEIGHT_PX),
        Math.floor((max_offset + 12) / HOUR_HEIGHT_PX),
      );

      node.scrollTop = Math.max(0, hour * HOUR_HEIGHT_PX - 12);
      snapped_top = node.scrollTop;
    };
    const mark_user_scroll = () => {
      has_user_scrolled_ref.current = true;
    };
    const interaction_events = [
      "wheel",
      "touchstart",
      "pointerdown",
      "keydown",
    ] as const;

    snap_to_hour();

    for (const type of interaction_events) {
      node.addEventListener(type, mark_user_scroll, { passive: true });
    }

    const observer = new ResizeObserver(() => {
      const is_untouched =
        snapped_top === null || Math.abs(node.scrollTop - snapped_top) <= 1;

      if (!has_user_scrolled_ref.current && is_untouched) {
        snap_to_hour();
      }
    });

    observer.observe(node);

    return () => {
      observer.disconnect();

      for (const type of interaction_events) {
        node.removeEventListener(type, mark_user_scroll);
      }
    };
  }, [HOUR_HEIGHT_PX]);

  useEffect(() => {
    const node = scroll_ref.current;

    if (!node) {
      return;
    }

    const remember = () => {
      remembered_scroll_top = node.scrollTop;
    };

    node.addEventListener("scroll", remember, { passive: true });

    return () => node.removeEventListener("scroll", remember);
  }, []);

  const days_key = days.map((day) => local_date_key(day)).join("|");
  const previous_days_key_ref = useRef(days_key);

  useEffect(() => {
    if (previous_days_key_ref.current !== days_key) {
      previous_days_key_ref.current = days_key;
      remembered_scroll_top = null;
    }
  }, [days_key]);

  useEffect(() => {
    const node = scroll_ref.current;

    if (recenter_token === 0 || !node) {
      return;
    }

    scroll_grid_to_now(node);
  }, [recenter_token, HOUR_HEIGHT_PX]);

  useLayoutEffect(() => {
    const node = scroll_ref.current;

    if (!node) {
      return;
    }

    const measure = () => {
      set_scrollbar_width((current) => {
        const next = node.offsetWidth - node.clientWidth;

        return current === next ? current : next;
      });
    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const hours = Array.from({ length: 24 }, (_, index) => index);

  const format_hour_label = (hour: number) => {
    const date = new Date(HOUR_LABEL_REFERENCE);

    date.setHours(hour, 0, 0, 0);

    return format_time(date, { date_format: "MM/DD/YYYY", time_format })
      .replace(":00", "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const secondary_hour_labels = useMemo(() => {
    if (secondary_timezone.length === 0) {
      return null;
    }

    try {
      const formatter = new Intl.DateTimeFormat(language, {
        hour: "numeric",
        hour12: time_format === "12h",
        timeZone: secondary_timezone,
      });
      const reference = new Date(anchor_date);

      return Array.from({ length: 24 }, (_, hour) => {
        const moment = new Date(reference);

        moment.setHours(hour, 0, 0, 0);

        return formatter
          .format(from_view_date(moment))
          .replace(/\s+/g, " ")
          .trim();
      });
    } catch {
      return null;
    }
  }, [anchor_date, language, secondary_timezone, time_format]);

  const secondary_zone_label = useMemo(() => {
    if (secondary_timezone.length === 0) {
      return null;
    }

    try {
      const parts = new Intl.DateTimeFormat(language, {
        timeZone: secondary_timezone,
        timeZoneName: "shortOffset",
      }).formatToParts(from_view_date(now));

      return (
        parts.find((part) => part.type === "timeZoneName")?.value ??
        secondary_timezone
      );
    } catch {
      return secondary_timezone;
    }
  }, [language, now, secondary_timezone]);

  const at_day_minute = (day: Date, minute: number) => {
    const result = new Date(day);

    result.setHours(0, minute, 0, 0);

    return result.toISOString();
  };

  const format_clock = (value: string) =>
    format_time(new Date(value), {
      date_format: "MM/DD/YYYY",
      time_format,
    });

  const [live_message, set_live_message] = useState("");

  const announce_day_formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    [language],
  );

  const calendar_name_of = (event: DecryptedCalendarEvent) =>
    calendar_by_id.get(event.calendar_id)?.name ?? "";

  const event_tooltip = use_event_tooltip();
  const is_any_drag =
    event_drag !== null ||
    all_day_event_drag !== null ||
    range_drag !== null ||
    all_day_range_drag !== null;
  const hide_tooltip = event_tooltip.hide;

  useLayoutEffect(() => {
    if (is_any_drag) {
      hide_tooltip();
    }
  }, [is_any_drag, hide_tooltip]);

  const tooltip_content_of = (event: DecryptedCalendarEvent) => ({
    calendar: calendar_name_of(event),
    location: event.location,
    time: event.is_all_day
      ? t("calendar.all_day")
      : `${format_clock(event.starts_at)} - ${format_clock(event.ends_at)}`,
    title: event.title || t("calendar.untitled_event"),
  });

  const reschedule_from_keyboard = (
    event: DecryptedCalendarEvent,
    start: Date,
    end: Date,
    key: "calendar.a11y_event_moved" | "calendar.a11y_event_resized",
  ) => {
    on_event_reschedule(event, start, end);
    set_live_message(
      t(key, {
        title: event.title || t("calendar.untitled_event"),
        date: announce_day_formatter.format(start),
        time: event.is_all_day
          ? t("calendar.all_day")
          : `${format_clock(start.toISOString())} - ${format_clock(end.toISOString())}`,
      }),
    );
  };

  const handle_timed_chip_key = (
    key_event: ReactKeyboardEvent<HTMLButtonElement>,
    event: DecryptedCalendarEvent,
  ) => {
    const { key, altKey, shiftKey, ctrlKey, metaKey } = key_event;

    if (ctrlKey || metaKey) {
      return;
    }

    if (key === "Delete" || key === "Backspace") {
      key_event.preventDefault();
      event_menu_actions.on_delete_request(event);

      return;
    }

    const vertical = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
    const horizontal =
      (key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0) *
      (document.documentElement.dir === "rtl" ? -1 : 1);

    if (vertical === 0 && horizontal === 0) {
      return;
    }

    if (shiftKey && vertical !== 0) {
      key_event.preventDefault();

      if (is_readonly_event(event)) {
        return;
      }

      const start = new Date(event.starts_at);
      const end = shifted_by_minutes(
        event.ends_at,
        vertical * KEY_STEP_MINUTES,
      );

      if (end.getTime() - start.getTime() < MIN_EVENT_MINUTES * 60_000) {
        return;
      }

      reschedule_from_keyboard(
        event,
        start,
        end,
        "calendar.a11y_event_resized",
      );

      return;
    }

    if (altKey) {
      key_event.preventDefault();

      if (is_readonly_event(event)) {
        return;
      }

      reschedule_from_keyboard(
        event,
        shifted_by_days_and_minutes(
          event.starts_at,
          horizontal,
          vertical * KEY_STEP_MINUTES,
        ),
        shifted_by_days_and_minutes(
          event.ends_at,
          horizontal,
          vertical * KEY_STEP_MINUTES,
        ),
        "calendar.a11y_event_moved",
      );

      return;
    }

    if (vertical !== 0 && !shiftKey) {
      if (focus_sibling_chip(key_event.currentTarget, vertical)) {
        key_event.preventDefault();
      }
    }
  };

  const handle_all_day_chip_key = (
    key_event: ReactKeyboardEvent<HTMLButtonElement>,
    event: DecryptedCalendarEvent,
  ) => {
    const { key, altKey, ctrlKey, metaKey } = key_event;

    if (ctrlKey || metaKey) {
      return;
    }

    if (key === "Delete" || key === "Backspace") {
      key_event.preventDefault();
      event_menu_actions.on_delete_request(event);

      return;
    }

    const vertical = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
    const horizontal =
      (key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0) *
      (document.documentElement.dir === "rtl" ? -1 : 1);

    if (altKey && horizontal !== 0) {
      key_event.preventDefault();

      if (is_readonly_event(event)) {
        return;
      }

      reschedule_from_keyboard(
        event,
        shifted_by_days(event.starts_at, horizontal),
        shifted_by_days(event.ends_at, horizontal),
        "calendar.a11y_event_moved",
      );

      return;
    }

    if (vertical !== 0 && !altKey && !key_event.shiftKey) {
      if (focus_sibling_chip(key_event.currentTarget, vertical)) {
        key_event.preventDefault();
      }
    }
  };

  const events_by_day = useMemo(
    () => days.map((day) => events_for_day(events, day)),
    [days, events],
  );
  const all_day_by_day = useMemo(
    () => events_by_day.map((list) => list.filter((event) => event.is_all_day)),
    [events_by_day],
  );
  const timed_by_day = useMemo(
    () =>
      events_by_day.map((list) => list.filter((event) => !event.is_all_day)),
    [events_by_day],
  );
  const layout_by_day = useMemo(
    () =>
      timed_by_day.map((day_events, day_index) =>
        split_active && split_calendar_order
          ? assign_calendar_split_columns(
              day_events,
              days[day_index],
              split_calendar_order,
            )
          : assign_overlap_columns(day_events, days[day_index]),
      ),
    [timed_by_day, days, split_active, split_calendar_order],
  );
  const all_day_overflows = useMemo(
    () =>
      layout_all_day_rows(all_day_by_day).some(
        (rows) => rows.length > ALL_DAY_COLLAPSED_LIMIT,
      ),
    [all_day_by_day],
  );
  const all_day_collapsed = all_day_overflows && !all_day_expanded;
  const today_index = days.findIndex((day) => is_same_day(day, now));
  const shows_now_line = today_index >= 0 && show_current_time_indicator;
  const now_top_px = Math.round((now_minutes / 60) * HOUR_HEIGHT_PX);
  const now_label_clearance_minutes =
    (NOW_LABEL_CLEARANCE_PX / HOUR_HEIGHT_PX) * 60;
  const day_is_past = (day: Date) => {
    const end_of_day = new Date(day);

    end_of_day.setHours(23, 59, 59, 999);

    return end_of_day.getTime() < now.getTime();
  };
  const is_hour_label_hidden = (hour: number) =>
    hour === 0 ||
    (shows_now_line &&
      !is_phone &&
      Math.abs(hour * 60 - now_minutes) < now_label_clearance_minutes);

  const minutes_at_pointer = useCallback(
    (client_y: number) => {
      const node = columns_ref.current;

      if (!node) {
        return 0;
      }

      const offset = client_y - node.getBoundingClientRect().top;

      return Math.min(
        MINUTES_PER_DAY,
        Math.max(0, (offset / HOUR_HEIGHT_PX) * 60),
      );
    },
    [HOUR_HEIGHT_PX],
  );

  const day_index_at_pointer = useCallback(
    (client_x: number) => {
      const node = columns_ref.current;

      if (!node) {
        return 0;
      }

      const rect = node.getBoundingClientRect();
      const width = rect.width / days.length;
      const from_start =
        document.documentElement.dir === "rtl"
          ? rect.right - client_x
          : client_x - rect.left;
      const index = Math.floor(from_start / width);

      return Math.min(days.length - 1, Math.max(0, index));
    },
    [days.length],
  );

  const day_at_minutes = useCallback((day: Date, minutes: number) => {
    const next = new Date(day);

    next.setHours(0, 0, 0, 0);
    next.setMinutes(minutes);

    return next;
  }, []);

  const handle_swipe_pointer_down = (
    pointed: ReactPointerEvent<HTMLElement>,
  ) => {
    if (pointed.pointerType !== "touch" || !pointed.isPrimary) {
      swipe_ref.current = null;

      return;
    }

    swipe_ref.current = {
      pointer_id: pointed.pointerId,
      start_x: pointed.clientX,
      start_y: pointed.clientY,
      delta_x: 0,
      is_swipe: false,
    };
  };

  const handle_swipe_pointer_move = (
    pointed: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const tracking = swipe_ref.current;

    if (!tracking || tracking.pointer_id !== pointed.pointerId) {
      return;
    }

    const delta_x = pointed.clientX - tracking.start_x;
    const delta_y = pointed.clientY - tracking.start_y;

    tracking.delta_x = delta_x;

    if (
      !tracking.is_swipe &&
      Math.abs(delta_x) >= SWIPE_THRESHOLD_PX &&
      Math.abs(delta_x) > Math.abs(delta_y)
    ) {
      tracking.is_swipe = true;
    }
  };

  const handle_swipe_pointer_end = (
    pointed: ReactPointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const tracking = swipe_ref.current;

    if (!tracking || tracking.pointer_id !== pointed.pointerId) {
      return;
    }

    swipe_ref.current = null;

    if (cancelled || !tracking.is_swipe) {
      return;
    }

    const forward =
      document.dir === "rtl" ? tracking.delta_x > 0 : tracking.delta_x < 0;

    on_swipe_navigate(forward ? 1 : -1);
  };

  const handle_range_pointer_down = (
    pointed: ReactPointerEvent<HTMLDivElement>,
    day_index: number,
  ) => {
    if (pointed.button !== 0 || pointed.pointerType === "touch") {
      return;
    }

    const slot = Math.min(
      SLOTS_PER_DAY - 1,
      Math.max(0, Math.floor(minutes_at_pointer(pointed.clientY) / 30)),
    );

    pointed.currentTarget.setPointerCapture(pointed.pointerId);
    set_range_drag({
      day_index,
      anchor_slot: slot,
      current_slot: slot,
      moved: false,
    });
  };

  const handle_range_pointer_move = (
    pointed: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!range_drag || swipe_ref.current?.is_swipe) {
      return;
    }

    const slot = Math.min(
      SLOTS_PER_DAY - 1,
      Math.max(0, Math.floor(minutes_at_pointer(pointed.clientY) / 30)),
    );

    if (slot === range_drag.current_slot) {
      return;
    }

    set_range_drag({
      ...range_drag,
      current_slot: slot,
      moved: true,
    });
  };

  const range_drag_minutes = (drag: {
    anchor_slot: number;
    current_slot: number;
    moved: boolean;
  }) => {
    const start_minutes = Math.min(drag.anchor_slot, drag.current_slot) * 30;
    const end_minutes = drag.moved
      ? (Math.max(drag.anchor_slot, drag.current_slot) + 1) * 30
      : start_minutes + Math.max(MIN_EVENT_MINUTES, default_duration_minutes);

    return {
      start_minutes,
      end_minutes: Math.min(MINUTES_PER_DAY, end_minutes),
    };
  };
  const range_preview = range_drag ? range_drag_minutes(range_drag) : null;

  const handle_range_pointer_up = (
    pointed: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!range_drag) {
      return;
    }

    if (pointed.currentTarget.hasPointerCapture(pointed.pointerId)) {
      pointed.currentTarget.releasePointerCapture(pointed.pointerId);
    }

    if (swipe_ref.current?.is_swipe) {
      set_range_drag(null);

      return;
    }

    const day = days[range_drag.day_index];
    const { start_minutes, end_minutes } = range_drag_minutes(range_drag);

    set_range_drag(null);

    if (!day) {
      return;
    }

    on_range_select(
      day_at_minutes(day, start_minutes),
      day_at_minutes(day, Math.min(MINUTES_PER_DAY, end_minutes)),
    );
  };

  const begin_event_drag = (
    element: HTMLElement,
    pointer_id: number,
    client_x: number,
    client_y: number,
    event: DecryptedCalendarEvent,
    day: Date,
    day_index: number,
    mode: "move" | "resize",
  ) => {
    const bounds = get_event_day_bounds(event, day);

    if (!element.hasPointerCapture(pointer_id)) {
      try {
        element.setPointerCapture(pointer_id);
      } catch {
        return;
      }
    }

    set_event_drag({
      event,
      mode,
      day_index,
      origin_day_index: day_index,
      start_minute: bounds.start_minute,
      end_minute: bounds.end_minute,
      grab_offset_minutes:
        minutes_at_pointer(client_y) -
        (mode === "resize" ? bounds.end_minute : bounds.start_minute),
      pointer_start_y: client_y,
      pointer_start_x: client_x,
      moved: false,
    });
  };

  const cancel_touch_hold = () => {
    const hold = touch_hold_ref.current;

    if (!hold) {
      return;
    }

    window.clearTimeout(hold.timer);
    touch_hold_ref.current = null;
  };

  const end_touch_drag = () => {
    const element = touch_drag_element_ref.current;

    if (!element) {
      return;
    }

    element.style.touchAction = "";
    element.removeEventListener("touchmove", prevent_touch_scroll);
    touch_drag_element_ref.current = null;
  };

  const start_touch_drag = () => {
    const hold = touch_hold_ref.current;

    if (!hold) {
      return;
    }

    touch_hold_ref.current = null;
    swipe_ref.current = null;
    touch_drag_element_ref.current = hold.element;
    hold.element.style.touchAction = "none";
    hold.element.addEventListener("touchmove", prevent_touch_scroll, {
      passive: false,
    });
    begin_event_drag(
      hold.element,
      hold.pointer_id,
      hold.start_x,
      hold.start_y,
      hold.event,
      hold.day,
      hold.day_index,
      hold.mode,
    );
  };

  const handle_event_pointer_down = (
    pointed: ReactPointerEvent<HTMLElement>,
    event: DecryptedCalendarEvent,
    day: Date,
    day_index: number,
    mode: "move" | "resize",
  ) => {
    if (is_readonly_event(event)) {
      return;
    }

    if (pointed.pointerType === "touch") {
      if (!pointed.isPrimary) {
        return;
      }

      pointed.stopPropagation();
      cancel_touch_hold();
      end_touch_drag();
      handle_swipe_pointer_down(pointed);
      touch_hold_ref.current = {
        pointer_id: pointed.pointerId,
        timer: window.setTimeout(start_touch_drag, TOUCH_LONG_PRESS_MS),
        start_x: pointed.clientX,
        start_y: pointed.clientY,
        element: pointed.currentTarget,
        event,
        day,
        day_index,
        mode,
      };

      return;
    }

    if (pointed.button !== 0) {
      return;
    }

    pointed.stopPropagation();
    begin_event_drag(
      pointed.currentTarget,
      pointed.pointerId,
      pointed.clientX,
      pointed.clientY,
      event,
      day,
      day_index,
      mode,
    );
  };

  const handle_touch_hold_move = (pointed: ReactPointerEvent<HTMLElement>) => {
    const hold = touch_hold_ref.current;

    if (!hold || hold.pointer_id !== pointed.pointerId) {
      return;
    }

    if (
      Math.abs(pointed.clientX - hold.start_x) > TOUCH_HOLD_CANCEL_PX ||
      Math.abs(pointed.clientY - hold.start_y) > TOUCH_HOLD_CANCEL_PX
    ) {
      cancel_touch_hold();
    }
  };

  const handle_event_pointer_cancel = (
    pointed: ReactPointerEvent<HTMLElement>,
  ) => {
    cancel_touch_hold();

    if (!event_drag) {
      return;
    }

    if (pointed.currentTarget.hasPointerCapture(pointed.pointerId)) {
      pointed.currentTarget.releasePointerCapture(pointed.pointerId);
    }

    end_touch_drag();
    set_event_drag(null);
  };

  const handle_event_pointer_move = (
    pointed: ReactPointerEvent<HTMLElement>,
  ) => {
    if (!event_drag) {
      return;
    }

    const moved =
      event_drag.moved ||
      Math.abs(pointed.clientY - event_drag.pointer_start_y) >
        DRAG_THRESHOLD_PX ||
      Math.abs(pointed.clientX - event_drag.pointer_start_x) >
        DRAG_THRESHOLD_PX;

    if (!moved) {
      return;
    }

    const pointer_minutes = minutes_at_pointer(pointed.clientY);

    if (event_drag.mode === "resize") {
      const end = Math.max(
        event_drag.start_minute + MIN_EVENT_MINUTES,
        Math.min(
          MINUTES_PER_DAY,
          snap_minutes(pointer_minutes - event_drag.grab_offset_minutes),
        ),
      );

      if (event_drag.moved && event_drag.end_minute === end) {
        return;
      }

      set_event_drag({ ...event_drag, end_minute: end, moved: true });

      return;
    }

    const duration = event_drag.end_minute - event_drag.start_minute;
    const raw_start = snap_minutes(
      pointer_minutes - event_drag.grab_offset_minutes,
    );
    const start = Math.min(MINUTES_PER_DAY - duration, Math.max(0, raw_start));
    const day_index = day_index_at_pointer(pointed.clientX);

    if (
      event_drag.moved &&
      event_drag.day_index === day_index &&
      event_drag.start_minute === start
    ) {
      return;
    }

    set_event_drag({
      ...event_drag,
      day_index,
      start_minute: start,
      end_minute: start + duration,
      moved: true,
    });
  };

  const handle_event_pointer_up = (pointed: ReactPointerEvent<HTMLElement>) => {
    cancel_touch_hold();

    if (!event_drag) {
      return;
    }

    if (pointed.currentTarget.hasPointerCapture(pointed.pointerId)) {
      pointed.currentTarget.releasePointerCapture(pointed.pointerId);
    }

    end_touch_drag();

    const finished = event_drag;

    set_event_drag(null);

    if (!finished.moved) {
      return;
    }

    suppress_click_ref.current = true;

    if (pointed.pointerType === "touch") {
      window.setTimeout(() => {
        suppress_click_ref.current = false;
      }, TOUCH_LONG_PRESS_MS);
    }

    const origin_day = days[finished.origin_day_index];

    if (!origin_day) {
      return;
    }

    const origin_bounds = get_event_day_bounds(finished.event, origin_day);

    if (finished.mode === "resize") {
      const delta_minutes = finished.end_minute - origin_bounds.end_minute;

      if (delta_minutes === 0) {
        return;
      }

      on_event_reschedule(
        finished.event,
        new Date(finished.event.starts_at),
        shifted_by_minutes(finished.event.ends_at, delta_minutes),
      );

      return;
    }

    const target_index = Math.min(
      days.length - 1,
      Math.max(0, finished.day_index),
    );
    const delta_days = target_index - finished.origin_day_index;
    const delta_minutes = finished.start_minute - origin_bounds.start_minute;

    if (delta_days === 0 && delta_minutes === 0) {
      return;
    }

    on_event_reschedule(
      finished.event,
      shifted_by_days_and_minutes(
        finished.event.starts_at,
        delta_days,
        delta_minutes,
      ),
      shifted_by_days_and_minutes(
        finished.event.ends_at,
        delta_days,
        delta_minutes,
      ),
    );
  };

  useEffect(
    () => () => {
      const hold = touch_hold_ref.current;

      if (hold) {
        window.clearTimeout(hold.timer);
        touch_hold_ref.current = null;
      }

      const element = touch_drag_element_ref.current;

      if (element) {
        element.style.touchAction = "";
        element.removeEventListener("touchmove", prevent_touch_scroll);
        touch_drag_element_ref.current = null;
      }
    },
    [],
  );

  const all_day_index_at_pointer = useCallback(
    (client_x: number) => {
      const node = all_day_columns_ref.current;

      if (!node) {
        return 0;
      }

      const rect = node.getBoundingClientRect();
      const width = rect.width / days.length;
      const from_start =
        document.documentElement.dir === "rtl"
          ? rect.right - client_x
          : client_x - rect.left;
      const index = Math.floor(from_start / width);

      return Math.min(days.length - 1, Math.max(0, index));
    },
    [days.length],
  );

  const all_day_span = useCallback(
    (event: DecryptedCalendarEvent) => {
      const found_start = days.findIndex((day) =>
        is_same_day(day, new Date(event.starts_at)),
      );
      const found_end = days.findIndex((day) =>
        is_same_day(day, new Date(event.ends_at)),
      );
      const start_index = found_start < 0 ? 0 : found_start;
      const end_index = found_end < 0 ? days.length - 1 : found_end;

      return { start_index, end_index: Math.max(start_index, end_index) };
    },
    [days],
  );

  const handle_all_day_range_pointer_down = (
    pointed: ReactPointerEvent<HTMLDivElement>,
    day_index: number,
  ) => {
    if (pointed.button !== 0) {
      return;
    }

    if (!pointed.currentTarget.contains(pointed.target as Node)) {
      return;
    }

    pointed.currentTarget.setPointerCapture(pointed.pointerId);
    set_all_day_range_drag({
      anchor_index: day_index,
      current_index: day_index,
      moved: false,
    });
  };

  const handle_all_day_range_pointer_move = (
    pointed: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!all_day_range_drag) {
      return;
    }

    const index = all_day_index_at_pointer(pointed.clientX);

    if (index === all_day_range_drag.current_index) {
      return;
    }

    set_all_day_range_drag({
      ...all_day_range_drag,
      current_index: index,
      moved: true,
    });
  };

  const handle_all_day_range_pointer_up = (
    pointed: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!all_day_range_drag) {
      return;
    }

    if (pointed.currentTarget.hasPointerCapture(pointed.pointerId)) {
      pointed.currentTarget.releasePointerCapture(pointed.pointerId);
    }

    const drag = all_day_range_drag;

    set_all_day_range_drag(null);

    const low = days[Math.min(drag.anchor_index, drag.current_index)];
    const high = days[Math.max(drag.anchor_index, drag.current_index)];

    if (!low || !high) {
      return;
    }

    const start = new Date(low);

    start.setHours(0, 0, 0, 0);

    const end = new Date(high);

    end.setHours(23, 59, 0, 0);

    on_range_select(start, end, true);
  };

  const handle_all_day_event_pointer_down = (
    pointed: ReactPointerEvent<HTMLElement>,
    event: DecryptedCalendarEvent,
    mode: "move" | "resize",
  ) => {
    if (pointed.button !== 0 || is_readonly_event(event)) {
      return;
    }

    const span = all_day_span(event);
    const grab_index = all_day_index_at_pointer(pointed.clientX);

    pointed.stopPropagation();
    pointed.currentTarget.setPointerCapture(pointed.pointerId);
    set_all_day_event_drag({
      event,
      mode,
      start_index: span.start_index,
      end_index: span.end_index,
      grab_index,
      grab_offset_days: grab_index - span.start_index,
      pointer_start_x: pointed.clientX,
      moved: false,
    });
  };

  const handle_all_day_event_pointer_move = (
    pointed: ReactPointerEvent<HTMLElement>,
  ) => {
    if (!all_day_event_drag) {
      return;
    }

    const moved =
      all_day_event_drag.moved ||
      Math.abs(pointed.clientX - all_day_event_drag.pointer_start_x) >
        DRAG_THRESHOLD_PX;

    if (!moved) {
      return;
    }

    const index = all_day_index_at_pointer(pointed.clientX);

    if (all_day_event_drag.mode === "resize") {
      set_all_day_event_drag({
        ...all_day_event_drag,
        end_index: Math.max(all_day_event_drag.start_index, index),
        moved: true,
      });

      return;
    }

    const span_length =
      all_day_event_drag.end_index - all_day_event_drag.start_index;
    const start_index = Math.max(
      0,
      Math.min(
        days.length - 1 - span_length,
        index - all_day_event_drag.grab_offset_days,
      ),
    );

    set_all_day_event_drag({
      ...all_day_event_drag,
      start_index,
      end_index: start_index + span_length,
      moved: true,
    });
  };

  const handle_all_day_event_pointer_up = (
    pointed: ReactPointerEvent<HTMLElement>,
  ) => {
    if (!all_day_event_drag) {
      return;
    }

    if (pointed.currentTarget.hasPointerCapture(pointed.pointerId)) {
      pointed.currentTarget.releasePointerCapture(pointed.pointerId);
    }

    const finished = all_day_event_drag;

    set_all_day_event_drag(null);

    if (!finished.moved) {
      return;
    }

    suppress_click_ref.current = true;

    const delta =
      all_day_index_at_pointer(pointed.clientX) - finished.grab_index;

    if (delta === 0) {
      return;
    }

    if (finished.mode === "resize") {
      const original = all_day_span(finished.event);

      if (original.end_index + delta < original.start_index) {
        return;
      }

      on_event_reschedule(
        finished.event,
        new Date(finished.event.starts_at),
        shifted_by_days(finished.event.ends_at, delta),
      );

      return;
    }

    on_event_reschedule(
      finished.event,
      shifted_by_days(finished.event.starts_at, delta),
      shifted_by_days(finished.event.ends_at, delta),
    );
  };

  const all_day_preview = useMemo(() => {
    if (!all_day_event_drag || !all_day_event_drag.moved) {
      return all_day_by_day;
    }

    const drag = all_day_event_drag;

    return all_day_by_day.map((list, index) => {
      const without = list.filter((event) => event.id !== drag.event.id);

      return index >= drag.start_index && index <= drag.end_index
        ? [...without, drag.event]
        : without;
    });
  }, [all_day_by_day, all_day_event_drag]);

  const all_day_rows = useMemo(
    () => layout_all_day_rows(all_day_preview),
    [all_day_preview],
  );
  const is_in_all_day_draft = (day: Date) => {
    if (!draft_range) {
      return false;
    }

    const first = start_of_day(draft_range.start).getTime();
    const last = start_of_day(
      new Date(
        Math.max(draft_range.start.getTime(), draft_range.end.getTime() - 1),
      ),
    ).getTime();
    const current = start_of_day(day).getTime();

    return current >= first && current <= last;
  };

  const is_all_day_row_visible = (day_index: number, lane: number) =>
    !all_day_collapsed ||
    (all_day_rows[day_index]?.length ?? 0) <= ALL_DAY_COLLAPSED_LIMIT ||
    lane < ALL_DAY_COLLAPSED_LIMIT - 1;
  const hidden_all_day_count = (day_index: number) =>
    all_day_rows[day_index].slice(ALL_DAY_COLLAPSED_LIMIT - 1).filter(Boolean)
      .length;
  const visible_span_of = (
    day_index: number,
    lane: number,
    span_days: number,
  ) => {
    let span = 1;

    while (span < span_days && is_all_day_row_visible(day_index + span, lane)) {
      span += 1;
    }

    return span;
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg-primary)]">
      <div
        className="flex-shrink-0 relative z-30 bg-[var(--bg-primary)] border-b"
        style={{
          borderBottomColor: is_grid_scrolled
            ? "var(--calendar_grid_line_strong)"
            : GRID_LINE_COLOR,
        }}
      >
        <div className="flex" style={{ paddingInlineEnd: scrollbar_width }}>
          <div
            className={`flex-shrink-0 flex items-end justify-between gap-1 pb-1 ${is_phone ? "pl-1 pr-1" : "pl-2 pr-2"}`}
            style={{ width: GUTTER_WIDTH_PX }}
          >
            {secondary_zone_label && !is_phone && (
              <span className="text-[10px] text-txt-muted opacity-70 whitespace-nowrap">
                {secondary_zone_label}
              </span>
            )}
            <span className="flex flex-col items-end gap-0.5 text-[10px] text-txt-muted">
              {show_week_numbers && (
                <button
                  aria-label={t("calendar.open_week_number", {
                    number: iso_week_number(days[0] ?? anchor_date),
                  })}
                  className="inline-flex h-5 cursor-pointer items-center rounded-[var(--aster-radius-item)] px-1 font-semibold tabular-nums transition-colors duration-150 hover:bg-[var(--aster-hover)] hover:text-txt-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                  data-testid="calendar-week-number"
                  type="button"
                  onClick={() => on_week_number_click(days[0] ?? anchor_date)}
                >
                  {t("calendar.week_number_short", {
                    number: iso_week_number(days[0] ?? anchor_date),
                  })}
                </button>
              )}
              <span>{format_gmt_offset(now)}</span>
            </span>
          </div>

          <div className="flex-1 min-w-0 flex">
            {days.map((day) => {
              const is_today = is_same_day(day, now);
              const is_selected = is_same_day(day, selected_date);

              return (
                <div
                  key={day.toISOString()}
                  className="group/working flex-1 min-w-0 relative flex flex-col"
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0 left-0 h-2.5 w-px"
                    style={{ backgroundColor: GRID_LINE_COLOR }}
                  />
                  {working_location && (
                    <span className="absolute end-1 top-1 z-[2]">
                      <WorkingLocationBadge
                        day={day}
                        handlers={working_location}
                        t={t}
                        variant="header"
                      />
                    </span>
                  )}
                  <button
                    aria-current={is_today ? "date" : undefined}
                    className={`relative flex flex-col items-center justify-center gap-0.5 group focus:outline-none ${is_phone ? "h-[58px]" : days.length > 3 ? "h-[68px] sm:h-[76px]" : "h-[76px]"}`}
                    type="button"
                    onClick={() => on_day_number_click(day)}
                  >
                    <span className="flex flex-col items-center gap-1">
                      <span
                        className={`${is_phone ? "text-[10px]" : "text-[11px]"} font-medium uppercase leading-none tracking-[0.06em] transition-colors duration-150 ease-out`}
                        style={{
                          color: is_today
                            ? "var(--calendar_accent_text, var(--accent-color))"
                            : day_is_past(day)
                              ? "var(--text-muted)"
                              : "var(--text-secondary)",
                        }}
                      >
                        {t(WEEKDAY_KEYS[day.getDay()])}
                      </span>
                      <span
                        className={`inline-flex items-center justify-center rounded-full px-1 font-normal leading-none ${is_phone ? "h-7 min-w-7 text-[15px]" : "h-10 min-w-10 text-[22px] max-sm:h-8 max-sm:min-w-8 max-sm:text-[17px]"} tabular-nums transition-colors duration-150 ease-out group-hover:bg-[var(--aster-hover)] group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-1 group-focus-visible:outline-[var(--accent-color)]`}
                        style={{
                          backgroundColor: is_today
                            ? "var(--calendar_today_marker_bg, var(--accent-color))"
                            : is_selected && !is_single_day
                              ? "var(--indicator-bg)"
                              : undefined,
                          color: is_today
                            ? "var(--calendar_today_marker_text, var(--accent-fg, #ffffff))"
                            : is_selected && !is_single_day
                              ? "var(--calendar_accent_text, var(--accent-color))"
                              : day_is_past(day)
                                ? "color-mix(in srgb, var(--text-primary) 66%, transparent)"
                                : "color-mix(in srgb, var(--text-primary) 88%, transparent)",
                        }}
                      >
                        {day.getDate()}
                      </span>
                    </span>
                    {!is_phone &&
                      format_alternate_day(
                        day,
                        alternate_calendar,
                        language,
                      ) !== "" && (
                        <span className="text-[10px] leading-none tabular-nums text-txt-muted">
                          {format_alternate_day(
                            day,
                            alternate_calendar,
                            language,
                          )}
                        </span>
                      )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {split_active && split_calendar_order && (
          <div
            className="flex border-t border-edge-primary"
            style={{ paddingInlineEnd: scrollbar_width }}
          >
            <div className="flex-shrink-0" style={{ width: GUTTER_WIDTH_PX }} />
            {split_calendar_order.map((calendar_id) => {
              const calendar = calendar_by_id.get(calendar_id);

              return (
                <div
                  key={calendar_id}
                  className="flex-1 min-w-0 flex items-center justify-center gap-1.5 border-l py-1"
                  style={{ borderLeftColor: GRID_LINE_COLOR }}
                >
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{
                      backgroundColor: calendar?.color ?? "var(--accent-color)",
                    }}
                  />
                  <span className="truncate text-[11px] font-medium text-txt-secondary">
                    {calendar?.name ?? ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div
          className="flex border-t"
          style={{
            borderTopColor: GRID_LINE_COLOR,
            paddingInlineEnd: scrollbar_width,
          }}
        >
          <div
            className="flex-shrink-0 flex flex-col items-end gap-1 pr-2 pt-[6px] max-sm:pr-1"
            style={{ width: GUTTER_WIDTH_PX }}
          >
            <span className="max-w-full text-right text-[10px] leading-[1.2] text-txt-muted [hyphens:auto] [overflow-wrap:anywhere] max-sm:text-[9px]">
              {t("calendar.all_day")}
            </span>
            {all_day_overflows && (
              <button
                aria-expanded={all_day_expanded}
                aria-label={t(
                  all_day_expanded
                    ? "calendar.show_less"
                    : "calendar.show_more",
                )}
                className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--icon-secondary)] transition-colors duration-150 hover:bg-[var(--aster-hover)] hover:text-[var(--icon-active)] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-color)]"
                title={t(
                  all_day_expanded
                    ? "calendar.show_less"
                    : "calendar.show_more",
                )}
                type="button"
                onClick={() => set_all_day_expanded((value) => !value)}
              >
                <ChevronDownIcon
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 transition-transform duration-150 ${all_day_expanded ? "rotate-180" : ""}`}
                />
              </button>
            )}
          </div>

          <div
            ref={all_day_columns_ref}
            className="flex-1 min-w-0 flex overflow-y-auto touch-none"
            style={{
              minHeight: ALL_DAY_ROW_MIN_HEIGHT_PX,
              maxHeight: ALL_DAY_ROW_MAX_HEIGHT_PX,
            }}
          >
            {days.map((day, day_index) => {
              const in_range_drag =
                all_day_range_drag !== null &&
                day_index >=
                  Math.min(
                    all_day_range_drag.anchor_index,
                    all_day_range_drag.current_index,
                  ) &&
                day_index <=
                  Math.max(
                    all_day_range_drag.anchor_index,
                    all_day_range_drag.current_index,
                  );

              return (
                <div
                  key={day.toISOString()}
                  className="flex-1 min-w-0 relative flex flex-col gap-[2px] px-1 py-[3px] border-l cursor-pointer"
                  style={{ borderLeftColor: GRID_LINE_COLOR }}
                  data-all-day-column=""
                  data-quick-anchor={
                    draft_range &&
                    draft_range.is_all_day &&
                    is_same_day(draft_range.start, day)
                      ? "true"
                      : undefined
                  }
                  onPointerDown={(pointed) =>
                    handle_all_day_range_pointer_down(pointed, day_index)
                  }
                  onPointerMove={handle_all_day_range_pointer_move}
                  onPointerUp={handle_all_day_range_pointer_up}
                >
                  {in_range_drag && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-[2px] inset-y-[2px] pointer-events-none"
                      style={{
                        ...PLACEHOLDER_STYLE,
                        backgroundColor: placeholder_color,
                      }}
                    />
                  )}

                  {!all_day_range_drag &&
                    draft_range &&
                    draft_range.is_all_day &&
                    is_in_all_day_draft(day) && (
                      <span
                        aria-hidden="true"
                        className="order-last flex h-6 w-full shrink-0 items-center overflow-hidden pl-2 pr-1.5 pointer-events-none"
                        style={{
                          ...PLACEHOLDER_STYLE,
                          backgroundColor: draft_range.color
                            ? event_color_token(draft_range.color)
                            : placeholder_color,
                        }}
                      >
                        {is_same_day(draft_range.start, day) && (
                          <span className="truncate text-[12px] font-medium leading-4">
                            {draft_range.title?.trim() ||
                              t("calendar.untitled_event")}
                          </span>
                        )}
                      </span>
                    )}

                  {(all_day_collapsed &&
                  all_day_rows[day_index].length > ALL_DAY_COLLAPSED_LIMIT
                    ? all_day_rows[day_index].slice(
                        0,
                        ALL_DAY_COLLAPSED_LIMIT - 1,
                      )
                    : all_day_rows[day_index]
                  ).map((row, lane) => {
                    if (!row) {
                      return (
                        <span
                          key={`all-day-gap-${lane}`}
                          aria-hidden="true"
                          className="h-6 shrink-0"
                        />
                      );
                    }

                    const { event, is_start, is_end } = row;
                    const title_span = is_start
                      ? visible_span_of(day_index, lane, row.span_days)
                      : 1;
                    const color = resolve_event_color(
                      event,
                      calendar_by_id.get(event.calendar_id)?.color,
                    );
                    const is_active =
                      event_occurrence_key(event) === selected_event_id;
                    const is_dragging =
                      all_day_event_drag?.event.id === event.id &&
                      all_day_event_drag.moved;
                    const is_all_day_past =
                      dim_past_events &&
                      !is_active &&
                      new Date(event.ends_at).getTime() < now.getTime();
                    const can_resize =
                      is_end &&
                      !is_readonly_event(event) &&
                      days.some((candidate) =>
                        is_same_day(candidate, new Date(event.ends_at)),
                      );

                    return (
                      <CalendarEventContextMenu
                        actions={event_menu_actions}
                        calendars={calendars}
                        event={event}
                        key={event_render_key(event.id)}
                        t={t}
                      >
                        <button
                          data-event-id={event.id}
                          aria-label={t("calendar.a11y_all_day_event_chip", {
                            calendar: calendar_name_of(event),
                            title: event.title || t("calendar.untitled_event"),
                          })}
                          data-event-block=""
                          {...(is_active || is_any_drag
                            ? {}
                            : event_tooltip.bind(tooltip_content_of(event)))}
                          className="relative flex w-full shrink-0 items-center pl-2 pr-1.5 h-6 py-0 leading-4 text-[12px] font-medium truncate text-start focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-color)] touch-none"
                          style={{
                            ...all_day_segment_style(
                              build_event_block_style(color, {
                                is_active,
                                is_past: is_all_day_past,
                              }),
                              is_start,
                              is_end,
                              is_active,
                            ),
                            cursor: is_dragging ? "grabbing" : "pointer",
                            opacity: is_dragging
                              ? 0.85
                              : is_all_day_past
                                ? PAST_EVENT_OPACITY
                                : undefined,
                            transition: is_dragging ? "none" : undefined,
                            overflow: title_span > 1 ? "visible" : undefined,
                            zIndex: title_span > 1 ? 1 : undefined,
                          }}
                          type="button"
                          onClick={(clicked) => {
                            clicked.stopPropagation();

                            if (suppress_click_ref.current) {
                              suppress_click_ref.current = false;

                              return;
                            }

                            on_event_click(event);
                          }}
                          onDoubleClick={(dbl) => {
                            dbl.stopPropagation();
                            event_menu_actions?.on_edit(event);
                          }}
                          onKeyDown={(key_event) =>
                            handle_all_day_chip_key(key_event, event)
                          }
                          onPointerDown={(pointed) => {
                            const rect =
                              pointed.currentTarget.getBoundingClientRect();
                            const is_rtl =
                              document.documentElement.dir === "rtl";
                            const edge_distance = is_rtl
                              ? pointed.clientX - rect.left
                              : rect.right - pointed.clientX;
                            const mode =
                              can_resize &&
                              edge_distance <= ALL_DAY_RESIZE_HANDLE_PX
                                ? "resize"
                                : "move";

                            handle_all_day_event_pointer_down(
                              pointed,
                              event,
                              mode,
                            );
                          }}
                          onPointerMove={handle_all_day_event_pointer_move}
                          onPointerUp={handle_all_day_event_pointer_up}
                        >
                          <span
                            className={`flex h-full min-w-0 items-center gap-1 leading-4${is_start ? "" : " invisible"}`}
                            style={
                              title_span > 1
                                ? {
                                    width: `calc(${title_span} * 100% + ${19 * title_span - 23}px)`,
                                  }
                                : undefined
                            }
                          >
                            <EventKindIcon kind={event.event_kind} />
                            <span
                              className={`truncate${task_title_class(event)}`}
                            >
                              {event.title || t("calendar.untitled_event")}
                            </span>
                          </span>
                          {!is_dragging && can_resize && (
                            <span
                              aria-hidden="true"
                              className="absolute inset-y-0 end-0 w-[9px] cursor-ew-resize"
                            />
                          )}
                        </button>
                      </CalendarEventContextMenu>
                    );
                  })}

                  {all_day_collapsed &&
                    all_day_rows[day_index].length >
                      ALL_DAY_COLLAPSED_LIMIT && (
                      <button
                        className="w-full h-6 shrink-0 rounded-[var(--aster-radius-item)] pl-2 pr-1.5 text-start text-[11.5px] font-medium leading-6 text-txt-secondary truncate transition-colors duration-150 hover:bg-[var(--aster-hover)] hover:text-txt-primary focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-color)]"
                        type="button"
                        onClick={(clicked) => {
                          clicked.stopPropagation();
                          set_all_day_expanded(true);
                        }}
                        onPointerDown={(pointed) => pointed.stopPropagation()}
                      >
                        <span className="max-sm:sr-only">
                          {t("calendar.more_events", {
                            count: hidden_all_day_count(day_index),
                          })}
                        </span>
                        <span aria-hidden="true" className="sm:hidden">
                          {`+${hidden_all_day_count(day_index)}`}
                        </span>
                      </button>
                    )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        ref={scroll_ref}
        className="flex-1 min-h-0 overflow-y-scroll [overflow-anchor:none] [touch-action:pan-y]"
        onClickCapture={swallow_input_after_jump}
        onDoubleClickCapture={swallow_input_after_jump}
        onPointerDownCapture={swallow_input_after_jump}
        onPointerCancel={(pointed) => handle_swipe_pointer_end(pointed, true)}
        onPointerDown={handle_swipe_pointer_down}
        onPointerMove={handle_swipe_pointer_move}
        onPointerUp={(pointed) => handle_swipe_pointer_end(pointed, false)}
        onScroll={(scrolled) => {
          const next = scrolled.currentTarget.scrollTop > 0;

          if (next !== is_grid_scrolled) {
            set_is_grid_scrolled(next);
          }

          update_now_position();
        }}
      >
        {shows_now_line && now_position === "above" && (
          <div className="pointer-events-none sticky top-2 z-30 flex h-0 justify-center">
            <JumpToNowButton
              direction="up"
              label={t("calendar.jump_to_now")}
              on_click={scroll_to_now}
            />
          </div>
        )}
        <div
          className="relative flex"
          style={{ height: (MINUTES_PER_DAY / 60) * HOUR_HEIGHT_PX }}
        >
          <div
            className="flex-shrink-0 relative"
            style={{ width: GUTTER_WIDTH_PX }}
          >
            {hours.map((hour) => {
              const is_suppressed = is_hour_label_hidden(hour);

              return (
                <span
                  key={hour}
                  className={`absolute leading-none tabular-nums text-txt-muted -translate-y-1/2 whitespace-nowrap ${is_phone ? "end-2 text-[10px]" : "end-3.5 text-[11px]"}`}
                  dir="ltr"
                  style={{ top: hour * HOUR_HEIGHT_PX }}
                >
                  {is_suppressed ? "" : format_hour_label(hour)}
                </span>
              );
            })}

            {hours.slice(1).map((hour) => (
              <span
                key={`tick_${hour}`}
                aria-hidden="true"
                className="absolute end-0 w-2 border-t pointer-events-none max-sm:w-1"
                style={{
                  borderTopColor: GRID_LINE_COLOR,
                  top: hour * HOUR_HEIGHT_PX,
                }}
              />
            ))}

            {secondary_hour_labels &&
              !is_phone &&
              hours.map((hour) => {
                const is_suppressed = is_hour_label_hidden(hour);

                return (
                  <span
                    key={`secondary_${hour}`}
                    className="absolute start-2 text-[10px] leading-none tabular-nums text-txt-muted -translate-y-1/2 whitespace-nowrap opacity-70"
                    dir="ltr"
                    style={{ top: hour * HOUR_HEIGHT_PX }}
                  >
                    {is_suppressed ? "" : secondary_hour_labels[hour]}
                  </span>
                );
              })}
          </div>

          <div ref={columns_ref} className="flex-1 min-w-0 flex relative">
            {dim_non_working_hours &&
              working_hours_start > 0 &&
              working_hours_end > working_hours_start && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 right-0 top-0 pointer-events-none z-[1]"
                  style={{
                    height: working_hours_start * HOUR_HEIGHT_PX,
                    backgroundColor: "var(--calendar_non_working_bg)",
                  }}
                />
              )}

            {dim_non_working_hours &&
              working_hours_end < 24 &&
              working_hours_end > working_hours_start && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 right-0 bottom-0 pointer-events-none z-[1]"
                  style={{
                    height: (24 - working_hours_end) * HOUR_HEIGHT_PX,
                    backgroundColor: "var(--calendar_non_working_bg)",
                  }}
                />
              )}

            {dim_non_working_hours &&
              days.map((day, index) =>
                working_days.includes(day.getDay()) ? null : (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 bottom-0 pointer-events-none z-[1]"
                    key={`non_working_${index}`}
                    style={{
                      insetInlineStart: `${(index * 100) / days.length}%`,
                      width: `${100 / days.length}%`,
                      backgroundColor: "var(--calendar_non_working_bg)",
                    }}
                  />
                ),
              )}

            {hours.slice(1).map((hour) => (
              <span
                key={`hour-${hour}`}
                className="absolute left-0 right-0 border-t pointer-events-none"
                style={{
                  borderTopColor: GRID_LINE_COLOR,
                  top: hour * HOUR_HEIGHT_PX,
                }}
              />
            ))}

            {days.map((day, day_index) => {
              const day_events = timed_by_day[day_index];
              const layout = layout_by_day[day_index];
              const drag_preview =
                event_drag?.moved &&
                Math.min(days.length - 1, Math.max(0, event_drag.day_index)) ===
                  day_index
                  ? event_drag
                  : null;
              const drag_preview_height = drag_preview
                ? Math.max(
                    short_events_full_size ? HOUR_HEIGHT_PX / 2 - 2 : 13,
                    ((drag_preview.end_minute - drag_preview.start_minute) /
                      60) *
                      HOUR_HEIGHT_PX -
                      2,
                  )
                : 0;

              return (
                <div
                  key={day.toISOString()}
                  data-day-index={day_index}
                  data-date={local_date_key(day)}
                  className="flex-1 min-w-0 relative border-l"
                  style={{
                    borderLeftColor: GRID_LINE_COLOR,
                  }}
                >
                  <div
                    data-create-area=""
                    className="absolute inset-0 z-[2]"
                    onPointerDown={(pointed) =>
                      handle_range_pointer_down(pointed, day_index)
                    }
                    onDoubleClick={(dbl) => {
                      const slot = Math.min(
                        SLOTS_PER_DAY - 1,
                        Math.max(
                          0,
                          Math.floor(minutes_at_pointer(dbl.clientY) / 30),
                        ),
                      );

                      on_slot_double_click(day_at_minutes(day, slot * 30));
                    }}
                    onPointerMove={handle_range_pointer_move}
                    onPointerUp={handle_range_pointer_up}
                  />

                  {range_drag?.day_index === day_index && range_preview && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[2px] right-[3px] z-[30] overflow-hidden pointer-events-none"
                      style={{
                        ...PLACEHOLDER_STYLE,
                        backgroundColor: placeholder_color,
                        top:
                          (range_preview.start_minutes / 30) *
                          HALF_HOUR_HEIGHT_PX,
                        height:
                          ((range_preview.end_minutes -
                            range_preview.start_minutes) /
                            30) *
                          HALF_HOUR_HEIGHT_PX,
                      }}
                    >
                      <span className="block truncate pl-2 pr-1.5 pt-[3px] text-[11px] font-semibold leading-[13px]">
                        {t("calendar.untitled_event")}
                      </span>
                      <span
                        className="block truncate pl-2 pr-1.5 text-[11px] font-medium leading-[13px] tabular-nums"
                        dir="ltr"
                      >
                        {format_clock(
                          day_at_minutes(
                            day,
                            range_preview.start_minutes,
                          ).toISOString(),
                        )}
                        {" - "}
                        {format_clock(
                          day_at_minutes(
                            day,
                            range_preview.end_minutes,
                          ).toISOString(),
                        )}
                      </span>
                    </span>
                  )}

                  {draft_range &&
                    !draft_range.is_all_day &&
                    is_same_day(draft_range.start, day) && (
                      <span
                        aria-hidden="true"
                        data-quick-anchor="true"
                        className="absolute left-[2px] right-[3px] z-[30] overflow-hidden pointer-events-none"
                        style={{
                          ...PLACEHOLDER_STYLE,
                          backgroundColor: draft_range.color
                            ? event_color_token(draft_range.color)
                            : placeholder_color,
                          top:
                            (minutes_from_midnight(draft_range.start) / 60) *
                            HOUR_HEIGHT_PX,
                          height: Math.max(
                            13,
                            ((draft_range.end.getTime() -
                              draft_range.start.getTime()) /
                              3_600_000) *
                              HOUR_HEIGHT_PX,
                          ),
                        }}
                      >
                        <span className="block truncate pl-2 pr-1.5 pt-[3px] text-[11px] font-semibold leading-[13px]">
                          {draft_range.title?.trim() ||
                            t("calendar.untitled_event")}
                        </span>
                        <span
                          className="block truncate pl-2 pr-1.5 text-[11px] font-medium leading-[13px] tabular-nums"
                          dir="ltr"
                        >
                          {format_clock(draft_range.start.toISOString())}
                          {" - "}
                          {format_clock(draft_range.end.toISOString())}
                        </span>
                      </span>
                    )}

                  {drag_preview && (
                    <span
                      aria-hidden="true"
                      data-drag-preview=""
                      className="absolute left-[2px] right-[3px] z-[45] flex flex-col overflow-hidden pointer-events-none"
                      style={{
                        top: Math.max(
                          0,
                          Math.min(
                            (drag_preview.start_minute / 60) * HOUR_HEIGHT_PX +
                              1,
                            (MINUTES_PER_DAY / 60) * HOUR_HEIGHT_PX -
                              drag_preview_height -
                              1,
                          ),
                        ),
                        height: drag_preview_height,
                        paddingInlineStart: is_phone ? 5 : 8,
                        paddingInlineEnd: is_phone ? 3 : 5,
                        paddingTop: drag_preview_height < 25 ? 0 : 3,
                        ...build_event_block_style(
                          resolve_event_color(
                            drag_preview.event,
                            calendar_by_id.get(drag_preview.event.calendar_id)
                              ?.color,
                          ),
                          { is_active: true, is_past: false },
                        ),
                        boxShadow: "0 6px 18px rgba(0, 0, 0, 0.22)",
                        opacity: 0.95,
                      }}
                    >
                      <span className="block truncate text-[12px] font-semibold leading-[15px]">
                        {drag_preview.event.title ||
                          t("calendar.untitled_event")}
                      </span>
                      {drag_preview_height >= 30 && (
                        <span
                          className="block truncate whitespace-nowrap text-[11px] leading-[14px] tabular-nums"
                          dir="ltr"
                        >
                          {format_clock(
                            at_day_minute(day, drag_preview.start_minute),
                          )}
                          {" - "}
                          {format_clock(
                            at_day_minute(day, drag_preview.end_minute),
                          )}
                        </span>
                      )}
                    </span>
                  )}

                  {day_events.map((event) => {
                    const is_dragging = event_drag?.event.id === event.id;
                    const is_live_drag = is_dragging && event_drag.moved;
                    const bounds = get_event_day_bounds(event, day);
                    const placement = layout.get(event.id) ?? {
                      column: 0,
                      column_count: 1,
                      span: 1,
                      stack_depth: 0,
                      order: 0,
                    };
                    const color = resolve_event_color(
                      event,
                      calendar_by_id.get(event.calendar_id)?.color,
                    );
                    const duration = bounds.end_minute - bounds.start_minute;
                    const is_active =
                      event_occurrence_key(event) === selected_event_id;
                    const slot_percent = 100 / placement.column_count;
                    const left_percent = placement.column * slot_percent;
                    const column_span = split_active ? 1 : placement.span;
                    const is_last_column =
                      placement.column + column_span >= placement.column_count;
                    const width_percent = is_last_column
                      ? 100 - left_percent
                      : slot_percent * column_span;
                    const stack_offset_px =
                      placement.stack_depth * STACK_OFFSET_PX;
                    const inset_px = 2 + stack_offset_px;
                    const trim_px = (is_last_column ? 8 : 4) + stack_offset_px;
                    const min_chip_height = short_events_full_size
                      ? HOUR_HEIGHT_PX / 2 - 2
                      : 13;
                    const chip_height = Math.max(
                      min_chip_height,
                      (duration / 60) * HOUR_HEIGHT_PX - 2,
                    );
                    const is_past =
                      dim_past_events &&
                      new Date(event.ends_at).getTime() < now.getTime();
                    const title_text =
                      event.title || t("calendar.untitled_event");
                    const start_text = format_clock(event.starts_at);
                    const end_text = format_clock(event.ends_at);
                    const time_range_text = `${start_text} - ${end_text}`;
                    const two_line_title =
                      chip_height >= 64 &&
                      width_percent >= 50 &&
                      placement.stack_depth === 0;
                    const can_resize =
                      chip_height >= 24 &&
                      !is_readonly_event(event) &&
                      event_ends_within_day(event, day);

                    return (
                      <CalendarEventContextMenu
                        actions={event_menu_actions}
                        calendars={calendars}
                        event={event}
                        key={event_render_key(event.id)}
                        t={t}
                      >
                        <button
                          data-event-id={event.id}
                          aria-label={t("calendar.a11y_timed_event_chip", {
                            calendar: calendar_name_of(event),
                            time: time_range_text,
                            title: title_text,
                          })}
                          data-event-block=""
                          {...(is_active || is_any_drag
                            ? {}
                            : event_tooltip.bind(tooltip_content_of(event)))}
                          className="absolute flex flex-col items-stretch justify-start text-start overflow-hidden leading-tight hover:z-30 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-color)] focus-visible:z-30 touch-pan-y select-none [-webkit-touch-callout:none]"
                          style={{
                            top: Math.max(
                              0,
                              Math.min(
                                (bounds.start_minute / 60) * HOUR_HEIGHT_PX + 1,
                                (MINUTES_PER_DAY / 60) * HOUR_HEIGHT_PX -
                                  chip_height -
                                  1,
                              ),
                            ),
                            height: chip_height,
                            insetInlineStart: `calc(${left_percent}% + ${inset_px}px)`,
                            width: `max(${MIN_CHIP_WIDTH_PX}px, calc(${width_percent}% - ${trim_px}px))`,
                            paddingInlineStart: is_phone ? 5 : 8,
                            paddingInlineEnd: is_phone ? 3 : 5,
                            paddingTop: chip_height < 25 ? 0 : 3,
                            paddingBottom: chip_height < 25 ? 0 : 3,
                            ...build_event_block_style(color, {
                              is_active,
                              is_past,
                            }),
                            cursor: is_live_drag ? "grabbing" : "pointer",
                            opacity: is_live_drag
                              ? 0.35
                              : is_past && !is_active
                                ? PAST_EVENT_OPACITY
                                : undefined,
                            transition: is_dragging ? "none" : undefined,
                            zIndex: is_active
                              ? 25
                              : 10 + Math.min(14, placement.order),
                          }}
                          type="button"
                          onClick={(clicked) => {
                            clicked.stopPropagation();

                            if (suppress_click_ref.current) {
                              suppress_click_ref.current = false;

                              return;
                            }

                            on_event_click(event);
                          }}
                          onContextMenu={(opened) => {
                            if (
                              touch_hold_ref.current ||
                              touch_drag_element_ref.current
                            ) {
                              opened.preventDefault();
                              opened.stopPropagation();
                            }
                          }}
                          onDoubleClick={(dbl) => {
                            dbl.stopPropagation();
                            event_menu_actions?.on_edit(event);
                          }}
                          onKeyDown={(key_event) =>
                            handle_timed_chip_key(key_event, event)
                          }
                          onPointerCancel={handle_event_pointer_cancel}
                          onPointerDown={(pointed) => {
                            const rect =
                              pointed.currentTarget.getBoundingClientRect();
                            const handle_px =
                              pointed.pointerType === "touch"
                                ? TOUCH_RESIZE_HANDLE_PX
                                : RESIZE_HANDLE_PX;
                            const mode =
                              can_resize &&
                              rect.bottom - pointed.clientY <= handle_px
                                ? "resize"
                                : "move";

                            handle_event_pointer_down(
                              pointed,
                              event,
                              day,
                              day_index,
                              mode,
                            );
                          }}
                          onPointerMove={(pointed) => {
                            handle_touch_hold_move(pointed);
                            handle_event_pointer_move(pointed);
                          }}
                          onPointerUp={handle_event_pointer_up}
                        >
                          {chip_height < 22 && (
                            <span
                              className="flex flex-wrap overflow-hidden text-[10.5px]"
                              style={{
                                height: Math.max(11, chip_height - 1),
                                lineHeight: `${Math.max(11, chip_height - 1)}px`,
                              }}
                            >
                              <span className="min-w-0 max-w-full truncate pe-1 font-semibold">
                                {title_text}
                              </span>
                              <span
                                className="shrink-0 whitespace-nowrap font-normal"
                                dir="ltr"
                              >
                                {start_text}
                              </span>
                            </span>
                          )}

                          {chip_height >= 22 && chip_height < 34 && (
                            <span className="flex h-[14px] flex-wrap overflow-hidden text-[11.5px] leading-[14px]">
                              <span className="min-w-0 max-w-full truncate pe-1 font-semibold">
                                {title_text}
                              </span>
                              <span
                                className="shrink-0 whitespace-nowrap font-normal"
                                dir="ltr"
                              >
                                {start_text}
                              </span>
                            </span>
                          )}

                          {chip_height >= 34 && (
                            <>
                              <span
                                className={`flex items-center gap-1 text-[12px] font-semibold leading-[15px]${days.length > 3 ? " max-sm:items-start max-sm:text-[10px] max-sm:leading-[12px]" : ""}`}
                              >
                                <EventKindIcon kind={event.event_kind} />
                                <span
                                  className={`min-w-0 ${two_line_title ? "line-clamp-2 whitespace-normal break-words" : "truncate"}${days.length > 3 ? " max-sm:whitespace-normal max-sm:[overflow-wrap:normal] max-sm:[word-break:keep-all] max-sm:line-clamp-3" : ""}${task_title_class(event)}`}
                                >
                                  {title_text}
                                </span>
                              </span>
                              <span
                                className={`block truncate whitespace-nowrap text-[11px] leading-[14px] font-normal tabular-nums${days.length > 3 ? " max-sm:hidden" : ""}`}
                                dir="ltr"
                              >
                                {duration >= 60 ? time_range_text : start_text}
                              </span>
                              {chip_height >= 50 &&
                                show_event_location &&
                                event.location.length > 0 && (
                                  <span className="block text-[11px] leading-[14px] opacity-70 truncate">
                                    {event.location}
                                  </span>
                                )}
                            </>
                          )}
                          {can_resize && !is_dragging && (
                            <span
                              aria-hidden="true"
                              className="absolute inset-x-0 bottom-0 h-[7px] cursor-ns-resize"
                            />
                          )}
                        </button>
                      </CalendarEventContextMenu>
                    );
                  })}
                </div>
              );
            })}

            <span aria-live="polite" className="sr-only">
              {live_message}
            </span>

            {shows_now_line && (
              <>
                <span className="sr-only">
                  {t("calendar.a11y_now_line", {
                    time: format_time(now, {
                      date_format: "MM/DD/YYYY",
                      time_format,
                    }),
                  })}
                </span>
                {days.length > 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{
                      top: now_top_px,
                      height: 2,
                      backgroundColor: `color-mix(in srgb, ${NOW_COLOR} 30%, transparent)`,
                    }}
                  />
                )}
                <span
                  aria-hidden="true"
                  className="absolute z-20 pointer-events-none"
                  style={{
                    top: now_top_px,
                    insetInlineStart: `${(today_index * 100) / days.length}%`,
                    width: `${100 / days.length}%`,
                    height: 2,
                    backgroundColor: NOW_COLOR,
                  }}
                />
                <span
                  aria-hidden="true"
                  className="absolute z-20 pointer-events-none rounded-full -translate-x-1/2 -translate-y-1/2 ring-2 ring-[var(--bg-primary)] rtl:translate-x-1/2"
                  style={{
                    height: "var(--calendar_now_dot_size, 8px)",
                    width: "var(--calendar_now_dot_size, 8px)",
                    top: now_top_px + 1,
                    insetInlineStart: `${(today_index * 100) / days.length}%`,
                    backgroundColor: NOW_COLOR,
                  }}
                />
              </>
            )}
          </div>

          {shows_now_line && !is_phone && (
            <span
              className="absolute z-20 pointer-events-none inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold leading-[18px] tracking-[-0.01em] tabular-nums -translate-y-1/2 whitespace-nowrap overflow-hidden text-ellipsis ring-2 ring-[var(--bg-primary)]"
              dir="ltr"
              style={{
                top: now_top_px + 1,
                insetInlineEnd: `calc(100% - ${GUTTER_WIDTH_PX}px + 3px)`,
                maxWidth: GUTTER_WIDTH_PX - 5,
                color: "var(--calendar_today_marker_text, #ffffff)",
                backgroundColor:
                  "var(--calendar_today_marker_bg, var(--accent-color))",
              }}
            >
              {format_time(now, {
                date_format: "MM/DD/YYYY",
                time_format,
              })}
            </span>
          )}
        </div>
        {shows_now_line && now_position === "below" && (
          <div className="pointer-events-none sticky bottom-3 z-30 flex h-0 items-end justify-center">
            <JumpToNowButton
              direction="down"
              label={t("calendar.jump_to_now")}
              on_click={scroll_to_now}
            />
          </div>
        )}
      </div>
      {event_tooltip.element}
    </div>
  );
});

function JumpToNowButton({
  direction,
  label,
  on_click,
}: {
  direction: "up" | "down";
  label: string;
  on_click: () => void;
}) {
  const Icon = direction === "up" ? ArrowUpIcon : ArrowDownIcon;

  return (
    <button
      className={`pointer-events-auto inline-flex h-8 cursor-pointer items-center gap-1.5 aster_floating rounded-full ps-2.5 pe-3 text-[12.5px] font-medium text-txt-primary transition-colors duration-150 hover:bg-[var(--aster-floating-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] ${
        direction === "down" ? "-translate-y-full" : ""
      }`}
      data-testid="calendar-jump-to-now"
      type="button"
      onClick={on_click}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}
