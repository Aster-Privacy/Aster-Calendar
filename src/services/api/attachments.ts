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
import { upload_timeout_ms } from "./upload_timeout";

export interface MailAttachment {
  id: string;
  mail_item_id: string;
  encrypted_data: string;
  data_nonce: string;
  encrypted_meta: string;
  meta_nonce: string;
  size_bytes: number;
  seq_num: number;
  created_at: string;
}

export interface CreateAttachmentRequest {
  encrypted_data: string;
  data_nonce: string;
  encrypted_meta: string;
  meta_nonce: string;
  size_bytes?: number;
  seq_num?: number;
}

export interface AttachmentsListResponse {
  attachments: MailAttachment[];
  total: number;
}

export async function list_attachments(
  mail_id: string,
): Promise<ApiResponse<AttachmentsListResponse>> {
  return api_client.get<AttachmentsListResponse>(
    `/mail/v1/attachments/by-mail/${mail_id}`,
  );
}

export async function create_attachment(
  mail_id: string,
  data: CreateAttachmentRequest,
): Promise<ApiResponse<MailAttachment>> {
  return api_client.post<MailAttachment>(
    `/mail/v1/attachments/by-mail/${mail_id}`,
    data,
    { timeout: upload_timeout_ms(data.encrypted_data.length) },
  );
}

export async function update_attachment_meta(
  attachment_id: string,
  data: { encrypted_meta: string; meta_nonce: string },
): Promise<ApiResponse<{ status: string }>> {
  return api_client.put<{ status: string }>(
    `/mail/v1/attachments/${attachment_id}/meta`,
    data,
  );
}
