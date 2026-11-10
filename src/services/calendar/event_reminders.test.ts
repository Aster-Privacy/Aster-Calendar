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
  ALL_DAY_EVENT_REMINDER_CHOICES,
  DEFAULT_ALL_DAY_REMINDER_OPTIONS,
  DEFAULT_REMINDER_OPTIONS,
  EVENT_REMINDER_CHOICES,
  MAX_EVENT_REMINDERS,
  MAX_REMINDER_MINUTES,
  add_reminder,
  custom_reminder_minutes,
  default_reminder_list,
  effective_reminders,
  format_default_reminder,
  format_reminder,
  next_reminder_choice,
  normalize_reminder_list,
  remap_reminders,
  reminder_fields,
  remove_reminder,
  replace_reminder,
  resolve_reminders,
  scheduled_reminder_minutes,
  split_reminder,
} from "@/services/calendar/event_reminders";

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

describe("reminder presets", () => {
  it("matches the mobile apps", () => {
    expect(EVENT_REMINDER_CHOICES).toEqual([
      0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080, 20160,
    ]);
    expect(ALL_DAY_EVENT_REMINDER_CHOICES).toEqual([
      0, 420, 540, 1440, 2880, 10080, 20160,
    ]);
    expect(DEFAULT_REMINDER_OPTIONS).toEqual([-1, ...EVENT_REMINDER_CHOICES]);
    expect(DEFAULT_ALL_DAY_REMINDER_OPTIONS).toEqual([
      -1, 0, 420, 1440, 2880, 10080, 20160,
    ]);
    expect(MAX_EVENT_REMINDERS).toBe(5);
    expect(MAX_REMINDER_MINUTES).toBe(40320);
  });
});

describe("normalize_reminder_list", () => {
  it("sorts, dedupes, drops invalid values, and caps the count", () => {
    expect(
      normalize_reminder_list([
        60,
        10,
        60,
        -1,
        1.5,
        "5",
        MAX_REMINDER_MINUTES + 1,
        0,
        1440,
        10080,
        30,
      ]),
    ).toEqual([0, 10, 30, 60, 1440]);
  });

  it("returns null for a missing list", () => {
    expect(normalize_reminder_list(undefined)).toBeNull();
    expect(normalize_reminder_list(null)).toBeNull();
  });
});

describe("resolve_reminders", () => {
  it("falls back to the legacy field when there is no list", () => {
    expect(resolve_reminders(30, undefined)).toEqual([30]);
    expect(resolve_reminders(null, undefined)).toBeNull();
  });

  it("uses the list when its first entry matches the legacy field", () => {
    expect(resolve_reminders(10, [10, 1440, 10080])).toEqual([10, 1440, 10080]);
  });

  it("trusts the legacy field when an older client changed it", () => {
    expect(resolve_reminders(60, [10, 1440])).toEqual([60]);
    expect(resolve_reminders(null, [10, 1440])).toBeNull();
  });

  it("keeps an explicit empty list", () => {
    expect(resolve_reminders(null, [])).toEqual([]);
    expect(effective_reminders({ reminder_minutes: null, reminders: [] })).toEqual(
      [],
    );
  });
});

describe("reminder_fields", () => {
  it("writes the smallest reminder into the legacy field", () => {
    expect(reminder_fields([10080, 10, 1440])).toEqual({
      reminder_minutes: 10,
      reminders: [10, 1440, 10080],
    });
    expect(reminder_fields([])).toEqual({ reminder_minutes: null, reminders: [] });
  });

  it("round-trips through resolve_reminders", () => {
    const fields = reminder_fields([20160, 90, 2880]);

    expect(resolve_reminders(fields.reminder_minutes, fields.reminders)).toEqual([
      90, 2880, 20160,
    ]);
  });
});

describe("scheduled_reminder_minutes", () => {
  it("uses the default only when the event has no reminder setting", () => {
    expect(scheduled_reminder_minutes(null, 30)).toEqual([30]);
    expect(scheduled_reminder_minutes(null, -1)).toEqual([]);
    expect(scheduled_reminder_minutes([], 30)).toEqual([]);
    expect(scheduled_reminder_minutes([10, 10080], 30)).toEqual([10, 10080]);
  });
});

describe("reminder list edits", () => {
  it("adds, replaces, and removes reminders", () => {
    expect(add_reminder([60], 10)).toEqual([10, 60]);
    expect(add_reminder([60], 60)).toEqual([60]);
    expect(replace_reminder([10, 60], 60, 10080)).toEqual([10, 10080]);
    expect(remove_reminder([10, 60], 10)).toEqual([60]);
    expect(default_reminder_list(-1)).toEqual([]);
    expect(default_reminder_list(2880)).toEqual([2880]);
  });

  it("picks the next preset after the largest reminder", () => {
    expect(next_reminder_choice([], EVENT_REMINDER_CHOICES, 10)).toBe(10);
    expect(next_reminder_choice([10], EVENT_REMINDER_CHOICES, 10)).toBe(15);
    expect(next_reminder_choice([20160], EVENT_REMINDER_CHOICES, 10)).toBe(0);
    expect(
      next_reminder_choice(
        ALL_DAY_EVENT_REMINDER_CHOICES,
        ALL_DAY_EVENT_REMINDER_CHOICES,
        540,
      ),
    ).toBeNull();
  });

  it("maps presets when an event switches between timed and all-day", () => {
    expect(
      remap_reminders(
        [0, 10, 1440],
        EVENT_REMINDER_CHOICES,
        ALL_DAY_EVENT_REMINDER_CHOICES,
      ),
    ).toEqual([0, 540, 1440]);
    expect(
      remap_reminders(
        [10080, 20160],
        ALL_DAY_EVENT_REMINDER_CHOICES,
        EVENT_REMINDER_CHOICES,
      ),
    ).toEqual([10080, 20160]);
  });
});

describe("custom reminders", () => {
  it("converts an amount and unit to minutes up to four weeks", () => {
    expect(custom_reminder_minutes(90, "minutes")).toBe(90);
    expect(custom_reminder_minutes(3, "hours")).toBe(180);
    expect(custom_reminder_minutes(3, "days")).toBe(4320);
    expect(custom_reminder_minutes(4, "weeks")).toBe(MAX_REMINDER_MINUTES);
    expect(custom_reminder_minutes(5, "weeks")).toBeNull();
    expect(custom_reminder_minutes(29, "days")).toBeNull();
    expect(custom_reminder_minutes(null, "days")).toBeNull();
  });

  it("splits minutes into the largest whole unit", () => {
    expect(split_reminder(20160)).toEqual({ amount: 2, unit: "weeks" });
    expect(split_reminder(4320)).toEqual({ amount: 3, unit: "days" });
    expect(split_reminder(120)).toEqual({ amount: 2, unit: "hours" });
    expect(split_reminder(90)).toEqual({ amount: 90, unit: "minutes" });
  });
});

describe("reminder labels", () => {
  it("formats each reminder in its largest unit", () => {
    expect(format_reminder(null, t)).toBe("calendar.reminder_none");
    expect(format_reminder(0, t)).toBe("calendar.reminder_at_start");
    expect(format_reminder(20160, t)).toBe(
      'calendar.reminder_weeks_before:{"count":2}',
    );
    expect(format_reminder(2880, t)).toBe(
      'calendar.reminder_days_before:{"count":2}',
    );
    expect(format_reminder(120, t)).toBe(
      'calendar.reminder_hours_before:{"count":2}',
    );
    expect(format_reminder(90, t)).toBe(
      'calendar.reminder_minutes_before:{"count":90}',
    );
  });

  it("keeps the named default labels in settings", () => {
    expect(format_default_reminder(-1, t)).toBe("calendar.reminder_none");
    expect(format_default_reminder(420, t)).toBe(
      "calendar.reminder_day_before_evening",
    );
    expect(format_default_reminder(10080, t)).toBe(
      "calendar.reminder_week_before",
    );
    expect(format_default_reminder(20160, t)).toBe(
      'calendar.reminder_weeks_before:{"count":2}',
    );
  });
});
