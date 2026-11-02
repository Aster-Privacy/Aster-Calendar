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
import { useEffect, useState } from "react";

import { calendar_now } from "@/services/calendar/view_zone";

export const NOW_TICK_MS = 60_000;

export function use_calendar_now_tick(interval_ms = NOW_TICK_MS): Date {
  const [now, set_now] = useState(() => calendar_now());

  useEffect(() => {
    set_now(calendar_now());

    const timer = window.setInterval(
      () => set_now(calendar_now()),
      interval_ms,
    );

    return () => window.clearInterval(timer);
  }, [interval_ms]);

  return now;
}

export function use_calendar_today(interval_ms = NOW_TICK_MS): Date {
  const now = use_calendar_now_tick(interval_ms);
  const day_key = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const [today, set_today] = useState(() => new Date(day_key));

  useEffect(() => {
    set_today((current) =>
      current.getTime() === day_key ? current : new Date(day_key),
    );
  }, [day_key]);

  return today;
}
