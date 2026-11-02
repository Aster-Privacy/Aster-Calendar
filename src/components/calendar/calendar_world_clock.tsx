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
import { Fragment, useEffect, useMemo, useState } from "react";
import { IslandDivider } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";

interface CalendarWorldClockProps {
  timezones: string[];
  use_24_hour: boolean;
}

function zone_label(timezone: string): string {
  const tail = timezone.split("/").pop() ?? timezone;

  return tail.replace(/_/g, " ");
}

function format_offset(timezone: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    }).formatToParts(now);
    const name =
      parts.find((part) => part.type === "timeZoneName")?.value ?? "";

    return name.replace("GMT", "UTC");
  } catch {
    return "";
  }
}

function utc_day_in_zone(now: Date, timezone?: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "numeric",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return Date.UTC(read("year"), read("month") - 1, read("day"));
}

function day_delta(timezone: string, now: Date): number {
  try {
    return Math.round(
      (utc_day_in_zone(now, timezone) - utc_day_in_zone(now)) / 86_400_000,
    );
  } catch {
    return 0;
  }
}

export function CalendarWorldClock({
  timezones,
  use_24_hour,
}: CalendarWorldClockProps) {
  const { t, language } = use_i18n();
  const [now, set_now] = useState(() => new Date());

  useEffect(() => {
    if (timezones.length === 0) {
      return;
    }

    const timer = window.setInterval(() => set_now(new Date()), 30_000);

    return () => window.clearInterval(timer);
  }, [timezones.length]);

  const rows = useMemo(
    () =>
      timezones.map((timezone) => {
        let time = "";

        try {
          time = new Intl.DateTimeFormat(language, {
            hour: "2-digit",
            hour12: !use_24_hour,
            minute: "2-digit",
            timeZone: timezone,
          }).format(now);
        } catch {
          time = "";
        }

        const delta = day_delta(timezone, now);

        return {
          delta,
          label: zone_label(timezone),
          offset: format_offset(timezone, now),
          time,
          timezone,
        };
      }),
    [language, now, timezones, use_24_hour],
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <div className="mb-1 px-2.5">
        <div className="w-full h-6 flex items-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-txt-muted opacity-70">
            {t("calendar.world_clock")}
          </span>
        </div>
      </div>

      <div className="aster_island overflow-hidden">
        {rows.map((row, index) => (
          <Fragment key={row.timezone}>
            {index > 0 && <IslandDivider />}
            <div
              className="flex items-center justify-between gap-2 px-4 py-2 text-sm min-w-0"
              title={`${row.timezone} ${row.offset}`}
            >
              <span className="truncate min-w-0 text-sm text-txt-muted">
                {row.label}
              </span>
              <span className="flex-shrink-0 text-sm tabular-nums text-txt-primary">
                {row.time}
                {row.delta !== 0 && (
                  <span className="ms-1 text-[10px] text-txt-muted">
                    {row.delta > 0 ? `+${row.delta}` : row.delta}
                  </span>
                )}
              </span>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
