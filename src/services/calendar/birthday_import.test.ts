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
  birthdays_in_range,
  contact_birthday_sources,
} from "@/services/calendar/birthdays";
import { parse_ics_events } from "@/services/calendar/ics_file";
import {
  BIRTHDAYS_IMPORT_TARGET,
  entries_for_target,
  import_entry_draft,
  is_birthday_import,
  resolve_import_target,
} from "@/services/calendar/ics_import";
import { occurrence_starts } from "@/services/calendar/recurrence";

function ics(...events: string[][]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test//Birthdays//EN",
    ...events.flatMap((lines) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"]),
    "END:VCALENDAR",
  ].join("\r\n");
}

function dates_in(
  entry: ReturnType<typeof parse_ics_events>[number],
  from: Date,
  to: Date,
): string[] {
  const event = {
    ...entry,
    id: "x",
    calendar_id: "cal-1",
    color: null,
    event_kind: entry.event_kind ?? "default",
  } as unknown as DecryptedCalendarEvent;

  return occurrence_starts(event, from, to).map(
    (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
  );
}

const CALENDARS = [
  { id: "cal-1", is_default: true },
  { id: "cal-2", is_default: false },
];

describe("contact birthdays", () => {
  const from = new Date(2026, 0, 1);
  const to = new Date(2026, 11, 31);

  it.each([
    ["1990-03-04", 2, 4],
    ["19900305", 2, 5],
    ["--0306", 2, 6],
    ["--03-07", 2, 7],
    ["1604-03-08", 2, 8],
    ["1985-03-09T00:00:00Z", 2, 9],
  ])("shows a birthday stored as %s", (birthday, month, day) => {
    const result = birthdays_in_range(
      [{ birthday, id: "c1", name: "Ada" }],
      from,
      to,
    );

    expect(result).toHaveLength(1);
    expect(result[0].date.getMonth()).toBe(month);
    expect(result[0].date.getDate()).toBe(day);
  });

  it("adds anniversaries from contact dates", () => {
    const sources = contact_birthday_sources({
      id: "c9",
      first_name: "Married",
      last_name: "Couple",
      birthday: "1980-01-15",
      date_entries: [
        { type: "anniversary", value: "20100312" },
        { type: "graduation", value: "2005-06-01" },
      ],
    });

    expect(sources).toEqual([
      { birthday: "1980-01-15", id: "c9", name: "Married Couple" },
      {
        birthday: "20100312",
        id: "c9-anniversary",
        kind: "anniversary",
        name: "Married Couple",
      },
    ]);

    const result = birthdays_in_range(sources, from, to);

    expect(result.map((item) => [item.kind, item.date.getMonth()])).toEqual([
      ["birthday", 0],
      ["anniversary", 2],
    ]);
  });

  it("skips contacts without a name or a readable date", () => {
    expect(
      contact_birthday_sources({ id: "c1", birthday: "1990-01-01" }),
    ).toEqual([]);
    expect(
      contact_birthday_sources({
        id: "c2",
        first_name: "Bo",
        birthday: "soon",
      }),
    ).toEqual([]);
  });
});

describe("importing a birthdays file", () => {
  const file = ics(
    [
      "UID:ada@test",
      "SUMMARY:Ada",
      "DTSTART;VALUE=DATE:19901210",
      "DTEND;VALUE=DATE:19901211",
      "RRULE:FREQ=YEARLY",
      "CATEGORIES:Birthday",
    ],
    [
      "UID:grace@test",
      "SUMMARY:Grace",
      "DTSTART;VALUE=DATE:16041209",
      "DTEND;VALUE=DATE:16041210",
      "RRULE:FREQ=YEARLY",
      "X-APPLE-OMIT-YEAR:1604",
      "CATEGORIES:Birthdays",
    ],
    [
      "UID:leap@test",
      "SUMMARY:Leap Day",
      "DTSTART;VALUE=DATE:20000229",
      "DTEND;VALUE=DATE:20000301",
      "RRULE:FREQ=YEARLY",
    ],
    [
      "UID:gg@test",
      "SUMMARY:Great-grandma",
      "DTSTART;VALUE=DATE:18950704",
      "DTEND;VALUE=DATE:18950705",
      "RRULE:FREQ=YEARLY",
    ],
    [
      "UID:wed@test",
      "SUMMARY:Wedding anniversary",
      "DTSTART;VALUE=DATE:20150620",
      "RRULE:FREQ=YEARLY",
      "CATEGORIES:Anniversary",
    ],
    [
      "UID:alan@test",
      "SUMMARY:Alan Turing",
      "DTSTART;VALUE=DATE:20260623",
      "DTEND;VALUE=DATE:20260624",
      "CATEGORIES:BIRTHDAY",
    ],
  );

  it("keeps every birthday, including year-less and pre-1900 ones", () => {
    const entries = parse_ics_events(file);

    expect(entries.map((entry) => entry.title)).toEqual([
      "Ada",
      "Grace",
      "Leap Day",
      "Great-grandma",
      "Wedding anniversary",
      "Alan Turing",
    ]);
  });

  it("marks categorized birthdays and lands them on the right day every year", () => {
    const entries = parse_ics_events(file);
    const by_title = Object.fromEntries(
      entries.map((entry) => [entry.title, entry]),
    );
    const from = new Date(2026, 0, 1);
    const to = new Date(2028, 11, 31);

    expect(by_title.Ada.event_kind).toBe("birthday");
    expect(by_title.Grace.event_kind).toBe("birthday");
    expect(by_title["Wedding anniversary"].event_kind).toBe("birthday");
    expect(by_title["Alan Turing"].event_kind).toBe("birthday");
    expect(by_title["Leap Day"].event_kind).toBeUndefined();

    expect(dates_in(by_title.Grace, from, to)).toEqual([
      "2026-12-09",
      "2027-12-09",
      "2028-12-09",
    ]);
    expect(dates_in(by_title["Great-grandma"], from, to)).toEqual([
      "2026-07-04",
      "2027-07-04",
      "2028-07-04",
    ]);
    expect(dates_in(by_title["Alan Turing"], from, to)).toEqual([
      "2026-06-23",
      "2027-06-23",
      "2028-06-23",
    ]);
    expect(dates_in(by_title["Leap Day"], from, to)).toEqual([
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });

  it("imports into the birthdays calendar as birthday events", () => {
    const entries = parse_ics_events(file);
    const target = resolve_import_target(
      BIRTHDAYS_IMPORT_TARGET,
      CALENDARS,
      "cal-2",
    );

    expect(target).toEqual({ calendar_id: "cal-2", as_birthdays: true });
    expect(is_birthday_import(entries)).toBe(false);

    const drafts = entries_for_target(entries, target!).map((entry) =>
      import_entry_draft(entry, target!.calendar_id),
    );

    for (const draft of drafts) {
      expect(draft.calendar_id).toBe("cal-2");
      expect(draft.event_kind).toBe("birthday");
      expect(draft.is_all_day).toBe(true);
      expect(draft.recurrence?.frequency).toBe("yearly");
    }
  });

  it("keeps a normal target as plain events", () => {
    const target = resolve_import_target("cal-1", CALENDARS, "cal-1");
    const entries = parse_ics_events(file);
    const drafts = entries_for_target(entries, target!).map((entry) =>
      import_entry_draft(entry, target!.calendar_id),
    );

    expect(target).toEqual({ calendar_id: "cal-1", as_birthdays: false });
    expect(drafts.find((draft) => draft.title === "Leap Day")?.event_kind).toBe(
      "default",
    );
    expect(drafts.find((draft) => draft.title === "Ada")?.event_kind).toBe(
      "birthday",
    );
    expect(resolve_import_target("missing", CALENDARS, "cal-1")).toBeNull();
  });

  it("picks the birthdays calendar for a file of birthdays", () => {
    const only_birthdays = parse_ics_events(file).filter(
      (entry) => entry.event_kind === "birthday",
    );

    expect(is_birthday_import(only_birthdays)).toBe(true);
    expect(is_birthday_import([])).toBe(false);
  });
});
