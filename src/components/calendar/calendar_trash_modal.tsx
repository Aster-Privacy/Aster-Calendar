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
import type { CalendarTrashEntry } from "@/services/calendar/trash";
import type { DecryptedCalendar } from "@/types/calendar";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import type {
  TrashGroup,
  TrashSection,
  TrashSortKey,
} from "@/components/calendar/trash_view";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Button,
  Checkbox,
  IslandIconButton,
  Tooltip,
  is_composing,
} from "@aster/ui";
import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  ArrowsUpDownIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { CalendarEmptyState } from "@/components/calendar/calendar_empty_state";
import { CalendarSelect } from "@/components/calendar/calendar_select";
import {
  EmptyTrashIllustration,
  NoResultsIllustration,
} from "@/components/calendar/illustrations/calendar_illustrations";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { show_toast } from "@/components/toast/simple_toast";
import { show_action_toast } from "@/components/toast/action_toast";
import { clear_undo, register_undo } from "@/services/calendar/undo_stack";
import { event_color_token } from "@/components/calendar/calendar_utils";
import { describe_recurrence } from "@/components/calendar/recurrence_field";
import {
  TRASH_ALL_CALENDARS,
  TRASH_SORT_KEYS,
  build_trash_sections,
  filter_trash_entries,
  group_days_left,
  prune_trash_selection,
  trash_days_left,
  trash_expires_soon,
  trash_group_is_series,
  trash_group_span,
} from "@/components/calendar/trash_view";
import { app_hour12, get_display_time_zone } from "@/utils/date_format";
import { use_should_reduce_motion } from "@/provider";

type TranslateFn = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

interface CalendarTrashModalProps {
  t: TranslateFn;
  language: string;
  is_open: boolean;
  entries: CalendarTrashEntry[];
  calendar_by_id: Map<string, DecryptedCalendar>;
  on_restore: (entry_ids: string[]) => Promise<number>;
  on_delete_forever: (entry_ids: string[]) => Promise<number>;
  on_undo_delete_forever?: (entry_ids: string[]) => void;
  on_close: () => void;
}

interface PendingDelete {
  ids: string[];
  is_empty_trash: boolean;
  from_list: boolean;
}

type RangeFormatter = Intl.DateTimeFormat & {
  formatRange?: (start: Date, end: Date) => string;
};

interface TrashFormatters {
  day: RangeFormatter;
  day_with_year: RangeFormatter;
  time: RangeFormatter;
  day_time: RangeFormatter;
  section_day: Intl.DateTimeFormat;
  section_month: Intl.DateTimeFormat;
}

type TrashRow =
  | {
      key: string;
      kind: "entry";
      entry: CalendarTrashEntry;
      parent_key: string | null;
    }
  | {
      key: string;
      kind: "group";
      group: TrashGroup;
    };

interface TopRow {
  row: TrashRow;
  children: TrashRow[];
}

const MOTION_EASE = [0.2, 0, 0, 1] as const;

const SORT_LABEL_KEYS: Record<TrashSortKey, TranslationKey> = {
  deleted: "calendar.trash_sort_deleted",
  event_date: "calendar.trash_sort_event_date",
  title: "calendar.trash_sort_title",
};

const DANGER_TEXT = "!text-[var(--color-danger,#ef4444)]";

function valid_date(value: string): Date | null {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function row_ids(row: TrashRow): string[] {
  return row.kind === "group"
    ? row.group.entries.map((entry) => entry.id)
    : [row.entry.id];
}

function format_range(
  formatter: RangeFormatter,
  start: Date,
  end: Date,
): string {
  if (typeof formatter.formatRange === "function") {
    return formatter.formatRange(start, end);
  }

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function same_local_day(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function CalendarTrashModal({
  t,
  language,
  is_open,
  entries,
  calendar_by_id,
  on_restore,
  on_delete_forever,
  on_undo_delete_forever,
  on_close,
}: CalendarTrashModalProps) {
  const reduce_motion = use_should_reduce_motion();
  const heading_id = useId();
  const hint_id = useId();
  const list_id = useId();
  const dialog_ref = useRef<HTMLDivElement | null>(null);
  const search_ref = useRef<HTMLInputElement | null>(null);
  const row_refs = useRef(new Map<string, HTMLDivElement>());
  const list_has_focus_ref = useRef(false);
  const last_active_index_ref = useRef(0);

  const [query, set_query] = useState("");
  const [calendar_filter, set_calendar_filter] = useState(TRASH_ALL_CALENDARS);
  const [sort, set_sort] = useState<TrashSortKey>("deleted");
  const [selected, set_selected] = useState<Set<string>>(() => new Set());
  const [expanded, set_expanded] = useState<Set<string>>(() => new Set());
  const [active_key, set_active_key] = useState<string | null>(null);
  const [pending_delete, set_pending_delete] = useState<PendingDelete | null>(
    null,
  );
  const [busy_ids, set_busy_ids] = useState<Set<string>>(() => new Set());
  const busy_ref = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (is_open) {
      return;
    }

    set_query("");
    set_calendar_filter(TRASH_ALL_CALENDARS);
    set_sort("deleted");
    set_selected(new Set());
    set_expanded(new Set());
    set_active_key(null);
    set_pending_delete(null);
    list_has_focus_ref.current = false;
  }, [is_open]);

  const collator = useMemo(
    () => new Intl.Collator(language, { numeric: true, sensitivity: "base" }),
    [language],
  );

  const formatters = useMemo<TrashFormatters>(() => {
    const time_zone = get_display_time_zone();

    return {
      day: new Intl.DateTimeFormat(language, {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: time_zone,
      }),
      day_with_year: new Intl.DateTimeFormat(language, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: time_zone,
      }),
      time: new Intl.DateTimeFormat(language, {
        hour: "numeric",
        minute: "2-digit",
        hour12: app_hour12(),
        timeZone: time_zone,
      }),
      day_time: new Intl.DateTimeFormat(language, {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: app_hour12(),
        timeZone: time_zone,
      }),
      section_day: new Intl.DateTimeFormat(language, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
      section_month: new Intl.DateTimeFormat(language, {
        month: "long",
        year: "numeric",
      }),
    };
  }, [language]);

  const calendar_name = useCallback(
    (calendar_id: string) => calendar_by_id.get(calendar_id)?.name ?? "",
    [calendar_by_id],
  );

  const trash_calendars = useMemo(() => {
    const ids = new Set(entries.map((entry) => entry.draft.calendar_id));

    return [...ids]
      .map((id) => ({ id, name: calendar_name(id) }))
      .filter((calendar) => calendar.name)
      .sort((left, right) => collator.compare(left.name, right.name));
  }, [calendar_name, collator, entries]);

  useEffect(() => {
    if (
      calendar_filter !== TRASH_ALL_CALENDARS &&
      !trash_calendars.some((calendar) => calendar.id === calendar_filter)
    ) {
      set_calendar_filter(TRASH_ALL_CALENDARS);
    }
  }, [calendar_filter, trash_calendars]);

  const filtered = useMemo(
    () =>
      filter_trash_entries(
        entries,
        { query, calendar_id: calendar_filter },
        calendar_name,
      ),
    [calendar_filter, calendar_name, entries, query],
  );

  const sections = useMemo<TrashSection[]>(
    () => build_trash_sections(filtered, sort, collator),
    [collator, filtered, sort],
  );

  const section_rows = useMemo(
    () =>
      sections.map((section) =>
        section.groups.map<TopRow>((group) => {
          if (group.entries.length === 1) {
            return {
              row: {
                key: `e:${group.entries[0].id}`,
                kind: "entry",
                entry: group.entries[0],
                parent_key: null,
              },
              children: [],
            };
          }

          const group_key = `g:${group.key}`;

          return {
            row: { key: group_key, kind: "group", group },
            children: expanded.has(group_key)
              ? group.entries.map<TrashRow>((entry) => ({
                  key: `e:${entry.id}`,
                  kind: "entry",
                  entry,
                  parent_key: group_key,
                }))
              : [],
          };
        }),
      ),
    [expanded, sections],
  );

  const flat_rows = useMemo(
    () =>
      section_rows.flatMap((rows) =>
        rows.flatMap((top) => [top.row, ...top.children]),
      ),
    [section_rows],
  );

  const row_index = useMemo(
    () => new Map(flat_rows.map((row, index) => [row.key, index])),
    [flat_rows],
  );

  const current_active_key =
    active_key !== null && row_index.has(active_key)
      ? active_key
      : (flat_rows[
          Math.min(last_active_index_ref.current, flat_rows.length - 1)
        ]?.key ?? null);

  useEffect(() => {
    if (current_active_key !== null) {
      last_active_index_ref.current = row_index.get(current_active_key) ?? 0;
    }
  }, [current_active_key, row_index]);

  useEffect(() => {
    if (!is_open || pending_delete || !list_has_focus_ref.current) {
      return;
    }

    const focused = document.activeElement;

    if (focused && focused !== document.body) {
      return;
    }

    if (current_active_key !== null) {
      row_refs.current.get(current_active_key)?.focus();
    } else {
      list_has_focus_ref.current = false;
      dialog_ref.current?.focus();
    }
  }, [current_active_key, flat_rows, is_open, pending_delete]);

  const visible_ids = useMemo(
    () => new Set(filtered.map((entry) => entry.id)),
    [filtered],
  );

  const effective_selected = useMemo(
    () => prune_trash_selection(selected, visible_ids),
    [selected, visible_ids],
  );

  const selected_count = effective_selected.size;
  const selection_mode = selected_count > 0;
  const all_selected =
    filtered.length > 0 && selected_count === filtered.length;
  const is_filtering =
    query.trim().length > 0 || calendar_filter !== TRASH_ALL_CALENDARS;

  const set_selection = useCallback((ids: string[], value: boolean) => {
    set_selected((current) => {
      const next = new Set(current);

      for (const id of ids) {
        if (value) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }

      return next;
    });
  }, []);

  const toggle_selection = useCallback(
    (ids: string[]) => {
      set_selection(ids, !ids.every((id) => effective_selected.has(id)));
    },
    [effective_selected, set_selection],
  );

  const select_all = useCallback(
    (value: boolean) => {
      set_selected(value ? new Set(visible_ids) : new Set());
    },
    [visible_ids],
  );

  const set_group_expanded = (key: string, value: boolean) => {
    set_expanded((current) => {
      const next = new Set(current);

      if (value) {
        next.add(key);
      } else {
        next.delete(key);
      }

      return next;
    });
  };

  const run_action = useCallback(
    async (requested: string[], kind: "restore" | "delete") => {
      const ids = requested.filter((id) => !busy_ref.current.has(id));

      if (ids.length === 0) {
        return;
      }

      for (const id of ids) {
        busy_ref.current.add(id);
      }
      set_busy_ids((current) => new Set([...current, ...ids]));

      try {
        const done =
          kind === "restore"
            ? await on_restore(ids)
            : await on_delete_forever(ids);

        if (done < ids.length) {
          show_toast(t("calendar.trash_partial_failed"), "error");
        } else if (kind === "restore") {
          show_toast(
            t("calendar.trash_restored_count", { count: done }),
            "success",
          );
        } else if (on_undo_delete_forever) {
          const undo = async () => {
            clear_undo();
            on_undo_delete_forever(ids);
          };

          register_undo(undo);
          show_action_toast({
            action_type: "trash",
            email_ids: [],
            message: t("calendar.trash_deleted_count", { count: done }),
            on_undo: undo,
          });
        } else {
          show_toast(
            t("calendar.trash_deleted_count", { count: done }),
            "success",
          );
        }

        set_selection(ids, false);
      } catch {
        show_toast(t("calendar.trash_partial_failed"), "error");
      } finally {
        for (const id of ids) {
          busy_ref.current.delete(id);
        }
        set_busy_ids((current) => {
          const next = new Set(current);

          for (const id of ids) {
            next.delete(id);
          }

          return next;
        });
      }
    },
    [on_delete_forever, on_restore, on_undo_delete_forever, set_selection, t],
  );

  const request_delete = (ids: string[], from_list: boolean) => {
    if (ids.length === 0) {
      return;
    }

    set_pending_delete({ ids, is_empty_trash: false, from_list });
  };

  const request_empty = () => {
    if (entries.length === 0) {
      return;
    }

    set_pending_delete({
      ids: entries.map((entry) => entry.id),
      is_empty_trash: true,
      from_list: false,
    });
  };

  const close_confirmation = () => {
    list_has_focus_ref.current = pending_delete?.from_list ?? false;
    set_pending_delete(null);
  };

  const pending_delete_ref = useRef(pending_delete);

  pending_delete_ref.current = pending_delete;

  const selected_count_ref = useRef(selected_count);

  selected_count_ref.current = selected_count;

  const query_ref = useRef(query);

  query_ref.current = query;

  useEffect(() => {
    if (!is_open) {
      return;
    }

    dialog_ref.current?.focus();

    const handle_key = (event: KeyboardEvent) => {
      if (pending_delete_ref.current || event.key !== "Escape") {
        return;
      }

      const target = event.target;
      const in_dialog =
        target === document.body ||
        (target instanceof Node && dialog_ref.current?.contains(target));

      if (!in_dialog) {
        return;
      }

      if (target === search_ref.current && query_ref.current) {
        return;
      }

      event.stopPropagation();

      if (selected_count_ref.current > 0) {
        set_selected(new Set());

        return;
      }

      on_close();
    };

    window.addEventListener("keydown", handle_key, true);

    return () => window.removeEventListener("keydown", handle_key, true);
  }, [is_open, on_close]);

  const focus_row = (key: string | undefined) => {
    if (!key) {
      return;
    }

    set_active_key(key);
    row_refs.current.get(key)?.focus();
  };

  const action_ids_for = (row: TrashRow) => {
    const ids = row_ids(row);

    if (selection_mode && ids.some((id) => effective_selected.has(id))) {
      return [...effective_selected];
    }

    return ids;
  };

  const handle_row_key_down = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    row: TrashRow,
  ) => {
    if (
      event.target !== event.currentTarget ||
      is_composing(event.nativeEvent)
    ) {
      return;
    }

    const index = row_index.get(row.key) ?? 0;
    const is_group = row.kind === "group";
    const is_expanded = is_group && expanded.has(row.key);
    let handled = true;

    switch (event.key) {
      case "ArrowDown":
        focus_row(flat_rows[Math.min(index + 1, flat_rows.length - 1)]?.key);
        break;
      case "ArrowUp":
        if (index === 0) {
          search_ref.current?.focus();
        } else {
          focus_row(flat_rows[index - 1]?.key);
        }
        break;
      case "Home":
        focus_row(flat_rows[0]?.key);
        break;
      case "End":
        focus_row(flat_rows[flat_rows.length - 1]?.key);
        break;
      case "ArrowRight":
        if (is_group && !is_expanded) {
          set_group_expanded(row.key, true);
        } else if (is_group) {
          focus_row(flat_rows[index + 1]?.key);
        }
        break;
      case "ArrowLeft":
        if (is_group && is_expanded) {
          set_group_expanded(row.key, false);
        } else if (row.kind === "entry" && row.parent_key) {
          focus_row(row.parent_key);
        }
        break;
      case " ":
        toggle_selection(row_ids(row));
        break;
      case "Enter":
        void run_action(action_ids_for(row), "restore");
        break;
      case "Delete":
      case "Backspace":
        request_delete(action_ids_for(row), true);
        break;
      default:
        handled = false;
    }

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handle_dialog_key_down = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (pending_delete || is_composing(event.nativeEvent)) {
      return;
    }

    const target = event.target;

    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT")
    ) {
      return;
    }

    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "a" &&
      filtered.length > 0
    ) {
      event.preventDefault();
      select_all(true);

      return;
    }

    if (event.key === "/" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      search_ref.current?.focus();
    }
  };

  const current_year = new Date().getFullYear();

  const entry_title = (entry: CalendarTrashEntry) =>
    entry.draft.title.trim() || t("calendar.untitled_event");

  const calendar_color = (calendar_id: string) =>
    event_color_token(calendar_by_id.get(calendar_id)?.color);

  const day_formatter = (date: Date) =>
    date.getFullYear() === current_year
      ? formatters.day
      : formatters.day_with_year;

  const event_when = (entry: CalendarTrashEntry) => {
    const starts = valid_date(entry.draft.starts_at);

    if (!starts) {
      return "";
    }

    const ends = valid_date(entry.draft.ends_at);
    const day = day_formatter(starts);

    if (entry.draft.is_all_day) {
      const last_day =
        ends && ends.getTime() - starts.getTime() > 86_400_000
          ? new Date(ends.getTime() - 1)
          : null;
      const date_text =
        last_day && !same_local_day(starts, last_day)
          ? format_range(day, starts, last_day)
          : day.format(starts);

      return `${date_text} · ${t("calendar.all_day")}`;
    }

    if (!ends || ends.getTime() <= starts.getTime()) {
      return `${day.format(starts)} · ${formatters.time.format(starts)}`;
    }

    if (same_local_day(starts, ends)) {
      return `${day.format(starts)} · ${format_range(formatters.time, starts, ends)}`;
    }

    return format_range(formatters.day_time, starts, ends);
  };

  const repeat_text = (entry: CalendarTrashEntry): string | null => {
    const rule = entry.draft.recurrence;

    if (rule) {
      const starts = valid_date(entry.draft.starts_at) ?? new Date();

      try {
        return describe_recurrence(rule, starts, language, t);
      } catch {
        return t("calendar.recurring_event");
      }
    }

    return entry.draft.recurrence_id ? t("calendar.recurring_event") : null;
  };

  const group_span_text = (group: TrashGroup) => {
    const span = trash_group_span(group);

    if (!span.first || !span.last) {
      return "";
    }

    const first = day_formatter(span.first).format(span.first);

    if (same_local_day(span.first, span.last)) {
      return first;
    }

    return t("calendar.trash_date_span", {
      first,
      last: day_formatter(span.last).format(span.last),
    });
  };

  const section_label = (section: TrashSection) => {
    if (section.kind === "today") {
      return t("calendar.trash_deleted_today");
    }

    if (section.kind === "yesterday") {
      return t("calendar.trash_deleted_yesterday");
    }

    if (section.kind === "day" && section.date) {
      return t("calendar.trash_deleted_on", {
        date: formatters.section_day.format(section.date),
      });
    }

    if (section.kind === "month" && section.date) {
      return formatters.section_month.format(section.date);
    }

    return null;
  };

  const row_motion = {
    initial: reduce_motion ? false : { opacity: 0, height: 0 },
    animate: { opacity: 1, height: "auto" },
    exit: reduce_motion
      ? { opacity: 0, height: 0, transition: { duration: 0 } }
      : { opacity: 0, height: 0 },
    transition: { duration: reduce_motion ? 0 : 0.2, ease: MOTION_EASE },
  } as const;

  const render_expiry = (days: number, expiry_id: string) => {
    const soon = trash_expires_soon(days);

    return (
      <span
        className={
          soon
            ? "whitespace-nowrap font-medium text-[var(--color-warning,#f59e0b)]"
            : "whitespace-nowrap"
        }
        id={expiry_id}
      >
        {t("calendar.trash_deletes_in", { count: Math.max(1, days) })}
      </span>
    );
  };

  const render_actions = (
    row: TrashRow,
    busy: boolean,
    title: string,
  ): ReactNode => {
    const is_group = row.kind === "group";
    const restore_label = is_group
      ? t("calendar.trash_restore_all")
      : t("calendar.trash_restore");
    const delete_label = is_group
      ? t("calendar.trash_delete_all_forever")
      : t("calendar.trash_delete_forever");

    return (
      <span className="flex shrink-0 items-center gap-1">
        <Tooltip tip={restore_label}>
          <Button
            aria-label={`${restore_label}: ${title}`}
            className="gap-1.5 !px-2.5 sm:!px-3"
            data-testid="calendar-trash-row-restore"
            disabled={busy}
            size="sm"
            tabIndex={-1}
            type="button"
            variant="outline"
            onClick={(click) => {
              click.stopPropagation();
              void run_action(row_ids(row), "restore");
            }}
          >
            <ArrowUturnLeftIcon
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0"
              strokeWidth={2}
            />
            <span className="hidden sm:inline">{restore_label}</span>
          </Button>
        </Tooltip>
        <Tooltip tip={delete_label}>
          <IslandIconButton
            className="text-txt-muted hover:!text-[var(--color-danger,#ef4444)]"
            data-testid="calendar-trash-row-delete"
            disabled={busy}
            label={`${delete_label}: ${title}`}
            size="sm"
            tabIndex={-1}
            onClick={(click) => {
              click.stopPropagation();
              request_delete(row_ids(row), false);
            }}
          >
            <TrashIcon className="h-4 w-4" strokeWidth={1.75} />
          </IslandIconButton>
        </Tooltip>
      </span>
    );
  };

  const render_check = (ids: string[], busy: boolean): ReactNode => {
    const picked = ids.filter((id) => effective_selected.has(id)).length;

    return (
      <span
        className="flex w-5 shrink-0 items-center justify-center"
        onClick={(click) => click.stopPropagation()}
      >
        <Checkbox
          aria-label={t("calendar.trash_select")}
          checked={picked === ids.length}
          disabled={busy}
          indeterminate={picked > 0 && picked < ids.length}
          tabIndex={-1}
          onCheckedChange={() => toggle_selection(ids)}
        />
      </span>
    );
  };

  const render_row = (row: TrashRow) => {
    const index = row_index.get(row.key) ?? 0;
    const ids = row_ids(row);
    const busy = ids.some((id) => busy_ids.has(id));
    const is_selected = ids.every((id) => effective_selected.has(id));
    const is_nested = row.kind === "entry" && row.parent_key !== null;
    const is_group = row.kind === "group";
    const is_expanded = is_group && expanded.has(row.key);
    const lead = row.kind === "group" ? row.group.entries[0] : row.entry;
    const days =
      row.kind === "group"
        ? group_days_left(row.group)
        : trash_days_left(row.entry.deleted_at);
    const title_id = `${list_id}-title-${index}`;
    const meta_id = `${list_id}-meta-${index}`;
    const expiry_id = `${list_id}-expiry-${index}`;
    const color = calendar_color(lead.draft.calendar_id);
    const name = calendar_name(lead.draft.calendar_id);
    const title = entry_title(lead);
    const repeats = row.kind === "entry" ? repeat_text(row.entry) : null;
    const is_series = row.kind === "group" && trash_group_is_series(row.group);

    let body: ReactNode;

    if (is_nested) {
      body = (
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className="line-clamp-2 sm:truncate text-[13.5px] leading-5 text-txt-primary"
            id={title_id}
          >
            {event_when(lead)}
          </span>
          <span
            className="truncate text-[12px] leading-[18px] text-txt-muted"
            id={meta_id}
          >
            {render_expiry(days, expiry_id)}
          </span>
        </span>
      );
    } else if (row.kind === "group") {
      body = (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="truncate text-[14.5px] font-semibold leading-5 text-txt-primary"
              id={title_id}
            >
              {title}
            </span>
            <span
              aria-hidden="true"
              className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full ps-2 pe-1 text-[11.5px] font-medium tabular-nums text-txt-secondary shadow-[inset_0_0_0_1px_var(--aster-floating-divider)]"
            >
              {ids.length}
              <motion.span
                animate={{ rotate: is_expanded ? 180 : 0 }}
                className="flex"
                transition={{
                  duration: reduce_motion ? 0 : 0.18,
                  ease: MOTION_EASE,
                }}
              >
                <ChevronDownIcon className="h-3 w-3" strokeWidth={2.25} />
              </motion.span>
            </span>
          </span>
          <span
            className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-txt-secondary"
            id={meta_id}
          >
            {is_series && (
              <ArrowPathIcon
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-txt-muted"
                strokeWidth={2}
              />
            )}
            <span className="truncate">
              {is_series
                ? t("calendar.trash_series_summary", { count: ids.length })
                : t("calendar.trash_same_name_summary", { count: ids.length })}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] leading-[18px] text-txt-muted">
            <span className="truncate">
              {[group_span_text(row.group), name].filter(Boolean).join(" · ")}
            </span>
            <span aria-hidden="true">·</span>
            {render_expiry(days, expiry_id)}
          </span>
        </span>
      );
    } else {
      body = (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="truncate text-[14.5px] font-semibold leading-5 text-txt-primary"
              id={title_id}
            >
              {title}
            </span>
            {repeats && (
              <ArrowPathIcon
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-txt-muted"
                strokeWidth={2}
              />
            )}
          </span>
          <span
            className="mt-0.5 line-clamp-2 sm:truncate text-[13px] leading-5 text-txt-secondary"
            id={meta_id}
          >
            {event_when(lead)}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] leading-[18px] text-txt-muted">
            <span className="truncate">
              {[name, repeats].filter(Boolean).join(" · ")}
            </span>
            {(name || repeats) && <span aria-hidden="true">·</span>}
            {render_expiry(days, expiry_id)}
          </span>
        </span>
      );
    }

    return (
      <div
        ref={(node) => {
          if (node) {
            row_refs.current.set(row.key, node);
          } else {
            row_refs.current.delete(row.key);
          }
        }}
        aria-describedby={is_nested ? expiry_id : `${meta_id} ${expiry_id}`}
        aria-expanded={is_group ? is_expanded : undefined}
        aria-labelledby={title_id}
        aria-level={is_nested ? 2 : 1}
        aria-selected={is_selected}
        className={`group/row flex cursor-default items-center gap-3 px-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-color)] ${is_nested ? "min-h-12 py-1.5" : "min-h-[68px] py-2.5"} ${is_selected ? "bg-[var(--aster-selected)]" : "hover:bg-[var(--aster-hover)]"} ${busy ? "opacity-60" : ""}`}
        data-testid={is_group ? "calendar-trash-group" : "calendar-trash-row"}
        role="treeitem"
        tabIndex={row.key === current_active_key ? 0 : -1}
        onClick={() => {
          if (is_group) {
            set_group_expanded(row.key, !is_expanded);
          } else {
            toggle_selection(ids);
          }
        }}
        onFocus={() => set_active_key(row.key)}
        onKeyDown={(key_event) => handle_row_key_down(key_event, row)}
      >
        {render_check(ids, busy)}
        <span
          aria-hidden="true"
          className={`w-1 shrink-0 self-stretch rounded-full ${is_nested ? "opacity-35" : ""}`}
          style={{ backgroundColor: color }}
        />
        {body}
        {render_actions(row, busy, is_nested ? event_when(lead) : title)}
      </div>
    );
  };

  const sort_options = TRASH_SORT_KEYS.map((key) => ({
    value: key,
    label: t(SORT_LABEL_KEYS[key]),
  }));

  const calendar_options = [
    {
      value: TRASH_ALL_CALENDARS,
      label: t("calendar.trash_filter_all_calendars"),
    },
    ...trash_calendars.map((calendar) => ({
      value: calendar.id,
      label: (
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: calendar_color(calendar.id) }}
          />
          <span className="truncate">{calendar.name}</span>
        </span>
      ),
      text: calendar.name,
    })),
  ];

  const pending_count = pending_delete?.ids.length ?? 0;
  const confirm_title = pending_delete?.is_empty_trash
    ? t("calendar.trash_empty_confirm_title")
    : t("calendar.trash_delete_confirm_title", { count: pending_count });
  const confirm_message = pending_delete?.is_empty_trash
    ? t("calendar.trash_empty_confirm_message", { count: pending_count })
    : t("calendar.trash_delete_confirm_message", { count: pending_count });

  const status_text = selection_mode
    ? t("calendar.trash_selected_count", { count: selected_count })
    : is_filtering
      ? t("calendar.trash_matching_count", { count: filtered.length })
      : "";

  const count_text = is_filtering
    ? t("calendar.trash_matching_count", { count: filtered.length })
    : t("calendar.trash_group_count", { count: filtered.length });

  const clear_filters = () => {
    set_query("");
    set_calendar_filter(TRASH_ALL_CALENDARS);
    search_ref.current?.focus();
  };

  const fade = {
    initial: reduce_motion ? false : { opacity: 0, y: 2 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: { duration: reduce_motion ? 0 : 0.14, ease: MOTION_EASE },
  } as const;

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          key="calendar-trash"
          animate={{ opacity: 1 }}
          className="aster_scrim fixed inset-0 z-[60] flex items-center justify-center p-3"
          exit={{ opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          role="presentation"
          transition={{ duration: reduce_motion ? 0 : 0.14, ease: MOTION_EASE }}
          onMouseDown={(mouse_event) => {
            if (
              mouse_event.target === mouse_event.currentTarget &&
              !pending_delete
            ) {
              on_close();
            }
          }}
        >
          <motion.div
            ref={dialog_ref}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-labelledby={heading_id}
            aria-modal="true"
            className="relative flex h-[min(720px,calc(100dvh-24px))] w-full max-w-[640px] flex-col overflow-hidden rounded-[var(--aster-radius-floating,16px)] bg-[var(--aster-dialog-bg,var(--modal-bg))] shadow-[var(--aster-floating-shadow)] outline-none"
            data-calendar-surface=""
            data-testid="calendar-trash-dialog"
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            initial={reduce_motion ? false : { opacity: 0, scale: 0.97, y: 6 }}
            role="dialog"
            tabIndex={-1}
            transition={{
              duration: reduce_motion ? 0 : 0.16,
              ease: MOTION_EASE,
            }}
            onKeyDown={handle_dialog_key_down}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 px-6 pb-4 pt-5">
              <div className="min-w-0">
                <h2
                  className="text-[19px] font-semibold leading-7 text-txt-primary"
                  id={heading_id}
                >
                  {t("calendar.trash_title")}
                </h2>
                <p className="mt-0.5 text-[13px] leading-5 text-txt-muted">
                  {t("calendar.trash_retention_note")}
                </p>
              </div>
              <Tooltip tip={t("common.close")}>
                <IslandIconButton
                  className="-me-2 shrink-0"
                  label={t("common.close")}
                  size="sm"
                  onClick={on_close}
                >
                  <XMarkIcon className="h-5 w-5" strokeWidth={1.75} />
                </IslandIconButton>
              </Tooltip>
            </div>

            <span aria-live="polite" className="sr-only">
              {status_text}
            </span>
            <span className="sr-only" id={hint_id}>
              {t("calendar.trash_keyboard_hint")}
            </span>

            {entries.length > 0 && (
              <div className="flex shrink-0 flex-wrap items-center gap-2 px-5 pb-2">
                <div className="aster_search_field flex h-9 min-w-0 flex-1 basis-full items-center gap-2 rounded-full pe-1 ps-3 sm:basis-0">
                  <MagnifyingGlassIcon
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-txt-muted"
                    strokeWidth={1.75}
                  />
                  <input
                    ref={search_ref}
                    aria-controls={list_id}
                    aria-label={t("calendar.trash_search_label")}
                    autoComplete="off"
                    className="min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-txt-primary outline-none ring-0 placeholder:text-txt-muted [&::-webkit-search-cancel-button]:appearance-none focus:border-0 focus:outline-none focus:ring-0"
                    data-testid="calendar-trash-search"
                    placeholder={t("calendar.trash_search_placeholder")}
                    spellCheck={false}
                    type="search"
                    value={query}
                    onChange={(change) => set_query(change.target.value)}
                    onKeyDown={(key_event) => {
                      if (key_event.key === "Escape" && query) {
                        key_event.preventDefault();
                        key_event.stopPropagation();
                        set_query("");
                      } else if (key_event.key === "ArrowDown") {
                        key_event.preventDefault();
                        focus_row(current_active_key ?? flat_rows[0]?.key);
                      }
                    }}
                  />
                  {query && (
                    <button
                      aria-label={t("common.clear")}
                      className="search_icon_btn rounded-full p-1.5 transition-colors duration-150"
                      type="button"
                      onClick={() => {
                        set_query("");
                        search_ref.current?.focus();
                      }}
                    >
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {trash_calendars.length > 1 && (
                  <CalendarSelect
                    aria_label={t("calendar.trash_filter_label")}
                    class_name="!h-9 max-w-[180px] text-[13px]"
                    content_class_name="z-[70]"
                    data_testid="calendar-trash-calendar-filter"
                    options={calendar_options}
                    value={calendar_filter}
                    on_change={set_calendar_filter}
                  />
                )}
                <CalendarSelect
                  aria_label={t("calendar.trash_sort_label")}
                  class_name="!h-9 text-[13px]"
                  content_class_name="z-[70]"
                  data_testid="calendar-trash-sort"
                  options={sort_options}
                  render_value={(option) => (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ArrowsUpDownIcon
                        aria-hidden="true"
                        className="h-3.5 w-3.5 shrink-0 text-txt-muted"
                        strokeWidth={1.75}
                      />
                      <span className="truncate">{option?.label}</span>
                    </span>
                  )}
                  value={sort}
                  on_change={(value) => set_sort(value as TrashSortKey)}
                />
              </div>
            )}

            {filtered.length > 0 && (
              <div
                className="mx-5 flex min-h-11 shrink-0 items-center gap-3 px-3"
                data-testid="calendar-trash-bulk-bar"
              >
                <span className="flex w-5 shrink-0 items-center justify-center">
                  <Checkbox
                    aria-label={t("calendar.trash_select_all")}
                    checked={all_selected}
                    data-testid="calendar-trash-select-all"
                    indeterminate={selection_mode && !all_selected}
                    onCheckedChange={() => select_all(!all_selected)}
                  />
                </span>
                <AnimatePresence initial={false} mode="wait">
                  {selection_mode ? (
                    <motion.div
                      key="selection"
                      className="flex min-w-0 flex-1 items-center gap-1.5"
                      {...fade}
                    >
                      <span className="ms-1 min-w-0 flex-1 truncate text-[13.5px] font-semibold text-txt-primary">
                        {t("calendar.trash_selected_count", {
                          count: selected_count,
                        })}
                      </span>
                      <Button
                        className="gap-1.5"
                        data-testid="calendar-trash-bulk-restore"
                        disabled={busy_ids.size > 0}
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() =>
                          void run_action([...effective_selected], "restore")
                        }
                      >
                        <ArrowUturnLeftIcon
                          aria-hidden="true"
                          className="h-3.5 w-3.5"
                          strokeWidth={2}
                        />
                        {t("calendar.trash_restore")}
                      </Button>
                      <Button
                        className={`gap-1.5 ${DANGER_TEXT}`}
                        data-testid="calendar-trash-bulk-delete"
                        disabled={busy_ids.size > 0}
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          request_delete([...effective_selected], false)
                        }
                      >
                        <TrashIcon
                          aria-hidden="true"
                          className="h-3.5 w-3.5"
                          strokeWidth={2}
                        />
                        <span className="hidden sm:inline">
                          {t("calendar.trash_delete_forever")}
                        </span>
                      </Button>
                      <Tooltip tip={t("calendar.trash_clear_selection")}>
                        <IslandIconButton
                          label={t("calendar.trash_clear_selection")}
                          size="sm"
                          onClick={() => set_selected(new Set())}
                        >
                          <XMarkIcon className="h-4 w-4" strokeWidth={1.75} />
                        </IslandIconButton>
                      </Tooltip>
                    </motion.div>
                  ) : (
                    <motion.span
                      key="count"
                      className="ms-1 min-w-0 flex-1 truncate text-[13px] text-txt-muted"
                      {...fade}
                    >
                      {count_text}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div
              className="aster_scrollbar_thin min-h-0 flex-1 overflow-y-auto px-5 pb-4"
              id={list_id}
              onBlur={(blur_event) => {
                const next = blur_event.relatedTarget;

                if (
                  next instanceof Node &&
                  !blur_event.currentTarget.contains(next)
                ) {
                  list_has_focus_ref.current = false;
                }
              }}
              onFocus={() => {
                list_has_focus_ref.current = true;
              }}
            >
              {entries.length === 0 && (
                <CalendarEmptyState
                  body={t("calendar.empty_trash_body")}
                  data-testid="calendar-trash-empty"
                  illustration={<EmptyTrashIllustration />}
                  title={t("calendar.empty_trash_title")}
                />
              )}

              {entries.length > 0 && filtered.length === 0 && (
                <CalendarEmptyState
                  compact
                  action={
                    <Button size="sm" variant="outline" onClick={clear_filters}>
                      {t("calendar.trash_clear_filters")}
                    </Button>
                  }
                  body={t("calendar.trash_no_results_body")}
                  data-testid="calendar-trash-no-results"
                  illustration={<NoResultsIllustration />}
                  title={t("calendar.trash_no_results_title")}
                />
              )}

              {sections.map((section, section_index) => {
                const label = section_label(section);
                const label_id = `${list_id}-section-${section_index}`;
                const rows = section_rows[section_index] ?? [];

                return (
                  <section key={section.key} className="pt-4 first:pt-1">
                    {label && (
                      <h3
                        className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wider text-txt-muted"
                        id={label_id}
                      >
                        {label}
                      </h3>
                    )}
                    <ul
                      aria-describedby={hint_id}
                      aria-label={label ? undefined : t("calendar.trash_title")}
                      aria-labelledby={label ? label_id : undefined}
                      aria-multiselectable="true"
                      className="m-0 list-none overflow-hidden rounded-[var(--aster-radius-control,16px)] bg-[var(--aster-field-bg)] p-0"
                      role="tree"
                    >
                      <AnimatePresence initial={false}>
                        {rows.map((top) => (
                          <motion.li
                            key={top.row.key}
                            className="overflow-hidden border-t border-[var(--aster-floating-divider)] first:border-t-0"
                            role="none"
                            {...row_motion}
                          >
                            {render_row(top.row)}
                            {top.row.kind === "group" && (
                              <ul className="m-0 list-none p-0" role="group">
                                <AnimatePresence initial={false}>
                                  {top.children.map((child) => (
                                    <motion.li
                                      key={child.key}
                                      className="overflow-hidden border-t border-[var(--aster-floating-divider)]"
                                      role="none"
                                      {...row_motion}
                                    >
                                      {render_row(child)}
                                    </motion.li>
                                  ))}
                                </AnimatePresence>
                              </ul>
                            )}
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  </section>
                );
              })}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--aster-floating-divider)] px-5 py-3.5">
              {entries.length > 0 ? (
                <Button
                  className={DANGER_TEXT}
                  data-testid="calendar-trash-empty-all"
                  disabled={busy_ids.size > 0}
                  size="md"
                  type="button"
                  variant="ghost"
                  onClick={request_empty}
                >
                  {t("calendar.trash_empty_action")}
                </Button>
              ) : (
                <span />
              )}
              <Button
                size="md"
                type="button"
                variant="depth"
                onClick={on_close}
              >
                {t("common.done")}
              </Button>
            </div>
          </motion.div>

          <ConfirmationModal
            cancel_text={t("common.cancel")}
            confirm_text={
              pending_delete?.is_empty_trash
                ? t("calendar.trash_empty_action")
                : t("calendar.trash_delete_forever")
            }
            is_open={pending_delete !== null}
            message={confirm_message}
            title={confirm_title}
            variant="danger"
            on_cancel={close_confirmation}
            on_confirm={() => {
              const target = pending_delete;

              close_confirmation();

              if (target) {
                void run_action(target.ids, "delete");
              }
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
