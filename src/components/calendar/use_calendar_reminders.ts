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
import type { ReminderTarget } from "@/services/calendar/reminder_scheduler";

import { useEffect, useRef } from "react";

import { use_auth } from "@/contexts/auth/use_auth_hook";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { list_events, subscribe_calendar_changes } from "@/services/api/calendar";
import { BACKGROUND_REMINDER_SHOWN } from "@/lib/calendar_reminder_messages";
import {
  REMINDER_GRACE_MS,
  build_reminder_targets,
  claim_reminder,
  clear_background_reminders,
  desktop_reminders_allowed,
  has_fired,
  mark_fired,
  play_reminder_sound,
  report_background_reminder_fired,
  schedule_reminder,
  show_desktop_reminder,
  sync_background_reminders,
} from "@/services/calendar/reminder_scheduler";
import { show_toast } from "@/components/toast/simple_toast";
import {
  is_any_lockdown_active,
  LOCKDOWN_CHANGED_EVENT,
} from "@/services/lockdown_store";
import { is_app_network_locked } from "@/services/app_lock_network_gate";
import { get_app_lock_config } from "@/services/app_lock_store";

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const LOOKAHEAD_MS = 12 * 60 * 60 * 1000;

export function use_calendar_reminders(): void {
  const { preferences } = use_preferences();
  const { user, current_account_id } = use_auth();
  const { t, language } = use_i18n();

  const mode = preferences.calendar_notifications_mode;
  const play_sound = preferences.calendar_notification_sound;
  const only_accepted = preferences.calendar_notify_only_accepted;
  const default_reminder = preferences.calendar_default_reminder_minutes;
  const default_all_day_reminder =
    preferences.calendar_default_all_day_reminder_minutes;
  const time_format = preferences.time_format;

  const latest = useRef({
    account_id: current_account_id ?? "",
    language,
    mode,
    only_accepted,
    play_sound,
    t,
    time_format,
  });

  latest.current = {
    account_id: current_account_id ?? "",
    language,
    mode,
    only_accepted,
    play_sound,
    t,
    time_format,
  };

  useEffect(() => {
    if (mode === "off") {
      return;
    }

    let cancelled = false;
    let pending_targets: ReminderTarget[] = [];
    const timers = new Map<string, number>();

    const clear_timers = () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }

      timers.clear();
    };

    const should_conceal = () =>
      is_any_lockdown_active() ||
      is_app_network_locked() ||
      get_app_lock_config(latest.current.account_id)?.enabled === true;

    const describe = (target: ReminderTarget) => {
      const current = latest.current;
      const conceal = should_conceal();
      const starts = new Date(target.starts_at);
      const time_label = target.is_all_day
        ? current.t("calendar.all_day")
        : new Intl.DateTimeFormat(current.language, {
            hour: "numeric",
            minute: "2-digit",
            hour12: current.time_format === "12h",
          }).format(starts);
      const title = conceal
        ? current.t("calendar.reminder_hidden_title")
        : target.title;
      const message = conceal
        ? target.is_all_day
          ? current.t("calendar.reminder_hidden_toast_all_day")
          : current.t("calendar.reminder_hidden_toast_timed", {
              time: time_label,
            })
        : target.is_all_day
          ? current.t("calendar.reminder_toast_all_day", {
              title: target.title,
            })
          : current.t("calendar.reminder_toast_timed", {
              time: time_label,
              title: target.title,
            });

      return { message, time_label, title };
    };

    const fire = async (target: ReminderTarget) => {
      timers.delete(target.key);

      if (cancelled || !(await claim_reminder(target.key))) {
        return;
      }

      report_background_reminder_fired(target.key);

      const current = latest.current;
      const { message, time_label, title } = describe(target);
      const delivered =
        current.mode === "desktop" &&
        show_desktop_reminder(title, time_label, target.key);

      if (!delivered) {
        show_toast(message, "info", 8000);
      }

      if (current.play_sound) {
        play_reminder_sound();
      }
    };

    const hand_to_service_worker = (targets: ReminderTarget[]) => {
      if (latest.current.mode !== "desktop" || !desktop_reminders_allowed()) {
        clear_background_reminders();

        return;
      }

      sync_background_reminders(
        targets.map((target) => {
          const { time_label, title } = describe(target);

          return {
            body: time_label,
            fire_at: target.fire_at,
            key: target.key,
            title,
          };
        }),
      );
    };

    const handle_shown_in_background = (event: MessageEvent) => {
      const data = event.data as { type?: string; key?: unknown } | null;

      if (data?.type !== BACKGROUND_REMINDER_SHOWN || typeof data.key !== "string") {
        return;
      }

      mark_fired(data.key);

      const timer = timers.get(data.key);

      if (timer !== undefined) {
        window.clearTimeout(timer);
        timers.delete(data.key);
      }
    };

    const refresh = async () => {
      const now = Date.now();

      try {
        const { data } = await list_events(
          new Date(now - REMINDER_GRACE_MS),
          new Date(now + LOOKAHEAD_MS),
        );

        if (cancelled) {
          return;
        }

        clear_timers();

        const targets = build_reminder_targets(data, {
          default_all_day_reminder_minutes: default_all_day_reminder,
          default_reminder_minutes: default_reminder,
          now,
          only_accepted: latest.current.only_accepted,
          self_email: user?.email,
        });

        const pending = targets.filter((target) => !has_fired(target.key));

        for (const target of pending) {
          timers.set(
            target.key,
            schedule_reminder(target, (due) => void fire(due)),
          );
        }

        pending_targets = pending;
        hand_to_service_worker(pending);
      } catch {
        return;
      }
    };

    void refresh();

    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const unsubscribe = subscribe_calendar_changes(() => void refresh());
    const handle_local_change = () => void refresh();
    const handle_visibility_change = () => {
      if (document.visibilityState === "hidden" && should_conceal()) {
        hand_to_service_worker(pending_targets);
      }
    };

    window.addEventListener("aster-calendar-changed", handle_local_change);
    window.addEventListener(LOCKDOWN_CHANGED_EVENT, handle_local_change);
    document.addEventListener("visibilitychange", handle_visibility_change);
    navigator.serviceWorker?.addEventListener(
      "message",
      handle_shown_in_background,
    );

    return () => {
      cancelled = true;
      clear_timers();
      clear_background_reminders();
      window.clearInterval(interval);
      unsubscribe();
      window.removeEventListener("aster-calendar-changed", handle_local_change);
      window.removeEventListener(LOCKDOWN_CHANGED_EVENT, handle_local_change);
      document.removeEventListener(
        "visibilitychange",
        handle_visibility_change,
      );
      navigator.serviceWorker?.removeEventListener(
        "message",
        handle_shown_in_background,
      );
    };
  }, [
    current_account_id,
    default_all_day_reminder,
    default_reminder,
    language,
    mode,
    only_accepted,
    play_sound,
    time_format,
    user?.email,
  ]);
}
