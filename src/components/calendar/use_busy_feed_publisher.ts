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
import { useEffect, useRef } from "react";

import { use_auth } from "@/contexts/auth/use_auth_hook";
import { subscribe_calendar_changes } from "@/services/api/calendar";
import { is_app_network_locked } from "@/services/app_lock_network_gate";
import {
  forget_busy_fingerprints,
  publish_all_busy_feeds,
} from "@/services/calendar/busy_feed";

const FIRST_PUBLISH_DELAY_MS = 5_000;
const CHANGE_DEBOUNCE_MS = 30_000;
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const VISIBLE_REFRESH_MS = 60 * 60 * 1000;

export function use_busy_feed_publisher(): void {
  const { user, current_account_id } = use_auth();
  const email_ref = useRef<{ account_id: string | null; email: string | null }>(
    { account_id: current_account_id, email: user?.email ?? null },
  );

  email_ref.current = {
    account_id: current_account_id,
    email: user?.email ?? null,
  };

  useEffect(() => {
    if (!current_account_id) {
      return;
    }

    let cancelled = false;
    let running = false;
    let queued_force = false;
    let queued = false;
    let last_run_ms = 0;
    let debounce_timer: number | null = null;

    forget_busy_fingerprints();

    const owns_session = () =>
      !cancelled && email_ref.current.account_id === current_account_id;

    const run = async (force: boolean) => {
      if (!owns_session()) return;

      if (running) {
        queued = true;
        queued_force = queued_force || force;

        return;
      }

      if (is_app_network_locked()) return;

      running = true;

      try {
        await publish_all_busy_feeds(email_ref.current.email, {
          force,
          should_continue: owns_session,
        });
        last_run_ms = Date.now();
      } catch {
        last_run_ms = Date.now();
      } finally {
        running = false;
      }

      if (queued && !cancelled) {
        const next_force = queued_force;

        queued = false;
        queued_force = false;
        void run(next_force);
      }
    };

    const schedule_change = () => {
      if (debounce_timer !== null) {
        window.clearTimeout(debounce_timer);
      }

      debounce_timer = window.setTimeout(() => {
        debounce_timer = null;
        void run(false);
      }, CHANGE_DEBOUNCE_MS);
    };

    const on_visible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - last_run_ms > VISIBLE_REFRESH_MS
      ) {
        void run(true);
      }
    };

    const first_timer = window.setTimeout(
      () => void run(true),
      FIRST_PUBLISH_DELAY_MS,
    );
    const interval = window.setInterval(
      () => void run(true),
      REFRESH_INTERVAL_MS,
    );
    const unsubscribe = subscribe_calendar_changes(schedule_change);

    document.addEventListener("visibilitychange", on_visible);

    return () => {
      cancelled = true;
      window.clearTimeout(first_timer);
      window.clearInterval(interval);

      if (debounce_timer !== null) {
        window.clearTimeout(debounce_timer);
      }

      unsubscribe();
      document.removeEventListener("visibilitychange", on_visible);
    };
  }, [current_account_id]);
}
