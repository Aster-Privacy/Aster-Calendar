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
import { describe, expect, it } from "vitest";

import { parse_invite_from_ics } from "@/services/calendar/ics_parser";

function invite(body_lines: string[], method = "REQUEST"): string {
  return [
    "BEGIN:VCALENDAR",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    ...body_lines,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");
}

describe("parse_invite_from_ics alarms", () => {
  it("keeps the event fields when the invite carries an alarm", () => {
    const parsed = parse_invite_from_ics(
      invite([
        "UID:alarm-invite",
        "DTSTART:20260302T090000Z",
        "DTEND:20260302T100000Z",
        "SUMMARY:Standup",
        "DESCRIPTION:Real description",
        "BEGIN:VALARM",
        "ACTION:EMAIL",
        "DESCRIPTION:This is an event reminder",
        "SUMMARY:Reminder",
        "ATTENDEE:mailto:alarm@example.com",
        "TRIGGER:-PT30M",
        "END:VALARM",
      ]),
    );

    expect(parsed?.summary).toBe("Standup");
    expect(parsed?.description).toBe("Real description");
    expect(parsed?.attendee_emails).toEqual([]);
  });
});

describe("parse_invite_from_ics", () => {
  it("returns null without a summary or start", () => {
    expect(parse_invite_from_ics(invite(["UID:a"]))).toBeNull();
  });

  it("reads only a plain whole-number sequence", () => {
    const sequence_of = (value: string) =>
      parse_invite_from_ics(
        invite([
          "UID:a",
          "SUMMARY:Sync",
          "DTSTART:20260315T090000Z",
          `SEQUENCE:${value}`,
        ]),
      )?.sequence;

    expect(sequence_of("4")).toBe(4);
    expect(sequence_of("1e9")).toBe(0);
    expect(sequence_of("0x10")).toBe(0);
    expect(sequence_of("-3")).toBe(0);
    expect(sequence_of("99999999999")).toBe(0);
  });

  it("caps the uid at 255 characters", () => {
    const parsed = parse_invite_from_ics(
      invite([
        `UID:${"u".repeat(5000)}`,
        "SUMMARY:Sync",
        "DTSTART:20260315T090000Z",
      ]),
    );

    expect(parsed?.uid).toHaveLength(255);
  });

  it("parses a utc start and end", () => {
    const parsed = parse_invite_from_ics(
      invite([
        "UID:a",
        "SUMMARY:Sync",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T100000Z",
      ]),
    );

    expect(parsed?.starts_at).toBe(
      new Date(Date.UTC(2026, 2, 15, 9, 0, 0)).toISOString(),
    );
    expect(parsed?.ends_at).toBe(
      new Date(Date.UTC(2026, 2, 15, 10, 0, 0)).toISOString(),
    );
    expect(parsed?.is_all_day).toBe(false);
    expect(parsed?.method).toBe("request");
  });

  it("resolves a summer tzid start against its zone offset", () => {
    const parsed = parse_invite_from_ics(
      invite([
        "UID:a",
        "SUMMARY:Sync",
        "DTSTART;TZID=America/New_York:20260315T090000",
        "DTEND;TZID=America/New_York:20260315T100000",
      ]),
    );

    expect(parsed?.starts_at).toBe(
      new Date(Date.UTC(2026, 2, 15, 13, 0, 0)).toISOString(),
    );
    expect(parsed?.ends_at).toBe(
      new Date(Date.UTC(2026, 2, 15, 14, 0, 0)).toISOString(),
    );
  });

  it("resolves a winter tzid start against standard time", () => {
    const parsed = parse_invite_from_ics(
      invite([
        "UID:a",
        "SUMMARY:Sync",
        "DTSTART;TZID=America/New_York:20260115T090000",
      ]),
    );

    expect(parsed?.starts_at).toBe(
      new Date(Date.UTC(2026, 0, 15, 14, 0, 0)).toISOString(),
    );
  });

  it("falls back to floating local time for an unknown tzid", () => {
    const parsed = parse_invite_from_ics(
      invite([
        "UID:a",
        "SUMMARY:Sync",
        "DTSTART;TZID=Not/AZone:20260315T090000",
      ]),
    );

    expect(parsed?.starts_at).toBe(new Date(2026, 2, 15, 9, 0, 0).toISOString());
  });

  it("treats a date value as an all day invite ending the next day", () => {
    const parsed = parse_invite_from_ics(
      invite(["UID:a", "SUMMARY:Holiday", "DTSTART;VALUE=DATE:20260315"]),
    );

    expect(parsed?.is_all_day).toBe(true);
    expect(parsed?.starts_at).toBe(new Date(2026, 2, 15).toISOString());
    expect(parsed?.ends_at).toBe(new Date(2026, 2, 16).toISOString());
  });

  it("reads organizer and attendee addresses", () => {
    const parsed = parse_invite_from_ics(
      invite([
        "UID:a",
        "SUMMARY:Sync",
        "DTSTART:20260315T090000Z",
        "ORGANIZER;CN=Jane Doe:mailto:Jane@Example.com",
        "ATTENDEE:mailto:Bob@Example.com",
        "ATTENDEE:mailto:carol@example.com",
      ]),
    );

    expect(parsed?.organizer_email).toBe("jane@example.com");
    expect(parsed?.organizer_name).toBe("Jane Doe");
    expect(parsed?.attendee_emails).toEqual([
      "bob@example.com",
      "carol@example.com",
    ]);
  });

  it("unfolds continuation lines before parsing", () => {
    const raw = invite([
      "UID:a",
      "SUMMARY:Quarterly plan\n  review meeting",
      "DTSTART:20260315T090000Z",
    ]);

    expect(parse_invite_from_ics(raw)?.summary).toBe(
      "Quarterly plan review meeting",
    );
  });
});

describe("invite methods", () => {
  const lines = ["UID:a", "SUMMARY:Sync", "DTSTART:20260315T090000Z"];

  it("accepts request, reply, and cancel", () => {
    expect(parse_invite_from_ics(invite(lines, "REQUEST"))?.method).toBe(
      "request",
    );
    expect(parse_invite_from_ics(invite(lines, "reply"))?.method).toBe(
      "reply",
    );
    expect(parse_invite_from_ics(invite(lines, "CANCEL"))?.method).toBe(
      "cancel",
    );
  });

  it("refuses publish, unknown, and missing methods", () => {
    expect(parse_invite_from_ics(invite(lines, "PUBLISH"))).toBeNull();
    expect(parse_invite_from_ics(invite(lines, "COUNTER"))).toBeNull();
    expect(parse_invite_from_ics(invite(lines, "X-AUTO-ADD"))).toBeNull();
    const without_method = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      ...lines,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");

    expect(parse_invite_from_ics(without_method)).toBeNull();
  });
});

describe("quoted parameters", () => {
  it("keeps a colon inside a quoted CN", () => {
    const parsed = parse_invite_from_ics(
      invite([
        "UID:a",
        "SUMMARY:Sync",
        "DTSTART:20260315T090000Z",
        'ORGANIZER;CN="Doe: Jane":mailto:jane@example.com',
      ]),
    );

    expect(parsed?.organizer_email).toBe("jane@example.com");
    expect(parsed?.organizer_name).toBe("Doe: Jane");
  });
});
