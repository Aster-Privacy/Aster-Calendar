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
import type {
  CalendarAttendee,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: ({
    email,
    name,
    size,
  }: {
    email?: string;
    name: string;
    size?: string;
  }) => (
    <span
      data-email={email}
      data-name={name}
      data-size={size}
      data-testid="attendee-avatar"
    />
  ),
}));

vi.mock("@/contexts/external_link_context", () => ({
  use_external_link: () => ({ handle_external_link: vi.fn() }),
}));

const { EventDetailPopover } =
  await import("@/components/calendar/event_detail_popover");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function make_event(attendees: CalendarAttendee[]): DecryptedCalendarEvent {
  return {
    id: "evt",
    calendar_id: "cal",
    title: "Planning",
    description: "",
    location: "",
    starts_at: new Date(2026, 10, 2, 11, 0).toISOString(),
    ends_at: new Date(2026, 10, 2, 12, 0).toISOString(),
    is_all_day: false,
    status: "confirmed",
    attendees,
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
    guests_can_invite: false,
    guests_can_see_guests: true,
    recurrence: null,
    recurrence_exceptions: [],
    recurrence_master_id: null,
    occurrence_start: null,
    organizer_email: attendees.find((a) => a.is_organizer)?.email ?? null,
    created_at: new Date(2026, 10, 1).toISOString(),
    updated_at: new Date(2026, 10, 1).toISOString(),
  } as unknown as DecryptedCalendarEvent;
}

function attendee(
  email: string,
  display_name: string | null,
  is_organizer = false,
): CalendarAttendee {
  return {
    email,
    display_name,
    is_organizer,
    response: is_organizer ? "accepted" : "needs_action",
  } as CalendarAttendee;
}

function render_popover(attendees: CalendarAttendee[]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <EventDetailPopover
        calendar={undefined}
        date_format="MM/DD/YYYY"
        event={make_event(attendees)}
        language="en"
        on_delete_request={() => {}}
        on_dismiss={() => {}}
        on_edit={() => {}}
        on_respond={() => {}}
        self_email="me@astermail.org"
        t={((key: string) => key) as never}
        time_format="12h"
      />,
    ),
  );

  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-testid=attendee-avatar]"),
  );
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe("EventDetailPopover attendee avatars", () => {
  it("renders a profile avatar for each attendee by address", () => {
    const avatars = render_popover([
      attendee("sam@astermail.org", "Sam Okafor", true),
      attendee("alex@example.com", null),
    ]);

    expect(avatars.map((a) => a.dataset.email)).toEqual([
      "sam@astermail.org",
      "alex@example.com",
    ]);
    expect(avatars.map((a) => a.dataset.name)).toEqual([
      "Sam Okafor",
      "alex@example.com",
    ]);
    expect(avatars.every((a) => a.dataset.size === "xs")).toBe(true);
  });

  it("keeps every row when an address repeats", () => {
    const error_spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const avatars = render_popover([
      attendee("sam@astermail.org", "Sam", true),
      attendee("sam@astermail.org", "Sam"),
    ]);
    const key_warnings = error_spy.mock.calls.filter((call) =>
      String(call[0]).includes("same key"),
    );

    error_spy.mockRestore();
    expect(avatars).toHaveLength(2);
    expect(key_warnings).toHaveLength(0);
  });

  it("shows no avatars without attendees", () => {
    expect(render_popover([])).toHaveLength(0);
  });
});
