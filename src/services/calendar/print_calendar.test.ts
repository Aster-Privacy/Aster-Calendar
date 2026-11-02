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
import type { PrintCalendarOptions } from "@/services/calendar/print_calendar";
import type { DecryptedCalendarEvent } from "@/types/calendar";

import { describe, expect, it } from "vitest";

import {
  build_print_html,
  build_print_markup,
  escape_html,
  group_events_by_day,
} from "@/services/calendar/print_calendar";

function make_event(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  return {
    id: "event_1",
    calendar_id: "calendar_1",
    title: "Standup",
    description: "",
    location: "",
    starts_at: new Date(2026, 0, 5, 9, 0, 0, 0).toISOString(),
    ends_at: new Date(2026, 0, 5, 9, 30, 0, 0).toISOString(),
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
    created_at: new Date(2026, 0, 1).toISOString(),
    updated_at: new Date(2026, 0, 1).toISOString(),
    ...overrides,
  };
}

function make_options(
  overrides: Partial<PrintCalendarOptions> = {},
): PrintCalendarOptions {
  const events = overrides.events ?? [make_event()];

  return {
    title: "January 2026",
    subtitle: "5 January 2026 - 6 January 2026",
    days: [new Date(2026, 0, 5), new Date(2026, 0, 6)],
    events,
    color_by_event_id: new Map(events.map((event) => [event.id, "#ff0000"])),
    layout: "grid",
    orientation: "landscape",
    show_declined: false,
    language: "en",
    time_format: "24h",
    labels: {
      all_day: "All day",
      no_events: "Nothing scheduled",
      printed_on: "Printed on 5 January 2026",
    },
    ...overrides,
  };
}

describe("escape_html", () => {
  it("escapes markup characters", () => {
    expect(escape_html('<img src="x" onerror=alert(1)>&')).toBe(
      "&lt;img src=&quot;x&quot; onerror=alert(1)&gt;&amp;",
    );
  });
});

describe("group_events_by_day", () => {
  it("places an event on the day it occurs", () => {
    const grouped = group_events_by_day(
      [new Date(2026, 0, 5), new Date(2026, 0, 6)],
      [make_event()],
      false,
    );

    expect(grouped.get("2026_0_5")).toHaveLength(1);
    expect(grouped.get("2026_0_6")).toHaveLength(0);
  });

  it("spans multi-day events across every covered day", () => {
    const grouped = group_events_by_day(
      [new Date(2026, 0, 5), new Date(2026, 0, 6)],
      [
        make_event({
          starts_at: new Date(2026, 0, 5, 22, 0).toISOString(),
          ends_at: new Date(2026, 0, 6, 2, 0).toISOString(),
        }),
      ],
      false,
    );

    expect(grouped.get("2026_0_5")).toHaveLength(1);
    expect(grouped.get("2026_0_6")).toHaveLength(1);
  });

  it("hides declined events unless requested", () => {
    const declined = make_event({
      attendees: [
        {
          email: "guest@astermail.org",
          display_name: null,
          response: "declined",
          is_organizer: false,
        },
      ],
    });

    expect(
      group_events_by_day([new Date(2026, 0, 5)], [declined], false).get(
        "2026_0_5",
      ),
    ).toHaveLength(0);
    expect(
      group_events_by_day([new Date(2026, 0, 5)], [declined], true).get(
        "2026_0_5",
      ),
    ).toHaveLength(1);
  });

  it("sorts all-day events before timed events", () => {
    const grouped = group_events_by_day(
      [new Date(2026, 0, 5)],
      [
        make_event({ id: "timed" }),
        make_event({
          id: "all_day",
          is_all_day: true,
          starts_at: new Date(2026, 0, 5, 0, 0).toISOString(),
          ends_at: new Date(2026, 0, 5, 23, 59).toISOString(),
        }),
      ],
      false,
    );

    expect(grouped.get("2026_0_5")?.map((event) => event.id)).toEqual([
      "all_day",
      "timed",
    ]);
  });
});

describe("build_print_html", () => {
  it("renders a grid table with the event title and time", () => {
    const html = build_print_html(make_options());

    expect(html).toMatch(/<table class="grid( wrap)?">/);
    expect(html).toContain("Standup");
    expect(html).toContain("09:00");
    expect(html).toContain("January 2026");
  });

  it("renders an agenda layout when requested", () => {
    const html = build_print_html(make_options({ layout: "agenda" }));

    expect(html).toContain("agenda_day");
    expect(html).not.toMatch(/<table class="grid/);
  });

  it("shows the empty label when an agenda has no events", () => {
    const html = build_print_html(
      make_options({ layout: "agenda", events: [] }),
    );

    expect(html).toContain("Nothing scheduled");
  });

  it("keeps the calendar color on every event", () => {
    const html = build_print_html(make_options());

    expect(html).toContain("background:#ff0000");
  });

  it("applies the requested orientation to the page rule and preview size", () => {
    const portrait = build_print_html(
      make_options({ orientation: "portrait" }),
    );
    const landscape = build_print_html(
      make_options({ orientation: "landscape" }),
    );

    expect(portrait).toContain("size: portrait");
    expect(portrait).toContain("width: 794px");
    expect(landscape).toContain("size: landscape");
    expect(landscape).toContain("width: 1123px");
  });

  it("wraps the page in the print root so the print stylesheet can target it", () => {
    const html = build_print_html(make_options());

    expect(html).toContain('<div class="calendar_print_root">');
  });
});

describe("build_print_markup", () => {
  it("returns only the page body without a document shell", () => {
    const markup = build_print_markup(make_options());

    expect(markup).not.toContain("<html");
    expect(markup).not.toContain("<style");
    expect(markup).toContain("<h1>January 2026</h1>");
    expect(markup).toContain("Printed on 5 January 2026");
  });

  it("escapes event titles and locations", () => {
    const html = build_print_html(
      make_options({
        events: [
          make_event({
            title: "<script>alert(1)</script>",
            location: 'Room "A"',
          }),
        ],
      }),
    );

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Room &quot;A&quot;");
  });

  it("uses 12 hour times when the preference asks for it", () => {
    const html = build_print_html(make_options({ time_format: "12h" }));

    expect(html).toMatch(/9:00\s?(AM|am)/);
  });

  it("labels all day events instead of printing a time", () => {
    const html = build_print_html(
      make_options({
        events: [
          make_event({
            is_all_day: true,
            starts_at: new Date(2026, 0, 5, 0, 0).toISOString(),
            ends_at: new Date(2026, 0, 5, 23, 59).toISOString(),
          }),
        ],
      }),
    );

    expect(html).toContain("All day");
  });
});
