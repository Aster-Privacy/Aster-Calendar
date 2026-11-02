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
import type { DecryptedCalendarEvent } from "@/types/calendar";

export interface ParsedSearchQuery {
  terms: string[];
  excluded: string[];
  guests: string[];
  requires_guests: boolean;
  locations: string[];
  requires_location: boolean;
  calendars: string[];
  after: number | null;
  before: number | null;
  only_recurring: boolean;
  only_all_day: boolean;
  is_empty: boolean;
}

const EMPTY: ParsedSearchQuery = {
  after: null,
  before: null,
  calendars: [],
  excluded: [],
  guests: [],
  is_empty: true,
  locations: [],
  only_all_day: false,
  only_recurring: false,
  requires_guests: false,
  requires_location: false,
  terms: [],
};

function split_tokens(raw: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of raw) {
    if (char === '"') {
      quoted = !quoted;

      continue;
    }

    if (char === " " && !quoted) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }

      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function parse_date(value: string): number | null {
  const parsed = Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value,
  );

  return Number.isNaN(parsed) ? null : parsed;
}

export function parse_search_query(raw: string): ParsedSearchQuery {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return EMPTY;
  }

  const parsed: ParsedSearchQuery = {
    ...EMPTY,
    calendars: [],
    excluded: [],
    guests: [],
    locations: [],
    terms: [],
  };

  for (const token of split_tokens(trimmed)) {
    const lower = token.toLowerCase();

    if (lower.startsWith("guests:")) {
      const value = token.slice(7).trim().toLowerCase();

      parsed.requires_guests = true;

      if (value.length > 0) {
        parsed.guests.push(value);
      }

      continue;
    }

    if (lower.startsWith("location:")) {
      const value = token.slice(9).trim().toLowerCase();

      parsed.requires_location = true;

      if (value.length > 0) {
        parsed.locations.push(value);
      }

      continue;
    }

    if (lower.startsWith("calendar:")) {
      const value = token.slice(9).trim().toLowerCase();

      if (value.length > 0) {
        parsed.calendars.push(value);
      }

      continue;
    }

    if (lower.startsWith("after:")) {
      parsed.after = parse_date(token.slice(6).trim());

      continue;
    }

    if (lower.startsWith("before:")) {
      parsed.before = parse_date(token.slice(7).trim());

      continue;
    }

    if (lower === "is:recurring") {
      parsed.only_recurring = true;

      continue;
    }

    if (lower === "is:allday" || lower === "is:all-day") {
      parsed.only_all_day = true;

      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      parsed.excluded.push(token.slice(1).toLowerCase());

      continue;
    }

    parsed.terms.push(lower);
  }

  parsed.is_empty =
    parsed.terms.length === 0 &&
    parsed.excluded.length === 0 &&
    parsed.calendars.length === 0 &&
    parsed.guests.length === 0 &&
    parsed.locations.length === 0 &&
    parsed.after === null &&
    parsed.before === null &&
    !parsed.requires_guests &&
    !parsed.requires_location &&
    !parsed.only_recurring &&
    !parsed.only_all_day;

  return parsed;
}

export interface SearchIndexEntry {
  event: DecryptedCalendarEvent;
  key: string;
  haystack: string;
  guests: string;
  location: string;
  calendar_name: string;
  starts_at: number;
  ends_at: number;
}

export interface HighlightSegment {
  text: string;
  is_match: boolean;
}

export interface SearchResultGroup {
  key: string;
  date: Date;
  is_past: boolean;
  events: DecryptedCalendarEvent[];
}

export function event_result_key(event: DecryptedCalendarEvent): string {
  return `${event.id}|${event.starts_at}`;
}

export function build_search_entry(
  event: DecryptedCalendarEvent,
  calendar_name: string,
): SearchIndexEntry {
  return {
    calendar_name: calendar_name.toLowerCase(),
    ends_at: Date.parse(event.ends_at),
    event,
    guests: event.attendees
      .map((attendee) => `${attendee.email} ${attendee.display_name ?? ""}`)
      .join(" ")
      .toLowerCase(),
    haystack: [
      event.title,
      event.location,
      event.description,
      event.tags.join(" "),
      event.attendees.map((attendee) => attendee.email).join(" "),
    ]
      .join(" ")
      .toLowerCase(),
    key: event_result_key(event),
    location: event.location.toLowerCase(),
    starts_at: Date.parse(event.starts_at),
  };
}

export function build_search_index(
  events: DecryptedCalendarEvent[],
  calendar_name_for: (calendar_id: string) => string,
): SearchIndexEntry[] {
  const names = new Map<string, string>();

  return events.map((event) => {
    let name = names.get(event.calendar_id);

    if (name === undefined) {
      name = calendar_name_for(event.calendar_id);
      names.set(event.calendar_id, name);
    }

    return build_search_entry(event, name);
  });
}

export function match_indexed_event(
  entry: SearchIndexEntry,
  parsed: ParsedSearchQuery,
): boolean {
  if (parsed.is_empty) {
    return true;
  }

  const { event } = entry;

  if (parsed.requires_guests && event.attendees.length === 0) {
    return false;
  }

  if (parsed.requires_location && entry.location.trim().length === 0) {
    return false;
  }

  if (parsed.only_recurring && event.recurrence === null) {
    return false;
  }

  if (parsed.only_all_day && !event.is_all_day) {
    return false;
  }

  if (parsed.after !== null && entry.starts_at < parsed.after) {
    return false;
  }

  if (parsed.before !== null && entry.starts_at > parsed.before) {
    return false;
  }

  if (
    parsed.calendars.length > 0 &&
    !parsed.calendars.some((value) => entry.calendar_name.includes(value))
  ) {
    return false;
  }

  if (parsed.guests.some((value) => !entry.guests.includes(value))) {
    return false;
  }

  if (parsed.locations.some((value) => !entry.location.includes(value))) {
    return false;
  }

  if (parsed.excluded.some((value) => entry.haystack.includes(value))) {
    return false;
  }

  return parsed.terms.every((value) => entry.haystack.includes(value));
}

export function match_event(
  event: DecryptedCalendarEvent,
  parsed: ParsedSearchQuery,
  calendar_name: string,
): boolean {
  if (parsed.is_empty) {
    return true;
  }

  return match_indexed_event(build_search_entry(event, calendar_name), parsed);
}

export function highlight_terms(parsed: ParsedSearchQuery): string[] {
  return [...parsed.terms, ...parsed.locations, ...parsed.guests].filter(
    (term) => term.length > 0,
  );
}

export function highlight_segments(
  text: string,
  terms: string[],
): HighlightSegment[] {
  if (text.length === 0) {
    return [];
  }

  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];

  for (const term of terms) {
    if (term.length === 0) {
      continue;
    }

    let from = 0;

    while (from <= lower.length - term.length) {
      const found = lower.indexOf(term, from);

      if (found === -1) {
        break;
      }

      ranges.push([found, found + term.length]);
      from = found + term.length;
    }
  }

  if (ranges.length === 0) {
    return [{ is_match: false, text }];
  }

  ranges.sort((left, right) => left[0] - right[0] || right[1] - left[1]);

  const merged: Array<[number, number]> = [];

  for (const range of ranges) {
    const last = merged[merged.length - 1];

    if (last && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push([range[0], range[1]]);
    }
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const [start, end] of merged) {
    if (start > cursor) {
      segments.push({ is_match: false, text: text.slice(cursor, start) });
    }

    segments.push({ is_match: true, text: text.slice(start, end) });
    cursor = end;
  }

  if (cursor < text.length) {
    segments.push({ is_match: false, text: text.slice(cursor) });
  }

  return segments;
}

function day_key(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function group_search_results(
  events: DecryptedCalendarEvent[],
  now_ms: number,
  limit: number,
): SearchResultGroup[] {
  const upcoming: DecryptedCalendarEvent[] = [];
  const past: DecryptedCalendarEvent[] = [];

  for (const event of events) {
    if (Date.parse(event.ends_at) >= now_ms) {
      upcoming.push(event);
    } else {
      past.push(event);
    }
  }

  const by_start = (
    left: DecryptedCalendarEvent,
    right: DecryptedCalendarEvent,
  ) =>
    Date.parse(left.starts_at) - Date.parse(right.starts_at) ||
    left.title.localeCompare(right.title) ||
    event_result_key(left).localeCompare(event_result_key(right));

  upcoming.sort(by_start);
  past.sort((left, right) => by_start(right, left));

  const ordered = [...upcoming, ...past].slice(0, Math.max(0, limit));
  const groups: SearchResultGroup[] = [];
  const by_key = new Map<string, SearchResultGroup>();

  for (const event of ordered) {
    const starts = new Date(event.starts_at);
    const is_past = Date.parse(event.ends_at) < now_ms;
    const key = `${is_past ? "p" : "u"}:${day_key(starts)}`;
    let group = by_key.get(key);

    if (!group) {
      group = {
        date: new Date(
          starts.getFullYear(),
          starts.getMonth(),
          starts.getDate(),
        ),
        events: [],
        is_past,
        key,
      };
      by_key.set(key, group);
      groups.push(group);
    }

    group.events.push(event);
  }

  return groups;
}
