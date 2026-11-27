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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/routing/routing_provider", () => ({
  routed_fetch: vi.fn(),
  get_effective_base_url: (default_base_url: string) => default_base_url,
  get_effective_timeout: (default_timeout: number) => default_timeout,
  get_effective_retry_count: () => 0,
  get_effective_retry_delay: () => 1,
}));

const { routed_fetch } = await import("@/services/routing/routing_provider");
const { api_client } = await import("../client");

const FINDLEY_ID = "0b6f1c2e-4a3d-4c8e-9f10-2a3b4c5d6e7f";
const OLD_TOKEN = "aGVhZGVy.b2xk.c2ln";
const NEW_TOKEN = "aGVhZGVy.bmV3.c2ln";

let clock = 1_900_000_000_000;

function reply(status: number, payload: Record<string, unknown>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => null },
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as unknown as Response;
}

const header_snapshots: Array<Record<string, string>> = [];

function answer_with(...replies: Response[]): void {
  let index = 0;

  vi.mocked(routed_fetch).mockImplementation(async (_url, init) => {
    header_snapshots.push({
      ...((init as RequestInit).headers as Record<string, string>),
    });
    const next = replies[Math.min(index, replies.length - 1)];

    index += 1;

    return next;
  });
}

function sent_headers(call_index: number): Record<string, string> {
  return header_snapshots[call_index];
}

function fetches_to(endpoint: string): number {
  return vi
    .mocked(routed_fetch)
    .mock.calls.filter(([url]) => String(url).includes(endpoint)).length;
}

describe("api client session renewer", () => {
  const expired: Event[] = [];
  const on_expired = (event: Event) => expired.push(event);

  beforeEach(() => {
    clock += 10 * 60 * 1000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    vi.mocked(routed_fetch).mockReset();
    header_snapshots.length = 0;
    expired.length = 0;
    window.addEventListener("astermail:session-expired", on_expired);
    api_client.set_authenticated(true);
    api_client.set_expected_user_id(FINDLEY_ID);
    api_client.set_dev_token(OLD_TOKEN, undefined, FINDLEY_ID);
  });

  afterEach(() => {
    window.removeEventListener("astermail:session-expired", on_expired);
    api_client.set_session_renewer(null);
    vi.restoreAllMocks();
  });

  it("renews on a 401 and retries the request once with the new token", async () => {
    const renewer = vi.fn(async () => {
      api_client.set_dev_token(NEW_TOKEN, undefined, FINDLEY_ID);

      return true;
    });

    api_client.set_session_renewer(renewer);
    answer_with(reply(401, { error: "expired" }), reply(200, { events: [] }));

    const result = await api_client.get("/calendar/v1/events?case=renew", {
      skip_cache: true,
    });

    expect(result.error).toBeFalsy();
    expect(renewer).toHaveBeenCalledTimes(1);
    expect(fetches_to("/calendar/v1/events?case=renew")).toBe(2);
    expect(fetches_to("/auth/refresh")).toBe(0);
    expect(sent_headers(0)["Authorization"]).toBe(`Bearer ${OLD_TOKEN}`);
    expect(sent_headers(1)["Authorization"]).toBe(`Bearer ${NEW_TOKEN}`);
    expect(sent_headers(1)["X-Aster-Expected-User"]).toBe(FINDLEY_ID);
  });

  it("retries only once when the renewed token is refused too", async () => {
    const renewer = vi.fn(async () => {
      api_client.set_dev_token(NEW_TOKEN, undefined, FINDLEY_ID);

      return true;
    });

    api_client.set_session_renewer(renewer);
    answer_with(reply(401, { error: "expired" }));

    const result = await api_client.get("/calendar/v1/events?case=twice", {
      skip_cache: true,
    });

    expect(result.error).toBeTruthy();
    expect(renewer).toHaveBeenCalledTimes(1);
    expect(fetches_to("/calendar/v1/events?case=twice")).toBe(2);
  });

  it("never falls back to the shared cookie session when renewal fails", async () => {
    const renewer = vi.fn(async () => false);

    api_client.set_session_renewer(renewer);
    answer_with(reply(401, { error: "expired" }));

    const result = await api_client.get("/calendar/v1/events?case=refused", {
      skip_cache: true,
    });

    expect(result.error).toBeTruthy();
    expect(renewer).toHaveBeenCalledTimes(1);
    expect(fetches_to("/calendar/v1/events?case=refused")).toBe(1);
    expect(fetches_to("/auth/refresh")).toBe(0);
    expect(fetches_to("/auth/me")).toBe(0);
    expect(api_client.is_authenticated()).toBe(false);
    expect(expired).toHaveLength(0);
  });
});
