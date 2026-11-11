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

import { TotpInlineSetup } from "./totp_inline_setup";
import { clear_totp_setup_cache } from "./totp_setup_cache";

import {
  initiate_totp_setup,
  verify_totp_setup,
  type TotpSetupInitiateResponse,
} from "@/services/api/totp";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/services/api/totp", () => ({
  initiate_totp_setup: vi.fn(),
  verify_totp_setup: vi.fn(),
}));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/components/ui/rounded_qr_code", () => ({
  RoundedQrCode: () => null,
}));
vi.mock("@/components/ui/otp_input", () => ({
  OtpInput: ({ onComplete }: { onComplete: (code: string) => void }) => (
    <button onClick={() => onComplete("123456")}>enter-code</button>
  ),
}));
vi.mock("@/components/settings/security/totp_backup_codes_modal", () => ({
  TotpBackupCodesModal: ({
    is_open,
    backup_codes,
  }: {
    is_open: boolean;
    backup_codes: string[];
  }) => (is_open ? <div>{`backup:${backup_codes.join(",")}`}</div> : null),
}));
vi.mock("@/components/settings/step_up_modal", () => ({
  StepUpModal: ({
    is_open,
    on_close,
    on_confirm,
  }: {
    is_open: boolean;
    on_close: () => void;
    on_confirm: (credentials: StepUpCredentials) => Promise<void>;
  }) =>
    is_open ? (
      <div>
        <button
          onClick={() =>
            void on_confirm({
              password_hash: "PWHASH",
              totp_code: undefined,
            }).catch(() => {})
          }
        >
          confirm-password
        </button>
        <button onClick={on_close}>cancel-confirm</button>
      </div>
    ) : null,
}));

const setup: TotpSetupInitiateResponse = {
  secret: "JBSWY3DPEHPK3PXP",
  otpauth_uri: "otpauth://totp/Aster:user?secret=JBSWY3DPEHPK3PXP",
  setup_token: "SETUP_TOKEN",
};

const step_up_required = {
  error: "To make this change, confirm your password.",
  server_code: "STEP_UP_REQUIRED",
};

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let on_success: ReturnType<typeof vi.fn<() => void>>;

async function render() {
  await act(async () => {
    root.render(<TotpInlineSetup on_success={on_success} />);
  });
  await act(async () => {});
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
  clear_totp_setup_cache();
  on_success = vi.fn<() => void>();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  clear_totp_setup_cache();
});

describe("two-factor setup when confirmation is required", () => {
  it("starts setup without a prompt when the sign-in is recent", async () => {
    vi.mocked(initiate_totp_setup).mockResolvedValue({ data: setup });
    await render();

    expect(initiate_totp_setup).toHaveBeenCalledTimes(1);
    expect(initiate_totp_setup).toHaveBeenCalledWith();
    expect(find_button("confirm-password")).toBeUndefined();
    expect(container.textContent).toContain(setup.secret);
  });

  it("asks for the password and retries setup with the proof", async () => {
    vi.mocked(initiate_totp_setup)
      .mockResolvedValueOnce(step_up_required)
      .mockResolvedValueOnce({ data: setup });
    await render();

    expect(find_button("confirm-password")).toBeDefined();
    expect(container.textContent).not.toContain(step_up_required.error);

    await click("confirm-password");

    expect(initiate_totp_setup).toHaveBeenCalledTimes(2);
    expect(initiate_totp_setup).toHaveBeenLastCalledWith({
      password_hash: "PWHASH",
    });
    expect(find_button("confirm-password")).toBeUndefined();
    expect(container.textContent).toContain(setup.secret);
  });

  it("keeps the prompt open when the password is rejected", async () => {
    vi.mocked(initiate_totp_setup)
      .mockResolvedValueOnce(step_up_required)
      .mockResolvedValueOnce({ error: "Incorrect password" });
    await render();

    await click("confirm-password");

    expect(find_button("confirm-password")).toBeDefined();
    expect(container.textContent).not.toContain(setup.secret);
  });

  it("offers a retry after the prompt is canceled", async () => {
    vi.mocked(initiate_totp_setup)
      .mockResolvedValueOnce(step_up_required)
      .mockResolvedValueOnce(step_up_required);
    await render();

    await click("cancel-confirm");

    expect(find_button("confirm-password")).toBeUndefined();
    expect(container.textContent).toContain("common.step_up_description");

    await click("settings.try_again");

    expect(initiate_totp_setup).toHaveBeenCalledTimes(2);
    expect(find_button("confirm-password")).toBeDefined();
  });

  it("restarts setup when the code check requires confirmation", async () => {
    vi.mocked(initiate_totp_setup)
      .mockResolvedValueOnce({ data: setup })
      .mockResolvedValueOnce(step_up_required);
    vi.mocked(verify_totp_setup).mockResolvedValue(step_up_required);
    await render();

    await click("enter-code");

    expect(verify_totp_setup).toHaveBeenCalledWith({
      code: "123456",
      setup_token: "SETUP_TOKEN",
    });
    expect(initiate_totp_setup).toHaveBeenCalledTimes(2);
    expect(find_button("confirm-password")).toBeDefined();
    expect(on_success).not.toHaveBeenCalled();
  });

  it("still enables two-factor authentication after a confirmed setup", async () => {
    vi.mocked(initiate_totp_setup)
      .mockResolvedValueOnce(step_up_required)
      .mockResolvedValueOnce({ data: setup });
    vi.mocked(verify_totp_setup).mockResolvedValue({
      data: { success: true, backup_codes: ["AAAA", "BBBB"] },
    });
    await render();

    await click("confirm-password");
    await click("enter-code");

    expect(container.textContent).toContain("backup:AAAA,BBBB");
  });
});
