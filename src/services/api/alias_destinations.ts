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

export type DeliveryMode = 0 | 1;

export interface AliasDestination {
  id: string;
  alias_id: string;
  encrypted_destination: string;
  destination_nonce: string;
  destination_address: string;
  pgp_public_key?: string;
  strip_trackers: boolean;
  keep_copy: boolean;
  created_at: string;
}

export interface ListAliasDestinationsResponse {
  destinations: AliasDestination[];
  delivery_mode: DeliveryMode;
}

export async function list_alias_destinations(
  alias_id: string,
): Promise<ApiResponse<ListAliasDestinationsResponse>> {
  return api_client.get<ListAliasDestinationsResponse>(
    `/addresses/v1/aliases/${alias_id}/destinations`,
  );
}
