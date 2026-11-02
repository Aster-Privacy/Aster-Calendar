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
import { useMemo, useState } from "react";

import { DatePicker } from "@/components/calendar/date_picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { use_i18n } from "@/lib/i18n/context";

interface DateFieldProps {
  aria_label: string;
  trigger_class_name?: string;
  value: string;
  week_start_day: number;
  on_change: (value: string) => void;
}

export function to_iso_date(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

export function from_iso_date(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function DateField({
  aria_label,
  trigger_class_name,
  value,
  week_start_day,
  on_change,
}: DateFieldProps) {
  const { language } = use_i18n();
  const [is_open, set_is_open] = useState(false);

  const selected = from_iso_date(value);

  const label = useMemo(() => {
    if (!selected) {
      return aria_label;
    }

    return new Intl.DateTimeFormat(language, {
      day: "numeric",
      month: "short",
      weekday: "short",
      ...(selected.getFullYear() === new Date().getFullYear()
        ? {}
        : { year: "numeric" as const }),
    }).format(selected);
  }, [aria_label, language, selected]);

  return (
    <Popover open={is_open} onOpenChange={set_is_open}>
      <PopoverTrigger asChild>
        <button
          aria-label={aria_label}
          className={
            trigger_class_name ??
            "aster_input aster_input_tonal !h-9 !w-auto shrink-0 cursor-pointer items-center whitespace-nowrap !px-3 !text-[14px] text-txt-primary data-[state=open]:!bg-[var(--aster-field-hover)]"
          }
          type="button"
        >
          <span className="min-w-0 truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto rounded-[var(--aster-radius-floating)] p-3"
        sideOffset={6}
      >
        <DatePicker
          autofocus
          value={selected ?? null}
          week_start_day={week_start_day}
          on_select={(date) => {
            on_change(to_iso_date(date));
            set_is_open(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
