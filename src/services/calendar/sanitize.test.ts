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

import { parse_ics_events } from "@/services/calendar/ics_file";
import { parse_invite_from_ics } from "@/services/calendar/ics_parser";
import { parse_itip_message } from "@/services/calendar/itip";
import {
  CALENDAR_TEXT_LIMITS,
  safe_calendar_url,
  sanitize_calendar_description_html,
  sanitize_calendar_email,
  sanitize_calendar_text,
} from "@/services/calendar/sanitize";

function vevent(lines: string[], method = "REQUEST"): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    "UID:hostile-1@example.com",
    "DTSTAMP:20261010T090000Z",
    "DTSTART:20261012T090000Z",
    "DTEND:20261012T100000Z",
    ...lines,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

describe("sanitize_calendar_text", () => {
  it("strips control characters and CRLF injection", () => {
    expect(
      sanitize_calendar_text("Standup\r\nX-Injected: yes\u0000\u0007", "title"),
    ).toBe("Standup X-Injected: yes");
  });

  it("removes bidi override and zero width characters", () => {
    expect(sanitize_calendar_text("fdp.\u202eexe", "title")).toBe("fdp.exe");
    expect(sanitize_calendar_text("a\u200bb\ufeffc", "location")).toBe("abc");
  });

  it("caps a one megabyte description", () => {
    const huge = "x".repeat(1024 * 1024);
    const result = sanitize_calendar_text(huge, "description");

    expect(result.length).toBe(CALENDAR_TEXT_LIMITS.description);
  });

  it("collapses whitespace but keeps paragraphs in descriptions", () => {
    expect(sanitize_calendar_text("  a \t b  \n\n\n\n c ", "description")).toBe(
      "a b\n\nc",
    );
    expect(sanitize_calendar_text("  a \n b ", "title")).toBe("a b");
  });

  it("returns an empty string for non strings", () => {
    expect(sanitize_calendar_text(null, "title")).toBe("");
    expect(sanitize_calendar_text(42, "title")).toBe("");
  });
});

describe("sanitize_calendar_email", () => {
  it("keeps one plain address and drops the mailto prefix", () => {
    expect(sanitize_calendar_email("mailto:Ada@Example.com")).toBe(
      "Ada@Example.com",
    );
  });

  it("rejects header injection, missing at sign, and oversized values", () => {
    expect(sanitize_calendar_email("a@b.com\r\nBcc: x@y.com")).toBe("");
    expect(sanitize_calendar_email("not-an-address")).toBe("");
    expect(sanitize_calendar_email("@example.com")).toBe("");
    expect(sanitize_calendar_email(`${"a".repeat(400)}@example.com`)).toBe("");
  });
});

describe("safe_calendar_url", () => {
  it("allows https, http, mailto and tel", () => {
    expect(safe_calendar_url("https://meet.example.com/x")).toBe(
      "https://meet.example.com/x",
    );
    expect(safe_calendar_url("http://meet.example.com/x")).toBe(
      "http://meet.example.com/x",
    );
    expect(safe_calendar_url("mailto:ada@example.com")).toBe(
      "mailto:ada@example.com",
    );
    expect(safe_calendar_url("tel:+15555550100")).toBe("tel:+15555550100");
  });

  it("rejects script, data, file, and vbscript schemes", () => {
    expect(safe_calendar_url("javascript:alert(1)")).toBeNull();
    expect(safe_calendar_url("JAVASCRIPT:alert(1)")).toBeNull();
    expect(
      safe_calendar_url("data:text/html,<script>alert(1)</script>"),
    ).toBeNull();
    expect(safe_calendar_url("file:///etc/passwd")).toBeNull();
    expect(safe_calendar_url("vbscript:msgbox(1)")).toBeNull();
    expect(safe_calendar_url("  javascript:alert(1)")).toBeNull();
  });

  it("rejects control characters, whitespace, and bidi tricks", () => {
    expect(safe_calendar_url("https://a.example\u0000.com")).toBeNull();
    expect(safe_calendar_url("https://a.example.com/\u202e")).toBeNull();
    expect(safe_calendar_url("https://a.example.com/ b")).toBeNull();
    expect(
      safe_calendar_url(`https://a.example.com/${"x".repeat(3000)}`),
    ).toBeNull();
  });
});

describe("sanitize_calendar_description_html", () => {
  it("drops scripts and event handlers but keeps safe markup", () => {
    const html =
      '<p onclick="alert(1)">Agenda</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src="https://t.example/p.gif">';
    const result = sanitize_calendar_description_html(html);

    expect(result).toContain("Agenda");
    expect(result).not.toContain("<script");
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain('<img src="https://t.example/p.gif"');
    expect(result).toContain('data-blocked="true"');
  });
});

describe("hostile ICS input", () => {
  it("cleans every string an imported or subscribed VEVENT carries", () => {
    const [event] = parse_ics_events(
      vevent([
        "SUMMARY:Team\\nsync\u0000\u202e<b>bold</b>",
        "DESCRIPTION:line one\\nline two\u0007",
        "LOCATION:Room\u0000 1\u200b",
        "URL:javascript:alert(1)",
        "ATTENDEE;CN=Ada\u0000 Lovelace\u202e:mailto:Ada@Example.com\u0000",
        "ORGANIZER;CN=\u0007Boss:mailto:boss@example.com",
      ]),
    );

    expect(event.title).toBe("Team sync<b>bold</b>");
    expect(event.description).toBe("line one\nline two");
    expect(event.location).toBe("Room 1");
    expect(event.conference_url).toBe("");
    expect(event.attendees.map((attendee) => attendee.email)).toEqual([
      "Ada@Example.com",
      "boss@example.com",
    ]);
    expect(event.attendees[0].display_name).toBe("Ada Lovelace");
    expect(event.attendees[1].display_name).toBe("Boss");
  });

  it("drops attendees whose address is not a single mailbox", () => {
    const [event] = parse_ics_events(
      vevent([
        "SUMMARY:x",
        "ATTENDEE:mailto:a@b.com b@c.com",
        "ATTENDEE:mailto:x@y.com,z@w.com",
        "ATTENDEE:mailto:no-at-sign",
        "ATTENDEE:mailto:ok@example.com",
      ]),
    );

    expect(event.attendees.map((attendee) => attendee.email)).toEqual([
      "ok@example.com",
    ]);
  });

  it("cleans the invite card fields", () => {
    const invite = parse_invite_from_ics(
      vevent([
        "SUMMARY:Lunch\u202e\u0000 with <script>x</script>",
        `DESCRIPTION:${"y".repeat(20_000)}`,
        "LOCATION:Cafe\u0007",
        "ORGANIZER;CN=\u202eEve:mailto:Eve@Example.com\u0000",
      ]),
    );

    expect(invite).not.toBeNull();
    expect(invite?.summary).toBe("Lunch with <script>x</script>");
    expect(invite?.description.length).toBe(CALENDAR_TEXT_LIMITS.description);
    expect(invite?.location).toBe("Cafe");
    expect(invite?.organizer_email).toBe("eve@example.com");
    expect(invite?.organizer_name).toBe("Eve");
  });

  it("cleans the iTIP organizer", () => {
    const message = parse_itip_message(
      vevent([
        "SUMMARY:x",
        "ORGANIZER;CN=Mal\u0000lory\u202e:mailto:MAL@example.com\u0000",
      ]),
    );

    expect(message?.organizer?.email).toBe("MAL@example.com");
    expect(message?.organizer?.display_name).toBe("Mallory");
  });
});
