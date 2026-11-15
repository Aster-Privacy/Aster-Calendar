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
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  get_panel_visible,
  read_host_message,
  set_panel_visible,
  subscribe_panel_visible,
} from "@/pages/mail_panel/mail_panel_bridge";
import {
  bucket_events_by_day,
  day_key,
  events_on,
} from "@/pages/mail_panel/mail_panel_days";
import {
  build_snapshot_key,
  events_in_window,
} from "@/pages/mail_panel/mail_panel_snapshot";
import {
  add_days,
  build_month_grid,
  events_for_day,
} from "@/components/calendar/calendar_utils";

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
    updated_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  } as DecryptedCalendarEvent;
}

function make_calendar(
  overrides: Partial<DecryptedCalendar> = {},
): DecryptedCalendar {
  return {
    id: "cal",
    name: "Personal",
    color: "#3b82f6",
    icon: "calendar",
    is_visible: true,
    is_default: true,
    ...overrides,
  } as DecryptedCalendar;
}

describe("panel visibility", () => {
  afterEach(() => set_panel_visible(true));

  it("reads visibility messages from the host", () => {
    const parent = {} as MessageEventSource;
    const origin = "https://app.astermail.org";
    const data = { source: "aster-mail", type: "visibility", visible: false };

    expect(read_host_message({ origin, source: parent, data }, parent)).toEqual(
      { type: "visibility", visible: false },
    );
    expect(
      read_host_message(
        { origin, source: parent, data: { ...data, visible: "no" } },
        parent,
      ),
    ).toBeNull();
    expect(
      read_host_message(
        { origin: "https://evil.example", source: parent, data },
        parent,
      ),
    ).toBeNull();
  });

  it("notifies only when the visible flag changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe_panel_visible(listener);

    expect(get_panel_visible()).toBe(true);
    set_panel_visible(true);
    expect(listener).not.toHaveBeenCalled();
    set_panel_visible(false);
    expect(get_panel_visible()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    set_panel_visible(false);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    set_panel_visible(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("snapshot key", () => {
  const stamp = (event: DecryptedCalendarEvent) => `nonce_${event.id}:1`;

  it("stays the same for equal content", () => {
    const first = build_snapshot_key(
      0,
      10,
      [make_event({ id: "a" }), make_event({ id: "b" })],
      [make_event({ id: "a" })],
      [make_calendar()],
      stamp,
    );
    const second = build_snapshot_key(
      0,
      10,
      [make_event({ id: "a" }), make_event({ id: "b" })],
      [make_event({ id: "a" })],
      [make_calendar()],
      stamp,
    );

    expect(second).toBe(first);
  });

  it("changes when the range, events, rows or calendars change", () => {
    const events = [make_event({ id: "a" })];
    const calendars = [make_calendar()];
    const base = build_snapshot_key(0, 10, events, events, calendars, stamp);

    expect(build_snapshot_key(1, 10, events, events, calendars, stamp)).not.toBe(
      base,
    );
    expect(
      build_snapshot_key(
        0,
        10,
        [make_event({ id: "a", updated_at: "2026-11-02T00:00:00.000Z" })],
        events,
        calendars,
        stamp,
      ),
    ).not.toBe(base);
    expect(
      build_snapshot_key(0, 10, events, events, calendars, () => "nonce_b:2"),
    ).not.toBe(base);
    expect(build_snapshot_key(0, 10, events, [], calendars, stamp)).not.toBe(
      base,
    );
    expect(
      build_snapshot_key(
        0,
        10,
        events,
        events,
        [make_calendar({ is_visible: false })],
        stamp,
      ),
    ).not.toBe(base);
    expect(
      build_snapshot_key(
        0,
        10,
        events,
        events,
        [make_calendar({ color: "#000000" })],
        stamp,
      ),
    ).not.toBe(base);
  });

  it("keeps the events that overlap a window", () => {
    const inside = make_event({ id: "inside" });
    const before = make_event({
      id: "before",
      starts_at: new Date(2026, 9, 1, 9).toISOString(),
      ends_at: new Date(2026, 9, 1, 10).toISOString(),
    });
    const start_ms = new Date(2026, 10, 1).getTime();
    const end_ms = new Date(2026, 10, 10).getTime();

    expect(events_in_window([inside, before], start_ms, end_ms)).toEqual([
      inside,
    ]);
  });
});

describe("day buckets", () => {
  const month = new Date(2026, 10, 1);
  const grid = build_month_grid(month, 1);
  const agenda = Array.from({ length: 7 }, (_, index) =>
    add_days(new Date(2026, 10, 27), index),
  );
  const days = grid.concat(agenda);
  const events = [
    make_event({ id: "plain" }),
    make_event({
      id: "early",
      starts_at: new Date(2026, 10, 2, 7).toISOString(),
      ends_at: new Date(2026, 10, 2, 8).toISOString(),
    }),
    make_event({
      id: "span",
      starts_at: new Date(2026, 10, 3, 22).toISOString(),
      ends_at: new Date(2026, 10, 6, 2).toISOString(),
    }),
    make_event({
      id: "all_day",
      is_all_day: true,
      starts_at: new Date(2026, 10, 2).toISOString(),
      ends_at: new Date(2026, 10, 3).toISOString(),
    }),
    make_event({
      id: "zero",
      starts_at: new Date(2026, 10, 9, 12).toISOString(),
      ends_at: new Date(2026, 10, 9, 12).toISOString(),
    }),
    make_event({
      id: "midnight_end",
      starts_at: new Date(2026, 10, 10, 23).toISOString(),
      ends_at: new Date(2026, 10, 11).toISOString(),
    }),
    make_event({
      id: "late_month",
      starts_at: new Date(2026, 11, 2, 9).toISOString(),
      ends_at: new Date(2026, 11, 2, 10).toISOString(),
    }),
    make_event({
      id: "outside",
      starts_at: new Date(2027, 2, 1, 9).toISOString(),
      ends_at: new Date(2027, 2, 1, 10).toISOString(),
    }),
    make_event({ id: "broken", starts_at: "nope" }),
  ];

  it("matches events_for_day for every day", () => {
    const buckets = bucket_events_by_day(events, days);

    for (const day of days) {
      expect(events_on(buckets, day).map((event) => event.id)).toEqual(
        events_for_day(events, day).map((event) => event.id),
      );
    }
  });

  it("keys buckets by local date and skips days it was not given", () => {
    const buckets = bucket_events_by_day(events, days);

    expect(buckets.get(day_key(new Date(2026, 10, 2)))?.length).toBe(3);
    expect(events_on(buckets, new Date(2027, 2, 1))).toEqual([]);
    expect(bucket_events_by_day(events, []).size).toBe(0);
  });
});
