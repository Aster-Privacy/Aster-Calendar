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

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  build_reminder_targets,
  claim_reminder,
  clear_fired_reminders,
  has_fired,
  mark_fired,
} from "@/services/calendar/reminder_scheduler";

const NOW = new Date("2026-03-04T09:00:00.000Z").getTime();

function make_event(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  return {
    id: "evt-1",
    calendar_id: "cal-1",
    title: "Standup",
    description: "",
    location: "",
    starts_at: new Date(NOW + 60 * 60 * 1000).toISOString(),
    ends_at: new Date(NOW + 90 * 60 * 1000).toISOString(),
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

const BASE = {
  default_reminder_minutes: 30,
  now: NOW,
  only_accepted: false,
};

describe("build_reminder_targets", () => {
  it("schedules a reminder ahead of the event start", () => {
    const targets = build_reminder_targets([make_event()], BASE);

    expect(targets).toHaveLength(1);
    expect(targets[0].fire_at).toBe(NOW + 30 * 60 * 1000);
    expect(targets[0].event_id).toBe("evt-1");
  });

  it("prefers the event reminder over the default", () => {
    const targets = build_reminder_targets(
      [make_event({ reminder_minutes: 10 })],
      BASE,
    );

    expect(targets[0].fire_at).toBe(NOW + 50 * 60 * 1000);
  });

  it("uses the all-day default for all-day events", () => {
    const all_day = make_event({
      is_all_day: true,
      starts_at: new Date(NOW + 8 * 60 * 60 * 1000).toISOString(),
      ends_at: new Date(NOW + 32 * 60 * 60 * 1000).toISOString(),
    });

    const targets = build_reminder_targets([all_day], {
      ...BASE,
      default_all_day_reminder_minutes: 420,
    });

    expect(targets[0].fire_at).toBe(NOW + 60 * 60 * 1000);
  });

  it("keeps the timed default when no all-day default is set", () => {
    const all_day = make_event({
      is_all_day: true,
      starts_at: new Date(NOW + 8 * 60 * 60 * 1000).toISOString(),
      ends_at: new Date(NOW + 32 * 60 * 60 * 1000).toISOString(),
    });

    const targets = build_reminder_targets([all_day], BASE);

    expect(targets[0].fire_at).toBe(NOW + 8 * 60 * 60 * 1000 - 30 * 60 * 1000);
  });

  it("still prefers a per-event reminder on all-day events", () => {
    const all_day = make_event({
      is_all_day: true,
      reminder_minutes: 60,
      starts_at: new Date(NOW + 8 * 60 * 60 * 1000).toISOString(),
      ends_at: new Date(NOW + 32 * 60 * 60 * 1000).toISOString(),
    });

    const targets = build_reminder_targets([all_day], {
      ...BASE,
      default_all_day_reminder_minutes: 420,
    });

    expect(targets[0].fire_at).toBe(NOW + 7 * 60 * 60 * 1000);
  });

  it("skips cancelled events", () => {
    expect(
      build_reminder_targets([make_event({ status: "cancelled" })], BASE),
    ).toEqual([]);
  });

  it("skips events when reminders are disabled", () => {
    expect(
      build_reminder_targets([make_event({ reminder_minutes: -1 })], BASE),
    ).toEqual([]);
    expect(
      build_reminder_targets([make_event()], {
        ...BASE,
        default_reminder_minutes: -1,
      }),
    ).toEqual([]);
  });

  it("skips reminders whose fire time has already passed", () => {
    const targets = build_reminder_targets(
      [make_event({ starts_at: new Date(NOW + 5 * 60 * 1000).toISOString() })],
      BASE,
    );

    expect(targets).toEqual([]);
  });

  it("keeps a reminder that came due a few minutes ago", () => {
    const targets = build_reminder_targets(
      [make_event({ starts_at: new Date(NOW + 28 * 60 * 1000).toISOString() })],
      BASE,
    );

    expect(targets).toHaveLength(1);
    expect(targets[0].fire_at).toBe(NOW - 2 * 60 * 1000);
  });

  it("skips a reminder more than five minutes past due", () => {
    const targets = build_reminder_targets(
      [make_event({ starts_at: new Date(NOW + 24 * 60 * 1000).toISOString() })],
      BASE,
    );

    expect(targets).toEqual([]);
  });

  it("skips events beyond the lookahead window", () => {
    const targets = build_reminder_targets(
      [
        make_event({
          starts_at: new Date(NOW + 40 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      BASE,
    );

    expect(targets).toEqual([]);
  });

  it("skips events with an unparseable start", () => {
    expect(
      build_reminder_targets([make_event({ starts_at: "nope" })], BASE),
    ).toEqual([]);
  });

  it("drops declined and unanswered events when only_accepted is set", () => {
    const attendees_for = (
      response: "accepted" | "declined" | "needs_action",
    ) => [
      {
        email: "me@example.com",
        display_name: null,
        response,
        is_organizer: false,
      },
    ];

    const options = {
      ...BASE,
      only_accepted: true,
      self_email: "me@example.com",
    };

    expect(
      build_reminder_targets(
        [make_event({ attendees: attendees_for("accepted") })],
        options,
      ),
    ).toHaveLength(1);
    expect(
      build_reminder_targets(
        [make_event({ attendees: attendees_for("declined") })],
        options,
      ),
    ).toEqual([]);
    expect(
      build_reminder_targets(
        [make_event({ attendees: attendees_for("needs_action") })],
        options,
      ),
    ).toEqual([]);
  });

  it("keeps events the user is not an attendee of", () => {
    const targets = build_reminder_targets([make_event()], {
      ...BASE,
      only_accepted: true,
      self_email: "me@example.com",
    });

    expect(targets).toHaveLength(1);
  });

  it("returns targets in fire order", () => {
    const targets = build_reminder_targets(
      [
        make_event({ id: "late", reminder_minutes: 5 }),
        make_event({ id: "early", reminder_minutes: 45 }),
        make_event({ id: "middle", reminder_minutes: 20 }),
      ],
      BASE,
    );

    expect(targets.map((target) => target.event_id)).toEqual([
      "early",
      "middle",
      "late",
    ]);
  });

  it("keys a target by event, start, and lead time so a reschedule re-arms", () => {
    const [first] = build_reminder_targets([make_event()], BASE);
    const [moved] = build_reminder_targets(
      [
        make_event({
          starts_at: new Date(NOW + 2 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      BASE,
    );

    expect(first.key).not.toBe(moved.key);
  });
});

describe("fired reminder bookkeeping", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("remembers a fired key", () => {
    expect(has_fired("evt-1:a:30")).toBe(false);
    mark_fired("evt-1:a:30");
    expect(has_fired("evt-1:a:30")).toBe(true);
  });

  it("keeps unrelated keys separate", () => {
    mark_fired("evt-1:a:30");

    expect(has_fired("evt-1:a:10")).toBe(false);
    expect(has_fired("evt-2:a:30")).toBe(false);
  });

  it("survives a reload of the stored value", () => {
    mark_fired("evt-9:b:15");

    const raw = window.localStorage.getItem("aster_calendar_fired_reminders");

    expect(raw).not.toBeNull();
    expect(raw).not.toContain("evt-9");
    expect(has_fired("evt-9:b:15")).toBe(true);
  });
});

describe("clear_fired_reminders", () => {
  it("forgets every fired key on sign-out", () => {
    mark_fired("evt-1:2026-03-04T10:00:00.000Z:30");
    mark_fired("evt-2:2026-03-04T11:00:00.000Z:10");

    expect(has_fired("evt-1:2026-03-04T10:00:00.000Z:30")).toBe(true);

    clear_fired_reminders();

    expect(has_fired("evt-1:2026-03-04T10:00:00.000Z:30")).toBe(false);
    expect(has_fired("evt-2:2026-03-04T11:00:00.000Z:10")).toBe(false);
  });
});

describe("claim_reminder", () => {
  const original = Object.getOwnPropertyDescriptor(navigator, "locks");

  function set_locks(value: unknown) {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value,
    });
  }

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    if (original) Object.defineProperty(navigator, "locks", original);
    else set_locks(undefined);
  });

  it("lets only one caller fire a reminder through the lock manager", async () => {
    const held = new Set<string>();

    set_locks({
      request: async (
        name: string,
        _options: unknown,
        callback: (lock: unknown) => Promise<boolean>,
      ) => {
        if (held.has(name)) return callback(null);
        held.add(name);
        try {
          await new Promise((resolve) => setTimeout(resolve, 5));

          return await callback({ name });
        } finally {
          held.delete(name);
        }
      },
    });

    const results = await Promise.all([
      claim_reminder("evt-1:a:30"),
      claim_reminder("evt-1:a:30"),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(has_fired("evt-1:a:30")).toBe(true);
    expect(await claim_reminder("evt-1:a:30")).toBe(false);
  });

  it("falls back to a stored claim without the lock manager", async () => {
    set_locks(undefined);

    const results = await Promise.all([
      claim_reminder("evt-2:a:30"),
      claim_reminder("evt-2:a:30"),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(has_fired("evt-2:a:30")).toBe(true);
  });

  it("yields when another tab takes over the claim before it settles", async () => {
    set_locks(undefined);

    const pending = claim_reminder("evt-3:a:30");
    const claim_key = Object.keys(window.localStorage).find((key) =>
      key.startsWith("aster_calendar_reminder_claim:"),
    );

    expect(claim_key).toBeDefined();
    window.localStorage.setItem(claim_key as string, `other-tab:${Date.now()}`);

    expect(await pending).toBe(false);
    expect(has_fired("evt-3:a:30")).toBe(false);
  });
});
