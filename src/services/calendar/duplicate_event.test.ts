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

import { describe, expect, it } from "vitest";

import {
  build_duplicate_draft,
  resolve_duplicate_calendar_id,
} from "@/services/calendar/duplicate_event";
import {
  SUBSCRIPTION_EVENT_PREFIX,
  subscription_calendar_id,
} from "@/services/calendar/subscriptions";
import { HOLIDAY_CALENDAR_ID } from "@/services/calendar/holidays";

const WORK: DecryptedCalendar = {
  id: "0b6f6a1e-2f0a-4c1f-9a51-7d1f2b3c4d5e",
  name: "Work",
  color: "#2563eb",
  icon: "calendar",
  is_visible: true,
  is_default: false,
};

const PERSONAL: DecryptedCalendar = {
  id: "5a7c9e2b-1d3f-4a6b-8c0d-2e4f6a8b0c1d",
  name: "Personal",
  color: "#16a34a",
  icon: "calendar",
  is_visible: true,
  is_default: true,
};

function make_event(
  overrides: Partial<DecryptedCalendarEvent>,
): DecryptedCalendarEvent {
  return {
    attendees: [],
    availability: "busy",
    calendar_id: WORK.id,
    color: null,
    conference_url: "",
    created_at: "2026-11-20T09:00:00.000Z",
    description: "Room 4",
    ends_at: "2026-11-24T10:00:00.000Z",
    event_kind: "default",
    guests_can_invite: false,
    guests_can_modify: false,
    guests_can_see_guests: false,
    id: "8e1d3c5b-7a9f-4b2d-a6e8-0c2b4d6f8a1e",
    is_all_day: false,
    is_completed: false,
    location: "Main office",
    occurrence_start: null,
    recurrence: null,
    recurrence_exceptions: [],
    recurrence_master_id: null,
    reminder_minutes: null,
    starts_at: "2026-11-24T09:00:00.000Z",
    status: "confirmed",
    tags: [],
    title: "Standup",
    updated_at: "2026-11-20T09:00:00.000Z",
    visibility: "default",
    working_location: null,
    ...overrides,
  };
}

function make_subscription_event(): DecryptedCalendarEvent {
  return make_event({
    id: `${SUBSCRIPTION_EVENT_PREFIX}feed1-match-day`,
    calendar_id: subscription_calendar_id("feed1"),
    color: "#f97316",
    recurrence: {
      frequency: "weekly",
      interval: 1,
      by_weekday: [1],
      count: null,
      until: null,
    },
    recurrence_exceptions: ["2026-12-01T09:00:00.000Z"],
    uid: "remote-123@feeds.example.com",
    recurrence_id: "20261124T090000Z",
    sequence: 4,
  });
}

describe("resolve_duplicate_calendar_id", () => {
  it("keeps an owned event in its own calendar", () => {
    expect(
      resolve_duplicate_calendar_id(make_event({}), [WORK, PERSONAL], ""),
    ).toBe(WORK.id);
  });

  it("sends a subscribed event to the preferred calendar", () => {
    expect(
      resolve_duplicate_calendar_id(
        make_subscription_event(),
        [WORK, PERSONAL],
        WORK.id,
      ),
    ).toBe(WORK.id);
  });

  it("falls back to the default calendar for a subscribed event", () => {
    expect(
      resolve_duplicate_calendar_id(
        make_subscription_event(),
        [WORK, PERSONAL],
        "missing",
      ),
    ).toBe(PERSONAL.id);
  });

  it("never targets a read-only source calendar", () => {
    const holiday = make_event({
      id: "holiday-2026-12-25-christmas",
      calendar_id: HOLIDAY_CALENDAR_ID,
    });

    expect(resolve_duplicate_calendar_id(holiday, [WORK], "")).toBe(WORK.id);
  });

  it("prefers a visible calendar over a hidden default", () => {
    const hidden_default = { ...PERSONAL, is_visible: false };

    expect(
      resolve_duplicate_calendar_id(
        make_subscription_event(),
        [hidden_default, WORK],
        "",
      ),
    ).toBe(WORK.id);
  });

  it("returns null when the user has no calendar to write to", () => {
    expect(
      resolve_duplicate_calendar_id(make_subscription_event(), [], ""),
    ).toBeNull();
  });
});

describe("build_duplicate_draft", () => {
  it("creates an editable copy without the feed identity", () => {
    const draft = build_duplicate_draft(
      make_subscription_event(),
      PERSONAL.id,
      "Copy of Standup",
    );

    expect(draft.calendar_id).toBe(PERSONAL.id);
    expect(draft.title).toBe("Copy of Standup");
    expect(draft.uid).toBeNull();
    expect(draft.recurrence_id).toBeNull();
    expect(draft.sequence).toBe(0);
    expect(draft.recurrence).toBeNull();
    expect(draft.recurrence_exceptions).toEqual([]);
    expect(draft.color).toBeNull();
    expect(draft.trashed_at).toBeNull();
    expect(draft.location).toBe("Main office");
    expect(draft.description).toBe("Room 4");
    expect(draft.starts_at).toBe("2026-11-24T09:00:00.000Z");
    expect(draft.ends_at).toBe("2026-11-24T10:00:00.000Z");
  });

  it("keeps the color of an owned event but gives the copy its own identity", () => {
    const draft = build_duplicate_draft(
      make_event({ color: "#9333ea", uid: "own@aster.calendar", sequence: 2 }),
      WORK.id,
      "Copy of Standup",
    );

    expect(draft.color).toBe("#9333ea");
    expect(draft.uid).toBeNull();
    expect(draft.sequence).toBe(0);
  });
});
