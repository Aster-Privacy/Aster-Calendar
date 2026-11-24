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
export interface SecurityReadyInput {
  totp_known: boolean;
  totp_status_failed: boolean;
  login_alerts_loaded: boolean;
  login_alerts_failed: boolean;
  login_events_loading: boolean;
  login_events_failed: boolean;
  login_events_count: number;
}

export function security_ready(input: SecurityReadyInput): boolean {
  const totp_settled = input.totp_known || input.totp_status_failed;
  const login_alerts_settled =
    input.login_alerts_loaded || input.login_alerts_failed;
  const login_events_settled =
    !input.login_events_loading ||
    input.login_events_failed ||
    input.login_events_count > 0;

  return totp_settled && login_alerts_settled && login_events_settled;
}

export function platform_buttons_ready(platform_available: boolean | null) {
  return platform_available !== null;
}
