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
import { useCallback, useEffect, useState } from "react";

import { show_toast } from "@/components/toast/simple_toast";
import { ignore_error } from "@/lib/ignore_error";
import { use_i18n } from "@/lib/i18n/context";
import { remove_unreadable_calendars } from "@/services/api/calendar";
import {
  calendar_sync_engine,
  subscribe_calendar_sync,
} from "@/services/calendar/sync_engine";

export function use_unreadable_calendar_count(): number {
  const [count, set_count] = useState(() =>
    calendar_sync_engine.unreadable_calendar_count(),
  );

  useEffect(() => {
    set_count(calendar_sync_engine.unreadable_calendar_count());

    return subscribe_calendar_sync(() => {
      set_count(calendar_sync_engine.unreadable_calendar_count());
    });
  }, []);

  return count;
}

export function use_retry_calendar_decrypts(): {
  is_retrying: boolean;
  retry: () => Promise<number>;
} {
  const { t } = use_i18n();
  const [is_retrying, set_is_retrying] = useState(false);

  const retry = useCallback(async () => {
    const before = calendar_sync_engine.decrypt_failure_count();
    let remaining = before;

    set_is_retrying(true);
    try {
      await calendar_sync_engine.pull_delta();
      remaining = await calendar_sync_engine.retry_failed_decrypts();
    } catch (caught) {
      ignore_error("calendar/use_unreadable_calendars:retry", caught);
      remaining = calendar_sync_engine.decrypt_failure_count();
    } finally {
      set_is_retrying(false);
    }

    const opened = Math.max(0, before - remaining);

    if (opened > 0) {
      show_toast(
        t("calendar.decrypt_retry_opened", { count: opened }),
        "success",
      );
    }
    if (remaining > 0) {
      show_toast(
        t("calendar.decrypt_retry_still_failed", { count: remaining }),
        "error",
      );
    }

    return remaining;
  }, [t]);

  return { is_retrying, retry };
}

export function use_remove_unreadable_calendars(): {
  is_removing: boolean;
  remove: () => Promise<void>;
} {
  const { t } = use_i18n();
  const [is_removing, set_is_removing] = useState(false);

  const remove = useCallback(async () => {
    set_is_removing(true);
    try {
      const { outcome, removed } = await remove_unreadable_calendars();

      if (outcome === "removed") {
        show_toast(
          t("calendar.unreadable_removed", { count: removed }),
          "success",
        );
      } else if (outcome === "opened") {
        show_toast(t("calendar.unreadable_opened_instead"), "success");
      } else if (outcome === "keys_unavailable") {
        show_toast(t("calendar.unreadable_remove_keys_unavailable"), "error");
      } else if (outcome === "failed") {
        show_toast(t("calendar.unreadable_remove_failed"), "error");
      }
    } catch (caught) {
      ignore_error("calendar/use_unreadable_calendars:remove", caught);
      show_toast(t("calendar.unreadable_remove_failed"), "error");
    } finally {
      set_is_removing(false);
    }
  }, [t]);

  return { is_removing, remove };
}
