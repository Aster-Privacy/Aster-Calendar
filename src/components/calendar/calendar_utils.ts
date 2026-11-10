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
import type {
  CalendarTag,
  CalendarViewMode,
  DecryptedCalendarEvent,
} from "@/types/calendar";
import type { CSSProperties } from "react";

import type { TranslationKey } from "@/lib/i18n/types";

import {
  TAG_COLOR_PRESETS,
  type TagColorVariant,
  tag_color_label_key,
} from "@/components/ui/email_tag";
import { BIRTHDAY_COLOR } from "@/services/calendar/birthdays";

export const MINUTES_PER_DAY = 24 * 60;

export function start_of_day(date: Date): Date {
  const next = new Date(date);

  next.setHours(0, 0, 0, 0);

  return next;
}

export function end_of_day(date: Date): Date {
  const next = new Date(date);

  next.setHours(23, 59, 59, 999);

  return next;
}

export function add_days(date: Date, days: number): Date {
  const next = new Date(date);

  next.setDate(next.getDate() + days);

  return next;
}

export function add_months(date: Date, months: number): Date {
  const next = new Date(date);
  const target_day = next.getDate();

  next.setDate(1);
  next.setMonth(next.getMonth() + months);

  const days_in_target = new Date(
    next.getFullYear(),
    next.getMonth() + 1,
    0,
  ).getDate();

  next.setDate(Math.min(target_day, days_in_target));

  return next;
}

export function add_years(date: Date, years: number): Date {
  return add_months(date, years * 12);
}

export function is_same_day(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function week_start_day_index(value: string | undefined): number {
  if (value === "monday") {
    return 1;
  }

  if (value === "saturday") {
    return 6;
  }

  return 0;
}

export function start_of_week(date: Date, week_start_day: number): Date {
  const next = start_of_day(date);
  const day = next.getDay();
  const offset = (day - week_start_day + 7) % 7;

  return add_days(next, -offset);
}

export function build_month_grid(anchor: Date, week_start_day: number): Date[] {
  const first_of_month = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const grid_start = start_of_week(first_of_month, week_start_day);

  return Array.from({ length: 42 }, (_, index) => add_days(grid_start, index));
}

export function trim_month_grid(grid: Date[], anchor: Date): Date[] {
  const month = anchor.getMonth();
  let length = grid.length;

  while (length >= 14) {
    const week_start = length - 7;
    const week_has_anchor_month = grid
      .slice(week_start, length)
      .some((day) => day.getMonth() === month);

    if (week_has_anchor_month) {
      break;
    }

    length = week_start;
  }

  return grid.slice(0, length);
}

export function build_week_days(anchor: Date, week_start_day: number): Date[] {
  const week_start = start_of_week(anchor, week_start_day);

  return Array.from({ length: 7 }, (_, index) => add_days(week_start, index));
}

export const CUSTOM_VIEW_DAY_OPTIONS = [2, 3, 4, 5, 6, 7, 14, 21, 28];

export const MIN_CUSTOM_VIEW_DAYS = 2;

export const MAX_CUSTOM_VIEW_DAYS = 28;

export function clamp_custom_view_days(value: number): number {
  if (!Number.isFinite(value)) {
    return 4;
  }

  return Math.min(
    MAX_CUSTOM_VIEW_DAYS,
    Math.max(MIN_CUSTOM_VIEW_DAYS, Math.round(value)),
  );
}

export function build_custom_days(anchor: Date, day_count: number): Date[] {
  const count = clamp_custom_view_days(day_count);
  const first = start_of_day(anchor);

  return Array.from({ length: count }, (_, index) => add_days(first, index));
}

export const PHONE_DAY_COUNT = 3;
export const PHONE_CUSTOM_DAY_COUNT = 4;
export const AGENDA_DAY_COUNT = 30;
export const AGENDA_MAX_DAY_COUNT = 730;

export function next_agenda_day_count(current: number): number {
  return Math.min(
    AGENDA_MAX_DAY_COUNT,
    Math.max(AGENDA_DAY_COUNT, current * 2),
  );
}

export function build_phone_week_days(
  anchor: Date,
  week_start_day: number,
): Date[] {
  const week = build_week_days(anchor, week_start_day);
  const last = week[week.length - 1];
  const first = start_of_day(anchor);
  const latest_start = add_days(start_of_day(last), 1 - PHONE_DAY_COUNT);
  const start = first.getTime() > latest_start.getTime() ? latest_start : first;

  return Array.from({ length: PHONE_DAY_COUNT }, (_, index) =>
    add_days(start, index),
  );
}

export function build_year_months(anchor: Date): Date[] {
  return Array.from(
    { length: 12 },
    (_, index) => new Date(anchor.getFullYear(), index, 1),
  );
}

export function get_visible_range(
  anchor: Date,
  view_mode: CalendarViewMode,
  week_start_day: number,
  custom_view_days = 4,
): { range_start: Date; range_end: Date } {
  if (view_mode === "year") {
    return {
      range_start: start_of_day(new Date(anchor.getFullYear(), 0, 1)),
      range_end: end_of_day(new Date(anchor.getFullYear(), 11, 31)),
    };
  }

  if (view_mode === "custom") {
    const days = build_custom_days(anchor, custom_view_days);

    return {
      range_start: start_of_day(days[0]),
      range_end: end_of_day(days[days.length - 1]),
    };
  }

  if (view_mode === "month") {
    const grid = trim_month_grid(
      build_month_grid(anchor, week_start_day),
      anchor,
    );

    return {
      range_start: start_of_day(grid[0]),
      range_end: end_of_day(grid[grid.length - 1]),
    };
  }

  if (view_mode === "week") {
    const days = build_week_days(anchor, week_start_day);

    return {
      range_start: start_of_day(days[0]),
      range_end: end_of_day(days[days.length - 1]),
    };
  }

  if (view_mode === "day") {
    return { range_start: start_of_day(anchor), range_end: end_of_day(anchor) };
  }

  return {
    range_start: start_of_day(anchor),
    range_end: end_of_day(add_days(anchor, 30)),
  };
}

export function minutes_from_midnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function event_occurs_on(
  event: DecryptedCalendarEvent,
  day: Date,
): boolean {
  const day_start = start_of_day(day).getTime();
  const day_end = end_of_day(day).getTime();
  const event_start = new Date(event.starts_at).getTime();
  const event_end = new Date(event.ends_at).getTime();

  if (Number.isNaN(event_start) || Number.isNaN(event_end)) {
    return false;
  }

  if (event_end <= event_start) {
    return event_start >= day_start && event_start <= day_end;
  }

  return event_start <= day_end && event_end > day_start;
}

export function compare_events_for_day(
  left: DecryptedCalendarEvent,
  right: DecryptedCalendarEvent,
): number {
  if (left.is_all_day !== right.is_all_day) {
    return left.is_all_day ? -1 : 1;
  }

  const left_start = new Date(left.starts_at).getTime();
  const right_start = new Date(right.starts_at).getTime();

  if (left_start !== right_start) {
    return left_start - right_start;
  }

  const left_end = new Date(left.ends_at).getTime();
  const right_end = new Date(right.ends_at).getTime();

  if (left_end !== right_end) {
    return right_end - left_end;
  }

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function events_for_day(
  events: DecryptedCalendarEvent[],
  day: Date,
): DecryptedCalendarEvent[] {
  return events
    .filter((event) => event_occurs_on(event, day))
    .sort(compare_events_for_day);
}

export function get_event_day_bounds(
  event: DecryptedCalendarEvent,
  day: Date,
): { start_minute: number; end_minute: number } {
  const day_start = start_of_day(day);
  const day_end = end_of_day(day);
  const event_start = new Date(event.starts_at);
  const event_end = new Date(event.ends_at);

  const starts_before_day = event_start.getTime() <= day_start.getTime();
  const ends_after_day = event_end.getTime() > day_end.getTime();

  const raw_start = starts_before_day ? 0 : minutes_from_midnight(event_start);
  const raw_end = ends_after_day
    ? MINUTES_PER_DAY
    : minutes_from_midnight(event_end);

  const start_minute = Math.max(0, Math.min(raw_start, MINUTES_PER_DAY));
  const end_minute = Math.min(
    MINUTES_PER_DAY,
    Math.max(start_minute + 15, raw_end),
  );

  return { start_minute, end_minute };
}

export function build_agenda_groups(
  events: DecryptedCalendarEvent[],
  range_start?: Date,
  range_end?: Date,
): { day: Date; day_key: string; events: DecryptedCalendarEvent[] }[] {
  const buckets = new Map<
    string,
    { day: Date; day_key: string; events: DecryptedCalendarEvent[] }
  >();

  const lower = range_start ? start_of_day(range_start).getTime() : null;
  const upper = range_end ? end_of_day(range_end).getTime() : null;

  for (const event of events) {
    const event_start = new Date(event.starts_at);
    const event_end = new Date(event.ends_at);

    if (
      Number.isNaN(event_start.getTime()) ||
      Number.isNaN(event_end.getTime())
    ) {
      continue;
    }

    let cursor = start_of_day(event_start);

    if (lower !== null && cursor.getTime() < lower) {
      cursor = start_of_day(new Date(lower));
    }

    for (let guard = 0; guard < 400; guard += 1) {
      const cursor_time = cursor.getTime();

      if (upper !== null && cursor_time > upper) {
        break;
      }

      if (!event_occurs_on(event, cursor)) {
        if (cursor_time > event_end.getTime()) {
          break;
        }

        cursor = add_days(cursor, 1);
        continue;
      }

      const day_key = build_day_key(cursor);
      const existing = buckets.get(day_key);

      if (existing) {
        existing.events.push(event);
      } else {
        buckets.set(day_key, { day: cursor, day_key, events: [event] });
      }

      cursor = add_days(cursor, 1);
    }
  }

  return Array.from(buckets.values())
    .sort((left, right) => left.day.getTime() - right.day.getTime())
    .map((group) => ({
      ...group,
      events: group.events.slice().sort(compare_events_for_day),
    }));
}

export function event_occurrence_key(
  event: Pick<DecryptedCalendarEvent, "id" | "starts_at">,
): string {
  return `${event.id}|${event.starts_at}`;
}

export function build_day_key(day: Date): string {
  const month = `${day.getMonth() + 1}`.padStart(2, "0");
  const date = `${day.getDate()}`.padStart(2, "0");

  return `${day.getFullYear()}-${month}-${date}`;
}

export interface EventPlacement {
  column: number;
  column_count: number;
  span: number;
  stack_depth: number;
  order: number;
  cluster_index: number;
  cluster_size: number;
  start_minute: number;
  end_minute: number;
}

export const MAX_OVERLAP_COLUMNS = 3;

interface PlacedInterval {
  id: string;
  column: number;
  stack_depth: number;
  start: number;
  end: number;
}

function intervals_overlap(
  left: { start: number; end: number },
  right: { start: number; end: number },
): boolean {
  return left.start < right.end && left.end > right.start;
}

function pick_stack_column(
  placed: PlacedInterval[],
  column_count: number,
  entry: { start: number; end: number },
): { column: number; stack_depth: number } {
  let best = { column: 0, stack_depth: 0, clearance: Number.NEGATIVE_INFINITY };

  for (let column = 0; column < column_count; column += 1) {
    const occupants = placed.filter(
      (item) => item.column === column && intervals_overlap(item, entry),
    );
    const latest_start = occupants.reduce(
      (latest, item) => Math.max(latest, item.start),
      Number.NEGATIVE_INFINITY,
    );
    const clearance = entry.start - latest_start;
    const stack_depth = occupants.length;

    if (
      clearance > best.clearance ||
      (clearance === best.clearance && stack_depth < best.stack_depth)
    ) {
      best = { column, stack_depth, clearance };
    }
  }

  return { column: best.column, stack_depth: best.stack_depth };
}

export function assign_overlap_columns(
  events: DecryptedCalendarEvent[],
  day: Date,
  max_columns: number = MAX_OVERLAP_COLUMNS,
): Map<string, EventPlacement> {
  const layout = new Map<string, EventPlacement>();
  const column_cap = Math.max(1, max_columns);

  const timed = events
    .filter((event) => !event.is_all_day && event_occurs_on(event, day))
    .map((event) => ({ event, bounds: get_event_day_bounds(event, day) }))
    .sort((left, right) => {
      if (left.bounds.start_minute !== right.bounds.start_minute) {
        return left.bounds.start_minute - right.bounds.start_minute;
      }

      if (left.bounds.end_minute !== right.bounds.end_minute) {
        return right.bounds.end_minute - left.bounds.end_minute;
      }

      return left.event.id < right.event.id
        ? -1
        : left.event.id > right.event.id
          ? 1
          : 0;
    });

  let cluster: typeof timed = [];
  let cluster_end = -1;
  let cluster_index = 0;

  const flush_cluster = () => {
    if (cluster.length === 0) {
      return;
    }

    const column_ends: number[] = [];
    const placed: PlacedInterval[] = [];

    for (const entry of cluster) {
      const interval = {
        start: entry.bounds.start_minute,
        end: entry.bounds.end_minute,
      };
      let column = column_ends.findIndex((end) => end <= interval.start);
      let stack_depth = 0;

      if (column !== -1) {
        column_ends[column] = interval.end;
      } else if (column_ends.length < column_cap) {
        column_ends.push(interval.end);
        column = column_ends.length - 1;
      } else {
        const stacked = pick_stack_column(placed, column_ends.length, interval);

        column = stacked.column;
        stack_depth = stacked.stack_depth;
        column_ends[column] = Math.max(column_ends[column], interval.end);
      }

      placed.push({
        id: entry.event.id,
        column,
        stack_depth,
        start: interval.start,
        end: interval.end,
      });
    }

    const column_count = column_ends.length;

    placed.forEach((item, order) => {
      let span = 1;

      while (item.stack_depth === 0 && item.column + span < column_count) {
        const blocked = placed.some(
          (other) =>
            other.column === item.column + span &&
            intervals_overlap(other, item),
        );

        if (blocked) {
          break;
        }

        span += 1;
      }

      layout.set(item.id, {
        column: item.column,
        column_count,
        span,
        stack_depth: item.stack_depth,
        order,
        cluster_index,
        cluster_size: placed.length,
        start_minute: item.start,
        end_minute: item.end,
      });
    });

    cluster = [];
    cluster_end = -1;
    cluster_index += 1;
  };

  for (const entry of timed) {
    if (cluster.length > 0 && entry.bounds.start_minute >= cluster_end) {
      flush_cluster();
    }

    cluster.push(entry);
    cluster_end = Math.max(cluster_end, entry.bounds.end_minute);
  }

  flush_cluster();

  return layout;
}

function same_field_value(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => Object.is(item, right[index]))
    );
  }

  return false;
}

export function shallow_equal_record(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  if (left === right) {
    return true;
  }

  const left_keys = Object.keys(left);

  if (left_keys.length !== Object.keys(right).length) {
    return false;
  }

  return left_keys.every(
    (key) => key in right && same_field_value(left[key], right[key]),
  );
}

export function merge_by_id<T extends { id: string }>(
  previous: T[],
  next: T[],
  is_same: (left: T, right: T) => boolean = (left, right) =>
    shallow_equal_record(
      left as unknown as Record<string, unknown>,
      right as unknown as Record<string, unknown>,
    ),
): T[] {
  const previous_by_id = new Map(previous.map((item) => [item.id, item]));
  let unchanged = previous.length === next.length;

  const merged = next.map((item, index) => {
    const existing = previous_by_id.get(item.id);
    const kept = existing && is_same(existing, item) ? existing : item;

    if (kept !== previous[index]) {
      unchanged = false;
    }

    return kept;
  });

  return unchanged ? previous : merged;
}

export const READABLE_INK_LIGHT = "#ffffff";

export const READABLE_INK_DARK = "#111827";

export function parse_color_channels(
  color: string,
): { red: number; green: number; blue: number } | null {
  if (typeof color !== "string") {
    return null;
  }

  const value = color.trim().toLowerCase();

  if (value.length === 0 || value.startsWith("var(")) {
    return null;
  }

  const rgb_match = value.match(
    /^rgba?\(\s*([0-9.]+%?)[\s,]+([0-9.]+%?)[\s,]+([0-9.]+%?)/,
  );

  if (rgb_match) {
    const to_channel = (raw: string) => {
      const numeric = parseFloat(raw);

      if (Number.isNaN(numeric)) {
        return null;
      }

      return raw.endsWith("%")
        ? Math.round((numeric / 100) * 255)
        : Math.round(numeric);
    };

    const red = to_channel(rgb_match[1]);
    const green = to_channel(rgb_match[2]);
    const blue = to_channel(rgb_match[3]);

    if (red === null || green === null || blue === null) {
      return null;
    }

    return {
      red: Math.max(0, Math.min(255, red)),
      green: Math.max(0, Math.min(255, green)),
      blue: Math.max(0, Math.min(255, blue)),
    };
  }

  const hex = value.replace("#", "");

  if (!/^[0-9a-f]+$/.test(hex)) {
    return null;
  }

  if (hex.length === 3 || hex.length === 4) {
    return {
      red: parseInt(`${hex[0]}${hex[0]}`, 16),
      green: parseInt(`${hex[1]}${hex[1]}`, 16),
      blue: parseInt(`${hex[2]}${hex[2]}`, 16),
    };
  }

  if (hex.length === 6 || hex.length === 8) {
    return {
      red: parseInt(hex.slice(0, 2), 16),
      green: parseInt(hex.slice(2, 4), 16),
      blue: parseInt(hex.slice(4, 6), 16),
    };
  }

  return null;
}

export function relative_luminance(color: string): number | null {
  const channels = parse_color_channels(color);

  if (!channels) {
    return null;
  }

  const to_linear = (channel: number) => {
    const scaled = channel / 255;

    return scaled <= 0.04045
      ? scaled / 12.92
      : Math.pow((scaled + 0.055) / 1.055, 2.4);
  };

  return (
    0.2126 * to_linear(channels.red) +
    0.7152 * to_linear(channels.green) +
    0.0722 * to_linear(channels.blue)
  );
}

export function hex_to_readable_ink(color: string): string {
  const luminance = relative_luminance(color);

  if (luminance === null) {
    return READABLE_INK_LIGHT;
  }

  return luminance > 0.42 ? READABLE_INK_DARK : READABLE_INK_LIGHT;
}

export function ink_on_fill(color: string): string {
  if (color.startsWith("var(--cal_color_")) {
    return "var(--calendar_event_text, #ffffff)";
  }

  return color.startsWith("var(")
    ? "var(--accent-fg, #ffffff)"
    : hex_to_readable_ink(color);
}

export function contrast_ratio(
  foreground: string,
  background: string,
): number | null {
  const first = relative_luminance(foreground);
  const second = relative_luminance(background);

  if (first === null || second === null) {
    return null;
  }

  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);

  return (lighter + 0.05) / (darker + 0.05);
}

export type EventColorName = TagColorVariant | "slate";

export interface EventColorOption {
  hex: string;
  fill: string;
  dark_fill: string;
  name: EventColorName;
  name_key: TranslationKey;
  token: string;
}

const EVENT_COLOR_FILLS: Record<
  TagColorVariant,
  { fill: string; dark_fill?: string }
> = {
  red: { fill: "#c4392f" },
  orange: { fill: "#b4521f" },
  amber: { fill: "#9a5d10" },
  yellow: { fill: "#836a12" },
  lime: { fill: "#5a7a22" },
  green: { fill: "#2e7d43" },
  emerald: { fill: "#14775c" },
  teal: { fill: "#14737c" },
  cyan: { fill: "#13708f" },
  sky: { fill: "#2b69ad" },
  blue: { fill: "#3c62d6" },
  indigo: { fill: "#5249c4" },
  violet: { fill: "#6d4bc4" },
  purple: { fill: "#8642ad" },
  fuchsia: { fill: "#a33d9a" },
  pink: { fill: "#b53a70" },
  rose: { fill: "#b23651" },
};

export const EVENT_COLOR_OPTIONS: EventColorOption[] = TAG_COLOR_PRESETS.map(
  (preset) => {
    const { fill, dark_fill = fill } = EVENT_COLOR_FILLS[preset.variant];

    return {
      dark_fill,
      fill,
      hex: preset.hex,
      name: preset.variant,
      name_key: tag_color_label_key(preset.variant),
      token: `var(--cal_color_${preset.variant})`,
    };
  },
);

export const NEUTRAL_EVENT_COLOR: EventColorOption = {
  dark_fill: "#56606e",
  fill: "#56606e",
  hex: "#64748b",
  name: "slate",
  name_key: "calendar.color_slate",
  token: "var(--cal_color_slate)",
};

export const DEFAULT_EVENT_COLOR =
  EVENT_COLOR_OPTIONS.find((option) => option.name === "blue") ??
  EVENT_COLOR_OPTIONS[0];

const NEUTRAL_SATURATION_LIMIT = 0.18;

function color_hue_and_saturation(
  color: string,
): { hue: number; saturation: number } | null {
  const channels = parse_color_channels(color);

  if (!channels) {
    return null;
  }

  const red = channels.red / 255;
  const green = channels.green / 255;
  const blue = channels.blue / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  let hue = 0;

  if (delta !== 0) {
    if (max === red) {
      hue = ((green - blue) / delta) % 6;
    } else if (max === green) {
      hue = (blue - red) / delta + 2;
    } else {
      hue = (red - green) / delta + 4;
    }

    hue *= 60;

    if (hue < 0) {
      hue += 360;
    }
  }

  return { hue, saturation };
}

function hue_distance(left: number, right: number): number {
  const raw = Math.abs(left - right) % 360;

  return raw > 180 ? 360 - raw : raw;
}

const CHROMATIC_SWATCHES = EVENT_COLOR_OPTIONS.map((option) => ({
  option,
  hue: color_hue_and_saturation(option.hex)?.hue ?? 0,
}));

export function find_event_color_option(
  color: string | null | undefined,
): EventColorOption | null {
  if (!color) {
    return null;
  }

  const value = color.trim().toLowerCase();

  return (
    [...EVENT_COLOR_OPTIONS, NEUTRAL_EVENT_COLOR].find(
      (option) =>
        option.hex === value ||
        option.fill === value ||
        option.dark_fill === value ||
        option.token === value ||
        option.name === value,
    ) ?? null
  );
}

export function nearest_event_color(color: string): EventColorOption {
  const exact = find_event_color_option(color);

  if (exact) {
    return exact;
  }

  const parsed = color_hue_and_saturation(color);

  if (!parsed) {
    return DEFAULT_EVENT_COLOR;
  }

  if (parsed.saturation < NEUTRAL_SATURATION_LIMIT) {
    return NEUTRAL_EVENT_COLOR;
  }

  let best = CHROMATIC_SWATCHES[0];
  let best_distance = Number.POSITIVE_INFINITY;

  for (const candidate of CHROMATIC_SWATCHES) {
    const distance = hue_distance(parsed.hue, candidate.hue);

    if (distance < best_distance) {
      best = candidate;
      best_distance = distance;
    }
  }

  return best.option;
}

export function event_color_token(color: string | null | undefined): string {
  if (!color) {
    return "var(--accent-color)";
  }

  if (color.startsWith("var(")) {
    return color;
  }

  if (parse_color_channels(color) === null) {
    return "var(--accent-color)";
  }

  return nearest_event_color(color).token;
}

const PAST_EVENT_FILTER = "saturate(0.6)";

export const PAST_EVENT_OPACITY = 0.75;

export interface EventBlockOptions {
  is_active?: boolean;
  is_past?: boolean;
}

export type EventBlockStyle = CSSProperties & Record<"--cal_color", string>;

export function build_event_block_style(
  color: string,
  { is_active = false, is_past = false }: EventBlockOptions = {},
): EventBlockStyle {
  return {
    "--cal_color": event_color_token(color),
    backgroundColor: "var(--cal_color)",
    borderRadius: "var(--calendar_event_radius, 6px)",
    boxShadow: "0 0 0 1px var(--bg-primary)",
    color: "var(--calendar_event_text, #ffffff)",
    filter: is_past ? PAST_EVENT_FILTER : undefined,
    outline: is_active ? "2px solid var(--accent-color)" : undefined,
    outlineOffset: is_active ? "-2px" : undefined,
  };
}

export interface MonthChipOptions {
  is_all_day?: boolean;
  is_active?: boolean;
  is_past?: boolean;
}

export function build_month_chip_style(
  color: string,
  {
    is_all_day = false,
    is_active = false,
    is_past = false,
  }: MonthChipOptions = {},
): EventBlockStyle {
  if (is_all_day) {
    return build_event_block_style(color, { is_active, is_past });
  }

  return {
    "--cal_color": event_color_token(color),
    borderRadius: "var(--calendar_event_radius, 6px)",
    color: is_past
      ? "color-mix(in srgb, var(--text-primary) 72%, transparent)"
      : "var(--text-primary)",
    filter: is_past ? PAST_EVENT_FILTER : undefined,
    outline: is_active ? "2px solid var(--accent-color)" : undefined,
    outlineOffset: is_active ? "-2px" : undefined,
  };
}

const EVENT_KIND_COLORS: Record<string, string> = {
  task: "var(--cal_color_sky)",
  out_of_office: "var(--cal_color_slate)",
  focus_time: "var(--cal_color_teal)",
  working_location: "var(--cal_color_green)",
  birthday: BIRTHDAY_COLOR,
};

export function resolve_event_color(
  event: DecryptedCalendarEvent,
  calendar_color: string | undefined,
): string {
  if (event.color !== null) {
    return event_color_token(event.color);
  }

  const kind_color = EVENT_KIND_COLORS[event.event_kind];

  if (kind_color !== undefined) {
    return event_color_token(kind_color);
  }

  return calendar_color
    ? event_color_token(calendar_color)
    : "var(--accent-color)";
}

const TAG_PALETTE = EVENT_COLOR_OPTIONS.map((option) => option.hex);

export function is_offset_in_view(
  offset: number,
  scroll_top: number,
  client_height: number,
  margin = 0,
): boolean {
  return (
    offset >= scroll_top + margin &&
    offset <= scroll_top + client_height - margin
  );
}

export function grid_contains_day(grid: Date[], day: Date): boolean {
  return grid.some((candidate) => is_same_day(candidate, day));
}

export function tag_color(name: string): string {
  const key = name.trim().toLowerCase();
  let hash = 0;

  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }

  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

export function collect_tags(events: DecryptedCalendarEvent[]): CalendarTag[] {
  const seen = new Map<string, string>();

  for (const event of events) {
    for (const raw of event.tags) {
      const key = raw.trim().toLowerCase();

      if (key.length > 0 && !seen.has(key)) {
        seen.set(key, raw.trim());
      }
    }
  }

  return [...seen.values()]
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({ name, color: tag_color(name) }));
}

export function event_has_any_tag(
  event: DecryptedCalendarEvent,
  selected: string[],
): boolean {
  if (selected.length === 0) {
    return true;
  }

  const lowered = new Set(selected.map((tag) => tag.toLowerCase()));

  return event.tags.some((tag) => lowered.has(tag.trim().toLowerCase()));
}

export function iso_week_number(date: Date): number {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day_number = target.getUTCDay() || 7;

  target.setUTCDate(target.getUTCDate() + 4 - day_number);

  const year_start = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));

  return Math.ceil(
    ((target.getTime() - year_start.getTime()) / 86_400_000 + 1) / 7,
  );
}

export function is_weekend(date: Date): boolean {
  const day = date.getDay();

  return day === 0 || day === 6;
}

const ALTERNATE_CALENDAR_IDS: Record<string, string> = {
  chinese: "chinese",
  hebrew: "hebrew",
  indian: "indian",
  islamic: "islamic-umalqura",
  persian: "persian",
};

const alternate_formatters = new Map<string, Intl.DateTimeFormat | null>();

export function alternate_day_formatter(
  alternate: string,
  locale: string,
): Intl.DateTimeFormat | null {
  const calendar_id = ALTERNATE_CALENDAR_IDS[alternate];

  if (calendar_id === undefined) {
    return null;
  }

  const cache_key = `${locale}|${calendar_id}`;
  const cached = alternate_formatters.get(cache_key);

  if (cached !== undefined) {
    return cached;
  }

  let formatter: Intl.DateTimeFormat | null = null;

  try {
    formatter = new Intl.DateTimeFormat(`${locale}-u-ca-${calendar_id}`, {
      day: "numeric",
    });
  } catch {
    formatter = null;
  }

  alternate_formatters.set(cache_key, formatter);

  return formatter;
}

export function format_alternate_day(
  date: Date,
  alternate: string,
  locale: string,
): string {
  const formatter = alternate_day_formatter(alternate, locale);

  if (formatter === null) {
    return "";
  }

  return formatter.format(date).replace(/[^0-9٠-٩۰-۹]/g, "");
}

export function task_title_class(event: DecryptedCalendarEvent): string {
  return event.event_kind === "task" && event.is_completed
    ? " line-through opacity-70"
    : "";
}

export function assign_calendar_split_columns(
  events: DecryptedCalendarEvent[],
  day: Date,
  calendar_order: string[],
): Map<string, EventPlacement> {
  const layout = new Map<string, EventPlacement>();
  const band_count = Math.max(1, calendar_order.length);

  calendar_order.forEach((calendar_id, band_index) => {
    const subset = events.filter((event) => event.calendar_id === calendar_id);
    const inner = assign_overlap_columns(subset, day);

    for (const [event_id, placement] of inner) {
      layout.set(event_id, {
        ...placement,
        column: band_index * placement.column_count + placement.column,
        column_count: band_count * placement.column_count,
      });
    }
  });

  return layout;
}
