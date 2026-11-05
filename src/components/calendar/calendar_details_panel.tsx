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
import type { TranslationKey } from "@/lib/i18n";
import type {
  CalendarAttendee,
  CalendarAttendeeResponse,
  CalendarEventKind,
  CalendarWorkingLocation,
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import {
  ArrowPathIcon,
  CalendarDaysIcon,
  DocumentDuplicateIcon,
  MapPinIcon,
  PencilSquareIcon,
  TrashIcon,
  VideoCameraIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import {
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";

import { Button, IslandDivider, IslandIconButton, Tooltip } from "@aster/ui";

import {
  events_for_day,
  is_same_day,
  resolve_event_color,
  start_of_day,
  tag_color,
} from "@/components/calendar/calendar_utils";
import { relative_day_label } from "@/components/calendar/calendar_agenda_view";
import { describe_recurrence } from "@/components/calendar/recurrence_field";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { AttendeeResponseStatus } from "@/components/calendar/attendee_response_status";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { format_time } from "@/utils/date_format";
import { calendar_now } from "@/services/calendar/view_zone";
import { is_holiday_event } from "@/services/calendar/holidays";
import { is_event_organizer, same_address } from "@/services/calendar/itip";
import {
  is_own_address,
  use_own_addresses_version,
} from "@/services/calendar/own_addresses";
import {
  is_birthday_event,
  is_birthday_kind,
} from "@/services/calendar/birthdays";
import { is_subscription_event } from "@/services/calendar/subscriptions";
import { is_booking_event } from "@/services/calendar/appointments";
import { safe_http_url } from "@/services/calendar/safe_url";
import { use_guarded_link } from "@/components/calendar/use_guarded_link";
import { show_toast } from "@/components/toast/simple_toast";

const EVENT_KIND_LABELS: Record<CalendarEventKind, TranslationKey> = {
  default: "calendar.event_kind_default",
  task: "calendar.event_kind_task",
  out_of_office: "calendar.event_kind_out_of_office",
  focus_time: "calendar.event_kind_focus_time",
  working_location: "calendar.event_kind_working_location",
  birthday: "calendar.event_kind_birthday",
};

const RESPONSE_LABELS: Record<CalendarAttendeeResponse, TranslationKey> = {
  accepted: "calendar.attendee_accepted",
  tentative: "calendar.attendee_tentative",
  declined: "calendar.attendee_declined",
  needs_action: "calendar.attendee_pending",
};

const RESPONSE_OPTIONS: Array<{
  value: CalendarAttendeeResponse;
  label: TranslationKey;
}> = [
  { value: "accepted", label: "calendar.invite_yes" },
  { value: "tentative", label: "calendar.invite_maybe" },
  { value: "declined", label: "calendar.invite_no" },
];

const WORKING_LOCATION_LABELS: Record<CalendarWorkingLocation, TranslationKey> =
  {
    home: "calendar.working_location_home",
    office: "calendar.working_location_office",
    other: "calendar.working_location_other",
  };

const MAX_UPCOMING = 6;
const PANEL_WIDTH = "min(320px, 78vw)";
const PANEL_GAP_PX = 8;
const SECTION_TITLE_CLASS = "text-[13px] font-medium text-txt-primary";

interface CalendarDetailsPanelProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  events: DecryptedCalendarEvent[];
  selected_date: Date;
  selected_event: DecryptedCalendarEvent | null;
  calendar_by_id: Map<string, DecryptedCalendar>;
  time_format: "12h" | "24h";
  on_event_click: (event: DecryptedCalendarEvent) => void;
  on_edit: (event: DecryptedCalendarEvent) => void;
  on_delete_request: (event: DecryptedCalendarEvent) => void;
  on_toggle_task_done: (event: DecryptedCalendarEvent) => void;
  on_dismiss: () => void;
  self_email?: string;
  on_respond?: (
    event: DecryptedCalendarEvent,
    response: CalendarAttendeeResponse,
  ) => void;
}

function format_range(
  event: DecryptedCalendarEvent,
  time_format: "12h" | "24h",
  t: CalendarDetailsPanelProps["t"],
): string {
  if (event.is_all_day) {
    return t("calendar.all_day");
  }

  const options = { date_format: "MM/DD/YYYY" as const, time_format };

  return `⁦${format_time(new Date(event.starts_at), options)} - ${format_time(
    new Date(event.ends_at),
    options,
  )}⁩`;
}

function format_start(
  event: DecryptedCalendarEvent,
  time_format: "12h" | "24h",
  t: CalendarDetailsPanelProps["t"],
): string {
  if (event.is_all_day) {
    return t("calendar.all_day");
  }

  return format_time(new Date(event.starts_at), {
    date_format: "MM/DD/YYYY",
    time_format,
  });
}

function group_by_day(
  events: DecryptedCalendarEvent[],
): Array<{ day: Date; events: DecryptedCalendarEvent[] }> {
  const groups: Array<{ day: Date; events: DecryptedCalendarEvent[] }> = [];

  for (const event of events) {
    const day = start_of_day(new Date(event.starts_at));
    const last = groups[groups.length - 1];

    if (last && last.day.getTime() === day.getTime()) {
      last.events.push(event);
    } else {
      groups.push({ day, events: [event] });
    }
  }

  return groups;
}

export function CalendarDetailsPanel({
  t,
  events,
  selected_date,
  selected_event,
  calendar_by_id,
  time_format,
  on_event_click,
  on_edit,
  on_delete_request,
  on_toggle_task_done,
  on_dismiss,
  self_email = "",
  on_respond,
}: CalendarDetailsPanelProps) {
  const { language } = use_i18n();
  const { guard_link_click } = use_guarded_link();

  const handle_response_key = (pressed: ReactKeyboardEvent<HTMLElement>) => {
    const is_rtl = document.documentElement.dir === "rtl";
    const forward_keys = is_rtl
      ? ["ArrowLeft", "ArrowDown"]
      : ["ArrowRight", "ArrowDown"];
    const backward_keys = is_rtl
      ? ["ArrowRight", "ArrowUp"]
      : ["ArrowLeft", "ArrowUp"];
    const step = forward_keys.includes(pressed.key)
      ? 1
      : backward_keys.includes(pressed.key)
        ? -1
        : 0;

    if (step === 0 || !selected_event) {
      return;
    }

    pressed.preventDefault();

    const radios = Array.from(
      pressed.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="radio"]',
      ),
    );
    const current = radios.findIndex(
      (radio) => radio === document.activeElement,
    );
    const next_index =
      (Math.max(0, current) + step + radios.length) % radios.length;
    const next = radios[next_index];
    const option = RESPONSE_OPTIONS[next_index];

    next?.focus();

    if (option) {
      on_respond?.(selected_event, option.value);
    }
  };
  const reduce_motion = use_should_reduce_motion();
  const day_events = events_for_day(events, selected_date);

  const upcoming_groups = useMemo(() => {
    const cutoff = selected_date.getTime();

    return group_by_day(
      events
        .filter((event) => new Date(event.starts_at).getTime() > cutoff)
        .sort(
          (left, right) =>
            new Date(left.starts_at).getTime() -
            new Date(right.starts_at).getTime(),
        )
        .slice(0, MAX_UPCOMING),
    );
  }, [events, selected_date]);

  const own_addresses_version = use_own_addresses_version();
  const own_response = useMemo(
    () =>
      selected_event?.attendees.find(
        (attendee) =>
          !attendee.is_organizer && is_own_address(attendee.email, self_email),
      )?.response ?? null,
    [selected_event, self_email, own_addresses_version],
  );
  const can_respond =
    selected_event !== null &&
    on_respond !== undefined &&
    self_email.length > 0 &&
    selected_event.attendees.length > 0 &&
    (!is_event_organizer(selected_event, self_email) ||
      selected_event.attendees.some(
        (attendee) =>
          !attendee.is_organizer && is_own_address(attendee.email, self_email),
      ));
  const guest_permission_summary = useMemo(() => {
    if (!selected_event) {
      return "";
    }

    const granted: string[] = [];

    if (selected_event.guests_can_modify) {
      granted.push(t("calendar.guest_permission_modify_phrase"));
    }

    if (selected_event.guests_can_invite) {
      granted.push(t("calendar.guest_permission_invite_phrase"));
    }

    if (selected_event.guests_can_see_guests) {
      granted.push(t("calendar.guest_permission_see_guests_phrase"));
    }

    if (granted.length === 0) {
      return t("calendar.guest_permissions_none");
    }

    const list_format = (
      Intl as unknown as {
        ListFormat?: new (
          locale?: string,
          options?: { style?: string; type?: string },
        ) => { format: (items: string[]) => string };
      }
    ).ListFormat;

    return t("calendar.guests_can_list", {
      list: list_format
        ? new list_format(language, {
            style: "long",
            type: "conjunction",
          }).format(granted)
        : granted.join(", "),
    });
  }, [selected_event, t, language]);

  const day_label = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        day: "numeric",
        month: "short",
        weekday: "long",
      }).format(selected_date),
    [language, selected_date],
  );

  const format_long_date = (date: Date) =>
    new Intl.DateTimeFormat(language, {
      day: "numeric",
      month: "long",
      weekday: "long",
    }).format(date);

  const format_group_label = (day: Date) =>
    `${relative_day_label(day, calendar_now(), language)}, ${new Intl.DateTimeFormat(
      language,
      { day: "numeric", month: "short" },
    ).format(day)}`;

  const render_icon_button = (
    label: string,
    icon: ReactNode,
    on_click: () => void,
  ) => (
    <Tooltip tip={label}>
      <IslandIconButton
        className="text-txt-secondary"
        label={label}
        size="sm"
        onClick={on_click}
      >
        {icon}
      </IslandIconButton>
    </Tooltip>
  );

  const render_meta_row = (icon: ReactNode, value: ReactNode) => (
    <div className="flex items-start gap-3 text-[13px] leading-5 text-txt-secondary">
      <span
        aria-hidden="true"
        className="flex h-5 w-4 flex-shrink-0 items-center justify-center text-txt-muted"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 break-words">{value}</span>
    </div>
  );

  const render_row = (event: DecryptedCalendarEvent) => {
    const color = resolve_event_color(
      event,
      calendar_by_id.get(event.calendar_id)?.color,
    );
    const title = event.title || t("calendar.untitled_event");
    const is_selected = event.id === selected_event?.id;

    return (
      <li key={event.id}>
        <button
          aria-current={is_selected ? "true" : undefined}
          aria-label={`${title}, ${format_long_date(
            new Date(event.starts_at),
          )}, ${format_range(event, time_format, t)}`}
          className={`flex h-8 w-full items-center gap-2.5 rounded-[var(--aster-radius-item)] px-2 text-start transition-colors duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] ${
            is_selected
              ? "bg-[var(--aster-hover)]"
              : "hover:bg-[var(--aster-hover)]"
          }`}
          type="button"
          onClick={() => on_event_click(event)}
        >
          <span
            aria-hidden="true"
            className="h-4 w-[3px] flex-shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span
            className={`min-w-0 flex-1 truncate text-[13px] text-txt-primary ${
              event.is_completed ? "line-through opacity-60" : ""
            }`}
          >
            {title}
          </span>
          <span className="flex-shrink-0 whitespace-nowrap text-[12px] tabular-nums text-txt-muted">
            {format_start(event, time_format, t)}
          </span>
        </button>
      </li>
    );
  };

  const render_upcoming = () => (
    <section aria-label={t("calendar.upcoming")} className="flex flex-col">
      <h4 className={`${SECTION_TITLE_CLASS} mb-1`}>
        {t("calendar.upcoming")}
      </h4>
      {upcoming_groups.map((group) => (
        <div key={group.day.getTime()} className="flex flex-col">
          <span className="pb-0.5 pt-2 text-[12px] text-txt-muted">
            {format_group_label(group.day)}
          </span>
          <ul className="flex flex-col gap-1">
            {group.events.map((event) => render_row(event))}
          </ul>
        </div>
      ))}
    </section>
  );

  const render_guest = (attendee: CalendarAttendee) => {
    const display_name = attendee.display_name?.trim() ?? "";
    const name = display_name || attendee.email;
    const show_email =
      display_name.length > 0 && !same_address(display_name, attendee.email);

    return (
      <li key={attendee.email} className="flex items-center gap-2.5 py-1.5">
        <ProfileAvatar email={attendee.email} name={name} size="xs" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] leading-5 text-txt-primary">
            {name}
          </span>
          {show_email && (
            <span className="truncate text-[12px] leading-4 text-txt-secondary">
              {attendee.email}
            </span>
          )}
        </span>
        <AttendeeResponseStatus
          is_organizer={attendee.is_organizer}
          label={
            attendee.is_organizer
              ? t("calendar.organizer")
              : t(RESPONSE_LABELS[attendee.response])
          }
          response={attendee.response}
        />
      </li>
    );
  };

  const render_event_details = (event: DecryptedCalendarEvent) => {
    const calendar_name = is_birthday_kind(event)
      ? t("calendar.settings_birthdays")
      : (calendar_by_id.get(event.calendar_id)?.name ?? t("calendar.calendar"));
    const kind_label =
      event.event_kind === "default"
        ? null
        : event.event_kind === "working_location" &&
            event.working_location !== null
          ? `${t(EVENT_KIND_LABELS[event.event_kind])}: ${t(
              WORKING_LOCATION_LABELS[event.working_location],
            )}`
          : t(EVENT_KIND_LABELS[event.event_kind]);
    const starts = new Date(event.starts_at);
    const ends = new Date(event.ends_at);
    const spans_days = !event.is_all_day && !is_same_day(starts, ends);
    const time_options = { date_format: "MM/DD/YYYY" as const, time_format };
    const conference_url = safe_http_url(event.conference_url);
    const is_task = event.event_kind === "task";
    const has_meta = Boolean(event.recurrence) || event.location.length > 0;

    return (
      <div className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h3
            className={`break-words text-[18px] font-semibold leading-snug text-txt-primary ${
              event.is_completed ? "line-through opacity-60" : ""
            }`}
          >
            {event.title || t("calendar.untitled_event")}
          </h3>
          {spans_days ? (
            <p className="text-[13px] leading-5 text-txt-secondary">
              <span className="block">
                {`${format_long_date(starts)}, ${format_time(starts, time_options)} -`}
              </span>
              <span className="block">
                {`${format_long_date(ends)}, ${format_time(ends, time_options)}`}
              </span>
            </p>
          ) : (
            <p className="text-[13px] leading-5 text-txt-secondary">
              {format_long_date(starts)}
              <span aria-hidden="true" className="px-1.5 text-txt-muted">
                ·
              </span>
              <span className="tabular-nums">
                {format_range(event, time_format, t)}
              </span>
            </p>
          )}
          <p className="flex min-w-0 items-center gap-2 text-[13px] leading-5 text-txt-muted">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px]"
              style={{
                backgroundColor: resolve_event_color(
                  event,
                  calendar_by_id.get(event.calendar_id)?.color,
                ),
              }}
            />
            <span className="min-w-0 truncate">
              {kind_label ? `${calendar_name} · ${kind_label}` : calendar_name}
            </span>
          </p>
        </div>

        {(is_task || conference_url) && (
          <div className="flex flex-wrap items-center gap-2">
            {is_task && (
              <Button
                size="sm"
                type="button"
                variant={event.is_completed ? "ghost" : "depth"}
                onClick={() => on_toggle_task_done(event)}
              >
                {event.is_completed
                  ? t("calendar.mark_not_done")
                  : t("calendar.mark_done")}
              </Button>
            )}
            {conference_url && (
              <>
                <Button as_child className="gap-2" size="sm" variant="depth">
                  <a
                    href={conference_url}
                    rel="noopener noreferrer"
                    target="_blank"
                    onAuxClick={guard_link_click}
                    onClick={guard_link_click}
                  >
                    <VideoCameraIcon aria-hidden="true" className="h-4 w-4" />
                    {t("calendar.join_conference")}
                  </a>
                </Button>
                {render_icon_button(
                  t("common.copy"),
                  <DocumentDuplicateIcon className="h-4 w-4" />,
                  () => {
                    navigator.clipboard
                      .writeText(conference_url)
                      .then(() =>
                        show_toast(t("common.link_copied"), "success"),
                      )
                      .catch(() => undefined);
                  },
                )}
              </>
            )}
          </div>
        )}

        {has_meta && (
          <div className="flex flex-col gap-2">
            {event.recurrence &&
              render_meta_row(
                <ArrowPathIcon className="h-4 w-4" />,
                describe_recurrence(event.recurrence, starts, language, t),
              )}
            {event.location.length > 0 &&
              render_meta_row(
                <MapPinIcon className="h-4 w-4" />,
                event.location,
              )}
          </div>
        )}

        {event.description.length > 0 && (
          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-txt-secondary">
            {event.description}
          </p>
        )}

        {event.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {event.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-[var(--aster-radius-item)] px-2 py-0.5 text-xs font-medium text-txt-primary"
                style={{
                  backgroundColor: `color-mix(in srgb, ${tag_color(tag)} 18%, var(--aster-field-bg))`,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {event.attendees.length > 0 && (
          <>
            <IslandDivider />
            <section
              aria-label={t("calendar.attendees")}
              className="flex flex-col"
            >
              <h4
                className={`${SECTION_TITLE_CLASS} flex items-baseline gap-1.5`}
              >
                {t("calendar.attendees")}
                <span className="text-[12px] font-normal tabular-nums text-txt-muted">
                  {event.attendees.length}
                </span>
              </h4>
              <ul className="mt-1 flex flex-col">
                {event.attendees.map((attendee) => render_guest(attendee))}
              </ul>
              <p className="mt-1 text-[12px] leading-4 text-txt-muted">
                {guest_permission_summary}
              </p>
              {can_respond && (
                <div className="mt-3 flex flex-col gap-1.5">
                  <span className="text-[12px] text-txt-secondary">
                    {t("calendar.invite_your_response")}
                  </span>
                  <span
                    aria-label={t("calendar.invite_your_response")}
                    className="aster_segmented"
                    role="radiogroup"
                    onKeyDown={handle_response_key}
                  >
                    {RESPONSE_OPTIONS.map((option, option_index) => {
                      const active = own_response === option.value;
                      const has_active = RESPONSE_OPTIONS.some(
                        (candidate) => candidate.value === own_response,
                      );

                      return (
                        <button
                          key={option.value}
                          aria-checked={active}
                          className="aster_segmented_option !min-h-8 text-[12px] font-medium aria-checked:bg-[var(--accent-color)] aria-checked:text-[var(--accent-color-foreground,var(--accent-fg,#ffffff))] aria-checked:hover:bg-[var(--accent-color)] aria-checked:hover:text-[var(--accent-color-foreground,var(--accent-fg,#ffffff))]"
                          role="radio"
                          tabIndex={
                            active || (!has_active && option_index === 0)
                              ? 0
                              : -1
                          }
                          type="button"
                          onClick={() => on_respond?.(event, option.value)}
                        >
                          {t(option.label)}
                        </button>
                      );
                    })}
                  </span>
                </div>
              )}
            </section>
          </>
        )}

        {upcoming_groups.length > 0 && (
          <>
            <IslandDivider />
            {render_upcoming()}
          </>
        )}
      </div>
    );
  };

  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="hidden xl:flex flex-shrink-0 justify-end overflow-hidden"
      exit={reduce_motion ? undefined : { opacity: 0, x: 8 }}
      initial={reduce_motion ? false : { opacity: 0, x: 8 }}
      style={{ width: `calc(${PANEL_WIDTH} + ${PANEL_GAP_PX}px)` }}
      transition={{ duration: reduce_motion ? 0 : 0.16, ease: [0.2, 0, 0, 1] }}
    >
      <aside
        className="flex h-full flex-shrink-0 flex-col overflow-hidden rounded-[var(--aster-island-radius)] bg-surf-primary"
        style={{ width: PANEL_WIDTH }}
      >
        <div className="flex h-12 flex-shrink-0 items-center gap-1 ps-4 pe-2">
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium text-txt-primary">
            {selected_event ? t("calendar.details") : day_label}
          </h2>

          {selected_event && (
            <div className="flex flex-shrink-0 items-center gap-0.5">
              {is_booking_event(selected_event) &&
                render_icon_button(
                  t("calendar.cancel_booking"),
                  <TrashIcon className="h-4 w-4" />,
                  () => on_delete_request(selected_event),
                )}
              {!is_holiday_event(selected_event) &&
                !is_birthday_event(selected_event) &&
                !is_subscription_event(selected_event) &&
                !is_booking_event(selected_event) && (
                  <>
                    {render_icon_button(
                      t("common.edit"),
                      <PencilSquareIcon className="h-4 w-4" />,
                      () => on_edit(selected_event),
                    )}
                    {render_icon_button(
                      t("common.delete"),
                      <TrashIcon className="h-4 w-4" />,
                      () => on_delete_request(selected_event),
                    )}
                  </>
                )}
              {render_icon_button(
                t("common.close"),
                <XMarkIcon className="h-4 w-4" />,
                on_dismiss,
              )}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto aster_scrollbar_thin px-4 pb-4 pt-1">
          {selected_event ? (
            render_event_details(selected_event)
          ) : (
            <div className="flex flex-col gap-4">
              {day_events.length > 0 ? (
                <ul className="-mx-2 flex flex-col">
                  {day_events.map((event) => render_row(event))}
                </ul>
              ) : (
                <div className="aster_island aster_island_empty overflow-hidden px-4 py-8">
                  <span aria-hidden="true" className="aster_island_empty_icon">
                    <CalendarDaysIcon strokeWidth={1.75} />
                  </span>
                  <span className="aster_island_empty_title">
                    {t("calendar.no_upcoming_events")}
                  </span>
                  <span className="aster_island_empty_description">
                    {t("calendar.details_hint")}
                  </span>
                </div>
              )}

              {upcoming_groups.length > 0 && (
                <>
                  <IslandDivider />
                  {render_upcoming()}
                </>
              )}
            </div>
          )}
        </div>
      </aside>
    </motion.div>
  );
}
