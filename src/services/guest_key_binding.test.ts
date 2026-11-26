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
import * as openpgp from "openpgp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("./api/client", () => ({
  api_client: { get: h.get, post: h.post },
}));

vi.mock("@/services/crypto/memory_key_store", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
}));

vi.mock("@/services/crypto/encrypted_storage", async () => ({
  ...(
    await import("@/tests/fixtures/storage_name_support")
  ).storage_name_support(h.store),
  encrypted_get: vi.fn(async (key: string) =>
    h.store.has(key) ? JSON.parse(JSON.stringify(h.store.get(key))) : null,
  ),
  encrypted_set: vi.fn(async (key: string, value: unknown) => {
    h.store.set(key, JSON.parse(JSON.stringify(value)));
  }),
  encrypted_delete: vi.fn(async (key: string) => {
    h.store.delete(key);
  }),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "acct-1",
}));

vi.mock("./send_queue_signed_mime", async (import_original) => {
  const actual = await import_original<Record<string, unknown>>();

  return {
    ...actual,
    build_signed_mime_payload: vi.fn(async () => undefined),
  };
});

import {
  clear_external_key_cache,
  discover_external_key,
  discover_external_keys_batch,
} from "./api/keys";
import { build_client_pgp_copies } from "./client_pgp_copies";
import { lookup_owner_key_pin } from "./crypto/ratchet_identity_pin";

import { guest_key_status } from "@/components/calendar/guest_encryption_lock";
import { get_active_translations } from "@/lib/i18n/translations";

const BOB = "bob@external.example";

let bob_key = "";
let bob_private_key = "";
let bob_rotated_key = "";
let mitm_key = "";
let mixed_key = "";

async function make_key(emails: string[]) {
  return openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: emails.map((email) => ({ email })),
    format: "armored",
  });
}

async function fingerprint_of(armored: string): Promise<string> {
  return (await openpgp.readKey({ armoredKey: armored })).getFingerprint();
}

function to_base64(bytes: Uint8Array): string {
  let raw = "";

  for (const byte of bytes) raw += String.fromCharCode(byte);

  return btoa(raw);
}

function discovered(public_key: string | null, fingerprint: string | null) {
  return {
    email: BOB,
    found: public_key !== null,
    public_key,
    fingerprint,
    source: "wkd",
    expires_at: null,
    will_encrypt: public_key !== null,
  };
}

function serve_batch(public_key: string | null, fingerprint: string | null) {
  h.post.mockResolvedValue({
    data: { keys: [discovered(public_key, fingerprint)] },
  });
}

function copy_params(keys?: Record<string, string>) {
  return {
    outside_recipients: [BOB],
    pgp_recipient_keys: keys,
    obscure_subject: true,
    subject: "Planning",
    body: "Host invited you",
    from: "host@astermail.org",
    to: [BOB],
    cc: [],
    bcc: [],
    attachments: [],
    is_plain_text: true,
  };
}

async function open_copy(armored: string): Promise<string> {
  const { data } = await openpgp.decrypt({
    message: await openpgp.readMessage({ armoredMessage: armored }),
    decryptionKeys: await openpgp.readPrivateKey({
      armoredKey: bob_private_key,
    }),
    format: "binary",
  });

  return new TextDecoder().decode(data as Uint8Array);
}

async function open_body(armored: string): Promise<string> {
  return (await open_copy(armored))
    .split(/\r\n\r\n/)
    .map((part) => {
      const block = part.split(/\r\n--/)[0].replace(/\r\n/g, "");

      try {
        return new TextDecoder().decode(
          Uint8Array.from(atob(block), (c) => c.charCodeAt(0)),
        );
      } catch {
        return "";
      }
    })
    .join("\n");
}

beforeAll(async () => {
  const bob = await make_key([BOB]);

  bob_key = bob.publicKey;
  bob_private_key = bob.privateKey;
  bob_rotated_key = (await make_key([BOB])).publicKey;
  mitm_key = (await make_key(["mitm@server.example"])).publicKey;
  mixed_key = (await make_key(["other@external.example", BOB])).publicKey;
});

beforeEach(() => {
  h.store.clear();
  h.get.mockReset();
  h.post.mockReset();
  clear_external_key_cache();
});

describe("discovered guest keys", () => {
  it("rejects a key whose user IDs do not name the guest", async () => {
    serve_batch(mitm_key, await fingerprint_of(mitm_key));

    const [info] = (await discover_external_keys_batch([BOB])).data ?? [];

    expect(info.found).toBe(false);
    expect(info.public_key).toBeNull();
    expect(info.will_encrypt).toBe(false);
    expect(await guest_key_status(info)).toBe("transit");
  });

  it("rejects the same key from the single lookup", async () => {
    h.post.mockResolvedValue({
      data: discovered(mitm_key, await fingerprint_of(mitm_key)),
    });

    const result = await discover_external_key(BOB);

    expect(result.data?.found).toBe(false);
    expect(result.data?.public_key).toBeNull();
  });

  it("rejects a key that does not match the reported fingerprint", async () => {
    serve_batch(bob_key, await fingerprint_of(mitm_key));

    const [info] = (await discover_external_keys_batch([BOB])).data ?? [];

    expect(info.found).toBe(false);
    expect(info.public_key).toBeNull();
  });

  it("keeps a self-signed key bound to the guest", async () => {
    serve_batch(bob_key, await fingerprint_of(bob_key));

    const [info] = (await discover_external_keys_batch([BOB])).data ?? [];

    expect(info.found).toBe(true);
    expect(info.will_encrypt).toBe(true);
    expect(info.public_key).toBe(bob_key);
    expect(await guest_key_status(info)).toBe("encrypted");
  });

  it("keeps a key that lists the guest among several user IDs", async () => {
    serve_batch(mixed_key, null);

    const [info] = (await discover_external_keys_batch([BOB])).data ?? [];

    expect(info.found).toBe(true);
    expect(info.public_key).toBe(mixed_key);
  });

  it("reads a key delivered as base64 binary and returns it armored", async () => {
    const binary = (
      await openpgp.readKey({ armoredKey: bob_key })
    ).write() as Uint8Array;

    serve_batch(to_base64(binary), null);

    const [info] = (await discover_external_keys_batch([BOB])).data ?? [];

    expect(info.found).toBe(true);
    expect(info.public_key).toContain("-----BEGIN PGP PUBLIC KEY BLOCK-----");
    expect(await fingerprint_of(info.public_key ?? "")).toBe(
      await fingerprint_of(bob_key),
    );
  });
});

describe("encrypted guest copies", () => {
  it("never encrypts a passed copy key that does not name the guest", async () => {
    await expect(
      build_client_pgp_copies(copy_params({ [BOB]: mitm_key })),
    ).rejects.toMatchObject({ type: "encryption_failed" });

    expect(await lookup_owner_key_pin(BOB)).toBeNull();
  });

  it("never encrypts a discovered copy key that does not name the guest", async () => {
    serve_batch(mitm_key, null);

    await expect(build_client_pgp_copies(copy_params())).rejects.toMatchObject(
      { type: "encryption_failed" },
    );
    expect(await lookup_owner_key_pin(BOB)).toBeNull();
  });

  it("encrypts to the guest's key and pins it on first use", async () => {
    const copies = await build_client_pgp_copies(
      copy_params({ [BOB]: bob_key }),
    );

    expect(await open_body(copies[BOB])).toContain("Host invited you");
    expect(await lookup_owner_key_pin(BOB)).toBe(
      (await fingerprint_of(bob_key)).toLowerCase(),
    );

    const again = await build_client_pgp_copies(
      copy_params({ [BOB]: bob_key }),
    );

    expect(await open_body(again[BOB])).toContain("Host invited you");
  });

  it("refuses a different key once the guest's key is pinned", async () => {
    await build_client_pgp_copies(copy_params({ [BOB]: bob_key }));

    await expect(
      build_client_pgp_copies(copy_params({ [BOB]: bob_rotated_key })),
    ).rejects.toMatchObject({
      type: "encryption_failed",
      message: get_active_translations().errors.recipient_key_untrusted,
    });

    serve_batch(bob_rotated_key, await fingerprint_of(bob_rotated_key));

    await expect(build_client_pgp_copies(copy_params())).rejects.toMatchObject(
      { type: "encryption_failed" },
    );
    expect(await lookup_owner_key_pin(BOB)).toBe(
      (await fingerprint_of(bob_key)).toLowerCase(),
    );
  });

  it("shows a changed key as outdated instead of encrypted", async () => {
    await build_client_pgp_copies(copy_params({ [BOB]: bob_key }));
    serve_batch(bob_rotated_key, await fingerprint_of(bob_rotated_key));

    const [info] = (await discover_external_keys_batch([BOB])).data ?? [];

    expect(info.found).toBe(true);
    expect(await guest_key_status(info)).toBe("key_invalid");
  });

  it("pins a guest with no saved pin from before the upgrade", async () => {
    serve_batch(bob_key, await fingerprint_of(bob_key));

    const [info] = (await discover_external_keys_batch([BOB])).data ?? [];

    expect(await lookup_owner_key_pin(BOB)).toBeNull();
    expect(await guest_key_status(info)).toBe("encrypted");

    await build_client_pgp_copies(copy_params());

    expect(await lookup_owner_key_pin(BOB)).toBe(
      (await fingerprint_of(bob_key)).toLowerCase(),
    );
  });
});
