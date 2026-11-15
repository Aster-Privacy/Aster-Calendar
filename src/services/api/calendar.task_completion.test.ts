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
  RecurrenceEditScope,
  RecurrenceRule,
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

const { list_event_masters, update_event, update_event_occurrence } =
  await import("./calendar");
const { calendar_sync_engine } = await import("@/services/calendar/sync_engine");
const { calendar_mutation_queue } = await import(
  "@/services/calendar/mutation_queue"
);
const { reset_revisions } = await import(
  "@/services/calendar/revision_ledger"
);
const { clear_calendar_sync_cache } = await import(
  "@/services/calendar/sync_store"
);
const { blob_to_event, event_to_draft } = await import(
  "@/services/calendar/calendar_codec"
);
const { expand_events } = await import("@/services/calendar/recurrence");

const SERVER_TIME = "2026-11-14T12:00:00.000Z";
const RANGE_START = new Date("2026-11-01T00:00:00.000Z");
const RANGE_END = new Date("2026-11-30T23:59:59.000Z");
const DAILY: RecurrenceRule = {
  frequency: "daily",
  interval: 1,
  by_weekday: [],
  count: 5,
  until: null,
};

interface StoredRow {
  calendar_id: string;
  blob: Record<string, unknown>;
  version: number;
}

const server = new Map<string, StoredRow>();
let version = 1;

function base_event(
  timed: boolean,
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  return {
    id: "task-1",
    calendar_id: "cal-1",
    title: "Water plants",
    description: "",
    location: "",
    starts_at: timed
      ? "2026-11-02T09:00:00.000Z"
      : new Date(2026, 10, 2).toISOString(),
    ends_at: timed
      ? "2026-11-02T09:30:00.000Z"
      : new Date(2026, 10, 2, 23, 59, 59, 999).toISOString(),
    is_all_day: !timed,
    status: "confirmed",
    attendees: [],
    tags: [],
    reminder_minutes: null,
    color: null,
    availability: "free",
    visibility: "default",
    event_kind: "task",
    is_completed: false,
    working_location: null,
    conference_url: "",
    guests_can_modify: false,
    guests_can_invite: true,
    guests_can_see_guests: true,
    recurrence: { ...DAILY },
    recurrence_exceptions: [],
    recurrence_master_id: null,
    occurrence_start: null,
    uid: "task-uid@aster.calendar",
    recurrence_id: null,
    created_at: SERVER_TIME,
    updated_at: SERVER_TIME,
    ...overrides,
  };
}

function store_event(event: DecryptedCalendarEvent): void {
  const {
    id,
    calendar_id,
    created_at: _created_at,
    updated_at: _updated_at,
    recurrence_master_id: _master,
    occurrence_start: _start,
    ...blob
  } = event;

  version += 1;
  server.set(id, {
    calendar_id,
    blob: blob as Record<string, unknown>,
    version,
  });
}

function server_rows() {
  return [...server.entries()].map(([id, row]) => ({
    id,
    calendar_id: row.calendar_id,
    encrypted_blob: JSON.stringify(row.blob),
    blob_nonce: "nonce",
    created_at: SERVER_TIME,
    updated_at: SERVER_TIME,
    version: row.version,
  }));
}

function stored_events(): DecryptedCalendarEvent[] {
  return [...server.entries()].map(([id, row]) =>
    blob_to_event(
      row.blob as unknown as Parameters<typeof blob_to_event>[0],
      id,
      row.calendar_id,
      SERVER_TIME,
    ),
  );
}

function visible(): DecryptedCalendarEvent[] {
  return expand_events(stored_events(), RANGE_START, RANGE_END).filter(
    (event) => !event.trashed_at,
  );
}

function day_of(event: DecryptedCalendarEvent): string {
  const start = new Date(event.starts_at);
  const month = String(start.getMonth() + 1).padStart(2, "0");
  const date = String(start.getDate()).padStart(2, "0");

  return `${start.getFullYear()}-${month}-${date}`;
}

function completed_days(): string[] {
  return visible()
    .filter((event) => event.is_completed)
    .map(day_of)
    .sort();
}

function shown_days(): string[] {
  return visible().map(day_of).sort();
}

function occurrence_on(day: string): DecryptedCalendarEvent {
  const found = visible().find((event) => day_of(event) === day);

  if (!found) {
    throw new Error(`no occurrence on ${day}`);
  }

  return found;
}

async function sync_from_server(): Promise<void> {
  calendar_sync_engine.reset();
  await list_event_masters(RANGE_START, RANGE_END);
}

function install_server(): void {
  get.mockImplementation(async () => ({
    data: {
      events: server_rows(),
      total: server.size,
      server_time: SERVER_TIME,
    },
  }));
  put.mockImplementation(
    async (endpoint: string, body: { encrypted_blob: string }) => {
      const id = endpoint.split("/").pop() as string;
      const existing = server.get(id);

      version += 1;
      server.set(id, {
        calendar_id: existing?.calendar_id ?? "cal-1",
        blob: JSON.parse(body.encrypted_blob),
        version,
      });

      return { data: { id, success: true, updated_at: SERVER_TIME, version } };
    },
  );
  post.mockImplementation(
    async (
      _endpoint: string,
      body: {
        operations: Array<{
          op: string;
          id?: string;
          event_id?: string;
          client_ref?: string;
          calendar_id?: string;
          encrypted_blob?: string;
        }>;
      },
    ) => {
      const results = body.operations.map((operation) => {
        const id = (
          operation.op === "create" ? operation.id : operation.event_id
        ) as string;

        version += 1;
        if (operation.op === "delete") {
          server.delete(id);
        } else {
          server.set(id, {
            calendar_id: operation.calendar_id ?? "cal-1",
            blob: JSON.parse(operation.encrypted_blob as string),
            version,
          });
        }

        return {
          event_id: id,
          client_ref: operation.client_ref,
          updated_at: SERVER_TIME,
          version,
        };
      });

      return { data: { results } };
    },
  );
}

function has_recurrence(event: DecryptedCalendarEvent): boolean {
  return event.recurrence !== null || event.recurrence_master_id !== null;
}

async function toggle_done(event: DecryptedCalendarEvent): Promise<void> {
  await update_event_occurrence(
    event,
    { ...event_to_draft(event), is_completed: !event.is_completed },
    "single",
  );
  await sync_from_server();
}

async function save_form(
  event: DecryptedCalendarEvent,
  changes: Partial<CalendarEventDraft>,
  scope: RecurrenceEditScope = "single",
): Promise<void> {
  const draft: CalendarEventDraft = {
    ...event_to_draft(event),
    is_completed: event.is_completed === true,
    ...changes,
    uid: event.uid ?? null,
    recurrence_id: event.recurrence_id ?? null,
  };

  if (has_recurrence(event)) {
    await update_event_occurrence(event, draft, scope);
  } else {
    await update_event(event.id, draft);
  }
  await sync_from_server();
}

function shifted(event: DecryptedCalendarEvent, minutes: number) {
  const delta = minutes * 60_000;

  return {
    starts_at: new Date(Date.parse(event.starts_at) + delta).toISOString(),
    ends_at: new Date(Date.parse(event.ends_at) + delta).toISOString(),
  };
}

const EDITS: Array<{
  name: string;
  changes: (event: DecryptedCalendarEvent) => Partial<CalendarEventDraft>;
}> = [
  { name: "title", changes: () => ({ title: "Water all plants" }) },
  { name: "time", changes: (event) => shifted(event, 60) },
  { name: "color", changes: () => ({ color: "#ef4444" }) },
  {
    name: "rule",
    changes: () => ({ recurrence: { ...DAILY, count: 7 } }),
  },
];

const SCOPES: RecurrenceEditScope[] = ["single", "following", "series"];

beforeEach(async () => {
  post.mockReset();
  get.mockReset();
  put.mockReset();
  del.mockReset();
  server.clear();
  calendar_mutation_queue.reset();
  calendar_sync_engine.reset();
  reset_revisions();
  await clear_calendar_sync_cache();
  install_server();
});

describe.each([
  { label: "with a due time", timed: true },
  { label: "without a due time", timed: false },
])("recurring task completion $label", ({ timed }) => {
  async function seed_series(): Promise<void> {
    store_event(base_event(timed));
    await sync_from_server();
  }

  it("checkbox on the first occurrence completes only that day", async () => {
    await seed_series();
    await toggle_done(occurrence_on("2026-11-02"));

    expect(completed_days()).toEqual(["2026-11-02"]);
    expect(shown_days()).toHaveLength(5);
  });

  it("checkbox on a middle occurrence completes only that day", async () => {
    await seed_series();
    await toggle_done(occurrence_on("2026-11-04"));

    expect(completed_days()).toEqual(["2026-11-04"]);
    expect(shown_days()).toHaveLength(5);
  });

  it("checkbox twice leaves nothing completed", async () => {
    await seed_series();
    await toggle_done(occurrence_on("2026-11-04"));
    await toggle_done(occurrence_on("2026-11-04"));

    expect(completed_days()).toEqual([]);
  });

  for (const day of ["2026-11-02", "2026-11-04"]) {
    for (const edit of EDITS) {
      it(`editing the completed ${day} occurrence ${edit.name} keeps completion on that day`, async () => {
        await seed_series();
        await toggle_done(occurrence_on(day));
        const done = occurrence_on(day);

        await save_form(done, edit.changes(done));

        expect(completed_days()).toEqual([day]);
      });
    }

    for (const scope of SCOPES) {
      for (const edit of EDITS) {
        it(`completed ${day}, then a ${scope} edit of another occurrence ${edit.name} does not spread completion`, async () => {
          await seed_series();
          await toggle_done(occurrence_on(day));
          const other = occurrence_on(
            day === "2026-11-02" ? "2026-11-03" : "2026-11-05",
          );

          await save_form(other, edit.changes(other), scope);

          const done = completed_days();

          expect(done.length).toBeLessThanOrEqual(1);
          expect(done.every((value) => value === day)).toBe(true);
        });
      }
    }

    it(`completed ${day}, then giving that occurrence its own repeat rule completes only that day`, async () => {
      await seed_series();
      await toggle_done(occurrence_on(day));
      const done = occurrence_on(day);

      await save_form(done, { recurrence: { ...DAILY, count: 3 } });

      expect(completed_days()).toEqual([day]);
    });
  }

  it("completing a one-off task and then making it repeat completes only the first day", async () => {
    store_event(base_event(timed, { recurrence: null, uid: null }));
    await sync_from_server();
    await toggle_done(occurrence_on("2026-11-02"));
    const done = occurrence_on("2026-11-02");

    expect(done.is_completed).toBe(true);

    await save_form(done, { recurrence: { ...DAILY } });

    expect(shown_days()).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ]);
    expect(completed_days()).toEqual(["2026-11-02"]);
  });

  it("a task made to repeat after completion can be reopened and its other days completed one by one", async () => {
    store_event(base_event(timed, { recurrence: null, uid: null }));
    await sync_from_server();
    await toggle_done(occurrence_on("2026-11-02"));
    await save_form(occurrence_on("2026-11-02"), { recurrence: { ...DAILY } });

    await toggle_done(occurrence_on("2026-11-02"));
    expect(completed_days()).toEqual([]);

    await toggle_done(occurrence_on("2026-11-05"));
    expect(completed_days()).toEqual(["2026-11-05"]);
  });

  it("checking off an unexpanded series completes only its first day and leaves the series open", async () => {
    await seed_series();
    const master = stored_events()[0];

    await toggle_done(master);

    expect(completed_days()).toEqual(["2026-11-02"]);
    expect(stored_events().find((event) => event.id === "task-1")).toMatchObject(
      { is_completed: false },
    );
  });

  it("a series already saved as complete shows only its first day completed", async () => {
    store_event(base_event(timed, { is_completed: true }));
    await sync_from_server();

    expect(completed_days()).toEqual(["2026-11-02"]);
  });

  for (const scope of SCOPES) {
    it(`a ${scope} edit of a series already saved as complete does not complete later days`, async () => {
      store_event(base_event(timed, { is_completed: true }));
      await sync_from_server();
      const target = occurrence_on("2026-11-04");

      await save_form(target, { title: "Water all plants" }, scope);

      expect(
        completed_days().every((value) => value === "2026-11-02"),
      ).toBe(true);
    });
  }
});
