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
import { is_contact_trashed } from "@/lib/contact_trash";
import { parse_contact_date } from "@/utils/date_utils";

export const BIRTHDAY_EVENT_PREFIX = "birthday-";
export const BIRTHDAY_CALENDAR_ID = "__birthdays__";
export const BIRTHDAY_COLOR = "#d81b60";

export type BirthdayKind = "birthday" | "anniversary";

export interface BirthdaySource {
  id: string;
  name: string;
  birthday: string;
  kind?: BirthdayKind;
}

export interface BirthdayOccurrence {
  contact_id: string;
  name: string;
  date: Date;
  kind: BirthdayKind;
}

function parse_birthday(value: string): { month: number; day: number } | null {
  const parts = parse_contact_date(value);

  return parts ? { day: parts.day, month: parts.month - 1 } : null;
}

export interface BirthdayContact {
  id: string;
  first_name?: string;
  last_name?: string;
  birthday?: string;
  date_entries?: { value: string; type: string }[];
  deleted_at?: string;
}

export function contact_birthday_sources(
  contact: BirthdayContact,
): BirthdaySource[] {
  const name = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim();

  if (name.length === 0) {
    return [];
  }

  const sources: BirthdaySource[] = [];

  if (contact.birthday && parse_birthday(contact.birthday)) {
    sources.push({ birthday: contact.birthday, id: contact.id, name });
  }

  const anniversaries = (contact.date_entries ?? []).filter(
    (entry) =>
      entry.type === "anniversary" &&
      typeof entry.value === "string" &&
      parse_birthday(entry.value) !== null,
  );

  anniversaries.forEach((entry, index) => {
    sources.push({
      birthday: entry.value,
      id: `${contact.id}-anniversary${index > 0 ? `-${index + 1}` : ""}`,
      kind: "anniversary",
      name,
    });
  });

  return sources;
}

export function birthday_sources_from_contacts(
  contacts: BirthdayContact[],
): BirthdaySource[] {
  return contacts
    .filter((contact) => !is_contact_trashed(contact))
    .flatMap((contact) => contact_birthday_sources(contact));
}

export function birthdays_in_range(
  sources: BirthdaySource[],
  start: Date,
  end: Date,
): BirthdayOccurrence[] {
  const result: BirthdayOccurrence[] = [];

  for (const source of sources) {
    if (source.birthday.length === 0 || source.name.length === 0) {
      continue;
    }

    const parsed = parse_birthday(source.birthday);

    if (!parsed) {
      continue;
    }

    for (
      let year = start.getFullYear();
      year <= end.getFullYear();
      year += 1
    ) {
      const is_leap_day = parsed.month === 1 && parsed.day === 29;
      const occurrence = is_leap_day
        ? new Date(year, 1, new Date(year, 1, 29).getMonth() === 1 ? 29 : 28)
        : new Date(year, parsed.month, parsed.day);

      if (occurrence >= start && occurrence <= end) {
        result.push({
          contact_id: source.id,
          date: occurrence,
          kind: source.kind ?? "birthday",
          name: source.name,
        });
      }
    }
  }

  return result.sort(
    (first, second) => first.date.getTime() - second.date.getTime(),
  );
}

export function is_birthday_kind(event: { event_kind: string }): boolean {
  return event.event_kind === "birthday";
}

export function is_event_shown(
  event: { event_kind: string; calendar_id: string },
  visible_calendar_ids: ReadonlySet<string>,
  show_birthdays: boolean | null,
): boolean {
  return is_birthday_kind(event) && show_birthdays !== null
    ? show_birthdays
    : visible_calendar_ids.has(event.calendar_id);
}

export function is_birthday_event(event: { id: string }): boolean {
  return event.id.startsWith(BIRTHDAY_EVENT_PREFIX);
}
