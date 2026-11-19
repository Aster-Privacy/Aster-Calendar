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

import { describe, expect, it } from "vitest";

import {
  report_envelope_capability_if_due,
  type EnvelopeCapabilityDeps,
} from "./envelope_capability";

const user_id = "11111111-2222-3333-4444-555555555555";

function make_deps(): {
  deps: EnvelopeCapabilityDeps;
  calls: unknown[][];
} {
  const store = new Map<string, string>();
  const calls: unknown[][] = [];
  const deps: EnvelopeCapabilityDeps = {
    now: () => 1_000,
    new_client_id: () => "fixed-client-id",
    read: (key) => store.get(key) ?? null,
    write: (key, value) => {
      store.set(key, value);
    },
    post: async (...args: unknown[]) => {
      calls.push(args);

      return {
        success: true,
        min_supported_marker: 4,
        pq_hybrid_enabled: true,
        identity_verified: true,
        pq_identity_attested: true,
      };
    },
    platform: () => "web",
    identity_fingerprint: async () => "fixed-fingerprint",
    pq_identity_fingerprint: async () => "fixed-pq-fingerprint",
  };

  return { deps, calls };
}

async function reported_x3dh_version(
  one_time_prekeys_readable?: () => Promise<boolean>,
): Promise<unknown> {
  const { deps, calls } = make_deps();

  await report_envelope_capability_if_due(user_id, false, {
    ...deps,
    one_time_prekeys_readable,
  });
  expect(calls).toHaveLength(1);

  return calls[0][5];
}

describe("reported envelope capability versions", () => {
  it("reports the bound x3dh transcript version without a prekey check", async () => {
    expect(await reported_x3dh_version()).toBe(3);
  });

  it("reports the bound x3dh transcript version when one-time prekeys are unreadable", async () => {
    expect(await reported_x3dh_version(async () => false)).toBe(3);
    expect(
      await reported_x3dh_version(() => Promise.reject(new Error("locked"))),
    ).toBe(3);
  });

  it("reports the one-time prekey x3dh version when one-time prekeys are readable", async () => {
    expect(await reported_x3dh_version(async () => true)).toBe(4);
  });

  it("reports account-bound envelope support", async () => {
    const { deps, calls } = make_deps();

    await report_envelope_capability_if_due(user_id, false, deps);

    expect(calls).toHaveLength(1);
    expect(calls[0][6]).toBe(1);
  });
});
