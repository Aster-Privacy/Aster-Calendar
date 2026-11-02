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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
let failing_blobs = new Set<string>();
let bound_blobs = new Map<string, string>();

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/services/calendar/identity_guard", () => ({
  confirm_calendar_identity: async () => true,
  reset_calendar_identity: () => undefined,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: () => "acct-1",
}));

vi.mock("@/services/api/sessions", () => ({
  list_sessions: async () => ({ data: { current_session_id: "sess-own" } }),
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
  encrypt_calendar_payload: async (payload: unknown) => ({
    ciphertext: JSON.stringify(payload),
    nonce: "nonce",
    format: 2,
    bound: true,
  }),
  decrypt_calendar_payload: async (
    record: { ciphertext: string },
    _vault: unknown,
    binding: { event_id?: string; calendar_id: string },
  ) => {
    if (failing_blobs.has(record.ciphertext)) {
      throw new Error("undecryptable");
    }

    const bound_to = bound_blobs.get(record.ciphertext);

    if (bound_to && bound_to !== (binding.event_id ?? binding.calendar_id)) {
      throw new Error("aad mismatch");
    }

    return {
      payload: JSON.parse(record.ciphertext),
      format: record.ciphertext.includes('"legacy"') ? 1 : 2,
      bound: true,
    };
  },
}));

const {
  calendar_sync_engine,
  clear_calendar_sync_state,
  handle_calendar_mutation_frame,
  reset_calendar_session,
} = await import("@/services/calendar/sync_engine");
const { MemorySyncStore, set_sync_store_adapter } =
  await import("@/services/calendar/sync_store");

const ACCOUNT = "acct-1";

function event_blob(title: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    title,
    description: "",
    location: "",
    starts_at: "2026-10-09T09:00:00.000Z",
    ends_at: "2026-10-09T10:00:00.000Z",
    is_all_day: false,
    status: "confirmed",
    attendees: [],
    reminder_minutes: null,
    ...extra,
  });
}

function calendar_blob(name: string) {
  return JSON.stringify({ name, color: "#123456", description: "" });
}

function event_row(id: string, title: string, calendar_id = "cal-1") {
  return {
    id,
    calendar_id,
    encrypted_blob: event_blob(title),
    blob_nonce: `nonce-${id}`,
    created_at: "2026-10-09T08:00:00.000Z",
    updated_at: "2026-10-09T08:00:00.000Z",
    version: 1,
  };
}

function calendar_row(id: string, name: string) {
  return {
    id,
    encrypted_blob: calendar_blob(name),
    blob_nonce: `nonce-${id}`,
    is_visible: true,
    is_default: false,
    created_at: "2026-10-09T08:00:00.000Z",
    updated_at: "2026-10-09T08:00:00.000Z",
    version: 1,
  };
}

function ok<T>(data: T) {
  return { data, error: null, status: 200 };
}

function empty_page() {
  return ok({
    calendars: [],
    events: [],
    total: 0,
    server_time: "2026-10-09T12:00:00.000Z",
    has_more: false,
  });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let store: InstanceType<typeof MemorySyncStore>;

beforeEach(async () => {
  store = new MemorySyncStore();
  failing_blobs = new Set();
  bound_blobs = new Map();
  calendar_sync_engine.set_id_binder((id) => id);
  set_sync_store_adapter(store);
  calendar_sync_engine.reset();
  get.mockReset();
  post.mockReset();
  get.mockResolvedValue(empty_page());
  await calendar_sync_engine.initial_load();
  get.mockClear();
});

afterEach(() => {
  set_sync_store_adapter(null);
});

describe("local mutations", () => {
  it("upserts and remaps an event from its temporary id", async () => {
    await calendar_sync_engine.upsert_event_local(event_row("tmp-1", "Draft"));

    expect(calendar_sync_engine.get_event("tmp-1")?.title).toBe("Draft");

    const saved = {
      ...event_row("evt-1", "Draft"),
      updated_at: "2026-10-09T09:00:00.000Z",
    };

    await calendar_sync_engine.remap_event_local("tmp-1", saved);

    expect(calendar_sync_engine.get_event("tmp-1")).toBeUndefined();
    expect(calendar_sync_engine.get_event("evt-1")).toMatchObject({
      id: "evt-1",
      title: "Draft",
      updated_at: "2026-10-09T09:00:00.000Z",
    });
    expect(calendar_sync_engine.get_event_row("evt-1")).toEqual(saved);
    expect((await store.get_events(ACCOUNT)).map((row) => row.id)).toEqual([
      "evt-1",
    ]);
  });

  it("reads a temporary row sealed to its server id", async () => {
    const row = event_row("local-1", "Moved occurrence");

    bound_blobs.set(row.encrypted_blob, "srv-1");
    calendar_sync_engine.set_id_binder((id) =>
      id === "local-1" ? "srv-1" : id,
    );

    await calendar_sync_engine.upsert_event_local(row);

    expect(calendar_sync_engine.get_event("local-1")).toMatchObject({
      id: "local-1",
      calendar_id: "cal-1",
      title: "Moved occurrence",
    });
    expect(calendar_sync_engine.decrypt_failure_count()).toBe(0);
  });

  it("decodes the saved row when the temporary row was unreadable", async () => {
    const temp = event_row("local-2", "Lost draft");

    failing_blobs.add(temp.encrypted_blob);
    await calendar_sync_engine.upsert_event_local(temp);

    expect(calendar_sync_engine.get_event("local-2")).toBeUndefined();
    expect(calendar_sync_engine.decrypt_failure_count()).toBe(1);

    await calendar_sync_engine.remap_event_local(
      "local-2",
      event_row("srv-2", "Saved draft"),
    );

    expect(calendar_sync_engine.get_event("srv-2")?.title).toBe("Saved draft");
    expect(calendar_sync_engine.decrypt_failure_count()).toBe(0);
  });

  it("removes an event locally and from the cache", async () => {
    await calendar_sync_engine.upsert_event_local(event_row("evt-1", "Gone"));
    await calendar_sync_engine.remove_event_local("evt-1");

    expect(calendar_sync_engine.get_event("evt-1")).toBeUndefined();
    expect(await store.get_events(ACCOUNT)).toEqual([]);
  });

  it("removes a calendar together with its events", async () => {
    await calendar_sync_engine.upsert_calendar_local(
      calendar_row("cal-1", "Work"),
    );
    await calendar_sync_engine.upsert_calendar_local(
      calendar_row("cal-2", "Home"),
    );
    await calendar_sync_engine.upsert_event_local(
      event_row("evt-1", "A", "cal-1"),
    );
    await calendar_sync_engine.upsert_event_local(
      event_row("evt-2", "B", "cal-2"),
    );

    expect(calendar_sync_engine.calendar_count()).toBe(2);

    await calendar_sync_engine.remove_calendar_local("cal-1");

    expect(calendar_sync_engine.get_calendar("cal-1")).toBeUndefined();
    expect(calendar_sync_engine.get_calendar("cal-2")?.name).toBe("Home");
    expect(calendar_sync_engine.get_events().map((event) => event.id)).toEqual([
      "evt-2",
    ]);
    expect((await store.get_calendars(ACCOUNT)).map((row) => row.id)).toEqual([
      "cal-2",
    ]);
    expect((await store.get_events(ACCOUNT)).map((row) => row.id)).toEqual([
      "evt-2",
    ]);
  });

  it("remaps a calendar and moves its events to the new id", async () => {
    await calendar_sync_engine.upsert_calendar_local(
      calendar_row("tmp-cal", "Work"),
    );
    await calendar_sync_engine.upsert_event_local(
      event_row("evt-1", "A", "tmp-cal"),
    );

    await calendar_sync_engine.remap_calendar_local(
      "tmp-cal",
      calendar_row("cal-9", "Work"),
    );

    expect(calendar_sync_engine.get_calendar("tmp-cal")).toBeUndefined();
    expect(calendar_sync_engine.get_calendar("cal-9")?.id).toBe("cal-9");
    expect(calendar_sync_engine.get_event("evt-1")?.calendar_id).toBe("cal-9");
    expect(calendar_sync_engine.get_event_row("evt-1")?.calendar_id).toBe(
      "cal-9",
    );
    expect((await store.get_calendars(ACCOUNT)).map((row) => row.id)).toEqual([
      "cal-9",
    ]);
    expect(
      (await store.get_events(ACCOUNT)).map((row) => row.calendar_id),
    ).toEqual(["cal-9"]);
  });

  it("applies server rows and ignores incomplete or deleted ones", async () => {
    await calendar_sync_engine.apply_server_event(event_row("evt-1", "Server"));
    await calendar_sync_engine.apply_server_calendar(
      calendar_row("cal-1", "Server cal"),
    );
    await calendar_sync_engine.apply_server_event({
      id: "evt-2",
      updated_at: "2026-10-09T08:00:00.000Z",
      deleted: true,
    });
    await calendar_sync_engine.apply_server_calendar({
      id: "cal-2",
      updated_at: "2026-10-09T08:00:00.000Z",
    });

    expect(calendar_sync_engine.get_event("evt-1")?.title).toBe("Server");
    expect(calendar_sync_engine.get_calendar("cal-1")?.name).toBe("Server cal");
    expect(calendar_sync_engine.get_event("evt-2")).toBeUndefined();
    expect(calendar_sync_engine.get_calendar("cal-2")).toBeUndefined();
  });

  it("reads and applies an older server copy only on the conflict path", async () => {
    const { next_revision } =
      await import("@/services/calendar/revision_ledger");
    const server = {
      ...event_row("evt-c", "Server"),
      encrypted_blob: event_blob("Server", { rev_at: 1000 }),
    };
    const server_cal = {
      ...calendar_row("cal-c", "Server cal"),
      encrypted_blob: JSON.stringify({
        name: "Server cal",
        color: "#123456",
        description: "",
        rev_at: 1000,
      }),
    };

    next_revision("event", "evt-c");
    next_revision("calendar", "cal-c");

    expect(await calendar_sync_engine.read_server_event(server)).toBeNull();
    expect(
      (await calendar_sync_engine.read_server_event(server, true))?.title,
    ).toBe("Server");
    expect(
      await calendar_sync_engine.read_server_calendar(server_cal),
    ).toBeNull();
    expect(
      (await calendar_sync_engine.read_server_calendar(server_cal, true))?.name,
    ).toBe("Server cal");

    await calendar_sync_engine.apply_server_event(server);
    expect(calendar_sync_engine.get_event("evt-c")).toBeUndefined();

    await calendar_sync_engine.apply_server_event(server, true);
    await calendar_sync_engine.apply_server_calendar(server_cal, true);
    expect(calendar_sync_engine.get_event("evt-c")?.title).toBe("Server");
    expect(calendar_sync_engine.get_calendar("cal-c")?.name).toBe("Server cal");

    await calendar_sync_engine.apply_server_event({ ...server, version: 2 });
    expect(calendar_sync_engine.get_event("evt-c")?.title).toBe("Server");
  });

  it("refuses a conflict copy older than the confirmed server revision", async () => {
    const { observe_revision } =
      await import("@/services/calendar/revision_ledger");
    const server = {
      ...event_row("evt-old", "Old"),
      encrypted_blob: event_blob("Old", { rev_at: 1000 }),
    };
    const server_cal = {
      ...calendar_row("cal-old", "Old cal"),
      encrypted_blob: JSON.stringify({
        name: "Old cal",
        color: "#123456",
        description: "",
        rev_at: 1000,
      }),
    };

    observe_revision("event", "evt-old", 5000);
    observe_revision("calendar", "cal-old", 5000);

    await calendar_sync_engine.apply_server_event(server, true);
    await calendar_sync_engine.apply_server_calendar(server_cal, true);

    expect(calendar_sync_engine.get_event("evt-old")).toBeUndefined();
    expect(calendar_sync_engine.get_calendar("cal-old")).toBeUndefined();
  });

  it("notifies subscribers and survives a throwing listener", async () => {
    const good = vi.fn();
    const bad = vi.fn(() => {
      throw new Error("listener failed");
    });
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const unsubscribe_bad = calendar_sync_engine.subscribe(bad);
    const unsubscribe_good = calendar_sync_engine.subscribe(good);

    calendar_sync_engine.notify();

    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);

    unsubscribe_bad();
    calendar_sync_engine.notify();

    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(2);

    unsubscribe_good();
    warn.mockRestore();
  });

  it("broadcasts to other tabs without throwing", () => {
    expect(() => calendar_sync_engine.broadcast_cross_tab()).not.toThrow();
  });
});

describe("decrypt failures and legacy rows", () => {
  it("tracks rows that fail to decrypt and retries them later", async () => {
    failing_blobs.add(event_blob("Locked"));
    failing_blobs.add(calendar_blob("Locked cal"));

    await calendar_sync_engine.upsert_event_local(event_row("evt-1", "Locked"));
    await calendar_sync_engine.upsert_calendar_local(
      calendar_row("cal-1", "Locked cal"),
    );

    expect(calendar_sync_engine.decrypt_failure_count()).toBe(2);
    expect(calendar_sync_engine.get_event("evt-1")).toBeUndefined();

    failing_blobs.clear();

    expect(await calendar_sync_engine.retry_failed_decrypts()).toBe(0);
    expect(calendar_sync_engine.get_event("evt-1")?.title).toBe("Locked");
    expect(calendar_sync_engine.get_calendar("cal-1")?.name).toBe("Locked cal");
  });

  it("forgets failures for rows that were removed before the retry", async () => {
    failing_blobs.add(event_blob("Locked"));
    await calendar_sync_engine.upsert_event_local(event_row("evt-1", "Locked"));
    await calendar_sync_engine.remove_event_local("evt-1");

    expect(await calendar_sync_engine.retry_failed_decrypts()).toBe(0);
  });

  it("lists rows stored in the legacy blob format", async () => {
    await calendar_sync_engine.upsert_event_local({
      ...event_row("evt-old", "Old"),
      encrypted_blob: event_blob("Old", { legacy: true }),
    });
    await calendar_sync_engine.upsert_event_local(event_row("evt-new", "New"));

    expect(
      calendar_sync_engine.legacy_event_rows().map((row) => row.id),
    ).toEqual(["evt-old"]);
    expect(calendar_sync_engine.legacy_calendar_rows()).toEqual([]);
  });
});

describe("own echoes and clearing", () => {
  it("skips frames whose ids were just written by this tab", async () => {
    calendar_sync_engine.note_own_ids(["evt-1", ""]);
    calendar_sync_engine.note_own_ids([]);

    await handle_calendar_mutation_frame({
      type: "calendar_mutation",
      action: "update",
      ids: ["evt-1"],
      origin_device: null,
    });
    await wait(400);

    expect(get).not.toHaveBeenCalled();

    await handle_calendar_mutation_frame({
      type: "calendar_mutation",
      action: "update",
      ids: ["evt-2"],
      origin_device: null,
    });
    await wait(400);

    expect(get).toHaveBeenCalled();
  });

  it("ignores frames of another type", async () => {
    await handle_calendar_mutation_frame({ type: "other" } as never);
    await wait(400);

    expect(get).not.toHaveBeenCalled();
  });

  it("clears only the named account when it is not the active one", async () => {
    await store.apply_page("acct-2", { events: [event_row("evt-x", "Other")] });
    await calendar_sync_engine.upsert_event_local(event_row("evt-1", "Mine"));

    await clear_calendar_sync_state("acct-2");

    expect(await store.get_events("acct-2")).toEqual([]);
    expect(calendar_sync_engine.get_event("evt-1")?.title).toBe("Mine");
  });

  it("clears the active account, the cache, and resets the engine", async () => {
    await calendar_sync_engine.upsert_event_local(event_row("evt-1", "Mine"));

    expect(calendar_sync_engine.is_loaded()).toBe(true);

    await clear_calendar_sync_state();

    expect(calendar_sync_engine.get_events()).toEqual([]);
    expect(calendar_sync_engine.is_loaded()).toBe(false);
    expect(calendar_sync_engine.current_account_id()).toBeNull();
    expect(await store.get_events(ACCOUNT)).toEqual([]);
  });

  it("keeps the stored account data when the session resets for a switch", async () => {
    await calendar_sync_engine.upsert_event_local(event_row("evt-1", "Mine"));

    await reset_calendar_session();

    expect(calendar_sync_engine.get_events()).toEqual([]);
    expect(calendar_sync_engine.current_account_id()).toBeNull();
    expect((await store.get_events(ACCOUNT)).map((row) => row.id)).toEqual([
      "evt-1",
    ]);
  });
});
