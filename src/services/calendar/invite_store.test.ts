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

import { beforeEach, describe, expect, it, vi } from "vitest";

const update_event = vi.fn();
const cached_events = vi.fn();
const ensure_loaded = vi.fn();
const made_events = new Map<string, DecryptedCalendarEvent>();

vi.mock("@/services/api/calendar", async () => {
  const codec = await vi.importActual<
    typeof import("@/services/calendar/calendar_codec")
  >("@/services/calendar/calendar_codec");

  return {
    event_to_draft: codec.event_to_draft,
    update_event: (...args: unknown[]) => update_event(...args),
  };
});

vi.mock("@/services/calendar/sync_engine", () => ({
  calendar_sync_engine: {
    ensure_loaded: (...args: unknown[]) => ensure_loaded(...args),
    get_events: (...args: unknown[]) => cached_events(...args),
    get_bound_event: (id: string) =>
      (cached_events() as DecryptedCalendarEvent[]).find((event) => event.id === id) ??
      made_events.get(id),
  },
}));

const { set_own_response } = await import("@/services/calendar/invite_store");

const SELF = "me@example.com";
const HOST = { email: "host@example.com", display_name: "Host" };

function make_event(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  const event = build_event(overrides);

  if (!made_events.has(event.id)) {
    made_events.set(event.id, event);
  }

  return event;
}

function build_event(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  return {
    id: "evt-1",
    calendar_id: "cal-1",
    title: "Planning",
    description: "",
    location: "",
    starts_at: "2026-03-04T09:00:00.000Z",
    ends_at: "2026-03-04T09:30:00.000Z",
    is_all_day: false,
    status: "confirmed",
    attendees: [
      { ...HOST, response: "accepted", is_organizer: true },
      { email: SELF, display_name: null, response: "needs_action", is_organizer: false },
    ],
    tags: ["work"],
    reminder_minutes: 15,
    color: "#ff0000",
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
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    uid: "uid-1",
    recurrence_id: null,
    sequence: 1,
    organizer_email: HOST.email,
    ...overrides,
  };
}

beforeEach(() => {
  made_events.clear();
  cached_events.mockReset();
  cached_events.mockReturnValue([]);
  ensure_loaded.mockReset();
  ensure_loaded.mockResolvedValue(undefined);
  update_event.mockReset();
  update_event.mockImplementation(async (_id: string, draft: unknown) => ({
    data: { ...build_event(), ...(draft as object) },
  }));
});

describe("set_own_response", () => {
  it("sets or adds the own response", async () => {
    await set_own_response(make_event(), SELF, "tentative");
    expect(
      update_event.mock.calls[0][1].attendees.find((a: { email: string }) => a.email === SELF)
        ?.response,
    ).toBe("tentative");

    await set_own_response(make_event({ id: "evt-2", attendees: [] }), SELF, "accepted");
    expect(update_event.mock.calls[1][1].attendees).toEqual([
      { email: SELF, display_name: null, response: "accepted", is_organizer: false },
    ]);
  });

  it("refuses to write an event deleted since the card loaded", async () => {
    const snapshot = make_event();

    cached_events.mockReturnValue([
      make_event({ trashed_at: "2026-03-05T00:00:00.000Z" }),
    ]);

    expect(await set_own_response(snapshot, SELF, "accepted")).toBeNull();
    expect(update_event).not.toHaveBeenCalled();
  });

  it("refuses to write a copy the sync engine no longer holds", async () => {
    const gone = build_event({ id: "evt-gone" });

    expect(await set_own_response(gone, SELF, "accepted")).toBeNull();
    expect(update_event).not.toHaveBeenCalled();
  });

  it("answers an expanded occurrence on its series", async () => {
    const series = make_event({
      id: "evt-series",
      recurrence: { frequency: "weekly", interval: 1 } as never,
    });
    const occurrence = build_event({
      ...series,
      id: "evt-series#2026-03-11T09:00:00.000Z",
      recurrence_master_id: "evt-series",
      occurrence_start: "2026-03-11T09:00:00.000Z",
    });

    await set_own_response(occurrence, SELF, "declined");

    expect(update_event.mock.calls[0][0]).toBe("evt-series");
  });
});
