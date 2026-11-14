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

import { api_client } from "./client";
import { register_platform_passkey, register_security_key } from "./passkeys";
import { STEP_UP_REQUIRED_CODE, to_reauth_proof } from "./step_up";
import { initiate_totp_setup } from "./totp";
import {
  initiate_hardware_key_registration,
  type HardwareKeyRegistrationOptions,
} from "./webauthn";

vi.mock("./client", () => ({
  api_client: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("./csrf", () => ({ clear_csrf_cache: vi.fn() }));

const TOTP_INITIATE_PATH = "/core/v1/auth/totp/setup/initiate";
const KEY_INITIATE_PATH = "/core/v1/auth/hardware-keys/register/initiate";
const KEY_COMPLETE_PATH = "/core/v1/auth/hardware-keys/register/complete";

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
  server_code: STEP_UP_REQUIRED_CODE,
};

const original_credentials = Object.getOwnPropertyDescriptor(
  navigator,
  "credentials",
);

function stub_credentials(create: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "credentials", {
    configurable: true,
    value: { create },
  });
}

beforeEach(() => {
  vi.mocked(api_client.post).mockReset();
});

afterEach(() => {
  if (original_credentials) {
    Object.defineProperty(navigator, "credentials", original_credentials);
  } else {
    delete (navigator as unknown as { credentials?: unknown }).credentials;
  }
});

describe("to_reauth_proof", () => {
  it("keeps only the password hash when there is no code", () => {
    expect(
      to_reauth_proof({
        password_hash: "PWHASH",
        hardware_key_assertion: { id: "x" } as never,
      }),
    ).toEqual({ password_hash: "PWHASH" });
  });

  it("includes the two-factor code when one is given", () => {
    expect(
      to_reauth_proof({ password_hash: "PWHASH", totp_code: "123456" }),
    ).toEqual({ password_hash: "PWHASH", totp_code: "123456" });
  });
});

describe("sign-in method setup requests", () => {
  it("sends an empty body when two-factor setup starts without a proof", async () => {
    vi.mocked(api_client.post).mockResolvedValue({ data: {} } as never);

    await initiate_totp_setup();

    expect(api_client.post).toHaveBeenCalledWith(TOTP_INITIATE_PATH, {});
  });

  it("sends the proof when two-factor setup starts after confirmation", async () => {
    vi.mocked(api_client.post).mockResolvedValue({ data: {} } as never);

    await initiate_totp_setup({ password_hash: "PWHASH", totp_code: "123456" });

    expect(api_client.post).toHaveBeenCalledWith(TOTP_INITIATE_PATH, {
      password_hash: "PWHASH",
      totp_code: "123456",
    });
  });

  it("sends an empty body when key registration starts without a proof", async () => {
    vi.mocked(api_client.post).mockResolvedValue({ data: {} } as never);

    await initiate_hardware_key_registration();

    expect(api_client.post).toHaveBeenCalledWith(KEY_INITIATE_PATH, {});
  });

  it("sends the proof when key registration starts after confirmation", async () => {
    vi.mocked(api_client.post).mockResolvedValue({ data: {} } as never);

    await initiate_hardware_key_registration({ password_hash: "PWHASH" });

    expect(api_client.post).toHaveBeenCalledWith(KEY_INITIATE_PATH, {
      password_hash: "PWHASH",
    });
  });
});

describe("key registration when confirmation is required", () => {
  it("returns the server code from a passkey registration", async () => {
    const create = vi.fn();

    stub_credentials(create);
    vi.mocked(api_client.post).mockResolvedValue(step_up_required as never);

    const response = await register_platform_passkey(null);

    expect(response.server_code).toBe(STEP_UP_REQUIRED_CODE);
    expect(response.data).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });

  it("returns the server code from a security key registration", async () => {
    const create = vi.fn();

    stub_credentials(create);
    vi.mocked(api_client.post).mockResolvedValue(step_up_required as never);

    const response = await register_security_key(null);

    expect(response.server_code).toBe(STEP_UP_REQUIRED_CODE);
    expect(response.data).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });

  it("uses confirmed options without starting registration again", async () => {
    const create = vi.fn().mockResolvedValue({
      rawId: new Uint8Array([1, 2, 3]).buffer,
      type: "public-key",
      response: {
        attestationObject: new Uint8Array([4, 5]).buffer,
        clientDataJSON: new Uint8Array([6, 7]).buffer,
      },
    });

    stub_credentials(create);
    vi.mocked(api_client.post).mockResolvedValue({
      data: { success: true, key_id: "key-1" },
    } as never);

    const response = await register_security_key(null, registration_options);

    expect(response.data?.success).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(api_client.post).toHaveBeenCalledTimes(1);
    expect(api_client.post).toHaveBeenCalledWith(
      KEY_COMPLETE_PATH,
      expect.objectContaining({
        challenge_token: "CHALLENGE_TOKEN",
        is_passkey: false,
      }),
    );
  });
});
