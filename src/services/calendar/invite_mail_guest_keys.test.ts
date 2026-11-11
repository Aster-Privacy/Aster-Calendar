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

import { beforeEach, describe, expect, it, vi } from "vitest";

interface QueuedEmail {
  to: string[];
  pgp_recipients?: string[];
  pgp_recipient_keys?: Record<string, string>;
  obscure_subject?: boolean;
  on_complete: () => void;
}

const queue_email = vi.fn();
const discover_external_keys_batch = vi.fn();

vi.mock("@/services/send_queue", () => ({
  queue_email: (...args: unknown[]) => queue_email(...args),
}));

vi.mock("@/services/api/keys", async (import_original) => {
  const actual = await import_original<Record<string, unknown>>();

  return {
    ...actual,
    discover_external_keys_batch: (...args: unknown[]) =>
      discover_external_keys_batch(...args),
  };
});

const { send_invitations } = await import("@/services/calendar/invite_mail");
const { clear_guest_key_pins, pin_guest_key } = await import(
  "@/services/guest_key_pins"
);

const HOST = { email: "host@astermail.org", display_name: "Host" };

const t = (key: string) => key;

function guest(email: string) {
  return {
    email,
    display_name: null,
    response: "needs_action" as const,
    is_organizer: false,
  };
}

function make_event(emails: string[]): DecryptedCalendarEvent {
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
      { ...HOST, response: "accepted", is_organizer: true },
      ...emails.map(guest),
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
    sequence: 2,
    organizer_email: HOST.email,
  };
}

async function invite(emails: string[]): Promise<QueuedEmail[]> {
  await send_invitations({
    event: make_event(emails),
    guests: emails.map(guest),
    method: "REQUEST",
    organizer: HOST,
    sequence: 0,
    t,
    language: "en-US",
  });

  return queue_email.mock.calls.map((call) => call[0] as QueuedEmail);
}

beforeEach(() => {
  clear_guest_key_pins();
  queue_email.mockReset();
  queue_email.mockImplementation((email: QueuedEmail) => {
    email.on_complete();

    return "queued-1";
  });
  discover_external_keys_batch.mockReset();
  discover_external_keys_batch.mockResolvedValue({ data: [] });
});

describe("guest keys on invitations", () => {
  it("passes the key shown in the form and skips a second lookup", async () => {
    pin_guest_key("Guest@Example.com", "SHOWN-KEY");

    const [email] = await invite(["guest@example.com"]);

    expect(email.pgp_recipients).toEqual(["guest@example.com"]);
    expect(email.pgp_recipient_keys).toEqual({
      "guest@example.com": "SHOWN-KEY",
    });
    expect(email.obscure_subject).toBe(true);
    expect(discover_external_keys_batch).not.toHaveBeenCalled();
  });

  it("looks the key up when the form never showed one", async () => {
    discover_external_keys_batch.mockResolvedValue({
      data: [
        {
          email: "guest@example.com",
          found: true,
          public_key: "FOUND-KEY",
          will_encrypt: true,
        },
      ],
    });

    const [email] = await invite(["guest@example.com"]);

    expect(email.pgp_recipients).toEqual(["guest@example.com"]);
    expect(email.pgp_recipient_keys).toEqual({
      "guest@example.com": "FOUND-KEY",
    });
    expect(email.obscure_subject).toBe(true);
  });

  it("sends a plain invite when the guest has no key", async () => {
    discover_external_keys_batch.mockResolvedValue({
      data: [
        {
          email: "guest@example.com",
          found: false,
          public_key: null,
          will_encrypt: false,
        },
      ],
    });

    const [email] = await invite(["guest@example.com"]);

    expect(email.pgp_recipients).toBeUndefined();
    expect(email.pgp_recipient_keys).toBeUndefined();
    expect(email.obscure_subject).toBeUndefined();
  });

  it("sends a plain invite when the lookup fails", async () => {
    discover_external_keys_batch.mockRejectedValue(new Error("offline"));

    const [email] = await invite(["guest@example.com"]);

    expect(email.pgp_recipients).toBeUndefined();
    expect(email.pgp_recipient_keys).toBeUndefined();
  });

  it("leaves internal guests on the existing path", async () => {
    pin_guest_key("friend@astermail.org", "SHOWN-KEY");

    const [email] = await invite(["friend@astermail.org"]);

    expect(email.pgp_recipients).toBeUndefined();
    expect(email.pgp_recipient_keys).toBeUndefined();
    expect(discover_external_keys_batch).not.toHaveBeenCalled();
  });
});
