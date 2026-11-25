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
import type { EncryptedVault } from "./key_manager_core";

import { sha256 } from "@noble/hashes/sha256";

import { ignore_error } from "@/lib/ignore_error";

import { array_to_base64 } from "./base64";

type GenerationVault = Pick<
  EncryptedVault,
  | "vault_generation"
  | "retired_identity_fingerprints"
  | "identity_key"
  | "previous_keys"
  | "legacy_identity_keys"
>;

const LINEAGE_DOMAIN = "aster-vault-lineage-v1:";
const MAX_LINEAGE_ENTRIES = 64;

function pin_key(user_id: string): string {
  return `astermail_vault_generation_${user_id}`;
}

function lineage_key(user_id: string): string {
  return `astermail_vault_lineage_${user_id}`;
}

function retired_key(user_id: string): string {
  return `astermail_vault_retired_lineage_${user_id}`;
}

export function vault_generation(vault: GenerationVault): number {
  const value = vault.vault_generation;

  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : 0;
}

export function read_vault_generation_pin(user_id: string): number {
  try {
    const value = Number(localStorage.getItem(pin_key(user_id)));

    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function identity_fingerprint(key: string): string {
  return array_to_base64(
    sha256(new TextEncoder().encode(LINEAGE_DOMAIN + key)),
  );
}

function vault_fingerprints(vault: GenerationVault): string[] {
  const keys = [
    vault.identity_key,
    ...(vault.previous_keys ?? []),
    ...(vault.legacy_identity_keys ?? []),
  ].filter((key): key is string => typeof key === "string" && key.length > 0);

  return [...new Set(keys.map(identity_fingerprint))];
}

function string_list(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function read_fingerprints(key: string): string[] {
  try {
    return string_list(JSON.parse(localStorage.getItem(key) ?? "[]"));
  } catch {
    return [];
  }
}

function read_lineage(user_id: string): string[] {
  return read_fingerprints(lineage_key(user_id));
}

function read_retired(user_id: string): string[] {
  return read_fingerprints(retired_key(user_id));
}

function union(...lists: string[][]): string[] {
  return [...new Set(lists.flat())].slice(-MAX_LINEAGE_ENTRIES);
}

function is_retired_identity(user_id: string, vault: GenerationVault): boolean {
  if (!vault.identity_key) return false;

  const fingerprint = identity_fingerprint(vault.identity_key);

  return (
    read_retired(user_id).includes(fingerprint) &&
    !read_lineage(user_id).includes(fingerprint)
  );
}

function is_new_lineage(user_id: string, vault: GenerationVault): boolean {
  if (vault_generation(vault) > 0 || !vault.identity_key) return false;

  const seen = read_lineage(user_id);

  return (
    seen.length > 0 && !seen.includes(identity_fingerprint(vault.identity_key))
  );
}

function write_store(entries: Record<string, string | null>): void {
  try {
    for (const [key, value] of Object.entries(entries)) {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    }
  } catch (caught) {
    ignore_error("services/crypto/vault_generation:pin", caught);
  }
}

export function pin_vault_generation(
  user_id: string,
  vault: GenerationVault,
): void {
  const fingerprints = vault_fingerprints(vault);
  const carried = string_list(vault.retired_identity_fingerprints).filter(
    (id) => !fingerprints.includes(id),
  );

  if (is_retired_identity(user_id, vault)) return;

  const retired = union(read_retired(user_id), carried);

  if (is_new_lineage(user_id, vault)) {
    const replaced = read_lineage(user_id).filter(
      (id) => !fingerprints.includes(id),
    );

    write_store({
      [pin_key(user_id)]: null,
      [lineage_key(user_id)]: JSON.stringify(fingerprints),
      [retired_key(user_id)]: JSON.stringify(union(retired, replaced)),
    });

    return;
  }

  const generation = Math.max(
    vault_generation(vault),
    read_vault_generation_pin(user_id),
  );

  write_store({
    [retired_key(user_id)]: JSON.stringify(retired),
    [pin_key(user_id)]: generation > 0 ? String(generation) : null,
    [lineage_key(user_id)]: JSON.stringify(
      union(read_lineage(user_id), fingerprints),
    ),
  });
}

export function is_rolled_back_vault(
  user_id: string,
  vault: GenerationVault,
): boolean {
  return is_retired_identity(user_id, vault);
}

export const VAULT_ROLLED_BACK = "vault_rolled_back";

export class VaultRolledBackError extends Error {
  constructor() {
    super(VAULT_ROLLED_BACK);
    this.name = "VaultRolledBackError";
  }
}

export function refuse_rolled_back_vault(
  user_id: string | null | undefined,
  vault: GenerationVault,
): void {
  if (user_id && is_rolled_back_vault(user_id, vault)) {
    throw new VaultRolledBackError();
  }
}

export function apply_generation_markers(
  user_id: string,
  merged: EncryptedVault,
  ...sources: GenerationVault[]
): void {
  const own = vault_fingerprints(merged);
  const retired = union(
    read_retired(user_id),
    ...sources.map((source) =>
      string_list(source.retired_identity_fingerprints),
    ),
  ).filter((id) => !own.includes(id));

  if (retired.length > 0) {
    merged.retired_identity_fingerprints = retired;
  } else {
    delete merged.retired_identity_fingerprints;
  }

  delete merged.vault_generation_ready;
}

export function next_vault_generation(
  user_id: string,
  ...vaults: GenerationVault[]
): number {
  return (
    Math.max(
      read_vault_generation_pin(user_id),
      ...vaults.map((vault) => vault_generation(vault)),
    ) + 1
  );
}
