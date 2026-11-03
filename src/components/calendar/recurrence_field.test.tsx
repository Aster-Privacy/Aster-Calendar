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
import type { RecurrenceRule } from "@/types/calendar";

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  RecurrenceField,
  preset_to_rule,
  recurrence_preset,
} from "./recurrence_field";

import { rrule_to_rule, rule_to_rrule } from "@/services/calendar/recurrence";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/calendar/calendar_select", () => ({
  CalendarSelect: ({
    value,
    options,
    on_change,
    aria_label,
  }: {
    value: string;
    options: { value: string; label: string }[];
    on_change: (value: string) => void;
    aria_label?: string;
  }) => (
    <select
      aria-label={aria_label}
      data-testid={`select-${options.map((option) => option.value).join("-")}`}
      value={value}
      onChange={(change_event) => on_change(change_event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("@/components/calendar/date_field", () => ({
  DateField: () => null,
}));

const PRESET_SELECT =
  "[data-testid=select-none-daily-weekly-weekdays-monthly-yearly-custom]";
const START = new Date(2026, 10, 1, 9, 0);
const t = (key: string) => key;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latest: RecurrenceRule | null = null;

function Harness({ initial }: { initial: RecurrenceRule | null }) {
  const [value, set_value] = useState<RecurrenceRule | null>(initial);

  latest = value;

  return (
    <RecurrenceField
      language="en"
      start={START}
      t={t}
      value={value}
      week_start_day={0}
      on_change={set_value}
    />
  );
}

function render(initial: RecurrenceRule | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<Harness initial={initial} />));
}

function preset_select(): HTMLSelectElement {
  return container!.querySelector<HTMLSelectElement>(PRESET_SELECT)!;
}

function choose(preset: string) {
  const select = preset_select();

  act(() => {
    select.value = preset;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function day_buttons(): HTMLButtonElement[] {
  return Array.from(
    container!.querySelectorAll<HTMLButtonElement>("[role=group] button"),
  );
}

function click_day(label: string) {
  const button = day_buttons().find((entry) => entry.textContent === label)!;

  act(() => button.click());
}

function pressed_days(): string[] {
  return day_buttons()
    .filter((entry) => entry.getAttribute("aria-pressed") === "true")
    .map((entry) => entry.textContent ?? "");
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  latest = null;
});

describe("RecurrenceField custom repeat", () => {
  it("opens the custom editor from no repeat", () => {
    render(null);
    expect(preset_select().value).toBe("none");
    expect(day_buttons()).toHaveLength(0);

    choose("custom");

    expect(preset_select().value).toBe("custom");
    expect(day_buttons()).toHaveLength(7);
    expect(pressed_days()).toEqual(["calendar.weekday_sun"]);
    expect(latest).toMatchObject({
      frequency: "weekly",
      interval: 1,
      by_weekday: [0],
    });
  });

  it("opens the custom editor from a simple preset", () => {
    render(null);
    choose("weekly");
    expect(preset_select().value).toBe("weekly");
    expect(day_buttons()).toHaveLength(0);

    choose("custom");

    expect(preset_select().value).toBe("custom");
    expect(day_buttons()).toHaveLength(7);
  });

  it("stays in custom mode while days are toggled", () => {
    render(null);
    choose("custom");

    click_day("calendar.weekday_tue");
    expect(preset_select().value).toBe("custom");
    expect(pressed_days()).toEqual([
      "calendar.weekday_sun",
      "calendar.weekday_tue",
    ]);
    expect(latest?.by_weekday).toEqual([0, 2]);

    click_day("calendar.weekday_tue");
    expect(preset_select().value).toBe("custom");
    expect(latest?.by_weekday).toEqual([0]);
    expect(day_buttons()).toHaveLength(7);
  });

  it("never clears the last selected day", () => {
    render(null);
    choose("custom");
    click_day("calendar.weekday_sun");

    expect(latest?.by_weekday).toEqual([0]);
    expect(pressed_days()).toEqual(["calendar.weekday_sun"]);
  });

  it("leaves custom mode when another preset is chosen", () => {
    render(null);
    choose("custom");
    choose("daily");

    expect(preset_select().value).toBe("daily");
    expect(day_buttons()).toHaveLength(0);
    expect(latest).toMatchObject({ frequency: "daily", by_weekday: [] });
  });

  it("shows custom for an existing custom rule", () => {
    render({
      frequency: "weekly",
      interval: 2,
      by_weekday: [1, 3],
      count: null,
      until: null,
    });

    expect(preset_select().value).toBe("custom");
    expect(pressed_days()).toEqual([
      "calendar.weekday_mon",
      "calendar.weekday_wed",
    ]);
  });

  it("saves a rule that round trips through RRULE", () => {
    render(null);
    choose("custom");
    click_day("calendar.weekday_mon");
    click_day("calendar.weekday_fri");

    const rrule = rule_to_rrule(latest!);

    expect(rrule).toContain("FREQ=WEEKLY");
    expect(rrule).toContain("BYDAY=SU,MO,FR");
    expect(rrule_to_rule(rrule)).toMatchObject({
      frequency: "weekly",
      interval: 1,
      by_weekday: [0, 1, 5],
      count: null,
      until: null,
    });
    expect(recurrence_preset(rrule_to_rule(rrule), START)).toBe("custom");
  });
});

describe("preset_to_rule", () => {
  it("returns a weekly rule on the start day for custom", () => {
    expect(preset_to_rule("custom", START, null)).toEqual({
      frequency: "weekly",
      interval: 1,
      by_weekday: [0],
      count: null,
      until: null,
    });
  });
});
