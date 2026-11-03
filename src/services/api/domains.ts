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
import type { TranslationKey } from "@/lib/i18n/types";

import { api_client, type ApiResponse } from "./client";

import { HASH_ALG } from "@/services/crypto/constants";
import { get_active_translations } from "@/lib/i18n/translations";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import {
  get_or_create_derived_encryption_crypto_key,
  get_derived_encryption_key,
} from "@/services/crypto/memory_key_store";
import { zero_uint8_array } from "@/services/crypto/secure_memory";

export interface DnsRecord {
  record_type: string;
  host: string;
  value: string;
  purpose: string;
  is_verified: boolean;
  priority?: number;
  required?: boolean;
  caveat_key?: string;
}

export interface RecordStatus {
  verified: boolean;
  verified_at?: string;
  last_check?: string;
}

export interface VerificationStatus {
  txt: RecordStatus;
  mx: RecordStatus;
  spf: RecordStatus;
  dkim: RecordStatus;
  dmarc: RecordStatus;
}

export interface CustomDomain {
  id: string;
  domain_name: string;
  status: string;
  txt_verified: boolean;
  mx_verified: boolean;
  spf_verified: boolean;
  dkim_verified: boolean;
  dmarc_configured: boolean;
  catch_all_enabled: boolean;
  is_primary: boolean;
  purchased?: boolean;
  is_purchased?: boolean;
  health_status: string;
  verification_token: string;
  created_at: string;
  verified_at?: string;
  last_verification_at?: string;
  downgrade_grace_expires_at?: string;
  is_shared?: boolean;
  shared_from?: string | null;
  can_create_aliases?: boolean;
  bimi_available?: boolean;
  bimi_state?: string | null;
}

export interface DomainListResponse {
  domains: CustomDomain[];
  total: number;
  max_domains: number;
}

export interface AddDomainResponse {
  id: string;
  domain_name: string;
  verification_token: string;
  dns_records: DnsRecord[];
  status: string;
  created_at: string;
}

export interface DnsRecordsResponse {
  records: DnsRecord[];
  verification_status: VerificationStatus;
}

export type DomainCheckKey = "mx" | "spf" | "dkim" | "dmarc";
export type DomainCheckOutcome = "pass" | "fail" | "unknown";
export type DomainHealthSeverity = "ok" | "warning" | "critical";

export interface DomainCheck {
  key: DomainCheckKey;
  outcome: DomainCheckOutcome;
  reason?: string;
  detail?: string;
}

export interface DomainHealth {
  domain_id: string;
  domain_name: string;
  status: string;
  health_status: string;
  severity: DomainHealthSeverity;
  receiving_mail: boolean;
  sending_trusted: boolean;
  checks: DomainCheck[];
  reasons: string[];
  dmarc_policy?: string;
  checked_at: string;
  cached: boolean;
}

export interface DomainAddress {
  id: string;
  domain_id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  local_part_hash?: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  profile_picture?: string;
  encrypted_note?: string | null;
  note_nonce?: string | null;
  is_enabled: boolean;
  is_primary: boolean;
  created_at: string;
}

export interface DecryptedDomainAddress {
  id: string;
  domain_id: string;
  local_part: string;
  local_part_hash?: string;
  display_name?: string;
  profile_picture?: string;
  note?: string;
  is_enabled: boolean;
  is_primary: boolean;
  created_at: string;
}

export interface AddressListResponse {
  addresses: DomainAddress[];
  total: number;
}

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function get_domain_hmac_key(): Promise<CryptoKey> {
  const raw_key = get_derived_encryption_key();

  if (!raw_key) {
    throw new Error(
      get_active_translations().errors.encryption_keys_unavailable,
    );
  }

  const encoder = new TextEncoder();
  const info = encoder.encode("astermail-domain-address-hmac-v1");
  const combined = new Uint8Array(raw_key.byteLength + info.length);

  combined.set(raw_key, 0);
  combined.set(info, raw_key.byteLength);

  const hash = await crypto.subtle.digest(HASH_ALG, combined);

  zero_uint8_array(raw_key);
  zero_uint8_array(combined);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "HMAC", hash: HASH_ALG },
    false,
    ["sign"],
  );
}

async function get_domain_encryption_key(): Promise<CryptoKey> {
  const key = await get_or_create_derived_encryption_crypto_key();

  if (!key) {
    throw new Error(
      get_active_translations().errors.encryption_keys_unavailable,
    );
  }

  return key;
}

export async function compute_address_hash(
  local_part: string,
  domain: string,
): Promise<string> {
  const hmac_key = await get_domain_hmac_key();
  const full_address = `${local_part.toLowerCase().replace(/\./g, "")}@${domain.toLowerCase()}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(full_address);
  const signature = await crypto.subtle.sign("HMAC", hmac_key, data);

  return array_to_base64(new Uint8Array(signature));
}

export async function compute_address_routing_hash(
  local_part: string,
  domain: string,
): Promise<string> {
  const full_address = `${local_part.toLowerCase().replace(/\./g, "")}@${domain.toLowerCase()}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(full_address);
  const hash = await crypto.subtle.digest(HASH_ALG, data);

  return array_to_base64(new Uint8Array(hash));
}

export async function encrypt_address_field(value: string): Promise<{
  encrypted: string;
  nonce: string;
}> {
  const key = await get_domain_encryption_key();
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(value);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    plaintext,
  );

  return {
    encrypted: array_to_base64(new Uint8Array(ciphertext)),
    nonce: array_to_base64(nonce),
  };
}

export async function decrypt_address_field(
  encrypted: string,
  nonce: string,
): Promise<string> {
  const key = await get_domain_encryption_key();
  const ciphertext = base64_to_array(encrypted);
  const iv = base64_to_array(nonce);
  const decrypted = await decrypt_aes_gcm_with_fallback(key, ciphertext, iv);
  const decoder = new TextDecoder();

  return decoder.decode(decrypted);
}

export async function decrypt_domain_address(
  address: DomainAddress,
): Promise<DecryptedDomainAddress> {
  const local_part = await decrypt_address_field(
    address.encrypted_local_part,
    address.local_part_nonce,
  );

  let display_name: string | undefined;

  if (address.encrypted_display_name && address.display_name_nonce) {
    display_name = await decrypt_address_field(
      address.encrypted_display_name,
      address.display_name_nonce,
    );
  }

  let note: string | undefined;

  if (address.encrypted_note && address.note_nonce) {
    try {
      note = await decrypt_address_field(
        address.encrypted_note,
        address.note_nonce,
      );
    } catch {
      note = undefined;
    }
  }

  return {
    id: address.id,
    domain_id: address.domain_id,
    local_part,
    local_part_hash: address.local_part_hash,
    display_name,
    profile_picture: address.profile_picture,
    note: note || undefined,
    is_enabled: address.is_enabled,
    is_primary: address.is_primary,
    created_at: address.created_at,
  };
}

const DOMAIN_ADDRESS_DECRYPT_BATCH_SIZE = 25;

export async function decrypt_domain_addresses(
  addresses: DomainAddress[],
): Promise<DecryptedDomainAddress[]> {
  const decrypted: DecryptedDomainAddress[] = [];

  for (
    let i = 0;
    i < addresses.length;
    i += DOMAIN_ADDRESS_DECRYPT_BATCH_SIZE
  ) {
    const batch = addresses.slice(i, i + DOMAIN_ADDRESS_DECRYPT_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((address) => decrypt_domain_address(address)),
    );

    for (const result of results) {
      if (result.status === "fulfilled") decrypted.push(result.value);
    }

    if (i + DOMAIN_ADDRESS_DECRYPT_BATCH_SIZE < addresses.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return decrypted;
}

export async function list_domains(): Promise<ApiResponse<DomainListResponse>> {
  return api_client.get<DomainListResponse>("/addresses/v1/domains");
}

export async function get_domain(
  domain_id: string,
): Promise<ApiResponse<CustomDomain>> {
  return api_client.get<CustomDomain>(`/addresses/v1/domains/${domain_id}`);
}

export async function add_domain(
  domain_name: string,
  captcha_token?: string,
): Promise<ApiResponse<AddDomainResponse>> {
  return api_client.post<AddDomainResponse>("/addresses/v1/domains", {
    domain_name,
    captcha_token,
  });
}

export async function update_domain(
  domain_id: string,
  updates: {
    catch_all_enabled?: boolean;
    is_primary?: boolean;
  },
): Promise<ApiResponse<CustomDomain>> {
  return api_client.patch<CustomDomain>(
    `/addresses/v1/domains/${domain_id}`,
    updates,
  );
}

export async function delete_domain(
  domain_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/addresses/v1/domains/${domain_id}`,
  );
}

export async function get_dns_records(
  domain_id: string,
): Promise<ApiResponse<DnsRecordsResponse>> {
  return api_client.get<DnsRecordsResponse>(
    `/addresses/v1/domains/${domain_id}/dns-records`,
  );
}

export async function list_domain_addresses(
  domain_id: string,
): Promise<ApiResponse<AddressListResponse>> {
  return api_client.get<AddressListResponse>(
    `/addresses/v1/domains/${domain_id}/addresses`,
  );
}

export async function add_domain_address(
  domain_id: string,
  local_part: string,
  domain_name: string,
  captcha_token?: string,
  display_name?: string,
  profile_picture?: string,
): Promise<ApiResponse<DomainAddress>> {
  const normalized_local_part = local_part.toLowerCase().trim();
  const address_hash = await compute_address_hash(
    normalized_local_part,
    domain_name,
  );
  const address_routing_hash = await compute_address_routing_hash(
    normalized_local_part,
    domain_name,
  );
  const { encrypted: encrypted_local_part, nonce: local_part_nonce } =
    await encrypt_address_field(normalized_local_part);

  const request: {
    encrypted_local_part: string;
    local_part_nonce: string;
    local_part_hash: string;
    address_routing_hash: string;
    encrypted_display_name?: string;
    display_name_nonce?: string;
    profile_picture?: string;
    captcha_token?: string;
  } = {
    encrypted_local_part,
    local_part_nonce,
    local_part_hash: address_hash,
    address_routing_hash,
    captcha_token,
  };

  if (display_name) {
    const { encrypted: encrypted_display_name, nonce: display_name_nonce } =
      await encrypt_address_field(display_name);

    request.encrypted_display_name = encrypted_display_name;
    request.display_name_nonce = display_name_nonce;
  }

  if (profile_picture) {
    request.profile_picture = profile_picture;
  }

  return api_client.post<DomainAddress>(
    `/addresses/v1/domains/${domain_id}/addresses`,
    request,
  );
}

export async function update_domain_address(
  domain_id: string,
  address_id: string,
  updates: {
    profile_picture?: string | null;
    display_name?: string;
    note?: string;
    is_enabled?: boolean;
  },
): Promise<ApiResponse<{ success: boolean }>> {
  const body: {
    profile_picture?: string | null;
    encrypted_display_name?: string;
    display_name_nonce?: string;
    encrypted_note?: string | null;
    note_nonce?: string | null;
    is_enabled?: boolean;
  } = {};

  if (updates.is_enabled !== undefined) {
    body.is_enabled = updates.is_enabled;
  }

  if (updates.profile_picture !== undefined) {
    body.profile_picture = updates.profile_picture;
  }

  if (updates.display_name !== undefined) {
    const { encrypted, nonce } = await encrypt_address_field(
      updates.display_name,
    );

    body.encrypted_display_name = encrypted;
    body.display_name_nonce = nonce;
  }

  if (updates.note !== undefined) {
    if (updates.note) {
      const { encrypted, nonce } = await encrypt_address_field(updates.note);

      body.encrypted_note = encrypted;
      body.note_nonce = nonce;
    } else {
      body.encrypted_note = null;
      body.note_nonce = null;
    }
  }

  return api_client.patch<{ success: boolean }>(
    `/addresses/v1/domains/${domain_id}/addresses/${address_id}`,
    body,
  );
}

export async function delete_domain_address(
  domain_id: string,
  address_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/addresses/v1/domains/${domain_id}/addresses/${address_id}`,
  );
}

export function validate_local_part(local_part: string): {
  valid: boolean;
  error?: string;
  error_key?: TranslationKey;
} {
  if (!local_part || local_part.length === 0) {
    return {
      valid: false,
      error: get_active_translations().errors.address_empty,
      error_key: "errors.address_empty",
    };
  }

  if (local_part.length < 1) {
    return {
      valid: false,
      error: get_active_translations().errors.address_too_short,
      error_key: "errors.address_too_short",
    };
  }

  if (local_part.length > 64) {
    return {
      valid: false,
      error: get_active_translations().errors.address_too_long,
      error_key: "errors.address_too_long",
    };
  }

  const valid_pattern = /^[a-z0-9][a-z0-9._-]*[a-z0-9]$|^[a-z0-9]$/;

  if (!valid_pattern.test(local_part.toLowerCase())) {
    return {
      valid: false,
      error: get_active_translations().errors.address_invalid_chars,
      error_key: "errors.address_invalid_chars",
    };
  }

  if (local_part.includes("..")) {
    return {
      valid: false,
      error: get_active_translations().errors.address_consecutive_dots,
      error_key: "errors.address_consecutive_dots",
    };
  }

  if (/^[0-9]+$/.test(local_part)) {
    return {
      valid: false,
      error: get_active_translations().errors.address_numeric_only,
      error_key: "errors.address_numeric_only",
    };
  }

  return { valid: true };
}
