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
  CalendarAttendeeResponse,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { event_to_draft, update_event } from "@/services/api/calendar";
import { same_address } from "@/services/calendar/itip";
import { calendar_sync_engine } from "@/services/calendar/sync_engine";

async function current_event(
  event: DecryptedCalendarEvent,
): Promise<DecryptedCalendarEvent | null> {
  await calendar_sync_engine.ensure_loaded();

  const current = calendar_sync_engine.get_bound_event(
    event.recurrence_master_id ?? event.id,
  );

  return current && !current.trashed_at ? current : null;
}

export async function set_own_response(
  snapshot: DecryptedCalendarEvent,
  self_email: string,
  response: CalendarAttendeeResponse,
): Promise<DecryptedCalendarEvent | null> {
  const event = await current_event(snapshot);

  if (!event) {
    return null;
  }

  const has_self = event.attendees.some((attendee) =>
    same_address(attendee.email, self_email),
  );
  const attendees = has_self
    ? event.attendees.map((attendee) =>
        same_address(attendee.email, self_email)
          ? { ...attendee, response }
          : attendee,
      )
    : [
        ...event.attendees,
        {
          email: self_email,
          display_name: null,
          response,
          is_organizer: false,
        },
      ];
  const updated = await update_event(event.id, {
    ...event_to_draft(event),
    attendees,
  });

  return updated.data;
}
