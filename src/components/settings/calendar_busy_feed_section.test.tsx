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
import type { DecryptedCalendar } from "@/types/calendar";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mocks = vi.hoisted(() => ({
  update_preference: vi.fn(),
  list_busy_feeds: vi.fn(),
  create_busy_feed_link: vi.fn(),
  publish_busy_calendar: vi.fn(),
  revoke_busy_feed: vi.fn(),
  show_toast: vi.fn(),
  opt_ins: [] as string[],
  order: [] as string[],
}));

interface MockRowProps {
  label: ReactNode;
  description: ReactNode;
  toggle: { checked: boolean; on_change: (next: boolean) => void };
}

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  IslandSection: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  IslandRow: ({ label, description, toggle }: MockRowProps) => (
    <div data-row="">
      <span>{label}</span>
      <span data-description="">{description}</span>
      <button
        data-checked={String(toggle.checked)}
        data-toggle=""
        type="button"
        onClick={() => toggle.on_change(!toggle.checked)}
      />
    </div>
  ),
  show_toast: mocks.show_toast,
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: () => null,
  ModalBody: () => null,
  ModalDescription: () => null,
  ModalFooter: () => null,
  ModalHeader: () => null,
  ModalTitle: () => null,
}));

vi.mock("@/components/ui/dropdown_menu", () => ({
  DropdownMenu: () => null,
  DropdownMenuContent: () => null,
  DropdownMenuItem: () => null,
  DropdownMenuTrigger: () => null,
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: ({
    is_open,
    confirm_text,
    on_confirm,
  }: {
    is_open: boolean;
    confirm_text: string;
    on_confirm: () => void;
  }) =>
    is_open ? (
      <button data-confirm={confirm_text} type="button" onClick={on_confirm} />
    ) : null,
}));

vi.mock("@/contexts/auth/use_auth_hook", () => ({
  use_auth: () => ({ user: { email: "me@aster.test" } }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      calendar_busy_feed_calendars: mocks.opt_ins,
      time_format: "24h",
    },
    update_preference: mocks.update_preference,
  }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/services/calendar/busy_feed", () => ({
  list_busy_feeds: mocks.list_busy_feeds,
  create_busy_feed_link: mocks.create_busy_feed_link,
  publish_busy_calendar: mocks.publish_busy_calendar,
  revoke_busy_feed: mocks.revoke_busy_feed,
}));

import {
  CalendarBusyFeedSection,
  forget_busy_feeds_cache,
  use_busy_feeds,
} from "@/components/settings/calendar_busy_feed_section";

function SectionWithFeeds() {
  return (
    <CalendarBusyFeedSection
      busy_feeds={use_busy_feeds()}
      calendars={CALENDARS}
    />
  );
}

const CALENDARS = [
  { id: "calendar_1", name: "Work", color: "#000000" },
  { id: "calendar_2", name: "Home", color: "#ffffff" },
] as unknown as DecryptedCalendar[];

const mounted: Root[] = [];

async function flush() {
  for (let index = 0; index < 5; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function render_section(): Promise<HTMLDivElement> {
  const container = document.createElement("div");

  document.body.appendChild(container);

  const root = createRoot(container);

  mounted.push(root);
  await act(async () => {
    root.render(<SectionWithFeeds />);
  });
  await flush();

  return container;
}

function row(container: HTMLDivElement, index: number) {
  const element = container.querySelectorAll<HTMLDivElement>("[data-row]")[
    index
  ];

  return {
    description: element.querySelector("[data-description]")!.textContent,
    toggle: element.querySelector<HTMLButtonElement>("[data-toggle]")!,
  };
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
  await flush();
}

describe("CalendarBusyFeedSection", () => {
  beforeEach(() => {
    mocks.opt_ins = [];
    mocks.order = [];
    mocks.update_preference.mockReset();
    mocks.update_preference.mockImplementation((key: string) => {
      mocks.order.push(`update:${key}`);
    });
    forget_busy_feeds_cache();
    mocks.list_busy_feeds.mockReset();
    mocks.list_busy_feeds.mockResolvedValue({
      data: {
        feeds: [
          {
            calendar_id: "calendar_1",
            created_at: "2026-03-01T00:00:00Z",
            published_at: "2026-03-01T00:00:00Z",
            window_start: null,
            window_end: null,
            block_count: 1,
          },
        ],
      },
    });
    mocks.create_busy_feed_link.mockReset();
    mocks.create_busy_feed_link.mockResolvedValue({
      data: {
        calendar_id: "calendar_2",
        feed_url: "https://example.test/feed",
        created_at: "2026-03-01T00:00:00Z",
        published_at: null,
      },
    });
    mocks.publish_busy_calendar.mockReset();
    mocks.publish_busy_calendar.mockResolvedValue({
      published_at: "2026-03-01T00:00:00Z",
      block_count: 1,
    });
    mocks.revoke_busy_feed.mockReset();
    mocks.revoke_busy_feed.mockImplementation(async () => {
      mocks.order.push("revoke");

      return { data: { success: true } };
    });
    mocks.show_toast.mockReset();
  });

  afterEach(() => {
    for (const root of mounted.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = "";
  });

  it("shows a link you never confirmed on this account as paused", async () => {
    const container = await render_section();
    const first = row(container, 0);

    expect(first.description).toBe("calendar.busy_feed_paused");
    expect(first.toggle.dataset.checked).toBe("false");
    expect(mocks.publish_busy_calendar).not.toHaveBeenCalled();
  });

  it("resumes a paused link in one step without issuing a new link", async () => {
    const container = await render_section();

    await click(row(container, 0).toggle);

    expect(mocks.update_preference).toHaveBeenCalledWith(
      "calendar_busy_feed_calendars",
      ["calendar_1"],
      true,
    );
    expect(mocks.create_busy_feed_link).not.toHaveBeenCalled();
    expect(mocks.publish_busy_calendar).toHaveBeenCalledTimes(1);

    const [calendar_id, , opt_ins, options] =
      mocks.publish_busy_calendar.mock.calls[0];

    expect(calendar_id).toBe("calendar_1");
    expect(opt_ins()).toEqual(["calendar_1"]);
    expect(options).toEqual({ force: true });
    expect(mocks.show_toast).toHaveBeenCalledWith(
      "calendar.busy_feed_resumed",
      "success",
    );
  });

  it("records the calendar when you create a new link", async () => {
    mocks.opt_ins = ["calendar_1"];

    const container = await render_section();

    expect(row(container, 1).description).toBe("calendar.busy_feed_not_shared");

    await click(row(container, 1).toggle);

    expect(mocks.create_busy_feed_link).toHaveBeenCalledWith("calendar_2");
    expect(mocks.update_preference).toHaveBeenCalledWith(
      "calendar_busy_feed_calendars",
      ["calendar_1", "calendar_2"],
      true,
    );
    expect(mocks.publish_busy_calendar.mock.calls[0][0]).toBe("calendar_2");
  });

  it("does not record the calendar when the link could not be created", async () => {
    mocks.create_busy_feed_link.mockResolvedValue({ error: "failed" });

    const container = await render_section();

    await click(row(container, 1).toggle);

    expect(mocks.update_preference).not.toHaveBeenCalled();
    expect(mocks.publish_busy_calendar).not.toHaveBeenCalled();
  });

  it("removes the calendar before revoking the link when you stop sharing", async () => {
    mocks.opt_ins = ["calendar_1", "calendar_2"];

    const container = await render_section();
    const first = row(container, 0);

    expect(first.toggle.dataset.checked).toBe("true");

    await click(first.toggle);
    await click(
      container.ownerDocument.querySelector<HTMLButtonElement>(
        '[data-confirm="calendar.busy_feed_stop"]',
      )!,
    );

    expect(mocks.update_preference).toHaveBeenCalledWith(
      "calendar_busy_feed_calendars",
      ["calendar_2"],
      true,
    );
    expect(mocks.revoke_busy_feed).toHaveBeenCalledWith("calendar_1");
    expect(mocks.order).toEqual([
      "update:calendar_busy_feed_calendars",
      "revoke",
    ]);
  });
});
