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
import { useMemo } from "react";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  resolve_birthdays_color,
  resolve_birthdays_name,
  resolve_holidays_color,
} from "@/services/calendar/display_colors";

export interface SyntheticCalendarDisplay {
  birthdays_name: string;
  birthdays_color: string;
  birthdays_removed: boolean;
  holidays_color: string;
}

export function use_synthetic_calendar_display(): SyntheticCalendarDisplay {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const default_name = t("calendar.settings_birthdays");
  const {
    calendar_birthdays_color,
    calendar_birthdays_name,
    calendar_birthdays_removed,
    calendar_holidays_color,
  } = preferences;

  return useMemo(
    () => ({
      birthdays_color: resolve_birthdays_color({ calendar_birthdays_color }),
      birthdays_name: resolve_birthdays_name(
        calendar_birthdays_name,
        default_name,
      ),
      birthdays_removed: calendar_birthdays_removed === true,
      holidays_color: resolve_holidays_color({ calendar_holidays_color }),
    }),
    [
      default_name,
      calendar_birthdays_color,
      calendar_birthdays_name,
      calendar_birthdays_removed,
      calendar_holidays_color,
    ],
  );
}
