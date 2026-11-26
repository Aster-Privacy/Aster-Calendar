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
import { describe, it, expect, vi } from "vitest";

vi.mock("./vault_decryption", () => ({
  decrypt_vault_with_lock: vi.fn(async () => null),
}));
vi.mock("@/services/api/client", () => ({
  api_client: { get_cached_user_info: () => null },
}));
vi.mock("@/services/api/client/helpers", () => ({
  API_BASE_URL: "/api",
}));
vi.mock("@/services/api/csrf", () => ({
  get_csrf_token_from_cookie: () => "token",
}));
vi.mock("@/services/api/auth", () => ({
  verify_auth_status: vi.fn(async () => true),
}));
vi.mock("@/services/app_lock_store", () => ({
  get_app_lock_config: () => null,
}));

import { verify_token_session } from "./sibling_session_handoff";

const FINDLEY_ID = "0b6f1c2e-4a3d-4c8e-9f10-2a3b4c5d6e7f";
const HELLO_ID = "7e6d5c4b-3a2b-4c1d-8e0f-9a8b7c6d5e4f";
const FINDLEY_TOKEN = "aGVhZGVy.ZmluZGxleQ.c2ln";

function json_response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("verify_token_session with two accounts on this device", () => {
  it("asks the server about the grant user's token and never sends the shared cookie", async () => {
    const fetch_me = vi.fn(async (_url: string, _init?: RequestInit) =>
      json_response(200, { user_id: FINDLEY_ID }),
    );

    expect(
      await verify_token_session(
        FINDLEY_TOKEN,
        FINDLEY_ID,
        fetch_me as unknown as typeof fetch,
      ),
    ).toBe(FINDLEY_ID);

    const [url, init] = fetch_me.mock.calls[0];
    const headers = init?.headers as Record<string, string>;

    expect(url).toBe("/api/core/v1/auth/me");
    expect(init?.credentials).toBe("omit");
    expect(headers.Authorization).toBe(`Bearer ${FINDLEY_TOKEN}`);
    expect(headers["X-Aster-Expected-User"]).toBe(FINDLEY_ID);
  });

  it("refuses when the server answers for the other account", async () => {
    const fetch_me = vi.fn(async () => json_response(200, { user_id: HELLO_ID }));

    expect(
      await verify_token_session(
        FINDLEY_TOKEN,
        FINDLEY_ID,
        fetch_me as unknown as typeof fetch,
      ),
    ).toBeNull();
  });

  it("refuses on a rejected, malformed, or failed answer", async () => {
    const answers: Array<() => Promise<Response>> = [
      async () => json_response(401, { user_id: FINDLEY_ID }),
      async () => json_response(200, null),
      async () => json_response(200, { user_id: 7 }),
      async () => {
        throw new Error("offline");
      },
    ];

    for (const answer of answers) {
      expect(
        await verify_token_session(
          FINDLEY_TOKEN,
          FINDLEY_ID,
          answer as unknown as typeof fetch,
        ),
      ).toBeNull();
    }
  });
});
