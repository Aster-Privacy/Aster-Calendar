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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as openpgp from "openpgp";

import {
  add_address_to_identity_key,
  repair_identity_certification_dates,
  restore_identity_certification_dates,
} from "./pgp_uid_service";

import {
  open_account_key_token_detailed,
  seal_account_key_token,
} from "@/services/crypto/account_key_token";

const PASSPHRASE = "correct horse battery staple";
const SEALED_AT = new Date("2026-11-06T10:00:00Z");
const AMENDED_AT = new Date("2026-11-08T23:14:00Z");
const REPAIRED_AT = new Date("2026-11-23T12:00:00Z");

const state = vi.hoisted(() => ({
  vault: null as EncryptedVault | null,
  saved_vaults: [] as EncryptedVault[],
  republished: [] as Record<string, unknown>[],
  user_id: "user-1",
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => state.vault,
  get_passphrase_from_memory: () => PASSPHRASE,
  MASTER_KEY_VAULT_FORMAT: 3,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => ({
    user: { id: state.user_id, email: "me@example.test" },
  }),
}));

vi.mock("@/services/crypto/vault_write_lock", () => ({
  with_vault_write_lock: <T>(fn: () => Promise<T>) => fn(),
}));

vi.mock("@/services/crypto/ensure_ratchet_keys", () => ({
  sync_vault_with_server: async () => ({ status: "current" }),
}));

vi.mock("@/services/crypto/key_manager", () => ({
  encrypt_vault: async () => ({ encrypted_vault: "sealed", vault_nonce: "n" }),
  prepare_pgp_key_data: async (keys: { public_key: string }) => ({
    public_key_armored: keys.public_key,
  }),
}));

vi.mock("@/services/api/key_rotation", () => ({
  update_vault: async (
    _encrypted: string,
    _nonce: string,
    _format: number,
    _user_id: string,
    _preserve: boolean,
    vault: EncryptedVault,
  ) => {
    state.saved_vaults.push(vault);
    state.vault = vault;

    return { success: true, vault };
  },
  republish_pgp_key: async (data: Record<string, unknown>) => {
    state.republished.push(data);

    return { data: { success: true } };
  },
}));

const ACCOUNT_KEY = new Uint8Array(32).fill(9);

function vault_for(identity_key: string): EncryptedVault {
  return {
    identity_key,
    signed_prekey: "",
    signed_prekey_private: "",
    recovery_codes: [],
  };
}

async function generate_identity(): Promise<string> {
  const { privateKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ name: "Me", email: "me@example.test" }],
    passphrase: PASSPHRASE,
    keyExpirationTime: 86400 * 365 * 3,
    format: "armored",
  });

  return privateKey;
}

async function amend_without_date(armored: string): Promise<string> {
  const unlocked = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: armored }),
    passphrase: PASSPHRASE,
  });
  const expires_at = await unlocked.getExpirationTime();
  const reformatted = await openpgp.reformatKey({
    privateKey: unlocked,
    userIDs: [
      { name: "Me", email: "me@example.test" },
      { name: "Me", email: "me@custom.example" },
    ],
    keyExpirationTime:
      expires_at instanceof Date
        ? Math.round(
            (expires_at.getTime() - unlocked.getCreationTime().getTime()) /
              1000,
          )
        : 0,
    format: "object",
  });
  const locked = await openpgp.encryptKey({
    privateKey: reformatted.privateKey,
    passphrase: PASSPHRASE,
  });

  return locked.armor();
}

async function broken_account(): Promise<{
  original: string;
  amended: string;
  token: string;
}> {
  vi.setSystemTime(SEALED_AT);

  const original = await generate_identity();
  const token = await seal_account_key_token(ACCOUNT_KEY, original, PASSPHRASE);

  vi.setSystemTime(AMENDED_AT);

  const amended = await amend_without_date(original);

  vi.setSystemTime(REPAIRED_AT);

  return { original, amended, token };
}

async function certification_dates(armored: string): Promise<number[]> {
  const key = await openpgp.readKey({ armoredKey: armored });

  return [
    ...key.users.flatMap((user) => user.selfCertifications),
    ...key.subkeys.flatMap((subkey) => subkey.bindingSignatures),
  ].map((signature) => signature.created!.getTime());
}

async function user_emails(armored: string): Promise<string[]> {
  const key = await openpgp.readKey({ armoredKey: armored });

  return key.users.map((user) => user.userID?.email ?? "");
}

describe("identity key certification dates", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    state.vault = null;
    state.saved_vaults = [];
    state.republished = [];
    state.user_id = `user-${Math.random()}`;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reproduces the token that only opens through the relaxed check", async () => {
    const { original, amended, token } = await broken_account();

    const before = await open_account_key_token_detailed(
      token,
      [original],
      PASSPHRASE,
    );
    const after = await open_account_key_token_detailed(
      token,
      [amended],
      PASSPHRASE,
    );

    expect(before?.needs_recertified_key).toBe(false);
    expect(after?.needs_recertified_key).toBe(true);
    expect(Array.from(after!.account_key)).toEqual(Array.from(ACCOUNT_KEY));
    expect(
      (await certification_dates(amended)).every(
        (date) => date === AMENDED_AT.getTime(),
      ),
    ).toBe(true);
  });

  it("adds an address without re-dating the key", async () => {
    vi.setSystemTime(SEALED_AT);

    const original = await generate_identity();
    const token = await seal_account_key_token(
      ACCOUNT_KEY,
      original,
      PASSPHRASE,
    );

    vi.setSystemTime(AMENDED_AT);

    const next = await add_address_to_identity_key(
      vault_for(original),
      PASSPHRASE,
      "me@custom.example",
      "Me",
    );
    const opened = await open_account_key_token_detailed(
      token,
      [next!.identity_key],
      PASSPHRASE,
    );

    expect(opened?.needs_recertified_key).toBe(false);
  });

  it("restores certification dates to the key creation time", async () => {
    const { original, amended, token } = await broken_account();
    const original_key = await openpgp.readKey({ armoredKey: original });

    const restored = await restore_identity_certification_dates(
      vault_for(amended),
      PASSPHRASE,
    );

    expect(restored).not.toBeNull();

    const restored_key = await openpgp.readKey({
      armoredKey: restored!.identity_key,
    });

    expect(restored_key.getFingerprint()).toBe(original_key.getFingerprint());
    expect(await user_emails(restored!.identity_key)).toEqual([
      "me@example.test",
      "me@custom.example",
    ]);
    expect(
      (await certification_dates(restored!.identity_key)).every(
        (date) => date === original_key.getCreationTime().getTime(),
      ),
    ).toBe(true);
    expect(await restored_key.getExpirationTime()).toEqual(
      await original_key.getExpirationTime(),
    );
    await expect(restored_key.getEncryptionKey()).resolves.toBeDefined();
    await expect(restored_key.getSigningKey()).resolves.toBeDefined();

    const opened = await open_account_key_token_detailed(
      token,
      [restored!.identity_key],
      PASSPHRASE,
    );

    expect(opened?.needs_recertified_key).toBe(false);
    expect(Array.from(opened!.account_key)).toEqual(Array.from(ACCOUNT_KEY));
  });

  it("leaves a key that is valid at its creation time alone", async () => {
    vi.setSystemTime(SEALED_AT);

    const original = await generate_identity();

    await expect(
      restore_identity_certification_dates(vault_for(original), PASSPHRASE),
    ).resolves.toBeNull();
  });

  it("repairs the vault key and republishes it once", async () => {
    const { amended, token } = await broken_account();

    state.vault = vault_for(amended);

    await expect(repair_identity_certification_dates(token)).resolves.toBe(
      "updated",
    );
    expect(state.saved_vaults).toHaveLength(1);
    expect(state.republished).toHaveLength(1);

    const opened = await open_account_key_token_detailed(
      token,
      [state.saved_vaults[0].identity_key],
      PASSPHRASE,
    );

    expect(opened?.needs_recertified_key).toBe(false);
    expect(Array.from(opened!.account_key)).toEqual(Array.from(ACCOUNT_KEY));

    await expect(repair_identity_certification_dates(token)).resolves.toBe(
      "unchanged",
    );
    expect(state.saved_vaults).toHaveLength(1);
    expect(state.republished).toHaveLength(1);
  });

  it("writes nothing when the token already opens strictly", async () => {
    vi.setSystemTime(SEALED_AT);

    const original = await generate_identity();
    const token = await seal_account_key_token(
      ACCOUNT_KEY,
      original,
      PASSPHRASE,
    );

    state.vault = vault_for(original);

    await expect(repair_identity_certification_dates(token)).resolves.toBe(
      "unchanged",
    );
    expect(state.saved_vaults).toHaveLength(0);
    expect(state.republished).toHaveLength(0);
  });

  it("writes nothing for a token the vault cannot open", async () => {
    const { amended } = await broken_account();
    const stranger = await generate_identity();
    const foreign_token = await seal_account_key_token(
      ACCOUNT_KEY,
      stranger,
      PASSPHRASE,
    );

    state.vault = vault_for(amended);

    await expect(
      repair_identity_certification_dates(foreign_token),
    ).resolves.toBe("unchanged");
    expect(state.saved_vaults).toHaveLength(0);
    expect(state.republished).toHaveLength(0);
  });
});
