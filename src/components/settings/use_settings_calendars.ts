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
import type { DecryptedCalendar } from "@/types/calendar";

import { useCallback, useEffect, useState } from "react";

import { list_calendars, peek_calendars } from "@/services/api/calendar";

export interface SettingsCalendarsState {
  calendars: DecryptedCalendar[];
  is_settled: boolean;
}

export function seed_settings_calendars(
  seed: DecryptedCalendar[],
): SettingsCalendarsState {
  return { calendars: seed, is_settled: seed.length > 0 };
}

function read_seed(): DecryptedCalendar[] {
  try {
    return peek_calendars();
  } catch {
    return [];
  }
}

export function use_settings_calendars() {
  const [state, set_state] = useState<SettingsCalendarsState>(() =>
    seed_settings_calendars(read_seed()),
  );

  const reload = useCallback(async () => {
    try {
      const result = await list_calendars();

      set_state({ calendars: result.data, is_settled: true });
    } catch {
      set_state((current) => ({ ...current, is_settled: true }));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    list_calendars()
      .then((result) => {
        if (!cancelled) {
          set_state({ calendars: result.data, is_settled: true });
        }
      })
      .catch(() => {
        if (!cancelled) {
          set_state((current) => ({ ...current, is_settled: true }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { ...state, reload };
}
