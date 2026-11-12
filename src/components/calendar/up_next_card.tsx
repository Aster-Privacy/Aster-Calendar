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

import { memo, useEffect, useMemo, useState } from "react";

import { use_auth } from "@/contexts/auth/use_auth_hook";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  list_events,
  subscribe_calendar_changes,
} from "@/services/api/calendar";
import {
  calendar_sync_engine,
  CALENDAR_CHANGED_EVENT,
} from "@/services/calendar/sync_engine";
import { is_own_address } from "@/services/calendar/own_addresses";
import { apply_calendar_visibility } from "@/services/calendar/local_visibility";
import { use_local_calendar_visibility } from "@/hooks/use_local_calendar_visibility";
import {
  calendar_now,
  resolve_view_zone,
  shift_event_to_view,
} from "@/services/calendar/view_zone";
import {
  add_days,
  is_same_day,
  resolve_event_color,
  start_of_day,
} from "@/components/calendar/calendar_utils";

const LOOKAHEAD_DAYS = 7;
const TICK_MS = 30_000;
const REFRESH_MS = 5 * 60_000;
const SOON_MS = 60 * 60_000;
const MINUTE_MS = 60_000;

export const OPEN_CALENDAR_EVENT = "aster-calendar-open-event";

let pending_open_event: DecryptedCalendarEvent | null = null;

export function request_open_calendar_event(event: DecryptedCalendarEvent) {
  pending_open_event = event;
  window.dispatchEvent(new Event(OPEN_CALENDAR_EVENT));
}

export function take_pending_open_event(): DecryptedCalendarEvent | null {
  const event = pending_open_event;

  pending_open_event = null;

  return event;
}

interface UpNextData {
  events: DecryptedCalendarEvent[];
  calendars: DecryptedCalendar[];
}

interface UpNextPick {
  event: DecryptedCalendarEvent;
  view_event: DecryptedCalendarEvent;
  start_ms: number;
  end_ms: number;
}

function is_declined_by(event: DecryptedCalendarEvent, self_email: string) {
  if (self_email.length === 0) return false;

  return event.attendees.some(
    (attendee) =>
      attendee.response === "declined" &&
      is_own_address(attendee.email, self_email),
  );
}

function is_candidate(
  event: DecryptedCalendarEvent,
  visible_ids: Set<string>,
  self_email: string,
) {
  return (
    visible_ids.has(event.calendar_id) &&
    event.event_kind !== "task" &&
    event.event_kind !== "working_location" &&
    event.event_kind !== "birthday" &&
    event.status !== "cancelled" &&
    !is_declined_by(event, self_email)
  );
}

function pick_next(
  data: UpNextData,
  now_ms: number,
  view_today: Date,
  zone: string | null,
  self_email: string,
): UpNextPick | null {
  const visible_ids = new Set(
    data.calendars.filter((c) => c.is_visible).map((c) => c.id),
  );
  const horizon_ms = add_days(view_today, LOOKAHEAD_DAYS + 1).getTime();
  let timed: UpNextPick | null = null;
  let all_day: UpNextPick | null = null;

  for (const event of data.events) {
    if (!is_candidate(event, visible_ids, self_email)) continue;

    const start_ms = new Date(event.starts_at).getTime();
    const end_ms = new Date(event.ends_at).getTime();

    if (!Number.isFinite(start_ms) || !Number.isFinite(end_ms)) continue;

    if (event.is_all_day) {
      const end_day = start_of_day(new Date(end_ms)).getTime();
      const effective_end =
        end_ms === end_day && end_ms > start_ms ? end_ms : end_day + 86_400_000;

      if (effective_end <= view_today.getTime() || start_ms >= horizon_ms) {
        continue;
      }

      if (!all_day || start_ms < all_day.start_ms) {
        all_day = {
          event,
          view_event: event,
          start_ms,
          end_ms: effective_end,
        };
      }

      continue;
    }

    if (end_ms <= now_ms || start_ms >= now_ms + LOOKAHEAD_DAYS * 86_400_000) {
      continue;
    }

    if (
      !timed ||
      start_ms < timed.start_ms ||
      (start_ms === timed.start_ms && end_ms < timed.end_ms)
    ) {
      timed = { event, view_event: event, start_ms, end_ms };
    }
  }

  const chosen = timed ?? all_day;

  if (!chosen) return null;

  return chosen.event.is_all_day
    ? chosen
    : { ...chosen, view_event: shift_event_to_view(chosen.event, zone) };
}

function read_calendars(): DecryptedCalendar[] {
  try {
    return calendar_sync_engine.get_calendars();
  } catch {
    return [];
  }
}

function use_up_next_data(account_id: string | null) {
  const [data, set_data] = useState<UpNextData | null>(null);
  const [failed, set_failed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let in_flight = false;
    let queued = false;

    set_data(null);
    set_failed(false);

    const load = async () => {
      if (in_flight) {
        queued = true;

        return;
      }

      in_flight = true;

      try {
        const start = new Date(Date.now() - 86_400_000);
        const end = new Date(Date.now() + (LOOKAHEAD_DAYS + 2) * 86_400_000);
        const result = await list_events(start, end);

        if (cancelled) return;
        set_data({ events: result.data, calendars: read_calendars() });
        set_failed(false);
      } catch {
        if (!cancelled) set_failed(true);
      } finally {
        in_flight = false;

        if (queued && !cancelled) {
          queued = false;
          void load();
        }
      }
    };

    void load();

    const handle_change = () => void load();
    const handle_visibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    const unsubscribe = subscribe_calendar_changes(handle_change);
    const timer = window.setInterval(handle_change, REFRESH_MS);

    window.addEventListener(CALENDAR_CHANGED_EVENT, handle_change);
    document.addEventListener("visibilitychange", handle_visibility);

    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener(CALENDAR_CHANGED_EVENT, handle_change);
      document.removeEventListener("visibilitychange", handle_visibility);
    };
  }, [account_id]);

  return { data, failed };
}

function use_now_ms() {
  const [now_ms, set_now_ms] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => set_now_ms(Date.now());
    const timer = window.setInterval(tick, TICK_MS);
    const handle_visibility = () => {
      if (document.visibilityState === "visible") tick();
    };

    document.addEventListener("visibilitychange", handle_visibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handle_visibility);
    };
  }, []);

  return now_ms;
}

interface UpNextCardProps {
  calendars?: DecryptedCalendar[];
  on_open?: (event: DecryptedCalendarEvent) => void;
  className?: string;
}

export const UpNextCard = memo(function UpNextCard({
  calendars,
  on_open = request_open_calendar_event,
  className = "",
}: UpNextCardProps) {
  const { t, language } = use_i18n();
  const { preferences } = use_preferences();
  const { user, current_account_id } = use_auth();
  const { data, failed } = use_up_next_data(current_account_id ?? null);
  const now_ms = use_now_ms();
  const { visibility } = use_local_calendar_visibility({
    calendars: data?.calendars ?? [],
    subscriptions: preferences.calendar_ics_subscriptions ?? [],
    birthdays_hidden: preferences.calendar_birthdays_hidden === true,
  });
  const shown_calendars = useMemo(
    () =>
      calendars ??
      (data ? apply_calendar_visibility(data.calendars, visibility) : null),
    [calendars, data, visibility],
  );

  const zone = resolve_view_zone(preferences.calendar_timezone);
  const use_12h = preferences.time_format === "12h";
  const self_email = (user?.email ?? "").trim().toLowerCase();

  const view_today_ms = start_of_day(calendar_now(zone)).getTime();

  const pick = useMemo(() => {
    if (!data) return null;

    return pick_next(
      shown_calendars ? { ...data, calendars: shown_calendars } : data,
      now_ms,
      new Date(view_today_ms),
      zone,
      self_email,
    );
  }, [data, shown_calendars, now_ms, view_today_ms, zone, self_email]);

  const formatters = useMemo(
    () => ({
      time: new Intl.DateTimeFormat(language, {
        hour: "numeric",
        minute: "2-digit",
        hour12: use_12h,
      }),
      day: new Intl.DateTimeFormat(language, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    }),
    [language, use_12h],
  );

  if (failed && !data) return null;

  const label_class = "text-[10px] font-medium tracking-wide text-txt-muted";

  if (!data) {
    return (
      <div aria-busy="true" className={className}>
        <div className="mb-1 flex items-center justify-between">
          <span className={label_class}>{t("calendar.up_next")}</span>
        </div>
        <div className="h-[18px] w-3/4 rounded bg-[var(--aster-hover)]" />
        <div className="mt-1 h-[14px] w-1/2 rounded bg-[var(--aster-hover)]" />
      </div>
    );
  }

  if (!pick) {
    return (
      <div className={className}>
        <div className="mb-1 flex items-center justify-between">
          <span className={label_class}>{t("calendar.up_next")}</span>
        </div>
        <p className="truncate text-[11px] leading-[18px] text-txt-muted">
          {t("calendar.up_next_empty")}
        </p>
      </div>
    );
  }

  const { event, view_event } = pick;
  const view_start = new Date(view_event.starts_at);
  const view_end = new Date(view_event.ends_at);
  const today = new Date(view_today_ms);
  const is_ongoing = pick.start_ms <= now_ms && now_ms < pick.end_ms;

  const day_label =
    event.is_all_day && is_ongoing
      ? t("calendar.today")
      : is_same_day(view_start, today)
        ? t("calendar.today")
        : is_same_day(view_start, add_days(today, 1))
          ? t("calendar.up_next_tomorrow")
          : formatters.day.format(view_start);

  let time_label = t("calendar.all_day");

  if (!event.is_all_day) {
    const start_text = formatters.time.format(view_start);

    time_label = is_same_day(view_start, view_end)
      ? `${start_text} - ${formatters.time.format(view_end)}`
      : start_text;
  }

  let badge: string | null = null;

  if (!event.is_all_day && is_ongoing) {
    badge = t("calendar.up_next_now");
  } else if (!event.is_all_day && pick.start_ms - now_ms <= SOON_MS) {
    badge = t("calendar.up_next_in_minutes", {
      count: Math.max(1, Math.ceil((pick.start_ms - now_ms) / MINUTE_MS)),
    });
  }

  const calendar_color = (calendars ?? data.calendars).find(
    (calendar) => calendar.id === event.calendar_id,
  )?.color;
  const color = resolve_event_color(event, calendar_color);
  const title = event.title.trim() || t("calendar.untitled_event");

  return (
    <button
      className={`block w-full min-w-0 text-left cursor-pointer rounded-md focus:outline-none focus-visible:ring-1 focus-visible:ring-brand ${className}`}
      type="button"
      onClick={() => on_open(view_event)}
    >
      <span className="mb-1 flex items-center justify-between gap-2">
        <span className={label_class}>{t("calendar.up_next")}</span>
        {badge && (
          <span
            className="flex-shrink-0 text-[10px] tabular-nums font-medium"
            style={{
              color: is_ongoing
                ? "var(--accent-color)"
                : "var(--text-tertiary)",
            }}
          >
            {badge}
          </span>
        )}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-3 w-[3px] flex-shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="truncate text-[12px] font-medium leading-[18px] text-txt-primary">
          {title}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-[10px] tabular-nums text-txt-muted">
        {`${day_label}, ${time_label}`}
      </span>
    </button>
  );
});
