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
import type {
  CalendarEventDraft,
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { event_to_draft } from "@/services/calendar/calendar_codec";
import { is_read_only_event } from "@/services/calendar/display_colors";

export class NoDuplicateTargetError extends Error {
  constructor() {
    super("no_duplicate_target");
    this.name = "NoDuplicateTargetError";
  }
}

export function resolve_duplicate_calendar_id(
  event: DecryptedCalendarEvent,
  calendars: DecryptedCalendar[],
  preferred_calendar_id: string,
): string | null {
  if (
    !is_read_only_event(event) &&
    calendars.some((calendar) => calendar.id === event.calendar_id)
  ) {
    return event.calendar_id;
  }

  const visible = calendars.filter((calendar) => calendar.is_visible);

  for (const pool of [visible, calendars]) {
    const match =
      pool.find((calendar) => calendar.id === preferred_calendar_id) ??
      pool.find((calendar) => calendar.is_default) ??
      pool[0];

    if (match) {
      return match.id;
    }
  }

  return null;
}

export function build_duplicate_draft(
  event: DecryptedCalendarEvent,
  calendar_id: string,
  title: string,
): CalendarEventDraft {
  const from_read_only_source = is_read_only_event(event);

  return {
    ...event_to_draft(event),
    calendar_id,
    title,
    color: from_read_only_source ? null : event.color,
    recurrence: null,
    recurrence_exceptions: [],
    uid: null,
    recurrence_id: null,
    sequence: 0,
    trashed_at: null,
  };
}
