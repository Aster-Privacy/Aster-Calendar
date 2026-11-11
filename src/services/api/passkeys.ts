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

import type {
  HardwareKeyRegistrationCompleteResponse,
  HardwareKeyRegistrationOptions,
} from "./webauthn";

import { api_client, ApiResponse } from "./client";

import {
  initiate_hardware_key_registration,
  complete_hardware_key_registration,
} from "./webauthn";

import { ignore_error } from "@/lib/ignore_error";
import { get_active_translations } from "@/lib/i18n/translations";
import { webauthn_available_here } from "@/lib/app_kind";

async function get_prf_eval(): Promise<ArrayBuffer> {
  return crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("aster-vault-prf-eval-v1"),
  );
}

function base64url_to_array_buffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");

  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

function array_buffer_to_base64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function get_platform_passkey_name(): string {
  const ua = navigator.userAgent;
  const base = get_active_translations().passkeys.unnamed_passkey;

  if (/iPhone|iPad|iPod/.test(ua)) return `${base} (iPhone/iPad)`;
  if (/Android/.test(ua)) return `${base} (Android)`;
  if (/Mac/.test(ua)) return `${base} (Mac)`;
  if (/Windows/.test(ua)) return `${base} (Windows)`;

  return base;
}

async function resolve_registration_options(
  prefetched_options?: HardwareKeyRegistrationOptions,
): Promise<ApiResponse<HardwareKeyRegistrationOptions>> {
  if (prefetched_options) return { data: prefetched_options };

  return initiate_hardware_key_registration();
}

export async function register_platform_passkey(
  friendly_name: string | null,
  vault_passphrase?: string,
  prefetched_options?: HardwareKeyRegistrationOptions,
): Promise<ApiResponse<HardwareKeyRegistrationCompleteResponse>> {
  const options_response =
    await resolve_registration_options(prefetched_options);

  if (!options_response.data) {
    return {
      data: undefined,
      error: options_response.error,
      server_code: options_response.server_code,
    };
  }

  const resolved_name = friendly_name ?? get_platform_passkey_name();
  const options = options_response.data;
  const public_key: PublicKeyCredentialCreationOptions = {
    challenge: base64url_to_array_buffer(options.challenge),
    rp: { name: options.rp.name, id: options.rp.id },
    user: {
      id: base64url_to_array_buffer(
        btoa(options.user.id)
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, ""),
      ),
      name: options.user.name,
      displayName: options.user.displayName,
    },
    pubKeyCredParams: options.pubKeyCredParams.map((p) => ({
      type: p.type as PublicKeyCredentialType,
      alg: p.alg,
    })),
    timeout: options.timeout,
    attestation: options.attestation as AttestationConveyancePreference,
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "required",
      userVerification: "required",
    },
    // WebAuthn L3 hint - reinforces platform-only request to browsers/extensions
    ...({ hints: ["client-device"] } as object),
  };

  let credential: PublicKeyCredential | null;

  try {
    credential = (await navigator.credentials.create({
      publicKey: public_key,
    })) as PublicKeyCredential | null;
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotAllowedError") {
      return { data: undefined, error: "passkey_cancelled" };
    }

    return { data: undefined, error: "passkey_cancelled" };
  }

  if (!credential) {
    return { data: undefined, error: "passkey_cancelled" };
  }

  const attestation_response =
    credential.response as AuthenticatorAttestationResponse;

  const transports: string[] = attestation_response.getTransports?.() ?? [];
  const is_platform_authenticator = transports.includes("internal");

  const actual_name = is_platform_authenticator
    ? resolved_name
    : `${resolved_name} (via password manager)`;

  const reg_result = await complete_hardware_key_registration({
    id: array_buffer_to_base64url(credential.rawId),
    raw_id: array_buffer_to_base64url(credential.rawId),
    response: {
      attestation_object: btoa(
        Array.from(
          new Uint8Array(attestation_response.attestationObject),
          (b) => String.fromCharCode(b),
        ).join(""),
      ),
      client_data_json: btoa(
        Array.from(new Uint8Array(attestation_response.clientDataJSON), (b) =>
          String.fromCharCode(b),
        ).join(""),
      ),
    },
    type: credential.type,
    name_encrypted: actual_name,
    challenge_token: options.challenge_token,
    is_passkey: true,
  });

  if (reg_result.data) {
    reg_result.data = {
      ...reg_result.data,
      is_platform_authenticator,
    } as typeof reg_result.data & { is_platform_authenticator: boolean };
  }

  if (
    reg_result.data?.success &&
    vault_passphrase &&
    is_platform_authenticator
  ) {
    const key_id = reg_result.data.key_id;
    const raw_credential_id = array_buffer_to_base64url(credential.rawId);

    setup_prf_passphrase(
      key_id,
      raw_credential_id,
      options.rp.id,
      vault_passphrase,
    ).catch((caught) =>
      ignore_error("services/api/passkeys:register_platform_passkey", caught),
    );
  }

  return reg_result;
}

export async function register_security_key(
  friendly_name: string | null,
  prefetched_options?: HardwareKeyRegistrationOptions,
): Promise<ApiResponse<HardwareKeyRegistrationCompleteResponse>> {
  const options_response =
    await resolve_registration_options(prefetched_options);

  if (!options_response.data) {
    return {
      data: undefined,
      error: options_response.error,
      server_code: options_response.server_code,
    };
  }

  const options = options_response.data;
  const resolved_name =
    friendly_name ?? get_active_translations().passkeys.unnamed_security_key;
  const public_key: PublicKeyCredentialCreationOptions = {
    challenge: base64url_to_array_buffer(options.challenge),
    rp: { name: options.rp.name, id: options.rp.id },
    user: {
      id: base64url_to_array_buffer(
        btoa(options.user.id)
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, ""),
      ),
      name: options.user.name,
      displayName: options.user.displayName,
    },
    pubKeyCredParams: options.pubKeyCredParams.map((p) => ({
      type: p.type as PublicKeyCredentialType,
      alg: p.alg,
    })),
    timeout: options.timeout,
    attestation: options.attestation as AttestationConveyancePreference,
    authenticatorSelection: {
      authenticatorAttachment: "cross-platform",
      residentKey: "discouraged",
      userVerification: "preferred",
    },
    ...({ hints: ["security-key"] } as object),
  };

  let credential: PublicKeyCredential | null;

  try {
    credential = (await navigator.credentials.create({
      publicKey: public_key,
    })) as PublicKeyCredential | null;
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotAllowedError") {
      return { data: undefined, error: "passkey_cancelled" };
    }
    const detail =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);

    return { data: undefined, error: detail };
  }

  if (!credential) {
    return { data: undefined, error: "passkey_cancelled" };
  }

  const attestation_response =
    credential.response as AuthenticatorAttestationResponse;

  return complete_hardware_key_registration({
    id: array_buffer_to_base64url(credential.rawId),
    raw_id: array_buffer_to_base64url(credential.rawId),
    response: {
      attestation_object: btoa(
        Array.from(
          new Uint8Array(attestation_response.attestationObject),
          (b) => String.fromCharCode(b),
        ).join(""),
      ),
      client_data_json: btoa(
        Array.from(new Uint8Array(attestation_response.clientDataJSON), (b) =>
          String.fromCharCode(b),
        ).join(""),
      ),
    },
    type: credential.type,
    name_encrypted: resolved_name,
    challenge_token: options.challenge_token,
    is_passkey: false,
  });
}

async function setup_prf_passphrase(
  key_id: string,
  credential_id: string,
  rp_id: string,
  passphrase: string,
): Promise<void> {
  const prf_eval = await get_prf_eval();

  let credential: PublicKeyCredential | null;

  try {
    credential = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)).buffer,
        rpId: rp_id,
        allowCredentials: [
          { type: "public-key", id: base64url_to_array_buffer(credential_id) },
        ],
        userVerification: "required",
        timeout: 60000,
        ...({ extensions: { prf: { eval: { first: prf_eval } } } } as object),
      },
    })) as PublicKeyCredential | null;
  } catch {
    return;
  }

  if (!credential) return;

  const prf_output: ArrayBuffer | null =
    (credential.getClientExtensionResults() as any)?.prf?.results?.first ??
    null;

  if (!prf_output) return;

  const enc = await encrypt_with_prf(prf_output, passphrase);

  if (!enc) return;

  await api_client.post(`/core/v1/auth/hardware-keys/${key_id}/prf`, {
    prf_encrypted_passphrase: enc.encrypted,
    prf_nonce: enc.nonce,
  });
}

async function encrypt_with_prf(
  prf_output: ArrayBuffer,
  passphrase: string,
): Promise<{ encrypted: string; nonce: string } | null> {
  try {
    const key_material = await crypto.subtle.importKey(
      "raw",
      prf_output,
      "HKDF",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new TextEncoder().encode("aster-vault-passphrase-key-v1"),
        info: new Uint8Array(0),
      },
      key_material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      new TextEncoder().encode(passphrase),
    );

    return {
      encrypted: btoa(
        Array.from(new Uint8Array(encrypted), (b) =>
          String.fromCharCode(b),
        ).join(""),
      ),
      nonce: btoa(Array.from(nonce, (b) => String.fromCharCode(b)).join("")),
    };
  } catch {
    return null;
  }
}

export function is_passkey_supported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    webauthn_available_here()
  );
}

export async function is_platform_passkey_available(): Promise<boolean> {
  if (!is_passkey_supported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}
