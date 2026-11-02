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
import { Button, ButtonSpinner } from "@aster/ui";
import { LockClosedIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { show_toast } from "@/components/toast/simple_toast";
import { ignore_error } from "@/lib/ignore_error";
import { use_i18n } from "@/lib/i18n/context";
import { delete_calendar, delete_event } from "@/services/api/calendar";
import {
  calendar_sync_engine,
  subscribe_calendar_sync,
} from "@/services/calendar/sync_engine";

export function CalendarDecryptBanner() {
  const { t } = use_i18n();
  const [count, set_count] = useState(() =>
    calendar_sync_engine.decrypt_failure_count(),
  );
  const [is_retrying, set_is_retrying] = useState(false);
  const [is_removing, set_is_removing] = useState(false);
  const [dismissed_count, set_dismissed_count] = useState(0);

  useEffect(
    () =>
      subscribe_calendar_sync(() => {
        set_count(calendar_sync_engine.decrypt_failure_count());
      }),
    [],
  );

  useEffect(() => {
    if (count === 0) set_dismissed_count(0);
  }, [count]);

  const retry = useCallback(async () => {
    const before = calendar_sync_engine.decrypt_failure_count();

    set_is_retrying(true);
    try {
      await calendar_sync_engine.pull_delta();
      const remaining = await calendar_sync_engine.retry_failed_decrypts();
      const opened = Math.max(0, before - remaining);

      set_count(remaining);
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
    } catch (caught) {
      ignore_error("calendar/calendar_decrypt_banner:retry", caught);
      const remaining = calendar_sync_engine.decrypt_failure_count();

      set_count(remaining);
      show_toast(
        t("calendar.decrypt_retry_still_failed", { count: remaining }),
        "error",
      );
    } finally {
      set_is_retrying(false);
    }
  }, [t]);

  const remove_unreadable = useCallback(async () => {
    const { event_ids, calendar_ids } =
      calendar_sync_engine.failed_decrypt_ids();
    let removed = 0;

    set_is_removing(true);
    try {
      for (const calendar_id of calendar_ids) {
        const { success } = await delete_calendar(calendar_id);

        if (success) removed += 1;
      }
      for (const event_id of event_ids) {
        const { success } = await delete_event(event_id);

        if (success) removed += 1;
      }
    } catch (caught) {
      ignore_error("calendar/calendar_decrypt_banner:remove", caught);
    } finally {
      set_is_removing(false);
    }

    const remaining = calendar_sync_engine.decrypt_failure_count();

    set_count(remaining);
    if (removed > 0) {
      show_toast(t("calendar.decrypt_removed", { count: removed }), "success");
    }
    if (remaining > 0) {
      show_toast(
        t("calendar.decrypt_retry_still_failed", { count: remaining }),
        "error",
      );
    }
  }, [t]);

  if (count === 0 || count <= dismissed_count) return null;

  const is_busy = is_retrying || is_removing;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-3 md:bottom-auto md:top-3 md:px-4"
      data-testid="calendar-decrypt-banner"
      role="alert"
    >
      <div className="aster_floating pointer-events-auto flex w-full max-w-[600px] items-center gap-3 rounded-[var(--aster-radius-floating)] py-2.5 pe-2 ps-4">
        <LockClosedIcon
          aria-hidden="true"
          className="h-5 w-5 flex-shrink-0 text-[var(--color-warning)]"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold leading-5 text-txt-primary">
            {t("calendar.decrypt_failed_title")}
          </span>
          <span
            className="line-clamp-2 text-[12px] leading-4 text-txt-secondary"
            data-testid="calendar-decrypt-banner-count"
          >
            {t("calendar.decrypt_failed_banner", { count })}
          </span>
        </span>
        <Button
          className="flex-shrink-0 whitespace-nowrap"
          data-testid="calendar-decrypt-banner-retry"
          disabled={is_busy}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => void retry()}
        >
          {is_retrying && <ButtonSpinner />}
          {t("calendar.decrypt_failed_retry")}
        </Button>
        <Button
          className="flex-shrink-0 whitespace-nowrap text-txt-secondary"
          data-testid="calendar-decrypt-banner-remove"
          disabled={is_busy}
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => void remove_unreadable()}
        >
          {is_removing && <ButtonSpinner />}
          {t("calendar.decrypt_failed_remove")}
        </Button>
        <Button
          aria-label={t("common.dismiss")}
          className="h-8 w-8 flex-shrink-0 text-txt-muted"
          data-testid="calendar-decrypt-banner-dismiss"
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => set_dismissed_count(count)}
        >
          <XMarkIcon aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
