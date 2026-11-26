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
const V3_FLOOR_STORAGE_PREFIX = "aster_calendar_v3_floor:";

const v3_floor_accounts = new Set<string>();

export function stored_v3_floor(account_id: string): boolean {
  if (v3_floor_accounts.has(account_id)) return true;
  try {
    const is_stored =
      window.localStorage.getItem(V3_FLOOR_STORAGE_PREFIX + account_id) === "1";

    if (is_stored) v3_floor_accounts.add(account_id);

    return is_stored;
  } catch {
    return false;
  }
}

export function store_v3_floor(account_id: string): void {
  v3_floor_accounts.add(account_id);
  try {
    window.localStorage.setItem(V3_FLOOR_STORAGE_PREFIX + account_id, "1");
  } catch {
    return;
  }
}
