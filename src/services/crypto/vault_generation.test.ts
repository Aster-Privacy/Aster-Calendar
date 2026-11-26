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

import { afterEach, describe, expect, it } from "vitest";

import {
  apply_generation_markers,
  is_rolled_back_vault,
  next_vault_generation,
  pin_vault_generation,
  read_vault_generation_pin,
} from "./vault_generation";

const USER_ID = "user-generation";

function at(
  generation?: number,
  identity_key = "identity-a",
  previous_keys: string[] = [],
): EncryptedVault {
  const vault: Record<string, unknown> = { identity_key, previous_keys };

  if (generation !== undefined) vault.vault_generation = generation;

  return vault as unknown as EncryptedVault;
}

function written_by_another_app(source: EncryptedVault): EncryptedVault {
  const copy = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;

  delete copy.vault_generation;
  delete copy.vault_generation_ready;
  delete copy.retired_identity_fingerprints;

  return copy as unknown as EncryptedVault;
}

function replace_keys_with(identity_key: string): void {
  pin_vault_generation(USER_ID, at(undefined, identity_key));
}

afterEach(() => {
  localStorage.clear();
});

describe("vault generation pin", () => {
  it("never lowers the pin when an older vault is stored", () => {
    pin_vault_generation(USER_ID, at(7));
    pin_vault_generation(USER_ID, at(3));
    pin_vault_generation(USER_ID, at());

    expect(read_vault_generation_pin(USER_ID)).toBe(7);
    expect(next_vault_generation(USER_ID, at(3))).toBe(8);
  });

  it("accepts a vault without a generation before one is pinned", () => {
    expect(is_rolled_back_vault(USER_ID, at())).toBe(false);

    pin_vault_generation(USER_ID, at());

    expect(read_vault_generation_pin(USER_ID)).toBe(0);
  });
});

describe("vaults written by other apps", () => {
  it("accepts a vault with no generation fields after a pin is set", () => {
    const own = at(9, "identity-a", ["identity-old"]);

    pin_vault_generation(USER_ID, own);

    const foreign = written_by_another_app(own);

    expect(is_rolled_back_vault(USER_ID, foreign)).toBe(false);

    pin_vault_generation(USER_ID, foreign);

    expect(read_vault_generation_pin(USER_ID)).toBe(9);
    expect(next_vault_generation(USER_ID, foreign)).toBe(10);
  });

  it("accepts a vault that kept the fields but did not move the generation", () => {
    pin_vault_generation(USER_ID, at(9));
    pin_vault_generation(USER_ID, at(12));

    expect(is_rolled_back_vault(USER_ID, at(9))).toBe(false);
  });

  it("accepts an older copy restored with a recovery code", () => {
    pin_vault_generation(USER_ID, at(40));

    expect(is_rolled_back_vault(USER_ID, at(25))).toBe(false);
    expect(is_rolled_back_vault(USER_ID, at(undefined))).toBe(false);
  });

  it("accepts a vault whose identity is an earlier key of the same account", () => {
    pin_vault_generation(USER_ID, at(6, "identity-c", ["identity-old"]));

    expect(is_rolled_back_vault(USER_ID, at(undefined, "identity-old"))).toBe(
      false,
    );
  });

  it("accepts a key rotation done by another app", () => {
    pin_vault_generation(USER_ID, at(6, "identity-a"));

    const rotated = written_by_another_app(
      at(undefined, "identity-b", ["identity-a"]),
    );

    expect(is_rolled_back_vault(USER_ID, rotated)).toBe(false);

    pin_vault_generation(USER_ID, rotated);

    expect(is_rolled_back_vault(USER_ID, at(undefined, "identity-a"))).toBe(
      false,
    );
  });

  it("never writes the old ready marker into the vault", () => {
    const merged = {
      ...at(3),
      vault_generation_ready: true,
    } as EncryptedVault;

    apply_generation_markers(USER_ID, merged, {
      ...at(2),
      vault_generation_ready: true,
    } as EncryptedVault);

    expect("vault_generation_ready" in merged).toBe(false);
  });

  it("ignores a ready flag left on this device by an earlier version", () => {
    pin_vault_generation(USER_ID, at(4));
    localStorage.setItem(`astermail_vault_generation_ready_${USER_ID}`, "1");
    localStorage.setItem(
      `astermail_vault_current_identity_${USER_ID}`,
      "fingerprint-of-something-else",
    );

    expect(is_rolled_back_vault(USER_ID, at())).toBe(false);
    expect(is_rolled_back_vault(USER_ID, at(0))).toBe(false);
  });
});

describe("vault holding keys the account replaced", () => {
  it("refuses a vault whose identity was replaced by new keys", () => {
    pin_vault_generation(USER_ID, at(4));
    replace_keys_with("identity-b");

    expect(read_vault_generation_pin(USER_ID)).toBe(0);
    expect(is_rolled_back_vault(USER_ID, at(undefined, "identity-a"))).toBe(
      true,
    );
    expect(is_rolled_back_vault(USER_ID, at(99, "identity-a"))).toBe(true);
    expect(is_rolled_back_vault(USER_ID, at(undefined, "identity-b"))).toBe(
      false,
    );
  });

  it("carries replaced identities through the vault to a fresh device", () => {
    pin_vault_generation(USER_ID, at(4));
    replace_keys_with("identity-b");

    const written = at(1, "identity-b");

    apply_generation_markers(USER_ID, written, at(undefined, "identity-b"));

    expect(written.retired_identity_fingerprints?.length).toBe(1);

    localStorage.clear();
    pin_vault_generation(USER_ID, written);

    expect(is_rolled_back_vault(USER_ID, at(undefined, "identity-a"))).toBe(
      true,
    );
    expect(is_rolled_back_vault(USER_ID, at(undefined, "identity-b"))).toBe(
      false,
    );
  });

  it("keeps the replaced identities when another app drops the field", () => {
    pin_vault_generation(USER_ID, at(4));
    replace_keys_with("identity-b");
    pin_vault_generation(
      USER_ID,
      written_by_another_app(at(undefined, "identity-b")),
    );

    expect(is_rolled_back_vault(USER_ID, at(undefined, "identity-a"))).toBe(
      true,
    );
  });

  it("does not let a refused vault change the pinned state", () => {
    pin_vault_generation(USER_ID, at(4));
    replace_keys_with("identity-b");
    pin_vault_generation(USER_ID, at(8, "identity-b"));
    pin_vault_generation(USER_ID, at(50, "identity-a"));

    expect(read_vault_generation_pin(USER_ID)).toBe(8);
    expect(is_rolled_back_vault(USER_ID, at(undefined, "identity-a"))).toBe(
      true,
    );
  });
});
