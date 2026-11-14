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
import type { ReplyIdentity } from "@/services/calendar/invite_sender";

import { beforeEach, describe, expect, it, vi } from "vitest";

interface QueuedEmail {
  to: string[];
  subject: string;
  on_complete: () => void;
}

const queue_email = vi.fn();

vi.mock("@/services/send_queue", () => ({
  queue_email: (...args: unknown[]) => queue_email(...args),
}));

const { decide_rsvp_reply } = await import("@/services/calendar/invite_mail");
const { deliver_rsvp_reply, rsvp_confirmation_key } = await import(
  "@/services/calendar/rsvp_reply"
);
const { parse_ics_events } = await import("@/services/calendar/ics_file");
const { event_organizer_email } = await import("@/services/calendar/itip");

const t = (key: string, params: Record<string, string | number> = {}) =>
  `${key}${Object.keys(params).length > 0 ? ` ${JSON.stringify(params)}` : ""}`;

const IDENTITY: ReplyIdentity = {
  attendee_email: "me@astermail.org",
  reply_email: "me@astermail.org",
  display_name: "Me",
  sender: null,
  resolved: true,
};

function make_event(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  return {
    id: "evt-1",
    calendar_id: "cal-1",
    title: "Planning",
    description: "",
    location: "",
    starts_at: "2026-03-04T09:00:00.000Z",
    ends_at: "2026-03-04T09:30:00.000Z",
    is_all_day: false,
    status: "confirmed",
    attendees: [
      {
        email: "host@example.com",
        display_name: "Host",
        response: "accepted",
        is_organizer: true,
      },
      {
        email: IDENTITY.attendee_email,
        display_name: null,
        response: "accepted",
        is_organizer: false,
      },
    ],
    tags: [],
    reminder_minutes: null,
    color: null,
    availability: "busy",
    visibility: "default",
    event_kind: "default",
    is_completed: false,
    working_location: null,
    conference_url: "",
    guests_can_modify: false,
    guests_can_invite: true,
    guests_can_see_guests: true,
    recurrence: null,
    recurrence_exceptions: [],
    recurrence_master_id: null,
    occurrence_start: null,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    uid: "uid-1",
    sequence: 1,
    organizer_email: "host@example.com",
    ...overrides,
  };
}

function request(
  event: DecryptedCalendarEvent,
  overrides: Partial<Parameters<typeof deliver_rsvp_reply>[0]> = {},
): Parameters<typeof deliver_rsvp_reply>[0] {
  return {
    event,
    organizer_email: event_organizer_email(event) ?? "",
    identity: IDENTITY,
    response: "accepted",
    authenticated_sender: null,
    confirmed_organizer: false,
    t,
    language: "en-US",
    ...overrides,
  };
}

beforeEach(() => {
  queue_email.mockReset();
  queue_email.mockImplementation((email: QueuedEmail) => {
    queueMicrotask(() => email.on_complete());

    return "queued-1";
  });
});

describe("decide_rsvp_reply", () => {
  it("sends when the organizer matches the authenticated sender", () => {
    expect(decide_rsvp_reply("Host@Example.com", "host@example.com")).toEqual({
      kind: "send",
      to: "Host@Example.com",
    });
  });

  it("asks for confirmation when nothing verifies the organizer", () => {
    expect(decide_rsvp_reply("host@example.com", null)).toEqual({
      kind: "confirm",
      organizer: "host@example.com",
    });
    expect(decide_rsvp_reply("host@example.com", null, true)).toEqual({
      kind: "send",
      to: "host@example.com",
    });
    expect(decide_rsvp_reply("", null)).toEqual({ kind: "none" });
  });
});

describe("deliver_rsvp_reply", () => {
  it("sends directly to a verified organizer", async () => {
    const outcome = await deliver_rsvp_reply(
      request(make_event(), { authenticated_sender: "host@example.com" }),
    );

    expect(outcome).toBe("sent");
    expect(queue_email).toHaveBeenCalledTimes(1);
    expect((queue_email.mock.calls[0][0] as QueuedEmail).to).toEqual([
      "host@example.com",
    ]);
  });

  it("does not send to an unverified organizer without confirmation", async () => {
    const event = make_event();
    const outcome = await deliver_rsvp_reply(request(event));

    expect(outcome).toBe("needs_confirmation");
    expect(queue_email).not.toHaveBeenCalled();

    const confirmed = await deliver_rsvp_reply(
      request(event, { confirmed_organizer: true }),
    );

    expect(confirmed).toBe("sent");
    expect((queue_email.mock.calls[0][0] as QueuedEmail).to).toEqual([
      "host@example.com",
    ]);
  });

  it("treats an imported ROLE=CHAIR attendee as unverified", async () => {
    const [imported] = parse_ics_events(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:chair-1",
        "DTSTART:20260304T090000Z",
        "DTEND:20260304T093000Z",
        "SUMMARY:Imported",
        "ATTENDEE;ROLE=CHAIR;CN=Chair:mailto:victim@example.com",
        "ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:me@astermail.org",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    );

    expect(imported).toBeDefined();

    const event = make_event({
      title: imported.title,
      attendees: imported.attendees,
      organizer_email: null,
      uid: imported.uid,
    });

    expect(event_organizer_email(event)).toBe("victim@example.com");

    const outcome = await deliver_rsvp_reply(request(event));

    expect(outcome).toBe("needs_confirmation");
    expect(queue_email).not.toHaveBeenCalled();
  });

  it("strips control characters from the reply subject", async () => {
    await deliver_rsvp_reply(
      request(make_event({ title: "Plan\u0007‮\r\nBcc: x@y.z" }), {
        confirmed_organizer: true,
      }),
    );

    const subject = (queue_email.mock.calls[0][0] as QueuedEmail).subject;

    expect(subject).not.toMatch(/[\u0000-\u001f\u007f‮]/);
    expect(subject).toContain("Plan Bcc: x@y.z");
  });

  it("keys confirmations by series and organizer", () => {
    expect(
      rsvp_confirmation_key(
        { id: "occ-1", recurrence_master_id: "evt-1" },
        " Host@Example.com ",
      ),
    ).toBe(rsvp_confirmation_key(make_event(), "host@example.com"));
  });
});
