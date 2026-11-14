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

const MAX_TOMBSTONES = 5000;

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
  if (tombstones[kind].delete(id)) is_dirty = true;
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
  if (tombstones[kind].delete(id)) is_dirty = true;
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
  const tombstone = tombstones[kind].get(id);

  return tombstone !== undefined && revision <= tombstone;
}

export function is_tombstoned(kind: RevisionKind, id: string): boolean {
  return tombstones[kind].has(id);
}

export function record_tombstone(kind: RevisionKind, id: string): void {
  if (!id) return;
  const revision = Math.max(
    known_revision(kind, id),
    confirmed_revision(kind, id),
    tombstones[kind].get(id) ?? 0,
  );

  if (tombstones[kind].get(id) === revision) return;
  set_tombstone(tombstones[kind], id, revision);
  is_dirty = true;
}

export function lift_tombstone(kind: RevisionKind, id: string): void {
  if (tombstones[kind].delete(id)) is_dirty = true;
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
  const tombstone = tombstones[kind].get(id);

  if (tombstone === undefined || revision <= tombstone) return;
  tombstones[kind].delete(id);
  is_dirty = true;
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
  load_tombstones(tombstones.event, snapshot.event_tombstones);
  load_tombstones(tombstones.calendar, snapshot.calendar_tombstones);
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
    event_tombstones: Object.fromEntries(tombstones.event),
    calendar_tombstones: Object.fromEntries(tombstones.calendar),
  };
}
