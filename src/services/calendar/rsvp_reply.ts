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
import type { ReplyIdentity } from "./invite_sender";

import { decide_rsvp_reply, send_reply, type Translate } from "./invite_mail";
import { same_address } from "./itip";

export type RsvpReplyOutcome = "sent" | "failed" | "needs_confirmation";

export interface RsvpReplyRequest {
  event: DecryptedCalendarEvent;
  organizer_email: string;
  identity: ReplyIdentity;
  response: CalendarAttendeeResponse;
  authenticated_sender?: string | null;
  confirmed_organizer: boolean;
  t: Translate;
  language: string;
}

export function rsvp_confirmation_key(
  event: Pick<DecryptedCalendarEvent, "id" | "recurrence_master_id">,
  organizer_email: string,
): string {
  return `${event.recurrence_master_id ?? event.id}|${organizer_email.trim().toLowerCase()}`;
}

export async function deliver_rsvp_reply(
  request: RsvpReplyRequest,
): Promise<RsvpReplyOutcome> {
  const decision = decide_rsvp_reply(
    request.organizer_email,
    request.authenticated_sender,
    request.confirmed_organizer,
  );

  if (decision.kind === "confirm") {
    return "needs_confirmation";
  }

  if (decision.kind === "none") {
    return "failed";
  }

  const organizer_party = request.event.attendees.find((attendee) =>
    same_address(attendee.email, request.organizer_email),
  );
  const sent = await send_reply({
    event: request.event,
    organizer: {
      email: request.organizer_email,
      display_name: organizer_party?.display_name ?? null,
    },
    attendee: {
      email: request.identity.reply_email,
      display_name: request.identity.display_name,
    },
    to: decision.to,
    sender: request.identity.sender,
    response: request.response,
    t: request.t,
    language: request.language,
  });

  return sent ? "sent" : "failed";
}
