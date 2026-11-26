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
import type { ReactNode } from "react";

import { useEffect, useState } from "react";

import { DatedCalendarLogo } from "@/components/calendar/dated_calendar_logo";
import { use_i18n } from "@/lib/i18n/context";
import { server_now } from "@/lib/server_clock";
import { cn } from "@/lib/utils";

export function format_guard_countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function use_guard_now(interval_ms = 1000): number {
  const [now, set_now] = useState(() => server_now());

  useEffect(() => {
    const timer = window.setInterval(() => set_now(server_now()), interval_ms);

    return () => window.clearInterval(timer);
  }, [interval_ms]);

  return now;
}

export function GuardLogo({ className }: { className?: string }) {
  const { t } = use_i18n();

  return (
    <div className={cn("flex justify-center", className)}>
      <DatedCalendarLogo
        align="center"
        alt={t("auth.aster_calendar")}
        className="h-8 w-auto"
      />
    </div>
  );
}

export function GuardResultView({
  title,
  title_info,
  body,
  actions,
  children,
  test_id,
  live = false,
  className,
}: {
  title: string;
  title_info?: ReactNode;
  body?: string;
  actions: ReactNode;
  children?: ReactNode;
  test_id?: string;
  live?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-live={live ? "polite" : undefined}
      className={cn("flex flex-col items-center text-center", className)}
      data-testid={test_id}
    >
      <GuardLogo className="mb-5" />
      <div className="flex items-center justify-center gap-1.5">
        <h2 className="text-lg font-semibold text-txt-primary">{title}</h2>
        {title_info}
      </div>
      {body && (
        <p className="mt-1.5 max-w-sm text-sm text-txt-muted" role="status">
          {body}
        </p>
      )}
      {children}
      <div className="mt-6 flex w-full flex-col gap-2">{actions}</div>
    </div>
  );
}


type ChipTone = "neutral" | "brand" | "danger" | "warning" | "success";

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: "text-txt-secondary",
  brand: "text-brand",
  danger: "text-red-600 dark:text-red-400",
  warning: "text-amber-700 dark:text-amber-300",
  success: "text-emerald-700 dark:text-emerald-300",
};

export function GuardChip({
  children,
  tone = "neutral",
  icon,
  className,
  test_id,
}: {
  children: ReactNode;
  tone?: ChipTone;
  icon?: ReactNode;
  className?: string;
  test_id?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium tabular-nums [&>svg]:text-txt-muted",
        CHIP_TONES[tone],
        className,
      )}
      data-testid={test_id}
    >
      {icon}
      {children}
    </span>
  );
}
