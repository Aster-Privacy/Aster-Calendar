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
import type { CalendarAttendeeResponse } from "@/types/calendar";
import type { ComponentType, SVGProps } from "react";

import {
  CheckIcon,
  ClockIcon,
  QuestionMarkCircleIcon,
  UserIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

const RESPONSE_ICONS: Record<
  CalendarAttendeeResponse,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  accepted: CheckIcon,
  tentative: QuestionMarkCircleIcon,
  declined: XMarkIcon,
  needs_action: ClockIcon,
};

const RESPONSE_TONES: Record<CalendarAttendeeResponse, string> = {
  accepted: "calendar_rsvp_accepted",
  tentative: "calendar_rsvp_tentative",
  declined: "calendar_rsvp_declined",
  needs_action: "text-txt-secondary",
};

export function AttendeeResponseStatus({
  response,
  label,
  is_organizer = false,
  class_name = "",
}: {
  response: CalendarAttendeeResponse;
  label: string;
  is_organizer?: boolean;
  class_name?: string;
}) {
  const Icon = is_organizer ? UserIcon : RESPONSE_ICONS[response];
  const tone = is_organizer ? "text-txt-secondary" : RESPONSE_TONES[response];

  return (
    <span
      className={`inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap text-[12px] leading-4 ${tone} ${class_name}`}
      data-response={is_organizer ? "organizer" : response}
    >
      <Icon
        aria-hidden="true"
        className="h-3.5 w-3.5 flex-shrink-0"
        strokeWidth={2}
      />
      <span>{label}</span>
    </span>
  );
}
