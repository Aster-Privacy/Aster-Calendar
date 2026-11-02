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
import { get_current_account } from "./account_manager";
import { zero_uint8_array } from "./crypto/secure_memory";
import {
  derive_encryption_key_from_passphrase,
  get_passphrase_from_memory,
  STORAGE_KDF_VERSION_LEGACY,
  STORAGE_KDF_VERSION_STRETCHED,
} from "./crypto/memory_key_store";
import { with_vault_write_lock } from "./crypto/vault_write_lock";
import { merge_identity_keys_with } from "./crypto/identity_key_materials";
import { reprotect_pgp_key } from "./crypto/key_manager_pgp_keygen";
import {
  commit_recovered_keys,
  latest_vault_for_commit,
} from "./crypto/restore_inactive_keys";
import { load_openpgp } from "./crypto/openpgp_loader";

export const KEY_FILE_MAX_BYTES = 256 * 1024;
const PRIVATE_KEY_HEADER = "-----BEGIN PGP PRIVATE KEY BLOCK-----";

export interface KeyFileImportResult {
  status:
    | "imported"
    | "invalid"
    | "wrong_password"
    | "already_present"
    | "failed";
  unlocked: boolean;
}

async function read_key_file_fingerprint(
  armored: string,
): Promise<string | null> {
  if (
    armored.length > KEY_FILE_MAX_BYTES ||
    !armored.startsWith(PRIVATE_KEY_HEADER)
  ) {
    return null;
  }

  const openpgp = await load_openpgp();

  try {
    const key = await openpgp.readPrivateKey({ armoredKey: armored });

    return key.getFingerprint().toUpperCase();
  } catch {
    return null;
  }
}

async function fingerprints_of(
  keys: (string | undefined)[],
): Promise<Set<string>> {
  const openpgp = await load_openpgp();
  const result = new Set<string>();

  for (const armored of keys) {
    if (!armored) continue;

    try {
      const key = await openpgp.readKey({ armoredKey: armored });

      result.add(key.getFingerprint().toUpperCase());
    } catch {
      continue;
    }
  }

  return result;
}

async function derive_key_file_storage_keys(
  password: string,
): Promise<Uint8Array[]> {
  const passphrase_bytes = new TextEncoder().encode(password);

  try {
    return [
      await derive_encryption_key_from_passphrase(
        passphrase_bytes,
        STORAGE_KDF_VERSION_STRETCHED,
      ),
      await derive_encryption_key_from_passphrase(
        passphrase_bytes,
        STORAGE_KDF_VERSION_LEGACY,
      ),
    ];
  } finally {
    zero_uint8_array(passphrase_bytes);
  }
}

export async function import_identity_key_file(
  key_file_text: string,
  key_password: string,
): Promise<KeyFileImportResult> {
  const armored = key_file_text.replace(/\r\n?/g, "\n").trim() + "\n";
  const materials = Array.from(new Set([key_file_text, armored]));
  const fingerprint =
    key_file_text.length > KEY_FILE_MAX_BYTES
      ? null
      : await read_key_file_fingerprint(armored);

  if (!fingerprint) return { status: "invalid", unlocked: false };

  return with_vault_write_lock(async () => {
    const account = await get_current_account();
    const user_id = account?.user?.id;
    const vault = await latest_vault_for_commit();
    const passphrase = get_passphrase_from_memory();

    if (!user_id || !vault || !passphrase) {
      return { status: "failed", unlocked: false };
    }

    let relocked: string | null = null;

    if (key_password) {
      try {
        relocked = await reprotect_pgp_key(armored, key_password, passphrase);
      } catch {
        return { status: "wrong_password", unlocked: false };
      }
    }

    const held = await fingerprints_of([
      vault.identity_key,
      ...(vault.previous_keys ?? []),
    ]);
    const material_known = materials.every((material) =>
      (vault.legacy_identity_keys ?? []).includes(material),
    );

    if (material_known && (held.has(fingerprint) || !relocked)) {
      return { status: "already_present", unlocked: held.has(fingerprint) };
    }

    const identity_keys = await merge_identity_keys_with(
      vault,
      [{ identity_key: armored, previous_keys: materials }],
      async (candidate) => {
        if (!relocked || !materials.includes(candidate)) {
          throw new Error("key_file_locked");
        }

        return relocked;
      },
    );

    if (
      !materials.every((material) =>
        identity_keys.legacy_identity_keys.includes(material),
      )
    ) {
      return { status: "failed", unlocked: false };
    }

    const unlocked =
      held.has(fingerprint) ||
      (!!relocked &&
        (await fingerprints_of(identity_keys.previous_keys)).has(fingerprint));

    const committed = await commit_recovered_keys({
      user_id,
      vault,
      passphrase,
      identity_keys,
      ratchet_groups: [],
      storage_keys: key_password
        ? await derive_key_file_storage_keys(key_password)
        : [],
    });

    if (!committed.written) return { status: "failed", unlocked: false };

    return { status: "imported", unlocked };
  });
}
