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
import { add_days, start_of_day } from "@/components/calendar/calendar_utils";

const MINUTES_PER_DAY = 1440;
const MINUTES_PER_HOUR = 60;
const EVENING_HOUR = 19;
const NOON_MINUTES = 12 * MINUTES_PER_HOUR;

export interface QuickParseOptions {
  reference: Date;
  language?: string;
  default_duration_minutes?: number;
}

export interface QuickParseResult {
  title: string;
  date: Date | null;
  start_minutes: number | null;
  end_minutes: number | null;
  is_all_day: boolean;
  has_match: boolean;
}

interface Span {
  start: number;
  end: number;
}

const name_cache = new Map<string, string[][]>();

export function build_names(
  language: string,
  kind: "weekday" | "month",
): string[][] {
  const cache_key = `${language}:${kind}`;
  const cached = name_cache.get(cache_key);

  if (cached) {
    return cached;
  }

  const built = build_names_uncached(language, kind);

  name_cache.set(cache_key, built);

  return built;
}

function build_names_uncached(
  language: string,
  kind: "weekday" | "month",
): string[][] {
  const languages = language && !language.startsWith("en") ? [language, "en"] : ["en"];
  const count = kind === "weekday" ? 7 : 12;
  const names: string[][] = Array.from({ length: count }, () => []);

  for (const tag of languages) {
    for (const style of ["long", "short"] as const) {
      let formatter: Intl.DateTimeFormat;

      try {
        formatter = new Intl.DateTimeFormat(
          tag,
          kind === "weekday" ? { weekday: style } : { month: style },
        );
      } catch {
        continue;
      }

      for (let index = 0; index < count; index += 1) {
        const sample =
          kind === "weekday"
            ? new Date(2024, 0, 7 + index)
            : new Date(2024, index, 15);
        const name = formatter.format(sample).toLowerCase().replace(/[.]/g, "");

        if (name && !names[index].includes(name)) {
          names[index].push(name);
        }
      }
    }
  }

  return names;
}

function name_pattern(names: string[][]): string {
  return names
    .flat()
    .sort((left, right) => right.length - left.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

function index_of_name(names: string[][], value: string): number {
  const needle = value.toLowerCase().replace(/[.]/g, "");

  return names.findIndex((entry) => entry.includes(needle));
}

function to_minutes(hour: number, minute: number, suffix?: string): number {
  let resolved = hour;

  if (suffix === "pm" && resolved < 12) {
    resolved += 12;
  }

  if (suffix === "am" && resolved === 12) {
    resolved = 0;
  }

  return resolved * MINUTES_PER_HOUR + minute;
}

function infer_bare_hour(hour: number, minute: number): number | null {
  if (hour > 23 || minute > 59) {
    return null;
  }

  if (hour >= 1 && hour <= 7) {
    return (hour + 12) * MINUTES_PER_HOUR + minute;
  }

  return hour * MINUTES_PER_HOUR + minute;
}

const TITLE_EDGE_CHARS = new Set([",", ";", ":", "-"]);

function is_title_edge(char: string): boolean {
  return TITLE_EDGE_CHARS.has(char) || char.trim().length === 0;
}

function trim_title_edges(value: string): string {
  let start = 0;
  let end = value.length;

  while (start < end && is_title_edge(value[start])) {
    start += 1;
  }

  while (end > start && is_title_edge(value[end - 1])) {
    end -= 1;
  }

  return value.slice(start, end);
}

function clean_title(input: string, spans: Span[]): string {
  const ordered = [...spans].sort((left, right) => left.start - right.start);
  let result = "";
  let cursor = 0;

  for (const span of ordered) {
    result += input.slice(cursor, span.start);
    result += " ";
    cursor = Math.max(cursor, span.end);
  }

  result += input.slice(cursor);

  return trim_title_edges(
    result.replace(/\s+/g, " ").replace(/\s+([,;:])/g, "$1"),
  )
    .replace(/\b(at|on|from|for|starting|every)$/i, "")
    .trim();
}

export function parse_quick_input(
  input: string,
  { reference, language = "en", default_duration_minutes = 60 }: QuickParseOptions,
): QuickParseResult {
  const spans: Span[] = [];
  const lower = input.toLowerCase();

  const overlaps = (start: number, end: number) =>
    spans.some((span) => start < span.end && end > span.start);

  const take = (
    pattern: RegExp,
    handler: (match: RegExpExecArray) => boolean,
  ): boolean => {
    const regex = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
    let match = regex.exec(lower);

    while (match) {
      if (!overlaps(match.index, match.index + match[0].length)) {
        if (handler(match)) {
          spans.push({ end: match.index + match[0].length, start: match.index });

          return true;
        }
      }

      match = regex.exec(lower);
    }

    return false;
  };

  const weekdays = build_names(language, "weekday");
  const months = build_names(language, "month");

  let date: Date | null = null;
  let start_minutes: number | null = null;
  let end_minutes: number | null = null;
  let duration_minutes: number | null = null;
  let is_all_day = false;
  const reference_day = start_of_day(reference);

  take(/\ball[\s-]?day\b/i, () => {
    is_all_day = true;

    return true;
  });

  take(
    /\bfor\s+(\d+(?:[.,]\d+)?)\s*(minutes|minute|mins|min|hours|hour|hrs|hr|h|m)\b/i,
    (match) => {
      const amount = Number(match[1].replace(",", "."));

      if (!Number.isFinite(amount) || amount <= 0) {
        return false;
      }

      const unit = match[2];

      const resolved = unit.startsWith("h")
        ? Math.round(amount * MINUTES_PER_HOUR)
        : Math.round(amount);

      duration_minutes = resolved;

      return resolved > 0;
    },
  );

  take(/\b(today|tonight|tomorrow)\b/i, (match) => {
    const word = match[1];

    date = word === "tomorrow" ? add_days(reference_day, 1) : reference_day;

    if (word === "tonight" && start_minutes === null) {
      start_minutes = EVENING_HOUR * MINUTES_PER_HOUR;
    }

    return true;
  });

  if (!date) {
    take(
      new RegExp(`\\b(?:(next|this)\\s+)?(${name_pattern(weekdays)})\\b`, "i"),
      (match) => {
        const target = index_of_name(weekdays, match[2]);

        if (target < 0) {
          return false;
        }

        const diff = (target - reference_day.getDay() + 7) % 7;

        date = add_days(
          reference_day,
          match[1] === "next" && diff === 0 ? 7 : diff,
        );

        return true;
      },
    );
  }

  if (!date) {
    take(
      new RegExp(
        `\\b(?:(${name_pattern(months)})\\s+(\\d{1,2})(?:st|nd|rd|th)?|(\\d{1,2})(?:st|nd|rd|th)?\\s+(${name_pattern(months)}))\\b`,
        "i",
      ),
      (match) => {
        const month_name = match[1] ?? match[4];
        const day_value = Number(match[2] ?? match[3]);
        const month = index_of_name(months, month_name);

        if (month < 0 || !day_value || day_value > 31) {
          return false;
        }

        const candidate = new Date(
          reference_day.getFullYear(),
          month,
          day_value,
        );

        if (candidate.getMonth() !== month) {
          return false;
        }

        date =
          candidate < reference_day
            ? new Date(reference_day.getFullYear() + 1, month, day_value)
            : candidate;

        return true;
      },
    );
  }

  if (!date) {
    take(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (match) => {
      const first = Number(match[1]);
      const second = Number(match[2]);
      const month_first = language.startsWith("en");
      const month = (month_first ? first : second) - 1;
      const day_value = month_first ? second : first;

      if (month < 0 || month > 11 || day_value < 1 || day_value > 31) {
        return false;
      }

      const year = match[3]
        ? Number(match[3].length === 2 ? `20${match[3]}` : match[3])
        : reference_day.getFullYear();
      const candidate = new Date(year, month, day_value);

      if (candidate.getMonth() !== month) {
        return false;
      }

      date =
        !match[3] && candidate < reference_day
          ? new Date(year + 1, month, day_value)
          : candidate;

      return true;
    });
  }

  const range_taken = take(
    /\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?(?:\s*(am|pm))?\s*(?:-|–|—|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
    (match) => {
      const has_meridiem = Boolean(match[3] ?? match[6]);
      const has_colon = Boolean(match[2] ?? match[5]);

      if (!has_meridiem && !has_colon) {
        return false;
      }

      const start_hour = Number(match[1]);
      const end_hour = Number(match[4]);

      if (start_hour > 23 || end_hour > 23) {
        return false;
      }

      const end_suffix = match[6];
      const start_suffix = match[3] ?? end_suffix;

      start_minutes = to_minutes(start_hour, Number(match[2] ?? 0), start_suffix);
      end_minutes = to_minutes(end_hour, Number(match[5] ?? 0), end_suffix);

      while (end_minutes <= start_minutes) {
        end_minutes += NOON_MINUTES;
      }

      return true;
    },
  );

  if (!range_taken) {
    const named = take(/\b(noon|midday|midnight)\b/i, (match) => {
      start_minutes = match[1] === "midnight" ? 0 : NOON_MINUTES;

      return true;
    });

    if (!named) {
      const explicit = take(
        /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
        (match) => {
          const hour = Number(match[1]);

          if (hour > 23) {
            return false;
          }

          start_minutes = to_minutes(hour, Number(match[2] ?? 0), match[3]);

          return true;
        },
      );

      if (!explicit) {
        const colon = take(/\b(?:at\s+)?(\d{1,2}):(\d{2})\b/, (match) => {
          const value = infer_bare_hour(Number(match[1]), Number(match[2]));

          if (value === null) {
            return false;
          }

          start_minutes = value;

          return true;
        });

        if (!colon) {
          take(/\bat\s+(\d{1,2})\b/i, (match) => {
            const value = infer_bare_hour(Number(match[1]), 0);

            if (value === null) {
              return false;
            }

            start_minutes = value;

            return true;
          });
        }
      }
    }
  }

  if (start_minutes !== null && end_minutes === null) {
    end_minutes = Math.min(
      start_minutes + (duration_minutes ?? default_duration_minutes),
      MINUTES_PER_DAY,
    );
  }

  if (start_minutes !== null) {
    is_all_day = false;
  }

  return {
    date,
    end_minutes,
    has_match: spans.length > 0,
    is_all_day,
    start_minutes,
    title: clean_title(input, spans),
  };
}
