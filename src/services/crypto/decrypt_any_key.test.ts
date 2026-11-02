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

import { describe, it, expect } from "vitest";
import * as openpgp from "openpgp";

import {
  decrypt_message_with_any_key,
  decrypt_message_verified_with_any_key,
} from "./key_manager_pgp";

async function make_key(email: string, passphrase: string) {
  return openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: email, email }],
    passphrase,
    format: "armored",
  });
}

async function encrypt_to(public_key_armored: string, text: string) {
  return (await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys: await openpgp.readKey({ armoredKey: public_key_armored }),
    format: "armored",
  })) as string;
}

describe("decrypt_message_with_any_key", () => {
  const pass = "pw";

  it("decrypts with a key that is not first in the list", async () => {
    const a = await make_key("a@x.com", pass);
    const b = await make_key("b@x.com", pass);
    const ct = await encrypt_to(b.publicKey, "hi");

    const out = await decrypt_message_with_any_key(
      ct,
      [a.privateKey, b.privateKey],
      pass,
    );

    expect(out).toBe("hi");
  });

  it("throws when no key matches", async () => {
    const a = await make_key("a@x.com", pass);
    const stranger = await make_key("s@x.com", pass);
    const ct = await encrypt_to(stranger.publicKey, "hi");

    await expect(
      decrypt_message_with_any_key(ct, [a.privateKey], pass),
    ).rejects.toThrow();
  });

  it("ignores null/empty entries and throws on empty list", async () => {
    await expect(
      decrypt_message_with_any_key("x", [null, undefined, ""], pass),
    ).rejects.toThrow("no decryption key available");
  });

  it("verified variant decrypts with a later key", async () => {
    const a = await make_key("a@x.com", pass);
    const b = await make_key("b@x.com", pass);
    const ct = await encrypt_to(b.publicKey, "verified");

    const res = await decrypt_message_verified_with_any_key(
      ct,
      [a.privateKey, b.privateKey],
      pass,
    );

    expect(res.plaintext).toBe("verified");
  });
});
