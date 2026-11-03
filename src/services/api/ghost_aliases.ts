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
import { API_ENDPOINTS } from "./endpoints";
import { encrypt_alias_field, compute_alias_hash, compute_routing_hash } from "./aliases";

export const GHOST_DOMAIN = "realiased.me";
export const LEGACY_GHOST_DOMAINS = ["astermail.org"];
export const ALL_GHOST_DOMAINS = [GHOST_DOMAIN, ...LEGACY_GHOST_DOMAINS];

export function uniform_random_index(modulus: number): number {
  const range = 0x100000000;
  const limit = range - (range % modulus);
  const buf = new Uint32Array(1);

  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % modulus;
  }
}

export interface GhostAlias {
  id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  alias_address_hash: string;
  domain: string;
  is_enabled: boolean;
  expires_at?: string;
  grace_expires_at?: string;
  thread_token_hash?: string;
  created_at: string;
}

export interface CreateGhostAliasResponse {
  id: string;
  success: boolean;
  expires_at: string;
  grace_expires_at: string;
}

export async function create_ghost_alias(
  local_part: string,
  expires_in_days: number,
  thread_token_hash?: string,
): Promise<ApiResponse<CreateGhostAliasResponse>> {
  const normalized = local_part.toLowerCase().trim();
  const alias_hash = await compute_alias_hash(normalized, GHOST_DOMAIN);
  const routing_hash = await compute_routing_hash(normalized, GHOST_DOMAIN);
  const { encrypted, nonce } = await encrypt_alias_field(normalized);

  const request: Record<string, unknown> = {
    encrypted_local_part: encrypted,
    local_part_nonce: nonce,
    alias_address_hash: alias_hash,
    routing_address_hash: routing_hash,
    domain: GHOST_DOMAIN,
    expires_in_days,
  };

  if (thread_token_hash) {
    request.thread_token_hash = thread_token_hash;
  }

  return api_client.post<CreateGhostAliasResponse>(
    API_ENDPOINTS.addresses.aliases.ghost.base,
    request,
  );
}
