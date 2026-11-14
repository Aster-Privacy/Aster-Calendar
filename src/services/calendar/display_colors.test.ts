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
  BIRTHDAY_CALENDAR_ID,
  BIRTHDAY_COLOR,
} from "@/services/calendar/birthdays";
import {
  HOLIDAY_CALENDAR_ID,
  HOLIDAY_COLOR,
} from "@/services/calendar/holidays";
import {
  EVENT_COLOR_OVERRIDE_MAX_ENTRIES,
  apply_display_colors,
  event_color_override,
  event_color_override_key,
  is_read_only_event,
  normalize_hex,
  resolve_birthdays_color,
  resolve_birthdays_name,
  resolve_holidays_color,
  sanitize_event_color_overrides,
  with_event_color_override,
} from "@/services/calendar/display_colors";

function make_event(
  overrides: Partial<DecryptedCalendarEvent>,
): DecryptedCalendarEvent {
  return {
    id: "6f1c1d1e-0000-4000-8000-000000000001",
    calendar_id: "cal-1",
    title: "Event",
    description: "",
    location: "",
    starts_at: "2026-12-25T00:00:00.000Z",
    ends_at: "2026-12-26T00:00:00.000Z",
    is_all_day: true,
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
    ...overrides,
  } as DecryptedCalendarEvent;
}

const HOLIDAY_2026 = make_event({
  id: "holiday-us-2026-12-25-Christmas Day",
  calendar_id: HOLIDAY_CALENDAR_ID,
  color: HOLIDAY_COLOR,
});
const HOLIDAY_2027 = make_event({
  id: "holiday-us-2027-12-25-Christmas Day",
  calendar_id: HOLIDAY_CALENDAR_ID,
  color: HOLIDAY_COLOR,
});
const BIRTHDAY = make_event({
  id: "birthday-contact-7-2026-03-04",
  calendar_id: BIRTHDAY_CALENDAR_ID,
  color: BIRTHDAY_COLOR,
  event_kind: "birthday",
});
const SUBSCRIBED = make_event({
  id: "subscription-sub-1-uid-42::2026-12-25T00:00:00.000Z",
  calendar_id: "__subscription_sub-1__",
  color: "#3b82f6",
});
const NORMAL = make_event({ color: "#22c55e" });

describe("normalize_hex", () => {
  it("accepts any hex color, not only palette entries", () => {
    expect(normalize_hex("#ABCDEF")).toBe("#abcdef");
    expect(normalize_hex(" #0f8 ")).toBe("#00ff88");
    expect(normalize_hex("#123456")).toBe("#123456");
  });

  it("rejects anything that is not a hex color", () => {
    expect(normalize_hex("red")).toBeNull();
    expect(normalize_hex("#12345")).toBeNull();
    expect(normalize_hex("url(javascript:alert(1))")).toBeNull();
    expect(normalize_hex(3)).toBeNull();
  });
});

describe("synthetic calendar settings", () => {
  it("falls back to the built-in colors", () => {
    expect(resolve_birthdays_color({})).toBe(BIRTHDAY_COLOR);
    expect(resolve_holidays_color({ calendar_holidays_color: "" })).toBe(
      HOLIDAY_COLOR,
    );
    expect(
      resolve_birthdays_color({ calendar_birthdays_color: "nonsense" }),
    ).toBe(BIRTHDAY_COLOR);
  });

  it("uses the saved colors", () => {
    expect(
      resolve_birthdays_color({ calendar_birthdays_color: "#A1B2C3" }),
    ).toBe("#a1b2c3");
    expect(resolve_holidays_color({ calendar_holidays_color: "#010203" })).toBe(
      "#010203",
    );
  });

  it("uses a saved name and falls back when it is blank", () => {
    expect(resolve_birthdays_name("  Family  ", "Birthdays")).toBe("Family");
    expect(resolve_birthdays_name("   ", "Birthdays")).toBe("Birthdays");
    expect(resolve_birthdays_name(undefined, "Birthdays")).toBe("Birthdays");
    expect(resolve_birthdays_name("x".repeat(500), "Birthdays")).toHaveLength(
      120,
    );
  });
});

describe("read-only events", () => {
  it("treats generated and subscribed events as read-only", () => {
    expect(is_read_only_event(HOLIDAY_2026)).toBe(true);
    expect(is_read_only_event(BIRTHDAY)).toBe(true);
    expect(is_read_only_event(SUBSCRIBED)).toBe(true);
    expect(is_read_only_event({ id: "booking-1" })).toBe(true);
    expect(is_read_only_event(NORMAL)).toBe(false);
  });

  it("keys a holiday by region and title so every year shares a color", () => {
    expect(event_color_override_key(HOLIDAY_2026)).toBe(
      "holiday-us-Christmas Day",
    );
    expect(event_color_override_key(HOLIDAY_2027)).toBe(
      event_color_override_key(HOLIDAY_2026),
    );
  });

  it("keys a birthday by contact and a subscription by series", () => {
    expect(event_color_override_key(BIRTHDAY)).toBe("birthday-contact-7");
    expect(event_color_override_key(SUBSCRIBED)).toBe(
      "subscription-sub-1-uid-42",
    );
  });
});

describe("event color overrides", () => {
  it("stores, replaces, and clears an override", () => {
    const first = with_event_color_override({}, HOLIDAY_2026, "#ABCDEF");

    expect(first).toEqual({ "holiday-us-Christmas Day": "#abcdef" });
    expect(event_color_override(first, HOLIDAY_2027)).toBe("#abcdef");

    const second = with_event_color_override(first, HOLIDAY_2027, "#112233");

    expect(second).toEqual({ "holiday-us-Christmas Day": "#112233" });
    expect(with_event_color_override(second, HOLIDAY_2026, null)).toEqual({});
  });

  it("keeps the map bounded", () => {
    let overrides = {};

    for (
      let index = 0;
      index < EVENT_COLOR_OVERRIDE_MAX_ENTRIES + 20;
      index++
    ) {
      overrides = with_event_color_override(
        overrides,
        { id: `subscription-sub-${index}` },
        "#000000",
      );
    }

    expect(Object.keys(overrides)).toHaveLength(
      EVENT_COLOR_OVERRIDE_MAX_ENTRIES,
    );
    expect(event_color_override(overrides, { id: "subscription-sub-0" })).toBe(
      null,
    );
  });

  it("drops invalid entries from synced data", () => {
    expect(
      sanitize_event_color_overrides({
        "holiday-us-New Year": "#ABC",
        "6f1c1d1e-0000-4000-8000-000000000001": "#123456",
        "subscription-sub-1-x": "red",
        "birthday-contact-1": 5,
      }),
    ).toEqual({ "holiday-us-New Year": "#aabbcc" });
    expect(sanitize_event_color_overrides(["#123456"])).toEqual({});
    expect(sanitize_event_color_overrides(null)).toEqual({});
  });
});

describe("apply_display_colors", () => {
  it("recolors the birthdays and holidays calendars", () => {
    const [holiday, birthday, normal] = apply_display_colors(
      [HOLIDAY_2026, BIRTHDAY, NORMAL],
      {
        calendar_birthdays_color: "#111111",
        calendar_holidays_color: "#222222",
      },
    );

    expect(holiday.color).toBe("#222222");
    expect(birthday.color).toBe("#111111");
    expect(normal).toBe(NORMAL);
  });

  it("applies a per-event override on top of the calendar color", () => {
    const overrides = with_event_color_override(
      with_event_color_override({}, HOLIDAY_2026, "#333333"),
      SUBSCRIBED,
      "#444444",
    );
    const [holiday_2027, subscribed, birthday] = apply_display_colors(
      [HOLIDAY_2027, SUBSCRIBED, BIRTHDAY],
      {
        calendar_holidays_color: "#222222",
        calendar_event_color_overrides: overrides,
      },
    );

    expect(holiday_2027.color).toBe("#333333");
    expect(subscribed.color).toBe("#444444");
    expect(birthday.color).toBe(BIRTHDAY_COLOR);
  });

  it("ignores overrides for events you own", () => {
    const [normal] = apply_display_colors([NORMAL], {
      calendar_event_color_overrides: {
        [NORMAL.id]: "#999999",
      },
    });

    expect(normal.color).toBe("#22c55e");
  });

  it("gives birthday events you created or imported the birthdays color", () => {
    const own_birthday = make_event({ event_kind: "birthday", color: null });
    const colored = make_event({ event_kind: "birthday", color: "#123456" });

    expect(apply_display_colors([own_birthday], {})[0].color).toBe(
      BIRTHDAY_COLOR,
    );
    expect(apply_display_colors([colored], {})[0]).toBe(colored);
    expect(
      apply_display_colors([own_birthday], {
        calendar_birthdays_color: "#555555",
      })[0].color,
    ).toBe("#555555");
  });
});
