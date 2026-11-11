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
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  vault: null as { identity_key: string; previous_keys: string[] } | null,
  get_recipient_public_key: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/memory_key_store")
  >()),
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => PASS,
}));

vi.mock("@/services/api/keys", () => ({
  get_recipient_public_key: h.get_recipient_public_key,
}));

import {
  generate_identity_keypair,
  derive_public_keys_from_private,
} from "@/services/crypto/key_manager_pgp";
import {
  seal_grant,
  open_grant,
  unseal_grant,
  get_own_grant_public_key,
  get_grant_signing_keys,
  SHARED_MAILBOX_GRANT_VERSION,
  type SharedMailboxGrantPayload,
} from "@/services/crypto/shared_mailbox";

const PASS = "owner-vault-pass-1234567890";
const SERVER_PASS = "server-vault-pass-1234567890";

function payload(): SharedMailboxGrantPayload {
  return {
    v: SHARED_MAILBOX_GRANT_VERSION,
    mailbox_user_id: "pending",
    email: "family@astermail.org",
    login_secret: "c2VjcmV0LWxvZ2luLXNlY3JldC0zMi1ieXRlcw==",
  };
}

describe("owner grant recipient key", () => {
  beforeEach(() => {
    h.vault = null;
    h.get_recipient_public_key.mockReset();
  });

  it("derives the owner key from the unlocked vault without asking the server", async () => {
    const owner = await generate_identity_keypair(
      "Owner",
      "owner@astermail.org",
      PASS,
    );
    const server_chosen = await generate_identity_keypair(
      "Server",
      "owner@astermail.org",
      SERVER_PASS,
    );

    h.vault = { identity_key: owner.secret_key, previous_keys: [] };
    h.get_recipient_public_key.mockResolvedValue({
      data: { public_key: server_chosen.public_key },
    });

    const own_public_key = await get_own_grant_public_key();
    const [expected] = await derive_public_keys_from_private([
      owner.secret_key,
    ]);

    expect(own_public_key).toBe(expected);
    expect(own_public_key).not.toBe(server_chosen.public_key);
    expect(h.get_recipient_public_key).not.toHaveBeenCalled();
  });

  it("seals an owner grant that only the vault key can open", async () => {
    const owner = await generate_identity_keypair(
      "Owner",
      "owner@astermail.org",
      PASS,
    );
    const server_chosen = await generate_identity_keypair(
      "Server",
      "owner@astermail.org",
      SERVER_PASS,
    );

    h.vault = { identity_key: owner.secret_key, previous_keys: [] };
    h.get_recipient_public_key.mockResolvedValue({
      data: { public_key: server_chosen.public_key },
    });

    const own_public_key = await get_own_grant_public_key();
    const wrapped = await seal_grant(
      payload(),
      own_public_key,
      get_grant_signing_keys(),
    );
    const opened = await open_grant(wrapped, [owner.secret_key], PASS, [
      own_public_key,
    ]);

    expect(opened.verified).toBe(true);
    expect(opened.payload.login_secret).toBe(payload().login_secret);
    await expect(
      unseal_grant(
        wrapped,
        server_chosen.secret_key,
        SERVER_PASS,
        own_public_key,
      ),
    ).rejects.toThrow();
    expect(h.get_recipient_public_key).not.toHaveBeenCalled();
  });

  it("refuses to pick a key while the vault is locked", async () => {
    await expect(get_own_grant_public_key()).rejects.toThrow();
    expect(h.get_recipient_public_key).not.toHaveBeenCalled();
  });
});
