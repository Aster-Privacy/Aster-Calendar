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

import { build_merged_preferences } from "@/services/api/preferences";
import {
  EMPTY_WORKING_WEEK,
  is_working_location_event,
  normalize_working_week,
  resolve_day_working_location,
} from "@/services/calendar/working_location";

function event(
  overrides: Partial<DecryptedCalendarEvent>,
): DecryptedCalendarEvent {
  return {
    id: "e",
    calendar_id: "c",
    title: "Office",
    description: "",
    location: "",
    starts_at: new Date(2026, 10, 10).toISOString(),
    ends_at: new Date(2026, 10, 11).toISOString(),
    is_all_day: true,
    event_kind: "working_location",
    working_location: "office",
    updated_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  } as DecryptedCalendarEvent;
}

const tuesday = new Date(2026, 10, 10);
const week = { ...EMPTY_WORKING_WEEK, "2": "home" as const };

describe("resolve_day_working_location", () => {
  it("uses the usual week when the day has no change", () => {
    expect(resolve_day_working_location(tuesday, [], week)).toEqual({
      location: "home",
      place: "",
      source: "usual",
      event: null,
      is_single_day: false,
    });
  });

  it("returns nothing when neither applies", () => {
    expect(
      resolve_day_working_location(tuesday, [], EMPTY_WORKING_WEEK),
    ).toBeNull();
  });

  it("lets a working location event beat the usual week", () => {
    const change = event({ id: "a" });
    const result = resolve_day_working_location(tuesday, [change], week);

    expect(result?.location).toBe("office");
    expect(result?.source).toBe("event");
    expect(result?.event).toBe(change);
    expect(result?.is_single_day).toBe(true);
  });

  it("covers every day of a multi-day event", () => {
    const trip = event({
      id: "trip",
      working_location: "other",
      location: "Porto",
      starts_at: new Date(2026, 10, 9).toISOString(),
      ends_at: new Date(2026, 10, 13).toISOString(),
    });
    const result = resolve_day_working_location(tuesday, [trip], week);

    expect(result?.location).toBe("other");
    expect(result?.place).toBe("Porto");
    expect(result?.is_single_day).toBe(false);
  });

  it("picks the most recently updated of several changes", () => {
    const older = event({
      id: "old",
      working_location: "home",
      starts_at: new Date(2026, 10, 9).toISOString(),
      ends_at: new Date(2026, 10, 13).toISOString(),
      updated_at: "2026-10-01T00:00:00.000Z",
    });
    const newer = event({ id: "new", updated_at: "2026-11-05T00:00:00.000Z" });

    expect(
      resolve_day_working_location(tuesday, [newer, older], week)?.event,
    ).toBe(newer);
    expect(
      resolve_day_working_location(tuesday, [older, newer], week)?.event,
    ).toBe(newer);
  });

  it("prefers a single-day change over a newer series or multi-day event", () => {
    const change = event({
      id: "day",
      working_location: "home",
      updated_at: "2026-10-01T00:00:00.000Z",
    });
    const series = event({
      id: "series",
      recurrence_master_id: "master",
      updated_at: "2026-11-09T00:00:00.000Z",
    });
    const trip = event({
      id: "trip",
      working_location: "other",
      starts_at: new Date(2026, 10, 9).toISOString(),
      ends_at: new Date(2026, 10, 13).toISOString(),
      updated_at: "2026-11-09T00:00:00.000Z",
    });

    expect(
      resolve_day_working_location(tuesday, [series, trip, change], week)
        ?.event,
    ).toBe(change);
  });

  it("ignores other event kinds and other days", () => {
    const meeting = event({ event_kind: "default" });
    const tomorrow = event({
      starts_at: new Date(2026, 10, 11).toISOString(),
      ends_at: new Date(2026, 10, 12).toISOString(),
    });

    expect(
      resolve_day_working_location(tuesday, [meeting, tomorrow], week)?.source,
    ).toBe("usual");
  });
});

describe("normalize_working_week", () => {
  it("keeps valid days and drops anything else", () => {
    expect(
      normalize_working_week({ "1": "office", "2": "moon", "9": "home" }),
    ).toEqual({ ...EMPTY_WORKING_WEEK, "1": "office" });
  });

  it("returns an empty week for non-objects", () => {
    expect(normalize_working_week(null)).toEqual(EMPTY_WORKING_WEEK);
    expect(normalize_working_week("office")).toEqual(EMPTY_WORKING_WEEK);
  });
});

describe("is_working_location_event", () => {
  it("matches only working location events", () => {
    expect(is_working_location_event(event({}))).toBe(true);
    expect(is_working_location_event(event({ event_kind: "task" }))).toBe(
      false,
    );
  });
});

describe("calendar_working_week preference", () => {
  it("defaults to an empty week", () => {
    expect(build_merged_preferences({}, null).calendar_working_week).toEqual(
      EMPTY_WORKING_WEEK,
    );
  });

  it("normalises a stored week", () => {
    const merged = build_merged_preferences(
      { calendar_working_week: { "1": "office", "5": "beach" } } as never,
      null,
    );

    expect(merged.calendar_working_week).toEqual({
      ...EMPTY_WORKING_WEEK,
      "1": "office",
    });
  });
});
