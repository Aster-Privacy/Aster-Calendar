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
import type { MailItemMetadata } from "@/types/email";

import { api_client, type ApiResponse } from "./client";

export interface MailItemFolder {
  token: string;
  name: string;
  color: string;
  icon?: string;
}

export type MailItemLabel = MailItemFolder;

export interface ReactionSummary {
  reaction_mail_item_id: string;
  source: "internal" | "external_inbound" | "external_outbound";
  emoji?: string;
  reactor_email?: string;
  is_own?: boolean;
  created_at: string;
}

export interface MailItem {
  id: string;
  item_type: "received" | "sent" | "draft" | "scheduled" | "outbox";
  encrypted_envelope: string;
  envelope_nonce: string;
  ephemeral_key?: string;
  ephemeral_pq_key?: string;
  sender_sealed?: string;
  folder_token: string;
  is_external: boolean;
  system_origin?: boolean;
  has_recipient_key?: boolean;
  thread_token?: string;
  thread_message_count?: number;
  thread_unread_count?: number;
  routing_token?: string;
  created_at: string;
  labels?: MailItemLabel[];
  encrypted_metadata?: string;
  metadata_nonce?: string;
  metadata_version?: number;
  scheduled_at?: string;
  send_status?: string;
  send_error?: string;
  message_ts?: string;
  snoozed_until?: string;
  is_trashed?: boolean;
  is_archived?: boolean;
  is_spam?: boolean;
  is_read?: boolean;
  is_starred?: boolean;
  is_pinned?: boolean;
  has_attachments?: boolean;
  attachment_count?: number;
  size_bytes?: number;
  folders?: MailItemFolder[];
  tag_tokens?: string[];
  metadata?: MailItemMetadata;
  expires_at?: string;
  expiry_type?: "sender" | "recipient";
  phishing_level?: "safe" | "suspicious" | "dangerous";
  message_group_id?: string;
  rule_category?: string;
  sender_verified?: boolean;
  sender_verified_domain?: string;
  is_reaction?: boolean;
  reactions?: ReactionSummary[];
  spf_result?: string;
  dkim_result?: string;
  dmarc_result?: string;
}

export interface MailItemsListResponse {
  items: MailItem[];
  total: number;
  next_cursor?: string;
  has_more: boolean;
}

export interface ListEncryptedMailItemsParams {
  limit?: number;
  cursor?: string;
  item_type?: "received" | "sent" | "draft" | "scheduled";
  include_envelope?: boolean;
  include_reactions?: boolean;
}

export interface UpdateMailItemRequest {
  folder_token?: string;
  encrypted_metadata?: string;
  metadata_nonce?: string;
  encrypted_envelope?: string;
  envelope_nonce?: string;
}

export async function list_encrypted_mail_items(
  params: ListEncryptedMailItemsParams = {},
): Promise<ApiResponse<MailItemsListResponse>> {
  const query_params = new URLSearchParams();

  if (params.limit) query_params.set("limit", params.limit.toString());
  if (params.cursor) query_params.set("cursor", params.cursor);
  if (params.item_type) query_params.set("item_type", params.item_type);
  if (params.include_envelope === false)
    query_params.set("include_envelope", "false");
  if (params.include_reactions) query_params.set("include_reactions", "true");

  const query_string = query_params.toString();
  const endpoint = `/mail/v1/messages/encrypted${query_string ? `?${query_string}` : ""}`;

  return api_client.get<MailItemsListResponse>(endpoint, {
    cache_ttl: 0,
    request_priority: "background",
  });
}

export async function update_mail_item(
  item_id: string,
  data: UpdateMailItemRequest,
): Promise<ApiResponse<{ success: boolean; updated_count: number }>> {
  return api_client.put<{ success: boolean; updated_count: number }>(
    `/mail/v1/messages/${item_id}`,
    data,
  );
}
