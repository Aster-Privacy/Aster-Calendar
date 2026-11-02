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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/services/routing/routing_provider", () => ({
  routed_fetch: vi.fn(),
  get_effective_base_url: (default_base_url: string) => default_base_url,
  get_effective_timeout: (default_timeout: number) => default_timeout,
  get_effective_retry_count: (default_retry: number) => default_retry,
  get_effective_retry_delay: () => 1,
}));

vi.mock("@/services/account_manager", () => ({
  read_stored_refresh_token: vi.fn().mockResolvedValue(null),
}));

const { routed_fetch } = await import("@/services/routing/routing_provider");
const { api_client } = await import("./client");

const OWNER = "3c74a773-b6e8-40ed-a375-c9a26fe97d04";
const OTHER = "1c2eabd0-ebdf-4f68-90d9-305cab7bc69a";

function me_response(user_id: string): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: () =>
      Promise.resolve(
        JSON.stringify({
          user_id,
          username: "someone",
          email: "someone@aster.cx",
          display_name: null,
          profile_color: null,
          profile_picture: null,
        }),
      ),
  } as unknown as Response;
}

describe("api client identity guard", () => {
  let mismatch_events: CustomEvent[];
  const capture = (event: Event) => {
    mismatch_events.push(event as CustomEvent);
  };

  beforeEach(() => {
    vi.mocked(routed_fetch).mockReset();
    mismatch_events = [];
    window.addEventListener("astermail:identity-mismatch", capture);
    api_client.set_authenticated(false);
    api_client.set_expected_user_id(null);
  });

  afterEach(() => {
    window.removeEventListener("astermail:identity-mismatch", capture);
    api_client.set_authenticated(false);
    api_client.set_expected_user_id(null);
  });

  it("accepts the session when the server agrees on who is signed in", async () => {
    api_client.set_expected_user_id(OWNER);
    vi.mocked(routed_fetch).mockResolvedValue(me_response(OWNER));

    const valid = await api_client.check_auth_status();

    expect(valid).toBe(true);
    expect(api_client.is_authenticated()).toBe(true);
    expect(api_client.get_cached_user_info()?.user_id).toBe(OWNER);
    expect(mismatch_events).toHaveLength(0);
  });

  it("rejects the session when the cookie belongs to another account", async () => {
    api_client.set_expected_user_id(OWNER);
    vi.mocked(routed_fetch).mockResolvedValue(me_response(OTHER));

    const valid = await api_client.check_auth_status();

    expect(valid).toBe(false);
    expect(api_client.is_authenticated()).toBe(false);
    expect(api_client.get_cached_user_info()).toBeNull();
  });

  it("announces the mismatch so the app can tear the session down", async () => {
    api_client.set_expected_user_id(OWNER);
    vi.mocked(routed_fetch).mockResolvedValue(me_response(OTHER));

    await api_client.check_auth_status();

    expect(mismatch_events).toHaveLength(1);
    expect(mismatch_events[0].detail).toEqual({
      expected_user_id: OWNER,
      actual_user_id: OTHER,
    });
  });

  it("announces the mismatch only once per bound account", async () => {
    api_client.set_expected_user_id(OWNER);
    vi.mocked(routed_fetch).mockResolvedValue(me_response(OTHER));

    await api_client.check_auth_status();
    await api_client.check_auth_status();
    await api_client.check_auth_status();

    expect(mismatch_events).toHaveLength(1);
  });

  it("stays quiet while an account is deliberately being added", async () => {
    api_client.set_expected_user_id(OWNER);
    api_client.begin_account_add();
    vi.mocked(routed_fetch).mockResolvedValue(me_response(OTHER));

    const valid = await api_client.check_auth_status();

    api_client.end_account_add();

    expect(valid).toBe(true);
    expect(mismatch_events).toHaveLength(0);
  });

  it("does not guard when no account has been bound yet", async () => {
    vi.mocked(routed_fetch).mockResolvedValue(me_response(OTHER));

    const valid = await api_client.check_auth_status();

    expect(valid).toBe(true);
    expect(mismatch_events).toHaveLength(0);
  });

  it("remembers which account the session moved to", async () => {
    api_client.set_expected_user_id(OWNER);
    vi.mocked(routed_fetch).mockResolvedValue(me_response(OTHER));

    await api_client.check_auth_status();

    expect(api_client.get_identity_mismatch_user_id()).toBe(OTHER);

    api_client.set_expected_user_id(OTHER);

    expect(api_client.get_identity_mismatch_user_id()).toBeNull();
  });

  it("follows the shared session instead of renewing a session that moved", async () => {
    api_client.set_authenticated(true);
    api_client.set_expected_user_id(OWNER);
    vi.mocked(routed_fetch).mockReset();
    vi.mocked(routed_fetch).mockResolvedValue(me_response(OTHER));

    await api_client.refresh_session({ after_unauthorized: true });

    const urls = vi
      .mocked(routed_fetch)
      .mock.calls.map((call) => String(call[0]));

    expect(urls.some((url) => url.includes("/auth/refresh"))).toBe(false);
    expect(mismatch_events).toHaveLength(1);
    expect(mismatch_events[0].detail).toEqual({
      expected_user_id: OWNER,
      actual_user_id: OTHER,
    });
  });

  it("confirms the session only when the server names the expected account", async () => {
    api_client.set_expected_user_id(OWNER);
    vi.mocked(routed_fetch).mockResolvedValue(me_response(OWNER));

    await expect(api_client.confirm_session_identity()).resolves.toBe(true);
    expect(mismatch_events).toHaveLength(0);
  });

  it("does not confirm the session when the cookie moved to another account", async () => {
    api_client.set_expected_user_id(OWNER);
    vi.mocked(routed_fetch).mockResolvedValue(me_response(OTHER));

    await expect(api_client.confirm_session_identity()).resolves.toBe(false);
    expect(mismatch_events).toHaveLength(1);
  });

  it("does not confirm the session when the check cannot reach the server", async () => {
    api_client.set_expected_user_id(OWNER);
    vi.mocked(routed_fetch).mockRejectedValue(new TypeError("offline"));

    await expect(api_client.confirm_session_identity()).resolves.toBe(false);
    expect(mismatch_events).toHaveLength(0);
  });

  it("does not confirm the session without an expected account", async () => {
    vi.mocked(routed_fetch).mockResolvedValue(me_response(OWNER));

    await expect(api_client.confirm_session_identity()).resolves.toBe(false);
  });

  it("forgets the binding once auth state is cleared", async () => {
    api_client.set_expected_user_id(OWNER);
    api_client.set_authenticated(false);

    expect(api_client.get_expected_user_id()).toBeNull();
  });
});
