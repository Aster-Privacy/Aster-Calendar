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
import { beforeEach, describe, expect, it } from "vitest";

import type { EncryptedVault } from "@/services/crypto/key_manager";

import {
  CALENDAR_BLOB_FORMAT_V2,
  calendar_v3_floor,
  calendar_write_key,
  decrypt_calendar_payload,
  decrypt_calendar_payload_v2,
  encrypt_calendar_payload,
  encrypt_calendar_payload_v2,
  set_calendar_v3_floor,
  set_calendar_write_account,
} from "@/services/calendar/calendar_crypto";
import {
  CALENDAR_BLOB_FORMAT_V1,
  encrypt_calendar_payload_v1,
} from "@/tests/calendar_v1_fixture";

const vault = { identity_key: "test-identity-key-material" } as EncryptedVault;
const binding = { calendar_id: "cal-1", event_id: "evt-1" };

async function test_key(seed = "calendar-v2-key"): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(seed),
  );

  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

describe("calendar payload encryption", () => {
  it("rejects a v1 blob", async () => {
    const payload = { title: "Standup", minute_of_day: 540 };
    const record = await encrypt_calendar_payload_v1(payload, vault);

    expect(record.format).toBe(CALENDAR_BLOB_FORMAT_V1);
    await expect(
      decrypt_calendar_payload(record, vault, binding, [await test_key()]),
    ).rejects.toBeDefined();
  });

  it("round trips a v2 blob bound to its ids", async () => {
    const key = await test_key();
    const payload = { title: "Planning", minute_of_day: 600 };
    const record = await encrypt_calendar_payload_v2(payload, key, binding);
    const restored = await decrypt_calendar_payload<typeof payload>(
      record,
      vault,
      binding,
      [key],
    );

    expect(record.format).toBe(CALENDAR_BLOB_FORMAT_V2);
    expect(restored.payload).toEqual(payload);
    expect(restored.format).toBe(CALENDAR_BLOB_FORMAT_V2);
    expect(restored.bound).toBe(true);
  });

  it("prefers v2 when a write key is supplied", async () => {
    const key = await test_key();
    const record = await encrypt_calendar_payload({ a: 1 }, vault, binding, {
      format: CALENDAR_BLOB_FORMAT_V2,
      key,
    });

    expect(record.format).toBe(CALENDAR_BLOB_FORMAT_V2);
  });

  it("refuses to write without a loaded account key", async () => {
    await expect(
      encrypt_calendar_payload({ a: 1 }, vault, binding),
    ).rejects.toThrow("account key is not loaded");
  });

  it("rejects a v2 blob moved to another event or calendar", async () => {
    const key = await test_key();
    const record = await encrypt_calendar_payload_v2({ a: 1 }, key, binding);

    await expect(
      decrypt_calendar_payload_v2(record, [key], {
        calendar_id: "cal-1",
        event_id: "evt-2",
      }),
    ).rejects.toBeDefined();
    await expect(
      decrypt_calendar_payload_v2(record, [key], {
        calendar_id: "cal-2",
        event_id: "evt-1",
      }),
    ).rejects.toBeDefined();
    await expect(
      decrypt_calendar_payload(
        record,
        vault,
        { calendar_id: "cal-2", event_id: "evt-1" },
        [key],
      ),
    ).rejects.toBeDefined();
  });

  it("rejects an event blob bound only to its calendar", async () => {
    const key = await test_key();
    const record = await encrypt_calendar_payload_v2({ a: 1 }, key, {
      calendar_id: "cal-1",
    });

    await expect(
      decrypt_calendar_payload_v2(record, [key], binding),
    ).rejects.toBeDefined();
  });

  it("rejects a calendar blob without a calendar id", async () => {
    const key = await test_key();
    const record = await encrypt_calendar_payload_v2({ name: "Team" }, key, {
      calendar_id: "",
    });

    await expect(
      decrypt_calendar_payload_v2(record, [key], { calendar_id: "cal-9" }),
    ).rejects.toBeDefined();
    await expect(
      decrypt_calendar_payload_v2(
        await encrypt_calendar_payload_v2({ name: "Team" }, key, {
          calendar_id: "cal-1",
        }),
        [key],
        { calendar_id: "cal-9" },
      ),
    ).rejects.toBeDefined();
  });

  it("round trips a payload larger than the argument spread limit", async () => {
    const key = await test_key();
    const payload = {
      description: "x".repeat(200_000),
      attendees: Array.from({ length: 500 }, (_, i) => `guest${i}@example.com`),
    };

    const record = await encrypt_calendar_payload_v2(payload, key, binding);
    const restored = await decrypt_calendar_payload<typeof payload>(
      record,
      vault,
      binding,
      [key],
    );

    expect(restored.payload.description).toHaveLength(200_000);
    expect(restored.payload.attendees).toHaveLength(500);
  });

  it("fails to decrypt a v1 blob when the vault key differs", async () => {
    const record = await encrypt_calendar_payload_v1({ a: 1 }, vault);
    const other = { identity_key: "different-key" } as EncryptedVault;

    await expect(
      decrypt_calendar_payload(record, other, binding, []),
    ).rejects.toBeDefined();
  });

  it("fails to decrypt a v2 blob with a different key", async () => {
    const record = await encrypt_calendar_payload_v2(
      { a: 1 },
      await test_key("one"),
      binding,
    );

    await expect(
      decrypt_calendar_payload(record, vault, binding, [await test_key("two")]),
    ).rejects.toBeDefined();
  });
});

describe("calendar v3 floor", () => {
  beforeEach(() => {
    window.localStorage.clear();
    set_calendar_v3_floor(false);
    set_calendar_write_account(null);
  });

  it("refuses a v2 write for an account whose stored floor is on", async () => {
    window.localStorage.setItem("aster_calendar_v3_floor:acct-write", "1");
    set_calendar_write_account("acct-write");

    expect(calendar_v3_floor()).toBe(false);
    await expect(calendar_write_key(vault)).resolves.toBeNull();
    await expect(
      encrypt_calendar_payload({ a: 1 }, vault, binding),
    ).rejects.toThrow("calendar v3 key is not loaded");
  });

  it("keeps v2 writes for an account without a stored floor", async () => {
    window.localStorage.setItem("aster_calendar_v3_floor:acct-floored", "1");
    set_calendar_write_account("acct-plain");

    await expect(
      encrypt_calendar_payload({ a: 1 }, vault, binding),
    ).rejects.toThrow("account key is not loaded");
  });

  it("stays on for an account after a replayed preference turns it off", () => {
    set_calendar_v3_floor(true, "account-1");
    expect(calendar_v3_floor()).toBe(true);

    set_calendar_v3_floor(false, "account-1");
    expect(calendar_v3_floor()).toBe(true);
  });

  it("does not carry one account's floor to another account", () => {
    set_calendar_v3_floor(true, "account-1");
    set_calendar_v3_floor(false, "account-2");

    expect(calendar_v3_floor()).toBe(false);
  });

  it("applies a floor stored by an earlier session before the preference loads", () => {
    window.localStorage.setItem("aster_calendar_v3_floor:acct-reload", "1");
    set_calendar_v3_floor(false);

    expect(calendar_v3_floor()).toBe(false);
    expect(calendar_v3_floor("acct-reload")).toBe(true);
    expect(calendar_v3_floor("acct-other")).toBe(false);
  });

  it("does not apply the active floor of one account to another", () => {
    set_calendar_v3_floor(true, "acct-on");

    expect(calendar_v3_floor("acct-on")).toBe(true);
    expect(calendar_v3_floor("acct-off")).toBe(false);
  });

  it("follows the preference when no account is known", () => {
    set_calendar_v3_floor(true);
    set_calendar_v3_floor(false);

    expect(calendar_v3_floor()).toBe(false);
  });
});
