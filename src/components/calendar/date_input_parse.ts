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
import { parse_quick_input } from "@/components/calendar/quick_parse";

export interface DateInputParseOptions {
  reference: Date;
  language?: string;
}

function start_of_day(date: Date): Date {
  const copy = new Date(date);

  copy.setHours(0, 0, 0, 0);

  return copy;
}

function add_days(date: Date, days: number): Date {
  const copy = new Date(date);

  copy.setDate(copy.getDate() + days);

  return copy;
}

function valid_date(year: number, month: number, day: number): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) {
    return null;
  }

  const candidate = new Date(year, month, day);

  return candidate.getMonth() === month ? candidate : null;
}

function month_names(language: string): string[] {
  const names: string[] = [];

  for (const style of ["long", "short"] as const) {
    for (const locale of [language, "en"]) {
      const formatter = new Intl.DateTimeFormat(locale, { month: style });

      for (let month = 0; month < 12; month += 1) {
        names.push(
          formatter
            .format(new Date(2026, month, 1))
            .toLowerCase()
            .replace(/\.$/, ""),
        );
      }
    }
  }

  return names;
}

function month_index(names: string[], token: string): number {
  const needle = token.toLowerCase().replace(/\.$/, "");
  const exact = names.findIndex((name) => name === needle);

  if (exact >= 0) {
    return exact % 12;
  }

  if (needle.length < 3) {
    return -1;
  }

  const prefix = names.findIndex((name) => name.startsWith(needle));

  return prefix >= 0 ? prefix % 12 : -1;
}

export function parse_date_input(
  input: string,
  { reference, language = "en" }: DateInputParseOptions,
): Date | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ");

  if (!text) {
    return null;
  }

  const reference_day = start_of_day(reference);

  if (text === "yesterday") {
    return add_days(reference_day, -1);
  }

  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);

  if (iso) {
    return valid_date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const relative = /^([+-])\s?(\d{1,3})$/.exec(text);

  if (relative) {
    const offset = Number(relative[2]) * (relative[1] === "-" ? -1 : 1);

    return add_days(reference_day, offset);
  }

  const names = month_names(language);
  const month_day_year =
    /^([\p{L}.]+) (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/u.exec(text);

  if (month_day_year) {
    const month = month_index(names, month_day_year[1]);

    return month < 0
      ? null
      : valid_date(Number(month_day_year[3]), month, Number(month_day_year[2]));
  }

  const day_month_year =
    /^(\d{1,2})(?:st|nd|rd|th)? ([\p{L}.]+),? (\d{4})$/u.exec(text);

  if (day_month_year) {
    const month = month_index(names, day_month_year[2]);

    return month < 0
      ? null
      : valid_date(Number(day_month_year[3]), month, Number(day_month_year[1]));
  }

  const month_only = /^([\p{L}.]+) (\d{4})$/u.exec(text);

  if (month_only) {
    const month = month_index(names, month_only[1]);

    return month < 0 ? null : valid_date(Number(month_only[2]), month, 1);
  }

  const parsed = parse_quick_input(text, {
    reference: reference_day,
    language,
  });

  if (parsed.date) {
    return start_of_day(parsed.date);
  }

  const bare_month = month_index(names, text);

  if (bare_month >= 0) {
    const candidate = new Date(reference_day.getFullYear(), bare_month, 1);

    return candidate <
      start_of_day(
        new Date(reference_day.getFullYear(), reference_day.getMonth(), 1),
      )
      ? new Date(reference_day.getFullYear() + 1, bare_month, 1)
      : candidate;
  }

  return null;
}
