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
import type { RevisionFloors } from "@/services/calendar/revision_ledger";

import {
  apply_revision_floors,
  read_revision,
  take_revision_floors,
} from "@/services/calendar/revision_ledger";
import { is_temp_event_id } from "@/services/calendar/temp_id";

export const MAX_SYNCED_FLOORS = 3_000;

export type SyncedRevisionFloors = RevisionFloors;

function read_floor_map(source: unknown): Record<string, number> {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {};
  }

  const result: Record<string, number> = {};

  for (const [id, value] of Object.entries(
    source as Record<string, unknown>,
  )) {
    const revision = read_revision(value);

    if (id && !is_temp_event_id(id) && revision > 0) result[id] = revision;
  }

  return result;
}

export function read_synced_floors(source: unknown): SyncedRevisionFloors {
  const record =
    source && typeof source === "object"
      ? (source as Record<string, unknown>)
      : {};

  return {
    event: read_floor_map(record.event),
    calendar: read_floor_map(record.calendar),
  };
}

function cap_floor_map(
  map: Record<string, number>,
  limit: number,
): Record<string, number> {
  const entries = Object.entries(map);

  if (entries.length <= limit) return map;

  return Object.fromEntries(
    entries.sort((a, b) => b[1] - a[1]).slice(0, limit),
  );
}

function merge_floor_map(
  left: Record<string, number>,
  right: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...left };

  for (const [id, revision] of Object.entries(right)) {
    if (revision > (merged[id] ?? 0)) merged[id] = revision;
  }

  return cap_floor_map(merged, MAX_SYNCED_FLOORS);
}

export function merge_synced_floors(
  left: unknown,
  right: unknown,
): SyncedRevisionFloors {
  const a = read_synced_floors(left);
  const b = read_synced_floors(right);

  return {
    event: merge_floor_map(a.event, b.event),
    calendar: merge_floor_map(a.calendar, b.calendar),
  };
}

function same_floor_map(
  left: Record<string, number>,
  right: Record<string, number>,
): boolean {
  const keys = Object.keys(left);

  if (keys.length !== Object.keys(right).length) return false;

  return keys.every((id) => left[id] === right[id]);
}

export function same_synced_floors(left: unknown, right: unknown): boolean {
  const a = read_synced_floors(left);
  const b = read_synced_floors(right);

  return (
    same_floor_map(a.event, b.event) && same_floor_map(a.calendar, b.calendar)
  );
}

export function inherit_synced_floors(stored: unknown): void {
  apply_revision_floors(read_synced_floors(stored));
}

export function floors_to_publish(
  stored: unknown,
): SyncedRevisionFloors | null {
  const merged = merge_synced_floors(stored, take_revision_floors());

  return same_synced_floors(merged, stored) ? null : merged;
}
