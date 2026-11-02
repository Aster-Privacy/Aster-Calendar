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

import { birthdays_in_range } from "@/services/calendar/birthdays";

describe("birthdays_in_range", () => {
  it("maps a full date to the range year", () => {
    const result = birthdays_in_range(
      [{ birthday: "1990-07-15", id: "c1", name: "Ana" }],
      new Date(2026, 6, 1),
      new Date(2026, 6, 31),
    );

    expect(result).toHaveLength(1);
    expect(result[0].date.getFullYear()).toBe(2026);
    expect(result[0].date.getDate()).toBe(15);
  });

  it("supports year-less --MM-DD values", () => {
    const result = birthdays_in_range(
      [{ birthday: "--03-09", id: "c1", name: "Bo" }],
      new Date(2026, 2, 1),
      new Date(2026, 2, 31),
    );

    expect(result).toHaveLength(1);
    expect(result[0].date.getMonth()).toBe(2);
    expect(result[0].date.getDate()).toBe(9);
  });

  it("moves Feb 29 birthdays to Feb 28 in non-leap years", () => {
    const result = birthdays_in_range(
      [{ birthday: "2000-02-29", id: "c1", name: "Cy" }],
      new Date(2026, 1, 1),
      new Date(2026, 1, 28),
    );

    expect(result).toHaveLength(1);
    expect(result[0].date.getDate()).toBe(28);
  });

  it("spans year boundaries", () => {
    const result = birthdays_in_range(
      [{ birthday: "1985-01-02", id: "c1", name: "Di" }],
      new Date(2026, 11, 28),
      new Date(2027, 0, 5),
    );

    expect(result).toHaveLength(1);
    expect(result[0].date.getFullYear()).toBe(2027);
  });

  it("skips invalid or empty values", () => {
    const result = birthdays_in_range(
      [
        { birthday: "", id: "c1", name: "E" },
        { birthday: "next tuesday", id: "c2", name: "F" },
        { birthday: "1990-07-15", id: "c3", name: "" },
      ],
      new Date(2026, 0, 1),
      new Date(2026, 11, 31),
    );

    expect(result).toHaveLength(0);
  });
});
