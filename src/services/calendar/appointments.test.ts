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
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  booked_start_keys,
  booking_slot_start,
  local_windows_to_utc,
  sanitize_public_schedule,
} from "@/services/calendar/appointments";

afterEach(() => {
  vi.restoreAllMocks();
});

function with_offset(offset_minutes: number) {
  vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(offset_minutes);
}

describe("local_windows_to_utc", () => {
  it("passes windows through unchanged at utc", () => {
    with_offset(0);

    expect(local_windows_to_utc([1], 9, 17)).toEqual([
      { day: 1, start_minute: 540, end_minute: 1020 },
    ]);
  });

  it("shifts a daytime window forward for a western offset", () => {
    with_offset(300);

    expect(local_windows_to_utc([1], 9, 17)).toEqual([
      { day: 1, start_minute: 840, end_minute: 1320 },
    ]);
  });

  it("moves an evening western window wholly into the next utc day", () => {
    with_offset(300);

    expect(local_windows_to_utc([1], 20, 23)).toEqual([
      { day: 2, start_minute: 60, end_minute: 240 },
    ]);
  });

  it("splits a western window that straddles utc midnight", () => {
    with_offset(300);

    expect(local_windows_to_utc([1], 18, 20)).toEqual([
      { day: 1, start_minute: 1380, end_minute: 1440 },
      { day: 2, start_minute: 0, end_minute: 60 },
    ]);
  });

  it("splits an eastern early-morning window across the previous utc day", () => {
    with_offset(-120);

    expect(local_windows_to_utc([1], 0, 6)).toEqual([
      { day: 0, start_minute: 1320, end_minute: 1440 },
      { day: 1, start_minute: 0, end_minute: 240 },
    ]);
  });

  it("keeps an eastern midday window on the same utc day", () => {
    with_offset(-120);

    expect(local_windows_to_utc([3], 10, 12)).toEqual([
      { day: 3, start_minute: 480, end_minute: 600 },
    ]);
  });

  it("wraps an eastern midnight window fully onto the previous utc day", () => {
    with_offset(-180);

    expect(local_windows_to_utc([0], 0, 1)).toEqual([
      { day: 6, start_minute: 1260, end_minute: 1320 },
    ]);
  });

  it("converts every requested day independently", () => {
    with_offset(0);

    expect(local_windows_to_utc([1, 3, 5], 9, 10)).toEqual([
      { day: 1, start_minute: 540, end_minute: 600 },
      { day: 3, start_minute: 540, end_minute: 600 },
      { day: 5, start_minute: 540, end_minute: 600 },
    ]);
  });

  it("uses the schedule zone instead of the device offset", () => {
    with_offset(0);

    expect(
      local_windows_to_utc(
        [1],
        9,
        17,
        "Asia/Kolkata",
        new Date("2026-06-15T12:00:00.000Z"),
      ),
    ).toEqual([{ day: 1, start_minute: 210, end_minute: 690 }]);
  });

  it("follows the zone offset on each side of a DST change", () => {
    with_offset(0);

    expect(
      local_windows_to_utc(
        [1],
        9,
        17,
        "Europe/Berlin",
        new Date("2026-03-25T12:00:00.000Z"),
      ),
    ).toEqual([{ day: 1, start_minute: 480, end_minute: 960 }]);
    expect(
      local_windows_to_utc(
        [1],
        9,
        17,
        "Europe/Berlin",
        new Date("2026-04-01T12:00:00.000Z"),
      ),
    ).toEqual([{ day: 1, start_minute: 420, end_minute: 900 }]);
    expect(
      local_windows_to_utc(
        [1],
        9,
        17,
        "Australia/Sydney",
        new Date("2026-10-10T12:00:00.000Z"),
      ),
    ).toEqual([
      { day: 0, start_minute: 1320, end_minute: 1440 },
      { day: 1, start_minute: 0, end_minute: 360 },
    ]);
  });
});

describe("booking_slot_start", () => {
  const set_in_summer = "2026-07-01T12:00:00.000Z";

  it("keeps a summer 9 AM window at 9 AM local after daylight saving ends", () => {
    const window_instant = Date.parse("2026-11-16T13:00:00.000Z");

    expect(
      booking_slot_start(
        "America/New_York",
        set_in_summer,
        window_instant,
      )?.toISOString(),
    ).toBe("2026-11-16T14:00:00.000Z");
  });

  it("leaves slots in the same offset unchanged", () => {
    const window_instant = Date.parse("2026-07-06T13:00:00.000Z");

    expect(
      booking_slot_start(
        "America/New_York",
        set_in_summer,
        window_instant,
      )?.toISOString(),
    ).toBe("2026-07-06T13:00:00.000Z");
  });

  it("falls back to the stored instant without a reference time", () => {
    const window_instant = Date.parse("2026-11-16T13:00:00.000Z");

    expect(
      booking_slot_start(
        "America/New_York",
        undefined,
        window_instant,
      )?.toISOString(),
    ).toBe("2026-11-16T13:00:00.000Z");
  });

  it("skips a local time that daylight saving removes", () => {
    const set_in_winter = "2026-01-15T12:00:00.000Z";
    const two_thirty_local = Date.parse("2026-03-08T07:30:00.000Z");

    expect(
      booking_slot_start("America/New_York", set_in_winter, two_thirty_local),
    ).toBeNull();
  });
});

describe("sanitize_public_schedule", () => {
  it("drops malformed windows and booked times from the server", () => {
    const schedule = sanitize_public_schedule({
      title: "Intro call",
      duration_minutes: 30,
      timezone: "UTC",
      windows: [
        { day: 1, start_minute: 540, end_minute: 600 },
        { day: 2, start_minute: -5, end_minute: 600 },
        { day: 3, start_minute: 0, end_minute: 1e12 },
        { day: 9, start_minute: 0, end_minute: 60 },
        { day: 4, start_minute: 600, end_minute: 540 },
        null,
      ],
      booked_starts: ["2026-10-05T09:00:00.000Z", "not a date", 42],
    });

    expect(schedule?.windows).toEqual([
      { day: 1, start_minute: 540, end_minute: 600 },
    ]);
    expect(schedule?.booked_starts).toEqual(["2026-10-05T09:00:00.000Z"]);
  });

  it("caps the number of windows and rejects a response without a duration", () => {
    const windows = Array.from({ length: 500 }, () => ({
      day: 1,
      start_minute: 0,
      end_minute: 60,
    }));

    expect(
      sanitize_public_schedule({ duration_minutes: 30, windows })?.windows,
    ).toHaveLength(64);
    expect(sanitize_public_schedule({ windows })).toBeNull();
    expect(sanitize_public_schedule(null)).toBeNull();
  });

  it("shows the Aster badge unless the server turns it off", () => {
    expect(
      sanitize_public_schedule({ duration_minutes: 30 })?.show_branding,
    ).toBe(true);
    expect(
      sanitize_public_schedule({ duration_minutes: 30, show_branding: "no" })
        ?.show_branding,
    ).toBe(true);
    expect(
      sanitize_public_schedule({ duration_minutes: 30, show_branding: false })
        ?.show_branding,
    ).toBe(false);
  });
});

describe("booked_start_keys", () => {
  it("skips values that are not valid dates instead of throwing", () => {
    expect(
      Array.from(
        booked_start_keys([
          "2026-10-05T09:00:00Z",
          "not a date",
          "",
          42,
          null,
          "+999999-01-01T00:00:00Z",
        ]),
      ),
    ).toEqual(["2026-10-05T09:00:00.000Z"]);
    expect(booked_start_keys(undefined).size).toBe(0);
  });
});
