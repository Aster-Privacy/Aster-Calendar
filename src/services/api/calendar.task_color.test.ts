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

vi.mock("./client", () => ({
  api_client: {
    post: (...args: unknown[]) => post(...args),
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
    delete: vi.fn(),
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
  CALENDAR_BLOB_FORMAT_V2: 2,
  CALENDAR_BLOB_FORMAT_V3: 3,
  set_calendar_write_account: () => undefined,
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

const { create_event, list_events, update_event } = await import("./calendar");
const { calendar_sync_engine } =
  await import("@/services/calendar/sync_engine");
const { calendar_mutation_queue } =
  await import("@/services/calendar/mutation_queue");
const { reset_revisions } = await import("@/services/calendar/revision_ledger");
const { clear_calendar_sync_cache } =
  await import("@/services/calendar/sync_store");
const { event_to_draft } = await import("@/services/calendar/calendar_codec");
const { event_color_token, resolve_event_color } =
  await import("@/components/calendar/calendar_utils");

const SERVER_TIME = "2026-11-14T12:00:00.000Z";
const RANGE_START = new Date("2026-11-01T00:00:00.000Z");
const RANGE_END = new Date("2026-11-30T23:59:59.000Z");
const PERSONAL = { id: "cal-personal", color: "#3b82f6" };
const WORK = { id: "cal-work", color: "#14b8a6" };
const CALENDAR_COLORS = new Map([
  [PERSONAL.id, PERSONAL.color],
  [WORK.id, WORK.color],
]);

interface StoredRow {
  calendar_id: string;
  blob: string;
  version: number;
}

interface BatchOperation {
  op: string;
  id?: string;
  event_id?: string;
  calendar_id?: string;
  encrypted_blob: string;
  client_ref?: string;
}

interface WriteBody {
  id?: string;
  calendar_id?: string;
  encrypted_blob?: string;
  client_ref?: string;
  operations?: BatchOperation[];
}

const server = new Map<string, StoredRow>();
let version = 1;

function store(id: string, calendar_id: string | undefined, blob: string) {
  version += 1;
  server.set(id, {
    calendar_id: calendar_id ?? server.get(id)?.calendar_id ?? PERSONAL.id,
    blob,
    version,
  });
}

function install_server() {
  get.mockImplementation(async () => ({
    data: {
      events: [...server.entries()].map(([id, row]) => ({
        id,
        calendar_id: row.calendar_id,
        encrypted_blob: row.blob,
        blob_nonce: "nonce",
        created_at: SERVER_TIME,
        updated_at: SERVER_TIME,
        version: row.version,
      })),
      total: server.size,
      server_time: SERVER_TIME,
    },
  }));
  put.mockImplementation(async (endpoint: string, body: WriteBody) => {
    const id = endpoint.split("/").pop() as string;

    store(id, body.calendar_id, body.encrypted_blob as string);

    return { data: { id, success: true, updated_at: SERVER_TIME, version } };
  });
  post.mockImplementation(async (_endpoint: string, body: WriteBody) => {
    if (!body.operations) {
      const id = body.id as string;

      store(id, body.calendar_id, body.encrypted_blob as string);

      return {
        data: {
          id,
          success: true,
          created_at: SERVER_TIME,
          updated_at: SERVER_TIME,
          version,
          client_ref: body.client_ref,
        },
      };
    }

    const results = body.operations.map((operation) => {
      const id = (
        operation.op === "create" ? operation.id : operation.event_id
      ) as string;

      if (operation.op === "delete") {
        server.delete(id);
      } else {
        store(id, operation.calendar_id, operation.encrypted_blob);
      }

      return {
        event_id: id,
        client_ref: operation.client_ref,
        updated_at: SERVER_TIME,
        version,
      };
    });

    return { data: { results } };
  });
}

function task_draft(
  overrides: Partial<CalendarEventDraft> = {},
): CalendarEventDraft {
  return {
    calendar_id: WORK.id,
    title: "Pay rent",
    description: "",
    location: "",
    starts_at: "2026-11-05T09:00:00.000Z",
    ends_at: "2026-11-05T09:30:00.000Z",
    is_all_day: false,
    status: "confirmed",
    attendees: [],
    tags: [],
    reminder_minutes: null,
    color: null,
    availability: "busy",
    visibility: "default",
    event_kind: "task",
    is_completed: false,
    working_location: null,
    conference_url: "",
    guests_can_modify: false,
    guests_can_invite: true,
    guests_can_see_guests: true,
    recurrence: null,
    recurrence_exceptions: [],
    ...overrides,
  } as CalendarEventDraft;
}

async function reload(): Promise<DecryptedCalendarEvent[]> {
  calendar_sync_engine.reset();
  await calendar_sync_engine.pull_delta();

  return (await list_events(RANGE_START, RANGE_END)).data;
}

function rendered_color(event: DecryptedCalendarEvent): string {
  return resolve_event_color(event, CALENDAR_COLORS.get(event.calendar_id));
}

describe("task color across save and reload", () => {
  beforeEach(async () => {
    server.clear();
    version = 1;
    post.mockReset();
    get.mockReset();
    put.mockReset();
    calendar_mutation_queue.reset();
    reset_revisions();
    await clear_calendar_sync_cache();
    calendar_sync_engine.reset();
    install_server();
  });

  it("renders a new task in the color of the calendar it was saved to", async () => {
    await create_event(task_draft());

    const [task] = await reload();

    expect(task.event_kind).toBe("task");
    expect(task.calendar_id).toBe(WORK.id);
    expect(task.color).toBeNull();
    expect(rendered_color(task)).toBe(event_color_token(WORK.color));
  });

  it("gives a task the same color as an event on the same calendar", async () => {
    await create_event(task_draft({ title: "Task" }));
    await create_event(task_draft({ title: "Meeting", event_kind: "default" }));

    const events = await reload();
    const task = events.find((event) => event.title === "Task");
    const meeting = events.find((event) => event.title === "Meeting");

    expect(task).toBeDefined();
    expect(meeting).toBeDefined();
    expect(rendered_color(task!)).toBe(rendered_color(meeting!));
  });

  it("keeps a picked task color and later edits after reload", async () => {
    await create_event(task_draft({ color: "#ef4444" }));

    const [created] = await reload();

    expect(created.color).toBe("#ef4444");
    expect(rendered_color(created)).toBe(event_color_token("#ef4444"));

    await update_event(created.id, {
      ...event_to_draft(created),
      color: "#a855f7",
    });

    const [edited] = await reload();

    expect(edited.calendar_id).toBe(WORK.id);
    expect(rendered_color(edited)).toBe(event_color_token("#a855f7"));

    await update_event(edited.id, { ...event_to_draft(edited), color: null });

    const [cleared] = await reload();

    expect(cleared.color).toBeNull();
    expect(rendered_color(cleared)).toBe(event_color_token(WORK.color));
  });

  it("repaints a task in its new calendar's color when it moves", async () => {
    await create_event(task_draft({ calendar_id: PERSONAL.id }));

    const [created] = await reload();

    expect(rendered_color(created)).toBe(event_color_token(PERSONAL.color));

    await update_event(created.id, {
      ...event_to_draft(created),
      calendar_id: WORK.id,
    });

    const [moved] = await reload();

    expect(moved.calendar_id).toBe(WORK.id);
    expect(rendered_color(moved)).toBe(event_color_token(WORK.color));
  });
});
