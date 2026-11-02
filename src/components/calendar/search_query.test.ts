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
  build_search_index,
  event_result_key,
  group_search_results,
  highlight_segments,
  highlight_terms,
  match_event,
  match_indexed_event,
  parse_search_query,
} from "@/components/calendar/search_query";

function make_event(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  return {
    id: "evt-1",
    calendar_id: "cal-1",
    title: "Design review",
    description: "Quarterly planning",
    location: "Room 4",
    starts_at: "2026-03-04T09:00:00.000Z",
    ends_at: "2026-03-04T10:00:00.000Z",
    is_all_day: false,
    status: "confirmed",
    attendees: [],
    tags: [],
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
    reminder_minutes: null,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function matches(query: string, event: DecryptedCalendarEvent, name = "Work") {
  return match_event(event, parse_search_query(query), name);
}

describe("parse_search_query", () => {
  it("treats blank input as empty", () => {
    expect(parse_search_query("   ").is_empty).toBe(true);
  });

  it("keeps quoted phrases as one term", () => {
    expect(parse_search_query('"design review"').terms).toEqual([
      "design review",
    ]);
  });

  it("collects operators and free text", () => {
    const parsed = parse_search_query(
      "budget -draft guests:ana location:room calendar:work after:2026-03-01 before:2026-03-31 is:recurring",
    );

    expect(parsed.terms).toEqual(["budget"]);
    expect(parsed.excluded).toEqual(["draft"]);
    expect(parsed.guests).toEqual(["ana"]);
    expect(parsed.locations).toEqual(["room"]);
    expect(parsed.calendars).toEqual(["work"]);
    expect(parsed.only_recurring).toBe(true);
    expect(parsed.after).not.toBeNull();
    expect(parsed.before).not.toBeNull();
  });
});

describe("match_event", () => {
  it("matches free text against title, location and description", () => {
    expect(matches("review", make_event())).toBe(true);
    expect(matches("room 4", make_event())).toBe(true);
    expect(matches("quarterly", make_event())).toBe(true);
    expect(matches("missing", make_event())).toBe(false);
  });

  it("requires every term to match", () => {
    expect(matches("design planning", make_event())).toBe(true);
    expect(matches("design missing", make_event())).toBe(false);
  });

  it("excludes events containing a negated term", () => {
    expect(matches("design -quarterly", make_event())).toBe(false);
    expect(matches("design -budget", make_event())).toBe(true);
  });

  it("filters by guests", () => {
    const with_guest = make_event({
      attendees: [
        {
          email: "ana@example.com",
          display_name: "Ana",
          response: "accepted",
          is_organizer: false,
        },
      ],
    });

    expect(matches("guests:", make_event())).toBe(false);
    expect(matches("guests:", with_guest)).toBe(true);
    expect(matches("guests:ana", with_guest)).toBe(true);
    expect(matches("guests:bob", with_guest)).toBe(false);
  });

  it("filters by location presence and value", () => {
    expect(matches("location:", make_event({ location: "" }))).toBe(false);
    expect(matches("location:room", make_event())).toBe(true);
    expect(matches("location:garden", make_event())).toBe(false);
  });

  it("filters by calendar name", () => {
    expect(matches("calendar:work", make_event())).toBe(true);
    expect(matches("calendar:personal", make_event())).toBe(false);
  });

  it("filters by date range", () => {
    expect(matches("after:2026-03-01", make_event())).toBe(true);
    expect(matches("after:2026-04-01", make_event())).toBe(false);
    expect(matches("before:2026-03-31", make_event())).toBe(true);
    expect(matches("before:2026-01-01", make_event())).toBe(false);
  });

  it("filters recurring and all-day events", () => {
    expect(matches("is:recurring", make_event())).toBe(false);
    expect(matches("is:allday", make_event())).toBe(false);
    expect(matches("is:allday", make_event({ is_all_day: true }))).toBe(true);
  });
});

describe("build_search_index", () => {
  it("matches the same events as match_event", () => {
    const events = [
      make_event(),
      make_event({ id: "evt-2", title: "Lunch", location: "Cafe" }),
      make_event({ id: "evt-3", calendar_id: "cal-2", title: "Gym" }),
    ];
    const names = new Map([
      ["cal-1", "Work"],
      ["cal-2", "Personal"],
    ]);
    const index = build_search_index(events, (id) => names.get(id) ?? "");

    for (const query of [
      "review",
      "cafe",
      "calendar:personal",
      "-gym",
      "room",
    ]) {
      const parsed = parse_search_query(query);

      expect(
        index
          .filter((entry) => match_indexed_event(entry, parsed))
          .map((entry) => entry.key),
      ).toEqual(
        events
          .filter((event) =>
            match_event(event, parsed, names.get(event.calendar_id) ?? ""),
          )
          .map(event_result_key),
      );
    }
  });

  it("resolves each calendar name once", () => {
    let calls = 0;

    build_search_index([make_event(), make_event({ id: "evt-2" })], () => {
      calls += 1;

      return "Work";
    });

    expect(calls).toBe(1);
  });

  it("uses a stable key per occurrence", () => {
    const entry = build_search_index([make_event()], () => "Work")[0];

    expect(entry.key).toBe("evt-1|2026-03-04T09:00:00.000Z");
    expect(entry.haystack).toContain("design review");
  });
});

describe("highlight_segments", () => {
  it("returns the text unchanged without matches", () => {
    expect(highlight_segments("Design review", ["zzz"])).toEqual([
      { is_match: false, text: "Design review" },
    ]);
  });

  it("marks case-insensitive matches and keeps original casing", () => {
    expect(highlight_segments("Design Review", ["review"])).toEqual([
      { is_match: false, text: "Design " },
      { is_match: true, text: "Review" },
    ]);
  });

  it("merges overlapping and repeated matches", () => {
    expect(highlight_segments("aaa bab", ["aa", "a"])).toEqual([
      { is_match: true, text: "aaa" },
      { is_match: false, text: " b" },
      { is_match: true, text: "a" },
      { is_match: false, text: "b" },
    ]);
  });

  it("keeps markup characters as plain text", () => {
    const segments = highlight_segments("<b>tag</b>", ["tag"]);

    expect(segments.map((segment) => segment.text).join("")).toBe("<b>tag</b>");
    expect(segments[1]).toEqual({ is_match: true, text: "tag" });
  });

  it("collects terms, locations and guests for highlighting", () => {
    expect(
      highlight_terms(
        parse_search_query("budget location:room guests:ana -draft"),
      ),
    ).toEqual(["budget", "room", "ana"]);
  });
});

describe("group_search_results", () => {
  const now = Date.parse("2026-03-10T12:00:00.000Z");

  it("puts upcoming days first in ascending order, then past days descending", () => {
    const groups = group_search_results(
      [
        make_event({
          id: "past-old",
          starts_at: "2026-03-01T09:00:00.000Z",
          ends_at: "2026-03-01T10:00:00.000Z",
        }),
        make_event({
          id: "later",
          starts_at: "2026-03-20T09:00:00.000Z",
          ends_at: "2026-03-20T10:00:00.000Z",
        }),
        make_event({
          id: "past-new",
          starts_at: "2026-03-05T09:00:00.000Z",
          ends_at: "2026-03-05T10:00:00.000Z",
        }),
        make_event({
          id: "soon",
          starts_at: "2026-03-12T09:00:00.000Z",
          ends_at: "2026-03-12T10:00:00.000Z",
        }),
      ],
      now,
      25,
    );

    expect(groups.map((group) => group.events[0].id)).toEqual([
      "soon",
      "later",
      "past-new",
      "past-old",
    ]);
    expect(groups.map((group) => group.is_past)).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });

  it("groups same-day events and keeps a stable order", () => {
    const first = make_event({
      id: "b",
      starts_at: "2026-03-12T09:00:00.000Z",
      ends_at: "2026-03-12T10:00:00.000Z",
    });
    const second = make_event({
      id: "a",
      starts_at: "2026-03-12T09:00:00.000Z",
      ends_at: "2026-03-12T10:00:00.000Z",
    });
    const forward = group_search_results([first, second], now, 25);
    const reverse = group_search_results([second, first], now, 25);

    expect(forward).toHaveLength(1);
    expect(forward[0].events.map((event) => event.id)).toEqual(["a", "b"]);
    expect(reverse[0].events.map((event) => event.id)).toEqual(["a", "b"]);
    expect(forward[0].key).toBe(reverse[0].key);
  });

  it("applies the result limit before grouping", () => {
    const events = Array.from({ length: 5 }, (_, index) =>
      make_event({
        id: `evt-${index}`,
        starts_at: `2026-03-1${index + 1}T09:00:00.000Z`,
        ends_at: `2026-03-1${index + 1}T10:00:00.000Z`,
      }),
    );
    const groups = group_search_results(events, now, 3);

    expect(groups.flatMap((group) => group.events)).toHaveLength(3);
  });
});
