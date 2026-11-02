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

import { parse_date_input } from "@/components/calendar/date_input_parse";

const reference = new Date(2026, 9, 10, 14, 30);

function parse(text: string, language = "en"): string | null {
  const result = parse_date_input(text, { reference, language });

  if (!result) {
    return null;
  }

  const month = String(result.getMonth() + 1).padStart(2, "0");
  const day = String(result.getDate()).padStart(2, "0");

  return `${result.getFullYear()}-${month}-${day}`;
}

describe("parse_date_input", () => {
  it("accepts ISO dates", () => {
    expect(parse("2026-11-01")).toBe("2026-11-01");
    expect(parse("2027/2/3")).toBe("2027-02-03");
  });

  it("rejects impossible ISO dates", () => {
    expect(parse("2026-02-30")).toBeNull();
    expect(parse("2026-13-01")).toBeNull();
  });

  it("accepts a month name with a day and rolls past dates forward", () => {
    expect(parse("nov 1")).toBe("2026-11-01");
    expect(parse("November 1st")).toBe("2026-11-01");
    expect(parse("1 nov")).toBe("2026-11-01");
    expect(parse("jan 5")).toBe("2027-01-05");
  });

  it("accepts a month name with an explicit year", () => {
    expect(parse("nov 1 2025")).toBe("2025-11-01");
    expect(parse("1 november, 2027")).toBe("2027-11-01");
    expect(parse("march 2027")).toBe("2027-03-01");
  });

  it("accepts relative words", () => {
    expect(parse("today")).toBe("2026-10-10");
    expect(parse("tomorrow")).toBe("2026-10-11");
    expect(parse("yesterday")).toBe("2026-10-09");
    expect(parse("+7")).toBe("2026-10-17");
    expect(parse("-1")).toBe("2026-10-09");
  });

  it("accepts weekdays and numeric dates", () => {
    expect(parse("next monday")).toBe("2026-10-12");
    expect(parse("11/1")).toBe("2026-11-01");
    expect(parse("11/1/2027")).toBe("2027-11-01");
  });

  it("accepts a bare month name", () => {
    expect(parse("december")).toBe("2026-12-01");
    expect(parse("february")).toBe("2027-02-01");
  });

  it("understands month names in the active language", () => {
    expect(parse("1 nov", "de")).toBe("2026-11-01");
    expect(parse("dez 2027", "de")).toBe("2027-12-01");
  });

  it("returns null for text that is not a date", () => {
    expect(parse("")).toBeNull();
    expect(parse("lunch")).toBeNull();
    expect(parse("xyz 4")).toBeNull();
  });
});
