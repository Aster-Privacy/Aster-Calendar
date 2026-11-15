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

import { CalendarMonthView } from "./calendar_month_view";
import { CalendarTimeGridView } from "./calendar_time_grid_view";
import { CalendarAgendaView } from "./calendar_agenda_view";

import {
  build_merged_preferences,
  DEFAULT_PREFERENCES,
} from "@/services/api/preferences";

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

const EVENTS = [
  make_event(
    "past_timed",
    new Date(2026, 10, 12, 8),
    new Date(2026, 10, 12, 9),
    false,
  ),
  make_event(
    "future_timed",
    new Date(2026, 10, 12, 15),
    new Date(2026, 10, 12, 16),
    false,
  ),
  make_event(
    "past_all_day",
    new Date(2026, 10, 10),
    new Date(2026, 10, 10, 23, 59, 59, 999),
    true,
  ),
  make_event(
    "future_all_day",
    new Date(2026, 10, 13),
    new Date(2026, 10, 13, 23, 59, 59, 999),
    true,
  ),
];

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

function is_faded(element: HTMLElement): boolean {
  const nodes = [
    element,
    ...Array.from(element.querySelectorAll<HTMLElement>("*")),
  ];

  return nodes.some(
    (node) =>
      node.style.filter === "saturate(0.6)" || node.style.opacity === "0.75",
  );
}

function fading_of(host: HTMLElement, id: string): boolean[] {
  return Array.from(
    host.querySelectorAll<HTMLElement>(`[data-event-id="${id}"]`),
  ).map(is_faded);
}

function render_month(dim_past_events?: boolean): HTMLDivElement {
  const anchor = new Date(2026, 10, 12);

  return render(
    <CalendarMonthView
      show_weekends
      alternate_calendar=""
      anchor_date={anchor}
      calendar_by_id={new Map([["cal", CALENDAR]])}
      calendars={[CALENDAR]}
      default_duration_minutes={60}
      dim_past_events={dim_past_events}
      draft_day={null}
      event_menu_actions={MENU_ACTIONS}
      events={EVENTS}
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

function render_time_grid(
  dim_past_events: boolean,
  is_single_day: boolean,
): HTMLDivElement {
  const anchor = new Date(2026, 10, 12);

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
      dim_past_events={dim_past_events}
      draft_range={null}
      event_menu_actions={MENU_ACTIONS}
      events={EVENTS}
      is_phone={false}
      is_single_day={is_single_day}
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

function render_agenda(dim_past_events?: boolean): HTMLDivElement {
  return render(
    <CalendarAgendaView
      calendar_by_id={new Map([["cal", CALENDAR]])}
      calendars={[CALENDAR]}
      dim_past_events={dim_past_events}
      event_menu_actions={MENU_ACTIONS}
      events={EVENTS}
      on_event_click={noop}
      range_end={new Date(2026, 10, 15)}
      range_start={new Date(2026, 10, 8)}
      selected_event_id={null}
      t={translate as never}
      time_format="12h"
    />,
  );
}

const default_fading = DEFAULT_PREFERENCES.calendar_fade_past_events;

describe("past event fading preference", () => {
  it("fades past events by default", () => {
    expect(default_fading).toBe(true);
  });

  it("ignores the earlier off value that every saved blob carried", () => {
    const merged = build_merged_preferences(
      { calendar_dim_past_events: false },
      null,
    );

    expect(merged.calendar_fade_past_events).toBe(true);
  });

  it("keeps a saved choice to stop fading", () => {
    const merged = build_merged_preferences(
      { calendar_fade_past_events: false },
      null,
    );

    expect(merged.calendar_fade_past_events).toBe(false);
  });
});

describe("past event fading in every view", () => {
  it("fades past timed and all-day events in month view", () => {
    const host = render_month(default_fading);

    expect(fading_of(host, "past_timed")).toEqual([true]);
    expect(fading_of(host, "past_all_day")).toEqual([true]);
    expect(fading_of(host, "future_timed")).toEqual([false]);
    expect(fading_of(host, "future_all_day")).toEqual([false]);
  });

  it("fades past events in month view when no setting is passed", () => {
    const host = render_month();

    expect(fading_of(host, "past_timed")).toEqual([true]);
  });

  it("fades past timed and all-day events in week view", () => {
    const host = render_time_grid(default_fading, false);

    expect(fading_of(host, "past_timed")).toContain(true);
    expect(fading_of(host, "past_all_day")).toContain(true);
    expect(fading_of(host, "future_timed")).not.toContain(true);
    expect(fading_of(host, "future_all_day")).not.toContain(true);
  });

  it("fades past timed events in day view", () => {
    const host = render_time_grid(default_fading, true);

    expect(fading_of(host, "past_timed")).toContain(true);
    expect(fading_of(host, "future_timed")).not.toContain(true);
  });

  it("fades past events in the schedule view", () => {
    const host = render_agenda(default_fading);

    expect(fading_of(host, "past_timed")).toEqual([true]);
    expect(fading_of(host, "past_all_day")).toEqual([true]);
    expect(fading_of(host, "future_timed")).toEqual([false]);
    expect(fading_of(host, "future_all_day")).toEqual([false]);
  });

  it("shows past events in full color in month view when fading is off", () => {
    expect(fading_of(render_month(false), "past_timed")).toEqual([false]);
  });

  it("shows past events in full color in week view when fading is off", () => {
    expect(fading_of(render_time_grid(false, false), "past_timed")).not.toContain(
      true,
    );
  });

  it("shows past events in full color in the schedule view when fading is off", () => {
    expect(fading_of(render_agenda(false), "past_timed")).toEqual([false]);
  });
});
