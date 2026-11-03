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

import { app_locale } from "@/utils/date_format";

type WeekInfo = { firstDay: number };

type LocaleWithWeekInfo = Intl.Locale & {
  getWeekInfo?: () => WeekInfo;
  weekInfo?: WeekInfo;
};

const DEFAULT_FIRST_WEEK_DAY = 1;

export function get_first_week_day(): number {
  try {
    const code =
      app_locale() ?? new Intl.DateTimeFormat().resolvedOptions().locale;
    const locale = new Intl.Locale(code).maximize() as LocaleWithWeekInfo;
    const info = locale.getWeekInfo?.() ?? locale.weekInfo;

    if (info && Number.isInteger(info.firstDay)) {
      return info.firstDay % 7;
    }
  } catch {
    return DEFAULT_FIRST_WEEK_DAY;
  }

  return DEFAULT_FIRST_WEEK_DAY;
}
