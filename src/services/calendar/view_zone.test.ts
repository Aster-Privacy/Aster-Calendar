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

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  CalendarEventDraft,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { occurrence_starts } from "@/services/calendar/recurrence";
import {
  calendar_now,
  from_view_date,
  resolve_view_zone,
  set_active_view_zone,
  shift_event_to_view,
  stamp_draft_zone,
  to_view_date,
  unshift_draft_from_view,
  unshift_event_from_view,
  view_zone_offset_minutes,
} from "@/services/calendar/view_zone";

const original_tz = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "Europe/Berlin";
});

afterAll(() => {
  process.env.TZ = original_tz;
  set_active_view_zone(null);
});

function make_event(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  return {
    attendees: [],
    availability: "busy",
    calendar_id: "cal",
    color: null,
    conference_url: "",
    created_at: "2026-01-01T00:00:00.000Z",
    description: "",
    ends_at: "2026-03-28T10:00:00.000Z",
    event_kind: "default",
    guests_can_invite: false,
    guests_can_modify: false,
    guests_can_see_guests: false,
    id: "event",
    is_all_day: false,
    is_completed: false,
    location: "",
    occurrence_start: null,
    recurrence: null,
    recurrence_exceptions: [],
    recurrence_master_id: null,
    reminder_minutes: null,
    starts_at: "2026-03-28T09:00:00.000Z",
    status: "confirmed",
    tags: [],
    title: "Event",
    updated_at: "2026-01-01T00:00:00.000Z",
    visibility: "default",
    working_location: null,
    ...overrides,
  };
}

function wall(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const AMBIGUOUS_WALLS = new Set([
  "2026-10-25 02:30",
  "2026-11-01 01:30",
  "2026-04-05 02:30",
]);

const ROUND_TRIP_CASES: Array<[string, string, string]> = [
  ["Europe/Berlin", "2026-03-29T00:30:00.000Z", "2026-03-29 01:30"],
  ["Europe/Berlin", "2026-03-29T01:30:00.000Z", "2026-03-29 03:30"],
  ["Europe/Berlin", "2026-10-25T00:30:00.000Z", "2026-10-25 02:30"],
  ["Europe/Berlin", "2026-10-25T01:30:00.000Z", "2026-10-25 02:30"],
  ["America/New_York", "2026-03-08T06:30:00.000Z", "2026-03-08 01:30"],
  ["America/New_York", "2026-03-08T07:30:00.000Z", "2026-03-08 03:30"],
  ["America/New_York", "2026-11-01T05:30:00.000Z", "2026-11-01 01:30"],
  ["America/New_York", "2026-11-01T06:30:00.000Z", "2026-11-01 01:30"],
  ["Australia/Sydney", "2026-04-04T15:30:00.000Z", "2026-04-05 02:30"],
  ["Australia/Sydney", "2026-04-04T16:30:00.000Z", "2026-04-05 02:30"],
  ["Australia/Sydney", "2026-10-03T15:30:00.000Z", "2026-10-04 01:30"],
  ["Australia/Sydney", "2026-10-03T16:30:00.000Z", "2026-10-04 03:30"],
  ["Asia/Kolkata", "2026-03-29T01:00:00.000Z", "2026-03-29 06:30"],
  ["Asia/Kolkata", "2026-10-25T01:00:00.000Z", "2026-10-25 06:30"],
];

describe("to_view_date", () => {
  it.each(ROUND_TRIP_CASES)(
    "shows %s wall clock for %s as %s",
    (zone, instant, expected) => {
      expect(wall(to_view_date(instant, zone))).toBe(expected);
    },
  );

  it("returns the instant unchanged without a view zone", () => {
    const instant = new Date("2026-06-01T12:00:00.000Z");

    expect(to_view_date(instant, null).getTime()).toBe(instant.getTime());
  });
});

describe("from_view_date", () => {
  it.each(
    ROUND_TRIP_CASES.filter(([, , expected]) => !AMBIGUOUS_WALLS.has(expected)),
  )("round trips %s %s", (zone, instant) => {
    const view = to_view_date(instant, zone);

    expect(from_view_date(view, zone).toISOString()).toBe(instant);
  });

  it("collapses the Berlin spring gap hour when dragging across it", () => {
    const before = new Date(2026, 2, 29, 1, 30);
    const inside = new Date(2026, 2, 29, 2, 30);
    const after = new Date(2026, 2, 29, 3, 30);
    const before_ms = from_view_date(before, "Europe/Berlin").getTime();
    const inside_ms = from_view_date(inside, "Europe/Berlin").getTime();
    const after_ms = from_view_date(after, "Europe/Berlin").getTime();

    expect(new Date(before_ms).toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(new Date(after_ms).toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(after_ms - before_ms).toBe(60 * 60 * 1000);
    expect(inside_ms).toBeGreaterThanOrEqual(before_ms);
    expect(inside_ms).toBeLessThanOrEqual(after_ms);
  });

  it("maps a New York drag target across the fall back to one instant", () => {
    const target = new Date(2026, 10, 1, 0, 30);

    expect(from_view_date(target, "America/New_York").toISOString()).toBe(
      "2026-11-01T04:30:00.000Z",
    );
  });

  it("moves a Sydney event from 23:30 to 01:30 across the spring forward", () => {
    const late = new Date(2026, 9, 3, 23, 30);
    const early = new Date(2026, 9, 4, 1, 30);

    expect(from_view_date(late, "Australia/Sydney").toISOString()).toBe(
      "2026-10-03T13:30:00.000Z",
    );
    expect(from_view_date(early, "Australia/Sydney").toISOString()).toBe(
      "2026-10-03T15:30:00.000Z",
    );
  });
});

describe("view_zone_offset_minutes", () => {
  it("reports the zone offset on both sides of a DST change", () => {
    expect(
      view_zone_offset_minutes(new Date(2026, 2, 28, 12, 0), "Europe/Berlin"),
    ).toBe(60);
    expect(
      view_zone_offset_minutes(new Date(2026, 2, 30, 12, 0), "Europe/Berlin"),
    ).toBe(120);
    expect(
      view_zone_offset_minutes(new Date(2026, 5, 1, 12, 0), "Asia/Kolkata"),
    ).toBe(330);
    expect(
      view_zone_offset_minutes(new Date(2026, 6, 1, 12, 0), "Australia/Sydney"),
    ).toBe(600);
  });
});

describe("shift_event_to_view", () => {
  it("renders a timed event in the viewing zone and restores the instant", () => {
    const event = make_event();
    const shown = shift_event_to_view(event, "Asia/Kolkata");

    expect(wall(new Date(shown.starts_at))).toBe("2026-03-28 14:30");
    expect(wall(new Date(shown.ends_at))).toBe("2026-03-28 15:30");
    expect(unshift_event_from_view(shown, "Asia/Kolkata").starts_at).toBe(
      event.starts_at,
    );
    expect(unshift_event_from_view(shown, "Asia/Kolkata").ends_at).toBe(
      event.ends_at,
    );
  });

  it("never shifts an all-day event", () => {
    const event = make_event({
      ends_at: "2026-03-28T22:59:59.999Z",
      is_all_day: true,
      starts_at: "2026-03-27T23:00:00.000Z",
    });

    expect(shift_event_to_view(event, "Australia/Sydney")).toBe(event);
    expect(unshift_event_from_view(event, "Australia/Sydney")).toBe(event);
  });

  it("keeps occurrence_start as the real instant", () => {
    const event = make_event({
      occurrence_start: "2026-03-28T09:00:00.000Z",
      recurrence_master_id: "master",
    });

    expect(
      shift_event_to_view(event, "America/New_York").occurrence_start,
    ).toBe("2026-03-28T09:00:00.000Z");
  });

  it("shows a weekly Berlin series at the Kolkata wall clock across the spring forward", () => {
    const starts = occurrence_starts(
      make_event({
        ends_at: "2026-03-22T08:30:00.000Z",
        recurrence: {
          by_weekday: [],
          count: null,
          frequency: "weekly",
          interval: 1,
          time_zone: "Europe/Berlin",
          until: null,
        },
        starts_at: "2026-03-22T08:00:00.000Z",
      }),
      new Date("2026-03-22T00:00:00Z"),
      new Date("2026-04-06T00:00:00Z"),
    );

    expect(
      starts.map((start) => wall(to_view_date(start, "Asia/Kolkata"))),
    ).toEqual(["2026-03-22 13:30", "2026-03-29 12:30", "2026-04-05 12:30"]);
    expect(
      starts.map((start) => wall(to_view_date(start, "Europe/Berlin"))),
    ).toEqual(["2026-03-22 09:00", "2026-03-29 09:00", "2026-04-05 09:00"]);
  });
});

describe("drafts", () => {
  const make_draft = (): CalendarEventDraft => ({
    attendees: [],
    availability: "busy",
    calendar_id: "cal",
    color: null,
    conference_url: "",
    description: "",
    ends_at: new Date(2026, 9, 25, 3, 0).toISOString(),
    event_kind: "default",
    guests_can_invite: false,
    guests_can_modify: false,
    guests_can_see_guests: false,
    is_all_day: false,
    is_completed: false,
    location: "",
    recurrence: null,
    recurrence_exceptions: [],
    reminder_minutes: null,
    starts_at: new Date(2026, 9, 25, 1, 0).toISOString(),
    status: "confirmed",
    tags: [],
    title: "Draft",
    visibility: "default",
    working_location: null,
  });

  it("turns a draft typed in the viewing zone back into instants", () => {
    const real = unshift_draft_from_view(make_draft(), "America/New_York");

    expect(real.starts_at).toBe("2026-10-25T05:00:00.000Z");
    expect(real.ends_at).toBe("2026-10-25T07:00:00.000Z");
  });

  it("stamps the viewing zone on a new recurring draft only", () => {
    expect(stamp_draft_zone(make_draft(), "Asia/Kolkata").recurrence).toBeNull();

    const recurring = stamp_draft_zone(
      {
        ...make_draft(),
        recurrence: {
          by_weekday: [],
          count: null,
          frequency: "daily",
          interval: 1,
          until: null,
        },
      },
      "Asia/Kolkata",
    );

    expect(recurring.recurrence?.time_zone).toBe("Asia/Kolkata");
    expect(
      stamp_draft_zone(recurring, "Australia/Sydney").recurrence?.time_zone,
    ).toBe("Asia/Kolkata");
  });
});

describe("resolve_view_zone", () => {
  it("falls back to the device for empty, invalid and device values", () => {
    expect(resolve_view_zone("")).toBeNull();
    expect(resolve_view_zone(undefined)).toBeNull();
    expect(resolve_view_zone("Not/AZone")).toBeNull();
    expect(resolve_view_zone("Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  it("drives calendar_now through the active zone", () => {
    set_active_view_zone("Asia/Kolkata");

    const shown = calendar_now();
    const expected = to_view_date(Date.now(), "Asia/Kolkata");

    expect(Math.abs(shown.getTime() - expected.getTime())).toBeLessThan(2_000);

    set_active_view_zone(null);
  });
});
