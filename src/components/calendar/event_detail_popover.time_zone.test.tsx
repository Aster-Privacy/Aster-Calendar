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

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => <span />,
}));

vi.mock("@/contexts/external_link_context", () => ({
  use_external_link: () => ({ handle_external_link: vi.fn() }),
}));

vi.mock("@/hooks/use_synthetic_calendar_display", () => ({
  use_synthetic_calendar_display: () => ({
    birthdays_color: "#d81b60",
    birthdays_name: "Birthdays",
    birthdays_removed: false,
    holidays_color: "#0b8043",
  }),
}));

const { EventDetailPopover } =
  await import("@/components/calendar/event_detail_popover");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function make_event(
  overrides: Partial<DecryptedCalendarEvent>,
): DecryptedCalendarEvent {
  return {
    id: "evt",
    calendar_id: "cal",
    title: "Flight",
    description: "",
    location: "",
    starts_at: "2026-11-21T21:00:00.000Z",
    ends_at: "2026-11-22T08:30:00.000Z",
    is_all_day: false,
    status: "confirmed",
    attendees: [],
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
    organizer_email: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  } as unknown as DecryptedCalendarEvent;
}

function translate(key: string, params?: Record<string, string>): string {
  if (key === "calendar.event_time_zone_range" && params) {
    return `${params.start} to ${params.end}`;
  }

  return key;
}

function render_zone_label(
  overrides: Partial<DecryptedCalendarEvent>,
): string | null {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <EventDetailPopover
        calendar={undefined}
        date_format="MM/DD/YYYY"
        event={make_event(overrides)}
        language="en"
        on_delete_request={() => {}}
        on_dismiss={() => {}}
        on_edit={() => {}}
        on_respond={() => {}}
        self_email="me@astermail.org"
        t={translate as never}
        time_format="24h"
      />,
    ),
  );

  const label = document.querySelector<HTMLElement>(
    "[data-testid=calendar-event-zone-label]",
  );

  return label ? (label.textContent ?? "") : null;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe("EventDetailPopover entered time zones", () => {
  it("shows the times in the zones they were entered in", () => {
    const label = render_zone_label({
      start_time_zone: "America/Los_Angeles",
      end_time_zone: "Asia/Tokyo",
    });

    expect(label).toContain("13:00");
    expect(label).toContain("GMT-8");
    expect(label).toContain(" to ");
    expect(label).toContain("17:30");
    expect(label).toContain("GMT+9");
  });

  it("shows one side when only one zone was entered", () => {
    const label = render_zone_label({ start_time_zone: "Asia/Tokyo" });

    expect(label).toContain("06:00");
    expect(label).toContain("GMT+9");
    expect(label).not.toContain(" to ");
  });

  it("shows no extra line for an event without a zone", () => {
    expect(render_zone_label({})).toBeNull();
  });

  it("ignores a stored zone that is not real", () => {
    expect(
      render_zone_label({
        start_time_zone: "<b>Asia/Tokyo</b>",
        end_time_zone: "Mars/Olympus",
      }),
    ).toBeNull();
  });

  it("ignores zones on an all-day event", () => {
    expect(
      render_zone_label({
        is_all_day: true,
        start_time_zone: "Asia/Tokyo",
        end_time_zone: "Asia/Tokyo",
      }),
    ).toBeNull();
  });
});
