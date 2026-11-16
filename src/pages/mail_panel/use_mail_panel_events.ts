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
import type { BirthdaySource } from "@/services/calendar/birthdays";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  build_birthday_events,
  build_holiday_events,
  expand_subscription_events,
  is_declined_by,
  load_birthday_sources,
  load_subscription_events,
} from "@/pages/mail_panel/mail_panel_sources";
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
import { calendar_write_key } from "@/services/calendar/calendar_crypto";
import {
  get_passphrase_from_memory,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import { use_own_addresses_version } from "@/services/calendar/own_addresses";
import { is_event_shown } from "@/services/calendar/birthdays";
import { use_panel_visible } from "@/pages/mail_panel/mail_panel_bridge";
import {
  build_snapshot_key,
  events_in_window,
} from "@/pages/mail_panel/mail_panel_snapshot";
import {
  from_view_date,
  resolve_view_zone,
  shift_events_to_view,
} from "@/services/calendar/view_zone";

const REFRESH_MS = 5 * 60_000;
export const PANEL_LOAD_TIMEOUT_MS = 8_000;
const DAY_MS = 86_400_000;
const UP_NEXT_BEFORE_MS = DAY_MS;
const UP_NEXT_AFTER_MS = 9 * DAY_MS;

const EMPTY_CALENDARS: DecryptedCalendar[] = [];

export type PanelLoadStatus = "loading" | "ready" | "failed";

interface StoreSnapshot {
  events: DecryptedCalendarEvent[];
  up_next: DecryptedCalendarEvent[];
  calendars: DecryptedCalendar[];
}

function row_stamp(event: DecryptedCalendarEvent): string {
  try {
    const row =
      calendar_sync_engine.get_event_row(event.id) ??
      (event.recurrence_master_id
        ? calendar_sync_engine.get_event_row(event.recurrence_master_id)
        : undefined);

    return row ? `${row.blob_nonce}:${row.version}:${row.updated_at}` : "";
  } catch {
    return "";
  }
}

function read_calendars(): DecryptedCalendar[] {
  try {
    return calendar_sync_engine.get_calendars();
  } catch {
    return [];
  }
}

async function recover_write_key(): Promise<boolean> {
  const vault = get_vault_from_memory();
  const passphrase = get_passphrase_from_memory();

  if (!vault || !passphrase) return false;
  if (await calendar_write_key(vault)) return false;

  try {
    const { load_account_keys_for_session } =
      await import("@/services/crypto/account_key_loader");

    await load_account_keys_for_session(vault, passphrase);
  } catch {
    return false;
  }

  return (await calendar_write_key(vault)) !== null;
}

export function use_mail_panel_events(range_start: Date, range_end: Date) {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const { user, current_account_id } = use_auth();
  const own_addresses_version = use_own_addresses_version();
  const account_id = current_account_id ?? user?.id ?? null;
  const zone = resolve_view_zone(preferences.calendar_timezone);
  const self_email = (user?.email ?? "").trim().toLowerCase();
  const start_ms = range_start.getTime();
  const end_ms = range_end.getTime();

  const [snapshot, set_snapshot] = useState<StoreSnapshot | null>(null);
  const [status, set_status] = useState<PanelLoadStatus>("loading");
  const [reload_token, set_reload_token] = useState(0);
  const [subscription_raw, set_subscription_raw] = useState<
    DecryptedCalendarEvent[]
  >([]);
  const [birthday_sources, set_birthday_sources] = useState<BirthdaySource[]>(
    [],
  );
  const recovery_attempted_ref = useRef(false);
  const generation_ref = useRef(0);
  const loaded_account_ref = useRef<string | null | undefined>(undefined);
  const snapshot_key_ref = useRef<string | null>(null);
  const is_visible = use_panel_visible();
  const visible_ref = useRef(is_visible);
  const stale_ref = useRef(false);

  visible_ref.current = is_visible;

  const reload = useCallback(() => set_reload_token((value) => value + 1), []);

  const request_reload = useCallback(() => {
    if (!visible_ref.current) {
      stale_ref.current = true;

      return;
    }
    reload();
  }, [reload]);

  useEffect(() => {
    if (!is_visible || !stale_ref.current) return;
    stale_ref.current = false;
    reload();
  }, [is_visible, reload]);

  const retry = useCallback(() => {
    recovery_attempted_ref.current = false;
    set_status("loading");
    reload();
  }, [reload]);

  useEffect(() => {
    if (loaded_account_ref.current !== account_id) {
      loaded_account_ref.current = account_id;
      recovery_attempted_ref.current = false;
      snapshot_key_ref.current = null;
      set_snapshot(null);
      set_status("loading");
    }

    generation_ref.current += 1;
    const generation = generation_ref.current;
    let cancelled = false;
    const is_current = () =>
      !cancelled && generation === generation_ref.current;
    const load_timer = window.setTimeout(() => {
      if (is_current()) {
        set_status((current) => (current === "ready" ? current : "failed"));
      }
    }, PANEL_LOAD_TIMEOUT_MS);

    const load = async () => {
      try {
        const real_start_ms = from_view_date(new Date(start_ms), zone).getTime();
        const real_end_ms = from_view_date(new Date(end_ms), zone).getTime();
        const result = await list_events(
          new Date(real_start_ms),
          new Date(real_end_ms),
        );

        if (!is_current()) return;

        const now_ms = Date.now();
        const up_next_start_ms = now_ms - UP_NEXT_BEFORE_MS;
        const up_next_end_ms = now_ms + UP_NEXT_AFTER_MS;
        const up_next =
          real_start_ms <= up_next_start_ms && real_end_ms >= up_next_end_ms
            ? events_in_window(result.data, up_next_start_ms, up_next_end_ms)
            : (
                await list_events(
                  new Date(up_next_start_ms),
                  new Date(up_next_end_ms),
                )
              ).data;

        if (!is_current()) return;

        const calendars = read_calendars();
        const key = build_snapshot_key(
          real_start_ms,
          real_end_ms,
          result.data,
          up_next,
          calendars,
          row_stamp,
        );

        if (key !== snapshot_key_ref.current) {
          snapshot_key_ref.current = key;
          set_snapshot({ events: result.data, up_next, calendars });
        }
        set_status("ready");
      } catch {
        if (!is_current()) return;

        if (!recovery_attempted_ref.current) {
          recovery_attempted_ref.current = true;

          if (await recover_write_key()) {
            if (is_current()) reload();

            return;
          }
        }

        if (is_current()) {
          set_status((current) => (current === "ready" ? current : "failed"));
        }
      } finally {
        window.clearTimeout(load_timer);
      }
    };

    void load();

    return () => {
      cancelled = true;
      window.clearTimeout(load_timer);
    };
  }, [account_id, start_ms, end_ms, zone, reload_token, reload]);

  useEffect(() => {
    const handle_visibility = () => {
      if (document.visibilityState === "visible") request_reload();
    };
    const unsubscribe = subscribe_calendar_changes(request_reload);
    const timer = window.setInterval(request_reload, REFRESH_MS);

    window.addEventListener(CALENDAR_CHANGED_EVENT, request_reload);
    document.addEventListener("visibilitychange", handle_visibility);

    return () => {
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener(CALENDAR_CHANGED_EVENT, request_reload);
      document.removeEventListener("visibilitychange", handle_visibility);
    };
  }, [request_reload]);

  const has_loaded = snapshot !== null;
  const subscriptions = preferences.calendar_ics_subscriptions ?? [];
  const subscriptions_key = JSON.stringify(
    subscriptions.map((subscription) => subscription.id + subscription.url),
  );
  const subscriptions_ref = useRef(subscriptions);

  subscriptions_ref.current = subscriptions;

  useEffect(() => {
    const current = subscriptions_ref.current;

    if (!has_loaded || current.length === 0) {
      set_subscription_raw([]);

      return;
    }

    let cancelled = false;

    void load_subscription_events(current).then((events) => {
      if (!cancelled) set_subscription_raw(events);
    });

    return () => {
      cancelled = true;
    };
  }, [has_loaded, subscriptions_key, account_id]);

  const show_birthdays = preferences.calendar_birthdays_hidden !== true;

  useEffect(() => {
    if (!has_loaded || !show_birthdays) {
      set_birthday_sources([]);

      return;
    }

    let cancelled = false;

    load_birthday_sources()
      .then((sources) => {
        if (!cancelled) set_birthday_sources(sources);
      })
      .catch(() => {
        if (!cancelled) set_birthday_sources([]);
      });

    return () => {
      cancelled = true;
    };
  }, [has_loaded, show_birthdays, account_id]);

  const holiday_region = preferences.calendar_holiday_region ?? "none";
  const holidays_color = preferences.calendar_holidays_color;
  const birthdays_color = preferences.calendar_birthdays_color;
  const show_declined = preferences.calendar_show_declined_events !== false;

  const events = useMemo(() => {
    if (!snapshot) return [] as DecryptedCalendarEvent[];

    const view_start = new Date(start_ms);
    const view_end = new Date(end_ms);
    const visible_ids = new Set(
      snapshot.calendars
        .filter((calendar) => calendar.is_visible)
        .map((calendar) => calendar.id),
    );
    const own = shift_events_to_view(snapshot.events, zone).filter(
      (event) =>
        is_event_shown(event, visible_ids, show_birthdays) &&
        (show_declined || !is_declined_by(event, self_email)),
    );
    const subscription_events = shift_events_to_view(
      expand_subscription_events(
        subscription_raw,
        from_view_date(view_start, zone),
        from_view_date(view_end, zone),
      ),
      zone,
    );

    return own
      .concat(
        build_holiday_events(
          holiday_region,
          view_start,
          view_end,
          holidays_color,
        ),
      )
      .concat(
        build_birthday_events(
          birthday_sources,
          view_start,
          view_end,
          (name) => t("calendar.birthday_title", { name }),
          birthdays_color,
        ),
      )
      .concat(subscription_events);
  }, [
    snapshot,
    start_ms,
    end_ms,
    zone,
    show_declined,
    show_birthdays,
    self_email,
    own_addresses_version,
    subscription_raw,
    holiday_region,
    holidays_color,
    birthday_sources,
    birthdays_color,
    t,
  ]);

  return {
    status,
    events,
    up_next_events: snapshot?.up_next ?? null,
    calendars: snapshot?.calendars ?? EMPTY_CALENDARS,
    retry,
    reload,
  };
}
