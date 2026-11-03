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

export interface TagDefinition {
  id: string;
  tag_token: string;
  encrypted_name: string;
  name_nonce: string;
  encrypted_color?: string;
  color_nonce?: string;
  encrypted_icon?: string;
  icon_nonce?: string;
  sort_order: number;
  parent_token?: string;
  parent_id?: string;
  item_count?: number;
  created_at: string;
  updated_at: string;
}

export interface TagsListResponse {
  tags: TagDefinition[];
  total: number;
  has_more: boolean;
}

export interface ListTagsParams {
  include_counts?: boolean;
  limit?: number;
  offset?: number;
}

export interface UpdateTagRequest {
  encrypted_name?: string;
  name_nonce?: string;
  encrypted_color?: string;
  color_nonce?: string;
  encrypted_icon?: string;
  icon_nonce?: string;
  sort_order?: number;
  parent_token?: string;
}

export async function list_tags(
  params: ListTagsParams = {},
): Promise<ApiResponse<TagsListResponse>> {
  const query_params = new URLSearchParams();

  if (params.include_counts !== undefined) {
    query_params.set("include_counts", params.include_counts.toString());
  }
  if (params.limit !== undefined) {
    query_params.set("limit", params.limit.toString());
  }
  if (params.offset !== undefined) {
    query_params.set("offset", params.offset.toString());
  }

  const query_string = query_params.toString();
  const endpoint = `/mail/v1/tags${query_string ? `?${query_string}` : ""}`;

  return api_client.get<TagsListResponse>(endpoint, { cache_ttl: 60_000 });
}

export async function update_tag(
  tag_id: string,
  data: UpdateTagRequest,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.put<{ status: string }>(`/mail/v1/tags/${tag_id}`, data);
}
