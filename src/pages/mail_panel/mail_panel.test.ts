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
  is_allowed_host_origin,
  is_mail_panel_path,
  is_panel_account_allowed,
  read_panel_expected_user,
  parse_panel_theme,
  read_host_message,
  read_initial_panel_appearance,
} from "@/pages/mail_panel/mail_panel_bridge";
import { now_divider_index } from "@/pages/mail_panel/mail_panel_agenda";
import {
  day_key,
  days_with_events,
} from "@/pages/mail_panel/mail_panel_mini_month";
import { is_read_only_panel_event } from "@/pages/mail_panel/mail_panel_event_view";
import {
  build_holiday_events,
  is_declined_by,
} from "@/pages/mail_panel/mail_panel_sources";
import { BIRTHDAY_EVENT_PREFIX } from "@/services/calendar/birthdays";
import { HOLIDAY_EVENT_PREFIX } from "@/services/calendar/holidays";
import { SUBSCRIPTION_EVENT_PREFIX } from "@/services/calendar/subscriptions";

function make_event(
  overrides: Partial<DecryptedCalendarEvent>,
): DecryptedCalendarEvent {
  return {
    id: "evt",
    calendar_id: "cal",
    title: "Event",
    starts_at: new Date(2026, 10, 2, 9).toISOString(),
    ends_at: new Date(2026, 10, 2, 10).toISOString(),
    is_all_day: false,
    attendees: [],
    ...overrides,
  } as DecryptedCalendarEvent;
}

describe("mail panel account binding", () => {
  const findley = "0b6f1c2e-4a3d-4c8e-9f10-2a3b4c5d6e7f";
  const hello = "7e6d5c4b-3a2b-4c1d-8e0f-9a8b7c6d5e4f";

  it("reads the Mail account the panel must show", () => {
    expect(read_panel_expected_user(`?theme=dark&account=${findley}`)).toBe(
      findley,
    );
    expect(read_panel_expected_user(`?account=${findley.toUpperCase()}`)).toBe(
      findley,
    );
  });

  it("ignores a missing or malformed account", () => {
    expect(read_panel_expected_user("?theme=dark")).toBeNull();
    expect(read_panel_expected_user("")).toBeNull();
    expect(read_panel_expected_user("?account=hello")).toBeNull();
    expect(read_panel_expected_user(`?account=${findley}x`)).toBeNull();
  });

  it("refuses to show another account than the one Mail names", () => {
    expect(is_panel_account_allowed(findley, hello)).toBe(false);
    expect(is_panel_account_allowed(findley, null)).toBe(false);
    expect(is_panel_account_allowed(findley, undefined)).toBe(false);
    expect(is_panel_account_allowed(findley, "")).toBe(false);
  });

  it("shows the account Mail names", () => {
    expect(is_panel_account_allowed(findley, findley)).toBe(true);
    expect(is_panel_account_allowed(findley, findley.toUpperCase())).toBe(
      true,
    );
  });

  it("follows Mail when it switches accounts", () => {
    const before = read_panel_expected_user(`?account=${findley}`);
    const after = read_panel_expected_user(`?account=${hello}`);

    expect(is_panel_account_allowed(before, findley)).toBe(true);
    expect(is_panel_account_allowed(before, hello)).toBe(false);
    expect(is_panel_account_allowed(after, hello)).toBe(true);
    expect(is_panel_account_allowed(after, findley)).toBe(false);
  });

  it("keeps the panel usable when Mail names no account", () => {
    expect(is_panel_account_allowed(null, hello)).toBe(true);
  });
});

describe("mail_panel_bridge", () => {
  it("accepts only the Mail origin in production", () => {
    expect(is_allowed_host_origin("https://app.astermail.org", false)).toBe(
      true,
    );
    expect(is_allowed_host_origin("https://astermail.org", false)).toBe(false);
    expect(
      is_allowed_host_origin("https://app.astermail.org.evil", false),
    ).toBe(false);
    expect(is_allowed_host_origin("http://localhost:5173", false)).toBe(false);
    expect(is_allowed_host_origin("null", false)).toBe(false);
  });

  it("accepts local origins only in development", () => {
    expect(is_allowed_host_origin("http://localhost:5173", true)).toBe(true);
    expect(is_allowed_host_origin("http://127.0.0.1", true)).toBe(true);
    expect(is_allowed_host_origin("https://localhost:5173", true)).toBe(false);
    expect(is_allowed_host_origin("http://localhost.evil:80", true)).toBe(
      false,
    );
  });

  it("matches the panel path exactly", () => {
    expect(is_mail_panel_path("/mail-panel")).toBe(true);
    expect(is_mail_panel_path("/mail-panel/")).toBe(true);
    expect(is_mail_panel_path("/mail-panel/x")).toBe(false);
    expect(is_mail_panel_path("/")).toBe(false);
    expect(is_mail_panel_path("/mail-panels")).toBe(false);
  });

  it("parses only known themes", () => {
    expect(parse_panel_theme("light")).toBe("light");
    expect(parse_panel_theme("dark")).toBe("dark");
    expect(parse_panel_theme("system")).toBeNull();
    expect(parse_panel_theme(1)).toBeNull();
    expect(read_initial_panel_appearance("?theme=dark")).toEqual({
      theme: "dark",
      palette: "default",
      accent: "",
    });
    expect(
      read_initial_panel_appearance(
        "?theme=dark&palette=aster-blue&accent=%234f7df3",
      ),
    ).toEqual({ theme: "dark", palette: "aster-blue", accent: "#4f7df3" });
    expect(
      read_initial_panel_appearance(
        "?theme=light&palette=<b>&accent=red;color:x",
      ),
    ).toEqual({ theme: "light", palette: "default", accent: "" });
    expect(read_initial_panel_appearance("?theme=<b>")).toBeNull();
    expect(read_initial_panel_appearance("")).toBeNull();
  });

  it("reads host messages only from the parent at the Mail origin", () => {
    const parent = {} as MessageEventSource;
    const stranger = {} as MessageEventSource;
    const data = { source: "aster-mail", type: "theme", theme: "dark" };
    const origin = "https://app.astermail.org";

    expect(read_host_message({ origin, source: parent, data }, parent)).toEqual(
      { type: "theme", theme: "dark", palette: "default", accent: "" },
    );
    expect(
      read_host_message({ origin, source: stranger, data }, parent),
    ).toBeNull();
    expect(
      read_host_message(
        { origin: "https://evil.example", source: parent, data },
        parent,
      ),
    ).toBeNull();
    expect(
      read_host_message({ origin, source: parent, data }, null),
    ).toBeNull();
    expect(
      read_host_message(
        { origin, source: parent, data: { ...data, source: "other" } },
        parent,
      ),
    ).toBeNull();
    expect(
      read_host_message(
        { origin, source: parent, data: { ...data, theme: "neon" } },
        parent,
      ),
    ).toBeNull();
    expect(
      read_host_message({ origin, source: parent, data: "theme" }, parent),
    ).toBeNull();
  });
});

describe("now_divider_index", () => {
  const now = new Date(2026, 10, 2, 12);

  it("skips days with only all-day events", () => {
    expect(now_divider_index([make_event({ is_all_day: true })], now)).toBe(-1);
    expect(now_divider_index([], now)).toBe(-1);
  });

  it("places the divider before the first upcoming timed event", () => {
    const events = [
      make_event({ id: "a", is_all_day: true }),
      make_event({
        id: "b",
        starts_at: new Date(2026, 10, 2, 9).toISOString(),
      }),
      make_event({
        id: "c",
        starts_at: new Date(2026, 10, 2, 14).toISOString(),
      }),
    ];

    expect(now_divider_index(events, now)).toBe(2);
  });

  it("places the divider at the end when every timed event has started", () => {
    const events = [
      make_event({ starts_at: new Date(2026, 10, 2, 9).toISOString() }),
    ];

    expect(now_divider_index(events, now)).toBe(1);
  });
});

describe("mini month helpers", () => {
  it("keys days by local date", () => {
    expect(day_key(new Date(2026, 0, 5, 23, 59))).toBe("2026-0-5");
  });

  it("marks only days that have events", () => {
    const grid = [
      new Date(2026, 10, 1),
      new Date(2026, 10, 2),
      new Date(2026, 10, 3),
    ];
    const keys = days_with_events(grid, [make_event({})]);

    expect([...keys]).toEqual(["2026-10-2"]);
    expect(days_with_events(grid, []).size).toBe(0);
  });
});

describe("panel sources", () => {
  it("treats synthetic events as read only", () => {
    expect(is_read_only_panel_event({ id: `${HOLIDAY_EVENT_PREFIX}x` })).toBe(
      true,
    );
    expect(is_read_only_panel_event({ id: `${BIRTHDAY_EVENT_PREFIX}x` })).toBe(
      true,
    );
    expect(
      is_read_only_panel_event({ id: `${SUBSCRIPTION_EVENT_PREFIX}x` }),
    ).toBe(true);
    expect(is_read_only_panel_event({ id: "abc" })).toBe(false);
  });

  it("detects a decline from the signed-in address", () => {
    const event = make_event({
      attendees: [
        {
          email: "Me@Example.com",
          display_name: null,
          response: "declined",
          is_organizer: false,
        },
      ] as DecryptedCalendarEvent["attendees"],
    });

    expect(is_declined_by(event, "me@example.com")).toBe(true);
    expect(is_declined_by(event, "other@example.com")).toBe(false);
    expect(is_declined_by(event, "")).toBe(false);
  });

  it("builds holiday events only when a region is chosen", () => {
    const start = new Date(2026, 11, 1);
    const end = new Date(2026, 11, 31, 23, 59);

    expect(build_holiday_events("none", start, end)).toEqual([]);

    const holidays = build_holiday_events("us", start, end);

    expect(holidays.length).toBeGreaterThan(0);
    expect(holidays.every((event) => is_read_only_panel_event(event))).toBe(
      true,
    );
    expect(holidays.every((event) => event.is_all_day)).toBe(true);
  });
});
