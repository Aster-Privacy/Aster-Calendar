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

import {
  PHONE_CUSTOM_DAY_COUNT,
  build_custom_days,
  build_phone_week_days,
  build_week_days,
} from "@/components/calendar/calendar_utils";

export interface CompactPeriodTitleInput {
  language: string;
  view_mode: CalendarViewMode;
  anchor_date: Date;
  range_start: Date;
  period_end: Date;
  agenda_visible_month: Date;
  is_schedule_endless: boolean;
  custom_view_days: number;
  week_start_day: number;
  is_phone: boolean;
}

export function build_compact_period_title({
  language,
  view_mode,
  anchor_date,
  range_start,
  period_end,
  agenda_visible_month,
  is_schedule_endless,
  custom_view_days,
  week_start_day,
  is_phone,
}: CompactPeriodTitleInput): string {
  if (view_mode === "day") {
    return new Intl.DateTimeFormat(language, {
      day: "numeric",
      month: "long",
    }).format(anchor_date);
  }

  if (view_mode === "year") {
    return "";
  }

  if (view_mode === "month") {
    return new Intl.DateTimeFormat(language, { month: "long" }).format(
      anchor_date,
    );
  }

  if (is_schedule_endless) {
    return new Intl.DateTimeFormat(language, { month: "long" }).format(
      agenda_visible_month,
    );
  }

  if (view_mode === "agenda" && is_phone) {
    return new Intl.DateTimeFormat(language, { month: "long" }).format(
      range_start,
    );
  }

  const span =
    view_mode === "agenda"
      ? [range_start, period_end]
      : view_mode === "custom"
        ? build_custom_days(
            anchor_date,
            is_phone
              ? Math.min(custom_view_days, PHONE_CUSTOM_DAY_COUNT)
              : custom_view_days,
          )
        : is_phone
          ? build_phone_week_days(anchor_date, week_start_day)
          : build_week_days(anchor_date, week_start_day);
  const first = span[0];
  const last = span[span.length - 1];

  if (is_phone && view_mode !== "agenda") {
    const same_month =
      first.getMonth() === last.getMonth() &&
      first.getFullYear() === last.getFullYear();
    const range = new Intl.DateTimeFormat(language, {
      day: "numeric",
      month: same_month ? "long" : "short",
    });
    const day_only = new Intl.DateTimeFormat(language, { day: "numeric" });

    return same_month
      ? `${range.format(first)} - ${day_only.format(last)}`
      : `${range.format(first)} - ${range.format(last)}`;
  }

  if (
    first.getMonth() === last.getMonth() &&
    first.getFullYear() === last.getFullYear()
  ) {
    return new Intl.DateTimeFormat(language, { month: "long" }).format(first);
  }

  const month = new Intl.DateTimeFormat(language, { month: "short" });

  return `${month.format(first)} - ${month.format(last)}`;
}
