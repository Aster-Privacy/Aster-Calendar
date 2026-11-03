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
import type { ImportPreview } from "@/services/calendar/ics_import";
import type { IcsSubscription } from "@/services/calendar/subscriptions";
import type { DragEvent, ReactNode } from "react";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IslandRow, IslandSection, IslandSections } from "@aster/ui";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  DocumentArrowUpIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { show_toast } from "@/components/toast/simple_toast";
import { CalendarSelect } from "@/components/calendar/calendar_select";
import {
  EVENT_COLOR_OPTIONS,
  nearest_event_color,
} from "@/components/calendar/calendar_utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { export_calendar_events } from "@/services/calendar/calendar_export";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { format_bytes } from "@/lib/utils";
import { list_calendars } from "@/services/api/calendar";
import {
  import_entries,
  import_span,
  is_ics_file,
  MAX_IMPORT_BYTES,
  read_import_preview,
  undo_import,
} from "@/services/calendar/ics_import";
import {
  check_subscription,
  subscription_color,
} from "@/services/calendar/subscriptions";

type ImportPhase = "idle" | "reading" | "preview" | "importing" | "done";

interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  created_ids: string[];
}

const IMPORT_BATCH_SIZE = 25;
const ALL_CALENDARS = "__all__";
const MAX_SUBSCRIPTION_NAME_LENGTH = 100;
const MAX_SUBSCRIPTION_URL_LENGTH = 2048;
const SUBSCRIPTION_COLORS = [
  "#0b8043",
  "#3f51b5",
  "#d81b60",
  "#f4511e",
  "#8e24aa",
  "#039be5",
];
const FILE_ACCEPT = ".ics,.ical,text/calendar";

function is_https_url(value: string): boolean {
  if (value.length > MAX_SUBSCRIPTION_URL_LENGTH) {
    return false;
  }

  try {
    const parsed = new URL(value);

    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function calendar_option(calendar: DecryptedCalendar) {
  return {
    value: calendar.id,
    text: calendar.name,
    label: (
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: calendar.color }}
        />
        <span className="truncate">{calendar.name}</span>
      </span>
    ),
  };
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surf-tertiary"
      role="progressbar"
    >
      <div
        className="h-full rounded-full bg-brand transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function FieldBlock({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-txt-primary" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-500" id={`${id}_error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-txt-muted" id={`${id}_hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function has_files(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function CalendarImportCard({
  calendars,
  default_calendar_id,
}: {
  calendars: DecryptedCalendar[];
  default_calendar_id: string;
}) {
  const { t, language } = use_i18n();
  const navigate = useNavigate();
  const file_input = useRef<HTMLInputElement | null>(null);
  const cancel_requested = useRef(false);
  const read_token = useRef(0);
  const drag_depth = useRef(0);
  const [phase, set_phase] = useState<ImportPhase>("idle");
  const [is_dragging, set_is_dragging] = useState(false);
  const [file, set_file] = useState<File | null>(null);
  const [file_error, set_file_error] = useState<string | null>(null);
  const [preview, set_preview] = useState<ImportPreview | null>(null);
  const [target_id, set_target_id] = useState(default_calendar_id);
  const [progress, set_progress] = useState({ done: 0, total: 0 });
  const [result, set_result] = useState<ImportResult | null>(null);
  const [is_undoing, set_is_undoing] = useState(false);

  useEffect(() => {
    if (target_id.length === 0 && default_calendar_id.length > 0) {
      set_target_id(default_calendar_id);
    }
  }, [default_calendar_id, target_id]);

  const reset = () => {
    read_token.current += 1;
    set_phase("idle");
    set_file(null);
    set_preview(null);
    set_result(null);
    set_file_error(null);
    set_progress({ done: 0, total: 0 });
  };

  const accept_file = (next: File | undefined) => {
    if (!next) {
      return;
    }

    if (!is_ics_file(next)) {
      set_file_error(t("calendar.ie_wrong_type"));

      return;
    }

    if (next.size > MAX_IMPORT_BYTES) {
      set_file_error(t("calendar.settings_import_too_large"));

      return;
    }

    const token = read_token.current + 1;

    read_token.current = token;
    set_file_error(null);
    set_file(next);
    set_result(null);
    set_preview(null);
    set_phase("reading");

    read_import_preview([next])
      .then((loaded) => {
        if (read_token.current !== token) {
          return;
        }

        set_preview(loaded);
        set_phase("preview");
      })
      .catch(() => {
        if (read_token.current !== token) {
          return;
        }

        set_file(null);
        set_phase("idle");
        set_file_error(t("calendar.settings_import_failed"));
      });
  };

  const open_picker = () => {
    file_input.current?.click();
  };

  const can_accept_drop = phase === "idle" || phase === "preview";

  const recurring_count = useMemo(
    () =>
      preview
        ? preview.parsed.filter((entry) => entry.recurrence !== null).length
        : 0,
    [preview],
  );

  const date_range = useMemo(() => {
    if (!preview) {
      return null;
    }

    const span = import_span(preview.parsed);

    if (!span) {
      return null;
    }

    const formatter = new Intl.DateTimeFormat(language, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const start = formatter.format(span.start);
    const end = formatter.format(span.end);

    return start === end ? start : t("calendar.ie_date_range", { start, end });
  }, [language, preview, t]);

  const target = calendars.find((calendar) => calendar.id === target_id);
  const new_count = preview?.new_entries.length ?? 0;
  const skipped_in_file = preview ? preview.parsed.length - new_count : 0;
  const can_import =
    phase === "preview" && new_count > 0 && target !== undefined;

  const handle_import = async () => {
    if (!preview || !target || !can_import) {
      return;
    }

    const entries = preview.new_entries;
    const total = entries.length;
    const created: string[] = [];
    let failed = false;

    cancel_requested.current = false;
    set_phase("importing");
    set_progress({ done: 0, total });

    for (let index = 0; index < total; index += IMPORT_BATCH_SIZE) {
      if (cancel_requested.current) {
        break;
      }

      const batch = entries.slice(index, index + IMPORT_BATCH_SIZE);

      try {
        created.push(...(await import_entries(batch, target.id)));
      } catch {
        failed = true;
        break;
      }

      set_progress({ done: Math.min(index + batch.length, total), total });
    }

    set_result({
      imported: created.length,
      skipped: skipped_in_file,
      failed: total - created.length,
      created_ids: created,
    });
    set_phase("done");

    if (failed) {
      show_toast(t("calendar.settings_import_failed"), "error");
    }
  };

  const handle_undo = async () => {
    if (!result || result.created_ids.length === 0) {
      return;
    }

    set_is_undoing(true);

    try {
      await undo_import(result.created_ids);
      show_toast(t("calendar.import_undone"), "success");
      reset();
    } catch {
      show_toast(t("calendar.import_undo_failed"), "error");
    } finally {
      set_is_undoing(false);
    }
  };

  const progress_percent =
    progress.total === 0
      ? 0
      : Math.round((progress.done / progress.total) * 100);

  const file_icon = <DocumentTextIcon aria-hidden="true" className="h-5 w-5" />;

  return (
    <div
      className="flex flex-col"
      data-testid="calendar_import_drop_zone"
      onDragEnter={(event) => {
        if (!can_accept_drop || !has_files(event)) {
          return;
        }

        event.preventDefault();
        drag_depth.current += 1;
        set_is_dragging(true);
      }}
      onDragLeave={(event) => {
        if (!can_accept_drop) {
          return;
        }

        event.preventDefault();
        drag_depth.current = Math.max(0, drag_depth.current - 1);

        if (drag_depth.current === 0) {
          set_is_dragging(false);
        }
      }}
      onDragOver={(event) => {
        if (!can_accept_drop || !has_files(event)) {
          return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        if (!can_accept_drop) {
          return;
        }

        event.preventDefault();
        drag_depth.current = 0;
        set_is_dragging(false);
        accept_file(event.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={file_input}
        accept={FILE_ACCEPT}
        className="hidden"
        data-testid="calendar_import_file_input"
        type="file"
        onChange={(event) => {
          const next = event.target.files?.[0];

          event.target.value = "";
          accept_file(next);
        }}
      />
      <IslandSection
        divided
        description={t("calendar.ie_import_desc")}
        footer={
          file_error ? (
            <span className="text-red-500" role="alert">
              {file_error}
            </span>
          ) : undefined
        }
        icon={<ArrowUpTrayIcon />}
        island_class_name={
          is_dragging
            ? "outline-2 -outline-offset-2 outline-brand/60 transition-[outline-color]"
            : "transition-[outline-color]"
        }
        title={t("calendar.settings_import_title")}
      >
        {phase === "idle" && (
          <IslandRow
            description={t("calendar.ie_drop_hint")}
            icon={
              <DocumentArrowUpIcon aria-hidden="true" className="h-5 w-5" />
            }
            label={
              is_dragging
                ? t("calendar.ie_drop_active")
                : t("calendar.ie_row_title")
            }
            trailing={
              <Button
                size="sm"
                type="button"
                variant="secondary"
                onClick={open_picker}
              >
                {t("calendar.ie_browse")}
              </Button>
            }
          />
        )}

        {phase === "reading" && file && (
          <IslandRow
            aria-busy="true"
            description={t("calendar.ie_reading")}
            icon={file_icon}
            label={<span className="block truncate">{file.name}</span>}
          />
        )}

        {phase === "preview" && file && preview && (
          <>
            <IslandRow
              description={format_bytes(file.size)}
              icon={file_icon}
              label={<span className="block truncate">{file.name}</span>}
              trailing={
                <Button size="sm" type="button" variant="ghost" onClick={reset}>
                  {t("calendar.ie_change_file")}
                </Button>
              }
            />
            {preview.parsed.length === 0 ? (
              <IslandRow label={t("calendar.import_no_events")} />
            ) : (
              <>
                <IslandRow
                  label={t("calendar.ie_stat_events")}
                  value={String(preview.parsed.length)}
                />
                {recurring_count > 0 && (
                  <IslandRow
                    label={t("calendar.ie_stat_recurring")}
                    value={String(recurring_count)}
                  />
                )}
                <IslandRow
                  description={
                    skipped_in_file > 0
                      ? t("calendar.ie_skip_note", { count: skipped_in_file })
                      : undefined
                  }
                  label={t("calendar.ie_stat_existing")}
                  value={String(skipped_in_file)}
                />
                {date_range && (
                  <IslandRow
                    description={date_range}
                    label={t("calendar.ie_stat_range")}
                  />
                )}
                {preview.dropped_time_zones.length > 0 && (
                  <IslandRow
                    label={t("calendar.import_unknown_time_zones", {
                      zones: preview.dropped_time_zones.join(", "),
                    })}
                  />
                )}
                {new_count === 0 ? (
                  <IslandRow label={t("calendar.import_nothing_new")} />
                ) : (
                  <>
                    <IslandRow
                      layout="stacked"
                      label={
                        <span id="calendar_import_target_label">
                          {t("calendar.ie_destination")}
                        </span>
                      }
                      trailing={
                        <CalendarSelect
                          aria_labelledby="calendar_import_target_label"
                          class_name="min-w-[200px]"
                          data_testid="calendar_import_target"
                          options={calendars.map(calendar_option)}
                          value={target_id}
                          on_change={set_target_id}
                        />
                      }
                    />
                    <div className="aster_island_row justify-end">
                      <Button
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={reset}
                      >
                        {t("common.cancel")}
                      </Button>
                      <Button
                        disabled={!can_import}
                        size="sm"
                        type="button"
                        variant="primary"
                        onClick={() => void handle_import()}
                      >
                        {t("calendar.import_action", { count: new_count })}
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {phase === "importing" && file && (
          <IslandRow
            aria-busy="true"
            description={
              <span className="flex flex-col gap-2 pt-1">
                <span aria-live="polite">
                  {t("calendar.import_progress", {
                    done: progress.done,
                    total: progress.total,
                  })}
                </span>
                <ProgressBar percent={progress_percent} />
              </span>
            }
            icon={file_icon}
            label={<span className="block truncate">{file.name}</span>}
            trailing={
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => {
                  cancel_requested.current = true;
                }}
              >
                {t("calendar.ie_stop")}
              </Button>
            }
          />
        )}

        {phase === "done" && result && (
          <>
            <IslandRow
              data-testid="calendar_import_result"
              description={t("calendar.ie_result_summary", {
                imported: result.imported,
                skipped: result.skipped,
                failed: result.failed,
              })}
              icon={
                result.failed > 0 ? (
                  <ExclamationTriangleIcon
                    aria-hidden="true"
                    className="h-5 w-5 text-amber-500"
                  />
                ) : (
                  <CheckCircleIcon
                    aria-hidden="true"
                    className="h-5 w-5 text-green-500"
                  />
                )
              }
              label={
                result.failed > 0
                  ? t("calendar.ie_result_partial_title")
                  : target
                    ? t("calendar.ie_result_target", { name: target.name })
                    : t("calendar.ie_result_title")
              }
              trailing={
                result.imported > 0 ? (
                  <Button
                    size="sm"
                    type="button"
                    variant="secondary"
                    onClick={() => navigate("/")}
                  >
                    {t("calendar.ie_view_events")}
                  </Button>
                ) : undefined
              }
            />
            <IslandRow
              chevron
              label={t("calendar.ie_import_another")}
              on_press={reset}
            />
            {result.created_ids.length > 0 && (
              <IslandRow
                destructive
                disabled={is_undoing}
                label={t("calendar.ie_undo")}
                on_press={() => void handle_undo()}
              />
            )}
          </>
        )}
      </IslandSection>
      {phase === "idle" && (
        <details className="group mt-2 px-1 text-[12.5px] text-txt-muted">
          <summary className="w-fit cursor-pointer list-none rounded-md hover:text-txt-primary focus-visible:text-txt-primary [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1">
              <ChevronRightIcon
                aria-hidden="true"
                className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
              />
              {t("calendar.ie_help_title")}
            </span>
          </summary>
          <ol className="mt-1.5 flex list-decimal flex-col gap-1 ps-9 leading-relaxed">
            <li>{t("calendar.ie_help_step_1")}</li>
            <li>{t("calendar.ie_help_step_2")}</li>
            <li>{t("calendar.ie_help_step_3")}</li>
          </ol>
        </details>
      )}
    </div>
  );
}

function CalendarExportCard({ calendars }: { calendars: DecryptedCalendar[] }) {
  const { t } = use_i18n();
  const [scope, set_scope] = useState(ALL_CALENDARS);
  const [is_busy, set_is_busy] = useState(false);

  const options = [
    { value: ALL_CALENDARS, label: t("calendar.export_all_calendars") },
    ...calendars.map(calendar_option),
  ];

  const handle_export = async () => {
    set_is_busy(true);

    try {
      const selected = calendars.find((calendar) => calendar.id === scope);
      const count = await export_calendar_events(selected ?? null);

      if (count === 0) {
        show_toast(t("calendar.settings_export_empty"), "info");

        return;
      }

      show_toast(t("calendar.settings_export_done", { count }), "success");
    } catch {
      show_toast(t("calendar.settings_export_failed"), "error");
    } finally {
      set_is_busy(false);
    }
  };

  return (
    <IslandSection
      description={t("calendar.ie_export_desc")}
      footer={t("calendar.ie_export_note")}
      icon={<ArrowDownTrayIcon />}
      title={t("calendar.settings_export_title")}
    >
      <IslandRow
        layout="stacked"
        label={
          <span id="calendar_export_scope_label">
            {t("calendar.ie_export_scope")}
          </span>
        }
        trailing={
          <div className="flex w-full min-w-0 items-center gap-2">
            <CalendarSelect
              aria_labelledby="calendar_export_scope_label"
              class_name="min-w-0 flex-1 sm:min-w-[180px]"
              data_testid="calendar_export_scope"
              options={options}
              value={scope}
              on_change={set_scope}
            />
            <Button
              disabled={is_busy || calendars.length === 0}
              is_loading={is_busy}
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => void handle_export()}
            >
              {t("calendar.settings_export_button")}
            </Button>
          </div>
        }
      />
    </IslandSection>
  );
}

function SubscriptionColorButton({
  subscription,
  on_change,
}: {
  subscription: IcsSubscription;
  on_change: (color: string) => void;
}) {
  const { t } = use_i18n();
  const [open, set_open] = useState(false);
  const current = nearest_event_color(subscription_color(subscription));

  return (
    <Popover open={open} onOpenChange={set_open}>
      <PopoverTrigger asChild>
        <button
          aria-label={t("calendar.ie_sub_color_named", {
            name: subscription.name,
          })}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-150 hover:bg-[var(--aster-island-hover,rgba(127,127,127,0.12))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] motion-reduce:transition-none"
          data-subscription-color={current.name}
          title={t("calendar.ie_sub_color")}
          type="button"
        >
          <span
            className="block h-3 w-3 rounded-full"
            style={{ backgroundColor: current.token }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto rounded-[var(--aster-radius-floating)] p-3"
        sideOffset={6}
      >
        <div
          aria-label={t("calendar.ie_sub_color_named", {
            name: subscription.name,
          })}
          className="grid grid-cols-6 gap-2"
          role="radiogroup"
        >
          {EVENT_COLOR_OPTIONS.map((option) => {
            const is_selected = current.name === option.name;

            return (
              <button
                key={option.hex}
                aria-checked={is_selected}
                aria-label={t(option.name_key)}
                className="flex h-7 w-7 items-center justify-center rounded-full transition-[box-shadow] duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2"
                data-subscription-color-option={option.name}
                role="radio"
                style={{
                  backgroundColor: option.token,
                  boxShadow: is_selected
                    ? `0 0 0 2px var(--aster-island-fill), 0 0 0 4px ${option.token}`
                    : "none",
                }}
                title={t(option.name_key)}
                type="button"
                onClick={() => {
                  if (!is_selected) {
                    on_change(option.hex);
                  }
                  set_open(false);
                }}
              >
                {is_selected && (
                  <CheckIcon
                    className="h-4 w-4"
                    strokeWidth={2.5}
                    style={{ color: "var(--calendar_event_text, #ffffff)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CalendarSubscriptionsCard() {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const [name, set_name] = useState("");
  const [url, set_url] = useState("");
  const [show_errors, set_show_errors] = useState(false);
  const [url_touched, set_url_touched] = useState(false);
  const [checking_id, set_checking_id] = useState<string | null>(null);
  const subscriptions: IcsSubscription[] =
    preferences.calendar_ics_subscriptions ?? [];

  const trimmed_url = url.trim();
  const trimmed_name = name.trim();
  const is_duplicate = subscriptions.some(
    (subscription) => subscription.url === trimmed_url,
  );
  const url_error =
    (show_errors || url_touched) && trimmed_url.length > 0
      ? !is_https_url(trimmed_url)
        ? t("calendar.ie_sub_url_error")
        : is_duplicate
          ? t("calendar.ie_sub_duplicate")
          : null
      : show_errors && trimmed_url.length === 0
        ? t("calendar.ie_sub_url_error")
        : null;
  const name_error =
    show_errors && trimmed_name.length === 0
      ? t("calendar.ie_sub_name_error")
      : null;

  const handle_add = () => {
    if (
      trimmed_name.length === 0 ||
      !is_https_url(trimmed_url) ||
      is_duplicate
    ) {
      set_show_errors(true);

      return;
    }

    update_preference("calendar_ics_subscriptions", [
      ...subscriptions,
      {
        color:
          SUBSCRIPTION_COLORS[
            subscriptions.length % SUBSCRIPTION_COLORS.length
          ],
        id: crypto.randomUUID(),
        name: trimmed_name.slice(0, MAX_SUBSCRIPTION_NAME_LENGTH),
        url: trimmed_url,
      },
    ]);
    set_name("");
    set_url("");
    set_show_errors(false);
    set_url_touched(false);
    show_toast(t("calendar.settings_subscription_added"), "success");
  };

  const handle_remove = (subscription: IcsSubscription) => {
    update_preference(
      "calendar_ics_subscriptions",
      subscriptions.filter((entry) => entry.id !== subscription.id),
    );
    show_toast(
      t("calendar.ie_sub_removed", { name: subscription.name }),
      "success",
    );
  };

  const handle_color = (subscription: IcsSubscription, color: string) => {
    update_preference(
      "calendar_ics_subscriptions",
      subscriptions.map((entry) =>
        entry.id === subscription.id ? { ...entry, color } : entry,
      ),
    );
  };

  const handle_refresh = async (subscription: IcsSubscription) => {
    set_checking_id(subscription.id);

    const count = await check_subscription(subscription.url);

    set_checking_id(null);

    if (count === null) {
      show_toast(
        t("calendar.ie_sub_refresh_failed", { name: subscription.name }),
        "error",
      );

      return;
    }

    show_toast(
      t("calendar.ie_sub_refreshed", { name: subscription.name, count }),
      "success",
    );
  };

  return (
    <>
      <IslandSection
        description={t("calendar.settings_group_subscriptions_desc")}
        footer={t("calendar.ie_sub_fetch_note")}
        icon={<GlobeAltIcon />}
        padding="md"
        title={t("calendar.settings_subscriptions")}
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            handle_add();
          }}
        >
          <p className="text-sm leading-relaxed text-txt-muted">
            {t("calendar.settings_subscriptions_desc")}
          </p>
          <FieldBlock
            error={name_error}
            id="calendar_subscription_name"
            label={t("calendar.settings_subscription_name")}
          >
            <Input
              aria-describedby={
                name_error ? "calendar_subscription_name_error" : undefined
              }
              aria-invalid={name_error ? true : undefined}
              id="calendar_subscription_name"
              maxLength={MAX_SUBSCRIPTION_NAME_LENGTH}
              placeholder={t("calendar.ie_sub_name_placeholder")}
              size="md"
              status={name_error ? "error" : "default"}
              value={name}
              onChange={(event) => set_name(event.target.value)}
            />
          </FieldBlock>
          <FieldBlock
            error={url_error}
            hint={t("calendar.ie_sub_url_hint")}
            id="calendar_subscription_url"
            label={t("calendar.ie_sub_url_label")}
          >
            <Input
              aria-describedby={
                url_error
                  ? "calendar_subscription_url_error"
                  : "calendar_subscription_url_hint"
              }
              aria-invalid={url_error ? true : undefined}
              autoCapitalize="off"
              autoCorrect="off"
              id="calendar_subscription_url"
              inputMode="url"
              maxLength={MAX_SUBSCRIPTION_URL_LENGTH}
              placeholder={t("calendar.settings_subscription_url_placeholder")}
              size="md"
              spellCheck={false}
              status={url_error ? "error" : "default"}
              type="url"
              value={url}
              onBlur={() => set_url_touched(true)}
              onChange={(event) => set_url(event.target.value)}
            />
          </FieldBlock>
          <div className="flex justify-end">
            <Button size="md" type="submit" variant="primary">
              {t("calendar.settings_subscription_add")}
            </Button>
          </div>
        </form>
      </IslandSection>

      <IslandSection divided title={t("calendar.ie_sub_list_title")}>
        {subscriptions.length === 0 ? (
          <IslandRow
            description={t("calendar.ie_sub_empty_desc")}
            label={t("calendar.ie_sub_empty")}
          />
        ) : (
          subscriptions.map((subscription) => (
            <IslandRow
              key={subscription.id}
              description={
                <span className="block truncate" title={subscription.url}>
                  {subscription.url}
                </span>
              }
              icon={
                <SubscriptionColorButton
                  on_change={(color) => handle_color(subscription, color)}
                  subscription={subscription}
                />
              }
              label={subscription.name}
              trailing={
                <div className="flex items-center gap-1">
                  <Button
                    aria-label={t("calendar.ie_sub_refresh_named", {
                      name: subscription.name,
                    })}
                    className="h-8 w-8 rounded-full"
                    disabled={checking_id === subscription.id}
                    size="icon"
                    title={t("calendar.ie_sub_refresh")}
                    type="button"
                    variant="ghost"
                    onClick={() => void handle_refresh(subscription)}
                  >
                    <ArrowPathIcon
                      className={`h-4 w-4 ${
                        checking_id === subscription.id ? "animate-spin" : ""
                      }`}
                    />
                  </Button>
                  <Button
                    aria-label={t("calendar.ie_sub_remove_named", {
                      name: subscription.name,
                    })}
                    className="h-8 w-8 rounded-full"
                    size="icon"
                    title={t("calendar.ie_sub_remove")}
                    type="button"
                    variant="ghost"
                    onClick={() => handle_remove(subscription)}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              }
            />
          ))
        )}
      </IslandSection>
    </>
  );
}

export function CalendarImportExportSection() {
  const [calendars, set_calendars] = useState<DecryptedCalendar[]>([]);
  const [default_calendar_id, set_default_calendar_id] = useState("");

  useEffect(() => {
    let cancelled = false;

    list_calendars()
      .then((result) => {
        if (cancelled) {
          return;
        }

        set_calendars(result.data);

        const preferred =
          result.data.find((entry) => entry.is_default) ?? result.data[0];

        if (preferred) {
          set_default_calendar_id(preferred.id);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <IslandSections>
      <CalendarImportCard
        calendars={calendars}
        default_calendar_id={default_calendar_id}
      />
      <CalendarExportCard calendars={calendars} />
      <CalendarSubscriptionsCard />
    </IslandSections>
  );
}
