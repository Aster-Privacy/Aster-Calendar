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
import type { PanelMessage } from "@/pages/mail_panel/mail_panel_bridge";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, Tooltip } from "@aster/ui";

import { MailPanelAgenda } from "@/pages/mail_panel/mail_panel_agenda";
import { MailPanelEventView } from "@/pages/mail_panel/mail_panel_event_view";
import { MailPanelMiniMonth } from "@/pages/mail_panel/mail_panel_mini_month";
import { use_mail_panel_delete } from "@/pages/mail_panel/use_mail_panel_delete";
import { use_mail_panel_events } from "@/pages/mail_panel/use_mail_panel_events";
import {
  open_in_new_tab,
  post_to_host,
  read_host_message,
  set_panel_visible,
  use_panel_visible,
} from "@/pages/mail_panel/mail_panel_bridge";
import { bucket_events_by_day } from "@/pages/mail_panel/mail_panel_days";
import { UpNextCard } from "@/components/calendar/up_next_card";
import { build_event_link } from "@/components/calendar/event_link";
import { use_invite_senders } from "@/components/calendar/use_invite_senders";
import {
  add_days,
  add_months,
  build_month_grid,
  end_of_day,
  start_of_day,
  week_start_day_index,
} from "@/components/calendar/calendar_utils";
import { RsvpReplyConfirmDialog } from "@/components/calendar/rsvp_reply_confirm_dialog";
import { EncryptionInfoDropdown } from "@/components/common/encryption_info_dropdown";
import { ActionToast } from "@/components/toast/action_toast";
import { SimpleToast, show_toast } from "@/components/toast/simple_toast";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { use_preferences } from "@/contexts/preferences_context";
import { apply_host_appearance } from "@/pages/mail_panel/mail_panel_appearance";
import { use_i18n } from "@/lib/i18n/context";
import {
  get_app_lock_config,
  is_session_unlocked,
} from "@/services/app_lock_store";
import { sanitize_calendar_email } from "@/services/calendar/sanitize";
import { reply_identity } from "@/services/calendar/invite_sender";
import { set_own_response } from "@/services/calendar/invite_store";
import { event_organizer_email } from "@/services/calendar/itip";
import {
  build_rsvp_reply_request,
  deliver_rsvp_reply,
  type RsvpReplyOutcome,
  type RsvpReplyRequest,
} from "@/services/calendar/rsvp_reply";
import { is_own_address } from "@/services/calendar/own_addresses";
import {
  calendar_now,
  get_active_view_zone,
  resolve_view_zone,
  set_active_view_zone,
} from "@/services/calendar/view_zone";

const AGENDA_DAYS = 6;
const NOW_TICK_MS = 30_000;
const MINUTE_MS = 60_000;
const UP_NEXT_DAYS_BEFORE = 1;
const UP_NEXT_DAYS_AFTER = 10;

interface PanelClock {
  view: Date;
  real_ms: number;
}

type PanelGate = "loading" | "signed_out" | "locked" | "ready";

function first_of_month(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function open_calendar_home(): void {
  open_in_new_tab(new URL("/", window.location.origin).toString());
}

function read_clock(zone: string | null): PanelClock {
  return { view: calendar_now(zone), real_ms: Date.now() };
}

function use_view_now(zone: string | null): PanelClock {
  const is_visible = use_panel_visible();
  const [now, set_now] = useState(() => read_clock(zone));

  useEffect(() => {
    if (!is_visible) return;

    const refresh = () => set_now(read_clock(zone));
    const handle_visibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refresh, NOW_TICK_MS);

    refresh();
    document.addEventListener("visibilitychange", handle_visibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handle_visibility);
    };
  }, [zone, is_visible]);

  return now;
}

function use_panel_gate(): PanelGate {
  const { is_loading, is_authenticated, has_keys, current_account_id, user } =
    use_auth();
  const account_id = current_account_id ?? user?.id ?? null;

  if (is_loading) return "loading";
  if (!is_authenticated || !has_keys || !account_id) return "signed_out";

  const lock = get_app_lock_config(account_id);

  if (lock?.enabled && !is_session_unlocked(account_id)) return "locked";

  return "ready";
}

function PanelHeader() {
  const { t } = use_i18n();

  return (
    <div className="flex h-12 flex-shrink-0 items-center gap-1 ps-4 pe-2">
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <h2 className="truncate text-[15px] font-medium text-txt-primary">
          {t("calendar.calendar")}
        </h2>
        <Badge className="flex-shrink-0" color="blue">
          {t("calendar.panel_beta")}
        </Badge>
      </span>
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center">
        <EncryptionInfoDropdown
          description_key="calendar.only_you_can_read_calendar"
          e2e_verified={true}
          has_pq_protection={true}
          is_external={false}
          label={
            <span className="sr-only">
              {t("common.end_to_end_encrypted_label")}
            </span>
          }
          size={15}
        />
      </span>
      <Tooltip tip={t("calendar.panel_open_calendar")}>
        <Button
          aria-label={t("calendar.panel_open_calendar")}
          className="h-8 w-8 flex-shrink-0 text-txt-secondary"
          size="icon"
          variant="ghost"
          onClick={open_calendar_home}
        >
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
        </Button>
      </Tooltip>
      <Tooltip tip={t("common.close")}>
        <Button
          aria-label={t("common.close")}
          className="h-8 w-8 flex-shrink-0 text-txt-secondary"
          size="icon"
          variant="ghost"
          onClick={() => post_to_host({ type: "close" })}
        >
          <XMarkIcon className="h-4 w-4" />
        </Button>
      </Tooltip>
    </div>
  );
}

function PanelNotice({
  title,
  body,
  on_retry,
}: {
  title?: string;
  body: string;
  on_retry?: () => void;
}) {
  const { t } = use_i18n();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-12 text-center">
      {title && (
        <p className="text-[14px] font-medium text-txt-primary">{title}</p>
      )}
      <p className="text-[13px] leading-5 text-txt-muted">{body}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {on_retry && (
          <Button size="md" variant="outline" onClick={on_retry}>
            {t("calendar.retry_loading")}
          </Button>
        )}
        <Button
          className="gap-1.5"
          size="md"
          variant={on_retry ? "ghost" : "outline"}
          onClick={open_calendar_home}
        >
          {t("calendar.panel_open_calendar")}
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function AgendaSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-2 px-3 py-3">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex items-center gap-3">
          <span className="h-3 w-12 flex-shrink-0 rounded bg-[var(--aster-hover)]" />
          <span
            className="h-3 rounded bg-[var(--aster-hover)]"
            style={{ width: `${70 - row * 10}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function open_event_in_new_tab(event: DecryptedCalendarEvent): void {
  open_in_new_tab(
    build_event_link({ origin: window.location.origin, pathname: "/" }, event),
  );
}

interface PanelBodyProps {
  on_open_in_calendar?: (event: DecryptedCalendarEvent) => void;
}

export function PanelBody({
  on_open_in_calendar = open_event_in_new_tab,
}: PanelBodyProps) {
  const { t, language } = use_i18n();
  const { preferences } = use_preferences();
  const { user } = use_auth();
  const invite_senders = use_invite_senders();
  const invite_options_ref = useRef(invite_senders.all_options);

  invite_options_ref.current = invite_senders.all_options;

  const zone = resolve_view_zone(preferences.calendar_timezone);

  if (get_active_view_zone() !== zone) set_active_view_zone(zone);

  const clock = use_view_now(zone);
  const now = clock.view;
  const now_minute_ms = Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS;
  const today_ms = start_of_day(now).getTime();
  const today = useMemo(() => new Date(today_ms), [today_ms]);
  const self_email = (user?.email ?? "").trim().toLowerCase();
  const time_format = preferences.time_format === "24h" ? "24h" : "12h";
  const week_start_day = week_start_day_index(
    preferences.calendar_week_starts_on,
  );

  const [picked_date, set_picked_date] = useState<Date | null>(null);
  const [view_month, set_view_month] = useState(() => first_of_month(now));
  const [open_event, set_open_event] = useState<DecryptedCalendarEvent | null>(
    null,
  );

  const anchor_date = picked_date ?? today;
  const anchor_ms = anchor_date.getTime();
  const view_month_ms = view_month.getTime();

  const range = useMemo(() => {
    const grid = build_month_grid(new Date(view_month_ms), week_start_day);
    const agenda_start = new Date(anchor_ms);
    const agenda_days = Array.from({ length: AGENDA_DAYS + 1 }, (_, index) =>
      add_days(agenda_start, index),
    );
    const agenda_end = end_of_day(add_days(agenda_start, AGENDA_DAYS));
    const grid_end = end_of_day(grid[grid.length - 1]);
    const start = grid[0].getTime() < anchor_ms ? grid[0] : agenda_start;
    const end =
      grid_end.getTime() > agenda_end.getTime() ? grid_end : agenda_end;
    const covers_today =
      start.getTime() <= today_ms && end.getTime() >= today_ms;
    const up_next_start = add_days(new Date(today_ms), -UP_NEXT_DAYS_BEFORE);
    const up_next_end = end_of_day(
      add_days(new Date(today_ms), UP_NEXT_DAYS_AFTER),
    );

    return {
      start:
        covers_today && up_next_start.getTime() < start.getTime()
          ? up_next_start
          : start,
      end:
        covers_today && up_next_end.getTime() > end.getTime()
          ? up_next_end
          : end,
      days: grid.concat(agenda_days),
    };
  }, [view_month_ms, week_start_day, anchor_ms, today_ms]);

  const { status, events, calendars, retry, reload } =
    use_mail_panel_events(range.start, range.end);

  const day_buckets = useMemo(
    () => bucket_events_by_day(events, range.days),
    [events, range.days],
  );

  const calendar_by_id = useMemo(
    () => new Map(calendars.map((calendar) => [calendar.id, calendar])),
    [calendars],
  );

  const live_open_event = useMemo(
    () =>
      open_event
        ? (events.find((event) => event.id === open_event.id) ?? open_event)
        : null,
    [events, open_event],
  );

  useEffect(() => {
    if (status === "failed") post_to_host({ type: "status", status: "failed" });
  }, [status]);

  const handle_select_day = useCallback(
    (day: Date) => {
      const next = start_of_day(day);

      set_picked_date(next.getTime() === today_ms ? null : next);
      set_view_month((current) =>
        current.getFullYear() === next.getFullYear() &&
        current.getMonth() === next.getMonth()
          ? current
          : first_of_month(next),
      );
    },
    [today_ms],
  );

  const handle_change_month = useCallback((delta: number) => {
    set_view_month((current) => first_of_month(add_months(current, delta)));
  }, []);

  const handle_reset = useCallback(() => {
    set_picked_date(null);
    set_view_month(first_of_month(new Date(today_ms)));
  }, [today_ms]);

  const handle_back = useCallback(() => set_open_event(null), []);

  const handle_deleted = useCallback((deleted: DecryptedCalendarEvent) => {
    set_open_event((current) => (current?.id === deleted.id ? null : current));
  }, []);

  const { request_delete, dialogs: delete_dialogs } = use_mail_panel_delete({
    self_email,
    sender_options: invite_senders.all_options,
    on_open_in_calendar,
    on_deleted: handle_deleted,
    reload,
  });

  const [pending_rsvp_reply, set_pending_rsvp_reply] =
    useState<RsvpReplyRequest | null>(null);

  const show_rsvp_outcome = useCallback(
    (outcome: RsvpReplyOutcome) => {
      const sent = outcome === "sent";

      show_toast(
        t(
          sent
            ? "calendar.invite_card_reply_sent"
            : "calendar.invite_card_reply_send_failed",
        ),
        sent ? "success" : "error",
      );
    },
    [t],
  );

  const handle_respond = useCallback(
    async (
      event: DecryptedCalendarEvent,
      response: CalendarAttendeeResponse,
    ) => {
      if (self_email.length === 0) return;

      const identity = reply_identity(
        invite_options_ref.current,
        event.attendees
          .filter((attendee) => !attendee.is_organizer)
          .map((attendee) => attendee.email),
        self_email,
        user?.display_name,
      );

      try {
        const updated = await set_own_response(
          event,
          identity.attendee_email,
          response,
        );

        if (!updated) {
          show_toast(t("calendar.invite_save_failed"), "error");

          return;
        }

        reload();

        const organizer = event_organizer_email(updated);

        if (!organizer || is_own_address(organizer, self_email)) {
          show_toast(t("calendar.event_updated"), "success");

          return;
        }

        if (!identity.resolved) {
          show_toast(t("calendar.invite_reply_needs_address"), "error");

          return;
        }

        const request = build_rsvp_reply_request({
          event: updated,
          organizer_email: sanitize_calendar_email(organizer),
          identity,
          response,
          t,
          language,
        });
        const outcome = await deliver_rsvp_reply(request);

        if (outcome === "needs_confirmation") {
          set_pending_rsvp_reply(request);

          return;
        }

        show_rsvp_outcome(outcome);
      } catch {
        show_toast(t("calendar.invite_save_failed"), "error");
      }
    },
    [self_email, user?.display_name, reload, show_rsvp_outcome, t, language],
  );

  const confirm_rsvp_reply = useCallback(async () => {
    const request = pending_rsvp_reply;

    set_pending_rsvp_reply(null);

    if (!request) return;

    try {
      const outcome = await deliver_rsvp_reply({
        ...request,
        confirmed_organizer: true,
      });

      show_rsvp_outcome(outcome === "sent" ? "sent" : "failed");
    } catch {
      show_rsvp_outcome("failed");
    }
  }, [pending_rsvp_reply, show_rsvp_outcome]);

  const cancel_rsvp_reply = useCallback(() => {
    set_pending_rsvp_reply(null);
    show_toast(t("calendar.event_updated"), "success");
  }, [t]);

  const rsvp_dialog = (
    <RsvpReplyConfirmDialog
      on_cancel={cancel_rsvp_reply}
      on_confirm={() => {
        void confirm_rsvp_reply();
      }}
      organizer_email={pending_rsvp_reply?.organizer_email ?? null}
    />
  );

  if (live_open_event) {
    return (
      <>
        <MailPanelEventView
          calendar={calendar_by_id.get(live_open_event.calendar_id)}
          date_format={preferences.date_format}
          event={live_open_event}
          on_back={handle_back}
          on_delete={request_delete}
          on_open_in_calendar={on_open_in_calendar}
          on_respond={(event, response) => {
            void handle_respond(event, response);
          }}
          self_email={self_email}
          time_format={time_format}
        />
        {delete_dialogs}
        {rsvp_dialog}
      </>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1.5">
      <MailPanelMiniMonth
        day_buckets={day_buckets}
        on_change_month={handle_change_month}
        on_reset={handle_reset}
        on_select_day={handle_select_day}
        selected_date={anchor_date}
        today={today}
        view_month={view_month}
        week_start_day={week_start_day}
      />
      {status === "failed" ? (
        <PanelNotice body={t("calendar.panel_load_failed")} on_retry={retry} />
      ) : (
        <>
          <div className="aster_island mx-1.5 mb-2 px-3 py-2.5">
            <UpNextCard
              calendars={calendars.length > 0 ? calendars : undefined}
              on_open={set_open_event}
            />
          </div>
          {status === "loading" ? (
            <AgendaSkeleton />
          ) : (
            <MailPanelAgenda
              anchor_date={anchor_date}
              calendars={calendars}
              day_buckets={day_buckets}
              day_count={AGENDA_DAYS}
              now_ms={now_minute_ms}
              on_event_click={set_open_event}
              selected_event_id={null}
              time_format={time_format}
            />
          )}
        </>
      )}
      {delete_dialogs}
      {rsvp_dialog}
    </div>
  );
}

export default function MailPanelPage() {
  const { t } = use_i18n();
  const gate = use_panel_gate();
  const reported_ref = useRef<PanelGate | null>(null);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("astermail:app-ready"));
  }, []);

  useEffect(() => {
    const host = window.parent === window ? null : window.parent;
    const handle_message = (event: MessageEvent) => {
      const message = read_host_message(event, host);

      if (message?.type === "theme") apply_host_appearance(message);
      if (message?.type === "visibility") set_panel_visible(message.visible);
    };

    window.addEventListener("message", handle_message);

    return () => window.removeEventListener("message", handle_message);
  }, []);

  useEffect(() => {
    if (gate === "loading" || reported_ref.current === gate) return;

    const first_report = reported_ref.current === null;

    reported_ref.current = gate;

    if (first_report) post_to_host({ type: "ready" });
    if (gate !== "ready") {
      const status: PanelMessage = { type: "status", status: gate };

      post_to_host(status);
    }
  }, [gate]);

  return (
    <aside
      className="calendar_surface fixed inset-0 flex flex-col overflow-hidden bg-surf-primary"
      data-calendar-surface=""
    >
      <PanelHeader />
      {gate === "loading" && <AgendaSkeleton />}
      {gate === "signed_out" && (
        <PanelNotice body={t("calendar.panel_signed_out")} />
      )}
      {gate === "locked" && (
        <PanelNotice
          body={t("calendar.panel_locked_hint")}
          title={t("common.app_locked")}
        />
      )}
      {gate === "ready" && <PanelBody />}
      <ActionToast />
      <SimpleToast />
    </aside>
  );
}
