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
import { describe, it, expect, beforeAll } from "vitest";
import * as openpgp from "openpgp";

import { encrypt_message, encrypt_message_multi } from "./key_manager_pgp";

interface generated_pair {
  public_armored: string;
  private_key: openpgp.PrivateKey;
}

const DAY_SECONDS = 86400;
const DAY_MS = DAY_SECONDS * 1000;
const ENCRYPT_FLAGS =
  openpgp.enums.keyFlags.encryptCommunication |
  openpgp.enums.keyFlags.encryptStorage;
const SIGN_FLAGS = openpgp.enums.keyFlags.signData;

interface binding_options {
  created: Date;
  flags: number;
  expiry_seconds?: number;
}

type sign_with_config = (
  key: Parameters<openpgp.SignaturePacket["sign"]>[0],
  data: object,
  date: Date,
  detached: boolean,
  config: openpgp.Config,
) => Promise<void>;

function days_from_now(days: number): Date {
  return new Date(Math.floor((Date.now() + days * DAY_MS) / 1000) * 1000);
}

async function generate_pair(
  email: string,
  date: Date = new Date(),
): Promise<generated_pair> {
  const generated = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: "Recipient", email }],
    date,
    format: "object",
  });

  return {
    public_armored: generated.publicKey.armor(),
    private_key: generated.privateKey,
  };
}

async function read_public(armored: string): Promise<openpgp.PublicKey> {
  return openpgp.readKey({ armoredKey: armored }) as Promise<openpgp.PublicKey>;
}

async function recipient_key_ids(ciphertext: string): Promise<string[]> {
  const message = await openpgp.readMessage({ armoredMessage: ciphertext });

  return message.getEncryptionKeyIDs().map((id) => id.toHex());
}

async function binding_signature(
  pair: generated_pair,
  options: binding_options,
): Promise<openpgp.SignaturePacket> {
  const signature = new openpgp.SignaturePacket();

  signature.signatureType = openpgp.enums.signature.subkeyBinding;
  signature.publicKeyAlgorithm = pair.private_key.keyPacket.algorithm;
  signature.hashAlgorithm = openpgp.enums.hash.sha256;
  signature.keyFlags = new Uint8Array([options.flags]);
  if (options.expiry_seconds !== undefined) {
    signature.keyExpirationTime = options.expiry_seconds;
    signature.keyNeverExpires = false;
  }
  const sign = signature.sign.bind(signature) as unknown as sign_with_config;

  await sign(
    pair.private_key.keyPacket as never,
    {
      key: pair.private_key.keyPacket,
      bind: pair.private_key.subkeys[0].keyPacket,
    },
    options.created,
    false,
    openpgp.config,
  );

  return signature;
}

async function with_bindings(
  pair: generated_pair,
  bindings: binding_options[],
): Promise<string> {
  const key = await read_public(pair.public_armored);

  key.subkeys[0].bindingSignatures = await Promise.all(
    bindings.map((options) => binding_signature(pair, options)),
  );

  return key.armor();
}

let owner: generated_pair;
let other: generated_pair;

beforeAll(async () => {
  owner = await generate_pair("owner@astermail.org");
  other = await generate_pair("other@astermail.org");
});

describe("recipient subkey binding", () => {
  it("encrypts to a subkey the primary key certified", async () => {
    const key = await read_public(owner.public_armored);
    const ciphertext = await encrypt_message("body", owner.public_armored);

    expect(await recipient_key_ids(ciphertext)).toEqual([
      key.subkeys[0].getKeyID().toHex(),
    ]);
  });

  it("refuses a subkey with no binding signature", async () => {
    const key = await read_public(owner.public_armored);

    key.subkeys[0].bindingSignatures = [];
    const armored = key.armor();

    await expect(encrypt_message("body", armored)).rejects.toThrow();
    await expect(encrypt_message_multi("body", [armored])).rejects.toThrow();
  });

  it("refuses a subkey certified by another key", async () => {
    const key = await read_public(owner.public_armored);
    const foreign = await read_public(other.public_armored);

    key.subkeys = [foreign.subkeys[0]];
    const armored = key.armor();
    const reread = await read_public(armored);

    expect(reread.subkeys[0].getKeyID().toHex()).toBe(
      foreign.subkeys[0].getKeyID().toHex(),
    );
    await expect(encrypt_message("body", armored)).rejects.toThrow();
    await expect(encrypt_message_multi("body", [armored])).rejects.toThrow();
  });

  it("ignores a subkey revocation made by another key", async () => {
    const key = await read_public(owner.public_armored);
    const foreign_revoked = await other.private_key.subkeys[0].revoke(
      other.private_key.keyPacket as never,
    );

    key.subkeys[0].revocationSignatures = foreign_revoked.revocationSignatures;
    const armored = key.armor();
    const reread = await read_public(armored);

    expect(reread.subkeys[0].revocationSignatures.length).toBe(1);

    const ciphertext = await encrypt_message("body", armored);

    expect(await recipient_key_ids(ciphertext)).toEqual([
      key.subkeys[0].getKeyID().toHex(),
    ]);
  });

  it("refuses a subkey the primary key revoked", async () => {
    const key = await read_public(owner.public_armored);
    const revoked = await owner.private_key.subkeys[0].revoke(
      owner.private_key.keyPacket as never,
    );

    key.subkeys[0].revocationSignatures = revoked.revocationSignatures;
    const armored = key.armor();

    await expect(encrypt_message("body", armored)).rejects.toThrow();
  });
});

describe("recipient key validity", () => {
  let aged: generated_pair;

  beforeAll(async () => {
    aged = await generate_pair("aged@astermail.org", days_from_now(-10));
  });

  it("encrypts while the newest binding is current", async () => {
    const armored = await with_bindings(aged, [
      {
        created: days_from_now(-9),
        flags: ENCRYPT_FLAGS,
        expiry_seconds: 30 * DAY_SECONDS,
      },
    ]);

    await expect(encrypt_message("body", armored)).resolves.toContain(
      "BEGIN PGP MESSAGE",
    );
  });

  it("uses the newest binding when it shortens the expiry", async () => {
    const armored = await with_bindings(aged, [
      {
        created: days_from_now(-9),
        flags: ENCRYPT_FLAGS,
        expiry_seconds: 30 * DAY_SECONDS,
      },
      {
        created: days_from_now(-1),
        flags: ENCRYPT_FLAGS,
        expiry_seconds: 2 * DAY_SECONDS,
      },
    ]);

    await expect(encrypt_message("body", armored)).rejects.toThrow();
    await expect(encrypt_message_multi("body", [armored])).rejects.toThrow();
  });

  it("refuses a subkey whose only binding has expired", async () => {
    const armored = await with_bindings(aged, [
      {
        created: days_from_now(-9),
        flags: ENCRYPT_FLAGS,
        expiry_seconds: DAY_SECONDS,
      },
    ]);

    await expect(encrypt_message("body", armored)).rejects.toThrow();
  });

  it("uses the newest binding when it removes encryption flags", async () => {
    const armored = await with_bindings(aged, [
      { created: days_from_now(-9), flags: ENCRYPT_FLAGS },
      { created: days_from_now(-1), flags: SIGN_FLAGS },
    ]);

    await expect(encrypt_message("body", armored)).rejects.toThrow();
    await expect(encrypt_message_multi("body", [armored])).rejects.toThrow();
  });

  it("refuses a key whose primary key is revoked", async () => {
    const revoking = await generate_pair("revoked@astermail.org");
    const { publicKey } = await openpgp.revokeKey({
      key: revoking.private_key,
      format: "armored",
    });

    await expect(
      encrypt_message("body", revoking.public_armored),
    ).resolves.toContain("BEGIN PGP MESSAGE");
    await expect(encrypt_message("body", publicKey)).rejects.toThrow();
    await expect(encrypt_message_multi("body", [publicKey])).rejects.toThrow();
  });
});
