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
import { describe, expect, it } from "vitest";

import type { EncryptedVault } from "@/services/crypto/key_manager";
import type { CalendarBlob } from "@/services/calendar/calendar_codec";

import { CALENDAR_BLOB_FORMAT_V2 } from "@/services/calendar/calendar_crypto";
import {
  decode_calendar_row,
  encrypt_calendar_blob,
  resealable_calendar_blob,
} from "@/services/calendar/calendar_codec";

const vault = { identity_key: "test-identity-key-material" } as EncryptedVault;

async function test_key(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("calendar-codec-key"),
  );

  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function sealed_row(
  key: CryptoKey,
  blob: CalendarBlob,
  server_default: boolean,
) {
  const encrypted = await encrypt_calendar_blob(
    blob,
    vault,
    "cal-1",
    { format: CALENDAR_BLOB_FORMAT_V2, key },
    1000,
  );

  return {
    id: "cal-1",
    is_visible: true,
    is_default: server_default,
    encrypted_blob: encrypted.encrypted_blob,
    blob_nonce: encrypted.blob_nonce,
  };
}

describe("calendar default flag", () => {
  it("prefers the encrypted default flag over the server column", async () => {
    const key = await test_key();
    const promoted = await decode_calendar_row(
      await sealed_row(
        key,
        { name: "Work", color: "blue", is_default: false },
        true,
      ),
      vault,
      [key],
    );
    const demoted = await decode_calendar_row(
      await sealed_row(
        key,
        { name: "Personal", color: "blue", is_default: true },
        false,
      ),
      vault,
      [key],
    );

    expect(promoted?.calendar.is_default).toBe(false);
    expect(promoted?.default_bound).toBe(true);
    expect(demoted?.calendar.is_default).toBe(true);
    expect(demoted?.default_bound).toBe(true);
  });

  it("falls back to the server column for a blob written without the flag", async () => {
    const key = await test_key();
    const decoded = await decode_calendar_row(
      await sealed_row(key, { name: "Personal", color: "blue" }, true),
      vault,
      [key],
    );

    expect(decoded?.calendar.is_default).toBe(true);
    expect(decoded?.default_bound).toBe(false);
  });

  it("carries the flag into a reseal only when the blob authenticated it", async () => {
    const key = await test_key();
    const bound = await decode_calendar_row(
      await sealed_row(
        key,
        { name: "Personal", color: "blue", is_default: true },
        false,
      ),
      vault,
      [key],
    );
    const unbound = await decode_calendar_row(
      await sealed_row(key, { name: "Personal", color: "blue" }, true),
      vault,
      [key],
    );

    expect(bound && resealable_calendar_blob(bound).is_default).toBe(true);
    expect(unbound && "is_default" in resealable_calendar_blob(unbound)).toBe(
      false,
    );
  });
});
