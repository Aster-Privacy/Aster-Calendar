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
import type {
  CalendarEventDraft,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { event_to_draft } from "@/services/calendar/calendar_codec";

export const TRASH_RETENTION_DAYS = 30;

export interface CalendarTrashEntry {
  id: string;
  draft: CalendarEventDraft;
  deleted_at: string;
}

function is_expired(deleted_at: string, now: number): boolean {
  const cutoff = now - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const deleted = new Date(deleted_at).getTime();

  return Number.isNaN(deleted) || deleted <= cutoff;
}

export function prune_trash(
  entries: CalendarTrashEntry[],
  now: number = Date.now(),
): CalendarTrashEntry[] {
  return entries.filter((entry) => !is_expired(entry.deleted_at, now));
}

export function trash_entries_from_events(
  events: DecryptedCalendarEvent[],
  now: number = Date.now(),
): CalendarTrashEntry[] {
  return prune_trash(
    events
      .filter((event) => Boolean(event.trashed_at))
      .map((event) => ({
        id: event.id,
        draft: event_to_draft(event),
        deleted_at: String(event.trashed_at),
      }))
      .sort((a, b) => b.deleted_at.localeCompare(a.deleted_at)),
    now,
  );
}

export function expired_trash_ids(
  events: DecryptedCalendarEvent[],
  now: number = Date.now(),
): string[] {
  return events
    .filter((event) => event.trashed_at && is_expired(event.trashed_at, now))
    .map((event) => event.id);
}

export function read_legacy_trash(value: unknown): CalendarTrashEntry[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (entry): entry is CalendarTrashEntry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as CalendarTrashEntry).id === "string" &&
      typeof (entry as CalendarTrashEntry).deleted_at === "string" &&
      typeof (entry as CalendarTrashEntry).draft === "object" &&
      (entry as CalendarTrashEntry).draft !== null &&
      typeof (entry as CalendarTrashEntry).draft.calendar_id === "string",
  );
}

export function legacy_entries_to_migrate(
  entries: CalendarTrashEntry[],
  existing: DecryptedCalendarEvent[],
  now: number = Date.now(),
): CalendarTrashEntry[] {
  const seen = new Set(
    existing
      .filter((event) => event.trashed_at)
      .map((event) => `${event.title}\n${event.starts_at}\n${event.trashed_at}`),
  );

  return prune_trash(entries, now).filter(
    (entry) =>
      !seen.has(`${entry.draft.title}\n${entry.draft.starts_at}\n${entry.deleted_at}`),
  );
}
