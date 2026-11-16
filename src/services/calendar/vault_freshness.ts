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
export type CalendarVaultRefresh = "current" | "adopted" | "unverified";

export async function refresh_vault_from_server(): Promise<CalendarVaultRefresh> {
  try {
    const [{ sync_vault_with_server }, { with_vault_write_lock }] =
      await Promise.all([
        import("@/services/crypto/ensure_ratchet_keys"),
        import("@/services/crypto/vault_write_lock"),
      ]);
    const freshness = await with_vault_write_lock(() =>
      sync_vault_with_server(),
    );

    return freshness.status;
  } catch {
    return "unverified";
  }
}
