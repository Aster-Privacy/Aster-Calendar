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
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";
import type { CalendarEventMenuActions } from "@/components/calendar/calendar_event_context_menu";

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/ui/context_menu", () => {
  const pass = ({ children }: { children?: ReactNode }) => <>{children}</>;

  return {
    ContextMenu: pass,
    ContextMenuTrigger: pass,
    ContextMenuContent: ({ children }: { children?: ReactNode }) => (
      <div data-menu="">{children}</div>
    ),
    ContextMenuItem: ({
      children,
      onSelect,
    }: {
      children?: ReactNode;
      onSelect?: () => void;
    }) => (
      <button data-menu-item="" type="button" onClick={onSelect}>
        {children}
      </button>
    ),
    ContextMenuSeparator: () => null,
    ContextMenuSub: pass,
    ContextMenuSubTrigger: ({ children }: { children?: ReactNode }) => (
      <div data-sub-trigger="">{children}</div>
    ),
    ContextMenuSubContent: ({ children }: { children?: ReactNode }) => (
      <div data-sub-content="">{children}</div>
    ),
  };
});

import { CalendarEventContextMenu } from "@/components/calendar/calendar_event_context_menu";
import {
  EVENT_COLOR_OPTIONS,
  resolve_event_color,
} from "@/components/calendar/calendar_utils";

const CALENDAR: DecryptedCalendar = {
  id: "cal-1",
  name: "Personal",
  color: "#2563eb",
  icon: "calendar" as DecryptedCalendar["icon"],
  is_visible: true,
  is_default: true,
};

const WORK: DecryptedCalendar = { ...CALENDAR, id: "cal-2", name: "Work" };

function make_event(
  overrides: Partial<DecryptedCalendarEvent>,
): DecryptedCalendarEvent {
  return {
    id: "6f1c1d1e-0000-4000-8000-000000000001",
    calendar_id: "cal-1",
    title: "Event",
    color: null,
    event_kind: "default",
    is_completed: false,
    ...overrides,
  } as DecryptedCalendarEvent;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function make_actions(
  read_only_color?: CalendarEventMenuActions["read_only_color"],
): CalendarEventMenuActions {
  return {
    on_copy_link: vi.fn(),
    on_delete_request: vi.fn(),
    on_duplicate: vi.fn(),
    on_edit: vi.fn(),
    on_move_to_calendar: vi.fn(),
    on_open: vi.fn(),
    on_set_color: vi.fn(),
    on_toggle_task_done: vi.fn(),
    read_only_color,
  };
}

function render(
  event: DecryptedCalendarEvent,
  actions: CalendarEventMenuActions,
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <CalendarEventContextMenu
        actions={actions}
        calendars={[CALENDAR, WORK]}
        event={event}
        t={(key) => key}
      >
        <div data-chip="">{event.title}</div>
      </CalendarEventContextMenu>,
    ),
  );
}

function items(): HTMLButtonElement[] {
  return Array.from(
    container!.querySelectorAll<HTMLButtonElement>("[data-menu-item]"),
  );
}

function item(label: string): HTMLButtonElement | undefined {
  return items().find((button) => button.textContent?.includes(label));
}

function color_items(): HTMLButtonElement[] {
  const subs = Array.from(
    container!.querySelectorAll<HTMLElement>("[data-sub-content]"),
  );
  const color_sub = subs.find((sub) =>
    sub.textContent?.includes("calendar.color_calendar_default"),
  )!;

  return Array.from(
    color_sub.querySelectorAll<HTMLButtonElement>("[data-menu-item]"),
  );
}

function checked_label(): string | null {
  const checked = color_items().find(
    (button) => button.querySelector("svg") !== null,
  );

  return checked?.textContent ?? null;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("CalendarEventContextMenu color", () => {
  it("recolors an event you own with a hex value", () => {
    const actions = make_actions();
    const event = make_event({ color: null });

    render(event, actions);

    expect(item("common.edit")).toBeDefined();
    expect(item("common.delete")).toBeDefined();
    expect(color_items()).toHaveLength(EVENT_COLOR_OPTIONS.length + 1);

    act(() => color_items()[3].click());

    expect(actions.on_set_color).toHaveBeenCalledWith(
      event,
      EVENT_COLOR_OPTIONS[2].hex,
    );
  });

  it("offers a color for a holiday without edit, move, or delete", () => {
    const read_only_color = vi.fn(() => ({
      override: EVENT_COLOR_OPTIONS[4].hex,
      fallback: "#0b8043",
    }));
    const actions = make_actions(read_only_color);
    const holiday = make_event({
      id: "holiday-us-2026-12-25-Christmas Day",
      calendar_id: "__holidays__",
      color: "#0b8043",
    });

    render(holiday, actions);

    expect(read_only_color).toHaveBeenCalledWith(holiday);
    expect(item("common.edit")).toBeUndefined();
    expect(item("common.delete")).toBeUndefined();
    expect(item("Work")).toBeUndefined();
    expect(checked_label()).toContain(EVENT_COLOR_OPTIONS[4].name_key);

    act(() => color_items()[2].click());
    expect(actions.on_set_color).toHaveBeenCalledWith(
      holiday,
      EVENT_COLOR_OPTIONS[1].hex,
    );

    act(() => color_items()[0].click());
    expect(actions.on_set_color).toHaveBeenLastCalledWith(holiday, null);
  });

  it("shows a task's real default color and lets you change it", () => {
    const actions = make_actions();
    const red: DecryptedCalendar = { ...CALENDAR, color: "#d50000" };
    const task = make_event({ event_kind: "task", color: null });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
      root!.render(
        <CalendarEventContextMenu
          actions={actions}
          calendars={[red, WORK]}
          event={task}
          t={(key) => key}
        >
          <div data-chip="">{task.title}</div>
        </CalendarEventContextMenu>,
      ),
    );

    const default_dot = color_items()[0].querySelector<HTMLElement>("span");

    expect(default_dot?.getAttribute("style")).toContain(
      resolve_event_color(task, red.color),
    );
    expect(checked_label()).toContain("calendar.color_calendar_default");

    act(() => color_items()[2].click());
    expect(actions.on_set_color).toHaveBeenCalledWith(
      task,
      EVENT_COLOR_OPTIONS[1].hex,
    );
  });

  it("marks the default color for a subscribed event with no override", () => {
    const actions = make_actions(() => ({
      override: null,
      fallback: "#3b82f6",
    }));

    render(
      make_event({
        id: "subscription-sub-1-uid-42",
        calendar_id: "__subscription_sub-1__",
        color: "#3b82f6",
      }),
      actions,
    );

    expect(item("common.edit")).toBeUndefined();
    expect(checked_label()).toContain("calendar.color_calendar_default");
  });
});
