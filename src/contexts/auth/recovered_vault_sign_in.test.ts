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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";

import { afterEach, describe, expect, it, vi } from "vitest";

import { refuse_rolled_back_vault_with_notice } from "./rolled_back_vault_notice";

import {
  is_rolled_back_vault,
  next_vault_generation,
  pin_vault_generation,
  read_vault_generation_pin,
  VaultRolledBackError,
} from "@/services/crypto/vault_generation";

const USER_ID = "user-recovered";

function at(
  generation: number | undefined,
  identity_key = "identity-a",
): EncryptedVault {
  const vault: Record<string, unknown> = {
    identity_key,
    previous_keys: [],
  };

  if (generation !== undefined) vault.vault_generation = generation;

  return vault as unknown as EncryptedVault;
}

function pinned_browser(generation: number): void {
  pin_vault_generation(USER_ID, {
    ...at(generation),
    vault_generation_ready: true,
  } as EncryptedVault);
}

afterEach(() => {
  localStorage.clear();
});

describe("sign-in after a change on another app", () => {
  it("accepts an older vault restored with a recovery code elsewhere", () => {
    pinned_browser(40);
    const notify = vi.fn();

    expect(() =>
      refuse_rolled_back_vault_with_notice(USER_ID, at(25), notify),
    ).not.toThrow();
    expect(notify).not.toHaveBeenCalled();

    pin_vault_generation(USER_ID, at(25));

    expect(read_vault_generation_pin(USER_ID)).toBe(40);
    expect(next_vault_generation(USER_ID, at(25))).toBe(41);
  });

  it("accepts a vault another app rewrote without generation fields", () => {
    pinned_browser(40);
    const notify = vi.fn();

    for (const generation of [undefined, 0, -1, Number.NaN, 1.5]) {
      expect(() =>
        refuse_rolled_back_vault_with_notice(USER_ID, at(generation), notify),
      ).not.toThrow();
    }
    expect(notify).not.toHaveBeenCalled();
  });

  it("accepts the same older vault on every later sign-in", () => {
    pinned_browser(40);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      refuse_rolled_back_vault_with_notice(USER_ID, at(10), vi.fn());
      pin_vault_generation(USER_ID, at(10));
    }

    expect(is_rolled_back_vault(USER_ID, at(10))).toBe(false);
  });

  it("still refuses a vault holding keys the account replaced", () => {
    pinned_browser(40);
    pin_vault_generation(USER_ID, at(undefined, "identity-b"));
    const notify = vi.fn();

    expect(() =>
      refuse_rolled_back_vault_with_notice(USER_ID, at(41), notify),
    ).toThrow(VaultRolledBackError);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
