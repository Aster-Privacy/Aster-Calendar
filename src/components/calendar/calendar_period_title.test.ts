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
import type { CalendarViewMode } from "@/types/calendar";

import { describe, expect, it } from "vitest";

import { build_compact_period_title } from "@/components/calendar/calendar_period_title";

const MID_MONTH = new Date(2026, 8, 16, 12);
const MONTH_END = new Date(2026, 8, 30, 12);

function phone_title(
  language: string,
  view_mode: CalendarViewMode,
  anchor_date = MID_MONTH,
  is_schedule_endless = false,
): string {
  return build_compact_period_title({
    language,
    view_mode,
    anchor_date,
    range_start: anchor_date,
    period_end: new Date(2026, 9, 15, 12),
    agenda_visible_month: anchor_date,
    is_schedule_endless,
    custom_view_days: 4,
    week_start_day: 1,
    is_phone: true,
  });
}

function long_month(language: string, date = MID_MONTH): string {
  return new Intl.DateTimeFormat(language, { month: "long" }).format(date);
}

describe("build_compact_period_title on phones", () => {
  const languages = ["en", "de", "pt", "pt-BR", "ru", "pl", "fr", "es"];

  it.each(languages)(
    "spells the month out in month view for %s",
    (language) => {
      expect(phone_title(language, "month")).toBe(long_month(language));
    },
  );

  it.each(languages)(
    "spells the month out in the schedule for %s",
    (language) => {
      expect(phone_title(language, "agenda")).toBe(long_month(language));
      expect(phone_title(language, "agenda", MID_MONTH, true)).toBe(
        long_month(language),
      );
    },
  );

  it.each(languages)("spells the month out in day view for %s", (language) => {
    expect(phone_title(language, "day")).toBe(
      new Intl.DateTimeFormat(language, {
        day: "numeric",
        month: "long",
      }).format(MID_MONTH),
    );
  });

  it("spells the month out when the visible days share a month", () => {
    expect(phone_title("en", "week")).toBe("September 16 - 18");
    expect(phone_title("de", "week")).toBe("16. September - 18");
    expect(phone_title("ru", "custom")).toBe("16 сентября - 19");
  });

  it("keeps both months readable when the visible days cross a month", () => {
    expect(phone_title("en", "week", MONTH_END)).toBe("Sep 30 - Oct 2");
    expect(phone_title("de", "week", MONTH_END)).toBe("30. Sept. - 2. Okt.");
  });

  it("leaves the year view to the year label", () => {
    expect(phone_title("en", "year")).toBe("");
  });
});
