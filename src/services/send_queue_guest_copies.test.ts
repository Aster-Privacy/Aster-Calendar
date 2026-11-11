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
  discovered: [] as Record<string, unknown>[],
  discovery_error: undefined as string | undefined,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({
    identity_key: "identity-secret",
    ratchet_identity_key: "",
    ratchet_identity_public: "",
  }),
  get_passphrase_from_memory: () => "passphrase",
  get_passphrase_bytes: () => new Uint8Array(32).fill(7),
  has_passphrase_in_memory: () => true,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: vi.fn(async () => ({
    user: { id: "user-1", username: "owner", email: "owner@astermail.org" },
  })),
}));

vi.mock("@/stores/ghost_alias_store", () => ({
  is_ghost_email: () => false,
  looks_like_unregistered_ghost_email: () => false,
}));

vi.mock("@/services/api/keys", async (import_original) => {
  const actual = await import_original<Record<string, unknown>>();

  return {
    ...actual,
    get_recipient_public_key: vi.fn(async () => ({
      data: { public_key: "recipient-public-key" },
    })),
    discover_external_keys_batch: vi.fn(async () =>
      h.discovery_error
        ? { error: h.discovery_error }
        : { data: h.discovered },
    ),
  };
});

vi.mock("@/services/crypto/ratchet_identity_pin", () => ({
  check_owner_key_pin: vi.fn(async () => "ok"),
  is_recipient_flagged_untrusted: vi.fn(async () => false),
  flag_recipient_untrusted: vi.fn(async () => undefined),
}));

vi.mock("@/services/crypto/key_manager", () => ({
  encrypt_message_multi: vi.fn(async () => "PGP-CIPHERTEXT"),
}));

vi.mock("@/services/api/send", () => ({
  send_simple_email: vi.fn(async () => ({
    data: { success: true, mail_item_id: "mail-1" },
  })),
  send_external_email: vi.fn(async () => ({ data: { success: true } })),
}));

vi.mock("@/services/api/attachments", () => ({
  create_attachment: vi.fn(async () => ({ data: {} })),
}));

vi.mock("@/services/crypto/mail_metadata_core", () => ({
  encrypt_mail_metadata: vi.fn(async () => ({
    encrypted_metadata: "meta-ct",
    metadata_nonce: "meta-nonce",
  })),
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  encrypt_attachments_for_send: vi.fn(async () => [
    { encrypted_data: "sealed-attachment" },
  ]),
  prepare_external_attachments: vi.fn(() => []),
}));

vi.mock("@/services/crypto/ensure_ratchet_keys", () => ({
  ensure_ratchet_keys: vi.fn(async () => {}),
}));

vi.mock("@/utils/email_crypto", () => ({
  discover_external_recipient_keys: vi.fn(async () => ({
    recipients_with_keys: [],
  })),
  build_subject_bundle: (subject: string, body: string) => `${subject} ${body}`,
  derive_own_public_key: vi.fn(async () => "own-public-key"),
}));

vi.mock("@/services/api/domains", () => ({
  add_domain_address: vi.fn(),
}));

vi.mock("./send_queue_signed_mime", async (import_original) => {
  const actual = await import_original<Record<string, unknown>>();

  return {
    ...actual,
    build_signed_mime_payload: vi.fn(async () => undefined),
  };
});

import { execute_send } from "./send_queue_encryption";
import { send_simple_email } from "./api/send";
import { discover_external_keys_batch } from "./api/keys";
import { encrypt_attachments_for_send } from "./crypto/attachment_crypto";

import type { QueuedEmailInternal } from "./send_queue_types";

const GUEST = "guest@example.com";
const TITLE = "Quarterly planning";
const BODY = "Host invited you\n\nWhen: Monday <10:00> & later";
const ICS = "BEGIN:VCALENDAR\r\nSUMMARY:Quarterly planning\r\nEND:VCALENDAR";

let guest_public_key = "";
let guest_private_key = "";
let other_public_key = "";

function invite_attachment() {
  const bytes = new TextEncoder().encode(ICS);

  return {
    id: "attachment-1",
    name: "invite.ics",
    size: `${bytes.byteLength} B`,
    size_bytes: bytes.byteLength,
    mime_type: "text/calendar; method=REQUEST",
    data: bytes.buffer.slice(0),
  };
}

function queued(
  overrides: Partial<QueuedEmailInternal> = {},
): QueuedEmailInternal {
  return {
    id: "queued-1",
    to: [GUEST],
    subject: TITLE,
    body: BODY,
    is_plain_text: true,
    attachments: [invite_attachment()],
    allow_non_post_quantum: true,
    scheduled_time: Date.now(),
    timeout_id: 0,
    callbacks: { on_complete: () => {}, on_cancel: () => {} },
    ...overrides,
  } as QueuedEmailInternal;
}

function keyed(
  overrides: Partial<QueuedEmailInternal> = {},
): QueuedEmailInternal {
  return queued({
    pgp_recipients: [GUEST],
    pgp_recipient_keys: { [GUEST]: guest_public_key },
    obscure_subject: true,
    ...overrides,
  });
}

function last_request() {
  return vi.mocked(send_simple_email).mock.calls[0][0];
}

async function open_copy(armored: string): Promise<string> {
  const message = await openpgp.readMessage({ armoredMessage: armored });
  const private_key = await openpgp.readPrivateKey({
    armoredKey: guest_private_key,
  });
  const { data } = await openpgp.decrypt({
    message,
    decryptionKeys: private_key,
    format: "binary",
  });

  return new TextDecoder().decode(data as Uint8Array);
}

function decode_base64_parts(mime: string): string {
  return mime
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
  const guest = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email: GUEST }],
    format: "armored",
  });
  const other = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email: "other@example.com" }],
    format: "armored",
  });

  guest_public_key = guest.publicKey;
  guest_private_key = guest.privateKey;
  other_public_key = other.publicKey;
});

beforeEach(() => {
  h.discovered = [];
  h.discovery_error = undefined;
  vi.clearAllMocks();
});

describe("guest with a shown key", () => {
  it("sends only ciphertext for the title, body, and invite", async () => {
    await execute_send(keyed());

    const request = last_request();
    const serialized = JSON.stringify(request);

    expect(request.body).toBe(" ");
    expect(request.subject).toBe("");
    expect(request.obscure_subject).toBe(true);
    expect(request.is_e2e_encrypted).toBe(false);
    expect(Object.keys(request.external_pgp_bodies ?? {})).toEqual([GUEST]);
    expect(request.external_pgp_bodies?.[GUEST]).toContain(
      "-----BEGIN PGP MESSAGE-----",
    );
    expect(serialized).not.toContain(TITLE);
    expect(serialized).not.toContain("Host invited you");
    expect(serialized).not.toContain("VCALENDAR");
  });

  it("puts the title, body, and invite inside the encrypted copy", async () => {
    await execute_send(keyed());

    const mime = await open_copy(
      last_request().external_pgp_bodies?.[GUEST] ?? "",
    );
    const decoded = decode_base64_parts(mime);

    expect(mime).toContain(`Subject: ${TITLE}`);
    expect(mime).toContain('name="invite.ics"');
    expect(decoded).toContain("Host invited you\r\n\r\nWhen: Monday <10:00> & later");
    expect(decoded).toContain(ICS);
  });

  it("encrypts with the shown key and skips a second lookup", async () => {
    h.discovered = [
      {
        email: GUEST,
        found: true,
        public_key: other_public_key,
        will_encrypt: true,
      },
    ];

    await execute_send(keyed());

    expect(vi.mocked(discover_external_keys_batch)).not.toHaveBeenCalled();
    await expect(
      open_copy(last_request().external_pgp_bodies?.[GUEST] ?? ""),
    ).resolves.toContain(`Subject: ${TITLE}`);
  });

  it("seals the uploaded invite so the server cannot open it", async () => {
    await execute_send(keyed());

    expect(vi.mocked(encrypt_attachments_for_send)).toHaveBeenCalledWith(
      expect.any(Array),
      ["own-public-key"],
      true,
      {},
      null,
    );
  });

  it("keeps the real subject on the wire when it is not obscured", async () => {
    await execute_send(keyed({ obscure_subject: false }));

    const request = last_request();

    expect(request.subject).toBe(TITLE);
    expect(request.obscure_subject).toBe(false);
    expect(request.body).toBe(" ");
  });
});

describe("a promised copy that cannot be built", () => {
  it("stops the send when the shown key is unusable", async () => {
    await expect(
      execute_send(keyed({ pgp_recipient_keys: { [GUEST]: "not a key" } })),
    ).rejects.toMatchObject({ type: "encryption_failed" });

    expect(vi.mocked(send_simple_email)).not.toHaveBeenCalled();
  });

  it("stops the send when no key is available", async () => {
    await expect(
      execute_send(keyed({ pgp_recipient_keys: undefined })),
    ).rejects.toMatchObject({ type: "encryption_failed" });

    expect(vi.mocked(send_simple_email)).not.toHaveBeenCalled();
  });

  it("stops the send when the key lookup fails", async () => {
    h.discovery_error = "unavailable";

    await expect(
      execute_send(keyed({ pgp_recipient_keys: undefined })),
    ).rejects.toMatchObject({ type: "encryption_failed" });

    expect(vi.mocked(send_simple_email)).not.toHaveBeenCalled();
  });

  it("stops the send when another outside recipient has no key", async () => {
    await expect(
      execute_send(keyed({ to: [GUEST, "nokey@example.com"] })),
    ).rejects.toMatchObject({ type: "encryption_failed" });

    expect(vi.mocked(send_simple_email)).not.toHaveBeenCalled();
  });

  it("stops the send when the message carries an expiry", async () => {
    await expect(
      execute_send(keyed({ expires_at: "2030-01-01T00:00:00Z" })),
    ).rejects.toMatchObject({ type: "encryption_failed" });

    expect(vi.mocked(send_simple_email)).not.toHaveBeenCalled();
  });
});

describe("other recipient kinds are unchanged", () => {
  it("sends a plain invite to a guest without a key", async () => {
    await execute_send(queued());

    const request = last_request();

    expect(request.body).toBe(BODY);
    expect(request.subject).toBe(TITLE);
    expect(request.is_e2e_encrypted).toBe(false);
    expect("external_pgp_bodies" in request).toBe(false);
    expect("obscure_subject" in request).toBe(false);
    expect(vi.mocked(discover_external_keys_batch)).not.toHaveBeenCalled();
    expect(vi.mocked(encrypt_attachments_for_send)).toHaveBeenCalledWith(
      expect.any(Array),
      undefined,
      false,
      {},
      null,
    );
  });

  it("keeps the sealed path for an internal guest", async () => {
    await execute_send(
      keyed({
        to: ["friend@astermail.org"],
        pgp_recipients: ["friend@astermail.org"],
        pgp_recipient_keys: { "friend@astermail.org": guest_public_key },
      }),
    );

    const request = last_request();

    expect(request.is_e2e_encrypted).toBe(true);
    expect(request.body).toBe("PGP-CIPHERTEXT");
    expect(request.subject).toBe("");
    expect("external_pgp_bodies" in request).toBe(false);
    expect("obscure_subject" in request).toBe(false);
  });
});
