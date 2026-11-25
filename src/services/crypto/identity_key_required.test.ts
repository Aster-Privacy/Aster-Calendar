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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  puts: [] as string[],
  stored: null as null | {
    encrypted_preferences: string;
    preferences_nonce: string;
  },
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({ data: h.stored ?? {}, error: null })),
    put: vi.fn(async (path: string) => {
      h.puts.push(path);

      return { data: { success: true }, error: null };
    }),
    get_expected_user_id: () => null,
    confirm_session_identity: vi.fn(async () => undefined),
  },
}));

vi.mock("@/services/crypto/account_data_writer", () => ({
  account_data_write_key: vi.fn(async () => null),
  retry_after_account_key_load: <T>(attempt: () => Promise<T>) => attempt(),
}));

import {
  IdentityKeyMissingError,
  is_usable_identity_key,
  with_identity_key,
} from "./identity_key_required";
import { decrypt_aes_gcm_with_fallback } from "./legacy_keks";

import { update_onboarding_state } from "@/services/api/onboarding";
import {
  get_preferences,
  save_preferences,
  DEFAULT_PREFERENCES,
} from "@/services/api/preferences";
import { save_dev_mode } from "@/services/api/preferences_dev_mode";

const src_root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const WRITERS: Record<string, string> = {
  "services/api/onboarding.ts":
    'with_identity_key(vault).identity_key + "astermail-onboarding-v1"',
  "services/api/preferences.ts": "with_identity_key(vault).identity_key,",
  "services/api/preferences_dev_mode.ts":
    "with_identity_key(vault).identity_key,",
  "services/send_queue_envelope.ts":
    "!is_usable_identity_key(vault.identity_key)",
};

const ONBOARDING = {
  current_step: 1,
  completed_steps: [0],
  last_seen_step: 1,
  started_at: 1,
};

function vault_with(identity_key?: string): EncryptedVault {
  return { identity_key } as unknown as EncryptedVault;
}

function to_base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function seal_under_constant(
  value: Record<string, unknown>,
): Promise<{ encrypted_preferences: string; preferences_nonce: string }> {
  const raw = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("undefined" + "astermail-preferences-v1"),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );

  return {
    encrypted_preferences: to_base64(new Uint8Array(sealed)),
    preferences_nonce: to_base64(nonce),
  };
}

beforeEach(() => {
  h.puts.length = 0;
  h.stored = null;
  localStorage.clear();
});

describe("identity key requirement for account data", () => {
  it("accepts a real identity key", () => {
    const vault = { identity_key: "key" };

    expect(is_usable_identity_key("key")).toBe(true);
    expect(with_identity_key(vault)).toBe(vault);
  });

  it("refuses a missing or placeholder identity key", () => {
    for (const value of [
      undefined,
      null,
      "",
      "  ",
      "undefined",
      "null",
      "NaN",
      "[object Object]",
    ]) {
      expect(is_usable_identity_key(value)).toBe(false);
      expect(() =>
        with_identity_key({ identity_key: value as string | null }),
      ).toThrow(IdentityKeyMissingError);
    }
  });

  it("applies the check on every write path", () => {
    for (const [file, expected] of Object.entries(WRITERS)) {
      const source = readFileSync(resolve(src_root, file), "utf8");

      expect(source.includes(expected), file).toBe(true);
    }
  });

  it("refuses to open data without a primary key when no fallback key is loaded", async () => {
    await expect(
      decrypt_aes_gcm_with_fallback(
        null,
        new Uint8Array(32),
        new Uint8Array(12),
      ),
    ).rejects.toThrow();
  });

  it("sends no preferences without an identity key", async () => {
    const result = await save_preferences(DEFAULT_PREFERENCES, vault_with());

    expect(result.data.success).toBe(false);
    expect(h.puts).toEqual([]);
  });

  it("sends no developer mode setting without an identity key", async () => {
    const result = await save_dev_mode(true, vault_with("undefined"));

    expect(result.data.success).toBe(false);
    expect(h.puts).toEqual([]);
  });

  it("sends no onboarding state without an identity key", async () => {
    const result = await update_onboarding_state(ONBOARDING, vault_with());

    expect(result.data.success).toBe(false);
    expect(h.puts).toEqual([]);
  });

  it("saves onboarding state with an identity key", async () => {
    const result = await update_onboarding_state(
      ONBOARDING,
      vault_with("identity"),
    );

    expect(result.data.success).toBe(true);
    expect(h.puts).toEqual(["/core/v1/onboarding"]);
  });

  it("never treats preferences sealed under the public constant as genuine", async () => {
    h.stored = await seal_under_constant({
      ...DEFAULT_PREFERENCES,
      calendar_v3_only: false,
      calendar_auto_add_invitations: "always",
    });

    const result = await get_preferences(vault_with());

    expect(result.loaded_from_server).toBe(false);
    expect(h.puts).toEqual([]);
  });
});
