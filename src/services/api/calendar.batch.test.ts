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

import { describe, it, expect, vi, beforeEach } from "vitest";

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

const {
  batch_events,
  delete_event_occurrence,
  list_calendars,
  list_event_masters,
  plan_occurrence_delete,
  plan_occurrence_update,
  reset_calendar_seeding,
  set_default_calendar_names,
  tail_recurrence,
  update_event_occurrence,
} = await import("./calendar");
const { calendar_sync_engine } = await import("@/services/calendar/sync_engine");

const SERVER_TIME = new Date().toISOString();
const MASTER_START = "2026-10-05T09:00:00.000Z";
const MASTER_END = "2026-10-05T10:00:00.000Z";
const THIRD_START = "2026-10-07T09:00:00.000Z";
const THIRD_END = "2026-10-07T10:00:00.000Z";

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

function build_occurrence(
  master: DecryptedCalendarEvent,
  starts_at: string,
  ends_at: string,
): DecryptedCalendarEvent {
  return {
    ...master,
    id: `${master.id}:${starts_at}`,
    starts_at,
    ends_at,
    recurrence_master_id: master.id,
    occurrence_start: starts_at,
  };
}

function build_draft(
  occurrence: DecryptedCalendarEvent,
  overrides: Partial<CalendarEventDraft> = {},
): CalendarEventDraft {
  return {
    calendar_id: occurrence.calendar_id,
    title: "Standup (moved)",
    description: occurrence.description,
    location: occurrence.location,
    starts_at: occurrence.starts_at,
    ends_at: occurrence.ends_at,
    is_all_day: occurrence.is_all_day,
    status: occurrence.status,
    attendees: occurrence.attendees,
    tags: occurrence.tags,
    reminder_minutes: occurrence.reminder_minutes,
    color: occurrence.color,
    availability: occurrence.availability,
    visibility: occurrence.visibility,
    event_kind: occurrence.event_kind,
    is_completed: occurrence.is_completed,
    working_location: occurrence.working_location,
    conference_url: occurrence.conference_url,
    guests_can_modify: occurrence.guests_can_modify,
    guests_can_invite: occurrence.guests_can_invite,
    guests_can_see_guests: occurrence.guests_can_see_guests,
    recurrence: occurrence.recurrence,
    recurrence_exceptions: occurrence.recurrence_exceptions,
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

beforeEach(() => {
  post.mockReset();
  get.mockReset();
  put.mockReset();
  del.mockReset();
});

describe("plan_occurrence_update", () => {
  const master = build_master();
  const occurrence = build_occurrence(master, THIRD_START, THIRD_END);

  it("single: adds an exception to the master and creates a detached copy", () => {
    const draft = build_draft(occurrence);
    const plan = plan_occurrence_update(master, occurrence, draft, "single");

    expect(plan.operations).toHaveLength(2);
    expect(plan.primary_index).toBe(1);

    const [first, second] = plan.operations;

    expect(first).toMatchObject({ op: "update", event_id: "master-1" });
    expect(first.op === "update" && first.draft.recurrence_exceptions).toEqual([
      ...master.recurrence_exceptions,
      THIRD_START,
    ]);
    expect(first.op === "update" && first.draft.title).toBe("Standup");

    expect(second).toMatchObject({ op: "create", client_ref: "detached" });
    expect(second.op === "create" && second.draft).toMatchObject({
      title: "Standup (moved)",
      recurrence: null,
      recurrence_exceptions: [],
    });
  });

  it("following: truncates the master and creates a tail series with the remaining count", () => {
    const draft = build_draft(occurrence);
    const plan = plan_occurrence_update(master, occurrence, draft, "following");

    expect(plan.operations).toHaveLength(2);
    expect(plan.primary_index).toBe(1);

    const [truncate, tail] = plan.operations;
    const boundary = new Date(new Date(THIRD_START).getTime() - 1).toISOString();

    expect(truncate).toMatchObject({ op: "update", event_id: "master-1" });
    expect(truncate.op === "update" && truncate.draft.recurrence).toEqual({
      ...master.recurrence,
      count: null,
      until: boundary,
    });
    expect(truncate.op === "update" && truncate.draft.title).toBe("Standup");

    expect(tail).toMatchObject({ op: "create", client_ref: "tail" });
    expect(tail.op === "create" && tail.draft.recurrence).toEqual({
      ...master.recurrence,
      count: 8,
    });
    expect(tail.op === "create" && tail.draft.recurrence_exceptions).toEqual([
      "2026-10-09T09:00:00.000Z",
    ]);
  });

  it("following from the first occurrence: rewrites the master in place", () => {
    const first = build_occurrence(master, MASTER_START, MASTER_END);
    const draft = build_draft(first);
    const plan = plan_occurrence_update(master, first, draft, "following");

    const [only] = plan.operations;

    expect(plan.operations).toHaveLength(1);
    expect(plan.primary_index).toBe(0);
    expect(only).toMatchObject({ op: "update", event_id: "master-1" });
    expect(only.op === "update" && only.draft.recurrence_exceptions).toEqual(
      master.recurrence_exceptions,
    );
  });

  it("series: shifts the master by the occurrence delta in one update", () => {
    const draft = build_draft(occurrence, {
      starts_at: "2026-10-07T11:00:00.000Z",
      ends_at: "2026-10-07T11:30:00.000Z",
    });
    const plan = plan_occurrence_update(master, occurrence, draft, "series", []);

    const [only] = plan.operations;

    expect(plan.operations).toHaveLength(1);
    expect(plan.primary_index).toBe(0);
    expect(only.op === "update" && only.draft).toMatchObject({
      starts_at: "2026-10-05T11:00:00.000Z",
      ends_at: "2026-10-05T11:30:00.000Z",
      recurrence_exceptions: [
        "2026-10-06T11:00:00.000Z",
        "2026-10-09T11:00:00.000Z",
      ],
    });
  });

  it("series: shifts detached children with the master", () => {
    const uid_master = build_master({ uid: "uid-1" });
    const child = build_master({
      id: "child-1",
      uid: "uid-1",
      recurrence: null,
      recurrence_exceptions: [],
      recurrence_id: "2026-10-08T09:00:00.000Z",
      starts_at: "2026-10-08T14:00:00.000Z",
      ends_at: "2026-10-08T15:00:00.000Z",
    });
    const draft = build_draft(occurrence, {
      starts_at: "2026-10-07T11:00:00.000Z",
      ends_at: "2026-10-07T12:00:00.000Z",
    });
    const plan = plan_occurrence_update(
      uid_master,
      occurrence,
      draft,
      "series",
      [child],
    );

    expect(plan.operations).toHaveLength(2);
    expect(plan.operations[1]).toMatchObject({
      op: "update",
      event_id: "child-1",
      draft: {
        recurrence_id: "2026-10-08T11:00:00.000Z",
        starts_at: "2026-10-08T14:00:00.000Z",
      },
    });
  });

  it("series: keeps all-day exceptions on their wall date", () => {
    const all_day = build_master({
      is_all_day: true,
      starts_at: "2026-10-05T00:00:00.000Z",
      ends_at: "2026-10-06T00:00:00.000Z",
      recurrence_exceptions: ["2026-10-06T00:00:00.000Z"],
    });
    const day_occurrence = build_occurrence(
      all_day,
      "2026-10-07T00:00:00.000Z",
      "2026-10-08T00:00:00.000Z",
    );
    const draft = build_draft(day_occurrence, {
      starts_at: "2026-10-08T00:00:00.000Z",
      ends_at: "2026-10-09T00:00:00.000Z",
    });
    const plan = plan_occurrence_update(
      all_day,
      day_occurrence,
      draft,
      "series",
      [],
    );

    expect(plan.operations[0].op === "update" && plan.operations[0].draft).toMatchObject({
      recurrence_exceptions: ["2026-10-06T00:00:00.000Z"],
    });
  });

  it("series: recurrence_cleared stops the series and drops exceptions", () => {
    const draft = build_draft(occurrence, { recurrence_cleared: true });
    const plan = plan_occurrence_update(master, occurrence, draft, "series", []);

    expect(plan.operations[0].op === "update" && plan.operations[0].draft).toMatchObject({
      recurrence: null,
      recurrence_exceptions: [],
    });
  });

  it("following: shifts the tail exceptions by the time delta", () => {
    const draft = build_draft(occurrence, {
      starts_at: "2026-10-07T11:00:00.000Z",
      ends_at: "2026-10-07T12:00:00.000Z",
    });
    const plan = plan_occurrence_update(master, occurrence, draft, "following");

    expect(plan.operations[1].op === "create" && plan.operations[1].draft).toMatchObject({
      recurrence_exceptions: ["2026-10-09T11:00:00.000Z"],
    });
  });

  it("following: recurrence_cleared makes the tail a single event", () => {
    const draft = build_draft(occurrence, { recurrence_cleared: true });
    const plan = plan_occurrence_update(master, occurrence, draft, "following");

    expect(plan.operations[1].op === "create" && plan.operations[1].draft).toMatchObject({
      recurrence: null,
      recurrence_exceptions: [],
    });
  });

  it("keeps the invite identity when an edit leaves it out", () => {
    const invite = build_master({
      uid: "invite-uid@example.com",
      sequence: 2,
      organizer_email: "host@example.com",
    });
    const invite_occurrence = build_occurrence(invite, THIRD_START, THIRD_END);
    const identity = {
      uid: "invite-uid@example.com",
      sequence: 2,
      organizer_email: "host@example.com",
    };

    for (const scope of ["series", "single"] as const) {
      const plan = plan_occurrence_update(
        invite,
        invite_occurrence,
        build_draft(invite_occurrence),
        scope,
        [],
      );
      const primary = plan.operations[plan.primary_index];

      expect(primary.op !== "delete" && primary.draft).toMatchObject(identity);
    }

    const first = build_occurrence(invite, MASTER_START, MASTER_END);
    const rewrite = plan_occurrence_update(
      invite,
      first,
      build_draft(first),
      "following",
    );

    expect(
      rewrite.operations[0].op === "update" && rewrite.operations[0].draft,
    ).toMatchObject(identity);
  });
});

describe("tail_recurrence", () => {
  const master = build_master();
  const boundary = new Date(new Date(THIRD_START).getTime() - 1);

  it("keeps the draft count when it differs from the master count", () => {
    const rule = { ...master.recurrence!, count: 5 };

    expect(tail_recurrence(rule, master, boundary)).toMatchObject({ count: 5 });
  });

  it("ignores extra dates and exceptions when counting consumed occurrences", () => {
    const with_extras = build_master({
      recurrence: {
        ...master.recurrence!,
        extra_dates: ["2026-10-05T15:00:00.000Z", "2026-10-06T15:00:00.000Z"],
      },
    });

    expect(
      tail_recurrence(with_extras.recurrence, with_extras, boundary),
    ).toMatchObject({ count: 8 });
  });
});

describe("list_event_masters", () => {
  it("returns unexpanded masters that recur into the range plus detached copies", async () => {
    calendar_sync_engine.reset();

    const master = build_master();
    const detached = build_master({
      id: "detached-1",
      recurrence: null,
      recurrence_exceptions: [],
      recurrence_id: "2026-10-08T09:00:00.000Z",
      starts_at: "2026-10-08T14:00:00.000Z",
      ends_at: "2026-10-08T15:00:00.000Z",
    });
    const far_away = build_master({
      id: "far-1",
      recurrence: null,
      recurrence_exceptions: [],
      starts_at: "2027-01-01T09:00:00.000Z",
      ends_at: "2027-01-01T10:00:00.000Z",
    });

    get.mockResolvedValue({
      data: {
        events: [master_row(master), master_row(detached), master_row(far_away)],
        total: 3,
        server_time: SERVER_TIME,
      },
    });

    const result = await list_event_masters(
      new Date("2026-10-08T00:00:00.000Z"),
      new Date("2026-10-08T23:59:59.000Z"),
    );
    const ids = result.data.map((event) => event.id).sort();

    expect(ids).toEqual(["detached-1", "master-1"]);
    expect(result.data.find((event) => event.id === "master-1")).toMatchObject({
      starts_at: MASTER_START,
      recurrence: { count: 10 },
    });
  });
});

describe("batch_events chunking", () => {
  it("splits large batches into chunks of 50 and merges results in order", async () => {
    calendar_sync_engine.reset();
    get.mockResolvedValue({ data: { events: [], total: 0, server_time: SERVER_TIME } });

    let counter = 0;

    post.mockImplementation(async (_url: string, body: unknown) => {
      const { operations } = body as {
        operations: Array<{ client_ref?: string }>;
      };

      return {
        data: {
          results: operations.map((operation) => ({
            client_ref: operation.client_ref,
            event_id: `srv-${counter++}`,
            updated_at: MASTER_START,
            version: 1,
          })),
        },
      };
    });

    const blob = JSON.stringify(build_master({ recurrence: null, recurrence_exceptions: [] }));
    const operations = Array.from({ length: 120 }, (_, index) => ({
      op: "create" as const,
      server_id: `srv-${index}`,
      client_ref: `ref-${index}`,
      calendar_id: "cal-1",
      encrypted_blob: blob,
      blob_nonce: "nonce",
    }));

    const result = await batch_events(operations);

    expect(post).toHaveBeenCalledTimes(3);
    expect(
      post.mock.calls.map(
        (call) => (call[1] as { operations: unknown[] }).operations.length,
      ),
    ).toEqual([50, 50, 20]);
    expect(result.data).toHaveLength(120);
    expect(result.data?.[0]).toMatchObject({ client_ref: "ref-0", event_id: "srv-0" });
    expect(result.data?.[119]).toMatchObject({ client_ref: "ref-119", event_id: "srv-119" });
  });
});

describe("plan_occurrence_delete", () => {
  const master = build_master();
  const occurrence = build_occurrence(master, THIRD_START, THIRD_END);

  it("single: records an exception on the master", () => {
    const [only] = plan_occurrence_delete(master, occurrence, "single");

    expect(only).toMatchObject({ op: "update", event_id: "master-1" });
    expect(only.op === "update" && only.draft.recurrence_exceptions).toEqual([
      ...master.recurrence_exceptions,
      THIRD_START,
    ]);
  });

  it("following: truncates the master at the boundary", () => {
    const [only] = plan_occurrence_delete(master, occurrence, "following");

    expect(only.op === "update" && only.draft.recurrence).toEqual({
      ...master.recurrence,
      count: null,
      until: new Date(new Date(THIRD_START).getTime() - 1).toISOString(),
    });
  });

  it("following from the first occurrence or series: deletes the master", () => {
    const first = build_occurrence(master, MASTER_START, MASTER_END);

    expect(plan_occurrence_delete(master, first, "following")).toEqual([
      { op: "delete", event_id: "master-1" },
    ]);
    expect(plan_occurrence_delete(master, occurrence, "series")).toEqual([
      { op: "delete", event_id: "master-1" },
    ]);
  });
});

describe("update_event_occurrence", () => {
  const master = build_master();
  const occurrence = build_occurrence(master, THIRD_START, THIRD_END);

  it("sends one batch request and returns the detached event", async () => {
    get.mockResolvedValue({ data: { events: [master_row(master)], total: 1, server_time: SERVER_TIME } });
    post.mockImplementation(
      async (_endpoint: string, body: { operations: Array<{ id?: string }> }) => ({
        data: {
          results: [
            { event_id: "master-1", updated_at: "2026-10-07T12:00:00.000Z" },
            {
              client_ref: "detached",
              event_id: body.operations[1].id,
              updated_at: "2026-10-07T12:00:00.000Z",
            },
          ],
        },
      }),
    );

    const result = await update_event_occurrence(
      occurrence,
      build_draft(occurrence),
      "single",
    );

    expect(post).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();

    const [endpoint, body] = post.mock.calls[0] as [
      string,
      { operations: Array<Record<string, unknown>> },
    ];

    expect(endpoint).toBe("/calendar/v1/events/batch");
    expect(body.operations).toHaveLength(2);
    expect(body.operations[0]).toMatchObject({
      op: "update",
      event_id: "master-1",
      calendar_id: "cal-1",
      blob_nonce: "nonce",
    });
    expect(body.operations[1]).toMatchObject({
      op: "create",
      client_ref: "detached",
      calendar_id: "cal-1",
    });
    expect(JSON.parse(body.operations[0].encrypted_blob as string)).toMatchObject({
      recurrence_exceptions: [...master.recurrence_exceptions, THIRD_START],
    });

    expect(body.operations[1].id).toEqual(expect.any(String));
    expect(result.data).toMatchObject({
      id: body.operations[1].id,
      title: "Standup (moved)",
      recurrence: null,
      updated_at: "2026-10-07T12:00:00.000Z",
    });
  });

  it("returns null and issues no follow-up writes when the batch fails", async () => {
    get.mockResolvedValue({ data: { events: [master_row(master)], total: 1, server_time: SERVER_TIME } });
    post.mockResolvedValue({ error: "boom" });

    const result = await update_event_occurrence(
      occurrence,
      build_draft(occurrence),
      "following",
    );

    expect(result.data).toBeNull();
    expect(post).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
  });
});

describe("delete_event_occurrence", () => {
  it("routes scoped deletes through the batch endpoint", async () => {
    const master = build_master();
    const occurrence = build_occurrence(master, THIRD_START, THIRD_END);

    get.mockResolvedValue({ data: { events: [master_row(master)], total: 1, server_time: SERVER_TIME } });
    post.mockResolvedValue({
      data: { results: [{ event_id: "master-1", updated_at: MASTER_START }] },
    });

    const result = await delete_event_occurrence(occurrence, "single");

    expect(result.success).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe("/calendar/v1/events/batch");
    expect(del).not.toHaveBeenCalled();
  });
});

describe("ensure_seeded through list_calendars", () => {
  it("creates the default first and stops when another device already seeded", async () => {
    get
      .mockResolvedValueOnce({ data: { calendars: [], total: 0 } })
      .mockResolvedValueOnce({ data: { calendars: [], total: 2 } })
      .mockResolvedValue({ data: { calendars: [], total: 2, server_time: SERVER_TIME } });
    post.mockResolvedValue({
      data: { id: "cal-default", success: true, updated_at: MASTER_START },
    });

    await list_calendars();

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe("/calendar/v1/calendars");
    expect(post.mock.calls[0][1]).toMatchObject({ is_default: true });
  });
});

describe("ensure_seeded retry and names", () => {
  it("retries seeding on the next call after a rejected attempt", async () => {
    reset_calendar_seeding();
    calendar_sync_engine.reset();
    get.mockResolvedValue({ data: { calendars: [], total: 0, server_time: SERVER_TIME } });
    post
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({
        data: { id: "cal-default", success: true, updated_at: MASTER_START },
      });

    await expect(list_calendars()).rejects.toThrow("offline");

    get
      .mockResolvedValueOnce({ data: { calendars: [], total: 0 } })
      .mockResolvedValue({ data: { calendars: [], total: 2, server_time: SERVER_TIME } });

    await list_calendars();

    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1]).toMatchObject({ is_default: true });
  });

  it("seeds with translated names when they are provided", async () => {
    reset_calendar_seeding();
    calendar_sync_engine.reset();
    set_default_calendar_names(["Agenda", "Travail", "Famille"]);
    get
      .mockResolvedValueOnce({ data: { calendars: [], total: 0 } })
      .mockResolvedValue({ data: { calendars: [], total: 2, server_time: SERVER_TIME } });
    post.mockResolvedValue({
      data: { id: "cal-default", success: true, updated_at: MASTER_START },
    });

    await list_calendars();

    expect(post).toHaveBeenCalledTimes(1);
    expect(String(post.mock.calls[0][1].encrypted_blob)).toContain("Agenda");

    set_default_calendar_names([]);
  });
});
