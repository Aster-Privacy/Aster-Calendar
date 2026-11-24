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

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  list_event_masters: vi.fn(),
  settled: vi.fn(),
  get_calendar: vi.fn(),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    put: mocks.put,
    get: mocks.get,
    post: mocks.post,
    delete: mocks.delete,
  },
}));

vi.mock("@/services/api/calendar", () => ({
  list_event_masters: mocks.list_event_masters,
}));

vi.mock("@/services/calendar/sync_engine", () => ({
  calendar_sync_engine: {
    has_settled_first_sync: mocks.settled,
    get_calendar: mocks.get_calendar,
  },
}));

import {
  BUSY_FUTURE_DAYS,
  BUSY_PAST_DAYS,
  MAX_BUSY_BLOCKS,
  busy_upload_fingerprint,
  busy_window,
  compute_busy_upload,
  counts_as_busy,
  forget_busy_fingerprints,
  publish_all_busy_feeds,
  publish_busy_calendar,
  revoke_busy_feed,
} from "@/services/calendar/busy_feed";

const CALENDAR = "calendar_1";
const NOW = new Date("2026-03-01T12:03:30Z");
const DAY = 86_400;

function seconds(iso: string): number {
  return Date.parse(iso) / 1000;
}

let counter = 0;

function make_event(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  counter += 1;

  return {
    id: `event_${counter}`,
    calendar_id: CALENDAR,
    title: "Secret board meeting",
    description: "Quarterly numbers",
    location: "Room 42",
    starts_at: "2026-03-02T09:00:00Z",
    ends_at: "2026-03-02T09:30:00Z",
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
    reminder_minutes: null,
    recurrence: null,
    recurrence_exceptions: [],
    recurrence_master_id: null,
    occurrence_start: null,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    ...overrides,
  };
}

function blocks_for(events: DecryptedCalendarEvent[], self = "me@aster.test") {
  return compute_busy_upload(events, CALENDAR, NOW, self).blocks;
}

describe("busy_window", () => {
  it("anchors on a five-minute boundary and spans the past week and next 90 days", () => {
    const window = busy_window(NOW);
    const anchor = seconds("2026-03-01T12:00:00Z");

    expect(window.start).toBe(anchor - BUSY_PAST_DAYS * DAY);
    expect(window.end).toBe(anchor + BUSY_FUTURE_DAYS * DAY);
    expect(window.start % 300).toBe(0);
  });
});

describe("compute_busy_upload", () => {
  it("rounds timed events outward to five-minute steps", () => {
    expect(
      blocks_for([
        make_event({
          starts_at: "2026-03-02T09:02:10Z",
          ends_at: "2026-03-02T09:31:00Z",
        }),
      ]),
    ).toEqual([
      [seconds("2026-03-02T09:00:00Z"), seconds("2026-03-02T09:35:00Z")],
    ]);
  });

  it("sorts and merges overlapping and touching events", () => {
    const blocks = blocks_for([
      make_event({
        starts_at: "2026-03-03T14:00:00Z",
        ends_at: "2026-03-03T15:00:00Z",
      }),
      make_event({
        starts_at: "2026-03-02T10:00:00Z",
        ends_at: "2026-03-02T11:00:00Z",
      }),
      make_event({
        starts_at: "2026-03-02T10:30:00Z",
        ends_at: "2026-03-02T12:00:00Z",
      }),
      make_event({
        starts_at: "2026-03-02T12:00:00Z",
        ends_at: "2026-03-02T12:30:00Z",
      }),
    ]);

    expect(blocks).toEqual([
      [seconds("2026-03-02T10:00:00Z"), seconds("2026-03-02T12:30:00Z")],
      [seconds("2026-03-03T14:00:00Z"), seconds("2026-03-03T15:00:00Z")],
    ]);
  });

  it("never carries titles, notes, locations, or attendees", () => {
    const upload = compute_busy_upload(
      [
        make_event({
          attendees: [
            {
              email: "guest@example.test",
              display_name: "Guest Person",
              response: "accepted",
              is_organizer: false,
            } as DecryptedCalendarEvent["attendees"][number],
          ],
        }),
      ],
      CALENDAR,
      NOW,
      "me@aster.test",
    );
    const serialized = JSON.stringify(upload);

    expect(Object.keys(upload).sort()).toEqual([
      "blocks",
      "window_end",
      "window_start",
    ]);
    expect(serialized).not.toMatch(/Secret|Quarterly|Room|guest|Guest/);
    expect(serialized).toMatch(/^[\d,[\]{}":a-z_]+$/);
  });

  it("skips events that do not make you busy", () => {
    const blocks = blocks_for([
      make_event({ availability: "free" }),
      make_event({ status: "cancelled" }),
      make_event({ event_kind: "task" }),
      make_event({ event_kind: "working_location" }),
      make_event({ event_kind: "birthday" }),
      make_event({ trashed_at: "2026-02-20T00:00:00Z" }),
      make_event({ calendar_id: "calendar_2" }),
      make_event({
        attendees: [
          {
            email: "Me@Aster.test",
            response: "declined",
            is_organizer: false,
          } as DecryptedCalendarEvent["attendees"][number],
        ],
      }),
    ]);

    expect(blocks).toEqual([]);
  });

  it("keeps tentative events, out-of-office, focus time, and events other guests declined", () => {
    const declined_by_other = make_event({
      starts_at: "2026-03-04T09:00:00Z",
      ends_at: "2026-03-04T10:00:00Z",
      attendees: [
        {
          email: "other@example.test",
          response: "declined",
          is_organizer: false,
        } as DecryptedCalendarEvent["attendees"][number],
      ],
    });

    expect(counts_as_busy(make_event({ status: "tentative" }), null)).toBe(
      true,
    );
    expect(
      counts_as_busy(make_event({ event_kind: "out_of_office" }), null),
    ).toBe(true);
    expect(counts_as_busy(make_event({ event_kind: "focus_time" }), null)).toBe(
      true,
    );
    expect(blocks_for([declined_by_other])).toHaveLength(1);
  });

  it("expands recurring events inside the window", () => {
    const blocks = blocks_for([
      make_event({
        starts_at: "2026-03-02T09:00:00Z",
        ends_at: "2026-03-02T09:15:00Z",
        recurrence: {
          frequency: "daily",
          interval: 1,
          by_weekday: [],
          count: 3,
          until: null,
        },
      }),
    ]);

    expect(blocks).toEqual([
      [seconds("2026-03-02T09:00:00Z"), seconds("2026-03-02T09:15:00Z")],
      [seconds("2026-03-03T09:00:00Z"), seconds("2026-03-03T09:15:00Z")],
      [seconds("2026-03-04T09:00:00Z"), seconds("2026-03-04T09:15:00Z")],
    ]);
  });

  it("clips events to the window", () => {
    const window = busy_window(NOW);
    const blocks = blocks_for([
      make_event({
        starts_at: "2026-02-10T00:00:00Z",
        ends_at: "2026-02-23T00:00:00Z",
      }),
      make_event({
        starts_at: "2026-07-01T00:00:00Z",
        ends_at: "2026-07-01T01:00:00Z",
      }),
    ]);

    expect(blocks).toEqual([[window.start, seconds("2026-02-23T00:00:00Z")]]);
    for (const [start, end] of blocks) {
      expect(start).toBeGreaterThanOrEqual(window.start);
      expect(end).toBeLessThanOrEqual(window.end);
    }
  });

  it("drops events with invalid or inverted times", () => {
    expect(
      blocks_for([
        make_event({ starts_at: "not a date" }),
        make_event({
          starts_at: "2026-03-02T10:00:00Z",
          ends_at: "2026-03-02T09:00:00Z",
        }),
      ]),
    ).toEqual([]);
  });

  it("caps the upload and keeps upcoming blocks first", () => {
    const events: DecryptedCalendarEvent[] = [];
    const start = seconds("2026-03-01T13:00:00Z");

    for (let index = 0; index < 50; index += 1) {
      const past = seconds("2026-02-25T00:00:00Z") + index * 600;

      events.push(
        make_event({
          starts_at: new Date(past * 1000).toISOString(),
          ends_at: new Date((past + 300) * 1000).toISOString(),
        }),
      );
    }

    for (let index = 0; index < MAX_BUSY_BLOCKS + 100; index += 1) {
      const begin = start + index * 600;

      events.push(
        make_event({
          starts_at: new Date(begin * 1000).toISOString(),
          ends_at: new Date((begin + 300) * 1000).toISOString(),
        }),
      );
    }

    const blocks = blocks_for(events);

    expect(blocks).toHaveLength(MAX_BUSY_BLOCKS);
    expect(blocks[0][0]).toBe(start);
    for (let index = 1; index < blocks.length; index += 1) {
      expect(blocks[index][0]).toBeGreaterThan(blocks[index - 1][1]);
    }
  });
});

describe("all-day events across daylight saving time", () => {
  const previous_zone = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });

  afterAll(() => {
    if (previous_zone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous_zone;
    }
  });

  it("covers the full local day on the spring-forward date", () => {
    const blocks = compute_busy_upload(
      [
        make_event({
          is_all_day: true,
          starts_at: new Date(2026, 2, 8, 0, 0, 0, 0).toISOString(),
          ends_at: new Date(2026, 2, 8, 23, 59, 59, 999).toISOString(),
        }),
      ],
      CALENDAR,
      new Date(2026, 2, 1, 12),
      null,
    ).blocks;

    expect(blocks).toEqual([
      [
        new Date(2026, 2, 8).getTime() / 1000,
        new Date(2026, 2, 9).getTime() / 1000,
      ],
    ]);
    expect(blocks[0][1] - blocks[0][0]).toBe(23 * 3600);
  });

  it("covers every day of a multi-day all-day event", () => {
    const blocks = compute_busy_upload(
      [
        make_event({
          is_all_day: true,
          starts_at: new Date(2026, 2, 10).toISOString(),
          ends_at: new Date(2026, 2, 12, 23, 59, 59, 999).toISOString(),
        }),
      ],
      CALENDAR,
      new Date(2026, 2, 1, 12),
      null,
    ).blocks;

    expect(blocks).toEqual([
      [
        new Date(2026, 2, 10).getTime() / 1000,
        new Date(2026, 2, 13).getTime() / 1000,
      ],
    ]);
  });
});

describe("publishing", () => {
  beforeEach(() => {
    forget_busy_fingerprints();
    mocks.put.mockReset();
    mocks.get.mockReset();
    mocks.delete.mockReset();
    mocks.list_event_masters.mockReset();
    mocks.list_event_masters.mockResolvedValue({ data: [make_event()] });
    mocks.settled.mockReset();
    mocks.settled.mockReturnValue(true);
    mocks.get_calendar.mockReset();
    mocks.get_calendar.mockImplementation((id: string) => ({ id }));
    mocks.put.mockResolvedValue({
      data: { published_at: "2026-03-01T12:04:00Z", block_count: 1 },
    });
  });

  it("uploads only the computed blocks to the calendar's endpoint", async () => {
    await publish_busy_calendar(CALENDAR, "me@aster.test", { now: NOW });

    expect(mocks.put).toHaveBeenCalledTimes(1);
    const [path, body] = mocks.put.mock.calls[0];

    expect(path).toBe("/calendar/v1/busy_feeds/calendar_1/busy");
    expect(body.blocks).toEqual([
      [seconds("2026-03-02T09:00:00Z"), seconds("2026-03-02T09:30:00Z")],
    ]);
    expect(JSON.stringify(body)).not.toContain("Secret");
  });

  it("skips an unchanged upload unless forced", async () => {
    await publish_busy_calendar(CALENDAR, null, { now: NOW });
    const skipped = await publish_busy_calendar(CALENDAR, null, { now: NOW });

    expect(skipped).toBeNull();
    expect(mocks.put).toHaveBeenCalledTimes(1);

    await publish_busy_calendar(CALENDAR, null, { now: NOW, force: true });
    expect(mocks.put).toHaveBeenCalledTimes(2);
  });

  it("retries after a failed upload", async () => {
    mocks.put.mockResolvedValueOnce({ error: "failed", status: 500 });
    expect(
      await publish_busy_calendar(CALENDAR, null, { now: NOW }),
    ).toBeNull();
    expect(
      await publish_busy_calendar(CALENDAR, null, { now: NOW }),
    ).not.toBeNull();
    expect(mocks.put).toHaveBeenCalledTimes(2);
  });

  it("publishes every shared calendar and keeps going after one fails", async () => {
    mocks.get.mockResolvedValue({
      data: {
        feeds: [{ calendar_id: "calendar_1" }, { calendar_id: "calendar_2" }],
      },
    });
    mocks.list_event_masters
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ data: [] });

    expect(await publish_all_busy_feeds(null)).toBe(1);
    expect(mocks.put).toHaveBeenCalledWith(
      "/calendar/v1/busy_feeds/calendar_2/busy",
      expect.objectContaining({ blocks: [] }),
    );
  });

  it("waits for the first sync before uploading", async () => {
    mocks.settled.mockReturnValue(false);
    mocks.list_event_masters.mockResolvedValue({ data: [] });

    expect(
      await publish_busy_calendar(CALENDAR, null, { now: NOW, force: true }),
    ).toBeNull();
    expect(mocks.put).not.toHaveBeenCalled();

    mocks.settled.mockReturnValue(true);
    mocks.list_event_masters.mockResolvedValue({ data: [make_event()] });

    expect(
      await publish_busy_calendar(CALENDAR, null, { now: NOW }),
    ).not.toBeNull();
    expect(mocks.put).toHaveBeenCalledTimes(1);
  });

  it("skips a calendar that is not loaded on this device", async () => {
    mocks.get_calendar.mockReturnValue(undefined);

    expect(
      await publish_busy_calendar(CALENDAR, null, { now: NOW, force: true }),
    ).toBeNull();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("stops uploading once the session it started in has ended", async () => {
    let active = true;

    mocks.get.mockResolvedValue({
      data: {
        feeds: [{ calendar_id: "calendar_1" }, { calendar_id: "calendar_2" }],
      },
    });
    mocks.list_event_masters.mockImplementation(async () => {
      active = false;

      return { data: [make_event()] };
    });

    expect(
      await publish_all_busy_feeds(null, {
        force: true,
        should_continue: () => active,
      }),
    ).toBe(0);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.list_event_masters).toHaveBeenCalledTimes(1);
  });

  it("does nothing when sharing is unavailable", async () => {
    mocks.get.mockResolvedValue({ error: "not found", status: 404 });

    expect(await publish_all_busy_feeds(null)).toBe(0);
    expect(mocks.list_event_masters).not.toHaveBeenCalled();
  });

  it("encodes calendar ids in paths", async () => {
    mocks.delete.mockResolvedValue({ data: { success: true } });
    await revoke_busy_feed("a/../b");

    expect(mocks.delete.mock.calls[0][0]).toBe(
      "/calendar/v1/busy_feeds/a%2F..%2Fb",
    );
  });

  it("gives the same fingerprint for the same blocks", () => {
    const first = compute_busy_upload([make_event()], CALENDAR, NOW, null);
    const second = compute_busy_upload([make_event()], CALENDAR, NOW, null);

    expect(busy_upload_fingerprint(first)).toBe(
      busy_upload_fingerprint(second),
    );
  });
});
