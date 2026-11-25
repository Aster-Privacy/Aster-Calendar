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
import type { ReactNode } from "react";
import type {
  CalendarAttendeeResponse,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface QueuedEmail {
  to: string[];
  on_complete: () => void;
}

const SELF = "me@astermail.org";

const mocks = vi.hoisted(() => ({
  queue_email: vi.fn(),
  show_toast: vi.fn(),
  set_own_response: vi.fn(),
  reload: vi.fn(),
  events: [] as unknown[],
}));

vi.mock("@/services/send_queue", () => ({
  queue_email: (...args: unknown[]) => mocks.queue_email(...args),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params: Record<string, string> = {}) =>
      Object.keys(params).length > 0 ? `${key} ${JSON.stringify(params)}` : key,
    language: "en-US",
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      time_format: "12h",
      date_format: "MM/DD/YYYY",
      calendar_week_starts_on: "sunday",
      calendar_timezone: null,
    },
  }),
}));

vi.mock("@/contexts/auth/use_auth_hook", () => ({
  use_auth: () => ({ user: { email: "me@astermail.org", display_name: "Me" } }),
}));

vi.mock("@/components/calendar/use_invite_senders", () => ({
  use_invite_senders: () => ({ all_options: [] }),
}));

vi.mock("@/services/calendar/invite_sender", () => ({
  reply_identity: () => ({
    attendee_email: "me@astermail.org",
    reply_email: "me@astermail.org",
    display_name: "Me",
    sender: null,
    resolved: true,
  }),
}));

vi.mock("@/services/calendar/invite_store", () => ({
  set_own_response: (...args: unknown[]) => mocks.set_own_response(...args),
}));

vi.mock("@/services/calendar/own_addresses", () => ({
  is_own_address: (address: string, self: string) =>
    address.trim().toLowerCase() === self.trim().toLowerCase(),
}));

vi.mock("@/pages/mail_panel/use_mail_panel_events", () => ({
  use_mail_panel_events: () => ({
    status: "ready",
    events: mocks.events,
    calendars: [],
    retry: () => {},
    reload: mocks.reload,
  }),
}));

vi.mock("@/pages/mail_panel/use_mail_panel_delete", () => ({
  use_mail_panel_delete: () => ({ request_delete: () => {}, dialogs: null }),
}));

vi.mock("@/pages/mail_panel/mail_panel_bridge", () => ({
  open_in_new_tab: () => {},
  post_to_host: () => {},
  read_host_message: () => null,
  set_panel_visible: () => {},
  use_panel_visible: () => false,
}));

vi.mock("@/pages/mail_panel/mail_panel_mini_month", () => ({
  MailPanelMiniMonth: () => null,
}));

vi.mock("@/components/calendar/up_next_card", () => ({
  UpNextCard: () => null,
}));

vi.mock("@/components/common/encryption_info_dropdown", () => ({
  EncryptionInfoDropdown: () => null,
}));

vi.mock("@/pages/mail_panel/mail_panel_agenda", () => ({
  MailPanelAgenda: ({
    on_event_click,
  }: {
    on_event_click: (event: DecryptedCalendarEvent) => void;
  }) => (
    <button
      data-testid="open-event"
      type="button"
      onClick={() => on_event_click(mocks.events[0] as DecryptedCalendarEvent)}
    />
  ),
}));

vi.mock("@/pages/mail_panel/mail_panel_event_view", () => ({
  MailPanelEventView: ({
    event,
    on_respond,
  }: {
    event: DecryptedCalendarEvent;
    on_respond: (
      event: DecryptedCalendarEvent,
      response: CalendarAttendeeResponse,
    ) => void;
  }) => (
    <button
      data-testid="accept"
      type="button"
      onClick={() => on_respond(event, "accepted")}
    />
  ),
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: ({
    is_open,
    title,
    message,
    extra_content,
    on_confirm,
    on_cancel,
  }: {
    is_open: boolean;
    title: string;
    message: string;
    extra_content?: ReactNode;
    on_confirm: () => void;
    on_cancel: () => void;
  }) =>
    is_open ? (
      <div data-testid="rsvp-confirm">
        <p data-testid="rsvp-title">{title}</p>
        <p data-testid="rsvp-message">{message}</p>
        {extra_content}
        <button data-testid="rsvp-send" type="button" onClick={on_confirm} />
        <button data-testid="rsvp-cancel" type="button" onClick={on_cancel} />
      </div>
    ) : null,
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => mocks.show_toast(...args),
  SimpleToast: () => null,
}));

const { PanelBody } = await import("@/pages/mail_panel/mail_panel_page");

function make_event(organizer: string): DecryptedCalendarEvent {
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
        email: organizer,
        display_name: "Host",
        response: "accepted",
        is_organizer: true,
      },
      {
        email: SELF,
        display_name: null,
        response: "needs_action",
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
    organizer_email: organizer,
  } as DecryptedCalendarEvent;
}

let container: HTMLDivElement;
let root: Root;

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function click(test_id: string): Promise<void> {
  const target = container.querySelector(`[data-testid="${test_id}"]`);

  expect(target).not.toBeNull();
  await act(async () => {
    (target as HTMLButtonElement).click();
  });
  await flush();
}

async function respond_to(organizer: string): Promise<void> {
  mocks.events = [make_event(organizer)];
  await act(async () => {
    root.render(<PanelBody on_open_in_calendar={() => {}} />);
  });
  await click("open-event");
  await click("accept");
}

function confirm_dialog(): Element | null {
  return container.querySelector('[data-testid="rsvp-confirm"]');
}

function sent_to(): string[][] {
  return mocks.queue_email.mock.calls.map(
    (call) => (call[0] as QueuedEmail).to,
  );
}

beforeEach(() => {
  mocks.queue_email.mockReset();
  mocks.queue_email.mockImplementation((email: QueuedEmail) => {
    queueMicrotask(() => email.on_complete());

    return "queued-1";
  });
  mocks.show_toast.mockReset();
  mocks.reload.mockReset();
  mocks.set_own_response.mockReset();
  mocks.set_own_response.mockImplementation(
    async (event: DecryptedCalendarEvent) => event,
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("mail panel invite replies", () => {
  it("does not reply to an unverified organizer until the user confirms", async () => {
    await respond_to("host@example.com");

    expect(mocks.set_own_response).toHaveBeenCalledTimes(1);
    expect(mocks.queue_email).not.toHaveBeenCalled();
    expect(confirm_dialog()).not.toBeNull();
    expect(
      container.querySelector('[data-testid="rsvp-message"]')?.textContent,
    ).toBe("calendar.invite_card_reply_target_unverified");
    expect(confirm_dialog()?.textContent).toContain(
      'calendar.invite_card_reply_to {"email":"host@example.com"}',
    );
  });

  it("sends the reply to the organizer after the user confirms", async () => {
    await respond_to("host@example.com");
    await click("rsvp-send");

    expect(sent_to()).toEqual([["host@example.com"]]);
    expect(confirm_dialog()).toBeNull();
    expect(mocks.show_toast).toHaveBeenCalledWith(
      "calendar.invite_card_reply_sent",
      "success",
    );
  });

  it("keeps the saved response and sends nothing when the user cancels", async () => {
    await respond_to("host@example.com");
    await click("rsvp-cancel");

    expect(mocks.queue_email).not.toHaveBeenCalled();
    expect(confirm_dialog()).toBeNull();
    expect(mocks.show_toast).toHaveBeenCalledWith(
      "calendar.event_updated",
      "success",
    );
  });

  it("asks again on the next reply to the same organizer", async () => {
    await respond_to("host@example.com");
    await click("rsvp-send");
    mocks.queue_email.mockClear();
    await click("accept");

    expect(mocks.queue_email).not.toHaveBeenCalled();
    expect(confirm_dialog()).not.toBeNull();
  });

  it("saves without a reply or a prompt when the user organizes the event", async () => {
    await respond_to(SELF);

    expect(mocks.set_own_response).toHaveBeenCalledTimes(1);
    expect(mocks.queue_email).not.toHaveBeenCalled();
    expect(confirm_dialog()).toBeNull();
    expect(mocks.show_toast).toHaveBeenCalledWith(
      "calendar.event_updated",
      "success",
    );
  });
});
