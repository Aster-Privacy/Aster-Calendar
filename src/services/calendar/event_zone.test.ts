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

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  blob_to_event,
  draft_to_blob,
  event_to_draft,
} from "@/services/calendar/calendar_codec";
import {
  format_time_with_zone,
  normalize_event_time_zone,
  view_date_to_zoned_fields,
  zoned_fields_to_view_date,
} from "@/services/calendar/event_zone";
import {
  from_view_date,
  set_active_view_zone,
} from "@/services/calendar/view_zone";

const original_tz = process.env.TZ;
const STAMP = "2026-11-21T00:00:00.000Z";

beforeAll(() => {
  process.env.TZ = "Europe/Berlin";
});

afterEach(() => {
  set_active_view_zone(null);
});

afterAll(() => {
  process.env.TZ = original_tz;
});

function decode(blob: Record<string, unknown>) {
  return blob_to_event(
    {
      starts_at: "2026-11-21T21:00:00.000Z",
      ends_at: "2026-11-22T08:30:00.000Z",
      ...blob,
    } as unknown as Parameters<typeof blob_to_event>[0],
    "evt-1",
    "cal-1",
    STAMP,
  );
}

describe("normalize_event_time_zone", () => {
  it("keeps a real zone and trims it", () => {
    expect(normalize_event_time_zone("Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(normalize_event_time_zone("  Asia/Tokyo ")).toBe("Asia/Tokyo");
  });

  it("drops anything that is not a real zone", () => {
    expect(normalize_event_time_zone("Not/A_Zone")).toBeNull();
    expect(normalize_event_time_zone("")).toBeNull();
    expect(normalize_event_time_zone(null)).toBeNull();
    expect(normalize_event_time_zone(42)).toBeNull();
    expect(normalize_event_time_zone({ zone: "UTC" })).toBeNull();
    expect(normalize_event_time_zone("A".repeat(65))).toBeNull();
    expect(normalize_event_time_zone("<b>Asia/Tokyo</b>")).toBeNull();
  });
});

describe("zoned_fields_to_view_date", () => {
  it("reads the fields as device time when no zone is chosen", () => {
    const date = zoned_fields_to_view_date("2026-11-21", "09:00", null, null);

    expect(date.toISOString()).toBe("2026-11-21T08:00:00.000Z");
  });

  it("converts a time entered in another zone", () => {
    const date = zoned_fields_to_view_date(
      "2026-11-21",
      "09:00",
      "Asia/Tokyo",
      null,
    );

    expect(date.toISOString()).toBe("2026-11-21T00:00:00.000Z");
  });

  it("lands on the calendar wall clock when a calendar zone is set", () => {
    const date = zoned_fields_to_view_date(
      "2026-11-21",
      "09:00",
      "Asia/Tokyo",
      "America/New_York",
    );

    expect(date.getDate()).toBe(20);
    expect(date.getHours()).toBe(19);
    expect(from_view_date(date, "America/New_York").toISOString()).toBe(
      "2026-11-21T00:00:00.000Z",
    );
  });

  it("uses the active calendar zone by default", () => {
    set_active_view_zone("America/New_York");

    const date = zoned_fields_to_view_date("2026-11-21", "09:00", "Asia/Tokyo");

    expect(date.getHours()).toBe(19);
  });

  it("gives the real length of a trip across zones", () => {
    const departs = zoned_fields_to_view_date(
      "2026-11-21",
      "13:00",
      "America/Los_Angeles",
      null,
    );
    const arrives = zoned_fields_to_view_date(
      "2026-11-22",
      "17:30",
      "Asia/Tokyo",
      null,
    );

    expect(departs.toISOString()).toBe("2026-11-21T21:00:00.000Z");
    expect(arrives.toISOString()).toBe("2026-11-22T08:30:00.000Z");
    expect(arrives.getTime() - departs.getTime()).toBe(11.5 * 3_600_000);
  });

  it("follows daylight saving time in the entered zone", () => {
    const summer = zoned_fields_to_view_date(
      "2026-07-01",
      "09:00",
      "America/New_York",
      null,
    );
    const winter = zoned_fields_to_view_date(
      "2026-12-01",
      "09:00",
      "America/New_York",
      null,
    );

    expect(summer.toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(winter.toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });

  it("rejects malformed fields", () => {
    const bad = [
      ["", "09:00"],
      ["2026-11-21", ""],
      ["2026-13-01", "09:00"],
      ["2026-02-30", "09:00"],
      ["2026-11-21", "24:00"],
      ["2026-11-21", "09:60"],
      ["2026-11-21T00", "09:00"],
    ];

    for (const [date_value, time_value] of bad) {
      expect(
        Number.isNaN(
          zoned_fields_to_view_date(
            date_value,
            time_value,
            "Asia/Tokyo",
            null,
          ).getTime(),
        ),
      ).toBe(true);
    }
  });
});

describe("view_date_to_zoned_fields", () => {
  it("returns the calendar wall clock when no zone is chosen", () => {
    expect(
      view_date_to_zoned_fields(new Date(2026, 10, 21, 9, 5), null, null),
    ).toEqual({ date_value: "2026-11-21", time_value: "09:05" });
  });

  it("round trips through another zone", () => {
    for (const view_zone of [null, "America/New_York", "Pacific/Auckland"]) {
      const date = zoned_fields_to_view_date(
        "2026-03-29",
        "23:45",
        "Asia/Kolkata",
        view_zone,
      );

      expect(
        view_date_to_zoned_fields(date, "Asia/Kolkata", view_zone),
      ).toEqual({ date_value: "2026-03-29", time_value: "23:45" });
    }
  });

  it("falls back to the calendar wall clock for an unknown zone", () => {
    expect(
      view_date_to_zoned_fields(
        new Date(2026, 10, 21, 9, 5),
        "Not/A_Zone",
        null,
      ),
    ).toEqual({ date_value: "2026-11-21", time_value: "09:05" });
  });
});

describe("format_time_with_zone", () => {
  it("shows the time and offset in the entered zone", () => {
    const date = zoned_fields_to_view_date(
      "2026-11-21",
      "09:00",
      "Asia/Tokyo",
      null,
    );
    const label = format_time_with_zone(
      date,
      "Asia/Tokyo",
      "en-US",
      false,
      null,
    );

    expect(label).toContain("09:00");
    expect(label).toContain("GMT+9");
  });

  it("returns nothing for an unknown zone", () => {
    expect(
      format_time_with_zone(new Date(), "Not/A_Zone", "en-US", true, null),
    ).toBe("");
  });
});

describe("event time zones in the stored event", () => {
  it("keeps valid zones through a save and a load", () => {
    const event = decode({
      start_time_zone: "America/Los_Angeles",
      end_time_zone: "Asia/Tokyo",
    });

    expect(event.start_time_zone).toBe("America/Los_Angeles");
    expect(event.end_time_zone).toBe("Asia/Tokyo");

    const blob = draft_to_blob(event_to_draft(event));

    expect(blob.start_time_zone).toBe("America/Los_Angeles");
    expect(blob.end_time_zone).toBe("Asia/Tokyo");
  });

  it("leaves the fields out when no zone is set", () => {
    const event = decode({});
    const blob = draft_to_blob(event_to_draft(event));

    expect("start_time_zone" in event).toBe(false);
    expect("end_time_zone" in event).toBe(false);
    expect("start_time_zone" in blob).toBe(false);
    expect("end_time_zone" in blob).toBe(false);
  });

  it("drops zones that are not real", () => {
    const event = decode({
      start_time_zone: "<b>Asia/Tokyo</b>",
      end_time_zone: 7,
    });

    expect("start_time_zone" in event).toBe(false);
    expect("end_time_zone" in event).toBe(false);

    const blob = draft_to_blob({
      ...event_to_draft(decode({})),
      start_time_zone: "Mars/Olympus",
      end_time_zone: null,
    });

    expect("start_time_zone" in blob).toBe(false);
    expect("end_time_zone" in blob).toBe(false);
  });

  it("drops zones on an all-day event", () => {
    const blob = draft_to_blob({
      ...event_to_draft(decode({})),
      is_all_day: true,
      start_time_zone: "Asia/Tokyo",
      end_time_zone: "Asia/Tokyo",
    });

    expect("start_time_zone" in blob).toBe(false);
    expect("end_time_zone" in blob).toBe(false);
  });
});
