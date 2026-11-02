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
export const UNDO_WINDOW_MS = 30000;

interface UndoEntry {
  run: () => Promise<void>;
  expires_at: number;
}

let pending: UndoEntry | null = null;

export function register_undo(
  run: () => Promise<void>,
  now: number = Date.now(),
): void {
  pending = { expires_at: now + UNDO_WINDOW_MS, run };
}

export function take_undo(
  now: number = Date.now(),
): (() => Promise<void>) | null {
  if (pending === null) {
    return null;
  }

  const entry = pending;

  pending = null;

  if (entry.expires_at <= now) {
    return null;
  }

  return entry.run;
}

export function clear_undo(): void {
  pending = null;
}

export function has_undo(now: number = Date.now()): boolean {
  return pending !== null && pending.expires_at > now;
}
