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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const post = vi.fn();
const get = vi.fn();
const put = vi.fn();
const del = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    post: (...args: unknown[]) => post(...args),
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
    delete: (...args: unknown[]) => del(...args),
    patch: vi.fn(),
  },
}));

vi.mock("@/services/calendar/identity_guard", () => ({
  confirm_calendar_identity: async () => true,
  reset_calendar_identity: () => undefined,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ identity_key: "test-identity" }),
  on_keys_ready: () => () => undefined,
  wait_for_account_key_load: async () => undefined,
}));

vi.mock("@/services/calendar/calendar_crypto", () => ({
  CALENDAR_BLOB_FORMAT_V1: 1,
  set_calendar_write_account: () => undefined,
  CALENDAR_BLOB_FORMAT_V2: 2,
  CALENDAR_BLOB_FORMAT_V3: 3,
  calendar_v3_floor: () => false,
  calendar_write_key: async () => null,
  encrypt_calendar_payload: async (payload: unknown) => ({
    ciphertext: JSON.stringify(payload),
    nonce: "nonce",
    format: 2,
  }),
  decrypt_calendar_payload: async (record: { ciphertext: string }) => ({
    payload: JSON.parse(record.ciphertext),
    format: 2,
    bound: true,
  }),
}));

const { delete_all_calendar_events, list_calendar_event_ids } = await import(
  "./calendar"
);
const { calendar_sync_engine } = await import(
  "@/services/calendar/sync_engine"
);
const { MemorySyncStore, set_sync_store_adapter } = await import(
  "@/services/calendar/sync_store"
);

const SERVER_TIME = new Date().toISOString();
const MASTER_START = "2026-10-05T09:00:00.000Z";
const MASTER_END = "2026-10-05T10:00:00.000Z";

function build_master(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  return {
    id: "master-1",
    calendar_id: "cal-1",
    title: "Standup",
    description: "",
    location: "",
    starts_at: MASTER_START,
    ends_at: MASTER_END,
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
    recurrence: {
      frequency: "daily",
      interval: 1,
      by_weekday: [],
      count: 10,
      until: null,
    },
    recurrence_exceptions: ["2026-10-06T09:00:00.000Z", "2026-10-09T09:00:00.000Z"],
    recurrence_master_id: null,
    occurrence_start: null,
    created_at: MASTER_START,
    updated_at: MASTER_START,
    ...overrides,
  };
}

function master_row(master: DecryptedCalendarEvent) {
  const { id, calendar_id, created_at, updated_at, ...blob } = master;

  return {
    id,
    calendar_id,
    encrypted_blob: JSON.stringify(blob),
    blob_nonce: "nonce",
    created_at,
    updated_at,
  };
}

function single(id: string, overrides: Partial<DecryptedCalendarEvent> = {}) {
  return build_master({
    id,
    recurrence: null,
    recurrence_exceptions: [],
    ...overrides,
  });
}

function serve_events(events: DecryptedCalendarEvent[]) {
  get.mockResolvedValue({
    data: {
      events: events.map(master_row),
      total: events.length,
      server_time: SERVER_TIME,
    },
  });
}

function batch_ok() {
  post.mockImplementation(async (_url: string, body: unknown) => {
    const { operations } = body as {
      operations: Array<{ event_id?: string }>;
    };

    return {
      data: {
        results: operations.map((operation) => ({
          event_id: operation.event_id,
          updated_at: MASTER_START,
          version: 2,
        })),
      },
    };
  });
}

function deleted_ids(): string[] {
  return post.mock.calls.flatMap((call) =>
    (call[1] as { operations: Array<{ op: string; event_id: string }> })
      .operations.filter((operation) => operation.op === "delete")
      .map((operation) => operation.event_id),
  );
}

beforeEach(() => {
  post.mockReset();
  get.mockReset();
  put.mockReset();
  del.mockReset();
  set_sync_store_adapter(new MemorySyncStore());
  calendar_sync_engine.reset();
});

afterEach(() => {
  set_sync_store_adapter(null);
  calendar_sync_engine.reset();
});

describe("list_calendar_event_ids", () => {
  it("lists events in the calendar and skips other calendars, Trash, and tasks", async () => {
    serve_events([
      build_master({ id: "recurring-1" }),
      single("one-off-1"),
      single("detached-1", { recurrence_id: "2026-10-08T09:00:00.000Z" }),
      single("other-cal-1", { calendar_id: "cal-2" }),
      single("trashed-1", { trashed_at: "2026-10-10T00:00:00.000Z" }),
      single("task-1", { event_kind: "task" }),
    ]);

    const ids = (await list_calendar_event_ids("cal-1")).sort();

    expect(ids).toEqual(["detached-1", "one-off-1", "recurring-1"]);
  });

  it("returns nothing for an empty calendar", async () => {
    serve_events([single("other-cal-1", { calendar_id: "cal-2" })]);

    expect(await list_calendar_event_ids("cal-1")).toEqual([]);
  });
});

describe("delete_all_calendar_events", () => {
  it("deletes every event in the calendar in chunks of 50 and reports progress", async () => {
    const events = Array.from({ length: 120 }, (_, index) =>
      single(`evt-${index}`),
    );

    serve_events([...events, single("keep-1", { calendar_id: "cal-2" })]);
    batch_ok();

    const progress: Array<[number, number]> = [];
    const result = await delete_all_calendar_events("cal-1", (done, total) =>
      progress.push([done, total]),
    );

    expect(result).toEqual({ deleted: 120, failed: 0 });
    expect(
      post.mock.calls.map(
        (call) => (call[1] as { operations: unknown[] }).operations.length,
      ),
    ).toEqual([50, 50, 20]);
    expect(deleted_ids().sort()).toEqual(events.map((event) => event.id).sort());
    expect(deleted_ids()).not.toContain("keep-1");
    expect(progress).toEqual([
      [50, 120],
      [100, 120],
      [120, 120],
    ]);
  });

  it("counts a failed chunk without stopping the rest", async () => {
    serve_events(
      Array.from({ length: 60 }, (_, index) => single(`evt-${index}`)),
    );

    let call = 0;

    post.mockImplementation(async (_url: string, body: unknown) => {
      call += 1;

      if (call === 1) {
        return { error: "boom", code: "VALIDATION_ERROR", status: 400 };
      }

      const { operations } = body as {
        operations: Array<{ event_id?: string }>;
      };

      return {
        data: {
          results: operations.map((operation) => ({
            event_id: operation.event_id,
            updated_at: MASTER_START,
            version: 2,
          })),
        },
      };
    });

    const result = await delete_all_calendar_events("cal-1");

    expect(result.deleted + result.failed).toBe(60);
    expect(result.failed).toBeGreaterThan(0);
  });

  it("does nothing for an empty calendar", async () => {
    serve_events([]);

    const result = await delete_all_calendar_events("cal-1");

    expect(result).toEqual({ deleted: 0, failed: 0 });
    expect(post).not.toHaveBeenCalled();
  });
});
