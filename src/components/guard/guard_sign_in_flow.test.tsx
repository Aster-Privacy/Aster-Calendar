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
import type { GuardDevice } from "@/services/guard/guard_device";
import type { GuardSignInDeps } from "@/services/guard/guard_sign_in";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/routing/routing_provider", () => ({
  routed_fetch: vi.fn(),
  get_effective_base_url: (default_base_url: string) => default_base_url,
  get_effective_timeout: (default_timeout: number) => default_timeout,
  get_effective_retry_count: (default_retry: number) => default_retry,
  get_effective_retry_delay: () => 1,
}));

vi.mock("@/services/api/guard", () => ({
  GUARD_ENVELOPE_VERSIONS: [2],
  guard_sign_in_begin: vi.fn(),
  guard_sign_in_code: vi.fn(),
  guard_sign_in_complete: vi.fn(),
  guard_sign_in_rescue: vi.fn(),
  guard_sign_in_resume_nonce: vi.fn(),
  guard_sign_in_status: vi.fn(),
  guard_rescue_status: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(",")}` : key,
  }),
}));

vi.mock("@/components/calendar/dated_calendar_logo", () => ({
  DatedCalendarLogo: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

const { routed_fetch } = await import("@/services/routing/routing_provider");
const api = await import("@/services/api/guard");
const { login_user } = await import("@/services/api/auth");
const { verify_totp_login, verify_backup_code_login } = await import(
  "@/services/api/totp"
);
const { perform_webauthn_assertion } = await import("@/services/api/webauthn");
const { GuardSignInPanel, use_guard_sign_in_gate } = await import(
  "@/components/guard/guard_sign_in_gate"
);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const EXPIRES = "2099-01-01T00:05:00Z";
const GUARD_TOKEN = "gt_fake";

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

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) {
    return this.data.has(k) ? (this.data.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

function fake_device(): GuardDevice {
  return {
    public_keys: vi.fn(async () => ({
      ed25519_pk: new Uint8Array(32).fill(1),
      mlkem_pk: new Uint8Array(1184).fill(2),
      x25519_pk: new Uint8Array(32).fill(3),
      action_pk: new Uint8Array(33).fill(4),
      device_type: "web" as const,
      name: "Test browser",
    })),
    device_id: vi.fn(async () => null),
    set_device_id: vi.fn(async () => undefined),
    sign: vi.fn(async () => new Uint8Array(64).fill(9)),
    open_seal: vi.fn(async () => new Uint8Array(32).fill(5)),
    open_envelope: vi.fn(async () => new TextEncoder().encode("pass phrase")),
    store_code_secret: vi.fn(async () => undefined),
    code_secret: vi.fn(async () => null),
    forget: vi.fn(async () => undefined),
  } as unknown as GuardDevice;
}

function make_deps(): GuardSignInDeps {
  const storage = new MemoryStorage();

  return {
    get_device: vi.fn(async () => null),
    create_device: vi.fn(async () => fake_device()),
    rekey_device: vi.fn(async () => undefined),
    read_hint: vi.fn(async () => null),
    write_hint: vi.fn(async () => undefined),
    device_name: () => "Test browser",
    storage: () => storage as unknown as Storage,
    now: () => Date.now(),
  };
}

let container: HTMLDivElement;
let root: Root;
let request_counter = 0;

function Harness({ deps }: { deps: GuardSignInDeps }) {
  const gate = use_guard_sign_in_gate(deps);

  if (!gate.guard_start) return <div data-testid="sign_in_form" />;

  return (
    <GuardSignInPanel
      deps={deps}
      start={gate.guard_start}
      on_back={gate.clear_guard}
      on_complete={async () => undefined}
    />
  );
}

function guard_required_on(path: string): void {
  request_counter += 1;
  const request_id = `11111111-2222-4333-8444-${String(request_counter).padStart(12, "0")}`;

  vi.mocked(routed_fetch).mockImplementation(async (url: string) => {
    if (url.split("?")[0].endsWith(path)) {
      return reply(403, {
        error: "Aster Guard needs to approve this sign-in.",
        code: "GUARD_REQUIRED",
        details: {
          request_id,
          guard_token: GUARD_TOKEN,
          expires_at: EXPIRES,
          methods: ["approve", "code", "rescue"],
        },
      });
    }

    return reply(200, { csrf_token: "c" });
  });
}

function hit(path: string): boolean {
  return vi
    .mocked(routed_fetch)
    .mock.calls.some(([url]) => String(url).split("?")[0].endsWith(path));
}

async function settle() {
  for (let i = 0; i < 30; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function expect_waiting_flow() {
  await settle();
  expect(container.querySelector('[data-testid="sign_in_form"]')).toBeNull();
  expect(
    container.querySelector('[data-testid="guard_waiting_screen"]'),
  ).not.toBeNull();
  const number = container.querySelector('[data-testid="guard_number"]');

  expect(number?.textContent).toMatch(/\d{2}/);
  expect(api.guard_sign_in_begin).toHaveBeenCalledTimes(1);
  expect(vi.mocked(api.guard_sign_in_begin).mock.calls[0][0]).toBe(
    GUARD_TOKEN,
  );
}

beforeEach(() => {
  vi.mocked(routed_fetch).mockReset();
  vi.mocked(api.guard_sign_in_begin).mockReset();
  vi.mocked(api.guard_sign_in_status).mockReset();
  vi.mocked(api.guard_sign_in_begin).mockResolvedValue({
    data: { status: "pending", expires_at: EXPIRES },
  });
  vi.mocked(api.guard_sign_in_status).mockResolvedValue({
    data: { status: "pending", expires_at: EXPIRES, apply_after: null },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness deps={make_deps()} />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("guard sign-in flow", () => {
  it("shows the sign-in form until the server asks for Guard", () => {
    expect(
      container.querySelector('[data-testid="sign_in_form"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="guard_waiting_screen"]'),
    ).toBeNull();
  });

  it("moves to the waiting screen when password sign-in needs Guard", async () => {
    guard_required_on("/core/v1/auth/login");

    const result = await act(async () =>
      login_user({ user_hash: "uh_fake" } as Parameters<typeof login_user>[0]),
    );

    expect(hit("/core/v1/auth/login")).toBe(true);
    expect(result.server_code).toBe("GUARD_REQUIRED");
    expect(result.data).toBeUndefined();
    await expect_waiting_flow();
  });

  it("moves to the waiting screen when the TOTP step needs Guard", async () => {
    guard_required_on("/core/v1/auth/totp/verify");

    const result = await act(async () =>
      verify_totp_login({
        pending_login_token: "plt",
        code: "123456",
      } as Parameters<typeof verify_totp_login>[0]),
    );

    expect(hit("/core/v1/auth/totp/verify")).toBe(true);
    expect(result.server_code).toBe("GUARD_REQUIRED");
    await expect_waiting_flow();
  });

  it("moves to the waiting screen when a backup code needs Guard", async () => {
    guard_required_on("/core/v1/auth/totp/backup-code");

    const result = await act(async () =>
      verify_backup_code_login({
        pending_login_token: "plt",
        code: "abcd-efgh",
      } as Parameters<typeof verify_backup_code_login>[0]),
    );

    expect(hit("/core/v1/auth/totp/backup-code")).toBe(true);
    expect(result.server_code).toBe("GUARD_REQUIRED");
    await expect_waiting_flow();
  });

  it("moves to the waiting screen when the passkey step needs Guard", async () => {
    guard_required_on("/core/v1/auth/hardware-keys/assert/verify");
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const get = vi.fn(async () => ({
      rawId: bytes,
      type: "public-key",
      response: {
        authenticatorData: bytes,
        clientDataJSON: bytes,
        signature: bytes,
        userHandle: null,
      },
    }));

    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: { get },
    });

    const result = await act(async () =>
      perform_webauthn_assertion(
        {
          challenge: "AQID",
          challenge_token: "ct",
          rpId: "astermail.org",
          allowCredentials: [{ type: "public-key", id: "AQID" }],
          timeout: 60000,
          userVerification: "preferred",
        } as Parameters<typeof perform_webauthn_assertion>[0],
        "plt",
      ),
    );

    expect(get).toHaveBeenCalledTimes(1);
    expect(hit("/core/v1/auth/hardware-keys/assert/verify")).toBe(true);
    expect(result.server_code).toBe("GUARD_REQUIRED");
    await expect_waiting_flow();
  });
});
