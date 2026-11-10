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
  blob_to_event,
  decode_calendar_row,
  draft_to_blob,
  encrypt_calendar_blob,
  event_to_draft,
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

describe("event reminders in the blob", () => {
  const STAMP = "2026-03-01T00:00:00.000Z";
  const base_blob = {
    title: "Standup",
    starts_at: "2026-03-02T09:00:00.000Z",
    ends_at: "2026-03-02T10:00:00.000Z",
  };
  const decode = (fields: Record<string, unknown>) =>
    blob_to_event(
      { ...base_blob, ...fields } as unknown as Parameters<
        typeof blob_to_event
      >[0],
      "evt-1",
      "cal-1",
      STAMP,
    );

  it("reads the list the mobile apps write", () => {
    const event = decode(
      JSON.parse('{"reminder_minutes":10,"reminders":[10,1440,10080]}'),
    );

    expect(event.reminder_minutes).toBe(10);
    expect(event.reminders).toEqual([10, 1440, 10080]);
  });

  it("reads an older blob that has only the single reminder", () => {
    const event = decode({ reminder_minutes: 60 });

    expect(event.reminder_minutes).toBe(60);
    expect(event.reminders).toBeNull();
  });

  it("writes both fields and omits the list when it is unset", () => {
    const with_list = draft_to_blob({
      ...event_to_draft(decode({ reminder_minutes: 60 })),
      reminder_minutes: 30,
      reminders: [30, 20160],
    });

    expect(with_list.reminder_minutes).toBe(30);
    expect(with_list.reminders).toEqual([30, 20160]);

    const without_list = draft_to_blob(
      event_to_draft(decode({ reminder_minutes: 60 })),
    );

    expect(without_list.reminder_minutes).toBe(60);
    expect("reminders" in without_list).toBe(false);
  });
});
