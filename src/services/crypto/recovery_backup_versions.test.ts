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
import { array_to_base64 } from "./base64";
import { decrypt_vault_backup, encrypt_vault_backup } from "./recovery_key";

const recovery_key = Uint8Array.from({ length: 32 }, (_, i) => 200 - i);

const vault = {
  identity_key: "identity",
  encrypted_previous_keys: [],
  encrypted_signed_prekey: "prekey",
  encrypted_signed_prekey_private: "prekey-private",
  data_kek_random: true,
} as unknown as Parameters<typeof encrypt_vault_backup>[0];

async function seal_v2(generation: number, user_id: string) {
  const user_bytes = new TextEncoder().encode(user_id);
  const header = new Uint8Array(4 + 8 + 2 + user_bytes.length);
  const view = new DataView(header.buffer);

  header.set([0x41, 0x52, 0x42, 0x02], 0);
  view.setBigUint64(4, BigInt(generation));
  view.setUint16(12, user_bytes.length);
  header.set(user_bytes, 14);

  const label = new TextEncoder().encode("aster-recovery-backup-v2");
  const aad = new Uint8Array(label.length + header.length);

  aad.set(label, 0);
  aad.set(header, label.length);

  const salt = Uint8Array.from({ length: 16 }, (_, i) => i);
  const nonce = Uint8Array.from({ length: 12 }, (_, i) => 50 + i);
  const base = await crypto.subtle.importKey(
    "raw",
    recovery_key,
    "HKDF",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode("Aster Mail_Recovery_Vault_v2"),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: aad },
      key,
      new TextEncoder().encode(
        JSON.stringify({
          ...vault,
          backup_generation: generation,
          backup_user_id: user_id,
        }),
      ),
    ),
  );
  const body = new Uint8Array(header.length + sealed.length);

  body.set(header, 0);
  body.set(sealed, header.length);

  return {
    encrypted_data: array_to_base64(body),
    nonce: array_to_base64(nonce),
    salt: array_to_base64(salt),
  };
}

describe("recovery backup versions", () => {
  it("opens a backup in the old format", async () => {
    const backup = await encrypt_vault_backup(vault, recovery_key);
    const opened = await decrypt_vault_backup(backup, recovery_key);

    expect(opened.identity_key).toBe("identity");
  });

  it("opens a bound backup written by the mail app", async () => {
    const backup = await seal_v2(7, "user-1");
    const opened = await decrypt_vault_backup(backup, recovery_key).catch(
      () => null,
    );

    expect(opened?.identity_key).toBe("identity");
    expect(opened).not.toHaveProperty("backup_generation");
  });

  it("reports the account a bound backup belongs to", async () => {
    const module = await import("./recovery_key");
    const read = (module as Record<string, unknown>).read_vault_backup as
      | ((
          backup: unknown,
          key: Uint8Array,
        ) => Promise<{ user_id: string; generation: number }>)
      | undefined;

    expect(read).toBeTypeOf("function");

    const opened = await read?.(await seal_v2(9, "user-2"), recovery_key);

    expect(opened?.user_id).toBe("user-2");
    expect(opened?.generation).toBe(9);
  });
});
