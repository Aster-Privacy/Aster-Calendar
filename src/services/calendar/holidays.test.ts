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

import { holidays_in_range } from "@/services/calendar/holidays";

function find(
  region: Parameters<typeof holidays_in_range>[0],
  year: number,
  title: string,
) {
  return holidays_in_range(
    region,
    new Date(year, 0, 1),
    new Date(year, 11, 31),
  ).find((holiday) => holiday.title === title);
}

describe("holidays_in_range", () => {
  it("returns nothing for the none region", () => {
    expect(
      holidays_in_range("none", new Date(2026, 0, 1), new Date(2026, 11, 31)),
    ).toHaveLength(0);
  });

  it("computes US floating holidays for 2026", () => {
    expect(find("us", 2026, "Thanksgiving")?.date.getDate()).toBe(26);
    expect(find("us", 2026, "Memorial Day")?.date.getDate()).toBe(25);
    expect(find("us", 2026, "Martin Luther King Jr. Day")?.date.getDate()).toBe(
      19,
    );
  });

  it("computes Easter-based holidays for 2026", () => {
    const good_friday = find("uk", 2026, "Good Friday");

    expect(good_friday?.date.getMonth()).toBe(3);
    expect(good_friday?.date.getDate()).toBe(3);

    const pentecost = find("de", 2026, "Pfingstmontag");

    expect(pentecost?.date.getMonth()).toBe(4);
    expect(pentecost?.date.getDate()).toBe(25);
  });

  it("computes Victoria Day as the Monday before May 25", () => {
    expect(find("ca", 2026, "Victoria Day")?.date.getDate()).toBe(18);
  });

  it("includes national holidays for Portugal and Brazil", () => {
    const corpo_de_deus = find("pt", 2026, "Corpo de Deus");

    expect(corpo_de_deus?.date.getMonth()).toBe(5);
    expect(corpo_de_deus?.date.getDate()).toBe(4);
    expect(find("br", 2026, "Tiradentes")?.date.getDate()).toBe(21);
    expect(
      holidays_in_range("br", new Date(2026, 0, 1), new Date(2026, 11, 31)),
    ).toHaveLength(10);
  });

  it("includes fixed national holidays for India in any year", () => {
    for (const year of [2025, 2030]) {
      const republic_day = find("in", year, "Republic Day");
      const independence_day = find("in", year, "Independence Day");
      const gandhi_jayanti = find("in", year, "Gandhi Jayanti");
      const christmas = find("in", year, "Christmas Day");

      expect([
        republic_day?.date.getMonth(),
        republic_day?.date.getDate(),
      ]).toEqual([0, 26]);
      expect([
        independence_day?.date.getMonth(),
        independence_day?.date.getDate(),
      ]).toEqual([7, 15]);
      expect([
        gandhi_jayanti?.date.getMonth(),
        gandhi_jayanti?.date.getDate(),
      ]).toEqual([9, 2]);
      expect([christmas?.date.getMonth(), christmas?.date.getDate()]).toEqual([
        11, 25,
      ]);
    }
  });

  it("computes Good Friday for India", () => {
    const expected: Array<[number, number, number]> = [
      [2025, 3, 18],
      [2026, 3, 3],
      [2027, 2, 26],
    ];

    for (const [year, month, day] of expected) {
      const good_friday = find("in", year, "Good Friday");

      expect(good_friday?.date.getMonth()).toBe(month);
      expect(good_friday?.date.getDate()).toBe(day);
    }
  });

  it("uses the gazetted dates for lunar festivals in India", () => {
    const expected: Array<[number, string, number, number]> = [
      [2025, "Holi", 2, 14],
      [2025, "Id-ul-Fitr", 2, 31],
      [2025, "Diwali (Deepavali)", 9, 20],
      [2025, "Guru Nanak Jayanti", 10, 5],
      [2026, "Holi", 2, 4],
      [2026, "Ram Navami", 2, 26],
      [2026, "Id-ul-Zuha (Bakrid)", 4, 27],
      [2026, "Diwali (Deepavali)", 10, 8],
      [2027, "Id-ul-Fitr", 2, 10],
      [2027, "Buddha Purnima", 4, 20],
      [2027, "Milad-un-Nabi", 7, 15],
      [2027, "Dussehra", 9, 9],
    ];

    for (const [year, title, month, day] of expected) {
      const holiday = find("in", year, title);

      expect(holiday?.date.getMonth()).toBe(month);
      expect(holiday?.date.getDate()).toBe(day);
    }
  });

  it("returns only computable holidays for India outside the table", () => {
    const titles = holidays_in_range(
      "in",
      new Date(2030, 0, 1),
      new Date(2030, 11, 31),
    ).map((holiday) => holiday.title);

    expect(titles).toEqual([
      "Republic Day",
      "Good Friday",
      "Independence Day",
      "Gandhi Jayanti",
      "Christmas Day",
    ]);
  });

  it("returns 17 sorted holidays with unique titles for each India table year", () => {
    for (const year of [2025, 2026, 2027]) {
      const holidays = holidays_in_range(
        "in",
        new Date(year, 0, 1),
        new Date(year, 11, 31),
      );
      const titles = holidays.map((holiday) => holiday.title);
      const times = holidays.map((holiday) => holiday.date.getTime());

      expect(holidays).toHaveLength(17);
      expect(new Set(titles).size).toBe(titles.length);
      expect(times).toEqual([...times].sort((first, second) => first - second));
      expect(
        holidays.every((holiday) => holiday.date.getFullYear() === year),
      ).toBe(true);
    }
  });

  it("only returns holidays inside the range", () => {
    const december = holidays_in_range(
      "us",
      new Date(2026, 11, 1),
      new Date(2026, 11, 31),
    );

    expect(december).toHaveLength(1);
    expect(december[0].title).toBe("Christmas Day");
  });
});
