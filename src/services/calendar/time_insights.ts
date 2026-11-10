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

import { add_days, start_of_day } from "@/components/calendar/calendar_utils";

export interface CalendarInsightSlice {
  calendar_id: string;
  minutes: number;
}

export interface GuestInsight {
  email: string;
  display_name: string | null;
  minutes: number;
  meetings: number;
}

export interface DayInsight {
  day_key: string;
  date: Date;
  minutes: number;
  per_calendar: CalendarInsightSlice[];
}

export interface WeekInsight {
  week_start: Date;
  minutes: number;
  per_calendar: CalendarInsightSlice[];
}

export interface LongestEventInsight {
  event_id: string;
  title: string;
  minutes: number;
  starts_at: Date;
}

export interface TimeInsights {
  per_day: DayInsight[];
  scheduled_minutes: number;
  meeting_minutes: number;
  focus_minutes: number;
  event_count: number;
  meeting_count: number;
  days_with_events: number;
  busiest_day: string | null;
  busiest_day_minutes: number;
  longest_event: LongestEventInsight | null;
  per_calendar: CalendarInsightSlice[];
  top_guests: GuestInsight[];
}

const MAX_TOP_GUESTS = 5;
const MINUTE_MS = 60000;
const DAY_MS = 86400000;
const SLOT_STEP_MINUTES = 15;
const MAX_SLOT_SEARCH_DAYS = 14;

function days_between(range_start: Date, range_end: Date): Date[] {
  const days: Date[] = [];
  let cursor = start_of_day(range_start);

  while (cursor.getTime() < range_end.getTime()) {
    days.push(cursor);
    cursor = add_days(cursor, 1);
  }

  return days;
}

function clipped_minutes(
  event: DecryptedCalendarEvent,
  range_start: Date,
  range_end: Date,
): number {
  const start = new Date(event.starts_at).getTime();
  const end = new Date(event.ends_at).getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 0;
  }

  const from = Math.max(start, range_start.getTime());
  const to = Math.min(end, range_end.getTime());

  if (to <= from) {
    return 0;
  }

  return Math.round((to - from) / MINUTE_MS);
}

function is_meeting(
  event: DecryptedCalendarEvent,
  self_email: string,
): boolean {
  return event.attendees.some(
    (attendee) => attendee.email.trim().toLowerCase() !== self_email,
  );
}

function is_declined_by_self(
  event: DecryptedCalendarEvent,
  self_email: string,
): boolean {
  if (self_email.length === 0) {
    return false;
  }

  return event.attendees.some(
    (attendee) =>
      attendee.email.trim().toLowerCase() === self_email &&
      attendee.response === "declined",
  );
}

function counts_toward_time(
  event: DecryptedCalendarEvent,
  normalized_self: string,
): boolean {
  return (
    !event.is_all_day &&
    event.status !== "cancelled" &&
    !is_declined_by_self(event, normalized_self)
  );
}

function slices_of(per_calendar: Map<string, number>): CalendarInsightSlice[] {
  return [...per_calendar.entries()]
    .map(([calendar_id, minutes]) => ({ calendar_id, minutes }))
    .sort((first, second) => second.minutes - first.minutes);
}

function merge_slices(
  groups: CalendarInsightSlice[][],
): CalendarInsightSlice[] {
  const merged = new Map<string, number>();

  for (const group of groups) {
    for (const slice of group) {
      merged.set(
        slice.calendar_id,
        (merged.get(slice.calendar_id) ?? 0) + slice.minutes,
      );
    }
  }

  return slices_of(merged);
}

function busy_intervals(
  events: DecryptedCalendarEvent[],
  from: Date,
  to: Date,
  normalized_self: string,
): Array<[number, number]> {
  const intervals: Array<[number, number]> = [];

  for (const event of events) {
    if (!counts_toward_time(event, normalized_self)) {
      continue;
    }

    const start = Math.max(new Date(event.starts_at).getTime(), from.getTime());
    const end = Math.min(new Date(event.ends_at).getTime(), to.getTime());

    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      continue;
    }

    intervals.push([start, end]);
  }

  intervals.sort((first, second) => first[0] - second[0]);

  const merged: Array<[number, number]> = [];

  for (const interval of intervals) {
    const last = merged[merged.length - 1];

    if (last && interval[0] <= last[1]) {
      last[1] = Math.max(last[1], interval[1]);
    } else {
      merged.push([interval[0], interval[1]]);
    }
  }

  return merged;
}

function working_window(
  day: Date,
  working_start_hour: number,
  working_end_hour: number,
): [Date, Date] {
  const start = new Date(day);
  const end = new Date(day);

  start.setHours(working_start_hour, 0, 0, 0);
  end.setHours(working_end_hour, 0, 0, 0);

  return [start, end];
}

export function build_day_insights(
  events: DecryptedCalendarEvent[],
  range_start: Date,
  range_end: Date,
  self_email: string,
): DayInsight[] {
  const normalized_self = self_email.trim().toLowerCase();
  const timed_events = events.filter((event) =>
    counts_toward_time(event, normalized_self),
  );

  return days_between(range_start, range_end).map((day) => {
    const from = new Date(Math.max(day.getTime(), range_start.getTime()));
    const to = new Date(
      Math.min(add_days(day, 1).getTime(), range_end.getTime()),
    );
    const per_calendar = new Map<string, number>();
    let minutes = 0;

    for (const event of timed_events) {
      const overlap = clipped_minutes(event, from, to);

      if (overlap === 0) {
        continue;
      }

      minutes += overlap;
      per_calendar.set(
        event.calendar_id,
        (per_calendar.get(event.calendar_id) ?? 0) + overlap,
      );
    }

    return {
      date: day,
      day_key: day.toDateString(),
      minutes,
      per_calendar: slices_of(per_calendar),
    };
  });
}

export function group_days_by_week(
  days: DayInsight[],
  week_start_day: number,
): WeekInsight[] {
  const weeks = new Map<number, { week_start: Date; days: DayInsight[] }>();

  for (const day of days) {
    const offset = (day.date.getDay() - week_start_day + 7) % 7;
    const week_start = add_days(day.date, -offset);
    const key = week_start.getTime();
    const bucket = weeks.get(key) ?? { days: [], week_start };

    bucket.days.push(day);
    weeks.set(key, bucket);
  }

  return [...weeks.values()]
    .sort(
      (first, second) =>
        first.week_start.getTime() - second.week_start.getTime(),
    )
    .map((bucket) => ({
      minutes: bucket.days.reduce((sum, day) => sum + day.minutes, 0),
      per_calendar: merge_slices(bucket.days.map((day) => day.per_calendar)),
      week_start: bucket.week_start,
    }));
}

export function free_minutes_left(
  events: DecryptedCalendarEvent[],
  from: Date,
  until: Date,
  working_start_hour: number,
  working_end_hour: number,
  self_email: string,
): number {
  if (
    until.getTime() <= from.getTime() ||
    working_end_hour <= working_start_hour
  ) {
    return 0;
  }

  const normalized_self = self_email.trim().toLowerCase();
  let free = 0;

  for (const day of days_between(from, until)) {
    const [window_start, window_end] = working_window(
      day,
      working_start_hour,
      working_end_hour,
    );
    const start = new Date(Math.max(window_start.getTime(), from.getTime()));
    const end = new Date(Math.min(window_end.getTime(), until.getTime()));

    if (end.getTime() <= start.getTime()) {
      continue;
    }

    const total = Math.round((end.getTime() - start.getTime()) / MINUTE_MS);
    const busy = busy_intervals(events, start, end, normalized_self).reduce(
      (sum, [interval_start, interval_end]) =>
        sum + Math.round((interval_end - interval_start) / MINUTE_MS),
      0,
    );

    free += Math.max(0, total - busy);
  }

  return free;
}

export function next_free_slot(
  events: DecryptedCalendarEvent[],
  from: Date,
  duration_minutes: number,
  working_start_hour: number,
  working_end_hour: number,
  self_email: string,
): Date | null {
  if (duration_minutes <= 0 || working_end_hour <= working_start_hour) {
    return null;
  }

  const normalized_self = self_email.trim().toLowerCase();
  const step_ms = SLOT_STEP_MINUTES * MINUTE_MS;
  const duration_ms = duration_minutes * MINUTE_MS;
  const earliest = Math.ceil(from.getTime() / step_ms) * step_ms;

  for (let offset = 0; offset < MAX_SLOT_SEARCH_DAYS; offset += 1) {
    const day = add_days(start_of_day(from), offset);
    const [window_start, window_end] = working_window(
      day,
      working_start_hour,
      working_end_hour,
    );
    const busy = busy_intervals(
      events,
      window_start,
      window_end,
      normalized_self,
    );
    let candidate = Math.max(window_start.getTime(), earliest);

    while (candidate + duration_ms <= window_end.getTime()) {
      const candidate_end = candidate + duration_ms;
      const conflict = busy.find(
        ([start, end]) => start < candidate_end && end > candidate,
      );

      if (!conflict) {
        return new Date(candidate);
      }

      candidate = Math.ceil(conflict[1] / step_ms) * step_ms;
    }
  }

  return null;
}

export function week_bounds(
  reference: Date,
  week_start_day: number,
): [Date, Date] {
  const day = start_of_day(reference);
  const offset = (day.getDay() - week_start_day + 7) % 7;
  const start = add_days(day, -offset);

  return [start, add_days(start, 7)];
}

export function month_bounds(reference: Date): [Date, Date] {
  return [
    new Date(reference.getFullYear(), reference.getMonth(), 1),
    new Date(reference.getFullYear(), reference.getMonth() + 1, 1),
  ];
}

export function trailing_weeks_bounds(
  reference: Date,
  week_start_day: number,
  weeks: number,
): [Date, Date] {
  const [start, end] = week_bounds(reference, week_start_day);

  return [add_days(start, -7 * (weeks - 1)), end];
}

export function days_in_span(range_start: Date, range_end: Date): number {
  return Math.max(
    1,
    Math.round((range_end.getTime() - range_start.getTime()) / DAY_MS),
  );
}

export function build_time_insights(
  events: DecryptedCalendarEvent[],
  range_start: Date,
  range_end: Date,
  self_email: string,
): TimeInsights {
  const normalized_self = self_email.trim().toLowerCase();
  const per_calendar = new Map<string, number>();
  const per_day = new Map<string, number>();
  const per_guest = new Map<string, GuestInsight>();

  let scheduled_minutes = 0;
  let meeting_minutes = 0;
  let focus_minutes = 0;
  let event_count = 0;
  let meeting_count = 0;
  let longest_event: LongestEventInsight | null = null;

  for (const event of events) {
    if (!counts_toward_time(event, normalized_self)) {
      continue;
    }

    const minutes = clipped_minutes(event, range_start, range_end);

    if (minutes === 0) {
      continue;
    }

    event_count += 1;
    scheduled_minutes += minutes;

    const starts_at = new Date(event.starts_at);
    const day_key = starts_at.toDateString();
    const meeting = is_meeting(event, normalized_self);

    per_day.set(day_key, (per_day.get(day_key) ?? 0) + minutes);
    per_calendar.set(
      event.calendar_id,
      (per_calendar.get(event.calendar_id) ?? 0) + minutes,
    );

    if (longest_event === null || minutes > longest_event.minutes) {
      longest_event = {
        event_id: event.id,
        minutes,
        starts_at,
        title: event.title,
      };
    }

    if (meeting) {
      meeting_minutes += minutes;
    } else if (event.event_kind === "focus_time") {
      focus_minutes += minutes;
    }

    if (!meeting) {
      continue;
    }

    meeting_count += 1;

    for (const attendee of event.attendees) {
      const email = attendee.email.trim().toLowerCase();

      if (email.length === 0 || email === normalized_self) {
        continue;
      }

      const existing = per_guest.get(email) ?? {
        display_name: attendee.display_name,
        email,
        meetings: 0,
        minutes: 0,
      };

      existing.minutes += minutes;
      existing.meetings += 1;

      if (existing.display_name === null && attendee.display_name !== null) {
        existing.display_name = attendee.display_name;
      }

      per_guest.set(email, existing);
    }
  }

  let busiest_day: string | null = null;
  let busiest_day_minutes = 0;

  for (const [day, minutes] of per_day) {
    if (minutes > busiest_day_minutes) {
      busiest_day = day;
      busiest_day_minutes = minutes;
    }
  }

  const day_insights = build_day_insights(
    events,
    range_start,
    range_end,
    self_email,
  );

  return {
    busiest_day,
    busiest_day_minutes,
    days_with_events: day_insights.filter((day) => day.minutes > 0).length,
    event_count,
    focus_minutes,
    longest_event,
    meeting_count,
    meeting_minutes,
    per_calendar: slices_of(per_calendar),
    per_day: day_insights,
    scheduled_minutes,
    top_guests: [...per_guest.values()]
      .sort((first, second) => second.minutes - first.minutes)
      .slice(0, MAX_TOP_GUESTS),
  };
}

export function previous_range(
  range_start: Date,
  range_end: Date,
  period: "week" | "four_weeks" | "month",
): [Date, Date] {
  if (period !== "month") {
    return [
      add_days(range_start, -days_in_span(range_start, range_end)),
      new Date(range_start),
    ];
  }

  const months =
    (range_end.getFullYear() - range_start.getFullYear()) * 12 +
    range_end.getMonth() -
    range_start.getMonth();
  const start = new Date(
    range_start.getFullYear(),
    range_start.getMonth() - months,
    1,
  );

  return [start, new Date(range_start)];
}
