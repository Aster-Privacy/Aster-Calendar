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
import { describe, it, expect, vi, beforeEach } from "vitest";

interface FakeRow {
  id: string;
  encrypted_blob: string;
  blob_nonce: string;
  is_visible: boolean;
  is_default: boolean;
  version: number;
  updated_at: string;
}

const state = vi.hoisted(() => ({
  unreadable: [] as FakeRow[],
  after_refresh: null as FakeRow[] | null,
  verified: true,
  vault: { identity_key: "vault" } as unknown,
  write_base: {} as unknown,
  has_pq: true,
  has_write: true,
  read_ids: new Set<string>(),
  submit_ok: true,
  submitted: [] as Array<Record<string, unknown>>,
  calendar_count: 0,
  seeded: 0,
}));

vi.mock("./client", () => ({
  api_client: {
    get: vi.fn(async () => ({ data: { calendars: [], total: 1 } })),
    post: vi.fn(async (_url: string, body: Record<string, unknown>) => {
      if (body.is_default === true) state.seeded += 1;

      return { data: { calendar: {} } };
    }),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock("@/services/calendar/sync_engine", () => ({
  CALENDARS_ENDPOINT: "/calendar/v1/calendars",
  subscribe_calendar_sync: () => () => undefined,
  calendar_sync_engine: {
    ensure_loaded: async () => undefined,
    pull_delta: async () => true,
    unreadable_calendar_rows: () => state.unreadable,
    refresh_unreadable_calendars: async () => {
      if (state.after_refresh) state.unreadable = state.after_refresh;

      return state.verified;
    },
    calendar_count: () => state.calendar_count,
    get_calendars: () => [],
    write_floor: () => 0,
  },
}));

vi.mock("@/services/calendar/mutation_queue", () => ({
  calendar_mutation_queue: {
    submit: async (op: Record<string, unknown>) => {
      state.submitted.push(op);

      return {
        ok: op.kind === "calendar_delete" ? state.submit_ok : true,
        queued: false,
        id_map: {},
        acks: {},
      };
    },
  },
  calendar_row_version: () => 4,
  event_row_version: () => 1,
  generate_temp_id: () => "temp-1",
}));

vi.mock("@/services/calendar/calendar_codec", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/calendar/calendar_codec")>();

  return {
    ...actual,
    require_vault: () => state.vault,
    encrypt_calendar_blob: async () => ({
      ciphertext: "c",
      nonce: "n",
      format: 3,
    }),
  };
});

vi.mock("@/services/calendar/calendar_crypto_v3", () => ({
  CALENDAR_V3_CONTEXT: "astermail-calendar-v2",
  calendar_v3_keyring: async () => ({
    has_pq: state.has_pq,
    write: state.has_write ? { id: "current", key: {} } : null,
    read: new Map(
      [...state.read_ids].map((id) => [id, { id, key: {} }] as const),
    ),
  }),
  v3_blob_key_id: (blob: string) =>
    blob.startsWith("v3:") ? blob.slice(3) : null,
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  get_account_data_write_base_key: () => state.write_base,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => state.vault,
  on_keys_ready: () => () => undefined,
  wait_for_account_key_load: async () => undefined,
}));

const { remove_unreadable_calendars } = await import("./calendar");

function row(id: string, blob: string): FakeRow {
  return {
    id,
    encrypted_blob: blob,
    blob_nonce: "n",
    is_visible: true,
    is_default: false,
    version: 4,
    updated_at: "2026-11-10T00:00:00Z",
  };
}

function deletes(): string[] {
  return state.submitted
    .filter((op) => op.kind === "calendar_delete")
    .map((op) => op.calendar_id as string);
}

describe("remove_unreadable_calendars", () => {
  beforeEach(() => {
    state.unreadable = [];
    state.after_refresh = null;
    state.verified = true;
    state.vault = { identity_key: "vault" };
    state.write_base = {};
    state.has_pq = true;
    state.has_write = true;
    state.read_ids = new Set(["current"]);
    state.submit_ok = true;
    state.submitted = [];
    state.calendar_count = 0;
    state.seeded = 0;
  });

  it("does nothing when every calendar opens", async () => {
    const result = await remove_unreadable_calendars();

    expect(result).toEqual({ outcome: "nothing_to_remove", removed: 0 });
    expect(state.submitted).toEqual([]);
  });

  it("removes calendars whose key is gone and recreates a default", async () => {
    state.unreadable = [
      row("cal-a", "v3:lost"),
      row("cal-b", "v3:lost"),
      row("cal-c", "v3:lost"),
    ];

    const result = await remove_unreadable_calendars();

    expect(result).toEqual({ outcome: "removed", removed: 3 });
    expect(deletes()).toEqual(["cal-a", "cal-b", "cal-c"]);
    expect(
      state.submitted.find((op) => op.kind === "calendar_delete"),
    ).toMatchObject({ expected_version: 4 });
    expect(state.seeded).toBe(1);
  });

  it("keeps calendars that open after the vault refresh", async () => {
    state.unreadable = [row("cal-a", "v3:lost"), row("cal-b", "v3:lost")];
    state.after_refresh = [row("cal-b", "v3:lost")];

    const result = await remove_unreadable_calendars();

    expect(result).toEqual({ outcome: "opened", removed: 0 });
    expect(deletes()).toEqual([]);
  });

  it("never removes when the vault could not be verified", async () => {
    state.unreadable = [row("cal-a", "v3:lost")];
    state.verified = false;

    const result = await remove_unreadable_calendars();

    expect(result.outcome).toBe("keys_unavailable");
    expect(deletes()).toEqual([]);
  });

  it("never removes when the account key is not loaded", async () => {
    state.unreadable = [row("cal-a", "v3:lost")];
    state.write_base = null;

    const result = await remove_unreadable_calendars();

    expect(result.outcome).toBe("keys_unavailable");
    expect(deletes()).toEqual([]);
  });

  it("never removes when the vault has no PQ identity", async () => {
    state.unreadable = [row("cal-a", "v3:lost")];
    state.has_pq = false;

    const result = await remove_unreadable_calendars();

    expect(result.outcome).toBe("keys_unavailable");
    expect(deletes()).toEqual([]);
  });

  it("keeps rows whose key is still in the keyring", async () => {
    state.unreadable = [row("cal-a", "v3:current"), row("cal-b", "v3:lost")];

    const result = await remove_unreadable_calendars();

    expect(result).toEqual({ outcome: "removed", removed: 1 });
    expect(deletes()).toEqual(["cal-b"]);
  });

  it("keeps rows that are not v3 blobs", async () => {
    state.unreadable = [row("cal-a", "legacy")];

    const result = await remove_unreadable_calendars();

    expect(result.outcome).toBe("keys_unavailable");
    expect(deletes()).toEqual([]);
  });

  it("reports a failure when the server rejects the delete", async () => {
    state.unreadable = [row("cal-a", "v3:lost")];
    state.submit_ok = false;

    const result = await remove_unreadable_calendars();

    expect(result).toEqual({ outcome: "failed", removed: 0 });
    expect(state.seeded).toBe(0);
  });
});
