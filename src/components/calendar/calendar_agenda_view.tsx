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
import type { CalendarEventMenuActions } from "@/components/calendar/calendar_event_context_menu";
import type { TranslationKey } from "@/lib/i18n";
import type {
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MapPinIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { CalendarEmptyState } from "@/components/calendar/calendar_empty_state";
import { EmptyScheduleIllustration } from "@/components/calendar/illustrations/calendar_illustrations";

import { Fragment, memo, useEffect, useRef } from "react";

import { CalendarEventContextMenu } from "@/components/calendar/calendar_event_context_menu";
import { EventKindIcon } from "@/components/calendar/event_kind_icon";
import {
  add_days,
  end_of_day,
  events_for_day,
  task_title_class,
  is_same_day,
  resolve_event_color,
  start_of_day,
  event_occurrence_key,
} from "@/components/calendar/calendar_utils";
import { use_calendar_now_tick } from "@/components/calendar/use_calendar_now_tick";
import { format_time } from "@/utils/date_format";
import { use_i18n } from "@/lib/i18n/context";

const MONTH_HEADER_HEIGHT = "32px";
const NOW_COLOR = "var(--calendar_now_line, var(--accent-color))";
const RELATIVE_LABEL_MAX_LENGTH = 9;
const DAY_PERIOD_PATTERN = /\s*(AM|PM|am|pm|a\.m\.|p\.m\.)$/;

export function relative_day_label(
  day: Date,
  today: Date,
  language: string,
): string {
  const weekday = new Intl.DateTimeFormat(language, {
    weekday: "short",
  }).format(day);
  const offset = Math.round(
    (start_of_day(day).getTime() - start_of_day(today).getTime()) / 86_400_000,
  );

  if (offset !== 0 && offset !== 1) {
    return weekday;
  }

  const relative = new Intl.RelativeTimeFormat(language, {
    numeric: "auto",
  }).format(offset, "day");

  if (/\d/.test(relative) || relative.length > RELATIVE_LABEL_MAX_LENGTH) {
    return weekday;
  }

  return relative.charAt(0).toLocaleUpperCase(language) + relative.slice(1);
}

export function compact_time_range(
  start_text: string,
  end_text: string,
): string {
  const start_period = start_text.match(DAY_PERIOD_PATTERN)?.[1];
  const end_period = end_text.match(DAY_PERIOD_PATTERN)?.[1];
  const start =
    start_period && start_period === end_period
      ? start_text.replace(DAY_PERIOD_PATTERN, "")
      : start_text;

  return `${start} - ${end_text}`;
}

function span_position(
  starts_at: Date,
  ends_at: Date,
  day: Date,
): { current: number; total: number } {
  const first = start_of_day(starts_at).getTime();
  const last_moment =
    ends_at.getTime() > starts_at.getTime()
      ? new Date(ends_at.getTime() - 1)
      : starts_at;
  const last = start_of_day(last_moment).getTime();
  const total = Math.max(1, Math.round((last - first) / 86_400_000) + 1);
  const offset = Math.round((start_of_day(day).getTime() - first) / 86_400_000);
  const current = Math.min(total, Math.max(1, offset + 1));

  return { current, total };
}

function now_divider_index(
  day_events: DecryptedCalendarEvent[],
  now: Date,
): number {
  const timed = day_events.some((event) => !event.is_all_day);

  if (!timed) {
    return -1;
  }

  const first_upcoming = day_events.findIndex(
    (event) =>
      !event.is_all_day && new Date(event.starts_at).getTime() >= now.getTime(),
  );

  if (first_upcoming === -1) {
    return day_events.length;
  }

  return first_upcoming;
}

interface CalendarAgendaViewProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  anchor_date: Date;
  events: DecryptedCalendarEvent[];
  calendar_by_id: Map<string, DecryptedCalendar>;
  calendars: DecryptedCalendar[];
  event_menu_actions: CalendarEventMenuActions;
  time_format: "12h" | "24h";
  selected_event_id: string | null;
  on_event_click: (event: DecryptedCalendarEvent) => void;
  on_create_click?: () => void;
  day_count: number;
  has_more: boolean;
  is_loading_more: boolean;
  on_load_more: () => void;
}

function month_key(day: Date): string {
  return `${day.getFullYear()}-${day.getMonth()}`;
}

function format_month_label(day: Date, language: string): string {
  return new Intl.DateTimeFormat(language, {
    month: "long",
    year: "numeric",
  }).format(day);
}

function NowDivider() {
  return (
    <div aria-hidden="true" className="flex items-center py-1 ps-3">
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

export const CalendarAgendaView = memo(function CalendarAgendaView({
  t,
  anchor_date,
  events,
  calendar_by_id,
  calendars,
  event_menu_actions,
  time_format,
  selected_event_id,
  on_event_click,
  on_create_click,
  day_count,
  has_more,
  is_loading_more,
  on_load_more,
}: CalendarAgendaViewProps) {
  const { language } = use_i18n();
  const today = use_calendar_now_tick();
  const scroll_ref = useRef<HTMLDivElement>(null);
  const sentinel_ref = useRef<HTMLDivElement>(null);
  const range_days = Array.from({ length: day_count + 1 }, (_, index) =>
    add_days(anchor_date, index),
  );
  const day_groups = range_days
    .map((day) => ({ day, day_events: events_for_day(events, day) }))
    .filter(
      (group) => group.day_events.length > 0 || is_same_day(group.day, today),
    );
  const has_any_event = day_groups.some((group) => group.day_events.length > 0);
  const can_load_more = has_more && !is_loading_more;

  useEffect(() => {
    const root = scroll_ref.current;
    const sentinel = sentinel_ref.current;

    if (!can_load_more || !root || !sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          on_load_more();
        }
      },
      { root, rootMargin: "0px 0px 600px 0px" },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [can_load_more, on_load_more, day_count]);

  const render_time_column = (event: DecryptedCalendarEvent, day: Date) => {
    const starts_at = new Date(event.starts_at);
    const ends_at = new Date(event.ends_at);
    const starts_before = starts_at.getTime() < start_of_day(day).getTime();
    const ends_after = ends_at.getTime() > end_of_day(day).getTime();
    const spans_whole_day = starts_before && ends_after;
    const column_class =
      "flex w-[128px] flex-shrink-0 items-center gap-1 text-[12px] tabular-nums text-txt-muted";

    if (event.is_all_day || spans_whole_day) {
      const { current, total } = span_position(starts_at, ends_at, day);

      return (
        <span className={column_class}>
          <span className="truncate">{t("calendar.all_day")}</span>
          {total > 1 && (
            <span className="truncate">
              {t("calendar.day_of_span", { current, total })}
            </span>
          )}
        </span>
      );
    }

    const format_options = {
      date_format: "MM/DD/YYYY" as const,
      time_format,
    };
    const segment_start = starts_before ? start_of_day(day) : starts_at;
    const segment_end = ends_after ? end_of_day(day) : ends_at;
    const continuation_icon_class =
      "h-3 w-3 flex-shrink-0 text-txt-muted rtl:-scale-x-100";

    return (
      <span className={column_class}>
        {starts_before && (
          <ChevronLeftIcon
            aria-label={t("calendar.continues_from_previous_day")}
            className={continuation_icon_class}
            role="img"
            strokeWidth={2.25}
          />
        )}
        <span className="truncate" dir="ltr">
          {compact_time_range(
            format_time(segment_start, format_options),
            format_time(segment_end, format_options),
          )}
        </span>
        {ends_after && (
          <ChevronRightIcon
            aria-label={t("calendar.continues_to_next_day")}
            className={continuation_icon_class}
            role="img"
            strokeWidth={2.25}
          />
        )}
      </span>
    );
  };

  if (!has_any_event && !has_more) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center">
        <div aria-hidden="true" className="min-h-6 flex-[38]" />
        <CalendarEmptyState
          action={
            on_create_click && (
              <Button
                className="gap-2"
                size="sm"
                variant="depth"
                onClick={on_create_click}
              >
                <PlusIcon aria-hidden="true" className="h-4 w-4" />
                <span>{t("calendar.create_event")}</span>
              </Button>
            )
          }
          body={t("calendar.no_upcoming_events_hint")}
          className="py-0"
          data-testid="calendar-agenda-empty"
          illustration={<EmptyScheduleIllustration />}
          title={t("calendar.no_upcoming_events")}
        />
        <div aria-hidden="true" className="flex-[62]" />
      </div>
    );
  }

  let rendered_month = "";

  return (
    <div
      ref={scroll_ref}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth pb-6"
    >
      {day_groups.map(({ day, day_events }) => {
        const is_today = is_same_day(day, today);
        const is_past_day = day.getTime() < start_of_day(today).getTime();
        const current_month = month_key(day);
        const show_month_header = current_month !== rendered_month;

        rendered_month = current_month;

        return (
          <div key={day.toISOString()}>
            {show_month_header && (
              <div
                className="sticky top-0 z-20 flex items-center border-b border-edge-secondary px-5 text-[11px] font-semibold uppercase tracking-wider text-txt-muted"
                style={{
                  height: MONTH_HEADER_HEIGHT,
                  backgroundColor: "var(--bg-primary)",
                }}
              >
                {format_month_label(day, language)}
              </div>
            )}

            <div
              aria-current={is_today ? "date" : undefined}
              className={`flex gap-2 px-2 py-3 sm:px-3 ${
                show_month_header ? "" : "border-t border-edge-secondary"
              }`}
            >
              <div className="w-16 flex-shrink-0">
                <div
                  className="sticky flex flex-col items-center"
                  style={{ top: MONTH_HEADER_HEIGHT }}
                >
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
                  <div className="flex h-10 items-center gap-2 px-3 text-[13px] text-txt-muted">
                    <CalendarDaysIcon
                      aria-hidden="true"
                      className="h-4 w-4 flex-shrink-0"
                    />
                    <span className="truncate">
                      {t("calendar.no_upcoming_events")}
                    </span>
                  </div>
                )}

                {day_events.map((event, event_index) => {
                  const show_now_before =
                    is_today &&
                    event_index === now_divider_index(day_events, today);
                  const calendar = calendar_by_id.get(event.calendar_id);
                  const color = resolve_event_color(event, calendar?.color);
                  const is_active =
                    event_occurrence_key(event) === selected_event_id;
                  const is_past =
                    new Date(event.ends_at).getTime() < today.getTime();

                  return (
                    <Fragment key={event.id}>
                      {show_now_before && <NowDivider />}
                      <CalendarEventContextMenu
                        actions={event_menu_actions}
                        calendars={calendars}
                        event={event}
                        t={t}
                      >
                        <button
                          aria-pressed={is_active}
                          className={`flex h-10 w-full items-center gap-3 rounded-[var(--aster-radius-item)] px-3 text-start transition-colors duration-150 ease-out focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 ${
                            is_active
                              ? "bg-[var(--aster-selected)]"
                              : "hover:bg-[var(--aster-hover)]"
                          }`}
                          data-event-id={event.id}
                          style={{
                            opacity: is_past && !is_active ? 0.6 : undefined,
                            outlineColor: "var(--accent-color)",
                          }}
                          title={event.title}
                          type="button"
                          onClick={() => on_event_click(event)}
                          onDoubleClick={(dbl) => {
                            dbl.stopPropagation();
                            event_menu_actions.on_edit(event);
                          }}
                        >
                          {render_time_column(event, day)}

                          <span
                            aria-hidden="true"
                            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: color }}
                          />

                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="flex min-w-0 items-center gap-1.5 text-[14px] font-medium text-txt-primary">
                              <EventKindIcon kind={event.event_kind} />
                              <span
                                className={`truncate${task_title_class(event)}`}
                              >
                                {event.title || t("calendar.untitled_event")}
                              </span>
                            </span>
                            {event.location && (
                              <span className="hidden min-w-0 items-center gap-1 text-[12px] text-txt-muted sm:flex">
                                <MapPinIcon
                                  aria-hidden="true"
                                  className="h-3 w-3 flex-shrink-0"
                                />
                                <span className="truncate">
                                  {event.location}
                                </span>
                              </span>
                            )}
                          </span>
                        </button>
                      </CalendarEventContextMenu>
                    </Fragment>
                  );
                })}
                {is_today &&
                  day_events.length > 0 &&
                  now_divider_index(day_events, today) ===
                    day_events.length && <NowDivider />}
              </div>
            </div>
          </div>
        );
      })}
      {has_more && (
        <div ref={sentinel_ref} aria-hidden="true" className="h-px w-full" />
      )}
    </div>
  );
});
