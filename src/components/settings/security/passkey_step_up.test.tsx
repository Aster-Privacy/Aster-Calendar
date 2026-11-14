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
import type { StepUpCredentials } from "@/services/api/step_up";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PasskeySection } from "./passkey_section";

import { SettingsCacheProvider } from "@/contexts/settings_cache_context";
import {
  initiate_hardware_key_registration,
  list_hardware_keys,
  type HardwareKeyInfo,
  type HardwareKeyRegistrationOptions,
} from "@/services/api/webauthn";
import {
  register_platform_passkey,
  register_security_key,
} from "@/services/api/passkeys";
import { show_toast } from "@/components/toast/simple_toast";

vi.mock("@/native/invoke_bridge", () => ({ is_desktop: () => false }));
vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));
vi.mock("@/contexts/auth_context", () => ({ use_auth: () => ({}) }));
vi.mock("@/contexts/auth/session_passphrase", () => ({
  get_session_passphrase: vi.fn(),
}));
vi.mock("@/services/api/webauthn", () => ({
  initiate_hardware_key_registration: vi.fn(),
  list_hardware_keys: vi.fn(),
  remove_hardware_key: vi.fn(),
  rename_hardware_key: vi.fn(),
}));
vi.mock("@/services/api/passkeys", () => ({
  register_platform_passkey: vi.fn(),
  register_security_key: vi.fn(),
  is_passkey_supported: () => true,
  is_platform_passkey_available: async () => true,
}));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/components/settings/step_up_modal", () => ({
  StepUpModal: ({
    is_open,
    on_close,
    on_confirm,
    password_only,
    title,
  }: {
    is_open: boolean;
    on_close: () => void;
    on_confirm: (credentials: StepUpCredentials) => Promise<void>;
    password_only?: boolean;
    title: string;
  }) =>
    is_open && password_only ? (
      <div>
        <button
          onClick={() =>
            void on_confirm({ password_hash: "PWHASH" }).catch(() => {})
          }
        >
          {`confirm:${title}`}
        </button>
        <button onClick={on_close}>cancel-confirm</button>
      </div>
    ) : null,
}));
vi.mock("@/components/ui/confirm_modal", () => ({
  ConfirmModal: () => null,
}));

const key: HardwareKeyInfo = {
  id: "key-1",
  name_encrypted: "Test passkey",
  type: "public-key",
  is_passkey: true,
  registered_at: "2026-10-07T00:00:00Z",
  last_used: null,
};

const registration_options: HardwareKeyRegistrationOptions = {
  challenge: "AQID",
  challenge_token: "CHALLENGE_TOKEN",
  rp: { name: "Aster", id: "astermail.org" },
  user: { id: "user-1", name: "user", displayName: "User" },
  pubKeyCredParams: [{ type: "public-key", alg: -7 }],
  timeout: 60000,
  attestation: "none",
  authenticatorSelection: {
    residentKey: "required",
    userVerification: "required",
  },
};

const step_up_required = {
  error: "To make this change, confirm your password.",
  server_code: "STEP_UP_REQUIRED",
};

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function render() {
  await act(async () => {
    root.render(
      <SettingsCacheProvider>
        <PasskeySection />
      </SettingsCacheProvider>,
    );
  });
}

function find_button(label: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label,
  );
}

async function click(label: string) {
  const button = find_button(label);

  expect(button, `Missing button: ${label}`).toBeDefined();
  await act(async () => button!.click());
  await act(async () => {});
}

beforeEach(() => {
  vi.resetAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("adding a sign-in key when confirmation is required", () => {
  it("asks for the password and then registers a passkey with the confirmed options", async () => {
    vi.mocked(list_hardware_keys)
      .mockResolvedValueOnce({ data: { keys: [] } })
      .mockResolvedValueOnce({ data: { keys: [key] } });
    vi.mocked(register_platform_passkey)
      .mockResolvedValueOnce(step_up_required)
      .mockResolvedValueOnce({ data: { success: true, key_id: key.id } });
    vi.mocked(initiate_hardware_key_registration).mockResolvedValue({
      data: registration_options,
    });
    await render();

    await click("passkeys.add_passkey");

    expect(find_button("confirm:passkeys.add_passkey")).toBeDefined();
    expect(show_toast).not.toHaveBeenCalled();
    expect(initiate_hardware_key_registration).not.toHaveBeenCalled();

    await click("confirm:passkeys.add_passkey");

    expect(initiate_hardware_key_registration).toHaveBeenCalledTimes(1);
    expect(initiate_hardware_key_registration).toHaveBeenCalledWith({
      password_hash: "PWHASH",
    });
    expect(register_platform_passkey).toHaveBeenCalledTimes(2);
    expect(register_platform_passkey).toHaveBeenLastCalledWith(
      null,
      undefined,
      registration_options,
    );
    expect(find_button("confirm:passkeys.add_passkey")).toBeUndefined();
    expect(show_toast).toHaveBeenCalledWith(
      "passkeys.register_success",
      "success",
    );
    expect(container.textContent).toContain(key.name_encrypted);
  });

  it("asks for the password and then registers a security key with the confirmed options", async () => {
    vi.mocked(list_hardware_keys).mockResolvedValue({ data: { keys: [] } });
    vi.mocked(register_security_key)
      .mockResolvedValueOnce(step_up_required)
      .mockResolvedValueOnce({ data: { success: true, key_id: key.id } });
    vi.mocked(initiate_hardware_key_registration).mockResolvedValue({
      data: registration_options,
    });
    await render();

    await click("passkeys.add_security_key");

    expect(find_button("confirm:passkeys.add_security_key")).toBeDefined();

    await click("confirm:passkeys.add_security_key");

    expect(initiate_hardware_key_registration).toHaveBeenCalledWith({
      password_hash: "PWHASH",
    });
    expect(register_security_key).toHaveBeenCalledTimes(2);
    expect(register_security_key).toHaveBeenLastCalledWith(
      null,
      registration_options,
    );
    expect(register_platform_passkey).not.toHaveBeenCalled();
  });

  it("keeps the prompt open when the password is rejected", async () => {
    vi.mocked(list_hardware_keys).mockResolvedValue({ data: { keys: [] } });
    vi.mocked(register_platform_passkey).mockResolvedValue(step_up_required);
    vi.mocked(initiate_hardware_key_registration).mockResolvedValue({
      error: "Incorrect password",
    });
    await render();

    await click("passkeys.add_passkey");
    await click("confirm:passkeys.add_passkey");

    expect(find_button("confirm:passkeys.add_passkey")).toBeDefined();
    expect(register_platform_passkey).toHaveBeenCalledTimes(1);
  });

  it("does not ask again when the confirmed registration is refused", async () => {
    vi.mocked(list_hardware_keys).mockResolvedValue({ data: { keys: [] } });
    vi.mocked(register_platform_passkey).mockResolvedValue(step_up_required);
    vi.mocked(initiate_hardware_key_registration).mockResolvedValue({
      data: registration_options,
    });
    await render();

    await click("passkeys.add_passkey");
    await click("confirm:passkeys.add_passkey");

    expect(register_platform_passkey).toHaveBeenCalledTimes(2);
    expect(find_button("confirm:passkeys.add_passkey")).toBeUndefined();
    expect(show_toast).toHaveBeenCalledWith(step_up_required.error, "error");
  });

  it("closes the prompt without registering when it is canceled", async () => {
    vi.mocked(list_hardware_keys).mockResolvedValue({ data: { keys: [] } });
    vi.mocked(register_platform_passkey).mockResolvedValue(step_up_required);
    await render();

    await click("passkeys.add_passkey");
    await click("cancel-confirm");

    expect(find_button("confirm:passkeys.add_passkey")).toBeUndefined();
    expect(initiate_hardware_key_registration).not.toHaveBeenCalled();
    expect(register_platform_passkey).toHaveBeenCalledTimes(1);
  });

  it("registers directly when the sign-in is recent", async () => {
    vi.mocked(list_hardware_keys).mockResolvedValue({ data: { keys: [] } });
    vi.mocked(register_platform_passkey).mockResolvedValue({
      data: { success: true, key_id: key.id },
    });
    await render();

    await click("passkeys.add_passkey");

    expect(find_button("confirm:passkeys.add_passkey")).toBeUndefined();
    expect(register_platform_passkey).toHaveBeenCalledTimes(1);
    expect(register_platform_passkey).toHaveBeenCalledWith(
      null,
      undefined,
      undefined,
    );
    expect(initiate_hardware_key_registration).not.toHaveBeenCalled();
  });
});
