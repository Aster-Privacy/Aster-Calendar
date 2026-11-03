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
import { api_client, type ApiResponse } from "./client";

import { user_facing_error } from "@/utils/user_facing_error";

import { get_or_create_derived_encryption_crypto_key } from "@/services/crypto/memory_key_store";
import { get_active_translations } from "@/lib/i18n/translations";

export type SignaturePlacement = "above" | "below";

export interface SignatureFormData {
  name: string;
  content: string;
  is_html?: boolean;
  alias_id?: string | null;
  placement?: SignaturePlacement | null;
}

export interface Signature {
  id: string;
  encrypted_name: string;
  name_nonce: string;
  encrypted_content: string;
  content_nonce: string;
  is_default: boolean;
  is_html: boolean;
  alias_id: string | null;
  placement: number | null;
  created_at: string;
  updated_at: string;
}

function placement_to_int(
  p: SignaturePlacement | null | undefined,
): number | null {
  if (p === "above") return 1;
  if (p === "below") return 0;

  return null;
}

export interface CreateSignatureRequest {
  encrypted_name: string;
  name_nonce: string;
  encrypted_content: string;
  content_nonce: string;
  is_default: boolean;
  is_html: boolean;
  alias_id?: string | null;
  placement?: number | null;
}

export interface CreateSignatureResponse {
  id: string;
  success: boolean;
  created_at: string;
}

export interface UpdateSignatureRequest {
  encrypted_name?: string;
  name_nonce?: string;
  encrypted_content?: string;
  content_nonce?: string;
  is_html?: boolean;
  alias_id?: string | null;
  placement?: number | null;
}

export interface UpdateSignatureResponse {
  success: boolean;
  updated_at: string;
}

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

async function get_encryption_key(): Promise<CryptoKey> {
  const key = await get_or_create_derived_encryption_crypto_key();

  if (!key) {
    throw new Error(
      get_active_translations().errors.encryption_keys_unavailable,
    );
  }

  return key;
}

async function encrypt_string(
  plaintext: string,
): Promise<{ encrypted: string; nonce: string }> {
  const key = await get_encryption_key();
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    data,
  );

  return {
    encrypted: array_to_base64(new Uint8Array(ciphertext)),
    nonce: array_to_base64(nonce),
  };
}

export async function create_signature(
  data: SignatureFormData,
  is_default: boolean = false,
): Promise<ApiResponse<CreateSignatureResponse>> {
  try {
    const [encrypted_name, encrypted_content] = await Promise.all([
      encrypt_string(data.name),
      encrypt_string(data.content),
    ]);

    const request: CreateSignatureRequest = {
      encrypted_name: encrypted_name.encrypted,
      name_nonce: encrypted_name.nonce,
      encrypted_content: encrypted_content.encrypted,
      content_nonce: encrypted_content.nonce,
      is_default,
      is_html: data.is_html ?? false,
      alias_id: data.alias_id ?? null,
      placement: placement_to_int(data.placement),
    };

    return api_client.post<CreateSignatureResponse>(
      "/mail/v1/signatures",
      request,
    );
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().common.save_failed,
      ),
    };
  }
}

export async function update_signature(
  signature_id: string,
  data: Partial<SignatureFormData>,
): Promise<ApiResponse<UpdateSignatureResponse>> {
  try {
    const request: UpdateSignatureRequest = {};

    if (data.name !== undefined) {
      const encrypted = await encrypt_string(data.name);

      request.encrypted_name = encrypted.encrypted;
      request.name_nonce = encrypted.nonce;
    }

    if (data.content !== undefined) {
      const encrypted = await encrypt_string(data.content);

      request.encrypted_content = encrypted.encrypted;
      request.content_nonce = encrypted.nonce;
    }

    if (data.is_html !== undefined) {
      request.is_html = data.is_html;
    }

    if (data.alias_id !== undefined) {
      request.alias_id = data.alias_id;
    }

    if (data.placement !== undefined) {
      request.placement = placement_to_int(data.placement);
    }

    return api_client.put<UpdateSignatureResponse>(
      `/mail/v1/signatures/${signature_id}`,
      request,
    );
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().common.save_failed,
      ),
    };
  }
}
