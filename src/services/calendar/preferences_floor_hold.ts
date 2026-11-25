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
import type { SyncedRevisionFloors } from "@/services/calendar/revision_floor_sync";

import {
  stored_v3_floor,
  store_v3_floor,
} from "@/services/calendar/calendar_v3_floor_store";
import {
  merge_synced_floors,
  read_synced_floors,
  same_synced_floors,
} from "@/services/calendar/revision_floor_sync";

export interface CalendarFloorFields {
  calendar_v3_only: boolean;
  calendar_revision_floors: SyncedRevisionFloors;
}

const FLOOR_STORAGE_PREFIX = "aster_calendar_prefs_floor:";

const held_floors = new Map<string, SyncedRevisionFloors>();

function load_held_floors(account_id: string): SyncedRevisionFloors {
  const held = held_floors.get(account_id);

  if (held) return held;
  try {
    const raw = window.localStorage.getItem(FLOOR_STORAGE_PREFIX + account_id);

    return read_synced_floors(raw ? JSON.parse(raw) : null);
  } catch {
    return read_synced_floors(null);
  }
}

function store_held_floors(
  account_id: string,
  floors: SyncedRevisionFloors,
): void {
  const previous = held_floors.get(account_id);

  held_floors.set(account_id, floors);
  if (previous && same_synced_floors(previous, floors)) return;
  try {
    window.localStorage.setItem(
      FLOOR_STORAGE_PREFIX + account_id,
      JSON.stringify(floors),
    );
  } catch {
    return;
  }
}

export function hold_calendar_floors<T extends CalendarFloorFields>(
  preferences: T,
  account_id: string | null | undefined,
): T {
  if (!account_id) return preferences;

  const floors = merge_synced_floors(
    load_held_floors(account_id),
    preferences.calendar_revision_floors,
  );

  store_held_floors(account_id, floors);

  if (preferences.calendar_v3_only === true) store_v3_floor(account_id);

  const v3_only =
    preferences.calendar_v3_only === true || stored_v3_floor(account_id);

  if (
    v3_only === preferences.calendar_v3_only &&
    same_synced_floors(floors, preferences.calendar_revision_floors)
  ) {
    return preferences;
  }

  return {
    ...preferences,
    calendar_v3_only: v3_only,
    calendar_revision_floors: floors,
  };
}

export function release_held_calendar_floors(account_id: string): void {
  held_floors.delete(account_id);
  try {
    window.localStorage.removeItem(FLOOR_STORAGE_PREFIX + account_id);
  } catch {
    return;
  }
}
