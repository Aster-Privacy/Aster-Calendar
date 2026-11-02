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
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EncryptedVault } from "@/services/crypto/key_manager";

const key_state = vi.hoisted(() => ({
  write: null as CryptoKey | null,
  capabilities: vi.fn(async () => ({
    format_writes: false,
    data_conversion: false,
  })),
}));

vi.mock("@/services/api/account_key", () => ({
  get_account_key_capabilities: key_state.capabilities,
  account_key_capabilities_known: () => true,
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  get_account_data_write_key: () => key_state.write,
  get_account_data_crypto_keys: () => (key_state.write ? [key_state.write] : []),
  get_account_data_write_base_key: () => null,
  get_account_data_base_keys: () => [],
}));

import {
  CALENDAR_BLOB_FORMAT_V2,
  decrypt_calendar_payload,
  encrypt_calendar_payload,
} from "@/services/calendar/calendar_crypto";
import { AccountKeyUnavailableError } from "@/services/crypto/account_data_writer";

const vault = { identity_key: "test-identity-key-material" } as EncryptedVault;
const binding = { calendar_id: "cal-1", event_id: "evt-1" };

async function test_key(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("calendar-write-key"),
  );

  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

describe("calendar write key selection", () => {
  beforeEach(() => {
    key_state.write = null;
    key_state.capabilities.mockClear();
  });

  it("encrypts with the account key without asking the server for capabilities", async () => {
    key_state.write = await test_key();

    const record = await encrypt_calendar_payload({ a: 1 }, vault, binding);
    const restored = await decrypt_calendar_payload<{ a: number }>(
      record,
      vault,
      binding,
    );

    expect(record.format).toBe(CALENDAR_BLOB_FORMAT_V2);
    expect(restored.payload).toEqual({ a: 1 });
    expect(key_state.capabilities).not.toHaveBeenCalled();
  });

  it("throws a typed error instead of writing when no key is loaded", async () => {
    await expect(
      encrypt_calendar_payload({ a: 1 }, vault, binding),
    ).rejects.toBeInstanceOf(AccountKeyUnavailableError);
    expect(key_state.capabilities).not.toHaveBeenCalled();
  });
});
