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
export const BIRTHDAY_EVENT_PREFIX = "birthday-";
export const BIRTHDAY_CALENDAR_ID = "__birthdays__";
export const BIRTHDAY_COLOR = "#d81b60";

export interface BirthdaySource {
  id: string;
  name: string;
  birthday: string;
}

export interface BirthdayOccurrence {
  contact_id: string;
  name: string;
  date: Date;
}

function parse_birthday(value: string): { month: number; day: number } | null {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

  if (full) {
    return { day: Number(full[3]), month: Number(full[2]) - 1 };
  }

  const monthless = /^--?(\d{2})-(\d{2})$/.exec(value.trim());

  if (monthless) {
    return { day: Number(monthless[2]), month: Number(monthless[1]) - 1 };
  }

  return null;
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
          name: source.name,
        });
      }
    }
  }

  return result.sort(
    (first, second) => first.date.getTime() - second.date.getTime(),
  );
}

export function is_birthday_event(event: { id: string }): boolean {
  return event.id.startsWith(BIRTHDAY_EVENT_PREFIX);
}
