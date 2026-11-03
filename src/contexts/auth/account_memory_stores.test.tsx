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
import type { TotpSetupInitiateResponse } from "@/services/api/totp";
import type { ReferralInfo } from "@/services/api/billing";
import type { User } from "@/services/account_manager";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const hoisted = vi.hoisted(() => ({
  calls: [] as string[],
  get_referral_info: vi.fn(),
}));

function record(name: string): () => void {
  return () => {
    hoisted.calls.push(name);
  };
}

vi.mock("@/hooks/use_contact_groups", () => ({
  clear_contact_groups_cache: () => {
    hoisted.calls.push("clear_contact_groups_cache");
    throw new Error("store unavailable");
  },
}));

vi.mock("@/components/settings/billing/cancel_password", () => ({
  clear_cancel_password_cache: record("clear_cancel_password_cache"),
}));

vi.mock("@/services/crypto/ratchet_verification_status", () => ({
  clear_ratchet_verification_status: record(
    "clear_ratchet_verification_status",
  ),
}));

vi.mock("@/services/crypto/sender_identity_authentication", () => ({
  clear_sender_identity_authentication_cache: record(
    "clear_sender_identity_authentication_cache",
  ),
}));

vi.mock("@/services/recipient_classification", () => ({
  clear_recipient_classification_cache: record(
    "clear_recipient_classification_cache",
  ),
}));

vi.mock("@/services/api/account_key", () => ({
  reset_account_key_capabilities_cache: record(
    "reset_account_key_capabilities_cache",
  ),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => null,
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get_cached_user_info: () => null,
    is_authenticated: () => false,
  },
}));

vi.mock("@/services/api/auth", () => ({
  get_user_info: async () => null,
}));

vi.mock("@/services/api/aliases", () => ({
  get_twin_address: async () => ({ data: null }),
}));

vi.mock("@/services/api/billing", () => ({
  get_referral_info: () => hoisted.get_referral_info(),
}));


import { clear_account_memory_stores } from "./account_memory_stores";

import {
  read_cached_totp_setup,
  store_totp_setup,
} from "@/components/settings/security/totp_setup_cache";
import { use_referral_summary } from "@/hooks/use_referral_summary";
import {
  peek_current_user,
  remember_current_user,
} from "@/services/current_identity";

const TWIN_CACHE_KEY = "aster_twin_address_v1";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

let container: HTMLDivElement;
let root: Root;

const seen = {
  referral: null as ReferralInfo | null,
};

function Probe() {
  const { referral_info } = use_referral_summary();

  seen.referral = referral_info;

  return null;
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("clearing account state held in memory", () => {
  beforeEach(() => {
    hoisted.calls.length = 0;
    hoisted.get_referral_info.mockReset();
    hoisted.get_referral_info.mockResolvedValue({ data: null });
    sessionStorage.clear();
    clear_account_memory_stores();
    hoisted.calls.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("runs every clearer even when one throws", () => {
    expect(() => clear_account_memory_stores()).not.toThrow();

    expect(hoisted.calls).toEqual([
      "clear_contact_groups_cache",
      "clear_cancel_password_cache",
      "clear_ratchet_verification_status",
      "clear_sender_identity_authentication_cache",
      "clear_recipient_classification_cache",
      "reset_account_key_capabilities_cache",
    ]);
  });

  it("drops a two-factor setup that was in progress", () => {
    store_totp_setup({
      secret: "JBSWY3DPEHPK3PXP",
      setup_token: "setup-token",
      otpauth_uri: "otpauth://totp/example",
    } as unknown as TotpSetupInitiateResponse);

    expect(read_cached_totp_setup()).not.toBeNull();

    clear_account_memory_stores();

    expect(read_cached_totp_setup()).toBeNull();
  });

  it("removes the saved twin address", () => {
    sessionStorage.setItem(
      TWIN_CACHE_KEY,
      JSON.stringify({ address: "first@example.com" }),
    );

    clear_account_memory_stores();

    expect(sessionStorage.getItem(TWIN_CACHE_KEY)).toBeNull();
  });

  it("forgets the user of the previous session", () => {
    remember_current_user({
      id: "user-1",
      username: "first",
      email: "first@example.com",
    } as User);

    expect(peek_current_user()?.email).toBe("first@example.com");

    clear_account_memory_stores();

    expect(peek_current_user()).toBeNull();
  });

  it("clears the referral summary and ignores a late response", async () => {
    const first = { referral_code: "FIRST" } as unknown as ReferralInfo;
    const late = deferred<{ data: ReferralInfo }>();

    hoisted.get_referral_info.mockResolvedValueOnce({ data: first });
    act(() => root.render(<Probe />));
    await settle();

    expect(seen.referral).toBe(first);

    hoisted.get_referral_info.mockReturnValueOnce(late.promise);
    act(() => root.unmount());
    root = createRoot(container);
    act(() => clear_account_memory_stores());
    act(() => root.render(<Probe />));

    expect(seen.referral).toBeNull();

    act(() => clear_account_memory_stores());
    await act(async () => {
      late.resolve({ data: first });
      await late.promise;
    });
    await settle();

    expect(seen.referral).toBeNull();
  });
});
