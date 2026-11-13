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
import type { FormatOptions } from "@/utils/date_format";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowTopRightOnSquareIcon,
  BellAlertIcon,
  Bars3BottomLeftIcon,
  CalendarDaysIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  EllipsisHorizontalIcon,
  MapPinIcon,
  PencilIcon,
  TrashIcon,
  UserGroupIcon,
  VideoCameraIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { IslandIconButton, Tooltip } from "@aster/ui";

import { AttendeeResponseStatus } from "@/components/calendar/attendee_response_status";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { describe_recurrence } from "@/components/calendar/recurrence_field";
import {
  effective_reminders,
  format_reminder,
} from "@/services/calendar/event_reminders";
import { resolve_event_color } from "@/components/calendar/calendar_utils";
import { EventKindIcon } from "@/components/calendar/event_kind_icon";
import { is_event_organizer } from "@/services/calendar/itip";
import { is_own_address } from "@/services/calendar/own_addresses";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { get_display_time_zone } from "@/utils/date_format";
import { is_booking_event } from "@/services/calendar/appointments";
import { is_birthday_kind } from "@/services/calendar/birthdays";
import { use_guarded_link } from "@/components/calendar/use_guarded_link";
import { map_search_url, map_target } from "@/utils/map_link";
import {
  safe_http_url,
  safe_http_url_from_input,
} from "@/services/calendar/safe_url";

const POPOVER_WIDTH = 360;
const VIEWPORT_MARGIN = 12;
const ANCHOR_GAP = 8;
const GUEST_PREVIEW_LIMIT = 5;
const DESCRIPTION_CLAMP_LINES = 6;
const MOBILE_QUERY = "(max-width: 639px)";

type PopoverPlacement = "right" | "left" | "below" | "above" | "center";

interface PopoverPosition {
  top: number;
  left: number;
  placement: PopoverPlacement;
}

const RESPONSE_LABELS: Record<CalendarAttendeeResponse, TranslationKey> = {
  accepted: "calendar.attendee_accepted",
  tentative: "calendar.attendee_tentative",
  declined: "calendar.attendee_declined",
  needs_action: "calendar.attendee_pending",
};

const EVENT_KIND_LABELS: Record<CalendarEventKind, TranslationKey> = {
  default: "calendar.event_kind_default",
  task: "calendar.event_kind_task",
  out_of_office: "calendar.event_kind_out_of_office",
  focus_time: "calendar.event_kind_focus_time",
  working_location: "calendar.event_kind_working_location",
  birthday: "calendar.event_kind_birthday",
};

const WORKING_LOCATION_LABELS: Record<CalendarWorkingLocation, TranslationKey> =
  {
    home: "calendar.working_location_home",
    office: "calendar.working_location_office",
    other: "calendar.working_location_other",
  };

const url_pattern = /^(https?:\/\/|www\.)\S+$/i;
const VIDEO_HOSTS = [
  "meet.google.com",
  "zoom.us",
  "zoom.com",
  "teams.microsoft.com",
  "teams.live.com",
  "whereby.com",
  "meet.jit.si",
  "webex.com",
  "bluejeans.com",
  "around.co",
  "gather.town",
  "discord.gg",
];

function link_hostname(href: string | null | undefined): string | null {
  if (!href) {
    return null;
  }

  try {
    return new URL(href).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function is_video_host(hostname: string | null): boolean {
  if (!hostname) {
    return false;
  }

  return VIDEO_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

function is_link_like(value: string) {
  return url_pattern.test(value.trim());
}

function normalize_link(value: string) {
  return safe_http_url_from_input(value) || undefined;
}

function is_address_like(value: string) {
  const trimmed = value.trim();

  return trimmed.length > 4 && (trimmed.includes(",") || /\d/.test(trimmed));
}

function find_scroll_parent(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null;

  while (current) {
    const style = window.getComputedStyle(current);
    const overflow = `${style.overflowY}${style.overflowX}`;

    if (/(auto|scroll|overlay)/.test(overflow)) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

interface EventDetailPopoverProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  event: DecryptedCalendarEvent | null;
  calendar: DecryptedCalendar | undefined;
  time_format: "12h" | "24h";
  date_format: string;
  language: string;
  on_dismiss: () => void;
  on_edit: (event: DecryptedCalendarEvent) => void;
  on_delete_request: (event: DecryptedCalendarEvent) => void;
  self_email?: string;
  on_respond?: (
    event: DecryptedCalendarEvent,
    response: CalendarAttendeeResponse,
  ) => void;
}

function PopoverRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-[2px] flex h-4 w-4 flex-shrink-0 items-center justify-center text-[var(--icon-secondary)] [&>svg]:h-4 [&>svg]:w-4"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-[13px] leading-5 text-txt-secondary">
        {children}
      </div>
    </div>
  );
}

function format_time_range(
  start: Date,
  end: Date,
  language: string,
  hour12: boolean,
): string {
  const formatter = new Intl.DateTimeFormat(language, {
    hour: "numeric",
    minute: "2-digit",
    hour12,
    timeZone: get_display_time_zone(),
  }) as Intl.DateTimeFormat & {
    formatRange?: (start: Date, end: Date) => string;
  };

  if (typeof formatter.formatRange === "function") {
    return formatter.formatRange(start, end);
  }

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

export function EventDetailPopover({
  t,
  event,
  calendar,
  time_format,
  date_format,
  language,
  on_dismiss,
  on_edit,
  on_delete_request,
  self_email = "",
  on_respond,
}: EventDetailPopoverProps) {
  const { guard_link_click, open_guarded_link } = use_guarded_link();
  const card_ref = useRef<HTMLDivElement>(null);
  const close_ref = useRef<HTMLButtonElement>(null);
  const description_ref = useRef<HTMLParagraphElement>(null);
  const restore_ref = useRef<HTMLElement | null>(null);

  const [position, set_position] = useState<PopoverPosition | null>(null);
  const [is_mobile, set_is_mobile] = useState(
    () => window.matchMedia(MOBILE_QUERY).matches,
  );
  const [guests_expanded, set_guests_expanded] = useState(false);
  const [description_expanded, set_description_expanded] = useState(false);
  const [description_overflows, set_description_overflows] = useState(false);
  const [link_copied, set_link_copied] = useState(false);

  const event_id = event?.id ?? null;

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const handle = (changed: MediaQueryListEvent) =>
      set_is_mobile(changed.matches);

    media.addEventListener("change", handle);

    return () => media.removeEventListener("change", handle);
  }, []);

  useEffect(() => {
    set_guests_expanded(false);
    set_description_expanded(false);
    set_link_copied(false);
  }, [event_id]);

  const update_position = useCallback(() => {
    if (!event_id || is_mobile) {
      return;
    }

    const anchor = document.querySelector(
      `[data-event-id="${CSS.escape(event_id)}"]`,
    );
    const card_height = card_ref.current?.offsetHeight ?? 320;
    const max_top = Math.max(
      VIEWPORT_MARGIN,
      window.innerHeight - card_height - VIEWPORT_MARGIN,
    );
    const max_left = Math.max(
      VIEWPORT_MARGIN,
      window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN,
    );
    const clamp_top = (value: number) =>
      Math.min(Math.max(VIEWPORT_MARGIN, value), max_top);
    const clamp_left = (value: number) =>
      Math.min(Math.max(VIEWPORT_MARGIN, value), max_left);

    if (!anchor) {
      set_position({
        top: clamp_top((window.innerHeight - card_height) / 2),
        left: clamp_left((window.innerWidth - POPOVER_WIDTH) / 2),
        placement: "center",
      });

      return;
    }

    const rect = anchor.getBoundingClientRect();
    const fits_right =
      rect.right + ANCHOR_GAP + POPOVER_WIDTH + VIEWPORT_MARGIN <=
      window.innerWidth;
    const fits_left =
      rect.left - ANCHOR_GAP - POPOVER_WIDTH - VIEWPORT_MARGIN >= 0;
    const fits_below =
      rect.bottom + ANCHOR_GAP + card_height + VIEWPORT_MARGIN <=
      window.innerHeight;
    const fits_above =
      rect.top - ANCHOR_GAP - card_height - VIEWPORT_MARGIN >= 0;
    const centered_left = clamp_left(
      rect.left + rect.width / 2 - POPOVER_WIDTH / 2,
    );

    if (fits_right) {
      set_position({
        top: clamp_top(rect.top - 8),
        left: clamp_left(rect.right + ANCHOR_GAP),
        placement: "right",
      });

      return;
    }

    if (fits_left) {
      set_position({
        top: clamp_top(rect.top - 8),
        left: clamp_left(rect.left - POPOVER_WIDTH - ANCHOR_GAP),
        placement: "left",
      });

      return;
    }

    if (fits_below) {
      set_position({
        top: clamp_top(rect.bottom + ANCHOR_GAP),
        left: centered_left,
        placement: "below",
      });

      return;
    }

    if (fits_above) {
      set_position({
        top: clamp_top(rect.top - card_height - ANCHOR_GAP),
        left: centered_left,
        placement: "above",
      });

      return;
    }

    set_position({
      top: clamp_top(rect.top - 8),
      left: centered_left,
      placement: "below",
    });
  }, [event_id, is_mobile]);

  useLayoutEffect(() => {
    if (!event_id) {
      set_position(null);

      return;
    }

    update_position();
  }, [event_id, update_position, guests_expanded, description_expanded]);

  useLayoutEffect(() => {
    const node = description_ref.current;

    if (!node || description_expanded) {
      return;
    }

    set_description_overflows(node.scrollHeight > node.clientHeight + 1);
  }, [event_id, description_expanded]);

  useEffect(() => {
    if (!event_id || is_mobile) {
      return;
    }

    const anchor = document.querySelector(
      `[data-event-id="${CSS.escape(event_id)}"]`,
    ) as HTMLElement | null;
    const scroll_parent = find_scroll_parent(anchor);
    let frame = 0;

    const run = () => {
      frame = 0;

      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        const top_bound = scroll_parent
          ? scroll_parent.getBoundingClientRect().top
          : 0;
        const bottom_bound = scroll_parent
          ? scroll_parent.getBoundingClientRect().bottom
          : window.innerHeight;

        if (rect.bottom < top_bound || rect.top > bottom_bound) {
          on_dismiss();

          return;
        }
      }

      update_position();
    };

    const handle = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(run);
      }
    };

    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);

    return () => {
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }

      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [event_id, is_mobile, update_position, on_dismiss]);

  useEffect(() => {
    if (!event_id) {
      return;
    }

    restore_ref.current = document.activeElement as HTMLElement | null;

    const frame = requestAnimationFrame(() => close_ref.current?.focus());

    return () => {
      cancelAnimationFrame(frame);

      const anchor = document.querySelector(
        `[data-event-id="${CSS.escape(event_id)}"]`,
      ) as HTMLElement | null;
      const target = anchor ?? restore_ref.current;

      if (target && typeof target.focus === "function") {
        target.focus();
      }
    };
  }, [event_id]);

  useEffect(() => {
    if (!event_id) {
      return;
    }

    const handle_key = (pressed: KeyboardEvent) => {
      if (pressed.key === "Escape") {
        on_dismiss();

        return;
      }

      if (pressed.key !== "Tab" || !card_ref.current) {
        return;
      }

      const focusable = Array.from(
        card_ref.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => node.offsetParent !== null);

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (
        pressed.shiftKey &&
        (active === first || !card_ref.current.contains(active))
      ) {
        pressed.preventDefault();
        last.focus();

        return;
      }

      if (!pressed.shiftKey && active === last) {
        pressed.preventDefault();
        first.focus();
      }
    };

    const handle_outside = (clicked: MouseEvent) => {
      const target = clicked.target as Node;

      if (card_ref.current && !card_ref.current.contains(target)) {
        on_dismiss();
      }
    };

    document.addEventListener("keydown", handle_key);
    document.addEventListener("mousedown", handle_outside);

    return () => {
      document.removeEventListener("keydown", handle_key);
      document.removeEventListener("mousedown", handle_outside);
    };
  }, [event_id, on_dismiss]);

  if (!event) {
    return null;
  }

  const format_options: FormatOptions = {
    date_format: date_format as FormatOptions["date_format"],
    time_format,
  };

  const starts_at = new Date(event.starts_at);
  const ends_at = new Date(event.ends_at);
  const color = resolve_event_color(event, calendar?.color);
  const calendar_name = is_birthday_kind(event)
    ? t("calendar.settings_birthdays")
    : calendar?.name;
  const title_id = `event_detail_title_${event.id}`;

  const day_label = new Intl.DateTimeFormat(language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year:
      starts_at.getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  }).format(starts_at);

  const time_label = event.is_all_day
    ? t("calendar.all_day")
    : format_time_range(
        starts_at,
        ends_at,
        language,
        format_options.time_format === "12h",
      );

  const reminder_labels = (effective_reminders(event) ?? []).map((minutes) =>
    format_reminder(minutes, t),
  );

  const recurrence_label = event.recurrence
    ? describe_recurrence(event.recurrence, starts_at, language, t)
    : null;

  const location_value = event.location.trim();
  const location_is_link =
    location_value.length > 0 && is_link_like(location_value);
  const location_link = location_is_link
    ? normalize_link(location_value)
    : undefined;
  const location_host = link_hostname(location_link);
  const location_is_call = is_video_host(location_host);
  const location_is_address =
    location_value.length > 0 &&
    !location_is_link &&
    is_address_like(location_value);

  const attendees = event.attendees;
  const own_response =
    attendees.find(
      (attendee) =>
        !attendee.is_organizer && is_own_address(attendee.email, self_email),
    )?.response ?? null;
  const can_respond =
    on_respond !== undefined &&
    self_email.length > 0 &&
    attendees.length > 0 &&
    (!is_event_organizer(event, self_email) ||
      attendees.some(
        (attendee) =>
          !attendee.is_organizer && is_own_address(attendee.email, self_email),
      ));
  const rsvp_options: Array<{
    value: CalendarAttendeeResponse;
    label: TranslationKey;
  }> = [
    { value: "accepted", label: "calendar.invite_yes" },
    { value: "tentative", label: "calendar.invite_maybe" },
    { value: "declined", label: "calendar.invite_no" },
  ];
  const counts = attendees.reduce(
    (totals, attendee: CalendarAttendee) => {
      totals[attendee.response] += 1;

      return totals;
    },
    { accepted: 0, tentative: 0, declined: 0, needs_action: 0 } as Record<
      CalendarAttendeeResponse,
      number
    >,
  );

  const summary_parts: string[] = [];

  if (counts.accepted > 0) {
    summary_parts.push(
      t("calendar.guest_summary_yes", { count: counts.accepted }),
    );
  }

  if (counts.tentative > 0) {
    summary_parts.push(
      t("calendar.guest_summary_maybe", { count: counts.tentative }),
    );
  }

  if (counts.declined > 0) {
    summary_parts.push(
      t("calendar.guest_summary_no", { count: counts.declined }),
    );
  }

  if (counts.needs_action > 0) {
    summary_parts.push(
      t("calendar.guest_summary_awaiting", { count: counts.needs_action }),
    );
  }

  const visible_attendees =
    guests_expanded || attendees.length <= GUEST_PREVIEW_LIMIT
      ? attendees
      : attendees.slice(0, GUEST_PREVIEW_LIMIT);

  const transform_origin = () => {
    if (is_mobile) {
      return "bottom center";
    }

    if (position?.placement === "right") {
      return "left top";
    }

    if (position?.placement === "left") {
      return "right top";
    }

    if (position?.placement === "above") {
      return "bottom center";
    }

    return "top center";
  };

  const card_style: React.CSSProperties = is_mobile
    ? {
        borderRadius: "20px 20px 0 0",
        bottom: 0,
        left: 0,
        maxHeight: "85dvh",
        paddingBottom: "env(safe-area-inset-bottom)",
        right: 0,
        width: "100%",
      }
    : {
        left: position?.left ?? -9999,
        maxHeight: `calc(100dvh - ${VIEWPORT_MARGIN * 2}px)`,
        top: position?.top ?? -9999,
        width: POPOVER_WIDTH,
        ["--radix-popover-content-transform-origin" as string]:
          transform_origin(),
      };

  const conference_url = safe_http_url(event.conference_url);
  const conference_host = link_hostname(conference_url);
  const location_href = location_is_link
    ? location_link
    : location_is_address
      ? map_search_url(location_value)
      : undefined;
  const map_label =
    map_target() === "openstreetmap"
      ? t("calendar.open_in_openstreetmap")
      : t("calendar.open_in_maps");
  const has_more_actions =
    conference_url !== null || location_href !== undefined;
  const is_booking = is_booking_event(event);
  const delete_label = is_booking
    ? t("calendar.cancel_booking")
    : t("common.delete");

  const copy_conference_link = () => {
    if (!conference_url) {
      return;
    }

    void navigator.clipboard
      .writeText(conference_url)
      .then(() => set_link_copied(true))
      .catch(() => {});
  };

  const icon_button_class = "text-[var(--icon-secondary)]";
  const link_class =
    "inline-flex items-start gap-1 break-all text-[var(--calendar_accent_text,var(--accent-color))] hover:underline focus:outline-none focus-visible:underline";
  const toggle_button_class =
    "mt-1 text-[12px] font-medium text-[var(--calendar_accent_text,var(--accent-color))] hover:underline focus:outline-none focus-visible:underline";

  return (
    <>
      {is_mobile && (
        <div
          aria-hidden="true"
          className="aster_scrim aster_floating_anim fixed inset-0 z-40"
          data-state="open"
        />
      )}

      <div
        ref={card_ref}
        aria-labelledby={title_id}
        className="aster_floating aster_floating_anim fixed z-50 flex flex-col overflow-hidden rounded-[var(--aster-radius-floating)]"
        data-calendar-surface=""
        data-state="open"
        role="dialog"
        style={card_style}
      >
        <div className="flex items-start gap-3 px-4 pt-3">
          <div className="flex min-w-0 flex-1 items-start gap-2.5 pt-1.5">
            <span
              aria-hidden="true"
              className="mt-[5px] h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <div className="min-w-0 flex-1">
              <h2
                className="min-w-0 break-words text-base font-semibold leading-5 text-txt-primary"
                id={title_id}
              >
                {event.title || t("calendar.untitled_event")}
              </h2>
              {calendar_name && (
                <span
                  className="mt-0.5 inline-flex max-w-full items-center rounded-[var(--aster-radius-item)] px-2 py-0.5 text-xs font-medium leading-4 text-txt-secondary"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${color} 14%, var(--aster-field-bg))`,
                  }}
                >
                  <span className="truncate">{calendar_name}</span>
                </span>
              )}
            </div>
          </div>
          <div className="-me-1.5 flex flex-shrink-0 items-center">
            {!is_booking && (
              <Tooltip tip={t("common.edit")}>
                <IslandIconButton
                  className={icon_button_class}
                  label={t("common.edit")}
                  size="sm"
                  onClick={() => on_edit(event)}
                >
                  <PencilIcon />
                </IslandIconButton>
              </Tooltip>
            )}
            <Tooltip tip={delete_label}>
              <IslandIconButton
                className={icon_button_class}
                label={delete_label}
                size="sm"
                onClick={() => on_delete_request(event)}
              >
                <TrashIcon />
              </IslandIconButton>
            </Tooltip>
            {has_more_actions && (
              <DropdownMenu>
                <Tooltip tip={t("calendar.detail_more_actions")}>
                  <DropdownMenuTrigger asChild>
                    <IslandIconButton
                      className={icon_button_class}
                      label={t("calendar.detail_more_actions")}
                      size="sm"
                    >
                      <EllipsisHorizontalIcon />
                    </IslandIconButton>
                  </DropdownMenuTrigger>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-56">
                  {conference_url && (
                    <DropdownMenuItem onSelect={copy_conference_link}>
                      {link_copied ? (
                        <CheckIcon aria-hidden="true" />
                      ) : (
                        <ClipboardDocumentIcon aria-hidden="true" />
                      )}
                      {link_copied
                        ? t("common.copied")
                        : t("calendar.detail_copy_link")}
                    </DropdownMenuItem>
                  )}
                  {location_href && (
                    <DropdownMenuItem
                      onSelect={() => open_guarded_link(location_href)}
                    >
                      {location_is_link ? (
                        <ArrowTopRightOnSquareIcon aria-hidden="true" />
                      ) : (
                        <MapPinIcon aria-hidden="true" />
                      )}
                      {location_is_link
                        ? t("calendar.detail_open_link")
                        : map_label}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Tooltip tip={t("common.close")}>
              <IslandIconButton
                ref={close_ref}
                className={icon_button_class}
                label={t("common.close")}
                size="sm"
                onClick={on_dismiss}
              >
                <XMarkIcon />
              </IslandIconButton>
            </Tooltip>
          </div>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4 pt-3">
          <PopoverRow icon={<ClockIcon />}>
            <span className="block text-txt-primary">{day_label}</span>
            <span className="block">{time_label}</span>
            {recurrence_label && (
              <span className="block text-txt-muted">{recurrence_label}</span>
            )}
          </PopoverRow>

          {event.event_kind !== "default" && (
            <PopoverRow icon={<EventKindIcon kind={event.event_kind} />}>
              {event.event_kind === "working_location" &&
              event.working_location !== null
                ? t(WORKING_LOCATION_LABELS[event.working_location])
                : t(EVENT_KIND_LABELS[event.event_kind])}
            </PopoverRow>
          )}

          {conference_url && (
            <PopoverRow icon={<VideoCameraIcon />}>
              <a
                className={link_class}
                href={conference_url}
                rel="noopener noreferrer"
                target="_blank"
                onAuxClick={guard_link_click}
                onClick={guard_link_click}
              >
                <span className="min-w-0 break-words">
                  {t("calendar.join_conference")}
                  {conference_host && (
                    <span className="ms-1.5 text-txt-secondary">
                      {conference_host}
                    </span>
                  )}
                </span>
                <ArrowTopRightOnSquareIcon className="mt-[3px] h-3.5 w-3.5 flex-shrink-0" />
              </a>
            </PopoverRow>
          )}

          {location_value && (
            <PopoverRow
              icon={location_is_call ? <VideoCameraIcon /> : <MapPinIcon />}
            >
              {location_href ? (
                <a
                  className={link_class}
                  href={location_href}
                  rel="noopener noreferrer"
                  target="_blank"
                  title={location_is_link ? undefined : map_label}
                  onAuxClick={guard_link_click}
                  onClick={guard_link_click}
                >
                  <span className="min-w-0 break-words">
                    {location_is_call ? (
                      <>
                        {t("calendar.join_call")}
                        <span className="ms-1.5 text-txt-secondary">
                          {location_host}
                        </span>
                      </>
                    ) : (
                      location_value
                    )}
                  </span>
                  <ArrowTopRightOnSquareIcon className="mt-[3px] h-3.5 w-3.5 flex-shrink-0" />
                </a>
              ) : (
                <span className="break-words">{location_value}</span>
              )}
            </PopoverRow>
          )}

          <PopoverRow icon={<CalendarDaysIcon />}>
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              {calendar_name ?? t("calendar.event")}
            </span>
          </PopoverRow>

          {attendees.length > 0 && (
            <PopoverRow icon={<UserGroupIcon />}>
              <span className="block text-txt-primary">
                {t("calendar.participants", { count: attendees.length })}
              </span>
              {summary_parts.length > 0 && (
                <span className="mb-2 block text-[12px] text-txt-muted">
                  {summary_parts.join(", ")}
                </span>
              )}
              <div className="flex flex-col gap-1.5">
                {visible_attendees.map((attendee, index) => {
                  const name = attendee.display_name || attendee.email;

                  return (
                    <div
                      key={`${index}_${attendee.email}`}
                      className="flex items-center gap-2.5"
                    >
                      <span aria-hidden="true" className="flex-shrink-0">
                        <ProfileAvatar
                          email={attendee.email}
                          name={name}
                          size="xs"
                        />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-txt-primary">
                        {name}
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
                    </div>
                  );
                })}
              </div>
              {attendees.length > GUEST_PREVIEW_LIMIT && (
                <button
                  className={toggle_button_class}
                  type="button"
                  onClick={() => set_guests_expanded(!guests_expanded)}
                >
                  {guests_expanded
                    ? t("calendar.show_fewer_guests")
                    : t("calendar.show_all_guests", {
                        count: attendees.length,
                      })}
                </button>
              )}
              {can_respond && (
                <div
                  aria-label={t("calendar.invite_your_response")}
                  className="aster_segmented mt-2.5"
                  role="radiogroup"
                >
                  {rsvp_options.map((option) => {
                    const active = own_response === option.value;

                    return (
                      <button
                        key={option.value}
                        aria-checked={active}
                        className="aster_segmented_option !min-h-8 text-[12px] font-medium aria-checked:bg-[var(--accent-color)] aria-checked:text-[var(--accent-color-foreground,var(--accent-fg,#ffffff))] aria-checked:hover:bg-[var(--accent-color)] aria-checked:hover:text-[var(--accent-color-foreground,var(--accent-fg,#ffffff))]"
                        role="radio"
                        type="button"
                        onClick={() => on_respond?.(event, option.value)}
                      >
                        {t(option.label)}
                      </button>
                    );
                  })}
                </div>
              )}
            </PopoverRow>
          )}

          {event.description && (
            <PopoverRow icon={<Bars3BottomLeftIcon />}>
              <p
                ref={description_ref}
                className="whitespace-pre-wrap break-words"
                style={
                  description_expanded
                    ? undefined
                    : {
                        display: "-webkit-box",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: DESCRIPTION_CLAMP_LINES,
                        overflow: "hidden",
                      }
                }
              >
                {event.description}
              </p>
              {(description_overflows || description_expanded) && (
                <button
                  className={toggle_button_class}
                  type="button"
                  onClick={() =>
                    set_description_expanded(!description_expanded)
                  }
                >
                  {description_expanded
                    ? t("calendar.show_less")
                    : t("calendar.show_more")}
                </button>
              )}
            </PopoverRow>
          )}

          {reminder_labels.length > 0 && (
            <PopoverRow icon={<BellAlertIcon />}>
              <div className="flex flex-col">
                {reminder_labels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </PopoverRow>
          )}
        </div>
      </div>
    </>
  );
}
