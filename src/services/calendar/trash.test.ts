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
  CalendarEventDraft,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { describe, expect, it } from "vitest";

import {
  TRASH_RETENTION_DAYS,
  expired_trash_ids,
  legacy_entries_to_migrate,
  prune_trash,
  read_legacy_trash,
  trash_entries_from_events,
} from "@/services/calendar/trash";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function make_draft(title = "Standup"): CalendarEventDraft {
  return {
    attendees: [],
    availability: "busy",
    calendar_id: "cal-1",
    color: null,
    conference_url: "",
    description: "",
    ends_at: "2026-07-27T10:00:00Z",
    event_kind: "default",
    guests_can_invite: true,
    guests_can_modify: false,
    guests_can_see_guests: true,
    is_all_day: false,
    is_completed: false,
    location: "",
    recurrence: null,
    recurrence_exceptions: [],
    reminder_minutes: null,
    starts_at: "2026-07-27T09:00:00Z",
    status: "confirmed",
    tags: [],
    title,
    visibility: "default",
    working_location: null,
  };
}

function make_event(
  id: string,
  trashed_at: string | null,
  title = "Standup",
): DecryptedCalendarEvent {
  return {
    ...make_draft(title),
    id,
    recurrence_master_id: null,
    occurrence_start: null,
    trashed_at,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  };
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

describe("calendar trash", () => {
  it("lists trashed events newest first and skips live events", () => {
    const entries = trash_entries_from_events(
      [
        make_event("evt-live", null),
        make_event("evt-1", iso(NOW - 2000), "First"),
        make_event("evt-2", iso(NOW - 1000), "Second"),
      ],
      NOW,
    );

    expect(entries.map((entry) => entry.id)).toEqual(["evt-2", "evt-1"]);
    expect(entries[0].draft.title).toBe("Second");
    expect(entries[0].deleted_at).toBe(iso(NOW - 1000));
  });

  it("keeps every entry inside the retention window", () => {
    const events = Array.from({ length: 120 }, (_, index) =>
      make_event(`evt-${index}`, iso(NOW - index)),
    );

    expect(trash_entries_from_events(events, NOW)).toHaveLength(120);
  });

  it("prunes entries older than the retention window", () => {
    const old = [{ id: "evt-old", draft: make_draft(), deleted_at: iso(NOW) }];
    const later = NOW + TRASH_RETENTION_DAYS * DAY + 1000;

    expect(prune_trash(old, later)).toHaveLength(0);
    expect(prune_trash(old, NOW + 1000)).toHaveLength(1);
  });

  it("reports expired trashed events for purge", () => {
    const ids = expired_trash_ids(
      [
        make_event("evt-fresh", iso(NOW - DAY)),
        make_event("evt-stale", iso(NOW - (TRASH_RETENTION_DAYS + 1) * DAY)),
        make_event("evt-live", null),
      ],
      NOW,
    );

    expect(ids).toEqual(["evt-stale"]);
  });

  it("reads only well formed legacy entries", () => {
    const entries = read_legacy_trash([
      { id: "evt-1", draft: make_draft(), deleted_at: iso(NOW) },
      { id: 7, draft: make_draft(), deleted_at: iso(NOW) },
      { id: "evt-3", draft: null, deleted_at: iso(NOW) },
      "junk",
    ]);

    expect(entries.map((entry) => entry.id)).toEqual(["evt-1"]);
    expect(read_legacy_trash(undefined)).toEqual([]);
  });

  it("skips legacy entries already present as trashed rows", () => {
    const deleted_at = iso(NOW - DAY);
    const entries = legacy_entries_to_migrate(
      [
        { id: "evt-1", draft: make_draft("Same"), deleted_at },
        { id: "evt-2", draft: make_draft("Other"), deleted_at },
        {
          id: "evt-3",
          draft: make_draft("Expired"),
          deleted_at: iso(NOW - (TRASH_RETENTION_DAYS + 2) * DAY),
        },
      ],
      [make_event("srv-1", deleted_at, "Same")],
      NOW,
    );

    expect(entries.map((entry) => entry.id)).toEqual(["evt-2"]);
  });
});
