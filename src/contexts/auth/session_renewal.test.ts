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
import { describe, expect, it, vi } from "vitest";

import {
  RENEW_AHEAD_MS,
  create_session_renewal,
  renewal_delay_ms,
  token_expiry_ms,
  type SessionRenewalDeps,
} from "./session_renewal";

const FINDLEY_ID = "0b6f1c2e-4a3d-4c8e-9f10-2a3b4c5d6e7f";
const HELLO_ID = "7e6d5c4b-3a2b-4c1d-8e0f-9a8b7c6d5e4f";
const START = 1_800_000_000_000;
const TTL_MS = 300_000;

function token_expiring_at(expiry_ms: number, label: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  return `${encode({ alg: "HS256" })}.${encode({
    sub: FINDLEY_ID,
    exp: Math.floor(expiry_ms / 1000),
    jti: label,
  })}.c2ln`;
}

interface Harness {
  deps: SessionRenewalDeps;
  advance(ms: number): Promise<void>;
  show_tab(): Promise<void>;
  applied: string[];
  failures: number;
  active_user: string;
}

function harness(
  renew: (user_id: string, token: string) => Promise<string | null>,
): Harness {
  let now = START;
  let next_id = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const visible: Array<() => void> = [];
  const state: Harness = {
    applied: [],
    failures: 0,
    active_user: FINDLEY_ID,
    deps: {
      now: () => now,
      set_timer: (run, delay_ms) => {
        next_id += 1;
        timers.set(next_id, { at: now + delay_ms, run });

        return next_id;
      },
      clear_timer: (handle) => {
        timers.delete(handle as number);
      },
      on_visible: (callback) => {
        visible.push(callback);

        return () => {
          visible.splice(visible.indexOf(callback), 1);
        };
      },
      renew,
      is_active_user: (id) => id === state.active_user,
      apply_token: (token) => {
        state.applied.push(token);
      },
      on_failure: () => {
        state.failures += 1;
      },
    },
    advance: async (ms) => {
      const target = now + ms;

      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];

        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].run();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      now = target;
    },
    show_tab: async () => {
      for (const callback of [...visible]) callback();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };

  return state;
}

describe("token expiry", () => {
  it("reads the expiry from the token", () => {
    const token = token_expiring_at(START + TTL_MS, "a");

    expect(token_expiry_ms(token)).toBe(START + TTL_MS);
    expect(renewal_delay_ms(token, START)).toBe(TTL_MS - RENEW_AHEAD_MS);
    expect(renewal_delay_ms(token, START + TTL_MS + 1000)).toBe(0);
    expect(token_expiry_ms("not-a-token")).toBeNull();
  });
});

describe("session renewal", () => {
  it("renews about a minute before the token expires and keeps going", async () => {
    let issued = 0;
    const renew = vi.fn(async () => {
      issued += 1;

      return token_expiring_at(START + TTL_MS * (issued + 1), `r${issued}`);
    });
    const h = harness(renew);

    create_session_renewal(
      h.deps,
      FINDLEY_ID,
      token_expiring_at(START + TTL_MS, "first"),
    );

    await h.advance(TTL_MS - RENEW_AHEAD_MS - 1000);
    expect(renew).not.toHaveBeenCalled();

    await h.advance(1000);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(renew).toHaveBeenLastCalledWith(
      FINDLEY_ID,
      token_expiring_at(START + TTL_MS, "first"),
    );
    expect(h.applied).toEqual([token_expiring_at(START + TTL_MS * 2, "r1")]);

    await h.advance(TTL_MS);
    expect(renew).toHaveBeenCalledTimes(2);
    expect(h.failures).toBe(0);
  });

  it("renews at once when the tab comes back after the token expired", async () => {
    const renew = vi.fn(async () =>
      token_expiring_at(START + TTL_MS * 4, "back"),
    );
    const h = harness(renew);

    create_session_renewal(
      h.deps,
      FINDLEY_ID,
      token_expiring_at(START + TTL_MS, "first"),
    );

    await h.show_tab();
    expect(renew).not.toHaveBeenCalled();

    h.deps.clear_timer(1);
    await h.advance(TTL_MS * 2);
    await h.show_tab();
    expect(renew).toHaveBeenCalledTimes(1);
    expect(h.applied).toEqual([token_expiring_at(START + TTL_MS * 4, "back")]);
  });

  it("shares one renewal between a 401 and the timer", async () => {
    let release: (token: string) => void = () => undefined;
    const renew = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          release = resolve;
        }),
    );
    const h = harness(renew);
    const renewal = create_session_renewal(
      h.deps,
      FINDLEY_ID,
      token_expiring_at(START + TTL_MS, "first"),
    );

    const first = renewal.renew_now();
    const second = renewal.renew_now();

    release(token_expiring_at(START + TTL_MS * 2, "shared"));

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(renewal.current_token()).toBe(
      token_expiring_at(START + TTL_MS * 2, "shared"),
    );
  });

  it("reports a failure once and stops when Mail refuses", async () => {
    const renew = vi.fn(async () => null);
    const h = harness(renew);
    const renewal = create_session_renewal(
      h.deps,
      FINDLEY_ID,
      token_expiring_at(START + TTL_MS, "first"),
    );

    await expect(renewal.renew_now()).resolves.toBe(false);
    expect(h.failures).toBe(1);
    expect(h.applied).toEqual([]);

    await h.advance(TTL_MS * 3);
    await h.show_tab();
    await expect(renewal.renew_now()).resolves.toBe(false);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(h.failures).toBe(1);
  });

  it("never applies a token once Calendar switched to another account", async () => {
    let release: (token: string) => void = () => undefined;
    const renew = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          release = resolve;
        }),
    );
    const h = harness(renew);
    const renewal = create_session_renewal(
      h.deps,
      FINDLEY_ID,
      token_expiring_at(START + TTL_MS, "first"),
    );

    const pending = renewal.renew_now();

    h.active_user = HELLO_ID;
    release(token_expiring_at(START + TTL_MS * 2, "late"));

    await expect(pending).resolves.toBe(false);
    expect(h.applied).toEqual([]);
    expect(h.failures).toBe(0);
  });

  it("does not ask Mail at all for an account that is no longer active", async () => {
    const renew = vi.fn(async () => token_expiring_at(START + TTL_MS, "x"));
    const h = harness(renew);

    h.active_user = HELLO_ID;
    const renewal = create_session_renewal(
      h.deps,
      FINDLEY_ID,
      token_expiring_at(START + TTL_MS, "first"),
    );

    await expect(renewal.renew_now()).resolves.toBe(false);
    expect(renew).not.toHaveBeenCalled();
    expect(h.failures).toBe(0);
  });
});
