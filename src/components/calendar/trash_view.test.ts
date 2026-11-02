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
import type { CalendarTrashEntry } from "@/services/calendar/trash";
import type { CalendarEventDraft } from "@/types/calendar";

import { describe, expect, it } from "vitest";

import {
  TRASH_ALL_CALENDARS,
  build_trash_sections,
  filter_trash_entries,
  group_days_left,
  group_trash_entries,
  normalize_trash_text,
  prune_trash_selection,
  sort_trash_entries,
  trash_days_left,
  trash_expires_soon,
  trash_group_is_series,
  trash_group_span,
} from "@/components/calendar/trash_view";

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 26, 15, 0, 0).getTime();
const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

function make_entry(
  id: string,
  overrides: Partial<CalendarEventDraft> & { deleted_at?: number } = {},
): CalendarTrashEntry {
  const { deleted_at = NOW - 60_000, ...draft } = overrides;

  return {
    id,
    deleted_at: new Date(deleted_at).toISOString(),
    draft: {
      title: "Standup",
      description: "",
      location: "",
      calendar_id: "cal-work",
      starts_at: "2026-10-28T09:00:00Z",
      ends_at: "2026-10-28T10:00:00Z",
      is_all_day: false,
      ...draft,
    } as CalendarEventDraft,
  };
}

const names: Record<string, string> = {
  "cal-work": "Work",
  "cal-home": "Personal",
};
const calendar_name = (id: string) => names[id] ?? "";

describe("normalize_trash_text", () => {
  it("folds case, accents, and whitespace", () => {
    expect(normalize_trash_text("  Café   RÉVIEW ")).toBe("cafe review");
  });
});

describe("filter_trash_entries", () => {
  const entries = [
    make_entry("a", { title: "Design review", location: "Room 4" }),
    make_entry("b", { title: "Dentist", calendar_id: "cal-home" }),
    make_entry("c", { title: "Café sync", location: "Lisbon office" }),
  ];

  it("returns everything for an empty query and all calendars", () => {
    expect(
      filter_trash_entries(
        entries,
        { query: "  ", calendar_id: TRASH_ALL_CALENDARS },
        calendar_name,
      ),
    ).toHaveLength(3);
  });

  it("matches title, location, and calendar name with every token", () => {
    const run = (query: string) =>
      filter_trash_entries(
        entries,
        { query, calendar_id: TRASH_ALL_CALENDARS },
        calendar_name,
      ).map((entry) => entry.id);

    expect(run("design")).toEqual(["a"]);
    expect(run("room 4")).toEqual(["a"]);
    expect(run("personal")).toEqual(["b"]);
    expect(run("cafe lisbon")).toEqual(["c"]);
    expect(run("design lisbon")).toEqual([]);
  });

  it("scopes to one calendar", () => {
    expect(
      filter_trash_entries(
        entries,
        { query: "", calendar_id: "cal-home" },
        calendar_name,
      ).map((entry) => entry.id),
    ).toEqual(["b"]);
  });
});

describe("sort_trash_entries", () => {
  const entries = [
    make_entry("old", {
      title: "beta",
      deleted_at: NOW - 3 * DAY,
      starts_at: "2026-12-01T09:00:00Z",
    }),
    make_entry("new", {
      title: "Alpha",
      deleted_at: NOW - DAY,
      starts_at: "2026-10-01T09:00:00Z",
    }),
    make_entry("mid", {
      title: "gamma",
      deleted_at: NOW - 2 * DAY,
      starts_at: "2026-11-01T09:00:00Z",
    }),
  ];
  const ids = (sort: "deleted" | "event_date" | "title") =>
    sort_trash_entries(entries, sort, collator).map((entry) => entry.id);

  it("sorts by most recently deleted", () => {
    expect(ids("deleted")).toEqual(["new", "mid", "old"]);
  });

  it("sorts by latest event date", () => {
    expect(ids("event_date")).toEqual(["old", "mid", "new"]);
  });

  it("sorts by title without case sensitivity", () => {
    expect(ids("title")).toEqual(["new", "old", "mid"]);
  });

  it("does not mutate the input", () => {
    sort_trash_entries(entries, "title", collator);
    expect(entries.map((entry) => entry.id)).toEqual(["old", "new", "mid"]);
  });
});

describe("group_trash_entries", () => {
  it("collapses repeats of one event in one calendar and keeps order", () => {
    const groups = group_trash_entries([
      make_entry("1", { title: "Design review" }),
      make_entry("2", { title: "Lunch" }),
      make_entry("3", { title: "design  REVIEW" }),
      make_entry("4", { title: "Design review", calendar_id: "cal-home" }),
    ]);

    expect(
      groups.map((group) => group.entries.map((entry) => entry.id)),
    ).toEqual([["1", "3"], ["2"], ["4"]]);
  });
});

describe("build_trash_sections", () => {
  it("buckets by deletion day with today and yesterday first", () => {
    const sections = build_trash_sections(
      [
        make_entry("today", { title: "A", deleted_at: NOW - 60_000 }),
        make_entry("yesterday", { title: "B", deleted_at: NOW - DAY }),
        make_entry("older", { title: "C", deleted_at: NOW - 5 * DAY }),
      ],
      "deleted",
      collator,
      NOW,
    );

    expect(sections.map((section) => section.kind)).toEqual([
      "today",
      "yesterday",
      "day",
    ]);
  });

  it("places a repeated event once, under its most recent deletion", () => {
    const sections = build_trash_sections(
      [
        make_entry("r1", { title: "Design review", deleted_at: NOW - 5 * DAY }),
        make_entry("r2", { title: "Design review", deleted_at: NOW - 60_000 }),
        make_entry("x", { title: "Other", deleted_at: NOW - 5 * DAY }),
      ],
      "deleted",
      collator,
      NOW,
    );

    expect(sections[0].kind).toBe("today");
    expect(sections[0].groups[0].entries.map((entry) => entry.id)).toEqual([
      "r2",
      "r1",
    ]);
    expect(sections[1].groups.map((group) => group.entries[0].id)).toEqual([
      "x",
    ]);
  });

  it("buckets by event month when sorting by event date", () => {
    const sections = build_trash_sections(
      [
        make_entry("nov", { title: "A", starts_at: "2026-11-10T12:00:00Z" }),
        make_entry("oct", { title: "B", starts_at: "2026-10-10T12:00:00Z" }),
      ],
      "event_date",
      collator,
      NOW,
    );

    expect(sections.map((section) => section.kind)).toEqual(["month", "month"]);
    expect(sections[0].date?.getMonth()).toBe(10);
  });

  it("uses one unlabeled section when sorting by title", () => {
    const sections = build_trash_sections(
      [make_entry("a", { title: "A" }), make_entry("b", { title: "B" })],
      "title",
      collator,
      NOW,
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].kind).toBe("all");
  });
});

describe("trash_days_left", () => {
  it("counts whole days until removal, rounding up", () => {
    expect(trash_days_left(new Date(NOW).toISOString(), NOW)).toBe(30);
    expect(trash_days_left(new Date(NOW - 18 * DAY).toISOString(), NOW)).toBe(
      12,
    );
    expect(trash_days_left(new Date(NOW - 29.5 * DAY).toISOString(), NOW)).toBe(
      1,
    );
    expect(trash_days_left(new Date(NOW - 31 * DAY).toISOString(), NOW)).toBe(
      0,
    );
    expect(trash_days_left("not a date", NOW)).toBe(0);
  });

  it("reports the soonest removal in a group", () => {
    expect(
      group_days_left(
        {
          key: "k",
          entries: [
            make_entry("a", { deleted_at: NOW - 2 * DAY }),
            make_entry("b", { deleted_at: NOW - 20 * DAY }),
          ],
        },
        NOW,
      ),
    ).toBe(10);
  });
});

describe("trash_expires_soon", () => {
  it("flags entries with three days or fewer left", () => {
    expect(trash_expires_soon(30)).toBe(false);
    expect(trash_expires_soon(4)).toBe(false);
    expect(trash_expires_soon(3)).toBe(true);
    expect(trash_expires_soon(0)).toBe(true);
  });
});

describe("trash_group_is_series", () => {
  it("treats a lone entry as not a series", () => {
    expect(
      trash_group_is_series({ key: "k", entries: [make_entry("a")] }),
    ).toBe(false);
  });

  it("recognizes repeating events and shared ids", () => {
    expect(
      trash_group_is_series({
        key: "k",
        entries: [
          make_entry("a", {
            recurrence: {
              frequency: "weekly",
            } as CalendarEventDraft["recurrence"],
          }),
          make_entry("b"),
        ],
      }),
    ).toBe(true);
    expect(
      trash_group_is_series({
        key: "k",
        entries: [
          make_entry("a", { uid: "u1" }),
          make_entry("b", { uid: "u1" }),
        ],
      }),
    ).toBe(true);
  });

  it("treats unrelated events that share a name as not a series", () => {
    expect(
      trash_group_is_series({
        key: "k",
        entries: [
          make_entry("a", { uid: "u1" }),
          make_entry("b", { uid: "u2" }),
        ],
      }),
    ).toBe(false);
  });
});

describe("trash_group_span", () => {
  it("returns the earliest and latest start", () => {
    const span = trash_group_span({
      key: "k",
      entries: [
        make_entry("a", { starts_at: "2026-11-10T12:00:00Z" }),
        make_entry("b", { starts_at: "not a date" }),
        make_entry("c", { starts_at: "2026-10-01T12:00:00Z" }),
      ],
    });

    expect(span.first?.toISOString()).toBe("2026-10-01T12:00:00.000Z");
    expect(span.last?.toISOString()).toBe("2026-11-10T12:00:00.000Z");
  });

  it("returns nulls when no start is valid", () => {
    expect(
      trash_group_span({
        key: "k",
        entries: [make_entry("a", { starts_at: "bad" })],
      }),
    ).toEqual({ first: null, last: null });
  });
});

describe("prune_trash_selection", () => {
  it("drops ids that are no longer visible", () => {
    expect([
      ...prune_trash_selection(
        new Set(["a", "b", "c"]),
        new Set(["b", "c", "d"]),
      ),
    ]).toEqual(["b", "c"]);
  });
});
