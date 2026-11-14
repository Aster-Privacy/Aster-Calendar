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

import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { CalendarMonthView } from "./calendar_month_view";
import { CalendarTimeGridView } from "./calendar_time_grid_view";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
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
  return key;
}

function chips_of(host: HTMLElement, id: string): HTMLElement[] {
  return Array.from(
    host.querySelectorAll<HTMLElement>(`[data-event-id="${id}"]`),
  );
}

function render_month(events: DecryptedCalendarEvent[]): HTMLDivElement {
  const anchor = new Date(2026, 10, 15);

  return render(
    <CalendarMonthView
      show_weekends
      alternate_calendar=""
      anchor_date={anchor}
      calendar_by_id={new Map([["cal", CALENDAR]])}
      calendars={[CALENDAR]}
      default_duration_minutes={60}
      draft_day={null}
      event_menu_actions={MENU_ACTIONS}
      events={events}
      is_phone={false}
      language="en"
      max_events_per_cell={4}
      on_day_click={noop}
      on_day_double_click={noop}
      on_day_number_click={noop}
      on_event_click={noop}
      on_event_move_day={noop}
      on_range_select={noop}
      on_week_number_click={noop}
      on_wheel_navigate={noop}
      selected_date={anchor}
      selected_event_id={null}
      show_week_numbers={false}
      t={translate as never}
      time_format="12h"
      week_start_day={0}
    />,
  );
}

function render_week(events: DecryptedCalendarEvent[]): HTMLDivElement {
  const anchor = new Date(2026, 10, 11);

  return render(
    <CalendarTimeGridView
      show_weekends
      alternate_calendar=""
      anchor_date={anchor}
      calendar_by_id={new Map([["cal", CALENDAR]])}
      calendars={[CALENDAR]}
      custom_day_count={null}
      default_duration_minutes={60}
      density="responsive"
      dim_non_working_hours={false}
      dim_past_events={false}
      draft_range={null}
      event_menu_actions={MENU_ACTIONS}
      events={events}
      is_phone={false}
      is_single_day={false}
      language="en"
      on_day_number_click={noop}
      on_event_click={noop}
      on_event_reschedule={noop}
      on_range_select={noop}
      on_slot_double_click={noop}
      on_swipe_navigate={noop}
      on_week_number_click={noop}
      recenter_token={0}
      scroll_to_first_event={false}
      secondary_timezone=""
      selected_date={anchor}
      selected_event_id={null}
      short_events_full_size={false}
      show_current_time_indicator={false}
      show_event_location={false}
      show_week_numbers={false}
      split_calendar_order={null}
      t={translate as never}
      time_format="12h"
      week_start_day={0}
      working_days={[1, 2, 3, 4, 5]}
      working_hours_end={17}
      working_hours_start={9}
    />,
  );
}

describe("month view multi-day events", () => {
  it("joins an all-day event into one bar per week row", () => {
    const host = render_month([
      make_event(
        "trip",
        new Date(2026, 10, 12),
        new Date(2026, 10, 17, 23, 59, 59, 999),
        true,
      ),
    ]);
    const segments = chips_of(host, "trip").map((chip) => chip.dataset.segment);

    expect(segments).toEqual([
      "start",
      "middle",
      "end",
      "start",
      "middle",
      "end",
    ]);

    const titled = chips_of(host, "trip").filter((chip) =>
      chip.querySelector("[data-segment-title]"),
    );

    expect(titled).toHaveLength(2);
  });

  it("keeps an event in the same lane while an earlier one ends", () => {
    const host = render_month([
      make_event(
        "early",
        new Date(2026, 10, 8),
        new Date(2026, 10, 9, 23, 59, 59, 999),
        true,
      ),
      make_event(
        "long",
        new Date(2026, 10, 9),
        new Date(2026, 10, 12, 23, 59, 59, 999),
        true,
      ),
    ]);
    const lane_of = (chip: HTMLElement) => {
      let node: HTMLElement = chip;

      while (
        node.parentElement &&
        !node.parentElement.classList.contains("@container")
      ) {
        node = node.parentElement;
      }

      return Array.from(node.parentElement?.children ?? []).indexOf(node);
    };

    expect(chips_of(host, "long").map(lane_of)).toEqual([1, 1, 1, 1]);
  });

  it("joins a timed event that crosses midnight", () => {
    const host = render_month([
      make_event(
        "red_eye",
        new Date(2026, 10, 10, 22),
        new Date(2026, 10, 11, 6),
        false,
      ),
    ]);

    expect(
      chips_of(host, "red_eye").map((chip) => chip.dataset.segment),
    ).toEqual(["start", "end"]);
  });

  it("does not show an exclusive midnight end on the next day", () => {
    const host = render_month([
      make_event("ics", new Date(2026, 10, 10), new Date(2026, 10, 12), true),
    ]);

    expect(chips_of(host, "ics")).toHaveLength(2);
  });
});

describe("week view multi-day events", () => {
  it("shows fully covered days of a timed event in the all-day row", () => {
    const host = render_week([
      make_event(
        "conference",
        new Date(2026, 10, 9, 18),
        new Date(2026, 10, 13, 9),
        false,
      ),
    ]);
    const in_all_day_row = Array.from(
      host.querySelectorAll<HTMLElement>(
        '[data-all-day-column] [data-event-id="conference"]',
      ),
    );

    expect(in_all_day_row).toHaveLength(3);
    expect(in_all_day_row[0].querySelector(".invisible")).toBeNull();
    expect(in_all_day_row[1].querySelector(".invisible")).not.toBeNull();
  });
});
