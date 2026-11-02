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
import type { ImportedIcsEvent } from "@/services/calendar/ics_file";

import { describe, expect, it } from "vitest";

import {
  collect_dropped_time_zones,
  existing_import_keys,
  import_entry_key,
  import_span,
  split_import_entries,
} from "@/services/calendar/ics_import";

function entry(
  uid: string | null,
  recurrence_id: string | null = null,
  starts_at = "2026-10-12T09:00:00.000Z",
): ImportedIcsEvent {
  return {
    title: uid ?? "untitled",
    description: "",
    location: "",
    starts_at,
    ends_at: "2026-10-12T10:00:00.000Z",
    is_all_day: false,
    status: "confirmed",
    attendees: [],
    recurrence: null,
    recurrence_exceptions: [],
    availability: "busy",
    visibility: "default",
    conference_url: "",
    reminder_minutes: null,
    uid,
    recurrence_id,
  };
}

describe("import preview counting", () => {
  it("keys entries by uid and recurrence id", () => {
    expect(import_entry_key(entry("a"))).toBe("a|");
    expect(import_entry_key(entry("a", "2026-10-19T09:00:00.000Z"))).toBe(
      "a|2026-10-19T09:00:00.000Z",
    );
    expect(import_entry_key(entry(null))).toBeNull();
    expect(import_entry_key(entry("  "))).toBeNull();
  });

  it("counts entries that already exist and keeps the rest", () => {
    const existing = existing_import_keys([
      { uid: "a", recurrence_id: null },
      { uid: "b", recurrence_id: "2026-10-19T09:00:00.000Z" },
      { uid: null },
    ]);
    const split = split_import_entries(
      [
        entry("a"),
        entry("b"),
        entry("b", "2026-10-19T09:00:00.000Z"),
        entry("c"),
        entry(null),
      ],
      existing,
    );

    expect(split.existing_count).toBe(2);
    expect(split.new_entries.map((item) => item.uid)).toEqual(["b", "c", null]);
  });

  it("drops duplicate uids inside the same file but keeps uid-less entries", () => {
    const split = split_import_entries(
      [entry("a"), entry("a"), entry(null), entry(null)],
      new Set(),
    );

    expect(split.existing_count).toBe(0);
    expect(split.new_entries).toHaveLength(3);
  });

  it("spans the earliest start to the latest end", () => {
    const span = import_span([
      entry("a", null, "2026-10-12T09:00:00.000Z"),
      entry("b", null, "2026-09-01T09:00:00.000Z"),
    ]);

    expect(span?.start.toISOString()).toBe("2026-09-01T09:00:00.000Z");
    expect(span?.end.toISOString()).toBe("2026-10-12T10:00:00.000Z");
    expect(import_span([])).toBeNull();
  });

  it("collects each dropped time zone once", () => {
    expect(
      collect_dropped_time_zones([
        { ...entry("a"), dropped_time_zones: ["Mars/Base", "Moon/Base"] },
        { ...entry("b"), dropped_time_zones: ["Mars/Base"] },
        entry("c"),
      ]),
    ).toEqual(["Mars/Base", "Moon/Base"]);
    expect(collect_dropped_time_zones([entry("a")])).toEqual([]);
  });
});
