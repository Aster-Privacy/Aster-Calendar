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

import { describe, expect, it } from "vitest";

import {
  add_months,
  add_years,
  assign_overlap_columns,
  merge_by_id,
  event_occurs_on,
  format_alternate_day,
  build_custom_days,
  build_month_grid,
  build_year_months,
  clamp_custom_view_days,
  get_event_day_bounds,
  get_visible_range,
  next_agenda_day_count,
  AGENDA_DAY_COUNT,
  AGENDA_MAX_DAY_COUNT,
  iso_week_number,
  trim_month_grid,
  MAX_CUSTOM_VIEW_DAYS,
  MIN_CUSTOM_VIEW_DAYS,
  build_week_days,
  week_start_day_index,
  ink_on_fill,
  build_event_block_style,
  grid_contains_day,
  is_offset_in_view,
  event_color_token,
  nearest_event_color,
  resolve_event_color,
} from "@/components/calendar/calendar_utils";
import { BIRTHDAY_COLOR } from "@/services/calendar/birthdays";

function timed_event(
  id: string,
  start: Date,
  end: Date,
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  return {
    id,
    calendar_id: "calendar_1",
    title: id,
    description: "",
    location: "",
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    is_all_day: false,
    status: "confirmed",
    attendees: [],
    tags: [],
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
    reminder_minutes: null,
    recurrence: null,
    recurrence_exceptions: [],
    recurrence_master_id: null,
    occurrence_start: null,
    created_at: start.toISOString(),
    updated_at: start.toISOString(),
    ...overrides,
  };
}

describe("week_start_day_index", () => {
  it("maps the stored preference to a weekday index", () => {
    expect(week_start_day_index("sunday")).toBe(0);
    expect(week_start_day_index("monday")).toBe(1);
    expect(week_start_day_index("saturday")).toBe(6);
    expect(week_start_day_index(undefined)).toBe(0);
  });
});

describe("build_week_days", () => {
  it("starts the week on the configured day", () => {
    const anchor = new Date(2026, 6, 29);

    expect(build_week_days(anchor, 0)[0].getDay()).toBe(0);
    expect(build_week_days(anchor, 1)[0].getDay()).toBe(1);
    expect(build_week_days(anchor, 6)[0].getDay()).toBe(6);
  });

  it("never starts a week after the anchor day", () => {
    const anchor = new Date(2026, 6, 29);
    const days = build_week_days(anchor, 6);

    expect(days[0].getTime()).toBeLessThanOrEqual(anchor.getTime());
    expect(days).toHaveLength(7);
  });
});

describe("trim_month_grid", () => {
  it("drops a trailing week that holds no day of the month", () => {
    const anchor = new Date(2026, 6, 1);
    const trimmed = trim_month_grid(build_month_grid(anchor, 0), anchor);

    expect(trimmed).toHaveLength(35);
    expect(trimmed[trimmed.length - 1].getDate()).toBe(1);
    expect(trimmed[trimmed.length - 1].getMonth()).toBe(7);
  });

  it("keeps six weeks when the month needs them", () => {
    const anchor = new Date(2026, 7, 1);

    expect(trim_month_grid(build_month_grid(anchor, 0), anchor)).toHaveLength(
      42,
    );
  });

  it("never trims below a single week", () => {
    const anchor = new Date(2026, 6, 1);

    expect(trim_month_grid([new Date(2026, 0, 1)], anchor)).toHaveLength(1);
  });

  it("stops trimming at the first week that touches the month", () => {
    const anchor = new Date(2026, 1, 1);
    const trimmed = trim_month_grid(build_month_grid(anchor, 0), anchor);

    expect(trimmed).toHaveLength(28);
    expect(trimmed[0].getDate()).toBe(1);
    expect(trimmed[trimmed.length - 1].getDate()).toBe(28);
  });
});

describe("clamp_custom_view_days", () => {
  it("keeps values inside the supported range", () => {
    expect(clamp_custom_view_days(4)).toBe(4);
    expect(clamp_custom_view_days(28)).toBe(28);
  });

  it("clamps values outside the supported range", () => {
    expect(clamp_custom_view_days(0)).toBe(MIN_CUSTOM_VIEW_DAYS);
    expect(clamp_custom_view_days(-5)).toBe(MIN_CUSTOM_VIEW_DAYS);
    expect(clamp_custom_view_days(500)).toBe(MAX_CUSTOM_VIEW_DAYS);
  });

  it("falls back to four days for non finite input", () => {
    expect(clamp_custom_view_days(Number.NaN)).toBe(4);
  });
});

describe("build_custom_days", () => {
  it("starts at the anchor day and runs forward", () => {
    const days = build_custom_days(new Date(2026, 0, 21, 15, 30), 4);

    expect(days).toHaveLength(4);
    expect(days[0].getDate()).toBe(21);
    expect(days[0].getHours()).toBe(0);
    expect(days[3].getDate()).toBe(24);
  });

  it("crosses month boundaries", () => {
    const days = build_custom_days(new Date(2026, 0, 30), 4);

    expect(days.map((day) => day.getMonth())).toEqual([0, 0, 1, 1]);
    expect(days[3].getDate()).toBe(2);
  });
});

describe("build_year_months", () => {
  it("returns the twelve first-of-month dates for the anchor year", () => {
    const months = build_year_months(new Date(2026, 6, 31));

    expect(months).toHaveLength(12);
    expect(months.every((month) => month.getFullYear() === 2026)).toBe(true);
    expect(months.every((month) => month.getDate() === 1)).toBe(true);
    expect(months[0].getMonth()).toBe(0);
    expect(months[11].getMonth()).toBe(11);
  });
});

describe("add_years", () => {
  it("moves the anchor by whole years", () => {
    expect(add_years(new Date(2026, 6, 15), 1).getFullYear()).toBe(2027);
    expect(add_years(new Date(2026, 6, 15), -2).getFullYear()).toBe(2024);
  });

  it("clamps a leap day into a non leap year", () => {
    const shifted = add_years(new Date(2024, 1, 29), 1);

    expect(shifted.getMonth()).toBe(1);
    expect(shifted.getDate()).toBe(28);
  });
});

describe("get_visible_range", () => {
  it("spans the whole calendar year in year view", () => {
    const { range_start, range_end } = get_visible_range(
      new Date(2026, 6, 15),
      "year",
      0,
    );

    expect(range_start.getMonth()).toBe(0);
    expect(range_start.getDate()).toBe(1);
    expect(range_end.getMonth()).toBe(11);
    expect(range_end.getDate()).toBe(31);
    expect(range_end.getHours()).toBe(23);
  });

  it("spans exactly the requested day count in custom view", () => {
    const { range_start, range_end } = get_visible_range(
      new Date(2026, 0, 21),
      "custom",
      0,
      3,
    );

    expect(range_start.getDate()).toBe(21);
    expect(range_end.getDate()).toBe(23);
  });

  it("clamps an out of range custom day count", () => {
    const { range_start, range_end } = get_visible_range(
      new Date(2026, 0, 21),
      "custom",
      0,
      900,
    );

    const span_days = Math.floor(
      (range_end.getTime() - range_start.getTime()) / 86_400_000,
    );

    expect(span_days).toBe(MAX_CUSTOM_VIEW_DAYS - 1);
  });
});

describe("next_agenda_day_count", () => {
  it("doubles the agenda span until it reaches the cap", () => {
    expect(next_agenda_day_count(AGENDA_DAY_COUNT)).toBe(AGENDA_DAY_COUNT * 2);
    expect(next_agenda_day_count(600)).toBe(AGENDA_MAX_DAY_COUNT);
    expect(next_agenda_day_count(AGENDA_MAX_DAY_COUNT)).toBe(
      AGENDA_MAX_DAY_COUNT,
    );
  });
});

describe("format_alternate_day", () => {
  it("returns nothing when no alternate calendar is selected", () => {
    expect(
      format_alternate_day(new Date("2026-07-31T12:00:00Z"), "none", "en"),
    ).toBe("");
  });

  it("returns a day number for a supported calendar system", () => {
    const value = format_alternate_day(
      new Date("2026-07-31T12:00:00Z"),
      "islamic",
      "en",
    );

    expect(value).toMatch(/^\d+$/);
  });

  it("ignores unknown calendar systems", () => {
    expect(
      format_alternate_day(new Date("2026-07-31T12:00:00Z"), "martian", "en"),
    ).toBe("");
  });
});

describe("add_months", () => {
  it("clamps to the last day of a shorter target month", () => {
    const result = add_months(new Date(2026, 0, 31), 1);

    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(28);
  });

  it("lands on the correct month every step when navigating from a 31st", () => {
    let cursor = new Date(2026, 0, 31);
    const months: number[] = [];

    for (let step = 0; step < 6; step += 1) {
      cursor = add_months(cursor, 1);
      months.push(cursor.getMonth());
    }

    expect(months).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("moves backward without skipping a month", () => {
    const result = add_months(new Date(2026, 2, 31), -1);

    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(28);
  });
});

describe("iso_week_number", () => {
  it("puts new year thursday in week one", () => {
    expect(iso_week_number(new Date(2026, 0, 1))).toBe(1);
  });

  it("assigns the late-december days of a prior year to week one", () => {
    expect(iso_week_number(new Date(2025, 11, 29))).toBe(1);
  });

  it("returns week fifty three for a year that ends on a thursday", () => {
    expect(iso_week_number(new Date(2026, 11, 31))).toBe(53);
  });
});

describe("event_occurs_on", () => {
  const day = new Date(2026, 2, 10);

  it("includes an event that starts and ends within the day", () => {
    const event = timed_event(
      "a",
      new Date(2026, 2, 10, 9, 0),
      new Date(2026, 2, 10, 10, 0),
    );

    expect(event_occurs_on(event, day)).toBe(true);
  });

  it("includes a multi day event spanning across the day", () => {
    const event = timed_event(
      "b",
      new Date(2026, 2, 9, 22, 0),
      new Date(2026, 2, 11, 2, 0),
    );

    expect(event_occurs_on(event, day)).toBe(true);
  });

  it("excludes an event whose end coincides with midnight start", () => {
    const event = timed_event(
      "c",
      new Date(2026, 2, 9, 22, 0),
      new Date(2026, 2, 10, 0, 0),
    );

    expect(event_occurs_on(event, day)).toBe(false);
  });

  it("includes a zero duration event landing inside the day", () => {
    const event = timed_event(
      "d",
      new Date(2026, 2, 10, 9, 0),
      new Date(2026, 2, 10, 9, 0),
    );

    expect(event_occurs_on(event, day)).toBe(true);
  });
});

describe("get_event_day_bounds", () => {
  const day = new Date(2026, 2, 10);

  it("returns minute offsets for an event inside the day", () => {
    const event = timed_event(
      "a",
      new Date(2026, 2, 10, 9, 0),
      new Date(2026, 2, 10, 10, 30),
    );

    expect(get_event_day_bounds(event, day)).toEqual({
      start_minute: 540,
      end_minute: 630,
    });
  });

  it("clamps a spanning event to the full day", () => {
    const event = timed_event(
      "b",
      new Date(2026, 2, 9, 20, 0),
      new Date(2026, 2, 11, 4, 0),
    );

    expect(get_event_day_bounds(event, day)).toEqual({
      start_minute: 0,
      end_minute: 1440,
    });
  });

  it("enforces a minimum fifteen minute height", () => {
    const event = timed_event(
      "c",
      new Date(2026, 2, 10, 9, 0),
      new Date(2026, 2, 10, 9, 0),
    );

    expect(get_event_day_bounds(event, day)).toEqual({
      start_minute: 540,
      end_minute: 555,
    });
  });
});

describe("assign_overlap_columns", () => {
  const day = new Date(2026, 2, 10);

  function at(hour: number, minute = 0): Date {
    return new Date(2026, 2, 10, hour, minute);
  }

  it("gives separated events their own single column clusters", () => {
    const layout = assign_overlap_columns(
      [timed_event("a", at(9), at(10)), timed_event("b", at(11), at(12))],
      day,
    );

    expect(layout.get("a")).toMatchObject({
      column: 0,
      column_count: 1,
      cluster_index: 0,
    });
    expect(layout.get("b")).toMatchObject({
      column: 0,
      column_count: 1,
      cluster_index: 1,
    });
  });

  it("packs two overlapping events into side by side columns", () => {
    const layout = assign_overlap_columns(
      [timed_event("a", at(9), at(10, 30)), timed_event("b", at(10), at(11))],
      day,
    );

    expect(layout.get("a")).toMatchObject({ column: 0, column_count: 2 });
    expect(layout.get("b")).toMatchObject({ column: 1, column_count: 2 });
  });

  it("keeps a transitive overlap chain in one cluster and reuses a column", () => {
    const layout = assign_overlap_columns(
      [
        timed_event("a", at(9), at(10)),
        timed_event("b", at(9, 30), at(11)),
        timed_event("c", at(10, 30), at(11, 30)),
      ],
      day,
    );

    expect(layout.get("a")).toMatchObject({
      column: 0,
      column_count: 2,
      cluster_index: 0,
      cluster_size: 3,
    });
    expect(layout.get("b")).toMatchObject({ column: 1, column_count: 2 });
    expect(layout.get("c")).toMatchObject({ column: 0, column_count: 2 });
  });

  it("widens an event into free columns to its right", () => {
    const layout = assign_overlap_columns(
      [
        timed_event("a", at(9), at(12)),
        timed_event("b", at(9), at(10)),
        timed_event("c", at(9), at(10)),
        timed_event("d", at(11), at(12)),
      ],
      day,
    );

    expect(layout.get("a")).toMatchObject({ column: 0, column_count: 3 });
    expect(layout.get("b")).toMatchObject({ column: 1, span: 1 });
    expect(layout.get("c")).toMatchObject({ column: 2, span: 1 });
    expect(layout.get("d")).toMatchObject({ column: 1, span: 2 });
  });

  it("omits all day events from the timed layout", () => {
    const layout = assign_overlap_columns(
      [timed_event("a", at(9), at(10), { is_all_day: true })],
      day,
    );

    expect(layout.size).toBe(0);
  });

  it("caps a dense cluster at three columns and stacks the overflow", () => {
    const layout = assign_overlap_columns(
      [
        timed_event("a", at(13), at(16, 45)),
        timed_event("b", at(14), at(16, 30)),
        timed_event("c", at(15, 15), at(15, 45)),
        timed_event("d", at(15, 30), at(16, 30)),
        timed_event("e", at(16), at(17)),
      ],
      day,
    );

    const placements = ["a", "b", "c", "d", "e"].map((id) => layout.get(id)!);

    for (const placement of placements) {
      expect(placement.column_count).toBeLessThanOrEqual(3);
      expect(placement.column_count).toBe(placements[0].column_count);
      expect(placement.column).toBeLessThan(placement.column_count);
      expect(placement.span).toBeGreaterThanOrEqual(1);
    }

    expect(layout.get("a")).toMatchObject({ column: 0, stack_depth: 0 });
    expect(layout.get("b")).toMatchObject({ column: 1, stack_depth: 0 });
    expect(layout.get("c")).toMatchObject({ column: 2, stack_depth: 0 });
    expect(layout.get("d")).toMatchObject({
      column: 0,
      stack_depth: 1,
      span: 1,
    });
    expect(layout.get("e")).toMatchObject({ column: 2, stack_depth: 0 });
  });

  it("stacks the later start onto the column with the most title clearance", () => {
    const layout = assign_overlap_columns(
      [
        timed_event("a", at(9), at(12)),
        timed_event("b", at(10, 30), at(12)),
        timed_event("c", at(10, 45), at(12)),
        timed_event("d", at(11), at(12)),
      ],
      day,
    );

    expect(layout.get("d")).toMatchObject({
      column: 0,
      stack_depth: 1,
      column_count: 3,
    });
    expect(layout.get("d")!.order).toBeGreaterThan(layout.get("a")!.order);
  });

  it("never grows past the cap no matter how many events overlap", () => {
    const layout = assign_overlap_columns(
      Array.from({ length: 8 }, (_, index) =>
        timed_event(`e${index}`, at(9, index * 5), at(11)),
      ),
      day,
    );

    for (const placement of layout.values()) {
      expect(placement.column_count).toBe(3);
      expect(placement.column).toBeLessThan(3);
    }

    const depths = [...layout.values()].map(
      (placement) => placement.stack_depth,
    );

    expect(Math.max(...depths)).toBeGreaterThan(0);
    expect(Math.max(...depths)).toBeLessThanOrEqual(2);
  });

  it("honors a custom column cap", () => {
    const layout = assign_overlap_columns(
      [
        timed_event("a", at(9), at(10)),
        timed_event("b", at(9), at(10)),
        timed_event("c", at(9), at(10)),
      ],
      day,
      2,
    );

    expect(layout.get("c")).toMatchObject({ column_count: 2, stack_depth: 1 });
  });
});

describe("merge_by_id", () => {
  const day = new Date(2026, 2, 10);

  function at(hour: number): Date {
    return new Date(2026, 2, 10, hour);
  }

  it("returns the previous array when nothing changed", () => {
    const previous = [
      timed_event("a", at(9), at(10)),
      timed_event("b", at(11), at(12)),
    ];
    const next = previous.map((event) => ({ ...event }));

    expect(merge_by_id(previous, next)).toBe(previous);
    expect(assign_overlap_columns(previous, day).size).toBe(2);
  });

  it("keeps the old object for unchanged entries and swaps changed ones", () => {
    const a = timed_event("a", at(9), at(10));
    const b = timed_event("b", at(11), at(12));
    const previous = [a, b];
    const next_b = {
      ...b,
      title: "renamed",
      updated_at: "2026-03-10T12:00:00Z",
    };
    const merged = merge_by_id(previous, [{ ...a }, next_b]);

    expect(merged).not.toBe(previous);
    expect(merged[0]).toBe(a);
    expect(merged[1]).toBe(next_b);
  });

  it("drops removed entries and appends new ones", () => {
    const a = timed_event("a", at(9), at(10));
    const c = timed_event("c", at(13), at(14));
    const merged = merge_by_id([a, timed_event("b", at(11), at(12))], [a, c]);

    expect(merged.map((event) => event.id)).toEqual(["a", "c"]);
    expect(merged[0]).toBe(a);
  });
});

describe("ink_on_fill", () => {
  it("uses the theme accent ink on the accent fill", () => {
    expect(ink_on_fill("var(--accent-color)")).toBe(
      "var(--accent-fg, #ffffff)",
    );
  });

  it("picks light ink on saturated colors and dark ink on light ones", () => {
    expect(ink_on_fill("#039be5")).toBe("#ffffff");
    expect(ink_on_fill("#3f51b5")).toBe("#ffffff");
    expect(ink_on_fill("#f6bf26")).toBe("#111827");
  });
});

describe("event color palette", () => {
  it("maps a stored swatch hex to its own token", () => {
    expect(event_color_token("#0f766e")).toBe("var(--cal_color_teal)");
    expect(event_color_token("#1D4ED8")).toBe("var(--cal_color_blue)");
    expect(event_color_token("#3b82f6")).toBe("var(--cal_color_blue)");
    expect(event_color_token("#f43f5e")).toBe("var(--cal_color_rose)");
  });

  it("maps unknown hexes to the nearest swatch by hue", () => {
    expect(nearest_event_color("#d50000").name).toBe("red");
    expect(nearest_event_color("#f4511e").name).toBe("orange");
    expect(nearest_event_color("#f6bf26").name).toBe("yellow");
    expect(nearest_event_color("#33b679").name).toBe("emerald");
    expect(nearest_event_color("#039be5").name).toBe("sky");
    expect(nearest_event_color("#3f51b5").name).toBe("indigo");
    expect(nearest_event_color("#8e24aa").name).toBe("fuchsia");
    expect(nearest_event_color("#616161").name).toBe("slate");
    expect(nearest_event_color("rgb(190, 24, 93)").name).toBe("pink");
  });

  it("passes css variables through and falls back to the accent", () => {
    expect(event_color_token("var(--cal_color_sky)")).toBe(
      "var(--cal_color_sky)",
    );
    expect(event_color_token("not a color")).toBe("var(--accent-color)");
    expect(event_color_token(null)).toBe("var(--accent-color)");
  });

  it("uses white text on swatch tokens", () => {
    expect(ink_on_fill("var(--cal_color_amber)")).toBe(
      "var(--calendar_event_text, #ffffff)",
    );
  });

  it("resolves event colors to tokens", () => {
    const start = new Date(2026, 0, 5, 9);
    const end = new Date(2026, 0, 5, 10);
    const explicit = timed_event("a", start, end, { color: "#d50000" });
    const task = timed_event("b", start, end, { event_kind: "task" });
    const plain = timed_event("c", start, end);

    expect(resolve_event_color(explicit, "#2563eb")).toBe(
      "var(--cal_color_red)",
    );
    expect(resolve_event_color(task, "#2563eb")).toBe("var(--cal_color_sky)");
    expect(
      resolve_event_color(
        timed_event("d", start, end, { event_kind: "birthday" }),
        "#2563eb",
      ),
    ).toBe(event_color_token(BIRTHDAY_COLOR));
    expect(resolve_event_color(plain, "#15803d")).toBe(
      "var(--cal_color_green)",
    );
    expect(resolve_event_color(plain, undefined)).toBe("var(--accent-color)");
  });

  it("builds solid blocks with the shared radius and a past fade", () => {
    const style = build_event_block_style("#be123c", { is_past: true });

    expect(style["--cal_color"]).toBe("var(--cal_color_rose)");
    expect(style.backgroundColor).toBe("var(--cal_color)");
    expect(style.borderRadius).toBe("var(--calendar_event_radius, 6px)");
    expect(style.borderInlineStart).toBeUndefined();
    expect(style.boxShadow).toBe("0 0 0 1px var(--bg-primary)");
    expect(style.opacity).toBeUndefined();
    expect(style.filter).toBe("saturate(0.45)");
    expect(style.outline).toBeUndefined();
    expect(
      build_event_block_style("#be123c", { is_active: true }).outline,
    ).toBe("2px solid var(--accent-color)");
  });
});

describe("is_offset_in_view", () => {
  it("is true when the offset sits inside the scrolled viewport", () => {
    expect(is_offset_in_view(500, 400, 300)).toBe(true);
    expect(is_offset_in_view(400, 400, 300)).toBe(true);
    expect(is_offset_in_view(700, 400, 300)).toBe(true);
  });

  it("is false above or below the viewport", () => {
    expect(is_offset_in_view(399, 400, 300)).toBe(false);
    expect(is_offset_in_view(701, 400, 300)).toBe(false);
  });

  it("respects the margin on both edges", () => {
    expect(is_offset_in_view(404, 400, 300, 8)).toBe(false);
    expect(is_offset_in_view(408, 400, 300, 8)).toBe(true);
    expect(is_offset_in_view(696, 400, 300, 8)).toBe(false);
  });
});

describe("grid_contains_day", () => {
  it("finds today in the grid of its own month", () => {
    const grid = build_month_grid(new Date(2026, 9, 1), 1);

    expect(grid_contains_day(grid, new Date(2026, 9, 10, 15, 30))).toBe(true);
  });

  it("does not find a day two months away", () => {
    const grid = build_month_grid(new Date(2026, 9, 1), 1);

    expect(grid_contains_day(grid, new Date(2026, 11, 10))).toBe(false);
  });
});
