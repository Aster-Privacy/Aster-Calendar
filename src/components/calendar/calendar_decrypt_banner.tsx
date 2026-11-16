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
import { useEffect, useState } from "react";
import { Button, ButtonSpinner } from "@aster/ui";
import { LockClosedIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { use_retry_calendar_decrypts } from "@/components/calendar/use_unreadable_calendars";
import { use_i18n } from "@/lib/i18n/context";
import {
  calendar_sync_engine,
  subscribe_calendar_sync,
} from "@/services/calendar/sync_engine";

export function CalendarDecryptBanner() {
  const { t } = use_i18n();
  const [count, set_count] = useState(() =>
    calendar_sync_engine.decrypt_failure_count(),
  );
  const { is_retrying, retry } = use_retry_calendar_decrypts();
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

  if (count === 0 || count <= dismissed_count) return null;

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
          disabled={is_retrying}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => {
            void retry().then((remaining) => set_count(remaining));
          }}
        >
          {is_retrying && <ButtonSpinner />}
          {t("calendar.decrypt_failed_retry")}
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
