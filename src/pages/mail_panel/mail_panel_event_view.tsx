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
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { useEffect, useMemo, useRef } from "react";
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { EventDetailPopover } from "@/components/calendar/event_detail_popover";
import { use_i18n } from "@/lib/i18n/context";
import { is_birthday_event } from "@/services/calendar/birthdays";
import { is_holiday_event } from "@/services/calendar/holidays";
import { is_subscription_event } from "@/services/calendar/subscriptions";

export function is_read_only_panel_event(event: { id: string }): boolean {
  return (
    is_holiday_event(event) ||
    is_birthday_event(event) ||
    is_subscription_event(event)
  );
}

interface MailPanelEventViewProps {
  event: DecryptedCalendarEvent;
  calendar: DecryptedCalendar | undefined;
  self_email: string;
  time_format: "12h" | "24h";
  date_format: string;
  on_back: () => void;
  on_open_in_calendar: (event: DecryptedCalendarEvent) => void;
  on_delete: (event: DecryptedCalendarEvent) => void;
  on_respond: (
    event: DecryptedCalendarEvent,
    response: CalendarAttendeeResponse,
  ) => void;
}

export function MailPanelEventView({
  event,
  calendar,
  self_email,
  time_format,
  date_format,
  on_back,
  on_open_in_calendar,
  on_delete,
  on_respond,
}: MailPanelEventViewProps) {
  const { t, language } = use_i18n();
  const back_ref = useRef<HTMLButtonElement>(null);
  const read_only = is_read_only_panel_event(event);

  const day_label = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(new Date(event.starts_at)),
    [language, event.starts_at],
  );

  useEffect(() => {
    back_ref.current?.focus({ preventScroll: true });
  }, [event.id]);

  useEffect(() => {
    const handle_key = (pressed: KeyboardEvent) => {
      if (pressed.key !== "Escape" || pressed.defaultPrevented) return;
      if (document.querySelector("[data-radix-popper-content-wrapper]")) {
        return;
      }

      on_back();
    };

    document.addEventListener("keydown", handle_key);

    return () => document.removeEventListener("keydown", handle_key);
  }, [on_back]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 flex-shrink-0 items-center px-2">
        <Button
          ref={back_ref}
          aria-label={t("common.back")}
          className="h-8 min-w-0 gap-1.5 px-2 text-txt-secondary"
          size="sm"
          variant="ghost"
          onClick={on_back}
        >
          <ArrowLeftIcon className="h-4 w-4 flex-shrink-0 rtl:-scale-x-100" />
          <span className="truncate text-[13px]">{day_label}</span>
        </Button>
      </div>
      <div className="panel_inline_detail min-h-0 flex-1 overflow-y-auto px-1">
        <EventDetailPopover
          calendar={calendar}
          date_format={date_format}
          event={event}
          language={language}
          on_delete_request={on_delete}
          on_dismiss={on_back}
          on_edit={on_open_in_calendar}
          on_respond={read_only ? undefined : on_respond}
          read_only={read_only}
          self_email={self_email}
          t={t}
          time_format={time_format}
          variant="inline"
        />
        <div className="px-4 pt-2 pb-5">
          <Button
            className="w-full gap-1.5"
            size="md"
            variant="outline"
            onClick={() => on_open_in_calendar(event)}
          >
            {t("calendar.panel_open_in_calendar")}
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
