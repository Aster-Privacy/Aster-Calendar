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

import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  api_client: {
    get: vi.fn(async () => ({ data: null, error: "unused" })),
    put: vi.fn(async () => ({ data: { success: true }, error: null })),
  },
}));

import { encrypt_recovery_email } from "./recovery_email";

import { IdentityKeyMissingError } from "@/services/crypto/identity_key_required";

function vault_with(identity_key: unknown): EncryptedVault {
  return { identity_key } as unknown as EncryptedVault;
}

describe("encrypt_recovery_email", () => {
  it.each([undefined, null, "", "undefined", "null", "NaN", "[object Object]"])(
    "refuses an unusable identity key (%s)",
    async (identity_key) => {
      await expect(
        encrypt_recovery_email("person@example.com", vault_with(identity_key)),
      ).rejects.toBeInstanceOf(IdentityKeyMissingError);
    },
  );

  it("encrypts under a real identity key", async () => {
    const result = await encrypt_recovery_email(
      "person@example.com",
      vault_with("a-real-identity-key-value"),
    );

    expect(result.encrypted.length).toBeGreaterThan(0);
    expect(result.nonce.length).toBeGreaterThan(0);
  });
});
