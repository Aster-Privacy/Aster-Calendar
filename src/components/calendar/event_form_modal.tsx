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
  CalendarEventAvailability,
  CalendarEventDraft,
  CalendarEventKind,
  CalendarEventVisibility,
  CalendarWorkingLocation,
  DecryptedCalendar,
  DecryptedCalendarEvent,
  RecurrenceRule,
} from "@/types/calendar";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";
import type { TranslationKey } from "@/lib/i18n";
import type { QuickCreateDraft } from "@/components/calendar/quick_create_popover";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowPathIcon,
  BellIcon,
  Bars3BottomLeftIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  MapPinIcon,
  SwatchIcon,
  TagIcon,
  UsersIcon,
  VideoCameraIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { DateField } from "@/components/calendar/date_field";
import {
  preset_to_rule,
  RecurrenceField,
} from "@/components/calendar/recurrence_field";
import { TimeField } from "@/components/calendar/time_field";
import { use_calendar_breakpoint } from "@/components/calendar/use_calendar_breakpoint";
import { use_visible_viewport } from "@/components/calendar/use_visible_viewport";
import { TagColorPicker } from "@/components/calendar/tag_color_picker";
import { use_tag_colors } from "@/components/calendar/use_tag_colors";
import {
  EVENT_COLOR_OPTIONS,
  nearest_event_color,
  ink_on_fill,
} from "@/components/calendar/calendar_utils";
import { calendar_now } from "@/services/calendar/view_zone";
import { AnimatePresence, motion } from "framer-motion";
import {
  Button,
  Checkbox,
  IslandDivider,
  IslandIconButton,
  Tooltip,
} from "@aster/ui";

import { CalendarSelect } from "@/components/calendar/calendar_select";
import { EventReminderEditor } from "@/components/calendar/event_reminder_editor";
import { InviteSenderSelect } from "@/components/calendar/invite_sender_select";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  GuestEncryptionLock,
  use_guest_encryption,
} from "@/components/calendar/guest_encryption_lock";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert_dialog";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { safe_http_url_from_input } from "@/services/calendar/safe_url";
import {
  BIRTHDAY_CALENDAR_ID,
  BIRTHDAY_COLOR,
} from "@/services/calendar/birthdays";
import {
  ALL_DAY_EVENT_REMINDER_CHOICES,
  EVENT_REMINDER_CHOICES,
  default_reminder_list,
  effective_reminders,
  reminder_fields,
  remap_reminders,
} from "@/services/calendar/event_reminders";

const MAX_TITLE_LENGTH = 200;
const MAX_LOCATION_LENGTH = 500;
const MAX_CONFERENCE_URL_LENGTH = 2048;
const MAX_DESCRIPTION_LENGTH = 20000;
const MAX_ATTENDEES = 100;

const EVENT_KIND_OPTIONS: {
  value: CalendarEventKind;
  label_key: TranslationKey;
}[] = [
  { value: "default", label_key: "calendar.event_kind_default" },
  { value: "task", label_key: "calendar.event_kind_task" },
  { value: "out_of_office", label_key: "calendar.event_kind_out_of_office" },
  { value: "focus_time", label_key: "calendar.event_kind_focus_time" },
  {
    value: "working_location",
    label_key: "calendar.event_kind_working_location",
  },
  { value: "birthday", label_key: "calendar.event_kind_birthday" },
];

const FORM_TITLE_KEYS: Record<
  CalendarEventKind,
  { create: TranslationKey; edit: TranslationKey }
> = {
  default: { create: "calendar.new_event", edit: "calendar.edit_event" },
  task: { create: "calendar.new_task", edit: "calendar.edit_task" },
  out_of_office: {
    create: "calendar.new_out_of_office",
    edit: "calendar.edit_out_of_office",
  },
  focus_time: {
    create: "calendar.new_focus_time",
    edit: "calendar.edit_focus_time",
  },
  working_location: {
    create: "calendar.new_working_location",
    edit: "calendar.edit_working_location",
  },
  birthday: { create: "calendar.new_event", edit: "calendar.edit_event" },
};

const MORE_OPTIONS_EASE = [0.2, 0, 0, 1] as const;

const more_options_variants = {
  hidden: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.16, ease: MORE_OPTIONS_EASE },
  },
  shown: {
    height: "auto",
    opacity: 1,
    transition: {
      duration: 0.22,
      ease: MORE_OPTIONS_EASE,
      staggerChildren: 0.045,
      delayChildren: 0.04,
    },
  },
};

const more_option_row_variants = {
  hidden: { opacity: 0, y: -6 },
  shown: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: MORE_OPTIONS_EASE },
  },
};

const TIME_STEP_MINUTES = 15;

const TIME_OPTIONS = Array.from(
  { length: (24 * 60) / TIME_STEP_MINUTES },
  (_, index) => {
    const total = index * TIME_STEP_MINUTES;
    const pad = (value: number) => String(value).padStart(2, "0");

    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  },
);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function to_local_date_value(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function to_local_time_value(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function snap_to_step(date: Date): Date {
  const snapped = new Date(date);
  const remainder = snapped.getMinutes() % TIME_STEP_MINUTES;

  snapped.setSeconds(0, 0);

  if (remainder !== 0) {
    snapped.setMinutes(snapped.getMinutes() + (TIME_STEP_MINUTES - remainder));
  }

  return snapped;
}

function with_current_time(value: string): string[] {
  if (!value || TIME_OPTIONS.includes(value)) {
    return TIME_OPTIONS;
  }

  return [...TIME_OPTIONS, value].sort();
}

function time_to_minutes(value: string): number {
  const [hours, minutes] = value.split(":");

  return Number(hours ?? 0) * 60 + Number(minutes ?? 0);
}

function build_date(date_value: string, time_value: string): Date {
  return new Date(`${date_value}T${time_value}:00`);
}

interface EventFormModalProps {
  is_open: boolean;
  calendars: DecryptedCalendar[];
  event: DecryptedCalendarEvent | null;
  events?: DecryptedCalendarEvent[];
  initial_date: Date | null;
  initial_draft?: QuickCreateDraft | null;
  initial_event_kind?: CalendarEventKind | null;
  default_duration_minutes: number;
  default_calendar_id: string;
  default_reminder_minutes: number;
  week_start_day: number;
  on_close: () => void;
  on_submit: (draft: CalendarEventDraft) => Promise<void>;
}

interface FieldRowProps {
  icon: ReactNode;
  align_top?: boolean;
  children: ReactNode;
}

function FieldRow({ icon, align_top, children }: FieldRowProps) {
  return (
    <div className={`flex gap-3 ${align_top ? "items-start" : "items-center"}`}>
      <div
        aria-hidden="true"
        className={`flex w-6 shrink-0 justify-center text-txt-muted ${align_top ? "pt-2.5" : ""}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function EventFormModal({
  is_open,
  calendars,
  event,
  events,
  initial_date,
  initial_draft = null,
  initial_event_kind = null,
  default_duration_minutes,
  default_calendar_id,
  default_reminder_minutes,
  week_start_day,
  on_close,
  on_submit,
}: EventFormModalProps) {
  const { t, language } = use_i18n();
  const { preferences } = use_preferences();
  const { color_for: tag_color_for, set_tag_color } = use_tag_colors();
  const reduce_motion = use_should_reduce_motion();
  const { is_phone } = use_calendar_breakpoint();
  const visible_viewport = use_visible_viewport(is_open);

  const heading_id = useId();
  const dialog_ref = useRef<HTMLDivElement | null>(null);
  const title_ref = useRef<HTMLInputElement | null>(null);
  const restore_focus_ref = useRef<HTMLElement | null>(null);

  const [title, set_title] = useState("");
  const [title_touched, set_title_touched] = useState(false);
  const [init_version, set_init_version] = useState(0);
  const [recurrence_touched, set_recurrence_touched] = useState(false);
  const [confirm_discard, set_confirm_discard] = useState(false);
  const initial_signature_ref = useRef<string | null>(null);
  const request_close_ref = useRef<() => void>(() => {});
  const [location, set_location] = useState("");
  const [description, set_description] = useState("");
  const [calendar_id, set_calendar_id] = useState("");
  const calendars_ref = useRef(calendars);

  calendars_ref.current = calendars;
  const [is_all_day, set_is_all_day] = useState(false);
  const [start_date, set_start_date] = useState("");
  const [start_time, set_start_time] = useState("09:00");
  const [end_date, set_end_date] = useState("");
  const [end_time, set_end_time] = useState("10:00");
  const [reminders, set_reminders] = useState<number[]>([10]);
  const [recurrence, set_recurrence] = useState<RecurrenceRule | null>(null);
  const [recurrence_exceptions, set_recurrence_exceptions] = useState<string[]>(
    [],
  );
  const [color, set_color] = useState<string | null>(null);
  const [availability, set_availability] =
    useState<CalendarEventAvailability>("busy");
  const [visibility, set_visibility] =
    useState<CalendarEventVisibility>("default");
  const [event_kind, set_event_kind] = useState<CalendarEventKind>("default");
  const [working_location, set_working_location] =
    useState<CalendarWorkingLocation>("office");
  const [conference_url, set_conference_url] = useState("");
  const [conference_url_touched, set_conference_url_touched] = useState(false);
  const [attendees, set_attendees] = useState<string[]>([]);
  const [guests_can_modify, set_guests_can_modify] = useState(false);
  const [guests_can_invite, set_guests_can_invite] = useState(true);
  const [guests_can_see_guests, set_guests_can_see_guests] = useState(true);
  const [attendee_input, set_attendee_input] = useState("");
  const guest_encryption = use_guest_encryption(attendees);
  const [attendee_error, set_attendee_error] = useState("");
  const [tags, set_tags] = useState<string[]>([]);
  const [tag_input, set_tag_input] = useState("");
  const [submit_error, set_submit_error] = useState("");
  const [show_more, set_show_more] = useState(false);
  const [is_submitting, set_is_submitting] = useState(false);

  useEffect(() => {
    if (!is_open) {
      return;
    }

    const handle_window_escape = (key_event: KeyboardEvent) => {
      if (key_event.key !== "Escape") {
        return;
      }

      if (
        document.querySelector("[data-radix-popper-content-wrapper]") ||
        document.querySelector('[role="alertdialog"]')
      ) {
        return;
      }

      if (dialog_ref.current?.contains(key_event.target as Node)) {
        return;
      }

      key_event.stopPropagation();
      request_close_ref.current();
    };

    window.addEventListener("keydown", handle_window_escape, true);

    return () =>
      window.removeEventListener("keydown", handle_window_escape, true);
  }, [is_open]);

  const pick_initial_calendar_id = (list: typeof calendars): string =>
    list.find((calendar) => calendar.id === initial_draft?.calendar_id)?.id ??
    list.find((calendar) => calendar.id === default_calendar_id)?.id ??
    list.find((calendar) => calendar.is_default)?.id ??
    list[0]?.id ??
    "";

  useEffect(() => {
    if (!is_open || event || calendar_id || calendars.length === 0) {
      return;
    }

    set_calendar_id(pick_initial_calendar_id(calendars));
  }, [is_open, event, calendar_id, calendars]);

  useEffect(() => {
    if (!is_open) {
      return;
    }

    set_submit_error("");
    set_attendee_error("");
    set_attendee_input("");
    set_tag_input("");
    set_is_submitting(false);
    set_title_touched(false);
    set_show_more(false);

    set_init_version((version) => version + 1);
    set_recurrence_touched(false);
    set_confirm_discard(false);

    if (event) {
      const event_start = new Date(event.starts_at);
      const event_end = new Date(event.ends_at);

      set_title(event.title);
      set_location(event.location);
      set_description(event.description);
      set_calendar_id(event.calendar_id);
      set_is_all_day(event.is_all_day);
      set_start_date(to_local_date_value(event_start));
      set_end_date(to_local_date_value(event_end));
      set_start_time(to_local_time_value(event_start));
      set_end_time(to_local_time_value(event_end));
      set_reminders(effective_reminders(event) ?? []);
      set_attendees(event.attendees.map((attendee) => attendee.email));
      set_guests_can_modify(event.guests_can_modify);
      set_guests_can_invite(event.guests_can_invite);
      set_guests_can_see_guests(event.guests_can_see_guests);
      set_show_more(
        event.tags.length > 0 ||
          event.color !== null ||
          event.availability !== "busy" ||
          event.visibility !== "default",
      );
      set_tags(event.tags);
      set_recurrence(event.recurrence);
      set_recurrence_exceptions(event.recurrence_exceptions);
      set_color(event.color);
      set_availability(event.availability);
      set_visibility(event.visibility);
      set_event_kind(event.event_kind);
      set_working_location(event.working_location ?? "office");
      set_conference_url(event.conference_url);
      set_conference_url_touched(false);

      return;
    }

    const base = initial_date ? new Date(initial_date) : calendar_now();

    if (base.getHours() === 0 && base.getMinutes() === 0) {
      base.setHours(9, 0, 0, 0);
    } else {
      base.setSeconds(0, 0);
    }

    const snapped_start = initial_draft
      ? new Date(initial_draft.starts_at)
      : snap_to_step(base);
    const snapped_end = initial_draft
      ? new Date(initial_draft.ends_at)
      : new Date(snapped_start.getTime() + default_duration_minutes * 60_000);

    set_title(initial_draft?.title ?? "");
    set_tags([]);
    set_location(preferences.calendar_default_event_location);
    set_description("");
    set_calendar_id(pick_initial_calendar_id(calendars_ref.current));
    set_is_all_day(initial_draft?.is_all_day ?? false);
    set_start_date(to_local_date_value(snapped_start));
    set_end_date(to_local_date_value(snapped_end));
    set_start_time(to_local_time_value(snapped_start));
    set_end_time(to_local_time_value(snapped_end));
    const initial_reminder =
      (initial_draft?.is_all_day ?? false)
        ? preferences.calendar_default_all_day_reminder_minutes
        : default_reminder_minutes;

    set_reminders(default_reminder_list(initial_reminder));
    set_attendees([]);
    set_guests_can_modify(preferences.calendar_default_guests_can_modify);
    set_guests_can_invite(preferences.calendar_default_guests_can_invite);
    set_guests_can_see_guests(
      preferences.calendar_default_guests_can_see_guests,
    );
    set_recurrence(null);
    set_recurrence_exceptions([]);
    set_color(preferences.calendar_default_event_color || null);
    set_availability(preferences.calendar_default_event_availability);
    set_visibility(preferences.calendar_default_event_visibility);
    set_event_kind(initial_event_kind ?? "default");
    set_working_location("office");
    set_conference_url(preferences.calendar_default_conference_url);
    set_conference_url_touched(false);
  }, [
    is_open,
    event,
    initial_date,
    initial_draft,
    initial_event_kind,
    default_duration_minutes,
    default_calendar_id,
    default_reminder_minutes,
    preferences.calendar_default_all_day_reminder_minutes,
    preferences.calendar_default_conference_url,
    preferences.calendar_default_event_availability,
    preferences.calendar_default_event_color,
    preferences.calendar_default_event_location,
    preferences.calendar_default_event_visibility,
    preferences.calendar_default_guests_can_invite,
    preferences.calendar_default_guests_can_modify,
    preferences.calendar_default_guests_can_see_guests,
  ]);

  useEffect(() => {
    if (!is_open) {
      return;
    }

    restore_focus_ref.current = document.activeElement as HTMLElement | null;

    const frame = window.requestAnimationFrame(() => {
      const title_input = title_ref.current;

      if (!title_input) {
        return;
      }

      const is_touch =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(pointer: coarse)").matches;

      if (is_touch && title_input.value.length > 0) {
        return;
      }

      title_input.focus();

      if (!is_touch) {
        title_input.select();
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
      restore_focus_ref.current?.focus?.();
    };
  }, [is_open]);

  const time_formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        hour: "numeric",
        minute: "2-digit",
        hour12: preferences.time_format === "12h",
      }),
    [language, preferences.time_format],
  );

  const format_time_label = (value: string) => {
    const [hours, minutes] = value.split(":");

    return time_formatter.format(
      new Date(2000, 0, 1, Number(hours ?? 0), Number(minutes ?? 0)),
    );
  };

  const format_duration = (minutes: number) =>
    minutes < 60
      ? new Intl.NumberFormat(language, {
          style: "unit",
          unit: "minute",
          unitDisplay: "narrow",
        }).format(minutes)
      : new Intl.NumberFormat(language, {
          maximumFractionDigits: 2,
          style: "unit",
          unit: "hour",
          unitDisplay: "narrow",
        }).format(minutes / 60);

  const handle_start_time_change = (next: string) => {
    const previous_duration =
      build_date(end_date, end_time).getTime() -
      build_date(start_date, start_time).getTime();

    set_start_time(next);

    if (Number.isNaN(previous_duration) || previous_duration <= 0) {
      return;
    }

    const next_end = new Date(
      build_date(start_date, next).getTime() + previous_duration,
    );

    if (Number.isNaN(next_end.getTime())) {
      return;
    }

    set_end_date(to_local_date_value(next_end));
    set_end_time(to_local_time_value(next_end));
  };

  const handle_end_time_change = (next: string) => {
    set_end_time(next);

    if (
      !start_date ||
      end_date !== start_date ||
      time_to_minutes(next) >= time_to_minutes(start_time)
    ) {
      return;
    }

    const next_day = build_date(start_date, "00:00");

    if (Number.isNaN(next_day.getTime())) {
      return;
    }

    next_day.setDate(next_day.getDate() + 1);
    set_end_date(to_local_date_value(next_day));
  };

  const is_working_location = event_kind === "working_location";
  const working_location_title =
    working_location === "home"
      ? t("calendar.working_location_home")
      : working_location === "office"
        ? t("calendar.working_location_office")
        : location.trim() || t("calendar.working_location_other");
  const trimmed_title =
    title.trim() || (is_working_location ? working_location_title : "");
  const has_title_error = trimmed_title.length === 0;
  const has_conference_url_error =
    event_kind === "default" &&
    conference_url.trim().length > 0 &&
    safe_http_url_from_input(conference_url) === "";

  const range_start = is_all_day
    ? build_date(start_date, "00:00")
    : build_date(start_date, start_time);
  const raw_range_end = is_all_day
    ? build_date(end_date, "23:59")
    : build_date(end_date, end_time);

  const has_invalid_dates =
    !start_date ||
    !end_date ||
    Number.isNaN(range_start.getTime()) ||
    Number.isNaN(raw_range_end.getTime());
  const has_range_error = !has_invalid_dates && raw_range_end < range_start;
  const range_end =
    !is_all_day &&
    !has_invalid_dates &&
    raw_range_end.getTime() === range_start.getTime()
      ? new Date(
          range_start.getTime() +
            Math.max(default_duration_minutes, 1) * 60_000,
        )
      : raw_range_end;

  const form_signature = JSON.stringify({
    title,
    location,
    description,
    calendar_id,
    is_all_day,
    start_date,
    end_date,
    start_time,
    end_time,
    reminders,
    attendees,
    guests_can_modify,
    guests_can_invite,
    guests_can_see_guests,
    tags,
    recurrence,
    recurrence_exceptions,
    color,
    availability,
    visibility,
    event_kind,
    working_location,
    conference_url,
  });
  const form_signature_ref = useRef(form_signature);

  form_signature_ref.current = form_signature;

  useEffect(() => {
    initial_signature_ref.current = form_signature_ref.current;
  }, [init_version]);

  const request_close = () => {
    if (is_submitting) {
      return;
    }

    const is_dirty =
      initial_signature_ref.current !== null &&
      (form_signature_ref.current !== initial_signature_ref.current ||
        attendee_input.trim().length > 0 ||
        tag_input.trim().length > 0);

    if (is_dirty) {
      set_confirm_discard(true);

      return;
    }

    on_close();
  };

  request_close_ref.current = request_close;

  const range_start_ms = range_start.getTime();
  const range_end_ms = range_end.getTime();
  const editing_id = event?.id ?? null;
  const editing_series_id = event?.recurrence_master_id ?? event?.id ?? null;

  const conflicting_events = useMemo(() => {
    if (
      !events ||
      is_all_day ||
      availability === "free" ||
      (event_kind !== "default" && event_kind !== "focus_time") ||
      Number.isNaN(range_start_ms) ||
      Number.isNaN(range_end_ms) ||
      range_end_ms <= range_start_ms
    ) {
      return [];
    }

    return events.filter((other) => {
      if (
        other.is_all_day ||
        other.availability === "free" ||
        other.status === "cancelled" ||
        other.event_kind === "task" ||
        other.event_kind === "working_location"
      ) {
        return false;
      }

      if (
        editing_id !== null &&
        (other.id === editing_id ||
          other.id === editing_series_id ||
          other.recurrence_master_id === editing_series_id)
      ) {
        return false;
      }

      const other_start = new Date(other.starts_at).getTime();
      const other_end = new Date(other.ends_at).getTime();

      return other_start < range_end_ms && other_end > range_start_ms;
    });
  }, [
    events,
    is_all_day,
    availability,
    event_kind,
    range_start_ms,
    range_end_ms,
    editing_id,
    editing_series_id,
  ]);

  const is_blocked =
    is_submitting ||
    has_title_error ||
    has_conference_url_error ||
    has_invalid_dates ||
    has_range_error ||
    !calendar_id;

  const is_birthday = event_kind === "birthday";
  const selected_calendar =
    calendars.find((calendar) => calendar.id === calendar_id) ?? calendars[0];
  const accent_color = is_birthday
    ? BIRTHDAY_COLOR
    : (selected_calendar?.color ?? "var(--accent-color)");

  const attendee_candidate_error = (
    candidate: string,
  ): TranslationKey | null => {
    if (!EMAIL_PATTERN.test(candidate)) {
      return "calendar.attendee_invalid_email";
    }

    if (
      attendees.some(
        (attendee) => attendee.toLowerCase() === candidate.toLowerCase(),
      )
    ) {
      return "calendar.attendee_already_added";
    }

    if (attendees.length >= MAX_ATTENDEES) {
      return "calendar.attendee_limit_reached";
    }

    return null;
  };

  const commit_attendee = (raw_value: string) => {
    const candidate = raw_value.trim().replace(/,$/, "");

    if (!candidate) {
      return true;
    }

    const error_key = attendee_candidate_error(candidate);

    if (error_key) {
      set_attendee_error(t(error_key));

      return false;
    }

    set_attendees((current) => [...current, candidate]);
    set_attendee_input("");
    set_attendee_error("");

    return true;
  };

  const handle_attendee_key_down = (
    key_event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    if (key_event.key === "Enter" || key_event.key === ",") {
      key_event.preventDefault();
      commit_attendee(attendee_input);

      return;
    }

    if (
      key_event.key === "Backspace" &&
      attendee_input.length === 0 &&
      attendees.length > 0
    ) {
      set_attendees((current) => current.slice(0, -1));
    }
  };

  const commit_tag = (raw: string) => {
    const trimmed = raw.trim().slice(0, 32);

    if (trimmed.length === 0) {
      set_tag_input("");

      return;
    }

    set_tags((current) =>
      current.some((tag) => tag.toLowerCase() === trimmed.toLowerCase()) ||
      current.length >= 12
        ? current
        : [...current, trimmed],
    );
    set_tag_input("");
  };

  const handle_tag_key_down = (
    key_event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (key_event.key === "Enter" || key_event.key === ",") {
      key_event.preventDefault();
      commit_tag(tag_input);

      return;
    }

    if (
      key_event.key === "Backspace" &&
      tag_input.length === 0 &&
      tags.length > 0
    ) {
      set_tags((current) => current.slice(0, -1));
    }
  };

  const is_meeting_kind = event_kind === "default";

  useEffect(() => {
    if (event_kind === "working_location" || event_kind === "birthday") {
      set_is_all_day(true);
    }
  }, [event_kind]);

  const choose_event_kind = (next: CalendarEventKind) => {
    set_event_kind(next);

    if (next !== "birthday" || recurrence !== null) {
      return;
    }

    set_recurrence_touched(true);
    set_recurrence(
      preset_to_rule(
        "yearly",
        Number.isNaN(range_start.getTime()) ? calendar_now() : range_start,
        null,
      ),
    );
  };

  const choose_calendar = (next: string) => {
    if (next === BIRTHDAY_CALENDAR_ID) {
      choose_event_kind("birthday");

      return;
    }

    set_calendar_id(next);

    if (is_birthday) {
      set_event_kind("default");
    }
  };

  const handle_submit = async () => {
    set_title_touched(true);

    if (has_title_error) {
      title_ref.current?.focus();

      return;
    }

    if (is_blocked) {
      return;
    }

    const pending_attendee = attendee_input.trim().replace(/,$/, "");
    let final_attendees = attendees;

    if (pending_attendee) {
      const error_key = attendee_candidate_error(pending_attendee);

      if (error_key) {
        set_attendee_error(t(error_key));

        return;
      }

      final_attendees = [...attendees, pending_attendee];
      set_attendees(final_attendees);
      set_attendee_input("");
      set_attendee_error("");
    }

    set_is_submitting(true);
    set_submit_error("");

    try {
      await on_submit({
        attendees: final_attendees.map((email) => {
          const existing = event?.attendees.find(
            (attendee) => attendee.email.toLowerCase() === email.toLowerCase(),
          );

          return (
            existing ?? {
              email,
              display_name: null,
              response: "needs_action",
              is_organizer: false,
            }
          );
        }),
        is_completed: event?.is_completed === true,
        status: event?.status ?? "confirmed",
        calendar_id,
        title: trimmed_title,
        tags,
        description: description.trim(),
        location: location.trim(),
        starts_at: (is_all_day
          ? build_date(start_date, "00:00")
          : range_start
        ).toISOString(),
        ends_at: (is_all_day
          ? new Date(build_date(end_date, "23:59").getTime() + 59_999)
          : range_end
        ).toISOString(),
        is_all_day,
        ...reminder_fields(reminders),
        color,
        availability:
          event_kind === "default"
            ? availability
            : event_kind === "working_location" || event_kind === "birthday"
              ? "free"
              : "busy",
        visibility,
        event_kind,
        working_location:
          event_kind === "working_location" ? working_location : null,
        conference_url: is_meeting_kind
          ? safe_http_url_from_input(conference_url)
          : "",
        guests_can_modify,
        guests_can_invite,
        guests_can_see_guests,
        recurrence,
        recurrence_exceptions,
        recurrence_cleared:
          recurrence_touched && recurrence === null && event?.recurrence
            ? true
            : undefined,
      });
    } catch {
      set_submit_error(t("calendar.event_save_failed"));
      set_is_submitting(false);
    }
  };

  const handle_dialog_key_down = (
    key_event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (key_event.key === "Escape") {
      key_event.stopPropagation();

      if (document.querySelector("[data-radix-popper-content-wrapper]")) {
        return;
      }

      request_close();

      return;
    }

    if (key_event.key !== "Tab") {
      return;
    }

    const container = dialog_ref.current;

    if (!container) {
      return;
    }

    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => element.getClientRects().length > 0);

    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;
    const active = document.activeElement as HTMLElement | null;

    if (
      key_event.shiftKey &&
      (active === first || !container.contains(active))
    ) {
      key_event.preventDefault();
      last.focus();

      return;
    }

    if (!key_event.shiftKey && active === last) {
      key_event.preventDefault();
      first.focus();
    }
  };

  if (!is_open) {
    return null;
  }

  const error_class = "mt-1 text-[12px] text-[var(--color-danger)]";
  const keyboard_open =
    visible_viewport !== null && visible_viewport.bottom_inset > 0;
  const scrim_style: CSSProperties | undefined = visible_viewport
    ? {
        alignItems: is_phone ? "stretch" : undefined,
        padding: is_phone
          ? `${visible_viewport.top}px 0 ${visible_viewport.bottom_inset}px`
          : `${visible_viewport.top + 12}px 12px ${visible_viewport.bottom_inset + 12}px`,
      }
    : is_phone
      ? { alignItems: "stretch", padding: 0 }
      : undefined;
  const panel_style: CSSProperties | undefined = is_phone
    ? {
        borderRadius: 0,
        height: visible_viewport ? visible_viewport.height : "100dvh",
        maxHeight: "none",
        maxWidth: "none",
        paddingBottom: keyboard_open ? 0 : "env(safe-area-inset-bottom)",
        paddingTop: visible_viewport?.top ? 0 : "env(safe-area-inset-top)",
      }
    : visible_viewport
      ? { maxHeight: Math.max(0, visible_viewport.height - 24) }
      : undefined;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="aster_scrim fixed inset-0 z-[60] flex items-center justify-center p-3"
      initial={reduce_motion ? false : { opacity: 0 }}
      role="presentation"
      style={scrim_style}
      transition={{ duration: reduce_motion ? 0 : 0.12, ease: [0.2, 0, 0, 1] }}
      onMouseDown={(mouse_event) => {
        if (mouse_event.target === mouse_event.currentTarget) {
          request_close();
        }
      }}
    >
      <motion.div
        ref={dialog_ref}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        aria-labelledby={heading_id}
        aria-modal="true"
        className="aster_floating aster_dialog_surface calendar_form_radius relative flex max-h-[calc(100dvh-24px)] w-full max-w-[600px] flex-col overflow-hidden"
        data-calendar-surface=""
        initial={reduce_motion ? false : { opacity: 0, scale: 0.98, y: 6 }}
        role="dialog"
        style={panel_style}
        transition={{
          duration: reduce_motion ? 0 : 0.15,
          ease: [0.2, 0, 0, 1],
        }}
        onKeyDown={handle_dialog_key_down}
      >
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 ps-4 pe-2">
          <h2
            className="truncate text-sm font-semibold text-txt-primary"
            id={heading_id}
          >
            {t(FORM_TITLE_KEYS[event_kind][event ? "edit" : "create"])}
          </h2>
          <Tooltip tip={t("common.close")}>
            <IslandIconButton
              label={t("common.close")}
              size="sm"
              type="button"
              onClick={request_close}
            >
              <XMarkIcon className="h-4 w-4" strokeWidth={1.75} />
            </IslandIconButton>
          </Tooltip>
        </div>
        <IslandDivider />

        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(form_event) => {
            form_event.preventDefault();
            void handle_submit();
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <div className="pl-0 sm:pl-9">
              <input
                ref={title_ref}
                aria-invalid={title_touched && has_title_error}
                aria-label={t("calendar.event_title")}
                className="aster_input aster_input_tonal !h-10 w-full !px-3 !text-[16px] font-medium text-txt-primary placeholder:font-normal placeholder:text-txt-muted"
                maxLength={MAX_TITLE_LENGTH}
                placeholder={
                  is_working_location
                    ? working_location_title
                    : t("calendar.event_title_placeholder")
                }
                type="text"
                value={title}
                onChange={(input_event) => set_title(input_event.target.value)}
              />
              {title_touched && has_title_error && (
                <p className={error_class} role="alert">
                  {t("calendar.title_required")}
                </p>
              )}
            </div>

            <div className="mt-2.5 pl-0 sm:pl-9">
              <div className="sm:hidden">
                <CalendarSelect
                  aria_label={t("calendar.event_kind")}
                  full_width
                  options={EVENT_KIND_OPTIONS.map((option) => ({
                    value: option.value,
                    label: t(option.label_key),
                  }))}
                  value={event_kind}
                  on_change={(value) =>
                    choose_event_kind(value as CalendarEventKind)
                  }
                />
              </div>
              <div
                aria-label={t("calendar.event_kind")}
                className="aster_segmented w-full !flex max-sm:!hidden"
                role="group"
              >
                {EVENT_KIND_OPTIONS.map((option) => {
                  const is_active = event_kind === option.value;

                  return (
                    <button
                      key={option.value}
                      aria-pressed={is_active}
                      className="aster_segmented_option min-w-0 flex-auto truncate whitespace-nowrap !px-2"
                      title={t(option.label_key)}
                      type="button"
                      onClick={() => choose_event_kind(option.value)}
                    >
                      {t(option.label_key)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              {event_kind === "working_location" && (
                <FieldRow
                  icon={<MapPinIcon className="h-4 w-4" strokeWidth={1.75} />}
                >
                  <CalendarSelect
                    aria_label={t("calendar.working_location")}
                    full_width
                    class_name="min-w-[10rem]"
                    options={[
                      {
                        value: "home",
                        label: t("calendar.working_location_home"),
                      },
                      {
                        value: "office",
                        label: t("calendar.working_location_office"),
                      },
                      {
                        value: "other",
                        label: t("calendar.working_location_other"),
                      },
                    ]}
                    value={working_location}
                    on_change={(value) =>
                      set_working_location(value as CalendarWorkingLocation)
                    }
                  />
                </FieldRow>
              )}

              {event_kind === "out_of_office" && (
                <p className="pl-0 text-[12.5px] text-txt-muted sm:pl-9">
                  {t("calendar.out_of_office_note")}
                </p>
              )}

              {event_kind === "task" && (
                <p className="pl-0 text-[12.5px] text-txt-muted sm:pl-9">
                  {t("calendar.task_note")}
                </p>
              )}

              {event_kind === "focus_time" && (
                <p className="pl-0 text-[12.5px] text-txt-muted sm:pl-9">
                  {t("calendar.focus_time_note")}
                </p>
              )}

              <FieldRow
                align_top
                icon={<ClockIcon className="h-4 w-4" strokeWidth={1.75} />}
              >
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
                  <DateField
                    aria_label={t("calendar.start_date")}
                    value={start_date}
                    week_start_day={week_start_day}
                    on_change={(next) => {
                      set_start_date(next);

                      if (!end_date || end_date < next) {
                        set_end_date(next);
                      }
                    }}
                  />
                  {!is_all_day && (
                    <TimeField
                      aria_label={t("calendar.start_time")}
                      data_testid="calendar-event-start-time"
                      format_label={format_time_label}
                      invalid_message={t("calendar.time_input_invalid")}
                      list_label={t("calendar.time_suggestions")}
                      options={with_current_time(start_time)}
                      value={start_time}
                      on_change={handle_start_time_change}
                    />
                  )}
                  <span className="px-0.5 text-[14px] text-txt-muted">
                    {t("calendar.time_range_to")}
                  </span>
                  {!is_all_day && (
                    <TimeField
                      aria_label={t("calendar.end_time")}
                      data_testid="calendar-event-end-time"
                      format_label={format_time_label}
                      invalid_message={t("calendar.time_input_invalid")}
                      list_label={t("calendar.time_suggestions")}
                      options={with_current_time(end_time)}
                      render_option={(value) => {
                        const duration =
                          start_date === end_date
                            ? time_to_minutes(value) -
                              time_to_minutes(start_time)
                            : 0;

                        return (
                          <>
                            {format_time_label(value)}
                            {duration > 0 && (
                              <span className="ms-2 text-txt-muted">
                                {format_duration(duration)}
                              </span>
                            )}
                          </>
                        );
                      }}
                      value={end_time}
                      on_change={handle_end_time_change}
                    />
                  )}
                  <DateField
                    aria_label={t("calendar.end_date")}
                    value={end_date}
                    week_start_day={week_start_day}
                    on_change={set_end_date}
                  />
                </div>

                <div className={is_working_location ? "hidden" : "mt-2.5"}>
                  <Checkbox
                    checked={is_all_day}
                    label={t("calendar.all_day")}
                    onCheckedChange={(checked) => {
                      const next = checked === true;

                      if (next === is_all_day) {
                        return;
                      }

                      set_is_all_day(next);

                      if (event === null) {
                        set_reminders(
                          default_reminder_list(
                            next
                              ? preferences.calendar_default_all_day_reminder_minutes
                              : default_reminder_minutes,
                          ),
                        );
                      } else {
                        set_reminders((current) =>
                          next
                            ? remap_reminders(
                                current,
                                EVENT_REMINDER_CHOICES,
                                ALL_DAY_EVENT_REMINDER_CHOICES,
                              )
                            : remap_reminders(
                                current,
                                ALL_DAY_EVENT_REMINDER_CHOICES,
                                EVENT_REMINDER_CHOICES,
                              ),
                        );
                      }
                    }}
                  />
                </div>

                {has_invalid_dates && (
                  <p className={error_class} role="alert">
                    {t("calendar.invalid_dates")}
                  </p>
                )}
                {has_range_error && (
                  <p className={error_class} role="alert">
                    {t("calendar.end_before_start")}
                  </p>
                )}
                {!has_invalid_dates &&
                  !has_range_error &&
                  conflicting_events.length > 0 && (
                    <p
                      aria-live="polite"
                      className="mt-2 flex items-start gap-1.5 text-[12px] leading-[1.35] text-txt-secondary"
                    >
                      <ExclamationTriangleIcon
                        aria-hidden="true"
                        className="mt-px h-3.5 w-3.5 shrink-0"
                        style={{ color: "var(--color-warning)" }}
                      />
                      <span className="min-w-0 break-words">
                        {conflicting_events.length === 1
                          ? t("calendar.conflict_with_event", {
                              title:
                                conflicting_events[0].title ||
                                t("calendar.untitled_event"),
                            })
                          : t("calendar.conflict_with_events", {
                              count: conflicting_events.length,
                            })}
                      </span>
                    </p>
                  )}
              </FieldRow>

              <FieldRow
                align_top
                icon={<ArrowPathIcon className="h-4 w-4" strokeWidth={1.75} />}
              >
                <RecurrenceField
                  language={language}
                  start={
                    Number.isNaN(range_start.getTime())
                      ? calendar_now()
                      : range_start
                  }
                  t={t}
                  value={recurrence}
                  week_start_day={week_start_day}
                  on_change={(next) => {
                    set_recurrence_touched(true);
                    set_recurrence(next);
                  }}
                />
              </FieldRow>

              {is_meeting_kind && (
                <FieldRow
                  align_top
                  icon={<UsersIcon className="h-4 w-4" strokeWidth={1.75} />}
                >
                  <div className="aster_input aster_input_tonal !h-auto min-h-9 flex-wrap items-center gap-1.5 !px-2 py-[3px] focus-within:!bg-[var(--aster-field-hover)]">
                    {attendees.map((attendee) => (
                      <span
                        key={attendee}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-[var(--aster-radius-item)] bg-[var(--aster-selected)] py-0.5 ps-0.5 pe-1 text-xs text-txt-primary"
                      >
                        <span aria-hidden="true" className="shrink-0">
                          <ProfileAvatar
                            email={attendee}
                            name={attendee}
                            size="xs"
                          />
                        </span>
                        <span className="truncate">{attendee}</span>
                        <GuestEncryptionLock
                          status={guest_encryption.get(attendee.toLowerCase())}
                        />
                        <button
                          aria-label={t("calendar.remove_attendee")}
                          className="rounded-[var(--aster-radius-item)] p-0.5 text-txt-muted transition-colors duration-150 hover:bg-[var(--aster-hover)] hover:text-txt-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                          type="button"
                          onClick={() =>
                            set_attendees((current) =>
                              current.filter((value) => value !== attendee),
                            )
                          }
                        >
                          <XMarkIcon
                            className="h-3.5 w-3.5"
                            strokeWidth={1.75}
                          />
                        </button>
                      </span>
                    ))}
                    <input
                      aria-label={t("calendar.attendees")}
                      className="event_form_chip_input min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-[14px] text-txt-primary outline-none"
                      placeholder={t("calendar.attendees_placeholder")}
                      type="text"
                      value={attendee_input}
                      onBlur={() => commit_attendee(attendee_input)}
                      onChange={(input_event) => {
                        set_attendee_input(input_event.target.value);
                        set_attendee_error("");
                      }}
                      onKeyDown={handle_attendee_key_down}
                    />
                  </div>
                  {attendee_error && (
                    <p className={error_class} role="alert">
                      {attendee_error}
                    </p>
                  )}
                  <InviteSenderSelect
                    event={event}
                    visible={attendees.length > 0}
                  />
                  {attendees.length > 0 && (
                    <div className="mt-2 flex flex-col gap-0.5 rounded-[var(--aster-radius-panel,12px)] border border-[var(--border-secondary)] px-1 pb-1">
                      <p className="px-2 pb-1 pt-2.5 text-[13px] font-medium text-txt-secondary">
                        {t("calendar.guest_permissions")}
                      </p>
                      <label className="flex min-h-10 cursor-pointer select-none items-center gap-2.5 rounded-[var(--aster-radius-item,8px)] px-2 py-2 text-sm text-txt-primary transition-colors duration-100 hover:bg-[var(--aster-hover)] active:bg-[var(--aster-selected)]">
                        <Checkbox
                          checked={guests_can_modify}
                          onCheckedChange={(next) =>
                            set_guests_can_modify(next === true)
                          }
                        />
                        {t("calendar.guests_can_modify")}
                      </label>
                      <label className="flex min-h-10 cursor-pointer select-none items-center gap-2.5 rounded-[var(--aster-radius-item,8px)] px-2 py-2 text-sm text-txt-primary transition-colors duration-100 hover:bg-[var(--aster-hover)] active:bg-[var(--aster-selected)]">
                        <Checkbox
                          checked={guests_can_invite}
                          onCheckedChange={(next) =>
                            set_guests_can_invite(next === true)
                          }
                        />
                        {t("calendar.guests_can_invite")}
                      </label>
                      <label className="flex min-h-10 cursor-pointer select-none items-center gap-2.5 rounded-[var(--aster-radius-item,8px)] px-2 py-2 text-sm text-txt-primary transition-colors duration-100 hover:bg-[var(--aster-hover)] active:bg-[var(--aster-selected)]">
                        <Checkbox
                          checked={guests_can_see_guests}
                          onCheckedChange={(next) =>
                            set_guests_can_see_guests(next === true)
                          }
                        />
                        {t("calendar.guests_can_see_guests")}
                      </label>
                    </div>
                  )}
                </FieldRow>
              )}

              {(!is_working_location || working_location === "other") && (
                <FieldRow
                  icon={<MapPinIcon className="h-4 w-4" strokeWidth={1.75} />}
                >
                  <input
                    aria-label={t("calendar.location")}
                    className="aster_input aster_input_tonal !h-9 w-full !px-3 !text-[14px]"
                    maxLength={MAX_LOCATION_LENGTH}
                    placeholder={t("calendar.location_placeholder")}
                    type="text"
                    value={location}
                    onChange={(input_event) =>
                      set_location(input_event.target.value)
                    }
                  />
                </FieldRow>
              )}

              {is_meeting_kind && (
                <FieldRow
                  align_top
                  icon={
                    <VideoCameraIcon className="h-4 w-4" strokeWidth={1.75} />
                  }
                >
                  <input
                    aria-describedby={
                      conference_url_touched && has_conference_url_error
                        ? "event-form-conference-url-error"
                        : undefined
                    }
                    aria-invalid={
                      conference_url_touched && has_conference_url_error
                    }
                    aria-label={t("calendar.conference_url")}
                    autoCapitalize="off"
                    autoComplete="off"
                    autoCorrect="off"
                    className="aster_input aster_input_tonal !h-9 w-full !px-3 !text-[14px]"
                    inputMode="url"
                    maxLength={MAX_CONFERENCE_URL_LENGTH}
                    placeholder={t("calendar.conference_url_placeholder")}
                    spellCheck={false}
                    type="url"
                    value={conference_url}
                    onBlur={() => set_conference_url_touched(true)}
                    onChange={(input_event) =>
                      set_conference_url(input_event.target.value)
                    }
                  />
                  {conference_url_touched && has_conference_url_error && (
                    <p
                      className={error_class}
                      id="event-form-conference-url-error"
                      role="alert"
                    >
                      {t("calendar.settings_conference_url_invalid")}
                    </p>
                  )}
                </FieldRow>
              )}

              <FieldRow
                icon={<BellIcon className="h-4 w-4" strokeWidth={1.75} />}
              >
                <EventReminderEditor
                  is_all_day={is_all_day}
                  reminders={reminders}
                  on_change={set_reminders}
                />
              </FieldRow>

              <FieldRow
                icon={<CalendarIcon className="h-4 w-4" strokeWidth={1.75} />}
              >
                <CalendarSelect
                  aria_label={t("calendar.select_calendar")}
                  full_width
                  class_name="min-w-[12rem]"
                  options={[
                    ...calendars,
                    {
                      color: BIRTHDAY_COLOR,
                      id: BIRTHDAY_CALENDAR_ID,
                      name: t("calendar.settings_birthdays"),
                    },
                  ].map((calendar) => ({
                    value: calendar.id,
                    text: calendar.name,
                    label: (
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: calendar.color }}
                        />
                        <span className="truncate">{calendar.name}</span>
                      </span>
                    ),
                  }))}
                  render_value={() => (
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: accent_color }}
                      />
                      <span className="truncate">
                        {is_birthday
                          ? t("calendar.settings_birthdays")
                          : (selected_calendar?.name ?? t("calendar.calendar"))}
                      </span>
                    </span>
                  )}
                  value={is_birthday ? BIRTHDAY_CALENDAR_ID : calendar_id}
                  on_change={choose_calendar}
                />
              </FieldRow>

              <div className="-ms-2 ps-9">
                <button
                  aria-expanded={show_more}
                  className="inline-flex items-center gap-1.5 rounded-[var(--aster-radius-item)] px-2 py-1.5 text-[13px] font-medium text-txt-secondary hover:bg-[var(--aster-hover)] hover:text-txt-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                  type="button"
                  onClick={() => set_show_more((current) => !current)}
                >
                  {show_more
                    ? t("calendar.fewer_options")
                    : t("calendar.more_options")}
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${show_more ? "rotate-180" : ""}`}
                    strokeWidth={2}
                  />
                </button>
              </div>

              <AnimatePresence initial={false}>
                {show_more && (
                  <motion.div
                    key="more-options"
                    animate="shown"
                    className="-mx-1 -mb-1 -mt-3 overflow-hidden px-1"
                    data-testid="event-form-more-options"
                    exit={reduce_motion ? undefined : "hidden"}
                    initial={reduce_motion ? false : "hidden"}
                    variants={more_options_variants}
                  >
                    <div className="flex flex-col gap-3 pb-1 pt-3">
                      <motion.div variants={more_option_row_variants}>
                        <FieldRow
                          align_top
                          icon={
                            <TagIcon className="h-4 w-4" strokeWidth={1.75} />
                          }
                        >
                          <div className="aster_input aster_input_tonal !h-auto min-h-9 flex-wrap items-center gap-1.5 !px-2 py-[3px] focus-within:!bg-[var(--aster-field-hover)]">
                            {tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex max-w-full items-center gap-1.5 rounded-[var(--aster-radius-item)] py-0.5 ps-2 pe-1 text-xs font-medium"
                                style={{
                                  backgroundColor: `color-mix(in srgb, ${tag_color_for(tag)} 18%, var(--bg-primary))`,
                                  color: "var(--text-primary)",
                                }}
                              >
                                <TagColorPicker
                                  color={tag_color_for(tag)}
                                  tag={tag}
                                  on_select={(color) =>
                                    set_tag_color(tag, color)
                                  }
                                >
                                  <button
                                    aria-label={t("calendar.change_tag_color", {
                                      tag,
                                    })}
                                    className="-my-0.5 -ms-1 inline-flex min-w-0 touch-manipulation items-center gap-1.5 rounded-[var(--aster-radius-item)] py-0.5 ps-1 pe-0.5 text-start transition-colors duration-150 hover:bg-[var(--aster-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                                    data-testid="event-form-tag-color"
                                    type="button"
                                  >
                                    <span
                                      aria-hidden="true"
                                      className="h-2 w-2 shrink-0 rounded-full"
                                      style={{
                                        backgroundColor: tag_color_for(tag),
                                      }}
                                    />
                                    <span className="truncate">{tag}</span>
                                  </button>
                                </TagColorPicker>
                                <button
                                  aria-label={t("calendar.remove_tag")}
                                  className="rounded-[var(--aster-radius-item)] p-0.5 text-txt-muted transition-colors duration-150 hover:bg-[var(--aster-hover)] hover:text-txt-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                                  type="button"
                                  onClick={() =>
                                    set_tags((current) =>
                                      current.filter((value) => value !== tag),
                                    )
                                  }
                                >
                                  <XMarkIcon
                                    className="h-3 w-3"
                                    strokeWidth={1.75}
                                  />
                                </button>
                              </span>
                            ))}
                            <input
                              aria-label={t("calendar.tags")}
                              className="event_form_chip_input min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-[14px] text-txt-primary outline-none"
                              placeholder={t("calendar.tags_placeholder")}
                              type="text"
                              value={tag_input}
                              onBlur={() => commit_tag(tag_input)}
                              onChange={(input_event) =>
                                set_tag_input(input_event.target.value)
                              }
                              onKeyDown={handle_tag_key_down}
                            />
                          </div>
                        </FieldRow>
                      </motion.div>
                      <motion.div variants={more_option_row_variants}>
                        <FieldRow
                          align_top
                          icon={
                            <SwatchIcon
                              className="h-4 w-4"
                              strokeWidth={1.75}
                            />
                          }
                        >
                          <div className="flex flex-wrap items-center gap-2.5 py-1 ps-1">
                            <button
                              aria-label={t("calendar.color_calendar_default")}
                              aria-pressed={color === null}
                              className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full transition-shadow duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--aster-dialog-bg)]"
                              style={{
                                backgroundColor: accent_color,
                                boxShadow:
                                  color === null
                                    ? `0 0 0 2px var(--aster-dialog-bg), 0 0 0 4px ${accent_color}`
                                    : "none",
                              }}
                              title={t("calendar.color_calendar_default")}
                              type="button"
                              onClick={() => set_color(null)}
                            >
                              {color === null && (
                                <CheckIcon
                                  className="h-3 w-3"
                                  style={{ color: ink_on_fill(accent_color) }}
                                />
                              )}
                            </button>
                            {EVENT_COLOR_OPTIONS.map((option) => {
                              const is_selected =
                                color !== null &&
                                nearest_event_color(color).name === option.name;

                              return (
                                <button
                                  key={option.name}
                                  aria-label={t(option.name_key)}
                                  aria-pressed={is_selected}
                                  className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full transition-shadow duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--aster-dialog-bg)]"
                                  style={{
                                    backgroundColor: option.token,
                                    boxShadow: is_selected
                                      ? `0 0 0 2px var(--aster-dialog-bg), 0 0 0 4px ${option.token}`
                                      : "none",
                                  }}
                                  title={t(option.name_key)}
                                  type="button"
                                  onClick={() => set_color(option.hex)}
                                >
                                  {is_selected && (
                                    <CheckIcon
                                      className="h-3 w-3"
                                      style={{ color: option.ink }}
                                    />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </FieldRow>
                      </motion.div>
                      <motion.div variants={more_option_row_variants}>
                        <FieldRow
                          icon={
                            <EyeIcon className="h-4 w-4" strokeWidth={1.75} />
                          }
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <CalendarSelect
                              aria_label={t("calendar.availability")}
                              class_name="min-w-[8rem]"
                              options={[
                                {
                                  value: "busy",
                                  label: t("calendar.availability_busy"),
                                },
                                {
                                  value: "free",
                                  label: t("calendar.availability_free"),
                                },
                              ]}
                              value={availability}
                              on_change={(value) =>
                                set_availability(
                                  value as CalendarEventAvailability,
                                )
                              }
                            />
                            <CalendarSelect
                              aria_label={t("calendar.visibility")}
                              class_name="min-w-[10rem]"
                              options={[
                                {
                                  value: "default",
                                  label: t("calendar.visibility_default"),
                                },
                                {
                                  value: "public",
                                  label: t("calendar.visibility_public"),
                                },
                                {
                                  value: "private",
                                  label: t("calendar.visibility_private"),
                                },
                              ]}
                              value={visibility}
                              on_change={(value) =>
                                set_visibility(value as CalendarEventVisibility)
                              }
                            />
                          </div>
                        </FieldRow>
                      </motion.div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <FieldRow
                align_top
                icon={
                  <Bars3BottomLeftIcon className="h-4 w-4" strokeWidth={1.75} />
                }
              >
                <textarea
                  aria-label={t("calendar.description")}
                  className="aster_input aster_input_tonal w-full resize-y !px-3 !text-[14px]"
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  placeholder={t("calendar.description_placeholder")}
                  style={{
                    height: "5rem",
                    paddingBottom: "8px",
                    paddingTop: "8px",
                  }}
                  value={description}
                  onChange={(textarea_event) =>
                    set_description(textarea_event.target.value)
                  }
                />
              </FieldRow>
            </div>

            {submit_error && (
              <p className={`${error_class} pl-0 sm:pl-9`} role="alert">
                {submit_error}
              </p>
            )}
          </div>

          <IslandDivider />
          <div className="flex shrink-0 items-center justify-end gap-2 px-3 py-3">
            <Button
              size="md"
              type="button"
              variant="ghost"
              onClick={request_close}
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={is_blocked && !has_title_error}
              size="md"
              type="submit"
              variant="depth"
            >
              {is_submitting
                ? t("common.saving")
                : event
                  ? t("common.save")
                  : t("common.create")}
            </Button>
          </div>
        </form>
      </motion.div>
      <AlertDialog open={confirm_discard} onOpenChange={set_confirm_discard}>
        <AlertDialogContent on_overlay_click={() => set_confirm_discard(false)}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("common.discard_changes_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("common.discard_changes_message")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => set_confirm_discard(false)}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                set_confirm_discard(false);
                on_close();
              }}
            >
              {t("common.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
