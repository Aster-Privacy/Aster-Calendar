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

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000];
const STEADY_RETRY_MS = 60_000;
const EVENT_MIN_INTERVAL_MS = 5_000;

function can_retry_now(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }

  return document.visibilityState !== "hidden";
}

export function use_load_recovery(
  load_failed: boolean,
  reload: () => void,
): void {
  const reload_ref = useRef(reload);

  reload_ref.current = reload;

  useEffect(() => {
    if (!load_failed) return;

    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last_event_ms = -Infinity;

    const schedule = () => {
      const delay = RETRY_DELAYS_MS[attempt] ?? STEADY_RETRY_MS;

      attempt += 1;
      timer = setTimeout(() => {
        if (can_retry_now()) reload_ref.current();
        schedule();
      }, delay);
    };

    const recover = () => {
      if (!can_retry_now()) return;

      const now = Date.now();

      if (now - last_event_ms < EVENT_MIN_INTERVAL_MS) return;

      last_event_ms = now;
      reload_ref.current();
    };

    const handle_visibility = () => {
      if (document.visibilityState === "visible") recover();
    };

    schedule();
    window.addEventListener("online", recover);
    window.addEventListener("focus", recover);
    document.addEventListener("visibilitychange", handle_visibility);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", recover);
      window.removeEventListener("focus", recover);
      document.removeEventListener("visibilitychange", handle_visibility);
    };
  }, [load_failed]);
}
