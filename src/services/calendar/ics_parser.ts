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
import {
  resolve_tzid,
  split_property_line,
} from "@/services/calendar/ics_file";
import { find_ics_block } from "@/services/calendar/ics_blocks";
import {
  sanitize_calendar_email,
  sanitize_calendar_text,
} from "@/services/calendar/sanitize";

export type InviteMethod = "request" | "reply" | "cancel";

export interface ParsedInvite {
  method: InviteMethod;
  uid: string;
  sequence: number;
  summary: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  organizer_email: string;
  organizer_name: string;
  attendee_emails: string[];
}

interface RawLine {
  name: string;
  params: Record<string, string>;
  value: string;
}

const MAX_UID_LENGTH = 255;

function unfold_ics(text: string): string {
  return text.replace(/\r?\n[ \t]/g, "");
}

function unescape_text(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, escaped: string) =>
    escaped === "n" || escaped === "N" ? "\n" : escaped,
  );
}

function parse_line(line: string): RawLine | null {
  const property = split_property_line(line);

  if (!property) {
    return null;
  }

  return { ...property, value: property.value.trim() };
}

function zone_offset_ms(time_zone: string, instant_ms: number): number | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: time_zone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const field: Record<string, number> = {};

    for (const part of formatter.formatToParts(new Date(instant_ms))) {
      if (part.type !== "literal") {
        field[part.type] = Number(part.value);
      }
    }

    const as_utc = Date.UTC(
      field.year,
      field.month - 1,
      field.day,
      field.hour === 24 ? 0 : field.hour,
      field.minute,
      field.second,
    );

    return as_utc - instant_ms;
  } catch {
    return null;
  }
}

function zoned_wall_to_utc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  time_zone: string,
): Date | null {
  const wall_as_utc = Date.UTC(year, month, day, hour, minute, second);
  const first = zone_offset_ms(time_zone, wall_as_utc);

  if (first === null) {
    return null;
  }

  const refined = zone_offset_ms(time_zone, wall_as_utc - first);
  const offset = refined === null ? first : refined;

  return new Date(wall_as_utc - offset);
}

function ics_datetime_to_date(
  raw: string,
  time_zone?: string,
): { date: Date; is_date: boolean } | null {
  const match = raw
    .trim()
    .match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);

  if (year < 1000) {
    return null;
  }

  if (match[4] === undefined) {
    return { date: new Date(year, month, day), is_date: true };
  }

  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);

  if (match[7]) {
    return {
      date: new Date(Date.UTC(year, month, day, hour, minute, second)),
      is_date: false,
    };
  }

  if (time_zone && time_zone.length > 0) {
    const zoned = zoned_wall_to_utc(
      year,
      month,
      day,
      hour,
      minute,
      second,
      time_zone,
    );

    if (zoned) {
      return { date: zoned, is_date: false };
    }
  }

  return { date: new Date(year, month, day, hour, minute, second), is_date: false };
}

function parse_mailto(value: string): string {
  return sanitize_calendar_email(value).toLowerCase();
}

export function parse_invite_from_ics(ics: string): ParsedInvite | null {
  const event_match = find_ics_block(ics, "VEVENT");
  if (!event_match) {
    return null;
  }

  const method_line = unfold_ics(ics)
    .split(/\r?\n/)
    .map(parse_line)
    .find((line) => line && line.name === "METHOD");

  const method_value = method_line ? method_line.value.toLowerCase() : "";

  if (
    method_value !== "request" &&
    method_value !== "reply" &&
    method_value !== "cancel"
  ) {
    return null;
  }

  const method: InviteMethod = method_value;

  const lines = unfold_ics(event_match)
    .split(/\r?\n/)
    .map(parse_line)
    .filter((line): line is RawLine => line !== null);

  let uid = "";
  let sequence = 0;
  let summary = "";
  let description = "";
  let location = "";
  let organizer_email = "";
  let organizer_name = "";
  let start: { date: Date; is_date: boolean } | null = null;
  let end: { date: Date; is_date: boolean } | null = null;
  const attendee_emails: string[] = [];

  let in_alarm = false;

  for (const line of lines) {
    const block_name = line.value.trim().toUpperCase();

    if (line.name === "BEGIN" && block_name === "VALARM") {
      in_alarm = true;
      continue;
    }

    if (line.name === "END" && block_name === "VALARM") {
      in_alarm = false;
      continue;
    }

    if (in_alarm) {
      continue;
    }

    switch (line.name) {
      case "UID":
        uid = line.value.trim().slice(0, MAX_UID_LENGTH);
        break;
      case "SEQUENCE":
        sequence = /^\d{1,9}$/.test(line.value.trim())
          ? Number.parseInt(line.value.trim(), 10)
          : 0;
        break;
      case "SUMMARY":
        summary = sanitize_calendar_text(unescape_text(line.value), "title");
        break;
      case "DESCRIPTION":
        description = sanitize_calendar_text(
          unescape_text(line.value),
          "description",
        );
        break;
      case "LOCATION":
        location = sanitize_calendar_text(
          unescape_text(line.value),
          "location",
        );
        break;
      case "DTSTART":
        start = ics_datetime_to_date(line.value, resolve_tzid(line.params.TZID));
        break;
      case "DTEND":
        end = ics_datetime_to_date(line.value, resolve_tzid(line.params.TZID));
        break;
      case "ORGANIZER":
        organizer_email = parse_mailto(line.value);
        organizer_name = sanitize_calendar_text(
          line.params.CN,
          "display_name",
        );
        break;
      case "ATTENDEE": {
        const email = parse_mailto(line.value);
        if (email) {
          attendee_emails.push(email);
        }
        break;
      }
      default:
        break;
    }
  }

  if (!start || !summary) {
    return null;
  }

  const is_all_day = start.is_date;
  const starts_at = start.date.toISOString();
  let ends_at: string;

  if (end) {
    ends_at = end.date.toISOString();
  } else if (is_all_day) {
    const next_day = new Date(start.date);
    next_day.setDate(next_day.getDate() + 1);
    ends_at = next_day.toISOString();
  } else {
    ends_at = new Date(start.date.getTime() + 60 * 60 * 1000).toISOString();
  }

  return {
    method,
    uid,
    sequence,
    summary,
    description,
    location,
    starts_at,
    ends_at,
    is_all_day,
    organizer_email,
    organizer_name,
    attendee_emails,
  };
}
