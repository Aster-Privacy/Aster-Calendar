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
import type { DayWorkingLocation } from "@/services/calendar/working_location";

import { describe, expect, it } from "vitest";

import {
  working_location_label,
  working_location_menu,
} from "@/components/calendar/working_location_badge";

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}(${Object.values(params).join(",")})` : key;

const event = { id: "e" } as DecryptedCalendarEvent;

function at(overrides: Partial<DayWorkingLocation>): DayWorkingLocation {
  return {
    location: "office",
    place: "",
    source: "event",
    event,
    is_single_day: true,
    ...overrides,
  };
}

describe("working_location_label", () => {
  it("names the location and marks the usual week", () => {
    expect(working_location_label(at({}), t)).toBe(
      "calendar.working_location_for_day(calendar.working_location_office)",
    );
    expect(
      working_location_label(
        at({ source: "usual", event: null, location: "home" }),
        t,
      ),
    ).toBe(
      "calendar.working_location_usual_for_day(calendar.working_location_home)",
    );
  });

  it("uses the place for other locations", () => {
    expect(
      working_location_label(at({ location: "other", place: "Porto" }), t),
    ).toBe("calendar.working_location_for_day(Porto)");
  });

  it("asks to set one when the day has none", () => {
    expect(working_location_label(null, t)).toBe(
      "calendar.working_location_set",
    );
  });
});

describe("working_location_menu", () => {
  it("offers only the choices when the day follows the usual week", () => {
    expect(
      working_location_menu(
        at({ source: "usual", event: null }),
        "office",
        t,
      ).map((item) => item.action),
    ).toEqual(["office", "home", "other"]);
  });

  it("offers going back to the usual week after a day change", () => {
    const items = working_location_menu(at({ location: "home" }), "office", t);

    expect(items.map((item) => item.action)).toEqual([
      "office",
      "home",
      "other",
      "reset",
    ]);
    expect(items[3].label).toBe(
      "calendar.working_location_use_usual(calendar.working_location_office)",
    );
    expect(items[1].is_active).toBe(true);
  });

  it("offers clearing when the weekday has no usual location", () => {
    const items = working_location_menu(at({}), null, t);

    expect(items[3].label).toBe("calendar.working_location_clear");
  });

  it("hides going back when the day change cannot be edited", () => {
    expect(
      working_location_menu(at({}), "office", t, false).map(
        (item) => item.action,
      ),
    ).toEqual(["office", "home", "other"]);
  });

  it("marks nothing active when the day has no location", () => {
    expect(
      working_location_menu(null, null, t).some((item) => item.is_active),
    ).toBe(false);
  });
});
