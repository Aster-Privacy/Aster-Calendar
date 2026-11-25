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
export type RevisionKind = "event" | "calendar";

export interface RevisionSnapshot {
  event_revisions: Record<string, number>;
  calendar_revisions: Record<string, number>;
  event_confirmed?: Record<string, number>;
  calendar_confirmed?: Record<string, number>;
  event_pending?: Record<string, number>;
  calendar_pending?: Record<string, number>;
  event_tombstones?: Record<string, number>;
  calendar_tombstones?: Record<string, number>;
  event_observed_tombstones?: Record<string, number>;
  calendar_observed_tombstones?: Record<string, number>;
}

const revisions: Record<RevisionKind, Map<string, number>> = {
  event: new Map(),
  calendar: new Map(),
};

const confirmed: Record<RevisionKind, Map<string, number>> = {
  event: new Map(),
  calendar: new Map(),
};

const pending: Record<RevisionKind, Map<string, number>> = {
  event: new Map(),
  calendar: new Map(),
};

const tombstones: Record<RevisionKind, Map<string, number>> = {
  event: new Map(),
  calendar: new Map(),
};

const own_tombstones: Record<RevisionKind, Map<string, number>> = {
  event: new Map(),
  calendar: new Map(),
};

const MAX_TOMBSTONES = 5000;
const MAX_OWN_TOMBSTONES = 5000;

let is_dirty = false;

export function read_revision(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

export function known_revision(kind: RevisionKind, id: string): number {
  return revisions[kind].get(id) ?? 0;
}

export function confirmed_revision(kind: RevisionKind, id: string): number {
  return confirmed[kind].get(id) ?? 0;
}

export function observe_revision(
  kind: RevisionKind,
  id: string,
  revision: number,
): void {
  if (!id || revision <= 0) return;
  if (
    revision > (pending[kind].get(id) ?? 0) &&
    revision > (confirmed[kind].get(id) ?? 0)
  ) {
    confirmed[kind].set(id, revision);
    is_dirty = true;
  }
  clear_tombstone_below(kind, id, revision);
  if (revision <= known_revision(kind, id)) return;
  revisions[kind].set(id, revision);
  is_dirty = true;
}

export function accept_revision(
  kind: RevisionKind,
  id: string,
  revision: number,
): void {
  if (!id || revision <= 0 || revision === known_revision(kind, id)) return;
  if (revision < (confirmed[kind].get(id) ?? 0)) return;
  if (drop_tombstone(kind, id)) is_dirty = true;
  revisions[kind].set(id, revision);
  confirmed[kind].set(id, revision);
  is_dirty = true;
}

export function next_revision(kind: RevisionKind, id: string): number {
  const revision = Math.max(Date.now(), known_revision(kind, id) + 1);

  if (id) {
    revisions[kind].set(id, revision);
    pending[kind].set(id, Math.max(revision, pending[kind].get(id) ?? 0));
    is_dirty = true;
  }

  return revision;
}

export function settle_revision(kind: RevisionKind, id: string): void {
  if (!pending[kind].delete(id)) return;
  is_dirty = true;
}

export function release_revision(kind: RevisionKind, id: string): void {
  if (drop_tombstone(kind, id)) is_dirty = true;
  if (!pending[kind].delete(id)) return;
  const floor = confirmed[kind].get(id) ?? 0;

  if (floor > 0) revisions[kind].set(id, floor);
  else revisions[kind].delete(id);
  is_dirty = true;
}

export function is_rolled_back(
  kind: RevisionKind,
  id: string,
  revision: number,
): boolean {
  if (revision < known_revision(kind, id)) return true;
  const tombstone = tombstone_revision(kind, id);

  return tombstone !== undefined && revision <= tombstone;
}

function tombstone_revision(
  kind: RevisionKind,
  id: string,
): number | undefined {
  const own = own_tombstones[kind].get(id);
  const observed = tombstones[kind].get(id);

  if (own === undefined) return observed;
  if (observed === undefined) return own;

  return Math.max(own, observed);
}

function drop_tombstone(kind: RevisionKind, id: string): boolean {
  const dropped_own = own_tombstones[kind].delete(id);
  const dropped_observed = tombstones[kind].delete(id);

  return dropped_own || dropped_observed;
}

export function is_tombstoned(kind: RevisionKind, id: string): boolean {
  return own_tombstones[kind].has(id) || tombstones[kind].has(id);
}

export function record_tombstone(kind: RevisionKind, id: string): void {
  if (!id) return;
  const revision = Math.max(
    known_revision(kind, id),
    confirmed_revision(kind, id),
    tombstone_revision(kind, id) ?? 0,
  );

  if (own_tombstones[kind].get(id) === revision) return;
  set_own_tombstone(own_tombstones[kind], id, revision);
  is_dirty = true;
}

export function note_server_delete(kind: RevisionKind, id: string): void {
  if (!id) return;
  const revision = Math.max(
    known_revision(kind, id),
    confirmed_revision(kind, id),
  );

  if (revision <= 0 || (tombstone_revision(kind, id) ?? 0) >= revision) {
    return;
  }
  set_tombstone(tombstones[kind], id, revision);
  is_dirty = true;
}

export function lift_tombstone(kind: RevisionKind, id: string): void {
  if (drop_tombstone(kind, id)) is_dirty = true;
}

function set_own_tombstone(
  target: Map<string, number>,
  id: string,
  revision: number,
): void {
  target.set(id, revision);
  if (target.size <= MAX_OWN_TOMBSTONES) return;

  let oldest_id: string | null = null;
  let oldest_revision = Infinity;

  for (const [key, value] of target) {
    if (value < oldest_revision) {
      oldest_id = key;
      oldest_revision = value;
    }
  }
  if (oldest_id !== null) target.delete(oldest_id);
}

function set_tombstone(
  target: Map<string, number>,
  id: string,
  revision: number,
): void {
  target.delete(id);
  target.set(id, revision);
  while (target.size > MAX_TOMBSTONES) {
    const oldest = target.keys().next().value;

    if (oldest === undefined) return;
    target.delete(oldest);
  }
}

function clear_tombstone_below(
  kind: RevisionKind,
  id: string,
  revision: number,
): void {
  for (const target of [own_tombstones[kind], tombstones[kind]]) {
    const tombstone = target.get(id);

    if (tombstone === undefined || revision <= tombstone) continue;
    target.delete(id);
    is_dirty = true;
  }
}

function load_tombstones(
  target: Map<string, number>,
  source: Record<string, number> | undefined,
): void {
  if (!source || typeof source !== "object") return;
  for (const [id, value] of Object.entries(source)) {
    if (!id) continue;
    set_tombstone(
      target,
      id,
      Math.max(read_revision(value), target.get(id) ?? 0),
    );
  }
}

function load_own_tombstones(
  target: Map<string, number>,
  source: Record<string, number> | undefined,
): void {
  if (!source || typeof source !== "object") return;
  for (const [id, value] of Object.entries(source)) {
    if (!id) continue;
    set_own_tombstone(
      target,
      id,
      Math.max(read_revision(value), target.get(id) ?? 0),
    );
  }
}

function load_legacy_tombstones(
  kind: RevisionKind,
  source: Record<string, number> | undefined,
): void {
  if (!source || typeof source !== "object") return;
  const own: Record<string, number> = {};
  const observed: Record<string, number> = {};

  for (const [id, value] of Object.entries(source)) {
    if (read_revision(value) > 0) own[id] = value;
    else observed[id] = value;
  }
  load_tombstones(tombstones[kind], observed);
  load_own_tombstones(own_tombstones[kind], own);
}

function load_tombstone_pair(
  kind: RevisionKind,
  own: Record<string, number> | undefined,
  observed: Record<string, number> | undefined,
): void {
  if (observed && typeof observed === "object") {
    load_own_tombstones(own_tombstones[kind], own);
    load_tombstones(tombstones[kind], observed);
  } else {
    load_legacy_tombstones(kind, own);
  }
}

function load_map(
  target: Map<string, number>,
  source: Record<string, number> | undefined,
): void {
  if (!source || typeof source !== "object") return;
  for (const [id, value] of Object.entries(source)) {
    const revision = read_revision(value);

    if (revision > (target.get(id) ?? 0)) target.set(id, revision);
  }
}

export function load_revisions(snapshot: Partial<RevisionSnapshot>): void {
  load_map(revisions.event, snapshot.event_revisions);
  load_map(revisions.calendar, snapshot.calendar_revisions);
  load_map(confirmed.event, snapshot.event_confirmed);
  load_map(confirmed.calendar, snapshot.calendar_confirmed);
  load_map(pending.event, snapshot.event_pending);
  load_map(pending.calendar, snapshot.calendar_pending);
  load_tombstone_pair(
    "event",
    snapshot.event_tombstones,
    snapshot.event_observed_tombstones,
  );
  load_tombstone_pair(
    "calendar",
    snapshot.calendar_tombstones,
    snapshot.calendar_observed_tombstones,
  );
}

export function reset_revisions(): void {
  revisions.event.clear();
  revisions.calendar.clear();
  confirmed.event.clear();
  confirmed.calendar.clear();
  pending.event.clear();
  pending.calendar.clear();
  tombstones.event.clear();
  tombstones.calendar.clear();
  own_tombstones.event.clear();
  own_tombstones.calendar.clear();
  is_dirty = false;
}

export function take_revision_snapshot(): RevisionSnapshot | null {
  if (!is_dirty) return null;
  is_dirty = false;

  return {
    event_revisions: Object.fromEntries(revisions.event),
    calendar_revisions: Object.fromEntries(revisions.calendar),
    event_confirmed: Object.fromEntries(confirmed.event),
    calendar_confirmed: Object.fromEntries(confirmed.calendar),
    event_pending: Object.fromEntries(pending.event),
    calendar_pending: Object.fromEntries(pending.calendar),
    event_tombstones: Object.fromEntries(own_tombstones.event),
    calendar_tombstones: Object.fromEntries(own_tombstones.calendar),
    event_observed_tombstones: Object.fromEntries(tombstones.event),
    calendar_observed_tombstones: Object.fromEntries(tombstones.calendar),
  };
}

export interface RevisionFloors {
  event: Record<string, number>;
  calendar: Record<string, number>;
}

export function take_revision_floors(): RevisionFloors {
  return {
    event: Object.fromEntries(confirmed.event),
    calendar: Object.fromEntries(confirmed.calendar),
  };
}

export function apply_revision_floors(
  floors: Partial<RevisionFloors> | null | undefined,
): void {
  if (!floors || typeof floors !== "object") return;
  load_map(confirmed.event, floors.event);
  load_map(revisions.event, floors.event);
  load_map(confirmed.calendar, floors.calendar);
  load_map(revisions.calendar, floors.calendar);
}

function positive_entries(
  source: Map<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const [id, revision] of source) {
    if (revision > 0) result[id] = revision;
  }

  return result;
}

export function take_own_tombstones(): RevisionFloors {
  return {
    event: positive_entries(own_tombstones.event),
    calendar: positive_entries(own_tombstones.calendar),
  };
}

export function apply_synced_tombstones(
  synced: Partial<RevisionFloors> | null | undefined,
): boolean {
  if (!synced || typeof synced !== "object") return false;
  let is_changed = false;

  for (const kind of ["event", "calendar"] as const) {
    const source = synced[kind];

    if (!source || typeof source !== "object") continue;
    for (const [id, value] of Object.entries(source)) {
      const revision = read_revision(value);

      if (!id || revision <= 0) continue;
      if (confirmed_revision(kind, id) > revision) continue;
      if ((own_tombstones[kind].get(id) ?? 0) >= revision) continue;
      set_own_tombstone(own_tombstones[kind], id, revision);
      is_changed = true;
    }
  }
  if (is_changed) is_dirty = true;

  return is_changed;
}
