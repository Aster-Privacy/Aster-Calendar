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
import { api_client, type ApiResponse, type RequestConfig } from "./client";
import { GUARD_TOKEN_HEADER } from "./client/helpers";
import { clear_csrf_cache } from "./csrf";
import { is_totp_required_response } from "./totp";

const GUARD_BASE = "/core/v1/guard";

export const GUARD_ENVELOPE_VERSIONS: number[] = [2];

export type GuardDeviceType = "web" | "desktop" | "mobile";

export interface GuardDeviceKeys {
  ed25519_pk: string;
  mlkem_pk: string;
  x25519_pk: string;
  action_pk: string;
  device_type: GuardDeviceType;
  name: string;
}

export type GuardSignInStatus =
  | "created"
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "completed"
  | "rescue_pending";

export interface GuardSignInStatusResponse {
  status: GuardSignInStatus;
  expires_at: string;
  apply_after: string | null;
}

export interface GuardSignInGuardPart {
  device_id: string;
  code_secret_sealed: string;
  approval_envelope: string | null;
}

export type GuardSignInComplete = Record<string, unknown> & {
  guard: GuardSignInGuardPart;
};

export interface GuardNonce {
  nonce: string;
  expires_at: string;
}

export interface GuardResume {
  device_id: string;
  nonce: string;
  signature: string;
}

export interface GuardSignInBeginBody {
  device: GuardDeviceKeys;
  envelope_versions: number[];
  number_hash: string;
  resume: GuardResume | null;
}

export interface GuardRescueStart {
  rescue_id: string;
  apply_after: string;
  account_id?: string | null;
}

export type GuardRescueState = "pending" | "applied" | "vetoed" | "cancelled";

export interface GuardRescueStatus {
  status: GuardRescueState;
  apply_after: string;
}

function token_config(token: string): RequestConfig {
  return {
    headers: { [GUARD_TOKEN_HEADER]: token },
    skip_session_refresh: true,
    skip_cache: true,
  };
}

function path_id(id: string): string {
  return encodeURIComponent(id);
}

export function guard_sign_in_resume_nonce(
  token: string,
  body: { device_id: string },
): Promise<ApiResponse<GuardNonce>> {
  return api_client.post<GuardNonce>(
    `${GUARD_BASE}/sign-in/resume-nonce`,
    body,
    token_config(token),
  );
}

export function guard_sign_in_begin(
  token: string,
  body: GuardSignInBeginBody,
): Promise<ApiResponse<{ status: GuardSignInStatus; expires_at: string }>> {
  return api_client.post<{ status: GuardSignInStatus; expires_at: string }>(
    `${GUARD_BASE}/sign-in/begin`,
    body,
    token_config(token),
  );
}

export function guard_sign_in_status(
  token: string,
): Promise<ApiResponse<GuardSignInStatusResponse>> {
  return api_client.get<GuardSignInStatusResponse>(
    `${GUARD_BASE}/sign-in/status`,
    token_config(token),
  );
}

export function guard_sign_in_code(
  token: string,
  code: string,
): Promise<ApiResponse<{ status: GuardSignInStatus }>> {
  return api_client.post<{ status: GuardSignInStatus }>(
    `${GUARD_BASE}/sign-in/code`,
    { code },
    token_config(token),
  );
}

export async function guard_sign_in_complete(
  token: string,
): Promise<ApiResponse<GuardSignInComplete>> {
  const response = await api_client.post<GuardSignInComplete>(
    `${GUARD_BASE}/sign-in/complete`,
    {},
    token_config(token),
  );
  const data = response.data;

  if (data && !is_totp_required_response(data)) {
    clear_csrf_cache();
    if (typeof data.csrf_token === "string" && data.csrf_token) {
      api_client.set_csrf(data.csrf_token);
    }
    if (typeof data.access_token === "string" && data.access_token) {
      api_client.set_dev_token(
        data.access_token,
        typeof data.refresh_token === "string" ? data.refresh_token : undefined,
      );
    }
    api_client.set_authenticated(true);
  }

  return response;
}

export function guard_sign_in_rescue(
  token: string,
  rescue_code: string,
): Promise<ApiResponse<GuardRescueStart>> {
  return api_client.post<GuardRescueStart>(
    `${GUARD_BASE}/sign-in/rescue`,
    { rescue_code },
    token_config(token),
  );
}

export function guard_rescue_status(
  rescue_id: string,
): Promise<ApiResponse<GuardRescueStatus>> {
  return api_client.get<GuardRescueStatus>(
    `${GUARD_BASE}/sign-in/rescue/status?id=${path_id(rescue_id)}`,
    { skip_cache: true, skip_session_refresh: true },
  );
}

