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

import { describe, expect, it } from "vitest";

import {
  build_day_insights,
  build_time_insights,
  days_in_span,
  free_minutes_left,
  group_days_by_week,
  month_bounds,
  next_free_slot,
  previous_range,
  trailing_weeks_bounds,
  week_bounds,
} from "@/services/calendar/time_insights";

const RANGE_START = new Date("2026-07-26T00:00:00Z");
const RANGE_END = new Date("2026-08-02T00:00:00Z");
const SELF = "me@astermail.org";

function make_event(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  return {
    id: "evt-1",
    calendar_id: "cal-1",
    title: "Standup",
    description: "",
    location: "",
    starts_at: "2026-07-27T09:00:00Z",
    ends_at: "2026-07-27T10:00:00Z",
    is_all_day: false,
    status: "confirmed",
    attendees: [],
    tags: [],
    reminder_minutes: null,
    color: null,
    availability: "busy",
    visibility: "default",
    event_kind: "default",
    is_completed: false,
    working_location: null,
    conference_url: "",
    guests_can_modify: false,
    guests_can_invite: true,
    guests_can_see_guests: true,
    recurrence: null,
    recurrence_exceptions: [],
    recurrence_master_id: null,
    occurrence_start: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("build_time_insights", () => {
  it("sums scheduled minutes and skips all-day events", () => {
    const insights = build_time_insights(
      [make_event(), make_event({ id: "evt-2", is_all_day: true })],
      RANGE_START,
      RANGE_END,
      SELF,
    );

    expect(insights.scheduled_minutes).toBe(60);
    expect(insights.event_count).toBe(1);
  });

  it("counts meetings only when another guest attends", () => {
    const insights = build_time_insights(
      [
        make_event({
          attendees: [
            {
              display_name: "Ana",
              email: "ana@example.com",
              is_organizer: false,
              response: "accepted",
            },
          ],
        }),
        make_event({ id: "evt-2" }),
      ],
      RANGE_START,
      RANGE_END,
      SELF,
    );

    expect(insights.meeting_count).toBe(1);
    expect(insights.meeting_minutes).toBe(60);
    expect(insights.scheduled_minutes).toBe(120);
    expect(insights.top_guests[0]?.email).toBe("ana@example.com");
  });

  it("clips events that cross the range boundary", () => {
    const insights = build_time_insights(
      [
        make_event({
          ends_at: "2026-07-26T02:00:00Z",
          starts_at: "2026-07-25T22:00:00Z",
        }),
      ],
      RANGE_START,
      RANGE_END,
      SELF,
    );

    expect(insights.scheduled_minutes).toBe(120);
  });

  it("skips events the user declined", () => {
    const insights = build_time_insights(
      [
        make_event({
          attendees: [
            {
              display_name: null,
              email: SELF,
              is_organizer: false,
              response: "declined",
            },
            {
              display_name: null,
              email: "ana@example.com",
              is_organizer: true,
              response: "accepted",
            },
          ],
        }),
      ],
      RANGE_START,
      RANGE_END,
      SELF,
    );

    expect(insights.scheduled_minutes).toBe(0);
  });

  it("tracks focus time and the busiest day", () => {
    const insights = build_time_insights(
      [
        make_event({ event_kind: "focus_time" }),
        make_event({
          ends_at: "2026-07-28T12:00:00Z",
          id: "evt-2",
          starts_at: "2026-07-28T09:00:00Z",
        }),
      ],
      RANGE_START,
      RANGE_END,
      SELF,
    );

    expect(insights.focus_minutes).toBe(60);
    expect(insights.busiest_day_minutes).toBe(180);
  });

  it("splits time into meetings and focus time and finds the longest event", () => {
    const guest = {
      display_name: null,
      email: "ana@example.com",
      is_organizer: false,
      response: "accepted" as const,
    };
    const insights = build_time_insights(
      [
        make_event({ attendees: [guest], event_kind: "focus_time" }),
        make_event({
          ends_at: "2026-07-27T10:30:00Z",
          event_kind: "focus_time",
          id: "evt-2",
          starts_at: "2026-07-27T10:00:00Z",
        }),
        make_event({
          ends_at: "2026-07-28T09:15:00Z",
          event_kind: "task",
          id: "evt-3",
          starts_at: "2026-07-28T09:00:00Z",
        }),
        make_event({
          ends_at: "2026-07-29T11:00:00Z",
          id: "evt-4",
          starts_at: "2026-07-29T09:00:00Z",
        }),
      ],
      RANGE_START,
      RANGE_END,
      SELF,
    );

    expect(insights.event_count).toBe(4);
    expect(insights.meeting_count).toBe(1);
    expect(insights.meeting_minutes).toBe(60);
    expect(insights.focus_minutes).toBe(30);
    expect(insights.days_with_events).toBe(3);
    expect(insights.longest_event?.event_id).toBe("evt-4");
    expect(insights.longest_event?.minutes).toBe(120);
  });
});

describe("previous_range", () => {
  it("steps week ranges back by their own length and month ranges by whole months", () => {
    const [week_start, week_end] = previous_range(
      new Date(2026, 6, 27),
      new Date(2026, 7, 3),
      "week",
    );
    const [weeks_start, weeks_end] = previous_range(
      new Date(2026, 5, 29),
      new Date(2026, 6, 27),
      "four_weeks",
    );
    const [month_start, month_end] = previous_range(
      new Date(2026, 5, 1),
      new Date(2026, 8, 1),
      "month",
    );

    expect(week_start.getDate()).toBe(20);
    expect(week_end.getDate()).toBe(27);
    expect(weeks_start.getMonth()).toBe(5);
    expect(weeks_start.getDate()).toBe(1);
    expect(weeks_end.getDate()).toBe(29);
    expect(month_start.getMonth()).toBe(2);
    expect(month_end.getMonth()).toBe(5);
  });
});

function local_iso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): string {
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

describe("build_day_insights", () => {
  const start = new Date(2026, 6, 27, 0, 0, 0, 0);
  const end = new Date(2026, 7, 3, 0, 0, 0, 0);

  it("returns one bucket per day in the range, including empty days", () => {
    const days = build_day_insights([], start, end, SELF);

    expect(days).toHaveLength(7);
    expect(days.every((day) => day.minutes === 0)).toBe(true);
    expect(days[0]?.date.getDate()).toBe(27);
  });

  it("splits a multi-day event across the days it covers by calendar", () => {
    const days = build_day_insights(
      [
        make_event({
          calendar_id: "cal-a",
          ends_at: local_iso(2026, 7, 28, 2),
          starts_at: local_iso(2026, 7, 27, 22),
        }),
        make_event({
          calendar_id: "cal-b",
          ends_at: local_iso(2026, 7, 28, 10),
          id: "evt-2",
          starts_at: local_iso(2026, 7, 28, 9),
        }),
      ],
      start,
      end,
      SELF,
    );

    expect(days[0]?.minutes).toBe(120);
    expect(days[1]?.minutes).toBe(180);
    expect(days[1]?.per_calendar).toEqual([
      { calendar_id: "cal-a", minutes: 120 },
      { calendar_id: "cal-b", minutes: 60 },
    ]);
  });

  it("ignores cancelled and all-day events", () => {
    const days = build_day_insights(
      [
        make_event({
          ends_at: local_iso(2026, 7, 27, 10),
          starts_at: local_iso(2026, 7, 27, 9),
          status: "cancelled",
        }),
        make_event({ id: "evt-2", is_all_day: true }),
      ],
      start,
      end,
      SELF,
    );

    expect(days.every((day) => day.minutes === 0)).toBe(true);
  });
});

describe("group_days_by_week", () => {
  it("groups day buckets into weeks that start on the chosen weekday", () => {
    const days = build_day_insights(
      [
        make_event({
          ends_at: local_iso(2026, 7, 21, 10),
          starts_at: local_iso(2026, 7, 21, 9),
        }),
        make_event({
          ends_at: local_iso(2026, 7, 29, 11),
          id: "evt-2",
          starts_at: local_iso(2026, 7, 29, 9),
        }),
      ],
      new Date(2026, 6, 20, 0, 0, 0, 0),
      new Date(2026, 7, 3, 0, 0, 0, 0),
      SELF,
    );
    const weeks = group_days_by_week(days, 1);

    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.week_start.getDate()).toBe(20);
    expect(weeks[0]?.minutes).toBe(60);
    expect(weeks[1]?.week_start.getDate()).toBe(27);
    expect(weeks[1]?.minutes).toBe(120);
  });
});

describe("free_minutes_left", () => {
  it("counts working hours minus busy time, merging overlapping events", () => {
    const from = new Date(2026, 6, 27, 10, 0, 0, 0);
    const until = new Date(2026, 6, 28, 0, 0, 0, 0);
    const free = free_minutes_left(
      [
        make_event({
          ends_at: local_iso(2026, 7, 27, 12),
          starts_at: local_iso(2026, 7, 27, 11),
        }),
        make_event({
          ends_at: local_iso(2026, 7, 27, 12, 30),
          id: "evt-2",
          starts_at: local_iso(2026, 7, 27, 11, 30),
        }),
      ],
      from,
      until,
      8,
      18,
      SELF,
    );

    expect(free).toBe(8 * 60 - 90);
  });

  it("returns zero outside working hours and for an empty window", () => {
    const evening = new Date(2026, 6, 27, 19, 0, 0, 0);
    const midnight = new Date(2026, 6, 28, 0, 0, 0, 0);

    expect(free_minutes_left([], evening, midnight, 8, 18, SELF)).toBe(0);
    expect(free_minutes_left([], midnight, evening, 8, 18, SELF)).toBe(0);
  });
});

describe("next_free_slot", () => {
  it("skips past busy time and rounds to the next quarter hour", () => {
    const from = new Date(2026, 6, 27, 9, 5, 0, 0);
    const slot = next_free_slot(
      [
        make_event({
          ends_at: local_iso(2026, 7, 27, 10, 20),
          starts_at: local_iso(2026, 7, 27, 9),
        }),
      ],
      from,
      60,
      8,
      18,
      SELF,
    );

    expect(slot?.getHours()).toBe(10);
    expect(slot?.getMinutes()).toBe(30);
  });

  it("moves to the next working day when the current one is full", () => {
    const from = new Date(2026, 6, 27, 17, 30, 0, 0);
    const slot = next_free_slot([], from, 60, 8, 18, SELF);

    expect(slot?.getDate()).toBe(28);
    expect(slot?.getHours()).toBe(8);
  });
});

describe("range helpers", () => {
  it("builds week, month and trailing week bounds", () => {
    const reference = new Date(2026, 6, 29, 15, 0, 0, 0);
    const [week_start, week_end] = week_bounds(reference, 1);
    const [month_start, month_end] = month_bounds(reference);
    const [trailing_start, trailing_end] = trailing_weeks_bounds(
      reference,
      1,
      4,
    );

    expect(week_start.getDate()).toBe(27);
    expect(week_end.getDate()).toBe(3);
    expect(month_start.getMonth()).toBe(6);
    expect(month_end.getMonth()).toBe(7);
    expect(trailing_start.getDate()).toBe(6);
    expect(trailing_end.getTime()).toBe(week_end.getTime());
    expect(days_in_span(trailing_start, trailing_end)).toBe(28);
  });
});
