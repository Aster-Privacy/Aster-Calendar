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
import { describe, it, expect, beforeEach } from "vitest";

import {
  append_keks_to_list,
  clear_legacy_keks_from_memory,
  decrypt_aes_gcm_with_fallback,
  decrypt_with_legacy_derived_keys,
  load_legacy_keks_into_memory,
  load_previous_key_derived_keks_into_memory,
  prepend_kek_to_list,
  sealed_under_public_constant,
  serialize_kek_for_vault,
} from "./legacy_keks";

const PUBLIC_CONTEXTS = [
  "astermail-envelope-v1",
  "astermail-import-v1",
  "astermail-preferences-v1",
  "astermail-calendar-v2",
];

async function sha256_raw(text: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );

  return new Uint8Array(digest);
}

async function seal(raw: Uint8Array, plaintext: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );

  return { ciphertext, nonce };
}

async function unrelated_primary(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    crypto.getRandomValues(new Uint8Array(32)),
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

async function opens(raw: Uint8Array): Promise<boolean> {
  const { ciphertext, nonce } = await seal(raw, "stored row");

  try {
    const plain = await decrypt_aes_gcm_with_fallback(
      await unrelated_primary(),
      ciphertext,
      nonce,
    );

    return new TextDecoder().decode(plain) === "stored row";
  } catch {
    return false;
  }
}

describe("legacy key pool and publicly computable keys", () => {
  beforeEach(() => {
    clear_legacy_keks_from_memory();
  });

  it.each(PUBLIC_CONTEXTS)(
    "a stored key equal to the public constant for %s opens nothing",
    async (context) => {
      const raw = await sha256_raw("undefined" + context);

      await load_legacy_keks_into_memory([
        serialize_kek_for_vault(new Uint8Array(raw)),
      ]);

      expect(await opens(raw)).toBe(false);
    },
  );

  it("a previous key of undefined adds no usable keys", async () => {
    await load_previous_key_derived_keks_into_memory(["undefined"]);

    expect(await opens(await sha256_raw("undefinedastermail-tags-v1"))).toBe(
      false,
    );
  });

  it.each([
    [" undefined ", "astermail-scheduled-v1"],
    ["null", "astermail-preferences-v1"],
    ["NaN", "astermail-calendar-v1"],
    ["[object Object]", "astermail-tags-v1"],
    ["", "astermail-labels-v1"],
  ])(
    "a placeholder previous key %j adds no key for %s",
    async (previous_key, context) => {
      await load_previous_key_derived_keks_into_memory([previous_key]);

      expect(await opens(await sha256_raw(previous_key + context))).toBe(
        false,
      );
    },
  );

  it("a real previous key next to a placeholder still opens its rows", async () => {
    await load_previous_key_derived_keks_into_memory([
      "null",
      "identity-old",
    ]);

    expect(
      await opens(await sha256_raw("identity-oldastermail-calendar-v1")),
    ).toBe(true);
  });

  it("derived reads never use a public constant as the base key", async () => {
    const raw = await sha256_raw("undefinedastermail-envelope-v1");

    await load_legacy_keks_into_memory([
      serialize_kek_for_vault(new Uint8Array(raw)),
    ]);

    let derivations = 0;
    const result = await decrypt_with_legacy_derived_keys(
      async (base) => {
        derivations += 1;

        return crypto.subtle.deriveKey(
          {
            name: "HKDF",
            hash: "SHA-256",
            salt: new Uint8Array(32),
            info: new Uint8Array(0),
          },
          base,
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"],
        );
      },
      new Uint8Array(32),
      new Uint8Array(12),
    );

    expect(result).toBeNull();
    expect(derivations).toBe(0);
  });

  it("an ordinary older key still opens stored data", async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32));

    await load_legacy_keks_into_memory([
      serialize_kek_for_vault(new Uint8Array(raw)),
    ]);

    expect(await opens(raw)).toBe(true);
  });
});

describe("vault key list writes", () => {
  it("never stores a key anyone can derive", async () => {
    const real = serialize_kek_for_vault(new Uint8Array(32).fill(9));
    const constant = serialize_kek_for_vault(
      await sha256_raw("undefinedastermail-labels-v1"),
    );

    const prepended = prepend_kek_to_list([real], constant);
    const { list: appended } = append_keks_to_list([real], [constant]);

    expect(prepended.map((entry) => entry.k)).toEqual([real.k]);
    expect(appended.map((entry) => entry.k)).toEqual([real.k]);
  });

  it("drops a stored constant the next time the list is written", async () => {
    const real = serialize_kek_for_vault(new Uint8Array(32).fill(9));
    const newer = serialize_kek_for_vault(new Uint8Array(32).fill(4));
    const constant = serialize_kek_for_vault(
      await sha256_raw("undefinedastermail-preferences-v1"),
    );

    const prepended = prepend_kek_to_list([constant, real], newer);
    const { list: appended } = append_keks_to_list([constant, real], [newer]);

    expect(prepended.map((entry) => entry.k)).toEqual([newer.k, real.k]);
    expect(appended.map((entry) => entry.k)).toEqual([real.k, newer.k]);
  });
});

describe("blobs sealed under a public constant", () => {
  it("recognizes a blob sealed under a public constant", async () => {
    const { ciphertext, nonce } = await seal(
      await sha256_raw("undefinedastermail-preferences-v1"),
      "{}",
    );

    expect(await sealed_under_public_constant(ciphertext, nonce)).toBe(true);
  });

  it("does not flag a blob sealed under a real key", async () => {
    const { ciphertext, nonce } = await seal(
      crypto.getRandomValues(new Uint8Array(32)),
      "{}",
    );

    expect(await sealed_under_public_constant(ciphertext, nonce)).toBe(false);
  });
});
