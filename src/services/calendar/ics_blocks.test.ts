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

import {
  find_ics_block,
  find_ics_blocks,
  remove_html_elements,
} from "@/services/calendar/ics_blocks";
import { parse_invite_from_ics } from "@/services/calendar/ics_parser";
import { parse_ics_events } from "@/services/calendar/ics_file";

describe("ics block scanning", () => {
  it("returns blocks in order and respects the limit", () => {
    const text =
      "BEGIN:VEVENT\nUID:a\nEND:VEVENT\nbegin:vevent\nUID:b\nend:vevent\nBEGIN:VEVENT\nUID:c\nEND:VEVENT";

    expect(find_ics_blocks(text, "VEVENT", 10)).toHaveLength(3);
    expect(find_ics_blocks(text, "VEVENT", 2)[1]).toContain("UID:b");
    expect(find_ics_block(text, "VEVENT")).toBe("BEGIN:VEVENT\nUID:a\nEND:VEVENT");
  });

  it("stops at an unterminated block without scanning quadratically", () => {
    const hostile = "BEGIN:VCALENDAR ".repeat(80000);
    const started = Date.now();

    expect(find_ics_block(hostile, "VCALENDAR")).toBeNull();
    expect(parse_invite_from_ics(hostile)).toBeNull();
    expect(parse_ics_events("BEGIN:VEVENT ".repeat(150000))).toEqual([]);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("removes style elements and keeps unmatched openings", () => {
    expect(remove_html_elements("a<style>x</style>b<STYLE>y</style>c", "style")).toBe(
      "a b c",
    );
    expect(remove_html_elements("a<style>never closed", "style")).toBe(
      "a<style>never closed",
    );
    const hostile = "<style ".repeat(80000);
    const started = Date.now();

    expect(remove_html_elements(hostile, "style")).toBe(hostile);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
