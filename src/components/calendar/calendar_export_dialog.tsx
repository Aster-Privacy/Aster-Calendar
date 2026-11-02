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
import type { DecryptedCalendar } from "@/types/calendar";

import { useEffect, useState } from "react";
import { Button, Checkbox, IslandDivider } from "@aster/ui";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert_dialog";
import { CalendarSelect } from "@/components/calendar/calendar_select";
import { DateField, to_iso_date } from "@/components/calendar/date_field";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { list_event_masters } from "@/services/api/calendar";
import { build_ics } from "@/services/calendar/ics_file";

interface CalendarExportDialogProps {
  is_open: boolean;
  calendars: DecryptedCalendar[];
  default_calendar_id: string;
  week_start_day: number;
  on_close: () => void;
}

type ExportScope = "all" | "one";

const EXPORT_YEARS = 3;

export function export_file_name(
  calendar_name: string | null,
  exported_at: Date,
): string {
  const date = to_iso_date(exported_at);
  const slug = (calendar_name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug.length > 0 ? slug : "aster-calendar"}-${date}.ics`;
}

function download_text(file_name: string, text: string) {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = file_name;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function parse_local_date(value: string, end_of_day: boolean): Date {
  const [year, month, day] = value.split("-").map(Number);

  return end_of_day
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day);
}

function ScopeRow({
  is_selected,
  label,
  on_select,
}: {
  is_selected: boolean;
  label: string;
  on_select: () => void;
}) {
  return (
    <button
      aria-checked={is_selected}
      className={`flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-3 text-start transition-colors duration-150 hover:bg-[var(--aster-island-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-color)] ${
        is_selected ? "bg-[var(--aster-selected)]" : ""
      }`}
      role="radio"
      type="button"
      onClick={on_select}
    >
      <span className="min-w-0 flex-1 text-sm text-txt-primary">{label}</span>
      <span
        aria-hidden="true"
        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full transition-colors duration-150 ${
          is_selected
            ? "bg-[var(--accent-color)]"
            : "shadow-[inset_0_0_0_1.5px_var(--text-muted)]"
        }`}
      >
        {is_selected ? (
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-fg,#ffffff)]" />
        ) : null}
      </span>
    </button>
  );
}

export function CalendarExportDialog({
  is_open,
  calendars,
  default_calendar_id,
  week_start_day,
  on_close,
}: CalendarExportDialogProps) {
  const { t } = use_i18n();
  const [scope, set_scope] = useState<ExportScope>("all");
  const [calendar_id, set_calendar_id] = useState(default_calendar_id);
  const [limit_range, set_limit_range] = useState(false);
  const [from_date, set_from_date] = useState(() => {
    const now = new Date();

    return to_iso_date(new Date(now.getFullYear(), 0, 1));
  });
  const [to_date, set_to_date] = useState(() => {
    const now = new Date();

    return to_iso_date(new Date(now.getFullYear(), 11, 31));
  });
  const [is_busy, set_is_busy] = useState(false);

  useEffect(() => {
    if (is_open) {
      set_calendar_id(default_calendar_id);
      set_is_busy(false);
    }
  }, [default_calendar_id, is_open]);

  const selected = calendars.find((calendar) => calendar.id === calendar_id);
  const range_valid = !limit_range || from_date <= to_date;
  const can_export =
    !is_busy && range_valid && (scope === "all" || selected !== undefined);

  const handle_export = async () => {
    if (!can_export) {
      return;
    }

    set_is_busy(true);

    try {
      const now = new Date();
      const range_start = limit_range
        ? parse_local_date(from_date, false)
        : new Date(now.getFullYear() - EXPORT_YEARS, 0, 1);
      const range_end = limit_range
        ? parse_local_date(to_date, true)
        : new Date(now.getFullYear() + EXPORT_YEARS, 11, 31);
      const result = await list_event_masters(range_start, range_end);
      const events =
        scope === "one" && selected
          ? result.data.filter((event) => event.calendar_id === selected.id)
          : result.data;

      if (events.length === 0) {
        show_toast(t("calendar.settings_export_empty"), "info");

        return;
      }

      download_text(
        export_file_name(
          scope === "one" && selected ? selected.name : null,
          now,
        ),
        build_ics(events, now.toISOString()),
      );
      show_toast(
        t("calendar.settings_export_done", { count: events.length }),
        "success",
      );
      on_close();
    } catch {
      show_toast(t("calendar.settings_export_failed"), "error");
    } finally {
      set_is_busy(false);
    }
  };

  const scope_options: ExportScope[] = ["all", "one"];

  return (
    <AlertDialog
      open={is_open}
      onOpenChange={(open) => {
        if (!open && !is_busy) {
          on_close();
        }
      }}
    >
      <AlertDialogContent
        className="max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-[440px] gap-0 overflow-y-auto overscroll-contain rounded-[var(--aster-radius-floating,16px)] p-0"
        on_overlay_click={is_busy ? undefined : on_close}
      >
        <div className="px-5 pb-4 pt-5">
          <AlertDialogHeader className="space-y-0">
            <AlertDialogTitle className="text-base font-semibold">
              {t("calendar.export_title")}
            </AlertDialogTitle>
          </AlertDialogHeader>

          <div className="mt-3 flex flex-col gap-3">
            <div
              aria-label={t("calendar.export_title")}
              className="aster_island overflow-hidden"
              role="radiogroup"
            >
              {scope_options.map((option, index) => (
                <div key={option}>
                  {index > 0 && <IslandDivider />}
                  <ScopeRow
                    is_selected={option === scope}
                    label={
                      option === "all"
                        ? t("calendar.export_all_calendars")
                        : t("calendar.export_one_calendar")
                    }
                    on_select={() => set_scope(option)}
                  />
                </div>
              ))}

              {scope === "one" && (
                <>
                  <IslandDivider />
                  <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="shrink-0 text-txt-muted">
                      {t("calendar.export_calendar")}
                    </span>
                    <CalendarSelect
                      aria_label={t("calendar.export_calendar")}
                      class_name="max-w-[60%]"
                      options={calendars.map((calendar) => ({
                        value: calendar.id,
                        label: calendar.name,
                      }))}
                      placeholder={t("calendar.export_calendar")}
                      value={calendar_id}
                      on_change={set_calendar_id}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="aster_island overflow-hidden">
              <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm text-txt-primary">
                {t("calendar.export_limit_range")}
                <Checkbox
                  checked={limit_range}
                  onCheckedChange={(next) => set_limit_range(next === true)}
                />
              </label>

              {limit_range && (
                <>
                  <IslandDivider />
                  <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="shrink-0 text-txt-muted">
                      {t("calendar.export_from")}
                    </span>
                    <div className="min-w-0 max-w-[60%]">
                      <DateField
                        aria_label={t("calendar.export_from")}
                        value={from_date}
                        week_start_day={week_start_day}
                        on_change={set_from_date}
                      />
                    </div>
                  </div>
                  <IslandDivider />
                  <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="shrink-0 text-txt-muted">
                      {t("calendar.export_to")}
                    </span>
                    <div className="min-w-0 max-w-[60%]">
                      <DateField
                        aria_label={t("calendar.export_to")}
                        value={to_date}
                        week_start_day={week_start_day}
                        on_change={set_to_date}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <AlertDialogFooter className="flex-row gap-2 px-5 pb-5 pt-1 sm:justify-end">
          <Button
            className="mt-0 max-sm:flex-1"
            disabled={is_busy}
            size="md"
            variant="ghost"
            onClick={on_close}
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="max-sm:flex-1"
            disabled={!can_export}
            size="md"
            variant="depth"
            onClick={() => void handle_export()}
          >
            {t("calendar.export_action")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
