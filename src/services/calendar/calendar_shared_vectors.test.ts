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

import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import * as openpgp from "openpgp";
import { afterEach, describe, expect, it, vi } from "vitest";

import raw_vectors from "@/tests/fixtures/calendar_shared_vectors.json";

const api = vi.hoisted(() => ({
  MAX_ACCOUNT_KEY_HISTORY: 64,
  get_account_key_token: vi.fn(),
  get_account_key_token_history: vi.fn(),
  put_account_key_token_if_absent: vi.fn(),
}));

vi.mock("@/services/api/account_key", () => api);

const { load_account_keys_for_session } =
  await import("@/services/crypto/account_key_loader");
const { open_account_key_token, seal_account_key_token } =
  await import("@/services/crypto/account_key_token");
const { clear_account_key_derived_keks } =
  await import("@/services/crypto/legacy_keks");
const { clear_calendar_v3_keyring, v3_blob_key_id } =
  await import("@/services/calendar/calendar_crypto_v3");
const {
  CALENDAR_BLOB_FORMAT_V3,
  calendar_write_key,
  decrypt_calendar_payload,
  encrypt_calendar_payload,
} = await import("@/services/calendar/calendar_crypto");

interface VaultCase {
  name: string;
  writes: "a" | "b";
  vault: Record<string, unknown>;
}

interface SharedRecord {
  key_id: string;
  blob: string;
  nonce: string;
}

interface Producer {
  identity_key: string;
  account_key: string;
  token: string;
  records: Record<string, SharedRecord>;
}

interface SharedVectors {
  passphrase: string;
  binding: { calendar_id: string; event_id: string };
  payload: { title: string };
  cases: VaultCase[];
  producers: Record<string, Producer>;
}

const vectors = raw_vectors as unknown as Partial<SharedVectors>;

const PASS = "shared-vector-passphrase";
const BINDING = { calendar_id: "cal-shared", event_id: "evt-shared" };
const PAYLOAD = { title: "Shared" };

function to_base64(bytes: Uint8Array): string {
  let binary = "";

  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));

  return btoa(binary);
}

function seed(offset: number): Uint8Array {
  return Uint8Array.from({ length: 64 }, (_, index) => index + offset);
}

function build_cases(): VaultCase[] {
  const a = ml_kem768.keygen(seed(0));
  const b = ml_kem768.keygen(seed(64));
  const a_key = to_base64(a.secretKey);
  const a_public = to_base64(a.publicKey);
  const a_seed = to_base64(seed(0));
  const current_b = {
    ratchet_identity_public: "current-identity",
    ratchet_pq_identity_key: to_base64(b.secretKey),
    ratchet_pq_identity_public: to_base64(b.publicKey),
    ratchet_pq_identity_seed: to_base64(seed(64)),
  };

  return [
    {
      name: "current_expanded",
      writes: "a",
      vault: {
        ratchet_pq_identity_key: a_key,
        ratchet_pq_identity_public: a_public,
      },
    },
    {
      name: "current_seed",
      writes: "a",
      vault: {
        ratchet_pq_identity_seed: a_seed,
        ratchet_pq_identity_public: a_public,
      },
    },
    {
      name: "current_expanded_and_seed",
      writes: "a",
      vault: {
        ratchet_pq_identity_key: a_key,
        ratchet_pq_identity_public: a_public,
        ratchet_pq_identity_seed: a_seed,
      },
    },
    {
      name: "previous_key_set",
      writes: "b",
      vault: {
        ...current_b,
        ratchet_previous_keys: [
          {
            ratchet_identity_key: "previous-identity-secret",
            ratchet_identity_public: "previous-identity",
            ratchet_signed_prekey: "previous-prekey-secret",
            ratchet_signed_prekey_public: "previous-prekey",
            ratchet_pq_identity_key: a_key,
            ratchet_pq_identity_public: a_public,
            ratchet_pq_identity_seed: a_seed,
          },
        ],
      },
    },
    {
      name: "previous_expanded_only",
      writes: "b",
      vault: {
        ...current_b,
        ratchet_previous_keys: [
          {
            ratchet_pq_identity_key: a_key,
            ratchet_pq_identity_public: a_public,
          },
        ],
      },
    },
    {
      name: "previous_seed_only",
      writes: "b",
      vault: {
        ...current_b,
        ratchet_previous_keys: [
          {
            ratchet_pq_identity_seed: a_seed,
            ratchet_pq_identity_public: a_public,
          },
        ],
      },
    },
  ];
}

function vault_of(entry: VaultCase, identity_key: string): EncryptedVault {
  return {
    ...entry.vault,
    identity_key,
    previous_keys: [],
  } as unknown as EncryptedVault;
}

async function load_account(
  identity_key: string,
  token: string,
): Promise<number> {
  clear_account_key_derived_keks();
  clear_calendar_v3_keyring();
  api.get_account_key_token.mockReset();
  api.get_account_key_token_history.mockReset();
  api.put_account_key_token_if_absent.mockReset();
  api.get_account_key_token.mockResolvedValue({
    token,
    key_fingerprint: "a".repeat(40),
    version: 1,
    updated_at: "",
  });
  api.get_account_key_token_history.mockResolvedValue([]);
  api.put_account_key_token_if_absent.mockResolvedValue(null);

  return load_account_keys_for_session(
    { identity_key, previous_keys: [] } as unknown as EncryptedVault,
    PASS,
  );
}

async function produce(cases: VaultCase[]): Promise<Producer> {
  const identity = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: "shared", email: "shared@example.org" }],
    passphrase: PASS,
    format: "armored",
  });
  const account_key = crypto.getRandomValues(new Uint8Array(32));
  const token = await seal_account_key_token(
    account_key,
    identity.privateKey,
    PASS,
  );

  expect(await load_account(identity.privateKey, token)).toBe(1);

  const records: Record<string, SharedRecord> = {};

  for (const entry of cases) {
    const record = await encrypt_calendar_payload(
      PAYLOAD,
      vault_of(entry, identity.privateKey),
      BINDING,
    );

    expect(record.format).toBe(CALENDAR_BLOB_FORMAT_V3);
    records[entry.name] = {
      key_id: v3_blob_key_id(record.ciphertext)!,
      blob: record.ciphertext,
      nonce: record.nonce,
    };
  }

  return {
    identity_key: identity.privateKey,
    account_key: to_base64(account_key),
    token,
    records,
  };
}

async function verify(producer: Producer, cases: VaultCase[]): Promise<void> {
  const opened = await open_account_key_token(
    producer.token,
    [producer.identity_key],
    PASS,
  );

  expect(opened && to_base64(opened), "token").toBe(producer.account_key);
  expect(await load_account(producer.identity_key, producer.token)).toBe(1);

  for (const entry of cases) {
    const record = producer.records[entry.name];
    const vault = vault_of(entry, producer.identity_key);
    const write_key = await calendar_write_key(vault);

    expect(record, entry.name).toBeDefined();
    expect(v3_blob_key_id(record.blob), entry.name).toBe(record.key_id);
    expect(
      write_key?.format === CALENDAR_BLOB_FORMAT_V3 && write_key.key.id,
      entry.name,
    ).toBe(record.key_id);

    for (const reader of cases) {
      if (entry.writes === "b" && reader.writes !== "b") continue;

      const restored = await decrypt_calendar_payload<{ title: string }>(
        { ciphertext: record.blob, nonce: record.nonce },
        vault_of(reader, producer.identity_key),
        BINDING,
      );

      expect(restored.payload, entry.name + " read as " + reader.name).toEqual(
        PAYLOAD,
      );
    }
  }
}

afterEach(() => {
  clear_account_key_derived_keks();
  clear_calendar_v3_keyring();
});

describe("calendar vectors shared with the mobile client", () => {
  it("covers every producer", () => {
    expect(Object.keys(vectors.producers ?? {}).sort()).toEqual([
      "android",
      "android_amended",
      "android_recertified",
      "web",
      "web_recertified",
    ]);
  });

  it("reads what it writes", async () => {
    const cases = build_cases();

    expect(cases).toEqual(vectors.cases);
    await verify(await produce(cases), cases);
  }, 60000);

  for (const name of Object.keys(vectors.producers ?? {})) {
    it("reads what the " + name + " client wrote", async () => {
      await verify(vectors.producers![name], vectors.cases!);
    }, 60000);
  }
});
