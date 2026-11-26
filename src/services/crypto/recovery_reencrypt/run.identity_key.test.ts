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
import type { EncryptedVault } from "../key_manager";

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  pending: null as null | { old_identity_key: string; old_data_kek?: string },
  calls: [] as string[],
}));

vi.mock("./pending", () => ({
  get_pending: vi.fn(async () => h.pending),
  clear_pending_reencryption: vi.fn(),
  store_pending_reencryption: vi.fn(async () => undefined),
}));

vi.mock("../legacy_keks", () => ({
  append_legacy_key_raw_bytes: vi.fn(async () => {
    h.calls.push("legacy");
  }),
}));

vi.mock("./preferences", () => ({
  re_encrypt_preferences: vi.fn(async () => {
    h.calls.push("preferences");
  }),
  re_encrypt_dev_mode: vi.fn(async () => {
    h.calls.push("dev_mode");
  }),
  re_encrypt_recovery_email: vi.fn(async () => {
    h.calls.push("recovery_email");
  }),
  re_encrypt_onboarding_state: vi.fn(async () => {
    h.calls.push("onboarding");
  }),
  re_encrypt_external_accounts: vi.fn(async () => true),
}));

vi.mock("./mail", () => ({
  re_encrypt_tags: vi.fn(async () => {
    h.calls.push("tags");
  }),
  re_encrypt_mail_metadata: vi.fn(async () => true),
}));

vi.mock("./folders", () => ({
  re_encrypt_folders: vi.fn(async () => {
    h.calls.push("folders");
  }),
}));

vi.mock("./contacts", () => ({
  re_encrypt_drafts: vi.fn(async () => {
    h.calls.push("drafts");
  }),
  re_encrypt_contact_attachments: vi.fn(async () => true),
  re_encrypt_contact_field_values: vi.fn(async () => true),
  re_encrypt_contact_photos: vi.fn(async () => true),
  re_encrypt_contact_sync_sources: vi.fn(async () => true),
}));

import { check_and_run_recovery_reencryption } from "./run";

function vault_with(identity_key: unknown): EncryptedVault {
  return { identity_key } as unknown as EncryptedVault;
}

describe("check_and_run_recovery_reencryption identity scope", () => {
  beforeEach(() => {
    h.calls = [];
    h.pending = null;
  });

  it("skips identity-scoped data when the new key is a placeholder", async () => {
    h.pending = { old_identity_key: "old-real-identity-key" };
    await check_and_run_recovery_reencryption(vault_with("undefined"), "pw");
    expect(h.calls).toEqual([]);
  });

  it("skips identity-scoped data when the old key is a placeholder", async () => {
    h.pending = { old_identity_key: "undefined" };
    await check_and_run_recovery_reencryption(
      vault_with("new-real-identity-key"),
      "pw",
    );
    expect(h.calls).toEqual([]);
  });

  it("re-encrypts identity-scoped data when both keys are usable", async () => {
    h.pending = { old_identity_key: "old-real-identity-key" };
    await check_and_run_recovery_reencryption(
      vault_with("new-real-identity-key"),
      "pw",
    );
    expect(h.calls).toEqual([
      "legacy",
      "legacy",
      "tags",
      "folders",
      "preferences",
      "drafts",
      "dev_mode",
      "recovery_email",
      "onboarding",
    ]);
  });
});
