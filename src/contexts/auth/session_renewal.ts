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
export const RENEW_AHEAD_MS = 60_000;

export function token_expiry_ms(access_token: string): number | null {
  const payload = access_token.split(".")[1];

  if (!payload) return null;

  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims: unknown = JSON.parse(atob(padded));

    if (typeof claims !== "object" || claims === null) return null;

    const exp = (claims as { exp?: unknown }).exp;

    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function renewal_delay_ms(
  access_token: string,
  now: number,
): number | null {
  const expiry = token_expiry_ms(access_token);

  if (expiry === null) return null;

  return Math.max(0, expiry - RENEW_AHEAD_MS - now);
}

export interface SessionRenewalDeps {
  now(): number;
  set_timer(callback: () => void, delay_ms: number): unknown;
  clear_timer(handle: unknown): void;
  on_visible(callback: () => void): () => void;
  renew(user_id: string, access_token: string): Promise<string | null>;
  is_active_user(user_id: string): boolean;
  apply_token(access_token: string, user_id: string): void;
  on_failure(): void;
}

export interface SessionRenewal {
  renew_now(): Promise<boolean>;
  stop(): void;
  current_token(): string;
}

export function create_session_renewal(
  deps: SessionRenewalDeps,
  user_id: string,
  initial_token: string,
): SessionRenewal {
  let token = initial_token;
  let timer: unknown = null;
  let stopped = false;
  let in_flight: Promise<boolean> | null = null;
  let remove_visible: (() => void) | null = null;

  const clear = () => {
    if (timer !== null) deps.clear_timer(timer);
    timer = null;
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clear();
    remove_visible?.();
    remove_visible = null;
  };

  const run = async (): Promise<boolean> => {
    if (!deps.is_active_user(user_id)) {
      stop();

      return false;
    }

    let next: string | null = null;

    try {
      next = await deps.renew(user_id, token);
    } catch {
      next = null;
    }

    if (stopped) return false;

    if (!deps.is_active_user(user_id)) {
      stop();

      return false;
    }

    if (!next) {
      stop();
      deps.on_failure();

      return false;
    }

    token = next;
    deps.apply_token(next, user_id);
    schedule();

    return true;
  };

  const renew_now = (): Promise<boolean> => {
    if (stopped) return Promise.resolve(false);
    if (!in_flight) {
      in_flight = run().finally(() => {
        in_flight = null;
      });
    }

    return in_flight;
  };

  const schedule = () => {
    clear();
    if (stopped) return;

    const delay = renewal_delay_ms(token, deps.now());

    if (delay === null) return;

    timer = deps.set_timer(() => {
      timer = null;
      void renew_now();
    }, delay);
  };

  remove_visible = deps.on_visible(() => {
    const delay = renewal_delay_ms(token, deps.now());

    if (delay !== null && delay <= 0) void renew_now();
  });
  schedule();

  return { renew_now, stop, current_token: () => token };
}
