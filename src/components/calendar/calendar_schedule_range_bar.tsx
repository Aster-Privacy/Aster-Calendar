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
import type { TranslationKey } from "@/lib/i18n";

import { useEffect, useId, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { Button, PillButton } from "@aster/ui";

import { DateField } from "@/components/calendar/date_field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import {
  format_schedule_date,
  get_schedule_range,
  SCHEDULE_RANGES,
  validate_schedule_custom,
  type ScheduleRange,
} from "@/services/calendar/schedule_range";

const RANGE_LABELS: Record<ScheduleRange, TranslationKey> = {
  upcoming: "calendar.schedule_range_upcoming",
  next_7_days: "calendar.schedule_range_next_7_days",
  next_30_days: "calendar.schedule_range_next_30_days",
  next_3_months: "calendar.schedule_range_next_3_months",
  next_6_months: "calendar.schedule_range_next_6_months",
  this_year: "calendar.schedule_range_this_year",
  next_year: "calendar.schedule_range_next_year",
  custom: "calendar.schedule_range_custom",
};

type TranslateFn = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

interface CalendarScheduleRangeBarProps {
  t: TranslateFn;
  language: string;
  range: ScheduleRange;
  custom_start: string;
  custom_end: string;
  range_start: Date;
  range_end: Date;
  week_start_day: number;
  on_change: (
    range: ScheduleRange,
    custom_start?: string,
    custom_end?: string,
  ) => void;
}

type RangeFormatter = Intl.DateTimeFormat & {
  formatRange?: (start: Date, end: Date) => string;
};

function format_range_text(start: Date, end: Date, language: string): string {
  const formatter: RangeFormatter = new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (typeof formatter.formatRange === "function") {
    return formatter.formatRange(start, end);
  }

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

export function CalendarScheduleRangeBar({
  t,
  language,
  range,
  custom_start,
  custom_end,
  range_start,
  range_end,
  week_start_day,
  on_change,
}: CalendarScheduleRangeBarProps) {
  const [is_custom_open, set_is_custom_open] = useState(false);

  return (
    <div
      className="flex flex-shrink-0 items-center gap-2 border-b border-edge-secondary px-3 py-1.5 sm:px-4"
      data-testid="calendar-schedule-range-bar"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <PillButton
            aria-label={`${t("calendar.schedule_range_label")}: ${t(RANGE_LABELS[range])}`}
            className="group flex-shrink-0"
            data-testid="calendar-schedule-range-trigger"
            size="sm"
            trailing={
              <ChevronDownIcon className="h-3.5 w-3.5 text-[var(--icon-secondary)] transition-transform duration-200 ease-out group-data-[state=open]:-rotate-180" />
            }
            type="button"
            variant="outline"
          >
            {t(RANGE_LABELS[range])}
          </PillButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-56 p-1"
          collisionPadding={8}
        >
          {SCHEDULE_RANGES.map((option) => {
            const is_active = option === range;

            return (
              <DropdownMenuItem
                key={option}
                className={is_active ? "bg-[var(--aster-selected)]" : ""}
                onSelect={() => {
                  if (option === "custom") {
                    set_is_custom_open(true);

                    return;
                  }

                  on_change(option);
                }}
              >
                <span className={`flex-1 ${is_active ? "font-medium" : ""}`}>
                  {t(RANGE_LABELS[option])}
                </span>
                {is_active && (
                  <CheckIcon
                    aria-hidden="true"
                    className="ms-2 h-4 w-4 text-[var(--accent-color)]"
                  />
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {range !== "upcoming" && (
        <span
          className="min-w-0 truncate text-[13px] tabular-nums text-txt-muted"
          data-testid="calendar-schedule-range-text"
        >
          {format_range_text(range_start, range_end, language)}
        </span>
      )}

      <CalendarScheduleCustomModal
        custom_end={custom_end}
        custom_start={custom_start}
        is_open={is_custom_open}
        t={t}
        week_start_day={week_start_day}
        on_apply={(start, end) => on_change("custom", start, end)}
        on_close={() => set_is_custom_open(false)}
      />
    </div>
  );
}

interface CalendarScheduleCustomModalProps {
  t: TranslateFn;
  is_open: boolean;
  custom_start: string;
  custom_end: string;
  week_start_day: number;
  on_apply: (start: string, end: string) => void;
  on_close: () => void;
}

export function CalendarScheduleCustomModal({
  t,
  is_open,
  custom_start,
  custom_end,
  week_start_day,
  on_apply,
  on_close,
}: CalendarScheduleCustomModalProps) {
  const [start, set_start] = useState(custom_start);
  const [end, set_end] = useState(custom_end);
  const hint_id = useId();

  useEffect(() => {
    if (!is_open) {
      return;
    }

    if (validate_schedule_custom(custom_start, custom_end) === null) {
      set_start(custom_start);
      set_end(custom_end);

      return;
    }

    const fallback = get_schedule_range("next_30_days", new Date());

    set_start(format_schedule_date(fallback.range_start));
    set_end(format_schedule_date(fallback.range_end));
  }, [is_open, custom_start, custom_end]);

  const error = validate_schedule_custom(start, end);
  const error_text =
    error === "end_before_start"
      ? t("calendar.schedule_range_end_before_start")
      : error === "too_long"
        ? t("calendar.schedule_range_too_long")
        : null;

  const handle_apply = () => {
    if (error !== null) {
      return;
    }

    on_apply(start, end);
    on_close();
  };

  return (
    <Modal is_open={is_open} size="sm" on_close={on_close}>
      <ModalHeader>
        <ModalTitle>{t("calendar.schedule_range_custom")}</ModalTitle>
      </ModalHeader>
      <ModalBody className="flex flex-col items-stretch gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-txt-secondary">
            {t("calendar.schedule_range_start")}
          </span>
          <DateField
            aria_label={t("calendar.schedule_range_start")}
            value={start}
            week_start_day={week_start_day}
            on_change={set_start}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-txt-secondary">
            {t("calendar.schedule_range_end")}
          </span>
          <DateField
            aria_label={t("calendar.schedule_range_end")}
            value={end}
            week_start_day={week_start_day}
            on_change={set_end}
          />
        </div>
        <p
          aria-live="polite"
          className={`min-h-[18px] px-1 text-xs ${
            error_text ? "text-[var(--color-danger)]" : "text-txt-muted"
          }`}
          data-testid="calendar-schedule-range-hint"
          id={hint_id}
          role={error_text ? "alert" : undefined}
        >
          {error_text ?? t("calendar.schedule_range_cap_hint")}
        </p>
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        <Button size="md" variant="ghost" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button
          aria-describedby={hint_id}
          data-testid="calendar-schedule-range-apply"
          disabled={error !== null}
          size="md"
          variant="depth"
          onClick={handle_apply}
        >
          {t("calendar.schedule_range_apply")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
