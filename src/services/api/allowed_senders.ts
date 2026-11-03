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
import { BULK_REQUEST_LIMIT, send_in_chunks } from "./chunked_request";
import { array_to_base64, normalize_email } from "./sender_utils";

import { user_facing_error } from "@/utils/user_facing_error";
import { HASH_ALG } from "@/services/crypto/constants";

import {
  get_or_create_derived_encryption_crypto_key,
  get_derived_encryption_key,
} from "@/services/crypto/memory_key_store";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { get_key, store_key } from "@/services/crypto/crypto_key_cache";
import { get_active_translations } from "@/lib/i18n/translations";

const ALLOWED_SENDERS_HMAC_KEY_ID = "allowed_senders_hmac_key";

async function get_hmac_key(): Promise<CryptoKey> {
  const cached = get_key(ALLOWED_SENDERS_HMAC_KEY_ID);

  if (cached) {
    return cached;
  }

  const raw_key = get_derived_encryption_key();

  if (!raw_key) {
    throw new Error(
      get_active_translations().errors.encryption_keys_unavailable,
    );
  }

  const encoder = new TextEncoder();
  const info = encoder.encode("allowed-senders-hmac-v1");
  const combined = new Uint8Array(raw_key.byteLength + info.length);

  combined.set(raw_key, 0);
  combined.set(info, raw_key.byteLength);

  const hash = await crypto.subtle.digest(HASH_ALG, combined);

  zero_uint8_array(raw_key);
  zero_uint8_array(combined);

  const hmac_key = await crypto.subtle.importKey(
    "raw",
    hash,
    { name: "HMAC", hash: HASH_ALG },
    false,
    ["sign", "verify"],
  );

  store_key(ALLOWED_SENDERS_HMAC_KEY_ID, hmac_key, "hmac");

  return hmac_key;
}

async function get_allowed_senders_encryption_key(): Promise<CryptoKey> {
  const key = await get_or_create_derived_encryption_crypto_key();

  if (!key) {
    throw new Error(
      get_active_translations().errors.encryption_keys_unavailable,
    );
  }

  return key;
}

export async function generate_sender_token(
  email: string,
  is_domain: boolean = false,
): Promise<string> {
  const hmac_key = await get_hmac_key();
  const normalized = is_domain
    ? email.toLowerCase().trim()
    : normalize_email(email);
  const prefix = is_domain ? "domain:" : "email:";
  const encoder = new TextEncoder();
  const data = encoder.encode(prefix + normalized);
  const hash = await crypto.subtle.sign("HMAC", hmac_key, data);

  return array_to_base64(new Uint8Array(hash));
}

async function generate_integrity_hash(
  encrypted_data: string,
  nonce: string,
): Promise<string> {
  const hmac_key = await get_hmac_key();
  const encoder = new TextEncoder();
  const combined = `${encrypted_data}:${nonce}:allowed-senders-v1`;
  const data = encoder.encode(combined);
  const hash = await crypto.subtle.sign("HMAC", hmac_key, data);

  return array_to_base64(new Uint8Array(hash));
}

export interface AllowedSenderData {
  email: string;
  name?: string;
  allowed_at: string;
  is_domain: boolean;
}

export async function encrypt_allow_data(data: AllowedSenderData): Promise<{
  encrypted_sender_data: string;
  sender_data_nonce: string;
  integrity_hash: string;
}> {
  const key = await get_allowed_senders_encryption_key();
  const encoder = new TextEncoder();
  const payload = {
    ...data,
    _encrypted_at: new Date().toISOString(),
  };
  const plaintext = encoder.encode(JSON.stringify(payload));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    plaintext,
  );

  const encrypted_sender_data = array_to_base64(new Uint8Array(ciphertext));
  const sender_data_nonce = array_to_base64(nonce);
  const integrity_hash = await generate_integrity_hash(
    encrypted_sender_data,
    sender_data_nonce,
  );

  return { encrypted_sender_data, sender_data_nonce, integrity_hash };
}

export interface AllowedSenderResponse {
  id: string;
  sender_token: string;
  encrypted_sender_data: string;
  sender_data_nonce: string;
  integrity_hash: string;
  is_domain: boolean;
  created_at: string;
}

export interface DecryptedAllowedSender {
  id: string;
  sender_token: string;
  is_unreadable?: boolean;
  email: string;
  name?: string;
  allowed_at: string;
  is_domain: boolean;
  created_at: string;
}

export async function allow_sender(
  email: string,
  name?: string,
  is_domain: boolean = false,
): Promise<ApiResponse<DecryptedAllowedSender>> {
  try {
    const sender_token = await generate_sender_token(email, is_domain);
    const normalized = is_domain
      ? email.toLowerCase().trim()
      : normalize_email(email);
    const hash_buffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(normalized),
    );
    const sender_hash = Array.from(new Uint8Array(hash_buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const allow_data: AllowedSenderData = {
      email: normalized,
      name,
      allowed_at: new Date().toISOString(),
      is_domain,
    };
    const { encrypted_sender_data, sender_data_nonce, integrity_hash } =
      await encrypt_allow_data(allow_data);

    const response = await api_client.post<AllowedSenderResponse>(
      "/contacts/v1/allowed_senders",
      {
        sender_token,
        sender_hash,
        encrypted_sender_data,
        sender_data_nonce,
        integrity_hash,
        is_domain,
      },
    );

    if (response.error || !response.data) {
      return {
        error: response.error || get_active_translations().errors.generic,
      };
    }

    return {
      data: {
        id: response.data.id,
        sender_token: response.data.sender_token,
        email: allow_data.email,
        name: allow_data.name,
        allowed_at: allow_data.allowed_at,
        is_domain: response.data.is_domain,
        created_at: response.data.created_at,
      },
    };
  } catch (err) {
    return {
      error: user_facing_error(err, get_active_translations().errors.generic),
    };
  }
}

export async function remove_allowed_sender(
  email: string,
  is_domain: boolean = false,
): Promise<ApiResponse<{ success: boolean }>> {
  try {
    const sender_token = await generate_sender_token(email, is_domain);
    const response = await api_client.delete<{ success: boolean }>(
      `/contacts/v1/allowed_senders?sender_token=${encodeURIComponent(sender_token)}`,
    );

    return response;
  } catch (err) {
    return {
      error: user_facing_error(err, get_active_translations().errors.generic),
    };
  }
}

export async function bulk_remove_allowed_senders_by_tokens(
  sender_tokens: string[],
): Promise<ApiResponse<{ success: boolean; removed_count: number }>> {
  try {
    return await send_in_chunks(
      sender_tokens,
      BULK_REQUEST_LIMIT,
      (chunk) =>
        api_client.delete<{
          success: boolean;
          removed_count: number;
        }>("/contacts/v1/allowed_senders/bulk", {
          body: JSON.stringify({ sender_tokens: chunk }),
        }),
      (total, next) => ({
        success: total.success && next.success,
        removed_count: total.removed_count + next.removed_count,
      }),
    );
  } catch (err) {
    return {
      error: user_facing_error(err, get_active_translations().errors.generic),
    };
  }
}

export async function check_allowed_senders(
  emails: string[],
): Promise<Set<string>> {
  if (emails.length === 0) {
    return new Set();
  }

  try {
    const token_to_email = new Map<string, string>();

    await Promise.all(
      emails.map(async (email) => {
        const token = await generate_sender_token(email);

        token_to_email.set(token, normalize_email(email));
      }),
    );

    const tokens = Array.from(token_to_email.keys());
    const response = await api_client.get<{ allowed_tokens: string[] }>(
      `/contacts/v1/allowed_senders/check?tokens=${encodeURIComponent(tokens.join(","))}`,
    );

    if (response.error || !response.data) {
      return new Set();
    }

    const allowed_emails = new Set<string>();

    for (const token of response.data.allowed_tokens) {
      const email = token_to_email.get(token);

      if (email) {
        allowed_emails.add(email);
      }
    }

    return allowed_emails;
  } catch {
    return new Set();
  }
}
