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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";
import type { FamilyGroupResponse } from "@/services/api/family";
import type { SharedMailboxInfo } from "@/services/api/shared_mailboxes";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  VAULT_KDF_ITERATIONS_LEGACY,
  VAULT_KDF_ITERATIONS_LEVEL2,
  get_current_vault_iterations,
  note_current_vault_iterations,
  reset_level2_state,
} from "@/services/crypto/vault_level2";

const OWNER_ID = "owner-user";
const MAILBOX_SECRET = "mailbox-login-secret";
const MAILBOX_LABEL = "team@astermail.org";

const mailbox_state: { mailbox: SharedMailboxInfo | null } = { mailbox: null };
const rotated_vaults: EncryptedVault[] = [];

function mailbox_vault(): EncryptedVault {
  return {
    identity_key: "mailbox-identity-key",
    signed_prekey: "mailbox-signed-prekey",
    signed_prekey_private: "mailbox-signed-prekey-private",
    recovery_codes: [],
  };
}

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ switch_to_account: vi.fn() }),
}));

vi.mock("@aster/ui", () => ({
  Island: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  IslandDivider: () => createElement("hr"),
  IslandEmpty: ({ title }: { title?: ReactNode }) =>
    createElement("div", null, title),
  IslandRow: ({
    label,
    on_press,
  }: {
    label?: ReactNode;
    on_press?: () => void;
  }) => createElement("button", { onClick: on_press, type: "button" }, label),
  PillButton: ({
    children,
    disabled,
    onClick,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) =>
    createElement("button", { disabled, onClick, type: "button" }, children),
}));

vi.mock("./family_section/family_ui", () => ({
  FamilyCreateBar: () => null,
  FamilySkeletonRows: () => null,
  family_row_icon: () => null,
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: () => null,
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/services/api/family", () => ({
  check_address_availability: vi.fn(),
}));

vi.mock("@/services/api/shared_mailboxes", () => ({
  list_shared_mailboxes: async () => ({
    data: {
      mailboxes: mailbox_state.mailbox ? [mailbox_state.mailbox] : [],
      max_shared_mailboxes: 3,
      viewer_is_owner: true,
    },
  }),
  create_shared_mailbox: vi.fn(),
  add_shared_mailbox_grant: vi.fn(),
  revoke_shared_mailbox_grant: vi.fn(),
  rotate_shared_mailbox: vi.fn(),
  delete_shared_mailbox: vi.fn(),
}));

vi.mock("@/services/crypto/shared_mailbox", () => ({
  generate_shared_mailbox_material: vi.fn(),
  fetch_member_public_key: vi.fn(),
  seal_grant: vi.fn(),
  generate_rotated_credential: async (vault: EncryptedVault) => {
    rotated_vaults.push(vault);
    throw new Error("rotation stops here");
  },
  get_grant_signing_keys: () => ({}),
  get_own_grant_public_key: vi.fn(),
  SHARED_MAILBOX_GRANT_VERSION: 1,
}));

vi.mock("@/services/shared_mailbox_session", () => ({
  sync_shared_mailbox_grants: vi.fn(async () => undefined),
  clear_shared_mailbox_session: vi.fn(async () => undefined),
  cache_shared_mailbox_secret: vi.fn(async () => undefined),
}));

vi.mock("@/contexts/auth/session_passphrase", () => ({
  get_session_passphrase: async () => MAILBOX_SECRET,
}));

const { SharedMailboxesTab } = await import("./shared_mailboxes_tab");
const { encrypt_vault } = await import(
  "@/services/crypto/key_manager_pgp_vault"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function owner_group(): FamilyGroupResponse {
  return {
    id: "group-1",
    plan_code: "family",
    plan_name: "Family",
    storage_pool_bytes: 0,
    storage_used_bytes: 0,
    status: "active",
    grace_period_end: null,
    members: [],
    pending_invites: [],
    max_members: 6,
    viewer_role: "owner",
  };
}

async function mailbox_needing_rotation(): Promise<SharedMailboxInfo> {
  const sealed = await encrypt_vault(
    mailbox_vault(),
    MAILBOX_SECRET,
    VAULT_KDF_ITERATIONS_LEVEL2,
  );

  return {
    id: "mailbox-1",
    mailbox_user_id: "mailbox-user",
    username: "team",
    email_domain: "astermail.org",
    encrypted_display_name: null,
    display_name_nonce: null,
    status: "active",
    credential_epoch: 1,
    rotation_required: true,
    allocated_storage_bytes: 0,
    storage_used_bytes: 0,
    created_at: "2026-11-01T00:00:00Z",
    my_grant: {
      wrapped_grant: "wrapped",
      credential_epoch: 1,
      encrypted_vault: sealed.encrypted_vault,
      vault_nonce: sealed.vault_nonce,
      vault_updated_at: "2026-11-01T00:00:00Z",
      vault_kdf_iterations: VAULT_KDF_ITERATIONS_LEVEL2,
      granted_by: OWNER_ID,
      granted_by_username: "owner",
      granted_by_email_domain: "astermail.org",
    },
    grants: [],
  };
}

function find_button(text: string): HTMLButtonElement | undefined {
  return Array.from(
    container?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((candidate) => candidate.textContent === text);
}

function button_with(text: string): HTMLButtonElement {
  const button = find_button(text);

  if (!button) throw new Error(`no button for ${text}`);

  return button;
}

async function settle(predicate: () => boolean) {
  for (let attempt = 0; attempt < 400 && !predicate(); attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

async function rotate_mailbox() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root!.render(
      createElement(SharedMailboxesTab, {
        group: owner_group(),
        my_user_id: OWNER_ID,
      }),
    );
  });
  await settle(() => find_button(MAILBOX_LABEL) !== undefined);

  await act(async () => {
    button_with(MAILBOX_LABEL).click();
  });
  await act(async () => {
    button_with("shared_mailboxes.rotate").click();
  });
  await settle(() => rotated_vaults.length > 0);
  await settle(() => find_button("shared_mailboxes.rotate")?.disabled === false);
}

describe("shared mailbox rotation opens the mailbox vault as another account", () => {
  beforeEach(() => {
    reset_level2_state();
    note_current_vault_iterations(VAULT_KDF_ITERATIONS_LEGACY);
    rotated_vaults.length = 0;
    mailbox_state.mailbox = null;
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("leaves the signed-in owner's factor alone when the mailbox vault uses the stronger factor", async () => {
    mailbox_state.mailbox = await mailbox_needing_rotation();
    reset_level2_state();
    note_current_vault_iterations(VAULT_KDF_ITERATIONS_LEGACY);

    await rotate_mailbox();

    expect(rotated_vaults).toHaveLength(1);
    expect(rotated_vaults[0].identity_key).toBe("mailbox-identity-key");
    expect(get_current_vault_iterations()).toBe(VAULT_KDF_ITERATIONS_LEGACY);
  }, 60000);
});
