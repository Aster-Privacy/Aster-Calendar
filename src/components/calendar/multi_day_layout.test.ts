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

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { add_days, events_for_day } from "./calendar_utils";
import {
  event_last_day,
  is_joinable_event,
  layout_day_lanes,
  shows_as_all_day_on,
  spans_multiple_days,
  type DayLanes,
} from "./multi_day_layout";

function make_event(
  id: string,
  starts_at: Date,
  ends_at: Date,
  is_all_day: boolean,
): DecryptedCalendarEvent {
  return {
    id,
    calendar_id: "cal",
    title: id,
    description: "",
    location: "",
    starts_at: starts_at.toISOString(),
    ends_at: ends_at.toISOString(),
    is_all_day,
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
    guests_can_invite: false,
    guests_can_see_guests: true,
    recurrence: null,
    recurrence_exceptions: [],
    recurrence_master_id: null,
    occurrence_start: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  } as DecryptedCalendarEvent;
}

function local(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  ms = 0,
): Date {
  return new Date(year, month - 1, day, hour, minute, 0, ms);
}

function all_day(id: string, first: Date, last: Date): DecryptedCalendarEvent {
  const end = new Date(last);

  end.setHours(23, 59, 59, 999);

  return make_event(id, first, end, true);
}

function week_of(first: Date, count = 7): Date[] {
  return Array.from({ length: count }, (_, index) => add_days(first, index));
}

function lay_out(
  events: DecryptedCalendarEvent[],
  days: Date[],
  max_lanes?: number,
): DayLanes<DecryptedCalendarEvent>[] {
  return layout_day_lanes(
    days.map((day) => events_for_day(events, day)),
    { is_joinable: is_joinable_event, max_lanes },
  );
}

function lane_of(
  lanes: DayLanes<DecryptedCalendarEvent>[],
  day_index: number,
  id: string,
): number {
  return lanes[day_index].slots.findIndex((slot) => slot?.event.id === id);
}

function segment_of(
  lanes: DayLanes<DecryptedCalendarEvent>[],
  day_index: number,
  id: string,
) {
  const slot = lanes[day_index].slots.find((entry) => entry?.event.id === id);

  if (!slot) {
    throw new Error(`no slot for ${id} on day ${day_index}`);
  }

  return {
    is_start: slot.is_start,
    is_end: slot.is_end,
    span_days: slot.span_days,
  };
}

const SUNDAY = local(2026, 11, 8);

describe("event_last_day", () => {
  it("treats a midnight end as exclusive", () => {
    const event = make_event(
      "a",
      local(2026, 11, 9),
      local(2026, 11, 12),
      true,
    );

    expect(event_last_day(event).getDate()).toBe(11);
  });

  it("keeps the start day when the end is not after the start", () => {
    const event = make_event(
      "a",
      local(2026, 11, 9, 10),
      local(2026, 11, 9, 10),
      false,
    );

    expect(event_last_day(event).getDate()).toBe(9);
    expect(spans_multiple_days(event)).toBe(false);
  });

  it("marks a timed event that crosses midnight as multi-day", () => {
    const event = make_event(
      "late",
      local(2026, 11, 9, 22),
      local(2026, 11, 10, 2),
      false,
    );

    expect(spans_multiple_days(event)).toBe(true);
    expect(is_joinable_event(event)).toBe(true);
  });

  it("keeps a timed event ending at midnight on one day", () => {
    const event = make_event(
      "evening",
      local(2026, 11, 9, 20),
      local(2026, 11, 10),
      false,
    );

    expect(spans_multiple_days(event)).toBe(false);
    expect(is_joinable_event(event)).toBe(false);
  });
});

describe("shows_as_all_day_on", () => {
  const trip = make_event(
    "trip",
    local(2026, 11, 9, 18),
    local(2026, 11, 12, 9),
    false,
  );

  it("is true only on days the timed event fully covers", () => {
    expect(shows_as_all_day_on(trip, local(2026, 11, 9))).toBe(false);
    expect(shows_as_all_day_on(trip, local(2026, 11, 10))).toBe(true);
    expect(shows_as_all_day_on(trip, local(2026, 11, 11))).toBe(true);
    expect(shows_as_all_day_on(trip, local(2026, 11, 12))).toBe(false);
  });

  it("is always true for all-day events", () => {
    const holiday = all_day("holiday", local(2026, 11, 9), local(2026, 11, 9));

    expect(shows_as_all_day_on(holiday, local(2026, 11, 9))).toBe(true);
  });
});

describe("layout_day_lanes", () => {
  it("joins an all-day event across consecutive days in one lane", () => {
    const days = week_of(SUNDAY);
    const lanes = lay_out(
      [all_day("trip", local(2026, 11, 10), local(2026, 11, 12))],
      days,
    );

    expect(lane_of(lanes, 2, "trip")).toBe(0);
    expect(lane_of(lanes, 3, "trip")).toBe(0);
    expect(lane_of(lanes, 4, "trip")).toBe(0);
    expect(segment_of(lanes, 2, "trip")).toEqual({
      is_start: true,
      is_end: false,
      span_days: 3,
    });
    expect(segment_of(lanes, 3, "trip")).toEqual({
      is_start: false,
      is_end: false,
      span_days: 2,
    });
    expect(segment_of(lanes, 4, "trip")).toEqual({
      is_start: false,
      is_end: true,
      span_days: 1,
    });
    expect(lanes[5].slots).toEqual([]);
  });

  it("does not bleed an exclusive midnight end into the next day", () => {
    const days = week_of(SUNDAY);
    const lanes = lay_out(
      [make_event("ics", local(2026, 11, 9), local(2026, 11, 11), true)],
      days,
    );

    expect(lane_of(lanes, 1, "ics")).toBe(0);
    expect(segment_of(lanes, 2, "ics").is_end).toBe(true);
    expect(lanes[3].slots).toEqual([]);
  });

  it("splits a multi-week event into one segment per week row", () => {
    const event = all_day("vacation", local(2026, 11, 12), local(2026, 11, 17));
    const first_row = lay_out([event], week_of(SUNDAY));
    const second_row = lay_out([event], week_of(add_days(SUNDAY, 7)));

    expect(segment_of(first_row, 4, "vacation")).toEqual({
      is_start: true,
      is_end: false,
      span_days: 3,
    });
    expect(segment_of(first_row, 6, "vacation")).toEqual({
      is_start: false,
      is_end: true,
      span_days: 1,
    });
    expect(segment_of(second_row, 0, "vacation")).toEqual({
      is_start: true,
      is_end: false,
      span_days: 3,
    });
    expect(segment_of(second_row, 2, "vacation")).toEqual({
      is_start: false,
      is_end: true,
      span_days: 1,
    });
  });

  it("joins a timed event that crosses midnight", () => {
    const days = week_of(SUNDAY);
    const lanes = lay_out(
      [
        make_event(
          "red_eye",
          local(2026, 11, 10, 22),
          local(2026, 11, 11, 6),
          false,
        ),
      ],
      days,
    );

    expect(segment_of(lanes, 2, "red_eye")).toEqual({
      is_start: true,
      is_end: false,
      span_days: 2,
    });
    expect(segment_of(lanes, 3, "red_eye")).toEqual({
      is_start: false,
      is_end: true,
      span_days: 1,
    });
  });

  it("keeps a single-day timed event as its own chip each day", () => {
    const days = week_of(SUNDAY);
    const lanes = lay_out(
      [
        make_event(
          "standup",
          local(2026, 11, 10, 9),
          local(2026, 11, 10, 10),
          false,
        ),
      ],
      days,
    );

    expect(segment_of(lanes, 2, "standup")).toEqual({
      is_start: true,
      is_end: true,
      span_days: 1,
    });
  });

  it("keeps overlapping multi-day events in stable lanes", () => {
    const days = week_of(SUNDAY);
    const long = all_day("long", local(2026, 11, 9), local(2026, 11, 13));
    const short = all_day("short", local(2026, 11, 11), local(2026, 11, 14));
    const lanes = lay_out(
      [
        short,
        long,
        make_event(
          "lunch",
          local(2026, 11, 12, 12),
          local(2026, 11, 12, 13),
          false,
        ),
      ],
      days,
    );

    for (let day_index = 1; day_index <= 5; day_index += 1) {
      expect(lane_of(lanes, day_index, "long")).toBe(0);
    }

    for (let day_index = 3; day_index <= 6; day_index += 1) {
      expect(lane_of(lanes, day_index, "short")).toBe(1);
    }

    expect(lane_of(lanes, 4, "lunch")).toBe(2);
  });

  it("leaves a gap so a later bar stays in its lane", () => {
    const days = week_of(SUNDAY);
    const first = all_day("first", local(2026, 11, 8), local(2026, 11, 10));
    const second = all_day("second", local(2026, 11, 9), local(2026, 11, 13));
    const lanes = lay_out([first, second], days);

    expect(lane_of(lanes, 1, "second")).toBe(1);
    expect(lanes[4].slots[0]).toBeNull();
    expect(lane_of(lanes, 4, "second")).toBe(1);
  });

  it("puts a single-day event into a free lower lane", () => {
    const days = week_of(SUNDAY);
    const first = all_day("first", local(2026, 11, 8), local(2026, 11, 10));
    const second = all_day("second", local(2026, 11, 9), local(2026, 11, 13));
    const meeting = make_event(
      "meeting",
      local(2026, 11, 12, 15),
      local(2026, 11, 12, 16),
      false,
    );
    const lanes = lay_out([first, second, meeting], days);

    expect(lane_of(lanes, 4, "meeting")).toBe(0);
    expect(lane_of(lanes, 4, "second")).toBe(1);
  });

  it("hides lanes past the limit and counts them", () => {
    const days = week_of(SUNDAY);
    const events = ["a", "b", "c", "d"].map((id) =>
      all_day(id, local(2026, 11, 9), local(2026, 11, 11)),
    );
    const lanes = lay_out(events, days, 2);

    expect(lanes[1].slots).toHaveLength(2);
    expect(lanes[1].hidden_count).toBe(2);
    expect(segment_of(lanes, 1, "a")).toEqual({
      is_start: true,
      is_end: false,
      span_days: 3,
    });
  });

  it("shows the last lane instead of a one-item overflow", () => {
    const days = week_of(SUNDAY);
    const events = ["a", "b", "c"].map((id) =>
      all_day(id, local(2026, 11, 9), local(2026, 11, 9)),
    );
    const lanes = lay_out(events, days, 2);

    expect(lanes[1].slots).toHaveLength(3);
    expect(lanes[1].hidden_count).toBe(0);
  });

  it("ends a segment where the next day hides its lane", () => {
    const days = week_of(SUNDAY);
    const blocker = all_day("blocker", local(2026, 11, 8), local(2026, 11, 11));
    const bar = all_day("bar", local(2026, 11, 9), local(2026, 11, 11));
    const crowd = ["c1", "c2"].map((id) =>
      all_day(id, local(2026, 11, 11), local(2026, 11, 11)),
    );
    const lanes = lay_out([blocker, bar, ...crowd], days, 1);

    expect(lane_of(lanes, 1, "bar")).toBe(1);
    expect(segment_of(lanes, 1, "bar")).toEqual({
      is_start: true,
      is_end: false,
      span_days: 2,
    });
    expect(segment_of(lanes, 2, "bar").is_end).toBe(true);
    expect(lanes[3].slots).toHaveLength(1);
    expect(lanes[3].hidden_count).toBe(3);
    expect(segment_of(lanes, 2, "blocker").is_end).toBe(false);
  });

  it("joins across columns when weekends are hidden", () => {
    const weekdays = week_of(SUNDAY, 14).filter(
      (day) => day.getDay() !== 0 && day.getDay() !== 6,
    );
    const lanes = lay_out(
      [all_day("long_weekend", local(2026, 11, 13), local(2026, 11, 16))],
      weekdays.slice(0, 10),
    );

    expect(segment_of(lanes, 4, "long_weekend")).toEqual({
      is_start: true,
      is_end: false,
      span_days: 2,
    });
    expect(segment_of(lanes, 5, "long_weekend").is_end).toBe(true);
  });

  it("does not join two separate occurrences of a recurring event", () => {
    const days = week_of(SUNDAY);
    const monday = all_day("daily", local(2026, 11, 9), local(2026, 11, 9));
    const tuesday = all_day("daily", local(2026, 11, 10), local(2026, 11, 10));
    const lanes = lay_out([monday, tuesday], days);

    expect(segment_of(lanes, 1, "daily")).toEqual({
      is_start: true,
      is_end: true,
      span_days: 1,
    });
    expect(segment_of(lanes, 2, "daily").is_start).toBe(true);
  });
});

describe("layout_day_lanes across a daylight saving change", () => {
  let previous_zone: string | undefined;

  beforeEach(() => {
    previous_zone = process.env.TZ;
    process.env.TZ = "America/New_York";
  });

  afterEach(() => {
    if (previous_zone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous_zone;
    }
  });

  it("joins an all-day event over the 25-hour fall-back day", () => {
    const days = week_of(local(2026, 10, 31), 4);
    const event = all_day("fall", local(2026, 10, 31), local(2026, 11, 2));
    const lanes = lay_out([event], days);

    expect(event_last_day(event).getDate()).toBe(2);
    expect(segment_of(lanes, 0, "fall")).toEqual({
      is_start: true,
      is_end: false,
      span_days: 3,
    });
    expect(segment_of(lanes, 2, "fall").is_end).toBe(true);
    expect(lanes[3].slots).toEqual([]);
  });

  it("joins a timed event over the 23-hour spring-forward day", () => {
    const days = week_of(local(2026, 3, 7), 3);
    const event = make_event(
      "spring",
      local(2026, 3, 7, 20),
      local(2026, 3, 9, 1),
      false,
    );
    const lanes = lay_out([event], days);

    expect(shows_as_all_day_on(event, local(2026, 3, 8))).toBe(true);
    expect(segment_of(lanes, 0, "spring").span_days).toBe(3);
  });
});
