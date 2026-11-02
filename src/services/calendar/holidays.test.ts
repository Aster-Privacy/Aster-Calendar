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
