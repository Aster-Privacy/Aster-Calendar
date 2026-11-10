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
  CalendarAttendee,
  CalendarEventDraft,
  DecryptedCalendarEvent,
  RecurrenceEditScope,
} from "@/types/calendar";
import type { CalendarEventMenuActions } from "@/components/calendar/calendar_event_context_menu";
import type { PrintDialogSettings } from "@/components/calendar/calendar_print_dialog";
import type {
  QuickCreateDraft,
  QuickCreatePreview,
} from "@/components/calendar/quick_create_popover";
import type { use_calendar_state } from "@/components/calendar/use_calendar_state";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  ExclamationTriangleIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { CalendarEmptyState } from "@/components/calendar/calendar_empty_state";
import {
  EmptyRangeIllustration,
  NoResultsIllustration,
} from "@/components/calendar/illustrations/calendar_illustrations";

import { CalendarScheduleRangeBar } from "@/components/calendar/calendar_schedule_range_bar";
import { CalendarAgendaView } from "@/components/calendar/calendar_agenda_view";
import {
  PHONE_CUSTOM_DAY_COUNT,
  PHONE_DAY_COUNT,
  add_days,
  build_custom_days,
  build_phone_week_days,
  build_week_days,
  end_of_day,
  resolve_event_color,
  start_of_day,
  event_occurrence_key,
} from "@/components/calendar/calendar_utils";
import { calendar_now } from "@/services/calendar/view_zone";
import { build_event_link } from "@/components/calendar/event_link";
import { CalendarHeader } from "@/components/calendar/calendar_header";
import { CalendarImportDialog } from "@/components/calendar/calendar_import_dialog";
import { CalendarPrintDialog } from "@/components/calendar/calendar_print_dialog";
import { CalendarMonthView } from "@/components/calendar/calendar_month_view";
import { CalendarTimeGridView } from "@/components/calendar/calendar_time_grid_view";
import { CalendarYearView } from "@/components/calendar/calendar_year_view";
import { use_calendar_breakpoint } from "@/components/calendar/use_calendar_breakpoint";
import { EventDetailPopover } from "@/components/calendar/event_detail_popover";
import { EventFormModal } from "@/components/calendar/event_form_modal";
import {
  InviteSendDialog,
  type InviteSendKind,
} from "@/components/calendar/invite_send_dialog";
import { QuickCreatePopover } from "@/components/calendar/quick_create_popover";
import { RecurrenceScopeDialog } from "@/components/calendar/recurrence_scope_dialog";
import {
  type PrintCalendarOptions,
  print_calendar,
} from "@/services/calendar/print_calendar";
import { is_ics_file } from "@/services/calendar/ics_import";
import { calendar_sync_engine } from "@/services/calendar/sync_engine";
import {
  has_pending_onboarding_import,
  take_pending_onboarding_import,
} from "@/lib/calendar_onboarding_import";
import { send_invitations } from "@/services/calendar/invite_mail";
import {
  event_guests,
  event_organizer_email,
  is_event_organizer,
  next_sequence,
  owns_event_for_edit,
  same_address,
} from "@/services/calendar/itip";
import {
  clear_invite_sender_choice,
  find_invite_sender,
  get_invite_sender_choice,
  invite_form_key,
  invite_sender_identity,
  resolve_invite_sender,
  use_invite_sender_choice,
} from "@/services/calendar/invite_sender";
import { is_own_address } from "@/services/calendar/own_addresses";
import { use_invite_senders } from "@/components/calendar/use_invite_senders";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { show_toast } from "@/components/toast/simple_toast";
import {
  get_current_action_toast,
  settle_undo_toast,
  show_action_toast,
} from "@/components/toast/action_toast";
import {
  clear_undo,
  register_undo,
  take_undo,
} from "@/services/calendar/undo_stack";
import { use_app_document_title } from "@/hooks/use_document_title";
import { use_i18n } from "@/lib/i18n/context";
import { toggle_task_done_with_undo } from "@/components/calendar/task_done_toast";
import { has_open_overlay_layer } from "@/lib/overlay_layer_stack";

const DETAILS_PANEL_QUERY = "(min-width: 1280px)";

interface PendingInvite {
  kind: InviteSendKind;
  event: DecryptedCalendarEvent;
  guests: CalendarAttendee[];
  sequence: number;
}

function new_event_uid(): string {
  return `${crypto.randomUUID()}@aster.calendar`;
}

function invite_details_changed(
  previous: DecryptedCalendarEvent,
  draft: CalendarEventDraft,
): boolean {
  return (
    previous.title !== draft.title ||
    previous.description !== draft.description ||
    previous.location !== draft.location ||
    previous.starts_at !== draft.starts_at ||
    previous.ends_at !== draft.ends_at ||
    previous.is_all_day !== draft.is_all_day ||
    previous.conference_url !== draft.conference_url ||
    JSON.stringify(previous.recurrence) !== JSON.stringify(draft.recurrence)
  );
}

function is_editable_target(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tag = target.tagName.toLowerCase();

  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.getAttribute("role") === "textbox"
  );
}

function event_from_draft(
  draft: CalendarEventDraft,
  previous: DecryptedCalendarEvent | null,
): DecryptedCalendarEvent {
  const now = new Date().toISOString();

  return {
    ...(previous ?? {}),
    ...draft,
    id: previous?.id ?? draft.uid ?? "",
    recurrence_master_id: previous?.recurrence_master_id ?? null,
    occurrence_start: previous?.occurrence_start ?? null,
    created_at: previous?.created_at ?? now,
    updated_at: now,
  };
}

function show_undoable_toast(options: {
  action_type: "folder" | "trash";
  email_ids: string[];
  message: string;
  on_undo: () => Promise<void>;
}) {
  const run = async () => {
    clear_undo();
    await options.on_undo();
  };

  register_undo(run);
  show_action_toast({ ...options, on_undo: run });
}

function apply_speedy_meetings(minutes: number, enabled: boolean): number {
  if (!enabled) {
    return minutes;
  }

  const trimmed = minutes <= 30 ? minutes - 5 : minutes - 10;

  return trimmed >= 5 ? trimmed : minutes;
}

interface CalendarContentProps {
  state: ReturnType<typeof use_calendar_state>;
  has_load_error: boolean;
  on_retry: () => void;
}

export function CalendarContent({
  state,
  has_load_error,
  on_retry,
}: CalendarContentProps) {
  const { language } = use_i18n();
  const { user } = use_auth();
  const default_invite_sender =
    typeof state.preferences.calendar_default_invite_sender === "string"
      ? state.preferences.calendar_default_invite_sender
      : "";
  const editing_invite_choice = use_invite_sender_choice(
    invite_form_key(state.editing_event),
  );
  const invite_senders = use_invite_senders([
    default_invite_sender,
    editing_invite_choice,
    state.editing_event ? event_organizer_email(state.editing_event) : null,
  ]);
  const [pending_invite, set_pending_invite] = useState<PendingInvite | null>(
    null,
  );
  const [is_sending_invite, set_is_sending_invite] = useState(false);
  const [quick_preview, set_quick_preview] =
    useState<QuickCreatePreview | null>(null);

  const [has_details_panel, set_has_details_panel] = useState(
    () => window.matchMedia(DETAILS_PANEL_QUERY).matches,
  );
  const { is_phone } = use_calendar_breakpoint();

  const effective_default_duration = apply_speedy_meetings(
    state.preferences.calendar_default_event_duration,
    state.preferences.calendar_speedy_meetings,
  );

  useEffect(() => {
    const media = window.matchMedia(DETAILS_PANEL_QUERY);
    const handle = (changed: MediaQueryListEvent) =>
      set_has_details_panel(changed.matches);

    media.addEventListener("change", handle);

    return () => media.removeEventListener("change", handle);
  }, []);

  const period_month_short = useMemo(() => {
    if (state.view_mode === "day") {
      return new Intl.DateTimeFormat(language, {
        day: "numeric",
        month: "short",
      }).format(state.anchor_date);
    }

    if (state.view_mode === "year") {
      return "";
    }

    if (state.view_mode === "month") {
      return new Intl.DateTimeFormat(language, { month: "short" }).format(
        state.anchor_date,
      );
    }

    if (state.view_mode === "agenda" && is_phone) {
      return new Intl.DateTimeFormat(language, { month: "short" }).format(
        state.range_start,
      );
    }

    const span =
      state.view_mode === "agenda"
        ? [state.range_start, state.period_end]
        : state.view_mode === "custom"
          ? build_custom_days(
              state.anchor_date,
              is_phone
                ? Math.min(state.custom_view_days, PHONE_CUSTOM_DAY_COUNT)
                : state.custom_view_days,
            )
          : is_phone
            ? build_phone_week_days(state.anchor_date, state.week_start_day)
            : build_week_days(state.anchor_date, state.week_start_day);
    const first = span[0];
    const last = span[span.length - 1];

    if (is_phone && state.view_mode !== "agenda") {
      const range = new Intl.DateTimeFormat(language, {
        day: "numeric",
        month: "short",
      });
      const day_only = new Intl.DateTimeFormat(language, { day: "numeric" });
      const same_month =
        first.getMonth() === last.getMonth() &&
        first.getFullYear() === last.getFullYear();

      return same_month
        ? `${range.format(first)} - ${day_only.format(last)}`
        : `${range.format(first)} - ${range.format(last)}`;
    }

    if (
      first.getMonth() === last.getMonth() &&
      first.getFullYear() === last.getFullYear()
    ) {
      return new Intl.DateTimeFormat(language, { month: "long" }).format(first);
    }

    const month = new Intl.DateTimeFormat(language, { month: "short" });

    return `${month.format(first)} - ${month.format(last)}`;
  }, [
    is_phone,
    language,
    state.anchor_date,
    state.custom_view_days,
    state.period_end,
    state.range_start,
    state.view_mode,
    state.week_start_day,
  ]);

  const period_month = useMemo(() => {
    if (state.view_mode === "year") {
      return "";
    }

    if (state.view_mode === "custom") {
      const days = build_custom_days(state.anchor_date, state.custom_view_days);
      const first = days[0];
      const last = days[days.length - 1];
      const range = new Intl.DateTimeFormat(language, {
        day: "numeric",
        month: "short",
      });

      return `${range.format(first)} - ${range.format(last)}`;
    }

    if (state.view_mode === "agenda") {
      const range = new Intl.DateTimeFormat(language, {
        day: "numeric",
        month: "short",
      });

      return `${range.format(state.range_start)} - ${range.format(state.period_end)}`;
    }

    if (state.view_mode === "day") {
      return new Intl.DateTimeFormat(language, {
        day: "numeric",
        month: "long",
      }).format(state.anchor_date);
    }

    if (state.view_mode === "week") {
      const week = build_week_days(state.anchor_date, state.week_start_day);
      const first = week[0];
      const last = week[week.length - 1];

      if (first.getMonth() !== last.getMonth()) {
        const range = new Intl.DateTimeFormat(language, {
          day: "numeric",
          month: "short",
        });

        return `${range.format(first)} - ${range.format(last)}`;
      }
    }

    return new Intl.DateTimeFormat(language, { month: "long" }).format(
      state.anchor_date,
    );
  }, [
    language,
    state.anchor_date,
    state.custom_view_days,
    state.period_end,
    state.range_start,
    state.view_mode,
    state.week_start_day,
  ]);

  const period_year = useMemo(() => {
    const year = new Intl.DateTimeFormat(language, { year: "numeric" });

    if (state.view_mode === "agenda") {
      if (state.range_start.getFullYear() !== state.period_end.getFullYear()) {
        return `${year.format(state.range_start)} - ${year.format(state.period_end)}`;
      }

      return year.format(state.period_end);
    }

    if (state.view_mode === "week" || state.view_mode === "custom") {
      const span =
        state.view_mode === "custom"
          ? build_custom_days(state.anchor_date, state.custom_view_days)
          : build_week_days(state.anchor_date, state.week_start_day);
      const first = span[0];
      const last = span[span.length - 1];

      if (first.getFullYear() !== last.getFullYear()) {
        return `${year.format(first)} - ${year.format(last)}`;
      }
    }

    return year.format(state.anchor_date);
  }, [
    language,
    state.anchor_date,
    state.custom_view_days,
    state.period_end,
    state.range_start,
    state.view_mode,
    state.week_start_day,
  ]);

  const is_current_period = useMemo(() => {
    const today = calendar_now();

    if (state.view_mode === "year") {
      return state.anchor_date.getFullYear() === today.getFullYear();
    }

    if (state.view_mode === "month") {
      return (
        state.anchor_date.getFullYear() === today.getFullYear() &&
        state.anchor_date.getMonth() === today.getMonth()
      );
    }

    return state.is_today_visible;
  }, [state.anchor_date, state.is_today_visible, state.view_mode]);

  const phone_pages_days =
    is_phone &&
    (state.view_mode === "week" ||
      (state.view_mode === "custom" &&
        state.custom_view_days > PHONE_CUSTOM_DAY_COUNT));
  const navigate_phone_page = useCallback(
    (direction: 1 | -1) => {
      const page_size =
        state.view_mode === "week" ? PHONE_DAY_COUNT : PHONE_CUSTOM_DAY_COUNT;
      const page =
        state.view_mode === "week"
          ? build_phone_week_days(state.anchor_date, state.week_start_day)
          : build_custom_days(state.anchor_date, page_size);

      state.handle_page_to_day(add_days(page[0], direction * page_size));
    },
    [
      state.anchor_date,
      state.custom_view_days,
      state.handle_page_to_day,
      state.view_mode,
      state.week_start_day,
    ],
  );
  const go_to_next_period = phone_pages_days
    ? () => navigate_phone_page(1)
    : state.go_to_next;
  const go_to_previous_period = phone_pages_days
    ? () => navigate_phone_page(-1)
    : state.go_to_previous;

  const [print_open, set_print_open] = useState(false);
  const [import_files, set_import_files] = useState<File[]>([]);
  const [is_drop_target, set_is_drop_target] = useState(false);
  const drop_depth_ref = useRef(0);

  use_app_document_title(
    `${period_month} ${period_year}`.trim(),
    state.t("calendar.aster_calendar_brand"),
  );

  const print_range_label = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(language, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    return `${formatter.format(state.range_start)} - ${formatter.format(state.period_end)}`;
  }, [language, state.range_start, state.period_end]);

  const build_print_options = useCallback(
    (settings: PrintDialogSettings): PrintCalendarOptions => {
      const days: Date[] = [];
      const cursor = start_of_day(state.range_start);
      const last = start_of_day(state.period_end);

      while (cursor.getTime() <= last.getTime() && days.length < 372) {
        days.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }

      const color_by_event_id = new Map<string, string>();

      for (const event of state.events) {
        color_by_event_id.set(
          event.id,
          resolve_event_color(
            event,
            state.calendar_by_id.get(event.calendar_id)?.color,
          ),
        );
      }

      return {
        title: `${period_month} ${period_year}`.trim(),
        subtitle: print_range_label,
        days,
        events: state.events,
        color_by_event_id,
        layout: settings.layout,
        orientation: settings.orientation,
        show_declined: settings.show_declined,
        language,
        time_format: state.preferences.time_format,
        labels: {
          all_day: state.t("calendar.all_day"),
          no_events: state.t("calendar.empty_range_title"),
          more_events: state.t("calendar.more_events", { count: "{{count}}" }),
          printed_on: state.t("calendar.print_footer", {
            date: new Intl.DateTimeFormat(language, {
              dateStyle: "long",
            }).format(new Date()),
          }),
        },
      };
    },
    [
      language,
      period_month,
      period_year,
      print_range_label,
      state.calendar_by_id,
      state.events,
      state.preferences.time_format,
      state.period_end,
      state.range_start,
      state.t,
    ],
  );

  const handle_print = useCallback(
    (settings: PrintDialogSettings) => {
      set_print_open(false);
      print_calendar(build_print_options(settings));
    },
    [build_print_options],
  );

  useEffect(() => {
    const handle_undo = (keyboard_event: KeyboardEvent) => {
      if (
        keyboard_event.key.toLowerCase() !== "z" ||
        !(keyboard_event.ctrlKey || keyboard_event.metaKey) ||
        keyboard_event.altKey ||
        keyboard_event.shiftKey
      ) {
        return;
      }

      const target = keyboard_event.target as HTMLElement | null;

      if (
        target !== null &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      const undo = take_undo();

      if (undo === null) {
        return;
      }

      keyboard_event.preventDefault();

      const undo_toast = get_current_action_toast();

      void undo()
        .then(() => {
          if (
            undo_toast === null ||
            !settle_undo_toast(
              undo_toast,
              state.t("calendar.action_undone"),
              2000,
            )
          ) {
            show_toast(state.t("calendar.action_undone"), "success");
          }
        })
        .catch(() => {
          if (
            undo_toast === null ||
            !settle_undo_toast(
              undo_toast,
              state.t("calendar.event_save_failed"),
              5000,
            )
          ) {
            show_toast(state.t("calendar.event_save_failed"), "error");
          }
        });
    };

    window.addEventListener("keydown", handle_undo);

    return () => window.removeEventListener("keydown", handle_undo);
  }, [state.t]);

  useEffect(() => {
    const handle_keydown = (keyboard_event: KeyboardEvent) => {
      if (
        keyboard_event.key.toLowerCase() !== "p" ||
        !(keyboard_event.ctrlKey || keyboard_event.metaKey) ||
        keyboard_event.altKey ||
        keyboard_event.shiftKey ||
        keyboard_event.defaultPrevented
      ) {
        return;
      }

      if (
        has_open_overlay_layer() ||
        is_editable_target(keyboard_event.target)
      ) {
        return;
      }

      keyboard_event.preventDefault();
      set_print_open(true);
    };

    window.addEventListener("keydown", handle_keydown);

    return () => window.removeEventListener("keydown", handle_keydown);
  }, []);

  const is_searching = state.applied_search_query.length > 0;
  const is_search_settling =
    state.is_search_pending || (is_searching && state.is_search_window_loading);

  const show_empty_state =
    !has_load_error &&
    !state.is_loading &&
    !is_search_settling &&
    state.events.length === 0 &&
    (is_searching || (state.view_mode === "agenda" && !state.agenda_has_more));

  const has_any_events = useMemo(
    () => calendar_sync_engine.get_events().some((event) => !event.trashed_at),
    [state.events, state.is_loading, state.calendars],
  );

  const is_filtering_events =
    state.selected_tags.length > 0 ||
    state.calendars.some((calendar) => !calendar.is_visible);

  const is_first_run =
    !has_load_error &&
    !state.is_loading &&
    !is_searching &&
    !is_search_settling &&
    !is_filtering_events &&
    state.events.length === 0 &&
    !has_any_events;

  const show_first_run_state =
    is_first_run && state.view_mode !== "agenda" && !show_empty_state;

  const prompt_invites = (
    kind: InviteSendKind,
    event: DecryptedCalendarEvent,
    guests: CalendarAttendee[],
    sequence: number,
  ) => {
    if (guests.length === 0 || !state.self_email) {
      return;
    }

    set_pending_invite({ kind, event, guests, sequence });
  };

  const handle_invite_send = async () => {
    if (!pending_invite || !state.self_email) {
      return;
    }

    set_is_sending_invite(true);

    const organizer_address =
      event_organizer_email(pending_invite.event) ?? state.self_email;
    const sender = invite_sender_identity(
      find_invite_sender(invite_senders.all_options, organizer_address),
      state.self_email,
      user?.display_name,
    );

    try {
      const result = await send_invitations({
        event: pending_invite.event,
        guests: pending_invite.guests,
        method: pending_invite.kind === "cancel" ? "CANCEL" : "REQUEST",
        organizer: {
          email: sender.email,
          display_name: sender.display_name ?? user?.display_name ?? null,
        },
        sender: sender.is_primary
          ? null
          : { email: sender.email, address_hash: sender.address_hash },
        sequence: pending_invite.sequence,
        is_update: pending_invite.kind === "update",
        t: state.t,
        language,
      });

      if (result.sent > 0) {
        show_toast(
          state.t(
            pending_invite.kind === "cancel"
              ? "calendar.invite_cancel_sent_toast"
              : "calendar.invite_sent_toast",
            { count: result.sent },
          ),
          "success",
        );
      }

      if (result.failed > 0) {
        show_toast(
          state.t("calendar.invite_send_partial", { count: result.failed }),
          "error",
        );
      }
    } finally {
      set_is_sending_invite(false);
      set_pending_invite(null);
    }
  };

  const handle_form_submit = async (draft: CalendarEventDraft) => {
    const previous = state.editing_event;
    const was_editing = !!previous;
    const self_email = state.self_email;
    const previous_organizer = previous
      ? event_organizer_email(previous)
      : null;
    const owns_previous =
      previous_organizer !== null &&
      is_own_address(previous_organizer, self_email);
    const sender_resolution = resolve_invite_sender({
      options: invite_senders.all_options,
      requested: owns_previous
        ? previous_organizer
        : (get_invite_sender_choice(invite_form_key(previous)) ??
          (default_invite_sender || invite_senders.mail_default_email || "")),
      pending_domain_names: invite_senders.pending_domain_names,
      loading: invite_senders.loading,
    });
    const sender_email = sender_resolution.option?.email ?? self_email;
    const organizer_email =
      previous_organizer !== null &&
      (!owns_previous || sender_resolution.issue === null)
        ? previous_organizer
        : sender_email;
    const guests_after = event_guests(
      { attendees: draft.attendees, organizer_email },
      self_email,
    );
    const is_organizer = previous
      ? owns_event_for_edit(previous, self_email)
      : true;

    clear_invite_sender_choice();
    const details_changed =
      previous !== null && invite_details_changed(previous, draft);
    const prepared: CalendarEventDraft = { ...draft };

    if (previous) {
      prepared.uid =
        previous.uid ?? (guests_after.length > 0 ? new_event_uid() : null);
      prepared.recurrence_id = previous.recurrence_id ?? null;
      prepared.organizer_email =
        previous_organizer !== null || (is_organizer && guests_after.length > 0)
          ? organizer_email
          : null;
      prepared.sequence =
        is_organizer && guests_after.length > 0 && details_changed
          ? next_sequence(previous)
          : (previous.sequence ?? 0);
    } else if (guests_after.length > 0) {
      prepared.uid = new_event_uid();
      prepared.organizer_email = organizer_email;
      prepared.sequence = 0;
    }

    const goes_through_scope_dialog =
      previous !== null &&
      (previous.recurrence !== null || previous.recurrence_master_id !== null);

    try {
      await state.handle_form_submit(prepared);

      if (goes_through_scope_dialog) {
        return;
      }

      show_toast(
        state.t(
          was_editing
            ? "calendar.event_updated"
            : prepared.event_kind === "task"
              ? "calendar.task_created"
              : "calendar.event_created",
        ),
        "success",
      );
    } catch {
      show_toast(state.t("calendar.event_save_failed"), "error");

      return;
    }

    if (!is_organizer || guests_after.length === 0) {
      return;
    }

    const sent_event = event_from_draft(prepared, previous);

    if (!previous) {
      prompt_invites("request", sent_event, guests_after, 0);

      return;
    }

    const guests_before = event_guests(previous, self_email);
    const new_guests = guests_after.filter(
      (guest) =>
        !guests_before.some((known) => same_address(known.email, guest.email)),
    );

    if (details_changed) {
      prompt_invites(
        "update",
        sent_event,
        guests_after,
        prepared.sequence ?? 0,
      );
    } else if (new_guests.length > 0) {
      prompt_invites("request", sent_event, new_guests, prepared.sequence ?? 0);
    }
  };

  const handle_quick_save = async (draft: QuickCreateDraft) => {
    try {
      await state.handle_quick_save(draft);
      show_toast(
        state.t(
          draft.event_kind === "task"
            ? "calendar.task_created"
            : "calendar.event_created",
        ),
        "success",
      );
    } catch {
      show_toast(state.t("calendar.event_save_failed"), "error");
    }
  };

  const { go_to_next, go_to_previous, reload } = state;
  const reschedule_event = state.handle_event_reschedule;
  const translate = state.t;

  const handle_event_reschedule = useCallback(
    async (event: DecryptedCalendarEvent, start: Date, end: Date) => {
      const previous_start = new Date(event.starts_at);
      const previous_end = new Date(event.ends_at);

      try {
        const saved = await reschedule_event(event, start, end);

        if (!saved) {
          return;
        }

        show_undoable_toast({
          action_type: "folder",
          email_ids: [],
          message: translate("calendar.event_updated"),
          on_undo: async () => {
            await reschedule_event(saved, previous_start, previous_end);
          },
        });
      } catch {
        show_toast(translate("calendar.event_save_failed"), "error");
      }
    },
    [reschedule_event, translate],
  );

  const handle_event_move_day = useCallback(
    (event: DecryptedCalendarEvent, target_day: Date) => {
      const start = new Date(event.starts_at);
      const end = new Date(event.ends_at);
      const next_start = new Date(target_day);

      if (event.is_all_day) {
        const day_span = Math.round(
          (start_of_day(end).getTime() - start_of_day(start).getTime()) /
            86_400_000,
        );

        next_start.setHours(0, 0, 0, 0);

        void handle_event_reschedule(
          event,
          next_start,
          end_of_day(add_days(next_start, Math.max(0, day_span))),
        );

        return;
      }

      const duration = end.getTime() - start.getTime();

      next_start.setHours(
        start.getHours(),
        start.getMinutes(),
        start.getSeconds(),
        0,
      );

      void handle_event_reschedule(
        event,
        next_start,
        new Date(next_start.getTime() + duration),
      );
    },
    [handle_event_reschedule],
  );

  const handle_wheel_navigate = useCallback(
    (direction: 1 | -1) => {
      if (direction === 1) {
        go_to_next();
      } else {
        go_to_previous();
      }
    },
    [go_to_next, go_to_previous],
  );

  const handle_import_close = useCallback(() => {
    set_import_files([]);
  }, []);

  const handle_imported = useCallback(() => {
    reload();
  }, [reload]);

  const handle_confirm_cancel_booking = async () => {
    try {
      await state.handle_confirm_cancel_booking();
      show_toast(state.t("calendar.booking_canceled"), "success");
    } catch {
      show_toast(state.t("calendar.booking_cancel_failed"), "error");
    }
  };

  const handle_confirm_delete = async (scope: RecurrenceEditScope) => {
    const deleted = state.event_to_delete;
    const is_restorable =
      deleted !== null &&
      deleted.recurrence === null &&
      deleted.recurrence_master_id === null;

    const self_email = state.self_email;
    const cancel_guests =
      deleted && scope === "series" && is_event_organizer(deleted, self_email)
        ? event_guests(deleted, self_email)
        : [];

    try {
      await state.handle_confirm_delete(scope);

      if (deleted && cancel_guests.length > 0) {
        prompt_invites(
          "cancel",
          deleted,
          cancel_guests,
          next_sequence(deleted),
        );
      }

      if (is_restorable && deleted) {
        show_undoable_toast({
          action_type: "trash",
          email_ids: [],
          message: state.t("calendar.event_deleted"),
          on_undo: async () => {
            await state.handle_restore_event(deleted);
          },
        });

        return;
      }

      show_toast(state.t("calendar.event_deleted"), "success");
    } catch {
      show_toast(state.t("calendar.event_delete_failed"), "error");
    }
  };

  const handle_scope_edit_confirm = async (scope: RecurrenceEditScope) => {
    const pending = state.pending_scope_edit;

    try {
      await state.handle_scope_edit_confirm(scope);
      show_toast(state.t("calendar.event_updated"), "success");
    } catch {
      show_toast(state.t("calendar.event_save_failed"), "error");

      return;
    }

    if (!pending) {
      return;
    }

    const self_email = state.self_email;
    const pending_organizer =
      (typeof pending.draft.organizer_email === "string"
        ? pending.draft.organizer_email.trim()
        : "") || event_organizer_email(pending.event);

    if (!pending_organizer || !is_own_address(pending_organizer, self_email)) {
      return;
    }

    const guests = event_guests(
      {
        attendees: pending.draft.attendees,
        organizer_email: pending_organizer,
      },
      self_email,
    );
    const occurrence_start =
      pending.event.occurrence_start ?? pending.event.starts_at;
    const sent_draft: CalendarEventDraft =
      scope === "single"
        ? {
            ...pending.draft,
            recurrence: null,
            recurrence_exceptions: [],
            recurrence_id: occurrence_start,
          }
        : pending.draft;
    const sent_event = event_from_draft(sent_draft, pending.event);

    prompt_invites(
      "update",
      scope === "series" ? sent_event : { ...sent_event, id: "" },
      guests,
      pending.draft.sequence ?? 0,
    );
  };

  const is_recurring_delete =
    state.event_to_delete !== null &&
    (state.event_to_delete.recurrence !== null ||
      state.event_to_delete.recurrence_master_id !== null);

  const skip_delete_confirmation =
    state.event_to_delete !== null &&
    !is_recurring_delete &&
    !state.preferences.calendar_confirm_before_delete;

  useEffect(() => {
    if (!skip_delete_confirmation) {
      return;
    }

    void handle_confirm_delete("series");
  }, [skip_delete_confirmation]);

  const event_menu_actions: CalendarEventMenuActions = {
    on_copy_link: (event) => {
      navigator.clipboard
        .writeText(build_event_link(window.location, event))
        .then(() =>
          show_toast(state.t("calendar.event_link_copied"), "success"),
        )
        .catch(() =>
          show_toast(state.t("calendar.event_link_copy_failed"), "error"),
        );
    },
    on_delete_request: state.set_event_to_delete,
    on_duplicate: async (event) => {
      try {
        await state.handle_duplicate_event(event);
        show_toast(state.t("calendar.event_duplicated"), "success");
      } catch {
        show_toast(state.t("calendar.event_save_failed"), "error");
      }
    },
    on_edit: state.handle_edit_event,
    on_toggle_task_done: async (event) => {
      await toggle_task_done_with_undo(state, event);
    },
    on_move_to_calendar: async (event, calendar_id) => {
      const previous_calendar_id = event.calendar_id;

      try {
        const moved = await state.handle_move_event_to_calendar(
          event,
          calendar_id,
        );

        show_undoable_toast({
          action_type: "folder",
          email_ids: [],
          message: state.t("calendar.event_moved", {
            calendar: state.calendar_by_id.get(calendar_id)?.name ?? "",
          }),
          on_undo: async () => {
            await state.handle_move_event_to_calendar(
              moved,
              previous_calendar_id,
            );
          },
        });
      } catch {
        show_toast(state.t("calendar.event_save_failed"), "error");
      }
    },
    on_open: state.handle_event_click,
    on_set_color: async (event, color) => {
      const previous_color = event.color;

      try {
        const recolored = await state.handle_set_event_color(event, color);

        show_undoable_toast({
          action_type: "folder",
          email_ids: [],
          message: state.t("calendar.event_updated"),
          on_undo: async () => {
            await state.handle_set_event_color(recolored, previous_color);
          },
        });
      } catch {
        show_toast(state.t("calendar.event_save_failed"), "error");
      }
    },
  };

  const import_target_calendar_id = (() => {
    const preferred = state.preferences.calendar_default_calendar_id;

    if (state.calendar_by_id.has(preferred)) {
      return preferred;
    }

    return state.calendars[0]?.id ?? "";
  })();

  const handle_ics_drop = (files: File[]) => {
    const ics_files = files.filter(is_ics_file);

    if (ics_files.length === 0 || import_target_calendar_id.length === 0) {
      return;
    }

    set_import_files(ics_files);
  };

  const first_run_file_ref = useRef<HTMLInputElement>(null);

  const handle_first_run_files = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);

    event.target.value = "";
    handle_ics_drop(files);
  };

  useEffect(() => {
    if (state.is_loading || import_target_calendar_id.length === 0) return;
    if (!has_pending_onboarding_import()) return;
    handle_ics_drop(take_pending_onboarding_import());
  }, [state.is_loading, import_target_calendar_id]);

  const first_run_actions = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button
        className="gap-2"
        size="sm"
        variant="depth"
        onClick={state.handle_create_click}
      >
        <PlusIcon className="h-4 w-4" />
        <span>{state.t("calendar.create_event")}</span>
      </Button>
      {import_target_calendar_id.length > 0 && (
        <Button
          className="gap-2"
          size="sm"
          variant="outline"
          onClick={() => first_run_file_ref.current?.click()}
        >
          <ArrowUpTrayIcon className="h-4 w-4" />
          <span>{state.t("calendar.first_run_import")}</span>
        </Button>
      )}
    </div>
  );

  return (
    <div
      className="flex flex-col h-full min-h-0 min-w-0 w-full relative"
      onDragEnter={(drag) => {
        if (drag.dataTransfer.types.includes("Files")) {
          drop_depth_ref.current += 1;
          set_is_drop_target(true);
        }
      }}
      onDragLeave={() => {
        drop_depth_ref.current = Math.max(0, drop_depth_ref.current - 1);

        if (drop_depth_ref.current === 0) {
          set_is_drop_target(false);
        }
      }}
      onDragOver={(drag) => {
        if (drag.dataTransfer.types.includes("Files")) {
          drag.preventDefault();
        }
      }}
      onDrop={(drop) => {
        drop_depth_ref.current = 0;
        set_is_drop_target(false);

        if (drop.dataTransfer.files.length === 0) {
          return;
        }

        drop.preventDefault();
        void handle_ics_drop([...drop.dataTransfer.files]);
      }}
    >
      {is_drop_target && (
        <div
          className="pointer-events-none absolute inset-0 z-[55] flex items-center justify-center rounded-[var(--aster-radius-panel,12px)] border-2 border-dashed"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--bg-primary) 82%, transparent)",
            borderColor: "var(--accent-color)",
          }}
        >
          <span className="aster_floating rounded-[var(--aster-radius-floating)] px-4 py-2 text-[13.5px] font-medium text-txt-primary">
            {state.t("calendar.drop_ics_hint")}
          </span>
        </div>
      )}
      <CalendarHeader
        is_phone={is_phone}
        on_next={go_to_next_period}
        on_previous={go_to_previous_period}
        is_current_period={is_current_period}
        on_today={state.go_to_today}
        on_insights={() => state.set_is_insights_open(!state.is_insights_open)}
        on_period_click={() => state.set_is_go_to_date_open(true)}
        on_print={() => set_print_open(true)}
        on_view_mode_change={state.set_view_mode}
        period_month={period_month}
        period_month_short={period_month_short}
        period_year={period_year}
        can_page={state.schedule_is_pageable}
        custom_view_days={state.custom_view_days}
        t={state.t}
        view_mode={state.view_mode}
      />

      {state.view_mode === "agenda" && !is_searching && (
        <CalendarScheduleRangeBar
          custom_end={state.schedule_custom_end}
          custom_start={state.schedule_custom_start}
          language={language}
          range={state.schedule_range}
          range_end={state.period_end}
          range_start={state.range_start}
          t={state.t}
          week_start_day={state.week_start_day}
          on_change={state.set_schedule_range}
        />
      )}

      <div className="flex-1 min-h-0 flex flex-col relative">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {state.view_mode === "month" && (
            <CalendarMonthView
              anchor_date={state.anchor_date}
              dim_past_events={state.preferences.calendar_dim_past_events}
              is_phone={is_phone}
              max_events_per_cell={state.preferences.calendar_month_max_events}
              calendar_by_id={state.calendar_by_id}
              calendars={state.calendars}
              event_menu_actions={event_menu_actions}
              events={state.events}
              draft_day={state.quick_range ? state.quick_range.start : null}
              on_day_click={state.handle_day_click}
              on_day_number_click={state.handle_year_day_click}
              on_day_double_click={state.handle_day_double_click}
              on_week_number_click={state.handle_week_number_click}
              on_event_click={state.handle_event_click}
              on_event_move_day={handle_event_move_day}
              on_range_select={state.handle_range_select}
              on_wheel_navigate={handle_wheel_navigate}
              default_duration_minutes={effective_default_duration}
              selected_date={state.selected_date}
              selected_event_id={
                state.selected_event
                  ? event_occurrence_key(state.selected_event)
                  : null
              }
              alternate_calendar={state.preferences.calendar_alternate_calendar}
              language={language}
              show_week_numbers={state.preferences.calendar_show_week_numbers}
              show_weekends={state.preferences.calendar_show_weekends}
              t={state.t}
              time_format={state.preferences.time_format}
              week_start_day={state.week_start_day}
            />
          )}

          {(state.view_mode === "week" ||
            state.view_mode === "day" ||
            state.view_mode === "custom") && (
            <CalendarTimeGridView
              anchor_date={state.anchor_date}
              calendar_by_id={state.calendar_by_id}
              calendars={state.calendars}
              event_menu_actions={event_menu_actions}
              events={state.events}
              is_phone={is_phone}
              is_single_day={state.view_mode === "day"}
              on_swipe_navigate={(direction) =>
                direction === 1 ? go_to_next_period() : go_to_previous_period()
              }
              split_calendar_order={
                state.view_mode === "day" &&
                state.preferences.calendar_day_split_by_calendar
                  ? state.calendars
                      .filter((calendar) => calendar.is_visible)
                      .map((calendar) => calendar.id)
                  : null
              }
              custom_day_count={
                state.view_mode === "custom" ? state.custom_view_days : null
              }
              default_duration_minutes={effective_default_duration}
              density={state.preferences.calendar_density}
              dim_past_events={state.preferences.calendar_dim_past_events}
              secondary_timezone={state.preferences.calendar_secondary_timezone}
              draft_range={
                state.quick_range &&
                quick_preview &&
                quick_preview.range_key ===
                  `${state.quick_range.start.toISOString()}_${state.quick_range.end.toISOString()}`
                  ? {
                      color: quick_preview.color,
                      end: quick_preview.ends_at,
                      is_all_day: quick_preview.is_all_day,
                      start: quick_preview.starts_at,
                      title: quick_preview.title,
                    }
                  : state.quick_range
              }
              on_day_number_click={state.handle_year_day_click}
              on_slot_double_click={state.handle_slot_double_click}
              on_week_number_click={state.handle_week_number_click}
              recenter_token={state.nav_direction === 0 ? state.nav_token : 0}
              on_event_click={state.handle_event_click}
              on_event_reschedule={handle_event_reschedule}
              on_range_select={state.handle_range_select}
              dim_non_working_hours={
                state.preferences.calendar_dim_non_working_hours
              }
              working_days={state.preferences.calendar_working_days}
              short_events_full_size={
                state.preferences.calendar_short_events_full_size
              }
              show_current_time_indicator={
                state.preferences.calendar_show_current_time_indicator
              }
              scroll_to_first_event={
                state.preferences.calendar_scroll_to_first_event
              }
              selected_date={state.selected_date}
              selected_event_id={
                state.selected_event
                  ? event_occurrence_key(state.selected_event)
                  : null
              }
              show_event_location={
                state.preferences.calendar_show_event_location
              }
              alternate_calendar={state.preferences.calendar_alternate_calendar}
              language={language}
              show_week_numbers={state.preferences.calendar_show_week_numbers}
              show_weekends={state.preferences.calendar_show_weekends}
              t={state.t}
              time_format={state.preferences.time_format}
              week_start_day={state.week_start_day}
              working_hours_end={state.preferences.calendar_working_hours_end}
              working_hours_start={
                state.preferences.calendar_working_hours_start
              }
            />
          )}

          {state.view_mode === "year" && (
            <CalendarYearView
              anchor_date={state.anchor_date}
              events={state.events}
              language={language}
              on_day_click={state.handle_year_day_click}
              on_month_click={state.handle_year_month_click}
              selected_date={state.selected_date}
              t={state.t}
              week_start_day={state.week_start_day}
            />
          )}

          {state.view_mode === "agenda" && !show_empty_state && (
            <CalendarAgendaView
              anchor_date={state.anchor_date}
              dim_past_events={state.preferences.calendar_dim_past_events}
              calendar_by_id={state.calendar_by_id}
              calendars={state.calendars}
              day_count={state.agenda_day_count}
              event_menu_actions={event_menu_actions}
              events={state.events}
              has_more={state.agenda_has_more}
              is_loading_more={state.is_agenda_loading_more}
              on_load_more={state.load_more_agenda}
              on_create_click={state.handle_create_click}
              on_event_click={state.handle_event_click}
              range_end={
                state.schedule_range === "upcoming"
                  ? undefined
                  : state.period_end
              }
              range_start={
                state.schedule_range === "upcoming"
                  ? undefined
                  : state.range_start
              }
              selected_event_id={
                state.selected_event
                  ? event_occurrence_key(state.selected_event)
                  : null
              }
              t={state.t}
              time_format={state.preferences.time_format}
            />
          )}
        </div>

        {show_empty_state && (
          <div className="absolute inset-0 z-[5] flex items-center justify-center p-4 pointer-events-none">
            <CalendarEmptyState
              action={
                is_searching ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => state.set_search_query("")}
                  >
                    {state.t("calendar.clear_search")}
                  </Button>
                ) : is_first_run ? (
                  first_run_actions
                ) : (
                  <Button
                    className="gap-2"
                    size="sm"
                    variant="depth"
                    onClick={state.handle_create_click}
                  >
                    <PlusIcon className="h-4 w-4" />
                    <span>{state.t("calendar.create_event")}</span>
                  </Button>
                )
              }
              body={state.t(
                is_searching
                  ? "calendar.empty_search_body"
                  : is_first_run
                    ? "calendar.first_run_body"
                    : "calendar.empty_range_body",
              )}
              className="aster_floating pointer-events-auto max-h-full w-full max-w-[360px] overflow-y-auto rounded-[var(--aster-radius-floating)]"
              compact={is_phone}
              data-testid={
                is_searching ? "calendar-search-empty" : "calendar-range-empty"
              }
              illustration={
                is_searching ? (
                  <NoResultsIllustration />
                ) : (
                  <EmptyRangeIllustration />
                )
              }
              title={state.t(
                is_searching
                  ? "calendar.empty_search_title"
                  : is_first_run
                    ? "calendar.first_run_title"
                    : "calendar.empty_range_title",
              )}
            />
          </div>
        )}

        {show_first_run_state && (
          <div className="absolute inset-0 z-[5] flex items-center justify-center p-4 pointer-events-none">
            <CalendarEmptyState
              action={first_run_actions}
              body={state.t("calendar.first_run_body")}
              className="aster_floating pointer-events-auto max-h-full w-full max-w-[360px] overflow-y-auto rounded-[var(--aster-radius-floating)]"
              compact={is_phone}
              data-testid="calendar-first-run"
              illustration={<EmptyRangeIllustration />}
              title={state.t("calendar.first_run_title")}
            />
          </div>
        )}

        <input
          ref={first_run_file_ref}
          multiple
          accept=".ics,.ical,text/calendar"
          className="hidden"
          type="file"
          onChange={handle_first_run_files}
        />

        {has_load_error && (
          <div className="absolute inset-0 z-[6] flex items-center justify-center p-4">
            <div
              className="aster_island aster_island_tone_danger w-full max-w-[340px] overflow-hidden px-6 py-6 text-center"
              role="alert"
            >
              <ExclamationTriangleIcon
                className="mx-auto mb-3 h-6 w-6"
                aria-hidden="true"
                style={{ color: "var(--color-danger)" }}
              />
              <p className="text-base font-semibold text-txt-primary">
                {state.t("calendar.load_failed_title")}
              </p>
              <p className="mt-1.5 text-sm leading-snug text-txt-secondary">
                {state.t("calendar.load_failed_body")}
              </p>
              <Button
                className="mt-5 w-full gap-2"
                variant="depth"
                onClick={on_retry}
              >
                <ArrowPathIcon className="h-4 w-4" />
                <span>{state.t("calendar.retry_loading")}</span>
              </Button>
            </div>
          </div>
        )}

        <EventDetailPopover
          calendar={
            has_details_panel
              ? undefined
              : state.selected_event
                ? state.calendar_by_id.get(state.selected_event.calendar_id)
                : undefined
          }
          date_format={state.preferences.date_format}
          event={has_details_panel ? null : state.selected_event}
          language={language}
          on_delete_request={state.set_event_to_delete}
          on_dismiss={() => state.set_selected_event(null)}
          on_edit={state.handle_edit_event}
          on_respond={(event, response) => {
            void state.handle_event_respond(event, response);
          }}
          self_email={state.self_email}
          t={state.t}
          time_format={state.preferences.time_format}
        />

        <QuickCreatePopover
          calendars={state.calendars}
          default_calendar_id={state.preferences.calendar_default_calendar_id}
          language={language}
          on_dismiss={state.dismiss_quick_range}
          on_more_options={state.handle_quick_more_options}
          on_preview_change={set_quick_preview}
          on_save={handle_quick_save}
          range={state.quick_range}
          t={state.t}
          time_format={state.preferences.time_format}
          week_start_day={state.week_start_day}
        />
      </div>

      <EventFormModal
        calendars={state.calendars}
        default_calendar_id={state.preferences.calendar_default_calendar_id}
        default_duration_minutes={effective_default_duration}
        default_reminder_minutes={
          state.preferences.calendar_default_reminder_minutes
        }
        event={state.editing_event}
        events={state.events}
        initial_date={state.form_initial_date}
        initial_draft={state.form_initial_draft}
        initial_event_kind={state.form_initial_kind}
        is_open={state.is_form_open}
        week_start_day={state.week_start_day}
        on_close={state.handle_form_close}
        on_submit={handle_form_submit}
      />

      <ConfirmationModal
        cancel_text={state.t("common.cancel")}
        confirm_text={state.t("common.delete")}
        is_open={
          !!state.event_to_delete &&
          !is_recurring_delete &&
          state.preferences.calendar_confirm_before_delete
        }
        message={state.t("calendar.delete_event_confirmation", {
          title: state.event_to_delete?.title ?? "",
        })}
        on_cancel={() => state.set_event_to_delete(null)}
        on_confirm={() => {
          void handle_confirm_delete("series");
        }}
        title={state.t("calendar.delete_event")}
        variant="danger"
      />

      <ConfirmationModal
        cancel_text={state.t("common.cancel")}
        confirm_text={state.t("calendar.cancel_booking")}
        is_open={!!state.booking_to_cancel}
        message={state.t("calendar.cancel_booking_confirmation", {
          title: state.booking_to_cancel?.title ?? "",
        })}
        on_cancel={() => state.set_booking_to_cancel(null)}
        on_confirm={() => {
          void handle_confirm_cancel_booking();
        }}
        title={state.t("calendar.cancel_booking")}
        variant="danger"
      />

      <RecurrenceScopeDialog
        is_open={is_recurring_delete}
        mode="delete"
        on_cancel={() => state.set_event_to_delete(null)}
        on_confirm={(scope) => {
          void handle_confirm_delete(scope);
        }}
      />

      <RecurrenceScopeDialog
        is_open={state.pending_scope_edit !== null}
        mode="edit"
        on_cancel={state.handle_scope_edit_cancel}
        on_confirm={(scope) => {
          void handle_scope_edit_confirm(scope);
        }}
      />

      <InviteSendDialog
        guest_count={pending_invite?.guests.length ?? 0}
        is_open={pending_invite !== null}
        is_sending={is_sending_invite}
        kind={pending_invite?.kind ?? "request"}
        on_send={() => {
          void handle_invite_send();
        }}
        on_skip={() => set_pending_invite(null)}
      />

      <CalendarImportDialog
        calendars={state.calendars}
        default_calendar_id={import_target_calendar_id}
        files={import_files}
        is_open={import_files.length > 0}
        on_close={handle_import_close}
        on_imported={handle_imported}
      />

      <CalendarPrintDialog
        build_options={build_print_options}
        is_open={print_open}
        on_cancel={() => set_print_open(false)}
        on_confirm={handle_print}
        range_label={print_range_label}
      />
    </div>
  );
}
