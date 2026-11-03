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

import { decrypt_vault } from "@/services/crypto/key_manager";
import {
  store_vault_in_memory,
  get_vault_from_memory,
  has_vault_in_memory,
  has_vault_in_memory_for,
} from "@/services/crypto/memory_key_store";

let vault_decryption_lock: Promise<void> | null = null;

export async function decrypt_vault_with_lock(
  encrypted_vault: string,
  vault_nonce: string,
  passphrase: string,
  owner_user_id?: string,
): Promise<EncryptedVault | null> {
  const reusable = (): boolean =>
    owner_user_id
      ? has_vault_in_memory_for(owner_user_id)
      : has_vault_in_memory();

  if (reusable()) {
    return get_vault_from_memory();
  }

  if (vault_decryption_lock) {
    await vault_decryption_lock;
    if (reusable()) {
      return get_vault_from_memory();
    }
  }

  let resolve_lock: (() => void) | undefined;

  vault_decryption_lock = new Promise<void>((resolve) => {
    resolve_lock = resolve;
  });

  try {
    if (reusable()) {
      return get_vault_from_memory();
    }

    const vault = await decrypt_vault(encrypted_vault, vault_nonce, passphrase);

    await store_vault_in_memory(vault, passphrase, owner_user_id);

    return vault;
  } finally {
    resolve_lock?.();
    vault_decryption_lock = null;
  }
}
