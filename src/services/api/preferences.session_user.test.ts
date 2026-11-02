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
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const h = vi.hoisted(() => ({
  write_key: null as CryptoKey | null,
  expected_user_id: null as string | null,
  put_calls: [] as { body: Record<string, unknown>; config: unknown }[],
  put_response: { data: { success: true } } as Record<string, unknown>,
  confirm_calls: 0,
}));

vi.mock("./client", () => ({
  api_client: {
    get: vi.fn(async () => ({ error: "offline" })),
    put: vi.fn(
      async (_url: string, body: Record<string, unknown>, config: unknown) => {
        h.put_calls.push({ body, config });

        return h.put_response;
      },
    ),
    get_expected_user_id: () => h.expected_user_id,
    confirm_session_identity: vi.fn(async () => {
      h.confirm_calls++;

      return false;
    }),
  },
}));

vi.mock("@/services/crypto/account_data_writer", () => ({
  account_data_write_key: async () => h.write_key,
  retry_after_account_key_load: <T>(attempt: () => Promise<T>) => attempt(),
}));

import {
  DEFAULT_PREFERENCES,
  EXPECTED_USER_HEADER,
  SESSION_USER_MISMATCH_CODE,
  expected_user_headers,
  save_preferences,
} from "./preferences";

const USER_ID = "8d4f1c2e-0b7a-4a51-9a3e-5f2d6c7b8a90";
const vault = { identity_key: "identity-key-armored" } as unknown as Parameters<
  typeof save_preferences
>[1];

beforeAll(async () => {
  h.write_key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
});

beforeEach(() => {
  h.expected_user_id = USER_ID;
  h.put_calls = [];
  h.put_response = { data: { success: true } };
  h.confirm_calls = 0;
});

describe("preferences expected user header", () => {
  it("names the expected account when one is known", () => {
    expect(expected_user_headers()).toEqual({
      [EXPECTED_USER_HEADER]: USER_ID,
    });
  });

  it("sends no header before an account is established", () => {
    h.expected_user_id = null;
    expect(expected_user_headers()).toEqual({});
  });

  it("stamps every preferences save with the expected account", async () => {
    const result = await save_preferences(DEFAULT_PREFERENCES, vault);

    expect(result.data.success).toBe(true);
    expect(h.put_calls).toHaveLength(1);
    expect(h.put_calls[0].config).toEqual({
      headers: { [EXPECTED_USER_HEADER]: USER_ID },
    });
  });

  it("treats a session mismatch as an identity change and never retries", async () => {
    h.put_response = {
      error: "conflict",
      status: 409,
      server_code: SESSION_USER_MISMATCH_CODE,
    };

    const result = await save_preferences(DEFAULT_PREFERENCES, vault);

    expect(result.data).toEqual({
      success: false,
      session_user_mismatch: true,
    });
    expect(h.put_calls).toHaveLength(1);
    await vi.waitFor(() => expect(h.confirm_calls).toBe(1));
  });

  it("leaves other failures to the normal retry path", async () => {
    h.put_response = { error: "server", status: 500 };

    const result = await save_preferences(DEFAULT_PREFERENCES, vault);

    expect(result.data).toEqual({ success: false });
    expect(h.confirm_calls).toBe(0);
  });
});
