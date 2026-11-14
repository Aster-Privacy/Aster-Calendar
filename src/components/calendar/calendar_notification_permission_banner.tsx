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
import { Button } from "@aster/ui";
import { BellAlertIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";

const DISMISS_KEY = "aster_calendar_notification_banner_dismissed";

function read_permission(): NotificationPermission | null {
  try {
    return typeof Notification === "undefined" ? null : Notification.permission;
  } catch {
    return null;
  }
}

function read_dismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function CalendarNotificationPermissionBanner({
  hidden,
}: {
  hidden: boolean;
}) {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const [permission, set_permission] = useState(read_permission);
  const [dismissed, set_dismissed] = useState(read_dismissed);

  useEffect(() => {
    const refresh = () => set_permission(read_permission());

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const request = useCallback(async () => {
    try {
      set_permission(await Notification.requestPermission());
    } catch {
      set_permission(read_permission());
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      void 0;
    }
    set_dismissed(true);
  }, []);

  if (
    hidden ||
    dismissed ||
    preferences.calendar_notifications_mode !== "desktop" ||
    permission !== "default"
  ) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[58] flex justify-center px-3 md:bottom-6 md:px-4"
      data-testid="calendar-notification-permission-banner"
      role="status"
    >
      <div className="aster_floating pointer-events-auto flex w-full max-w-[600px] items-center gap-3 rounded-[var(--aster-radius-floating)] py-2.5 pe-2 ps-4">
        <BellAlertIcon
          aria-hidden="true"
          className="h-5 w-5 flex-shrink-0 text-[var(--color-warning)]"
        />
        <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-5 text-txt-primary">
          {t("calendar.notification_permission_banner")}
        </span>
        <Button
          className="flex-shrink-0 whitespace-nowrap"
          size="sm"
          type="button"
          variant="ghost"
          onClick={dismiss}
        >
          {t("common.not_now")}
        </Button>
        <Button
          className="flex-shrink-0 whitespace-nowrap"
          data-testid="calendar-notification-permission-allow"
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => void request()}
        >
          {t("calendar.notification_permission_banner_allow")}
        </Button>
      </div>
    </div>
  );
}
