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
import { afterEach, describe, expect, it } from "vitest";

import { build_merged_preferences } from "@/services/api/preferences";
import {
  format_schedule_date,
  get_schedule_range,
  is_schedule_range,
  is_schedule_range_pageable,
  parse_schedule_date,
  resolve_schedule_range,
  schedule_day_count,
  SCHEDULE_CUSTOM_MAX_DAYS,
  SCHEDULE_RANGES,
  shift_schedule_anchor,
  validate_schedule_custom,
} from "@/services/calendar/schedule_range";

function bounds(
  range: Parameters<typeof get_schedule_range>[0],
  anchor: string,
  custom_start = "",
  custom_end = "",
): [string, string] {
  const result = get_schedule_range(
    range,
    parse_schedule_date(anchor) as Date,
    custom_start,
    custom_end,
  );

  return [
    format_schedule_date(result.range_start),
    format_schedule_date(result.range_end),
  ];
}

describe("schedule range ids", () => {
  it("lists the shared ids in order", () => {
    expect(SCHEDULE_RANGES).toEqual([
      "upcoming",
      "next_7_days",
      "next_30_days",
      "next_3_months",
      "next_6_months",
      "this_year",
      "next_year",
      "custom",
    ]);
  });

  it("falls back to upcoming for unknown values", () => {
    expect(is_schedule_range("next_week")).toBe(false);
    expect(resolve_schedule_range("next_week", "", "")).toBe("upcoming");
    expect(resolve_schedule_range(42, "", "")).toBe("upcoming");
    expect(resolve_schedule_range(undefined, "", "")).toBe("upcoming");
    expect(resolve_schedule_range("this_year", "", "")).toBe("this_year");
  });

  it("falls back to upcoming for an unusable custom range", () => {
    expect(resolve_schedule_range("custom", "2026-01-10", "2026-01-01")).toBe(
      "upcoming",
    );
    expect(resolve_schedule_range("custom", "", "2026-01-01")).toBe(
      "upcoming",
    );
    expect(resolve_schedule_range("custom", "2026-01-01", "2026-03-01")).toBe(
      "custom",
    );
  });
});

describe("schedule dates", () => {
  it("parses only real date-only strings", () => {
    expect(parse_schedule_date("2028-02-29")).not.toBeNull();
    expect(parse_schedule_date("2027-02-29")).toBeNull();
    expect(parse_schedule_date("2026-13-01")).toBeNull();
    expect(parse_schedule_date("2026-1-01")).toBeNull();
    expect(parse_schedule_date("2026-01-01T00:00:00Z")).toBeNull();
    expect(parse_schedule_date(null)).toBeNull();
  });

  it("round-trips through the stored format", () => {
    const date = parse_schedule_date("2026-11-10") as Date;

    expect(format_schedule_date(date)).toBe("2026-11-10");
  });
});

describe("get_schedule_range", () => {
  it("keeps the upcoming range at 31 days from the anchor", () => {
    expect(bounds("upcoming", "2026-11-10")).toEqual([
      "2026-11-10",
      "2026-12-10",
    ]);
  });

  it("maps each preset to its start and end", () => {
    expect(bounds("next_7_days", "2026-11-10")).toEqual([
      "2026-11-10",
      "2026-11-16",
    ]);
    expect(bounds("next_30_days", "2026-11-10")).toEqual([
      "2026-11-10",
      "2026-12-09",
    ]);
    expect(bounds("next_3_months", "2026-11-10")).toEqual([
      "2026-11-10",
      "2027-02-09",
    ]);
    expect(bounds("next_6_months", "2026-11-10")).toEqual([
      "2026-11-10",
      "2027-05-09",
    ]);
    expect(bounds("this_year", "2026-11-10")).toEqual([
      "2026-01-01",
      "2026-12-31",
    ]);
    expect(bounds("next_year", "2026-11-10")).toEqual([
      "2027-01-01",
      "2027-12-31",
    ]);
  });

  it("crosses year boundaries", () => {
    expect(bounds("next_7_days", "2026-12-28")).toEqual([
      "2026-12-28",
      "2027-01-03",
    ]);
    expect(bounds("next_30_days", "2026-12-31")).toEqual([
      "2026-12-31",
      "2027-01-29",
    ]);
    expect(bounds("this_year", "2026-12-31")).toEqual([
      "2026-01-01",
      "2026-12-31",
    ]);
    expect(bounds("next_year", "2026-12-31")).toEqual([
      "2027-01-01",
      "2027-12-31",
    ]);
  });

  it("handles leap years and short months", () => {
    expect(bounds("next_7_days", "2028-02-26")).toEqual([
      "2028-02-26",
      "2028-03-03",
    ]);
    expect(bounds("next_3_months", "2027-11-30")).toEqual([
      "2027-11-30",
      "2028-02-28",
    ]);
    expect(bounds("next_6_months", "2027-08-31")).toEqual([
      "2027-08-31",
      "2028-02-28",
    ]);
    expect(bounds("next_year", "2027-06-01")).toEqual([
      "2028-01-01",
      "2028-12-31",
    ]);
    expect(
      schedule_day_count(
        parse_schedule_date("2028-01-01") as Date,
        parse_schedule_date("2028-12-31") as Date,
      ),
    ).toBe(366);
  });

  it("uses the stored custom dates", () => {
    expect(bounds("custom", "2026-11-10", "2026-03-01", "2026-04-15")).toEqual(
      ["2026-03-01", "2026-04-15"],
    );
    expect(bounds("custom", "2026-11-10", "2026-04-15", "2026-03-01")).toEqual(
      ["2026-11-10", "2026-12-10"],
    );
  });

  it("starts at midnight and ends at the last millisecond", () => {
    const result = get_schedule_range(
      "next_7_days",
      new Date(2026, 10, 10, 15, 30),
    );

    expect(result.range_start.getHours()).toBe(0);
    expect(result.range_start.getMinutes()).toBe(0);
    expect(result.range_end.getHours()).toBe(23);
    expect(result.range_end.getMilliseconds()).toBe(999);
  });
});

describe("custom range validation", () => {
  it("rejects an end before the start", () => {
    expect(validate_schedule_custom("2026-05-02", "2026-05-01")).toBe(
      "end_before_start",
    );
    expect(validate_schedule_custom("2026-05-01", "2026-05-01")).toBeNull();
  });

  it("caps the length at about two years", () => {
    expect(SCHEDULE_CUSTOM_MAX_DAYS).toBe(731);
    expect(validate_schedule_custom("2026-01-01", "2028-01-01")).toBeNull();
    expect(validate_schedule_custom("2026-01-01", "2028-01-02")).toBe(
      "too_long",
    );
    expect(validate_schedule_custom("2027-03-01", "2029-02-28")).toBeNull();
    expect(validate_schedule_custom("2027-03-01", "2029-03-01")).toBe(
      "too_long",
    );
  });

  it("rejects missing or malformed dates", () => {
    expect(validate_schedule_custom("", "2026-05-01")).toBe("invalid");
    expect(validate_schedule_custom("2026-05-01", "05/02/2026")).toBe(
      "invalid",
    );
  });
});

describe("shift_schedule_anchor", () => {
  const anchor = new Date(2026, 0, 31);

  it("moves by the length of the preset", () => {
    expect(
      format_schedule_date(shift_schedule_anchor("next_7_days", anchor, 1)),
    ).toBe("2026-02-07");
    expect(
      format_schedule_date(shift_schedule_anchor("next_30_days", anchor, -1)),
    ).toBe("2026-01-01");
    expect(
      format_schedule_date(shift_schedule_anchor("next_3_months", anchor, 1)),
    ).toBe("2026-04-30");
    expect(
      format_schedule_date(shift_schedule_anchor("next_6_months", anchor, -1)),
    ).toBe("2025-07-31");
    expect(
      format_schedule_date(shift_schedule_anchor("this_year", anchor, 1)),
    ).toBe("2027-01-31");
    expect(
      format_schedule_date(shift_schedule_anchor("upcoming", anchor, 1)),
    ).toBe("2026-03-02");
  });

  it("keeps a custom range fixed", () => {
    expect(shift_schedule_anchor("custom", anchor, 1)).toBe(anchor);
    expect(is_schedule_range_pageable("custom")).toBe(false);
    expect(is_schedule_range_pageable("this_year")).toBe(true);
  });
});

describe("daylight saving time", () => {
  const previous_zone = process.env.TZ;

  afterEach(() => {
    if (previous_zone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous_zone;
    }
  });

  it("keeps whole local days across the spring and fall shifts", () => {
    process.env.TZ = "America/New_York";

    const spring = get_schedule_range("next_7_days", new Date(2026, 2, 6));

    expect(format_schedule_date(spring.range_end)).toBe("2026-03-12");
    expect(spring.range_end.getHours()).toBe(23);
    expect(
      spring.range_end.getTime() - spring.range_start.getTime() + 1,
    ).toBe(7 * 86_400_000 - 3_600_000);

    const fall = get_schedule_range("next_7_days", new Date(2026, 9, 30));

    expect(format_schedule_date(fall.range_end)).toBe("2026-11-05");
    expect(fall.range_end.getTime() - fall.range_start.getTime() + 1).toBe(
      7 * 86_400_000 + 3_600_000,
    );
    expect(
      schedule_day_count(
        parse_schedule_date("2026-03-01") as Date,
        parse_schedule_date("2026-03-31") as Date,
      ),
    ).toBe(31);
  });
});

describe("stored schedule range preference", () => {
  it("defaults to upcoming with empty custom dates", () => {
    const merged = build_merged_preferences({}, null);

    expect(merged.calendar_schedule_range).toBe("upcoming");
    expect(merged.calendar_schedule_custom_start).toBe("");
    expect(merged.calendar_schedule_custom_end).toBe("");
  });

  it("keeps a valid stored range", () => {
    const merged = build_merged_preferences(
      {
        calendar_schedule_range: "custom",
        calendar_schedule_custom_start: "2026-03-01",
        calendar_schedule_custom_end: "2026-09-30",
      },
      null,
    );

    expect(merged.calendar_schedule_range).toBe("custom");
    expect(merged.calendar_schedule_custom_start).toBe("2026-03-01");
    expect(merged.calendar_schedule_custom_end).toBe("2026-09-30");
  });

  it("falls back to upcoming for unknown or broken values", () => {
    expect(
      build_merged_preferences({ calendar_schedule_range: "fortnight" }, null)
        .calendar_schedule_range,
    ).toBe("upcoming");

    const broken = build_merged_preferences(
      {
        calendar_schedule_range: "custom",
        calendar_schedule_custom_start: 20260301,
        calendar_schedule_custom_end: "2030-01-01",
      },
      null,
    );

    expect(broken.calendar_schedule_range).toBe("upcoming");
    expect(broken.calendar_schedule_custom_start).toBe("");
  });
});
