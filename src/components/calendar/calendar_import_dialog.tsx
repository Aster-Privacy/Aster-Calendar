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

import { useEffect, useRef, useState } from "react";
import { Button, Checkbox, IslandDivider } from "@aster/ui";

import { CalendarEmptyState } from "@/components/calendar/calendar_empty_state";
import { ImportNothingIllustration } from "@/components/calendar/illustrations/calendar_illustrations";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert_dialog";
import { CalendarSelect } from "@/components/calendar/calendar_select";
import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import {
  type ImportPreview,
  import_entries,
  MAX_IMPORT_BYTES,
  read_import_preview,
  undo_import,
} from "@/services/calendar/ics_import";

interface CalendarImportDialogProps {
  is_open: boolean;
  files: File[];
  calendars: DecryptedCalendar[];
  default_calendar_id: string;
  on_close: () => void;
  on_imported?: () => void;
}

type Phase = "reading" | "preview" | "importing";

const IMPORT_BATCH_SIZE = 25;

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
      <span className="text-txt-muted">{label}</span>
      <span className="min-w-0 truncate text-end text-txt-primary">
        {value}
      </span>
    </div>
  );
}

export function CalendarImportDialog({
  is_open,
  files,
  calendars,
  default_calendar_id,
  on_close,
  on_imported,
}: CalendarImportDialogProps) {
  const { t } = use_i18n();
  const [phase, set_phase] = useState<Phase>("reading");
  const [preview, set_preview] = useState<ImportPreview | null>(null);
  const [target_id, set_target_id] = useState(default_calendar_id);
  const [skip_existing, set_skip_existing] = useState(true);
  const [progress, set_progress] = useState({ done: 0, total: 0 });
  const on_close_ref = useRef(on_close);
  const cancel_requested = useRef(false);

  on_close_ref.current = on_close;

  useEffect(() => {
    if (!is_open) {
      return;
    }

    let cancelled = false;

    cancel_requested.current = false;
    set_phase("reading");
    set_preview(null);
    set_skip_existing(true);
    set_target_id(default_calendar_id);
    set_progress({ done: 0, total: 0 });

    if (files.some((file) => file.size > MAX_IMPORT_BYTES)) {
      show_toast(t("calendar.settings_import_too_large"), "error");
      on_close_ref.current();

      return;
    }

    read_import_preview(files)
      .then((result) => {
        if (cancelled) {
          return;
        }

        set_preview(result);
        set_phase("preview");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        show_toast(t("calendar.settings_import_failed"), "error");
        on_close_ref.current();
      });

    return () => {
      cancelled = true;
    };
  }, [default_calendar_id, files, is_open, t]);

  const entries_to_import = preview
    ? skip_existing
      ? preview.new_entries
      : preview.parsed
    : [];
  const target = calendars.find((calendar) => calendar.id === target_id);
  const can_import =
    phase === "preview" && entries_to_import.length > 0 && target !== undefined;

  const handle_import = async () => {
    if (!can_import || !target) {
      return;
    }

    cancel_requested.current = false;
    set_phase("importing");
    set_progress({ done: 0, total: entries_to_import.length });

    const created: string[] = [];
    const total = entries_to_import.length;
    let failed = false;

    for (let index = 0; index < total; index += IMPORT_BATCH_SIZE) {
      if (cancel_requested.current) {
        break;
      }

      const batch = entries_to_import.slice(index, index + IMPORT_BATCH_SIZE);

      try {
        created.push(...(await import_entries(batch, target.id)));
      } catch {
        failed = true;
        break;
      }

      set_progress({ done: Math.min(index + batch.length, total), total });
    }

    const undo_created = async () => {
      try {
        await undo_import(created);
        on_imported?.();
        show_toast(t("calendar.import_undone"), "success");
      } catch {
        show_toast(t("calendar.import_undo_failed"), "error");
      }
    };

    if (created.length > 0) {
      on_imported?.();
    }

    if (!failed && !cancel_requested.current) {
      on_close();
      show_action_toast({
        message: t("calendar.import_done", { count: created.length }),
        action_type: "restore",
        email_ids: [],
        on_undo: undo_created,
      });

      return;
    }

    if (failed) {
      show_toast(t("calendar.settings_import_failed"), "error");
    }

    if (created.length > 0) {
      show_action_toast({
        message: t("calendar.import_partial", { count: created.length }),
        action_type: "restore",
        email_ids: [],
        on_undo: undo_created,
      });
    }

    set_phase("reading");

    try {
      const refreshed = await read_import_preview(files);

      set_preview(refreshed);
      set_skip_existing(true);
    } catch {
      show_toast(t("calendar.settings_import_failed"), "error");
    }

    set_phase("preview");
  };

  const handle_cancel = () => {
    if (phase === "importing") {
      cancel_requested.current = true;

      return;
    }

    on_close();
  };

  const progress_percent =
    progress.total === 0
      ? 0
      : Math.round((progress.done / progress.total) * 100);

  const has_settings =
    preview !== null &&
    (preview.parsed.length > 0 || preview.existing_count > 0);

  return (
    <AlertDialog
      open={is_open}
      onOpenChange={(open) => {
        if (!open && phase !== "importing") {
          on_close();
        }
      }}
    >
      <AlertDialogContent
        className="max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-[440px] gap-0 overflow-y-auto overscroll-contain rounded-[var(--aster-radius-floating,16px)] p-0"
        on_overlay_click={phase === "importing" ? undefined : on_close}
      >
        <div className="px-5 pb-4 pt-5">
          <AlertDialogHeader className="space-y-0">
            <AlertDialogTitle className="text-base font-semibold">
              {t("calendar.import_title")}
            </AlertDialogTitle>
          </AlertDialogHeader>

          {phase === "reading" && (
            <p className="mt-1 text-xs text-txt-muted">
              {t("calendar.settings_importing")}
            </p>
          )}

          {phase !== "reading" && preview && (
            <div className="mt-3 flex flex-col gap-3">
              <div className="aster_island overflow-hidden">
                <PreviewRow
                  label={t("calendar.import_file")}
                  value={preview.file_names.join(", ")}
                />
                <IslandDivider />
                <PreviewRow
                  label={t("calendar.import_events_found", {
                    count: preview.parsed.length,
                  })}
                  value=""
                />
                {preview.existing_count > 0 && (
                  <>
                    <IslandDivider />
                    <PreviewRow
                      label={t("calendar.import_already_present", {
                        count: preview.existing_count,
                      })}
                      value=""
                    />
                  </>
                )}
              </div>

              {preview.dropped_time_zones.length > 0 && (
                <p
                  className="px-1 text-sm text-txt-muted"
                  data-testid="calendar-import-dropped-zones"
                  role="status"
                >
                  {t("calendar.import_unknown_time_zones", {
                    zones: preview.dropped_time_zones.join(", "),
                  })}
                </p>
              )}

              {preview.parsed.length === 0 && (
                <CalendarEmptyState
                  action={
                    <Button size="sm" variant="ghost" onClick={on_close}>
                      {t("common.close")}
                    </Button>
                  }
                  body={t("calendar.import_no_events")}
                  compact
                  data-testid="calendar-import-empty"
                  illustration={<ImportNothingIllustration />}
                  title={t("calendar.import_empty_title")}
                />
              )}

              {has_settings && (
                <div className="aster_island overflow-hidden">
                  {preview.parsed.length > 0 && (
                    <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span className="shrink-0 text-txt-muted">
                        {t("calendar.import_target")}
                      </span>
                      <CalendarSelect
                        aria_label={t("calendar.import_target")}
                        class_name="max-w-[60%]"
                        disabled={phase === "importing"}
                        options={calendars.map((calendar) => ({
                          value: calendar.id,
                          label: calendar.name,
                        }))}
                        placeholder={t("calendar.import_target")}
                        value={target_id}
                        on_change={set_target_id}
                      />
                    </div>
                  )}

                  {preview.existing_count > 0 && (
                    <>
                      {preview.parsed.length > 0 && <IslandDivider />}
                      <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm text-txt-primary">
                        {t("calendar.import_skip_existing")}
                        <Checkbox
                          checked={skip_existing}
                          disabled={phase === "importing"}
                          onCheckedChange={(next) =>
                            set_skip_existing(next === true)
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
              )}

              {preview.parsed.length > 0 &&
                entries_to_import.length === 0 &&
                phase === "preview" && (
                  <CalendarEmptyState
                    action={
                      <Button size="sm" variant="ghost" onClick={on_close}>
                        {t("common.close")}
                      </Button>
                    }
                    body={t("calendar.import_nothing_new")}
                    compact
                    data-testid="calendar-import-nothing-new"
                    illustration={<ImportNothingIllustration />}
                    title={t("calendar.import_empty_title")}
                  />
                )}

              {phase === "importing" && (
                <div className="aster_island flex flex-col gap-2 overflow-hidden px-4 py-3">
                  <span className="text-xs text-txt-muted">
                    {t("calendar.import_progress", {
                      done: progress.done,
                      total: progress.total,
                    })}
                  </span>
                  <div
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={progress_percent}
                    className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--aster-field-bg)]"
                    role="progressbar"
                  >
                    <div
                      className="h-full rounded-full bg-[var(--accent-color)] transition-[width] duration-150 motion-reduce:transition-none"
                      style={{ width: `${progress_percent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <AlertDialogFooter className="flex-row gap-2 px-5 pb-5 pt-1 sm:justify-end">
          <Button
            className="mt-0 max-sm:flex-1"
            size="md"
            variant="ghost"
            onClick={handle_cancel}
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="max-sm:flex-1"
            disabled={!can_import}
            size="md"
            variant="depth"
            onClick={() => void handle_import()}
          >
            {phase === "importing"
              ? t("calendar.settings_importing")
              : t("calendar.import_action", {
                  count: entries_to_import.length,
                })}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
