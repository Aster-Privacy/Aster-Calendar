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
import type { EncryptedVault } from "./key_manager";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  capabilities: { data: { format_writes: true } } as unknown,
  capability_fetches: 0,
  posted: [] as Array<Record<string, unknown>>,
  on_wait: null as null | (() => Promise<void>),
  waits: 0,
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async (url: string) => {
      if (url === "/crypto/v1/keys/account-key/capabilities") {
        h.capability_fetches++;
        if (h.capabilities instanceof Error) throw h.capabilities;

        return h.capabilities;
      }

      return { error: "not found", code: "NOT_FOUND" };
    }),
    post: vi.fn(async (_url: string, body: Record<string, unknown>) => {
      h.posted.push(body);

      return { data: { id: "draft-1", version: 1 } };
    }),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/services/crypto/memory_key_store", async (import_original) => ({
  ...(await import_original<object>()),
  wait_for_account_key_load: vi.fn(async () => {
    h.waits++;
    if (h.on_wait) await h.on_wait();
  }),
}));

import {
  AccountKeyUnavailableError,
  account_data_write_key,
  account_data_write_key_strict,
  retry_after_account_key_load,
} from "./account_data_writer";
import { derive_account_data_key_raw } from "./account_data_key";
import {
  clear_account_data_write_keys,
  clear_account_key_derived_keks,
  get_account_data_write_key,
  get_account_key_generation,
  get_account_write_epoch,
  load_account_key_derived_keks_into_memory,
} from "./legacy_keks";
import { base64_to_array } from "./envelope";

import { reset_account_key_capabilities_cache } from "@/services/api/account_key";
import {
  derive_preferences_key_raw,
  prepare_preferences_payload,
  DEFAULT_PREFERENCES,
} from "@/services/api/preferences";

const ACCOUNT_KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const OTHER_ACCOUNT_KEY = Uint8Array.from({ length: 32 }, (_, i) => 200 - i);

const vault = { identity_key: "armored identity key" } as EncryptedVault;

async function import_aes(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "decrypt",
  ]);
}

async function opens_with(
  raw: Uint8Array,
  encrypted: string,
  nonce: string,
): Promise<string | null> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(nonce) },
      await import_aes(raw),
      base64_to_array(encrypted),
    );

    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

async function load_current(account_key = ACCOUNT_KEY): Promise<boolean> {
  return load_account_key_derived_keks_into_memory(
    account_key,
    get_account_key_generation(),
    get_account_write_epoch(),
  );
}

beforeEach(() => {
  reset_account_key_capabilities_cache();
  clear_account_key_derived_keks();
  h.capabilities = { data: { format_writes: true } };
  h.capability_fetches = 0;
  h.posted = [];
  h.on_wait = null;
  h.waits = 0;
});

afterEach(() => {
  clear_account_key_derived_keks();
});

describe("account data write keys", () => {
  it("are empty before the account key loads", () => {
    expect(get_account_data_write_key("astermail-preferences-v1")).toBeNull();
  });

  it("are set by a load for the current epoch", async () => {
    expect(await load_current()).toBe(true);
    expect(
      get_account_data_write_key("astermail-preferences-v1"),
    ).not.toBeNull();
    expect(get_account_data_write_key("astermail-draft-v2")).not.toBeNull();
  });

  it("are not set by a load without an epoch", async () => {
    await load_account_key_derived_keks_into_memory(
      ACCOUNT_KEY,
      get_account_key_generation(),
    );

    expect(get_account_data_write_key("astermail-preferences-v1")).toBeNull();
  });

  it("are not set by a load that started before the keys were reset", async () => {
    const epoch = get_account_write_epoch();

    clear_account_data_write_keys();
    await load_account_key_derived_keks_into_memory(
      ACCOUNT_KEY,
      get_account_key_generation(),
      epoch,
    );

    expect(get_account_data_write_key("astermail-preferences-v1")).toBeNull();
  });

  it("are set when the pool already holds the key", async () => {
    await load_account_key_derived_keks_into_memory(
      ACCOUNT_KEY,
      get_account_key_generation(),
    );
    await load_current();

    expect(get_account_data_write_key("astermail-draft-v2")).not.toBeNull();
  });

  it("move to a new account key loaded in a later epoch", async () => {
    await load_current();
    const first = get_account_data_write_key("astermail-draft-v2");

    clear_account_data_write_keys();
    await load_current(OTHER_ACCOUNT_KEY);
    const second = get_account_data_write_key("astermail-draft-v2");

    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });

  it("are cleared with the account key pool", async () => {
    await load_current();
    clear_account_key_derived_keks();

    expect(get_account_data_write_key("astermail-draft-v2")).toBeNull();
  });
});

describe("account_data_write_key", () => {
  it("returns the key when the server enables format writes", async () => {
    await load_current();

    expect(
      await account_data_write_key("astermail-preferences-v1"),
    ).not.toBeNull();
  });

  it.each([
    ["off", { data: { format_writes: false } }],
    ["not a boolean", { data: { format_writes: "true" } }],
    ["missing on an older server", { code: "NOT_FOUND", error: "not found" }],
    ["a failed request", new Error("offline")],
  ])("returns null when the flag is %s", async (_label, capabilities) => {
    h.capabilities = capabilities;
    await load_current();

    expect(await account_data_write_key("astermail-preferences-v1")).toBeNull();
  });

  it("skips the flag request before the account key loads", async () => {
    expect(await account_data_write_key("astermail-preferences-v1")).toBeNull();
    expect(h.capability_fetches).toBe(0);
  });
});

describe("account_data_write_key_strict", () => {
  it("returns the key when the server enables format writes", async () => {
    await load_current();

    expect(
      await account_data_write_key_strict("astermail-preferences-v1"),
    ).not.toBeNull();
  });

  it.each([
    ["off", { data: { format_writes: false } }],
    ["missing on an older server", { code: "NOT_FOUND", error: "not found" }],
  ])("returns null when the flag is %s", async (_label, capabilities) => {
    h.capabilities = capabilities;
    await load_current();

    expect(
      await account_data_write_key_strict("astermail-preferences-v1"),
    ).toBeNull();
  });

  it("throws before the account key loads", async () => {
    await expect(
      account_data_write_key_strict("astermail-preferences-v1"),
    ).rejects.toBeInstanceOf(AccountKeyUnavailableError);
    expect(h.capability_fetches).toBe(0);
  });

  it("throws when the flag request fails", async () => {
    h.capabilities = new Error("offline");
    await load_current();

    await expect(
      account_data_write_key_strict("astermail-preferences-v1"),
    ).rejects.toBeInstanceOf(AccountKeyUnavailableError);
  });
});

describe("preferences writes", () => {
  it("use the account data key when enabled", async () => {
    await load_current();
    const payload = await prepare_preferences_payload(
      DEFAULT_PREFERENCES,
      vault,
    );
    const account_raw = await derive_account_data_key_raw(
      ACCOUNT_KEY,
      "astermail-preferences-v1",
    );

    expect(payload).not.toBeNull();
    const opened = await opens_with(
      account_raw,
      payload!.encrypted,
      payload!.nonce,
    );

    expect(JSON.parse(opened!)).toEqual(
      JSON.parse(JSON.stringify(DEFAULT_PREFERENCES)),
    );
    expect(
      await opens_with(
        await derive_preferences_key_raw(vault.identity_key),
        payload!.encrypted,
        payload!.nonce,
      ),
    ).toBeNull();
  });

  it("use the legacy key when the flag is off", async () => {
    h.capabilities = { data: { format_writes: false } };
    await load_current();
    const payload = await prepare_preferences_payload(
      DEFAULT_PREFERENCES,
      vault,
    );

    expect(
      await opens_with(
        await derive_preferences_key_raw(vault.identity_key),
        payload!.encrypted,
        payload!.nonce,
      ),
    ).not.toBeNull();
  });
});

describe("retry_after_account_key_load", () => {
  it("returns the first result without waiting", async () => {
    expect(await retry_after_account_key_load(async () => 7)).toBe(7);
    expect(h.waits).toBe(0);
  });

  it("retries once after the wait", async () => {
    let calls = 0;
    const result = await retry_after_account_key_load(async () => {
      calls++;
      if (calls === 1) throw new Error("first");

      return "second";
    });

    expect(result).toBe("second");
    expect(h.waits).toBe(1);
  });

  it("rethrows the first error when the retry fails", async () => {
    let calls = 0;

    await expect(
      retry_after_account_key_load(async () => {
        calls++;
        throw new Error(calls === 1 ? "first" : "second");
      }),
    ).rejects.toThrow("first");
    expect(calls).toBe(2);
  });
});
