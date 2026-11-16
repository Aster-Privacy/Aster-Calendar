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
import type { CalendarEventMenuActions } from "@/components/calendar/calendar_event_context_menu";
import type {
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TODAY_MARKER_CLASS } from "@/lib/day_marker";

import { AgendaDateColumn, CalendarAgendaView } from "./calendar_agenda_view";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 12, 12, 0));
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

function noop(): void {}

const MENU_ACTIONS = new Proxy(
  {},
  { get: () => noop },
) as unknown as CalendarEventMenuActions;

const CALENDAR = {
  id: "cal",
  name: "Personal",
  color: "blue",
} as unknown as DecryptedCalendar;

function make_event(
  id: string,
  starts_at: Date,
  ends_at: Date,
  is_all_day: boolean,
): DecryptedCalendarEvent {
  return {
    id,
    calendar_id: "cal",
    title: `Title ${id}`,
    description: "",
    location: "",
    starts_at: starts_at.toISOString(),
    ends_at: ends_at.toISOString(),
    is_all_day,
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
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  } as DecryptedCalendarEvent;
}

function render(node: React.ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));

  return container;
}

function translate(key: string): string {
  return key === "calendar.today" ? "Today" : key;
}

function visible_text(element: Element): string {
  const clone = element.cloneNode(true) as Element;

  clone.querySelectorAll(".sr-only").forEach((node) => node.remove());

  return clone.textContent ?? "";
}

function render_column(day: Date, is_today: boolean, is_past_day = false) {
  return render(
    <AgendaDateColumn
      day={day}
      is_past_day={is_past_day}
      is_today={is_today}
      language="en-US"
      today_label="Today"
    />,
  );
}

describe("agenda date column", () => {
  it("marks today with a solid accent circle and contrast text", () => {
    const host = render_column(new Date(2026, 10, 12), true);
    const number = host.querySelector<HTMLElement>("[data-today]");

    expect(number).not.toBeNull();
    expect(number?.textContent).toBe("12");
    expect(number?.className).toContain("tabular-nums");
    expect(number?.className).toContain("rounded-full");
    expect(number?.className).toContain(TODAY_MARKER_CLASS);
    expect(number?.className).not.toMatch(/aster-selected|opacity|ring/);
    expect(number?.style.color).toBe("");
    expect(visible_text(host)).toBe("12Thu");
    expect(visible_text(host)).not.toMatch(/today/i);
  });

  it("announces today and the full date to screen readers", () => {
    const host = render_column(new Date(2026, 10, 12), true);
    const label = host.querySelector(".sr-only");

    expect(label?.textContent).toBe("Today, Thursday, November 12, 2026");
    host
      .querySelectorAll("[data-testid='agenda-date-column'] > span")
      .forEach((span) => {
        if (!span.classList.contains("sr-only")) {
          expect(span.getAttribute("aria-hidden")).toBe("true");
        }
      });
  });

  it("keeps other days plain and mutes past days", () => {
    const future = render_column(new Date(2026, 10, 14), false);
    const future_number = future.querySelector<HTMLElement>(
      "[data-testid='agenda-date-column'] > span",
    );

    expect(future.querySelector("[data-today]")).toBeNull();
    expect(future_number?.className).not.toMatch(/rounded|bg-/);
    expect(future_number?.style.color).toBe("var(--text-primary)");
    expect(future.querySelector(".sr-only")?.textContent).toBe(
      "Saturday, November 14, 2026",
    );

    act(() => root?.unmount());
    container?.remove();

    const past = render_column(new Date(2026, 10, 10), false, true);
    const past_number = past.querySelector<HTMLElement>(
      "[data-testid='agenda-date-column'] > span",
    );

    expect(past_number?.style.color).toBe("var(--text-muted)");
  });
});

describe("agenda view today row", () => {
  function render_agenda(events: DecryptedCalendarEvent[]): HTMLDivElement {
    return render(
      <CalendarAgendaView
        calendar_by_id={new Map([["cal", CALENDAR]])}
        calendars={[CALENDAR]}
        event_menu_actions={MENU_ACTIONS}
        events={events}
        on_event_click={noop}
        range_end={new Date(2026, 10, 20)}
        range_start={new Date(2026, 10, 8)}
        selected_event_id={null}
        t={translate as never}
        time_format="12h"
      />,
    );
  }

  it("marks only today with aria-current and a solid circle", () => {
    const host = render_agenda([
      make_event(
        "earlier",
        new Date(2026, 10, 10, 9),
        new Date(2026, 10, 10, 10),
        false,
      ),
      make_event(
        "next",
        new Date(2026, 10, 13, 9),
        new Date(2026, 10, 13, 10),
        false,
      ),
    ]);
    const current = host.querySelectorAll("[aria-current='date']");

    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("data-day-key")).toBe("2026-11-12");
    expect(host.querySelectorAll("[data-today]")).toHaveLength(1);
    expect(current[0].querySelector("[data-today]")?.textContent).toBe(
      "12",
    );
    expect(
      host.querySelectorAll("[data-testid='agenda-date-column']"),
    ).toHaveLength(3);
    expect(visible_text(host)).not.toMatch(/today|tomorrow/i);
    host.querySelectorAll("[data-day-key]").forEach((row) => {
      expect(row.className).not.toMatch(/border/);
    });
  });

  it("shows a quiet empty row for today without an icon", () => {
    const host = render_agenda([
      make_event(
        "later",
        new Date(2026, 10, 16, 9),
        new Date(2026, 10, 16, 10),
        false,
      ),
    ]);
    const today_row = host.querySelector("[aria-current='date']");

    expect(today_row?.textContent).toContain("calendar.no_upcoming_events");
    expect(today_row?.querySelector("svg")).toBeNull();
  });
});
