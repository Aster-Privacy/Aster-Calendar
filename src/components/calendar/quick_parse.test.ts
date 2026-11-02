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
import { describe, expect, it } from "vitest";

import { build_names, parse_quick_input } from "./quick_parse";

const reference = new Date(2026, 8, 16, 10, 0, 0, 0);

function parse(input: string) {
  return parse_quick_input(input, { reference });
}

describe("parse_quick_input", () => {
  it("leaves plain text untouched", () => {
    const result = parse("Team sync");

    expect(result.title).toBe("Team sync");
    expect(result.has_match).toBe(false);
    expect(result.start_minutes).toBeNull();
    expect(result.date).toBeNull();
  });

  it("reads a meridiem time and defaults the duration", () => {
    const result = parse("Coffee at 3pm");

    expect(result.title).toBe("Coffee");
    expect(result.start_minutes).toBe(15 * 60);
    expect(result.end_minutes).toBe(16 * 60);
  });

  it("reads a time range that only carries one meridiem", () => {
    const result = parse("Design review 3-4:30pm");

    expect(result.title).toBe("Design review");
    expect(result.start_minutes).toBe(15 * 60);
    expect(result.end_minutes).toBe(16 * 60 + 30);
  });

  it("reads a 24 hour time", () => {
    const result = parse("Standup 09:15");

    expect(result.title).toBe("Standup");
    expect(result.start_minutes).toBe(9 * 60 + 15);
  });

  it("applies an explicit duration", () => {
    const result = parse("Call at 9am for 30 min");

    expect(result.title).toBe("Call");
    expect(result.start_minutes).toBe(9 * 60);
    expect(result.end_minutes).toBe(9 * 60 + 30);
  });

  it("reads tomorrow", () => {
    const result = parse("Dentist tomorrow at 11am");

    expect(result.title).toBe("Dentist");
    expect(result.date?.getDate()).toBe(17);
    expect(result.start_minutes).toBe(11 * 60);
  });

  it("reads the upcoming weekday", () => {
    const result = parse("Gym monday 7am");

    expect(result.title).toBe("Gym");
    expect(result.date?.getDay()).toBe(1);
    expect(result.date?.getDate()).toBe(21);
  });

  it("pushes next weekday forward a week when it matches today", () => {
    const result = parse("Retro next wednesday");

    expect(result.date?.getDate()).toBe(23);
  });

  it("reads a month and day", () => {
    const result = parse("Flight Oct 4 at 6pm");

    expect(result.title).toBe("Flight");
    expect(result.date?.getMonth()).toBe(9);
    expect(result.date?.getDate()).toBe(4);
    expect(result.start_minutes).toBe(18 * 60);
  });

  it("rolls a past month and day into next year", () => {
    const result = parse("Taxes Jan 5");

    expect(result.date?.getFullYear()).toBe(2027);
    expect(result.date?.getMonth()).toBe(0);
  });

  it("reads a numeric date in month first order", () => {
    const result = parse("Trip 12/25");

    expect(result.date?.getMonth()).toBe(11);
    expect(result.date?.getDate()).toBe(25);
  });

  it("reads a numeric date in day first order for other languages", () => {
    const result = parse_quick_input("Reise 25/12", {
      language: "de",
      reference,
    });

    expect(result.date?.getMonth()).toBe(11);
    expect(result.date?.getDate()).toBe(25);
  });

  it("marks an all day event", () => {
    const result = parse("Conference all day friday");

    expect(result.title).toBe("Conference");
    expect(result.is_all_day).toBe(true);
    expect(result.date?.getDay()).toBe(5);
  });

  it("drops the all day flag when a time is given", () => {
    const result = parse("Offsite all day at 9am");

    expect(result.is_all_day).toBe(false);
    expect(result.start_minutes).toBe(9 * 60);
  });

  it("reads noon and midnight", () => {
    expect(parse("Lunch at noon").start_minutes).toBe(12 * 60);
    expect(parse("Deploy midnight").start_minutes).toBe(0);
  });

  it("gives tonight an evening start", () => {
    const result = parse("Dinner tonight");

    expect(result.start_minutes).toBe(19 * 60);
    expect(result.date?.getDate()).toBe(16);
  });

  it("keeps digits that are part of the title", () => {
    const result = parse("Review Q3 numbers");

    expect(result.title).toBe("Review Q3 numbers");
    expect(result.start_minutes).toBeNull();
  });

  it("reads a bare hour after at", () => {
    const result = parse("Walk at 5");

    expect(result.title).toBe("Walk");
    expect(result.start_minutes).toBe(17 * 60);
  });

  it("clamps an end time to the end of the day", () => {
    const result = parse("Watch at 11:45pm");

    expect(result.end_minutes).toBe(1440);
  });

  it("trims separators around the title", () => {
    expect(parse(" - , Lunch ; : at 1pm").title).toBe("Lunch");
    expect(parse("Lunch 1 am - 2 pm").start_minutes).toBe(60);
  });

  it("stays linear on long separator and whitespace runs", () => {
    const hostile_inputs = [
      `${",".repeat(60000)}x`,
      `${", ;".repeat(30000)}x`,
      `1${" ".repeat(60000)}x`,
      `a${"-".repeat(60000)}b`,
    ];
    const started = performance.now();

    for (const input of hostile_inputs) {
      parse(input);
    }

    expect(performance.now() - started).toBeLessThan(1500);
  });
});

describe("build_names", () => {
  it("memoizes the name tables per language and kind", () => {
    const first = build_names("fr", "weekday");

    expect(build_names("fr", "weekday")).toBe(first);
    expect(build_names("fr", "month")).not.toBe(first);
    expect(build_names("de", "weekday")).not.toBe(first);
    expect(first).toHaveLength(7);
    expect(first[0]).toContain("dimanche");
  });
});
