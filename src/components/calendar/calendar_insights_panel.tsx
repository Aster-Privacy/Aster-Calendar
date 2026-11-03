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
import type {
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";
import type { CalendarInsightSlice } from "@/services/calendar/time_insights";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
} from "@heroicons/react/16/solid";

import {
  Badge,
  Island,
  IslandIconButton,
  SegmentedToggle,
  Spinner,
  Tooltip,
} from "@aster/ui";

import { CalendarEmptyState } from "@/components/calendar/calendar_empty_state";
import { event_color_token } from "@/components/calendar/calendar_utils";
import { EmptyScheduleIllustration } from "@/components/calendar/illustrations/calendar_illustrations";
import { ContactAvatar } from "@/components/common/contacts/contact_avatar";
import { use_should_reduce_motion } from "@/provider";
import {
  build_time_insights,
  days_in_span,
  month_bounds,
  previous_range,
  trailing_weeks_bounds,
  week_bounds,
} from "@/services/calendar/time_insights";
import { blur_segment_after_pointer } from "@/components/calendar/segment_pointer_blur";
import { use_calendar_today } from "@/components/calendar/use_calendar_now_tick";

const PANEL_WIDTH = "min(320px, 78vw)";
const PANEL_GAP_PX = 8;
const TRAILING_WEEKS = 4;
const CHART_HEIGHT_PX = 120;
const BAR_RADIUS_PX = 5;
const SEGMENT_GAP_PX = 1;
const AXIS_STEPS_MINUTES = [15, 30, 60, 120, 180, 240, 360, 480, 720];
const EMPTY_TICK_PX = 2;
const TOOLTIP_GAP_PX = 10;
const TOOLTIP_CHART_ALLOWANCE_PX = 16;
const TOOLTIP_INSET_PX = 8;
const DAY_LABEL_STEP = 7;
const EMPTY_EVENTS: DecryptedCalendarEvent[] = [];

type InsightsPeriod = "week" | "four_weeks" | "month";

interface ChartColumn {
  key: string;
  label: string;
  date_label: string;
  minutes: number;
  event_count: number;
  per_calendar: CalendarInsightSlice[];
  is_today: boolean;
}

interface InsightsSnapshot {
  events: DecryptedCalendarEvent[];
  range_start: Date;
  range_end: Date;
  previous_start: Date;
}

interface TooltipAnchor {
  x: number;
  top: number;
  bottom: number;
  half_width: number;
  chart_top: number;
  panel: DOMRect;
}

interface CalendarInsightsPanelProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  language: string;
  calendar_by_id: Map<string, DecryptedCalendar>;
  self_email: string;
  week_start_day: number;
  load_events: (start: Date, end: Date) => Promise<DecryptedCalendarEvent[]>;
  on_dismiss: () => void;
}

type Translate = CalendarInsightsPanelProps["t"];

export function format_minutes(
  minutes: number,
  t: Translate,
  language: string,
): string {
  const number_format = new Intl.NumberFormat(language, {
    maximumFractionDigits: 0,
  });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) {
    return t("calendar.insights_minutes", {
      count: number_format.format(rest),
    });
  }

  if (rest === 0) {
    return t("calendar.insights_hours", { count: number_format.format(hours) });
  }

  return t("calendar.insights_hours_minutes", {
    hours: number_format.format(hours),
    minutes: number_format.format(rest),
  });
}

function add_days(date: Date, days: number): Date {
  const result = new Date(date);

  result.setDate(result.getDate() + days);

  return result;
}

export function compute_range(
  today: Date,
  period: InsightsPeriod,
  offset: number,
  week_start_day: number,
): [Date, Date] {
  if (period === "week") {
    return week_bounds(add_days(today, offset * 7), week_start_day);
  }

  if (period === "four_weeks") {
    return trailing_weeks_bounds(
      add_days(today, offset * 7 * TRAILING_WEEKS),
      week_start_day,
      TRAILING_WEEKS,
    );
  }

  return month_bounds(
    new Date(today.getFullYear(), today.getMonth() + offset, 1),
  );
}

function count_events_per_day(
  events: DecryptedCalendarEvent[],
  self_email: string,
  range_start: Date,
  range_end: Date,
): Map<string, number> {
  const normalized_self = self_email.trim().toLowerCase();
  const counts = new Map<string, number>();

  for (const event of events) {
    if (event.is_all_day || event.status === "cancelled") {
      continue;
    }

    const declined = event.attendees.some(
      (attendee) =>
        attendee.email.trim().toLowerCase() === normalized_self &&
        attendee.response === "declined",
    );

    if (declined && normalized_self.length > 0) {
      continue;
    }

    const starts_at = new Date(event.starts_at);

    if (starts_at < range_start || starts_at >= range_end) {
      continue;
    }

    const key = starts_at.toDateString();

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function segment_heights(column: ChartColumn, bar_height: number): number[] {
  const slices = column.per_calendar.filter((slice) => slice.minutes > 0);
  const usable = Math.max(
    bar_height - SEGMENT_GAP_PX * Math.max(slices.length - 1, 0),
    slices.length,
  );

  return slices.map((slice) =>
    Math.max(1, Math.round((slice.minutes / column.minutes) * usable)),
  );
}

function column_height(column: ChartColumn, scale_minutes: number): number {
  if (column.minutes === 0 || scale_minutes === 0) {
    return 0;
  }

  return Math.max(
    BAR_RADIUS_PX,
    Math.round((column.minutes / scale_minutes) * CHART_HEIGHT_PX),
  );
}

function axis_step(max_minutes: number): number {
  return (
    AXIS_STEPS_MINUTES.find((step) => step * 2 >= max_minutes) ??
    Math.ceil(max_minutes / 120) * 60
  );
}

function column_gap(count: number): number {
  if (count <= 7) {
    return 10;
  }

  return count <= 14 ? 5 : 2;
}

function ColorDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function ChartTooltip({
  column,
  anchor,
  color_of,
  name_of,
  t,
  language,
}: {
  column: ChartColumn;
  anchor: TooltipAnchor;
  color_of: (calendar_id: string) => string;
  name_of: (calendar_id: string) => string;
  t: Translate;
  language: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, set_placement] = useState<{
    left: number;
    top: number;
    side: "above" | "beside" | "below";
  } | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const min_left = anchor.panel.left + TOOLTIP_INSET_PX;
    const max_left = anchor.panel.right - TOOLTIP_INSET_PX - width;
    const left = Math.min(Math.max(anchor.x - width / 2, min_left), max_left);
    const above_top = anchor.top - TOOLTIP_GAP_PX - height;

    if (above_top >= anchor.chart_top - TOOLTIP_CHART_ALLOWANCE_PX) {
      set_placement({ left, side: "above", top: above_top });

      return;
    }

    const right_left = anchor.x + anchor.half_width + TOOLTIP_GAP_PX;
    const left_left = anchor.x - anchor.half_width - TOOLTIP_GAP_PX - width;
    const side_left =
      right_left + width <= anchor.panel.right - TOOLTIP_INSET_PX
        ? right_left
        : left_left >= min_left
          ? left_left
          : null;

    if (side_left === null) {
      set_placement({
        left,
        side: "below",
        top: anchor.bottom + TOOLTIP_GAP_PX,
      });

      return;
    }

    const side_top = Math.max(
      anchor.chart_top,
      Math.min(anchor.top, anchor.bottom - height),
    );

    set_placement({ left: side_left, side: "beside", top: side_top });
  }, [anchor, column.key]);

  const slices = column.per_calendar.filter((slice) => slice.minutes > 0);

  return createPortal(
    <div
      ref={ref}
      aria-hidden="true"
      className="aster_floating pointer-events-none fixed z-[80] min-w-[184px] max-w-[260px] px-3 py-2.5 text-[12.5px] leading-[1.4]"
      data-placement={placement?.side ?? "above"}
      data-testid="calendar-insights-tooltip"
      role="tooltip"
      style={{
        left: placement?.left ?? anchor.x,
        top: placement?.top ?? anchor.top,
        visibility: placement ? "visible" : "hidden",
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-txt-primary">
          {column.date_label}
        </span>
        <span className="tabular-nums text-txt-primary">
          {format_minutes(column.minutes, t, language)}
        </span>
      </div>
      <div className="text-[12px] text-txt-secondary">
        {t("calendar.insights_events_count", { count: column.event_count })}
      </div>
      {slices.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5 pt-2 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--text-primary)_10%,transparent)]">
          {slices.map((slice) => (
            <li
              key={slice.calendar_id}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex min-w-0 items-center gap-2 text-txt-secondary">
                <ColorDot color={color_of(slice.calendar_id)} />
                <span className="truncate">{name_of(slice.calendar_id)}</span>
              </span>
              <span className="flex-shrink-0 tabular-nums text-txt-primary">
                {format_minutes(slice.minutes, t, language)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>,
    document.body,
  );
}

function CalendarShareRow({
  color,
  name,
  minutes,
  share,
  t,
  language,
  percent_format,
}: {
  color: string;
  name: string;
  minutes: number;
  share: number;
  t: Translate;
  language: string;
  percent_format: Intl.NumberFormat;
}) {
  return (
    <li className="flex min-h-9 items-center gap-2.5 rounded-[var(--aster-radius-item,8px)] px-2 py-1.5 text-[13px] leading-[1.35] transition-colors duration-100 hover:bg-[var(--aster-hover)]">
      <ColorDot color={color} />
      <span className="min-w-0 flex-1 truncate text-txt-primary">{name}</span>
      <span className="flex-shrink-0 tabular-nums text-txt-primary">
        {format_minutes(minutes, t, language)}
      </span>
      <span className="w-10 flex-shrink-0 text-end tabular-nums text-txt-secondary">
        {percent_format.format(share)}
      </span>
    </li>
  );
}

export function CalendarInsightsPanel({
  t,
  language,
  calendar_by_id,
  self_email,
  week_start_day,
  load_events,
  on_dismiss,
}: CalendarInsightsPanelProps) {
  const reduce_motion = use_should_reduce_motion();
  const [period, set_period] = useState<InsightsPeriod>("week");
  const [offset, set_offset] = useState(0);
  const [snapshot, set_snapshot] = useState<InsightsSnapshot | null>(null);
  const [hovered_index, set_hovered_index] = useState<number | null>(null);
  const [anchor, set_anchor] = useState<TooltipAnchor | null>(null);
  const aside_ref = useRef<HTMLElement>(null);
  const bars_ref = useRef<HTMLDivElement>(null);
  const today = use_calendar_today();

  const [range_start, range_end] = useMemo(
    () => compute_range(today, period, offset, week_start_day),
    [today, period, offset, week_start_day],
  );
  const [previous_start] = useMemo(
    () => previous_range(range_start, range_end, period),
    [range_start, range_end, period],
  );

  useEffect(() => {
    let cancelled = false;
    const apply = (loaded: DecryptedCalendarEvent[]) => {
      if (!cancelled) {
        set_snapshot({
          events: loaded,
          previous_start,
          range_end,
          range_start,
        });
      }
    };

    load_events(previous_start, range_end)
      .then(apply)
      .catch(() => apply([]));

    return () => {
      cancelled = true;
    };
  }, [load_events, previous_start, range_start, range_end]);

  useEffect(() => {
    set_hovered_index(null);
    set_anchor(null);
  }, [period, offset, snapshot]);

  const is_first_load = snapshot === null;
  const is_refreshing =
    snapshot !== null &&
    (snapshot.range_start.getTime() !== range_start.getTime() ||
      snapshot.range_end.getTime() !== range_end.getTime());
  const events = snapshot?.events ?? EMPTY_EVENTS;
  const shown_start = snapshot?.range_start ?? range_start;
  const shown_end = snapshot?.range_end ?? range_end;
  const shown_previous_start = snapshot?.previous_start ?? previous_start;

  const insights = useMemo(
    () => build_time_insights(events, shown_start, shown_end, self_email),
    [events, shown_start, shown_end, self_email],
  );
  const previous_insights = useMemo(
    () =>
      build_time_insights(
        events,
        shown_previous_start,
        shown_start,
        self_email,
      ),
    [events, shown_previous_start, shown_start, self_email],
  );

  const percent_format = useMemo(
    () =>
      new Intl.NumberFormat(language, {
        maximumFractionDigits: 0,
        style: "percent",
      }),
    [language],
  );
  const weekday_format = useMemo(
    () => new Intl.DateTimeFormat(language, { weekday: "narrow" }),
    [language],
  );
  const day_format = useMemo(
    () => new Intl.DateTimeFormat(language, { day: "numeric" }),
    [language],
  );
  const long_day_format = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        day: "numeric",
        month: "short",
        weekday: "short",
      }),
    [language],
  );
  const short_date_format = useMemo(
    () => new Intl.DateTimeFormat(language, { day: "numeric", month: "short" }),
    [language],
  );
  const month_format = useMemo(
    () => new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }),
    [language],
  );

  const range_label = useMemo(() => {
    if (period === "month") {
      return month_format.format(range_start);
    }

    const last_day = add_days(range_end, -1);
    const same_month =
      last_day.getMonth() === range_start.getMonth() &&
      last_day.getFullYear() === range_start.getFullYear();

    return t("calendar.insights_range", {
      end: same_month
        ? day_format.format(last_day)
        : short_date_format.format(last_day),
      start: short_date_format.format(range_start),
    });
  }, [
    period,
    range_start,
    range_end,
    month_format,
    day_format,
    short_date_format,
    t,
  ]);

  const color_of = (calendar_id: string) =>
    event_color_token(calendar_by_id.get(calendar_id)?.color);
  const name_of = (calendar_id: string) =>
    calendar_by_id.get(calendar_id)?.name ??
    t("calendar.insights_unknown_calendar");

  const span = days_in_span(shown_start, shown_end);
  const columns = useMemo<ChartColumn[]>(() => {
    const today_key = today.toDateString();
    const counts = count_events_per_day(
      events,
      self_email,
      shown_start,
      shown_end,
    );
    const last_index = insights.per_day.length - 1;

    return insights.per_day.map((day, index) => ({
      date_label: long_day_format.format(day.date),
      event_count: counts.get(day.day_key) ?? 0,
      is_today: day.day_key === today_key,
      key: day.day_key,
      label:
        span <= 7
          ? weekday_format.format(day.date)
          : index === last_index ||
              (index % DAY_LABEL_STEP === 0 &&
                last_index - index >= DAY_LABEL_STEP / 2)
            ? day_format.format(day.date)
            : "",
      minutes: day.minutes,
      per_calendar: day.per_calendar,
    }));
  }, [
    insights.per_day,
    events,
    self_email,
    shown_start,
    shown_end,
    today,
    span,
    weekday_format,
    day_format,
    long_day_format,
  ]);

  const max_minutes = useMemo(
    () => columns.reduce((max, column) => Math.max(max, column.minutes), 0),
    [columns],
  );
  const step_minutes = axis_step(max_minutes);
  const scale_minutes = step_minutes * 2;
  const gap_px = column_gap(columns.length);

  const show_column = (index: number) => {
    const bars = bars_ref.current;
    const aside = aside_ref.current;
    const column = columns[index];

    if (!bars || !aside || !column) {
      return;
    }

    const rect = bars.getBoundingClientRect();
    const slot = rect.width / columns.length;
    const height = column_height(column, scale_minutes);

    set_hovered_index(index);
    set_anchor({
      bottom: rect.bottom,
      chart_top: rect.top,
      half_width: slot / 2,
      panel: aside.getBoundingClientRect(),
      top: rect.bottom - Math.max(height, EMPTY_TICK_PX),
      x: rect.left + slot * (index + 0.5),
    });
  };

  const move_column_focus = (
    key_event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const last = columns.length - 1;
    const targets: Record<string, number> = {
      ArrowLeft: Math.max(0, index - 1),
      ArrowRight: Math.min(last, index + 1),
      Home: 0,
      End: last,
    };
    const target = targets[key_event.key];

    if (target === undefined) {
      return;
    }

    key_event.preventDefault();
    bars_ref.current
      ?.querySelector<HTMLButtonElement>(`[data-chart-column="${target}"]`)
      ?.focus();
  };

  const hide_column = () => {
    set_hovered_index(null);
    set_anchor(null);
  };

  const handle_pointer_move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bars = bars_ref.current;

    if (!bars || columns.length === 0) {
      return;
    }

    const rect = bars.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.min(
      columns.length - 1,
      Math.max(0, Math.floor(ratio * columns.length)),
    );

    if (index !== hovered_index) {
      show_column(index);
    }
  };

  const total = insights.scheduled_minutes;
  const previous_total = previous_insights.scheduled_minutes;
  const difference = total - previous_total;
  const per_day = Math.round(total / span);
  const compare_label =
    period === "week"
      ? t(
          offset === 0
            ? "calendar.insights_compare_last_week"
            : "calendar.insights_compare_week_before",
        )
      : period === "four_weeks"
        ? t(
            offset === 0
              ? "calendar.insights_compare_previous_weeks"
              : "calendar.insights_compare_weeks_before",
            { count: TRAILING_WEEKS },
          )
        : t(
            offset === 0
              ? "calendar.insights_compare_last_month"
              : "calendar.insights_compare_month_before",
          );
  const delta_label =
    difference === 0
      ? t("calendar.insights_same_as", { period: compare_label })
      : t(
          difference > 0
            ? "calendar.insights_more_than"
            : "calendar.insights_less_than",
          {
            period: compare_label,
            time: format_minutes(Math.abs(difference), t, language),
          },
        );
  const versus_label =
    period === "week"
      ? t(
          offset === 0
            ? "calendar.insights_vs_last_week"
            : "calendar.insights_vs_week_before",
        )
      : period === "four_weeks"
        ? t(
            offset === 0
              ? "calendar.insights_vs_previous_weeks"
              : "calendar.insights_vs_weeks_before",
            { count: TRAILING_WEEKS },
          )
        : t(
            offset === 0
              ? "calendar.insights_vs_last_month"
              : "calendar.insights_vs_month_before",
          );

  const busiest = insights.per_day.find(
    (day) => day.day_key === insights.busiest_day,
  );
  const longest = insights.longest_event;
  const has_data = insights.event_count > 0;
  const hovered_column =
    hovered_index === null ? null : (columns[hovered_index] ?? null);

  const period_options = [
    { label: t("calendar.insights_week"), value: "week" },
    { label: t("calendar.insights_four_weeks"), value: "four_weeks" },
    { label: t("calendar.insights_month"), value: "month" },
  ];

  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="pointer-events-none absolute inset-y-0 end-0 z-20 flex flex-shrink-0 justify-end overflow-hidden xl:pointer-events-auto xl:static xl:z-auto"
      data-testid="calendar-insights-panel"
      exit={reduce_motion ? undefined : { opacity: 0, x: 8 }}
      initial={reduce_motion ? false : { opacity: 0, x: 8 }}
      style={{ width: `calc(${PANEL_WIDTH} + ${PANEL_GAP_PX}px)` }}
      transition={{ duration: reduce_motion ? 0 : 0.16, ease: [0.2, 0, 0, 1] }}
    >
      <aside
        ref={aside_ref}
        aria-label={t("calendar.insights")}
        className="pointer-events-auto flex h-full flex-shrink-0 flex-col overflow-hidden rounded-[var(--aster-island-radius)] bg-surf-primary shadow-[0_8px_32px_rgba(0,0,0,0.18)] xl:shadow-none"
        style={{ width: PANEL_WIDTH }}
      >
        <div className="flex h-12 flex-shrink-0 items-center gap-1 ps-4 pe-2">
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium text-txt-primary">
            {t("calendar.insights")}
          </h2>
          <Tooltip tip={t("common.close")}>
            <IslandIconButton
              className="flex-shrink-0 text-txt-secondary"
              label={t("common.close")}
              size="sm"
              onClick={on_dismiss}
            >
              <XMarkIcon className="h-4 w-4" />
            </IslandIconButton>
          </Tooltip>
        </div>

        <div className="flex flex-shrink-0 flex-col gap-2 px-4 pb-2">
          <div onClick={blur_segment_after_pointer}>
            <SegmentedToggle
              aria-label={t("calendar.insights_period")}
              className="w-full"
              name="calendar_insights_period"
              options={period_options}
              role="radiogroup"
              value={period}
              on_change={(value) => {
                set_period(value as InsightsPeriod);
                set_offset(0);
              }}
            />
          </div>
          <div className="flex items-center gap-1">
            <IslandIconButton
              className="flex-shrink-0 text-txt-secondary"
              data-testid="calendar-insights-previous"
              label={t("calendar.insights_previous_period")}
              size="sm"
              onClick={() => set_offset((value) => value - 1)}
            >
              <ChevronLeftIcon className="h-4 w-4 rtl:-scale-x-100" />
            </IslandIconButton>
            <span
              className="min-w-0 flex-1 truncate text-center text-[13px] font-medium text-txt-primary"
              data-testid="calendar-insights-range"
            >
              {range_label}
            </span>
            <IslandIconButton
              className="flex-shrink-0 text-txt-secondary"
              data-testid="calendar-insights-next"
              label={t("calendar.insights_next_period")}
              size="sm"
              onClick={() => set_offset((value) => value + 1)}
            >
              <ChevronRightIcon className="h-4 w-4 rtl:-scale-x-100" />
            </IslandIconButton>
          </div>
        </div>

        <div
          aria-busy={is_first_load || is_refreshing}
          className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-6 transition-opacity duration-150 ease-[var(--aster-island-ease)] motion-reduce:transition-none ${
            is_refreshing ? "opacity-60" : "opacity-100"
          }`}
          onScroll={hide_column}
        >
          {is_first_load ? (
            <div className="flex flex-1 items-center justify-center py-12">
              <Spinner size="sm" />
            </div>
          ) : !has_data ? (
            <CalendarEmptyState
              body={t("calendar.insights_empty")}
              compact
              data-testid="calendar-insights-empty"
              illustration={<EmptyScheduleIllustration />}
              title={t("calendar.insights_empty_title")}
            />
          ) : (
            <>
              <Island
                as="section"
                className="mt-2"
                data-testid="calendar-insights-summary"
                padding="md"
              >
                <p className="text-[12px] font-medium text-txt-secondary">
                  {t("calendar.insights_hours_per_day")}
                </p>
                <p
                  className="mt-1.5 text-[28px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-txt-primary"
                  data-testid="calendar-insights-total"
                >
                  {format_minutes(total, t, language)}
                </p>
                <div
                  className="mt-3 flex min-w-0 items-center gap-2"
                  data-testid="calendar-insights-delta"
                >
                  {difference !== 0 && (
                    <span className="sr-only">{delta_label}</span>
                  )}
                  {difference === 0 ? (
                    <span className="truncate text-[12.5px] leading-5 text-txt-secondary">
                      {delta_label}
                    </span>
                  ) : (
                    <>
                      <Badge
                        aria-hidden="true"
                        className="flex-shrink-0"
                        color={difference > 0 ? "blue" : "gray"}
                      >
                        {difference > 0 ? (
                          <ArrowTrendingUpIcon className="h-3.5 w-3.5 flex-shrink-0" />
                        ) : (
                          <ArrowTrendingDownIcon className="h-3.5 w-3.5 flex-shrink-0" />
                        )}
                        <span className="tabular-nums">
                          {format_minutes(Math.abs(difference), t, language)}
                        </span>
                      </Badge>
                      <span
                        aria-hidden="true"
                        className="min-w-0 truncate text-[12.5px] leading-5 text-txt-secondary"
                      >
                        {versus_label}
                      </span>
                    </>
                  )}
                </div>
                <p className="mt-2 text-[12.5px] leading-[1.4] text-txt-secondary">
                  {t("calendar.insights_per_day", {
                    time: format_minutes(per_day, t, language),
                  })}
                </p>

                <div
                  aria-label={t("calendar.insights_chart_label_days")}
                  className="mt-5 select-none"
                  data-testid="calendar-insights-chart"
                  role="group"
                  onPointerLeave={hide_column}
                  onPointerMove={handle_pointer_move}
                >
                  <div className="flex gap-2">
                    <div className="relative min-w-0 flex-1">
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 flex flex-col justify-between"
                      >
                        <span className="h-px w-full bg-[color-mix(in_srgb,var(--text-primary)_7%,transparent)]" />
                        <span className="h-px w-full bg-[color-mix(in_srgb,var(--text-primary)_7%,transparent)]" />
                        <span className="h-px w-full bg-[color-mix(in_srgb,var(--text-primary)_16%,transparent)]" />
                      </div>
                      <div
                        ref={bars_ref}
                        className="relative flex items-end"
                        style={{ gap: gap_px, height: CHART_HEIGHT_PX }}
                      >
                        {columns.map((column, index) => {
                          const height = column_height(column, scale_minutes);
                          const heights = segment_heights(column, height);
                          const slices = column.per_calendar.filter(
                            (slice) => slice.minutes > 0,
                          );
                          const dimmed =
                            hovered_index !== null && hovered_index !== index;

                          return (
                            <button
                              key={column.key}
                              aria-label={`${column.date_label}: ${format_minutes(column.minutes, t, language)}`}
                              className={`flex h-full min-w-0 flex-1 cursor-default flex-col justify-end rounded-[3px] p-0 outline-none transition-opacity duration-150 ease-[var(--aster-island-ease)] focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] motion-reduce:transition-none ${
                                dimmed ? "opacity-40" : "opacity-100"
                              }`}
                              data-chart-column={index}
                              data-hovered={
                                hovered_index === index || undefined
                              }
                              tabIndex={index === (hovered_index ?? 0) ? 0 : -1}
                              type="button"
                              onBlur={hide_column}
                              onFocus={() => show_column(index)}
                              onKeyDown={(key_event) =>
                                move_column_focus(key_event, index)
                              }
                            >
                              {slices.length === 0 ? (
                                <div
                                  aria-hidden="true"
                                  className="w-full rounded-full bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)]"
                                  style={{ height: EMPTY_TICK_PX }}
                                />
                              ) : (
                                <div
                                  className="flex w-full flex-col-reverse overflow-hidden"
                                  style={{
                                    borderRadius: `${BAR_RADIUS_PX}px ${BAR_RADIUS_PX}px 2px 2px`,
                                    gap: SEGMENT_GAP_PX,
                                    height,
                                  }}
                                >
                                  {slices.map((slice, slice_index) => (
                                    <div
                                      key={slice.calendar_id}
                                      className="w-full flex-shrink-0"
                                      style={{
                                        backgroundColor: color_of(
                                          slice.calendar_id,
                                        ),
                                        height: heights[slice_index],
                                      }}
                                    />
                                  ))}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div
                      aria-hidden="true"
                      className="relative w-9 flex-shrink-0 text-[10.5px] leading-none tabular-nums text-txt-secondary"
                      style={{ height: CHART_HEIGHT_PX }}
                    >
                      {[2, 1, 0].map((multiple) => (
                        <span
                          key={multiple}
                          className="absolute start-0 -translate-y-1/2 whitespace-nowrap"
                          style={{
                            top: `${((2 - multiple) / 2) * 100}%`,
                          }}
                        >
                          {multiple === 0
                            ? "0"
                            : format_minutes(
                                step_minutes * multiple,
                                t,
                                language,
                              )}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div aria-hidden="true" className="mt-2 flex gap-2">
                    <div
                      className="flex min-w-0 flex-1"
                      style={{ gap: gap_px }}
                    >
                      {columns.map((column, index) => (
                        <span
                          key={column.key}
                          className="relative h-4 min-w-0 flex-1"
                        >
                          <span
                            className={`absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap text-[11px] leading-4 tabular-nums ${
                              column.is_today
                                ? "font-semibold text-brand"
                                : hovered_index === index
                                  ? "font-medium text-txt-primary"
                                  : "text-txt-secondary"
                            }`}
                          >
                            {column.label}
                          </span>
                        </span>
                      ))}
                    </div>
                    <span className="w-9 flex-shrink-0" />
                  </div>
                </div>
              </Island>

              <Island as="section" className="mt-2" padding="md">
                <h3 className="text-[13px] font-medium text-txt-primary">
                  {t("calendar.insights_by_calendar")}
                </h3>
                <div
                  aria-hidden="true"
                  className="mt-3 flex h-2 w-full gap-[3px]"
                >
                  {insights.per_calendar.map((slice) => (
                    <span
                      key={slice.calendar_id}
                      className="h-full min-w-[6px] rounded-full"
                      style={{
                        backgroundColor: color_of(slice.calendar_id),
                        flexBasis: 0,
                        flexGrow: slice.minutes,
                      }}
                    />
                  ))}
                </div>
                <ul
                  className="-mx-2 mt-2.5 flex flex-col"
                  data-testid="calendar-insights-calendars"
                >
                  {insights.per_calendar.map((slice) => (
                    <CalendarShareRow
                      key={slice.calendar_id}
                      color={color_of(slice.calendar_id)}
                      language={language}
                      minutes={slice.minutes}
                      name={name_of(slice.calendar_id)}
                      percent_format={percent_format}
                      share={total === 0 ? 0 : slice.minutes / total}
                      t={t}
                    />
                  ))}
                </ul>
              </Island>

              <section
                className="mt-2 grid grid-cols-2 gap-2"
                data-testid="calendar-insights-highlights"
              >
                {busiest && (
                  <Island
                    className="min-w-0"
                    data-testid="calendar-insights-busiest"
                    padding="md"
                  >
                    <p className="text-[12px] font-medium leading-[1.4] text-txt-secondary">
                      {t("calendar.insights_busiest")}
                    </p>
                    <p className="mt-1.5 text-[18px] font-semibold leading-tight tabular-nums tracking-[-0.01em] text-txt-primary">
                      {format_minutes(busiest.minutes, t, language)}
                    </p>
                    <p className="mt-1 truncate text-[12px] leading-[1.4] text-txt-secondary">
                      {long_day_format.format(busiest.date)}
                    </p>
                  </Island>
                )}
                {longest && (
                  <Island
                    className="min-w-0"
                    data-testid="calendar-insights-longest"
                    padding="md"
                  >
                    <p className="text-[12px] font-medium leading-[1.4] text-txt-secondary">
                      {t("calendar.insights_longest_event")}
                    </p>
                    <p className="mt-1.5 text-[18px] font-semibold leading-tight tabular-nums tracking-[-0.01em] text-txt-primary">
                      {format_minutes(longest.minutes, t, language)}
                    </p>
                    <p className="mt-1 truncate text-[12px] leading-[1.4] text-txt-secondary">
                      {longest.title.trim().length > 0
                        ? longest.title
                        : t("calendar.untitled_event")}
                    </p>
                  </Island>
                )}
              </section>

              {insights.top_guests.length > 0 && (
                <Island as="section" className="mt-2" padding="md">
                  <h3 className="text-[13px] font-medium text-txt-primary">
                    {t("calendar.insights_top_guests")}
                  </h3>
                  <ul
                    className="-mx-2 mt-2 flex flex-col"
                    data-testid="calendar-insights-guests"
                  >
                    {insights.top_guests.map((guest) => (
                      <li
                        key={guest.email}
                        className="flex items-center gap-3 rounded-[var(--aster-radius-item,8px)] px-2 py-2 transition-colors duration-100 hover:bg-[var(--aster-hover)]"
                      >
                        <ContactAvatar
                          className="flex-shrink-0"
                          email={guest.email}
                          name={guest.display_name ?? undefined}
                          size_px={28}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] leading-[1.35] text-txt-primary">
                            {guest.display_name ?? guest.email}
                          </p>
                          <p className="truncate text-[12px] leading-[1.35] text-txt-secondary">
                            {t("calendar.insights_meetings_count", {
                              count: guest.meetings,
                            })}
                          </p>
                        </div>
                        <span className="flex-shrink-0 text-[13px] tabular-nums text-txt-primary">
                          {format_minutes(guest.minutes, t, language)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Island>
              )}
            </>
          )}
        </div>
      </aside>

      {hovered_column && anchor && (
        <ChartTooltip
          anchor={anchor}
          color_of={color_of}
          column={hovered_column}
          language={language}
          name_of={name_of}
          t={t}
        />
      )}
    </motion.div>
  );
}
