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
import type { CachedEventRow } from "@/services/calendar/sync_store";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MemorySyncStore,
  clear_calendar_sync_cache,
  clear_sync_account,
  get_sync_store,
  read_cached_calendars,
  read_cached_events,
  read_queue,
  read_sync_meta,
  remove_queue_record,
  set_sync_store_adapter,
  write_queue_record,
  write_sync_page,
} from "@/services/calendar/sync_store";

interface FakeRange {
  lower: string;
  upper: string;
}

interface FakeRequest<T> {
  result: T;
  error: Error | null;
  onsuccess: null | (() => void);
  onerror: null | (() => void);
  onupgradeneeded: null | (() => void);
  onblocked: null | (() => void);
}

function is_range(key: unknown): key is FakeRange {
  return typeof key === "object" && key !== null && "lower" in key;
}

function in_range(key: string, range: FakeRange): boolean {
  return key >= range.lower && key <= range.upper;
}

function request<T>(result: T): FakeRequest<T> {
  const req: FakeRequest<T> = {
    result,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    onblocked: null,
  };

  queueMicrotask(() => req.onsuccess?.());

  return req;
}

class FakeStore {
  readonly rows = new Map<string, unknown>();

  put(value: unknown, key: string) {
    this.rows.set(key, value);

    return request(key);
  }

  get(key: string) {
    return request(this.rows.get(key));
  }

  getAll(range?: FakeRange) {
    const values = Array.from(this.rows.entries())
      .filter(([key]) => !range || in_range(key, range))
      .map(([, value]) => value);

    return request(values);
  }

  delete(key: string | FakeRange) {
    if (is_range(key)) {
      for (const existing of Array.from(this.rows.keys())) {
        if (in_range(existing, key)) this.rows.delete(existing);
      }
    } else {
      this.rows.delete(key);
    }

    return request(undefined);
  }

  clear() {
    this.rows.clear();

    return request(undefined);
  }
}

class FakeDatabase {
  readonly stores = new Map<string, FakeStore>();
  onversionchange: null | (() => void) = null;
  closed = false;

  get objectStoreNames() {
    return { contains: (name: string) => this.stores.has(name) };
  }

  createObjectStore(name: string) {
    const store = new FakeStore();

    this.stores.set(name, store);

    return store;
  }

  transaction(names: string | string[]) {
    const transaction = {
      error: null as Error | null,
      oncomplete: null as null | (() => void),
      onerror: null as null | (() => void),
      onabort: null as null | (() => void),
      objectStore: (name: string) => {
        const store = this.stores.get(name);

        if (!store || !(Array.isArray(names) ? names : [names]).includes(name)) {
          throw new Error(`unknown store ${name}`);
        }

        return store;
      },
    };

    setTimeout(() => transaction.oncomplete?.(), 0);

    return transaction;
  }

  close() {
    this.closed = true;
  }
}

let database: FakeDatabase;
let open_mode: "ok" | "error" | "blocked";
let open_calls: number;

const original_open = indexedDB.open;

function fake_open() {
  const req: FakeRequest<FakeDatabase> = {
    result: database,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    onblocked: null,
  };

  open_calls += 1;
  setTimeout(() => {
    if (open_mode === "error") {
      req.error = new Error("quota");
      req.onerror?.();

      return;
    }
    if (open_mode === "blocked") {
      req.onblocked?.();

      return;
    }
    req.onupgradeneeded?.();
    req.onsuccess?.();
  }, 0);

  return req as unknown as IDBOpenDBRequest;
}

function install_fake_indexeddb() {
  database = new FakeDatabase();
  open_mode = "ok";
  open_calls = 0;
  vi.stubGlobal("IDBKeyRange", {
    bound: (lower: string, upper: string): FakeRange => ({ lower, upper }),
  });
  indexedDB.open = fake_open as typeof indexedDB.open;
}

function event_row(id: string): CachedEventRow {
  return {
    id,
    calendar_id: "cal-1",
    encrypted_blob: `blob-${id}`,
    blob_nonce: `nonce-${id}`,
    version: 1,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  install_fake_indexeddb();
  set_sync_store_adapter(null);
});

afterEach(() => {
  set_sync_store_adapter(null);
  indexedDB.open = original_open;
  vi.unstubAllGlobals();
});

describe("IndexedDbSyncStore", () => {
  it("is chosen when the browser offers indexeddb and opens the database once", async () => {
    const adapter = get_sync_store();

    expect(adapter).not.toBeInstanceOf(MemorySyncStore);

    await read_cached_events("a");
    await read_cached_calendars("a");

    expect(open_calls).toBe(1);
    expect(database.stores.has("events")).toBe(true);
    expect(database.stores.has("calendars")).toBe(true);
    expect(database.stores.has("meta")).toBe(true);
    expect(database.stores.has("queue")).toBe(true);
  });

  it("stores pages per account and merges meta", async () => {
    expect(
      await write_sync_page("a", {
        events: [event_row("e1"), event_row("e2")],
        calendars: [
          {
            id: "c1",
            encrypted_blob: "b",
            blob_nonce: "n",
            is_visible: true,
            is_default: true,
            version: 1,
            updated_at: "2026-10-01T00:00:00.000Z",
          },
        ],
        meta: { events_cursor: { server_time: "t1", cursor_id: null } },
      }),
    ).toBe(true);
    expect(await write_sync_page("b", { events: [event_row("e9")] })).toBe(true);
    expect(
      await write_sync_page("a", {
        event_deletes: ["e1"],
        calendar_deletes: ["c1"],
        meta: { calendars_cursor: { server_time: "t2", cursor_id: "c" } },
      }),
    ).toBe(true);

    expect((await read_cached_events("a")).map((row) => row.id)).toEqual(["e2"]);
    expect((await read_cached_events("b")).map((row) => row.id)).toEqual(["e9"]);
    expect(await read_cached_calendars("a")).toEqual([]);
    expect(await read_sync_meta("a")).toEqual({
      events_cursor: { server_time: "t1", cursor_id: null },
      calendars_cursor: { server_time: "t2", cursor_id: "c" },
    });
    expect(await read_sync_meta("b")).toEqual({});
  });

  it("keeps the queue ordered and clears accounts independently", async () => {
    await write_queue_record("a", { id: "q2", seq: 2, payload: "two" });
    await write_queue_record("a", { id: "q1", seq: 1, payload: "one" });
    await write_queue_record("b", { id: "q3", seq: 3, payload: "three" });
    await write_sync_page("a", {
      events: [event_row("e1")],
      meta: { events_cursor: { server_time: "t", cursor_id: null } },
    });

    expect((await read_queue("a")).map((record) => record.id)).toEqual(["q1", "q2"]);

    expect(await remove_queue_record("a", "q1")).toBe(true);
    expect((await read_queue("a")).map((record) => record.id)).toEqual(["q2"]);

    expect(await clear_sync_account("a")).toBe(true);
    expect(await read_queue("a")).toEqual([]);
    expect(await read_cached_events("a")).toEqual([]);
    expect(await read_sync_meta("a")).toEqual({});
    expect((await read_queue("b")).map((record) => record.id)).toEqual(["q3"]);

    expect(await clear_calendar_sync_cache()).toBe(true);
    expect(await read_queue("b")).toEqual([]);
  });

  it("reopens after the browser asks it to close", async () => {
    await read_cached_events("a");
    database.onversionchange?.();

    expect(database.closed).toBe(true);

    await read_cached_events("a");

    expect(open_calls).toBe(2);
  });

  it("falls back to memory for the session when the database cannot open", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});

    open_mode = "error";

    expect(await read_cached_events("a")).toEqual([]);
    expect(get_sync_store()).toBeInstanceOf(MemorySyncStore);

    await write_sync_page("a", { events: [event_row("e1")] });

    expect((await read_cached_events("a")).map((row) => row.id)).toEqual(["e1"]);

    warn.mockRestore();
  });

  it("treats a blocked open as a failure", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});

    open_mode = "blocked";

    expect(await write_queue_record("a", { id: "q", seq: 0, payload: 0 })).toBe(false);
    expect(get_sync_store()).toBeInstanceOf(MemorySyncStore);

    warn.mockRestore();
  });
});
