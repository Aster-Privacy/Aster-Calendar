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
import type { CalendarTrashEntry } from "@/services/calendar/trash";

import { TRASH_RETENTION_DAYS } from "@/services/calendar/trash";

export type TrashSortKey = "deleted" | "event_date" | "title";

export const TRASH_SORT_KEYS: TrashSortKey[] = [
  "deleted",
  "event_date",
  "title",
];

export const TRASH_ALL_CALENDARS = "all";

const MS_PER_DAY = 86_400_000;

export interface TrashFilter {
  query: string;
  calendar_id: string;
}

export interface TrashGroup {
  key: string;
  entries: CalendarTrashEntry[];
}

export type TrashSectionKind = "today" | "yesterday" | "day" | "month" | "all";

export interface TrashSection {
  key: string;
  kind: TrashSectionKind;
  date: Date | null;
  groups: TrashGroup[];
}

export function normalize_trash_text(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function time_of(value: string): number {
  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
}

export function filter_trash_entries(
  entries: CalendarTrashEntry[],
  filter: TrashFilter,
  calendar_name: (calendar_id: string) => string,
): CalendarTrashEntry[] {
  const tokens = normalize_trash_text(filter.query).split(" ").filter(Boolean);
  const scoped =
    filter.calendar_id === TRASH_ALL_CALENDARS
      ? entries
      : entries.filter(
          (entry) => entry.draft.calendar_id === filter.calendar_id,
        );

  if (tokens.length === 0) {
    return scoped;
  }

  return scoped.filter((entry) => {
    const haystack = normalize_trash_text(
      [
        entry.draft.title,
        entry.draft.location,
        calendar_name(entry.draft.calendar_id),
      ].join("\n"),
    );

    return tokens.every((token) => haystack.includes(token));
  });
}

export function compare_trash_entries(
  sort: TrashSortKey,
  collator: Intl.Collator,
): (left: CalendarTrashEntry, right: CalendarTrashEntry) => number {
  const by_deleted = (left: CalendarTrashEntry, right: CalendarTrashEntry) =>
    time_of(right.deleted_at) - time_of(left.deleted_at);
  const by_event = (left: CalendarTrashEntry, right: CalendarTrashEntry) =>
    time_of(right.draft.starts_at) - time_of(left.draft.starts_at);
  const by_title = (left: CalendarTrashEntry, right: CalendarTrashEntry) =>
    collator.compare(left.draft.title.trim(), right.draft.title.trim());

  const chain =
    sort === "title"
      ? [by_title, by_event, by_deleted]
      : sort === "event_date"
        ? [by_event, by_title, by_deleted]
        : [by_deleted, by_event, by_title];

  return (left, right) => {
    for (const compare of chain) {
      const result = compare(left, right);

      if (result !== 0) {
        return result;
      }
    }

    return left.id.localeCompare(right.id);
  };
}

export function sort_trash_entries(
  entries: CalendarTrashEntry[],
  sort: TrashSortKey,
  collator: Intl.Collator,
): CalendarTrashEntry[] {
  return [...entries].sort(compare_trash_entries(sort, collator));
}

export function trash_group_key(entry: CalendarTrashEntry): string {
  return `${entry.draft.calendar_id}\n${normalize_trash_text(entry.draft.title)}`;
}

export function group_trash_entries(
  sorted_entries: CalendarTrashEntry[],
): TrashGroup[] {
  const groups = new Map<string, TrashGroup>();

  for (const entry of sorted_entries) {
    const key = trash_group_key(entry);
    const existing = groups.get(key);

    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.set(key, { key, entries: [entry] });
    }
  }

  return [...groups.values()];
}

function start_of_local_day(time: number): Date {
  const day = new Date(time);

  day.setHours(0, 0, 0, 0);

  return day;
}

function section_for(
  entry: CalendarTrashEntry,
  sort: TrashSortKey,
  today: Date,
): Omit<TrashSection, "groups"> {
  if (sort === "title") {
    return { key: "all", kind: "all", date: null };
  }

  if (sort === "event_date") {
    const starts = new Date(time_of(entry.draft.starts_at));
    const month = new Date(starts.getFullYear(), starts.getMonth(), 1);

    return {
      key: `month:${month.getFullYear()}-${month.getMonth()}`,
      kind: "month",
      date: month,
    };
  }

  const day = start_of_local_day(time_of(entry.deleted_at));
  const day_offset = Math.round(
    (start_of_local_day(today.getTime()).getTime() - day.getTime()) /
      MS_PER_DAY,
  );

  if (day_offset <= 0) {
    return { key: "today", kind: "today", date: day };
  }

  if (day_offset === 1) {
    return { key: "yesterday", kind: "yesterday", date: day };
  }

  return { key: `day:${day.getTime()}`, kind: "day", date: day };
}

export function build_trash_sections(
  entries: CalendarTrashEntry[],
  sort: TrashSortKey,
  collator: Intl.Collator,
  now: number = Date.now(),
): TrashSection[] {
  const today = new Date(now);
  const sections = new Map<string, TrashSection>();

  for (const group of group_trash_entries(
    sort_trash_entries(entries, sort, collator),
  )) {
    const lead = group.entries[0];
    const meta = section_for(lead, sort, today);
    const existing = sections.get(meta.key);

    if (existing) {
      existing.groups.push(group);
    } else {
      sections.set(meta.key, { ...meta, groups: [group] });
    }
  }

  return [...sections.values()];
}

export function trash_days_left(
  deleted_at: string,
  now: number = Date.now(),
): number {
  const deleted = new Date(deleted_at).getTime();

  if (Number.isNaN(deleted)) {
    return 0;
  }

  const remaining = deleted + TRASH_RETENTION_DAYS * MS_PER_DAY - now;

  return Math.max(0, Math.ceil(remaining / MS_PER_DAY));
}

export function group_days_left(
  group: TrashGroup,
  now: number = Date.now(),
): number {
  return Math.min(
    ...group.entries.map((entry) => trash_days_left(entry.deleted_at, now)),
  );
}

export const TRASH_EXPIRY_SOON_DAYS = 3;

export function trash_expires_soon(days_left: number): boolean {
  return days_left <= TRASH_EXPIRY_SOON_DAYS;
}

export function trash_group_is_series(group: TrashGroup): boolean {
  if (group.entries.length < 2) {
    return false;
  }

  if (
    group.entries.some(
      (entry) => entry.draft.recurrence || entry.draft.recurrence_id,
    )
  ) {
    return true;
  }

  const uid = group.entries[0].draft.uid;

  return (
    Boolean(uid) && group.entries.every((entry) => entry.draft.uid === uid)
  );
}

export interface TrashGroupSpan {
  first: Date | null;
  last: Date | null;
}

export function trash_group_span(group: TrashGroup): TrashGroupSpan {
  const times = group.entries
    .map((entry) => new Date(entry.draft.starts_at).getTime())
    .filter((time) => !Number.isNaN(time));

  if (times.length === 0) {
    return { first: null, last: null };
  }

  return {
    first: new Date(Math.min(...times)),
    last: new Date(Math.max(...times)),
  };
}

export function prune_trash_selection(
  selected: ReadonlySet<string>,
  visible_ids: ReadonlySet<string>,
): Set<string> {
  return new Set([...selected].filter((id) => visible_ids.has(id)));
}
