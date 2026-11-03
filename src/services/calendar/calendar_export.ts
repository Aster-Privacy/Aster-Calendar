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

import { to_iso_date } from "@/components/calendar/date_field";
import { list_event_masters } from "@/services/api/calendar";
import { build_ics } from "@/services/calendar/ics_file";

const EXPORT_YEARS = 3;

export function export_file_name(
  calendar_name: string | null,
  exported_at: Date,
): string {
  const date = to_iso_date(exported_at);
  const slug = (calendar_name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug.length > 0 ? slug : "aster-calendar"}-${date}.ics`;
}

function download_ics(file_name: string, text: string): void {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = file_name;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function export_calendar_events(
  calendar: Pick<DecryptedCalendar, "id" | "name"> | null,
): Promise<number> {
  const now = new Date();
  const result = await list_event_masters(
    new Date(now.getFullYear() - EXPORT_YEARS, 0, 1),
    new Date(now.getFullYear() + EXPORT_YEARS, 11, 31),
  );
  const events = calendar
    ? result.data.filter((event) => event.calendar_id === calendar.id)
    : result.data;

  if (events.length === 0) {
    return 0;
  }

  download_ics(
    export_file_name(calendar ? calendar.name : null, now),
    build_ics(events, now.toISOString()),
  );

  return events.length;
}
