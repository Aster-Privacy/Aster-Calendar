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
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";
import type { DayBuckets } from "@/pages/mail_panel/mail_panel_days";

import { Fragment, memo, useMemo } from "react";

import { EventKindIcon } from "@/components/calendar/event_kind_icon";
import {
  add_days,
  is_same_day,
  resolve_event_color,
  start_of_day,
  task_title_class,
} from "@/components/calendar/calendar_utils";
import { relative_day_label } from "@/components/calendar/calendar_agenda_view";
import { format_time } from "@/utils/date_format";
import { use_i18n } from "@/lib/i18n/context";
import { events_on } from "@/pages/mail_panel/mail_panel_days";

const NOW_COLOR = "var(--calendar_now_line, var(--accent-color))";

export function now_divider_index(
  day_events: DecryptedCalendarEvent[],
  now: Date,
): number {
  if (!day_events.some((event) => !event.is_all_day)) return -1;

  const first_upcoming = day_events.findIndex(
    (event) =>
      !event.is_all_day && new Date(event.starts_at).getTime() >= now.getTime(),
  );

  return first_upcoming === -1 ? day_events.length : first_upcoming;
}

function NowDivider() {
  return (
    <div aria-hidden="true" className="flex items-center py-1 ps-3 pe-1">
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: NOW_COLOR }}
      />
      <span
        className="h-[2px] flex-1 rounded-full"
        style={{ backgroundColor: NOW_COLOR }}
      />
    </div>
  );
}

interface MailPanelAgendaProps {
  anchor_date: Date;
  now_ms: number;
  day_buckets: DayBuckets;
  calendars: DecryptedCalendar[];
  day_count: number;
  time_format: "12h" | "24h";
  selected_event_id: string | null;
  on_event_click: (event: DecryptedCalendarEvent) => void;
}

export const MailPanelAgenda = memo(function MailPanelAgenda({
  anchor_date,
  now_ms,
  day_buckets,
  calendars,
  day_count,
  time_format,
  selected_event_id,
  on_event_click,
}: MailPanelAgendaProps) {
  const { t, language } = use_i18n();
  const now = useMemo(() => new Date(now_ms), [now_ms]);
  const today_ms = start_of_day(now).getTime();
  const today = useMemo(() => new Date(today_ms), [today_ms]);
  const anchor_ms = start_of_day(anchor_date).getTime();

  const calendar_by_id = useMemo(
    () => new Map(calendars.map((calendar) => [calendar.id, calendar])),
    [calendars],
  );

  const day_groups = useMemo(() => {
    const anchor = new Date(anchor_ms);
    const today_day = new Date(today_ms);

    return Array.from({ length: day_count + 1 }, (_, index) =>
      add_days(anchor, index),
    )
      .map((day) => ({ day, day_events: events_on(day_buckets, day) }))
      .filter(
        (group) =>
          group.day_events.length > 0 || is_same_day(group.day, today_day),
      );
  }, [anchor_ms, today_ms, day_count, day_buckets]);

  const format_options = { date_format: "MM/DD/YYYY" as const, time_format };

  if (day_groups.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-[13px] text-txt-muted">
        {t("calendar.up_next_empty")}
      </p>
    );
  }

  return (
    <div className="pb-2">
      {day_groups.map(({ day, day_events }, group_index) => {
        const is_today = is_same_day(day, today);
        const is_past_day = day.getTime() < today_ms;
        const divider_index = is_today
          ? now_divider_index(day_events, now)
          : -1;

        return (
          <div
            key={day.toISOString()}
            aria-current={is_today ? "date" : undefined}
            className={`mx-1.5 flex gap-1 py-3 ${group_index === 0 ? "" : "border-t border-edge-secondary"}`}
            data-day={day.toISOString().slice(0, 10)}
          >
            <div className="w-[74px] flex-shrink-0">
              <div className="flex flex-col items-center">
                <span
                  className="max-w-full truncate whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider"
                  style={{
                    color: is_today
                      ? "var(--accent-color)"
                      : "var(--text-muted)",
                  }}
                >
                  {relative_day_label(day, today, language)}
                </span>
                <span
                  className="mt-0.5 inline-flex h-9 min-w-9 items-center justify-center rounded-full px-1 text-[18px] font-medium tabular-nums"
                  style={{
                    backgroundColor: is_today
                      ? "var(--accent-color)"
                      : undefined,
                    color: is_today
                      ? "var(--accent-fg, #ffffff)"
                      : is_past_day
                        ? "var(--text-muted)"
                        : "var(--text-primary)",
                  }}
                >
                  {day.getDate()}
                </span>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {day_events.length === 0 && (
                <p className="flex h-10 items-center px-2.5 text-[13px] text-txt-muted">
                  {t("calendar.panel_nothing_today")}
                </p>
              )}
              {day_events.map((event, event_index) => {
                const color = resolve_event_color(
                  event,
                  calendar_by_id.get(event.calendar_id)?.color,
                );
                const is_active = event.id === selected_event_id;
                const is_past = new Date(event.ends_at).getTime() < now_ms;
                const title =
                  event.title.trim() || t("calendar.untitled_event");

                return (
                  <Fragment key={event.id}>
                    {event_index === divider_index && <NowDivider />}
                    <button
                      aria-pressed={is_active}
                      className={`flex min-h-10 w-full items-start gap-2 rounded-[var(--aster-radius-item)] px-2 py-[11px] text-start transition-colors duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] ${
                        is_active
                          ? "bg-[var(--aster-selected)]"
                          : "hover:bg-[var(--aster-hover)]"
                      }`}
                      data-event-id={event.id}
                      style={{
                        opacity: is_past && !is_active ? 0.6 : undefined,
                      }}
                      title={title}
                      type="button"
                      onClick={() => on_event_click(event)}
                    >
                      <span className="flex h-[18px] w-[62px] flex-shrink-0 items-center text-[12px] tabular-nums text-txt-muted">
                        <span className="truncate" dir="ltr">
                          {event.is_all_day
                            ? t("calendar.all_day")
                            : format_time(
                                new Date(event.starts_at),
                                format_options,
                              )}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="flex min-w-0 flex-1 items-start gap-1.5 text-[14px] font-medium leading-[18px] text-txt-primary">
                        <EventKindIcon
                          className="mt-[3px] h-3 w-3 flex-shrink-0"
                          kind={event.event_kind}
                        />
                        <span
                          className={`line-clamp-2 min-w-0 break-words${task_title_class(event)}`}
                        >
                          {title}
                        </span>
                      </span>
                    </button>
                  </Fragment>
                );
              })}
              {divider_index === day_events.length && day_events.length > 0 && (
                <NowDivider />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});
