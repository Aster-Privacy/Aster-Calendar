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
import type {
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";
import type { SearchResultGroup } from "@/components/calendar/search_query";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  RefObject,
} from "react";

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  SunIcon,
  UserGroupIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { resolve_event_color } from "@/components/calendar/calendar_utils";
import {
  event_result_key,
  group_search_results,
  highlight_segments,
  highlight_terms,
  parse_search_query,
} from "@/components/calendar/search_query";
import { has_open_overlay_layer } from "@/lib/overlay_layer_stack";
import { calendar_now } from "@/services/calendar/view_zone";
import { format_time } from "@/utils/date_format";
import { is_composing } from "@/utils/ime";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { use_should_reduce_motion } from "@/provider";
import {
  read_secure_array,
  write_secure_array,
} from "@/lib/secure_array";

const MAX_RESULTS = 25;
const HISTORY_LIMIT = 20;
const HISTORY_SHOWN = 5;
const PANEL_EASE: [number, number, number, number] = [0.2, 0, 0, 1];

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  bottom: number;
}

interface HistoryEntry {
  id: string;
  query: string;
  timestamp: number;
}

type PanelView =
  | { kind: "idle" }
  | { kind: "empty"; query: string }
  | {
      kind: "results";
      query: string;
      groups: SearchResultGroup[];
      terms: string[];
    };

type NavItem =
  | { kind: "event"; key: string; event: DecryptedCalendarEvent }
  | { kind: "history"; key: string; entry: HistoryEntry };

const IDLE_VIEW: PanelView = { kind: "idle" };

function history_key(user_id: string): string {
  return `aster_calendar_search_history_${user_id}`;
}

async function load_history(user_id: string): Promise<HistoryEntry[]> {
  if (!user_id) {
    return [];
  }

  return (await read_secure_array<HistoryEntry>(history_key(user_id)))
    .filter((entry) => typeof entry?.query === "string")
    .sort((left, right) => right.timestamp - left.timestamp);
}

async function push_history(
  user_id: string,
  query: string,
): Promise<HistoryEntry[] | null> {
  const trimmed = query.trim();

  if (!user_id || trimmed.length === 0) {
    return null;
  }

  const existing = (await load_history(user_id)).filter(
    (entry) => entry.query.toLowerCase() !== trimmed.toLowerCase(),
  );
  const updated = [
    { id: crypto.randomUUID(), query: trimmed, timestamp: Date.now() },
    ...existing,
  ].slice(0, HISTORY_LIMIT);

  await write_secure_array(history_key(user_id), updated);

  return updated;
}

async function save_history(
  user_id: string,
  entries: HistoryEntry[],
): Promise<void> {
  if (!user_id) {
    return;
  }

  await write_secure_array(history_key(user_id), entries);
}

interface CalendarSearchBarProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  language: string;
  query: string;
  applied_query: string;
  is_pending: boolean;
  is_window_loading: boolean;
  results: DecryptedCalendarEvent[];
  calendar_by_id: Map<string, DecryptedCalendar>;
  input_ref: RefObject<HTMLInputElement>;
  time_format: "12h" | "24h";
  on_query_change: (query: string) => void;
  on_result_click: (event: DecryptedCalendarEvent) => void;
  on_prefetch: () => void;
}

export function CalendarSearchBar({
  t,
  language,
  query,
  applied_query,
  is_pending,
  is_window_loading,
  results,
  calendar_by_id,
  input_ref,
  time_format,
  on_query_change,
  on_result_click,
  on_prefetch,
}: CalendarSearchBarProps) {
  const { user } = use_auth();
  const user_id = user?.id ?? "";
  const reduce_motion = use_should_reduce_motion();
  const wrapper_ref = useRef<HTMLDivElement>(null);
  const dropdown_ref = useRef<HTMLDivElement>(null);
  const listbox_id = useId();

  const [is_open, set_is_open] = useState(false);
  const [rect, set_rect] = useState<AnchorRect | null>(null);
  const [active_index, set_active_index] = useState(-1);
  const [history, set_history] = useState<HistoryEntry[]>([]);

  const has_query = query.trim().length > 0;

  const close = useCallback(() => {
    set_is_open(false);
    window.dispatchEvent(new Event("aster:search-closed"));
  }, []);

  const open = useCallback(() => {
    set_is_open(true);
    on_prefetch();
  }, [on_prefetch]);

  useEffect(() => {
    if (!is_open || !user_id) {
      return;
    }

    let cancelled = false;

    load_history(user_id).then((entries) => {
      if (!cancelled) {
        set_history(entries);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [is_open, user_id]);

  const remember = useCallback(
    (value: string) => {
      void push_history(user_id, value).then((entries) => {
        if (entries) {
          set_history(entries);
        }
      });
    },
    [user_id],
  );

  const remove_history_entry = useCallback(
    (entry_id: string) => {
      set_history((current) => {
        const next = current.filter((entry) => entry.id !== entry_id);

        void save_history(user_id, next);

        return next;
      });
      input_ref.current?.focus();
    },
    [input_ref, user_id],
  );

  const clear_history = useCallback(() => {
    set_history([]);
    void save_history(user_id, []);
    input_ref.current?.focus();
  }, [input_ref, user_id]);

  const settled_view = useMemo<PanelView | null>(() => {
    if (applied_query.length === 0) {
      return null;
    }

    const groups = group_search_results(
      results,
      calendar_now().getTime(),
      MAX_RESULTS,
    );

    if (groups.length > 0) {
      return {
        groups,
        kind: "results",
        query: applied_query,
        terms: highlight_terms(parse_search_query(applied_query)),
      };
    }

    if (is_window_loading) {
      return null;
    }

    return { kind: "empty", query: applied_query };
  }, [applied_query, is_window_loading, results]);

  const last_view_ref = useRef<PanelView>(IDLE_VIEW);
  const current_view: PanelView | null = !has_query
    ? IDLE_VIEW
    : is_pending
      ? null
      : settled_view;

  if (current_view) {
    last_view_ref.current = current_view;
  }

  const view = current_view ?? last_view_ref.current;
  const is_stale = current_view === null && view.kind === "results";

  const visible_history = useMemo(
    () => history.slice(0, HISTORY_SHOWN),
    [history],
  );

  const nav_items = useMemo<NavItem[]>(() => {
    if (view.kind === "results") {
      return view.groups.flatMap((group) =>
        group.events.map((event) => ({
          event,
          key: event_result_key(event),
          kind: "event" as const,
        })),
      );
    }

    if (view.kind === "idle") {
      return visible_history.map((entry) => ({
        entry,
        key: `history:${entry.id}`,
        kind: "history" as const,
      }));
    }

    return [];
  }, [view, visible_history]);

  const nav_index_by_key = useMemo(() => {
    const map = new Map<string, number>();

    nav_items.forEach((item, index) => map.set(item.key, index));

    return map;
  }, [nav_items]);

  const view_identity = view.kind === "results" ? `r:${view.query}` : view.kind;

  useEffect(() => {
    set_active_index(view_identity.startsWith("r:") ? 0 : -1);
  }, [view_identity]);

  const append_token = (token: string) => {
    const next = query.includes(token) ? query : `${query} ${token}`.trim();

    on_query_change(next);
    input_ref.current?.focus();
  };

  const open_event = useCallback(
    (event: DecryptedCalendarEvent) => {
      remember(query);
      close();
      input_ref.current?.blur();
      on_result_click(event);
    },
    [close, input_ref, on_result_click, query, remember],
  );

  const activate = (index: number) => {
    const item = nav_items[index];

    if (!item) {
      return;
    }

    if (item.kind === "event") {
      open_event(item.event);

      return;
    }

    on_query_change(item.entry.query);
    input_ref.current?.focus();
  };

  const handle_key_down = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (is_composing(event)) {
      return;
    }

    const count = nav_items.length;

    if (event.key === "ArrowDown") {
      if (!is_open) {
        event.preventDefault();
        open();

        return;
      }

      if (count > 0) {
        event.preventDefault();
        set_active_index((current) => (current + 1) % count);
      }

      return;
    }

    if (event.key === "ArrowUp" && is_open && count > 0) {
      event.preventDefault();
      set_active_index((current) => (current <= 0 ? count - 1 : current - 1));

      return;
    }

    if (event.key === "Enter") {
      if (is_open && active_index >= 0 && active_index < count) {
        event.preventDefault();
        activate(active_index);

        return;
      }

      if (has_query) {
        event.preventDefault();
        remember(query);
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();

      if (is_open) {
        close();

        return;
      }

      if (has_query) {
        on_query_change("");

        return;
      }

      event.currentTarget.blur();
    }
  };

  const handle_panel_key_down = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    input_ref.current?.focus();
    close();
  };

  useLayoutEffect(() => {
    if (!is_open) {
      return;
    }

    const update = () => {
      const element = wrapper_ref.current;

      if (!element) {
        return;
      }

      const bounds = element.getBoundingClientRect();

      set_rect((current) =>
        current &&
        current.bottom === bounds.bottom &&
        current.left === bounds.left &&
        current.top === bounds.top &&
        current.width === bounds.width
          ? current
          : {
              bottom: bounds.bottom,
              left: bounds.left,
              top: bounds.top,
              width: bounds.width,
            },
      );
    };

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [is_open]);

  useEffect(() => {
    if (!is_open) {
      return;
    }

    const on_down = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (!target) {
        return;
      }

      if (wrapper_ref.current?.contains(target)) {
        return;
      }

      if (dropdown_ref.current?.contains(target)) {
        return;
      }

      if (
        target instanceof Element &&
        target.closest("[data-radix-popper-content-wrapper]")
      ) {
        return;
      }

      close();
    };

    window.addEventListener("pointerdown", on_down, true);

    return () => {
      window.removeEventListener("pointerdown", on_down, true);
    };
  }, [is_open, close]);

  useEffect(() => {
    const on_key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (has_open_overlay_layer()) {
          return;
        }

        event.preventDefault();
        input_ref.current?.focus();
        open();
      }
    };

    const on_focus_request = () => {
      input_ref.current?.focus();
      open();
    };

    window.addEventListener("keydown", on_key);
    window.addEventListener("aster-calendar-focus-search", on_focus_request);

    return () => {
      window.removeEventListener("keydown", on_key);
      window.removeEventListener(
        "aster-calendar-focus-search",
        on_focus_request,
      );
    };
  }, [input_ref, open]);

  useEffect(() => {
    if (!is_open || active_index < 0) {
      return;
    }

    dropdown_ref.current
      ?.querySelector('[data-search-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active_index, is_open]);

  const formatters = useMemo(
    () => ({
      group: new Intl.DateTimeFormat(language, {
        day: "numeric",
        month: "short",
        weekday: "short",
      }),
      group_with_year: new Intl.DateTimeFormat(language, {
        day: "numeric",
        month: "short",
        weekday: "short",
        year: "numeric",
      }),
    }),
    [language],
  );

  const group_label = useCallback(
    (group: SearchResultGroup) => {
      const today = calendar_now();
      const today_start = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      ).getTime();
      const offset = Math.round(
        (group.date.getTime() - today_start) / 86_400_000,
      );
      const formatter =
        group.date.getFullYear() === today.getFullYear()
          ? formatters.group
          : formatters.group_with_year;
      const formatted = formatter.format(group.date);

      if (offset === 0) {
        return `${t("common.today")} · ${formatted}`;
      }

      if (offset === 1) {
        return `${t("common.tomorrow")} · ${formatted}`;
      }

      if (offset === -1) {
        return `${t("common.yesterday")} · ${formatted}`;
      }

      return formatted;
    },
    [formatters, t],
  );

  const is_panel_open = is_open && rect !== null;
  const active_item =
    is_panel_open && active_index >= 0 ? nav_items[active_index] : undefined;
  const dropdown_style = rect
    ? {
        left: rect.left,
        position: "fixed" as const,
        top: rect.bottom - 1,
        width: rect.width,
        zIndex: 60,
      }
    : undefined;

  return (
    <>
      <div
        ref={wrapper_ref}
        className="flex-1 relative min-w-0 max-w-[620px]"
        data-onboarding="search-bar"
      >
        <div
          className={`flex items-center transition-colors gap-2 h-10 ps-4 pe-1.5 aster_search_field ${
            is_panel_open
              ? "aster_search_open shadow-lg rounded-t-[22px]"
              : "rounded-full"
          }`}
        >
          <MagnifyingGlassIcon className="text-[var(--text-secondary)] flex-shrink-0 w-5 h-5" />
          <input
            ref={input_ref}
            aria-activedescendant={
              active_item ? `${listbox_id}-${active_index}` : undefined
            }
            aria-autocomplete="list"
            aria-controls={is_panel_open ? listbox_id : undefined}
            aria-expanded={is_panel_open}
            aria-haspopup="listbox"
            aria-label={t("calendar.search_events")}
            autoComplete="off"
            className={`flex-1 min-w-0 bg-transparent outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus:border-0 text-sm truncate ${
              is_open
                ? "text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                : "text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
            }`}
            data-calendar-search-input=""
            placeholder={t("calendar.search_events")}
            role="combobox"
            spellCheck={false}
            style={{ boxShadow: "none", outline: "none" }}
            type="text"
            value={query}
            onChange={(changed) => {
              on_query_change(changed.target.value);

              if (!is_open) {
                open();
              }
            }}
            onFocus={open}
            onKeyDown={handle_key_down}
          />
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {(has_query || is_open) && (
              <button
                aria-label={has_query ? t("common.clear") : t("common.close")}
                className="search_icon_btn p-1.5 rounded-full"
                type="button"
                onClick={() => {
                  if (has_query) {
                    on_query_change("");
                    input_ref.current?.focus();

                    return;
                  }

                  close();
                  input_ref.current?.blur();
                }}
                onMouseDown={(pressed) => pressed.preventDefault()}
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {is_open &&
        rect &&
        createPortal(
          <motion.div
            ref={dropdown_ref}
            animate={{ opacity: 1 }}
            aria-label={t("calendar.search_events")}
            className="overflow-hidden aster_search_open aster_search_open_panel search_panel_top rounded-b-[22px]"
            data-calendar-search-panel=""
            data-calendar-surface=""
            initial={reduce_motion ? false : { opacity: 0 }}
            role="region"
            style={dropdown_style}
            transition={{
              duration: reduce_motion ? 0 : 0.12,
              ease: PANEL_EASE,
            }}
            onKeyDown={handle_panel_key_down}
          >
            <div className="search_divider_b px-4 py-2 flex flex-wrap items-center gap-2">
              <SearchChip
                icon={<UserGroupIcon className="w-3.5 h-3.5" />}
                label={t("calendar.search_with_guests")}
                on_click={() => append_token("guests:")}
              />
              <SearchChip
                icon={<MapPinIcon className="w-3.5 h-3.5" />}
                label={t("calendar.search_with_location")}
                on_click={() => append_token("location:")}
              />
              <SearchChip
                icon={<ArrowPathIcon className="w-3.5 h-3.5" />}
                label={t("calendar.search_recurring")}
                on_click={() => append_token("is:recurring")}
              />
              <SearchChip
                icon={<SunIcon className="w-3.5 h-3.5" />}
                label={t("calendar.search_all_day")}
                on_click={() => append_token("is:allday")}
              />
              <SearchChip
                icon={<CalendarDaysIcon className="w-3.5 h-3.5" />}
                label={t("calendar.search_in_calendar")}
                on_click={() => append_token("calendar:")}
              />
            </div>

            <AnimatedHeight reduce_motion={reduce_motion}>
              {view.kind === "idle" && visible_history.length > 0 && (
                <div className="p-1.5">
                  <div className="flex items-center justify-between px-2.5 pt-1 pb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                      {t("mail.recent_searches")}
                    </span>
                    <button
                      className="search_ghost_btn -me-1 inline-flex items-center h-6 px-2 rounded-full text-xs"
                      type="button"
                      onClick={clear_history}
                      onMouseDown={(pressed) => pressed.preventDefault()}
                    >
                      {t("common.clear_all")}
                    </button>
                  </div>
                  <div
                    aria-label={t("mail.recent_searches")}
                    id={listbox_id}
                    role="listbox"
                  >
                    {visible_history.map((entry) => {
                      const index =
                        nav_index_by_key.get(`history:${entry.id}`) ?? -1;

                      return (
                        <HistoryRow
                          key={entry.id}
                          entry={entry}
                          id={`${listbox_id}-${index}`}
                          is_active={index === active_index}
                          remove_label={t("common.remove")}
                          on_hover={() => set_active_index(index)}
                          on_remove={() => remove_history_entry(entry.id)}
                          on_select={() => activate(index)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {view.kind === "idle" && visible_history.length === 0 && (
                <div className="px-6 py-8 flex flex-col items-center justify-center text-center">
                  <MagnifyingGlassIcon className="w-8 h-8 text-[var(--text-muted)] mb-2" />
                  <p className="text-sm text-[var(--text-secondary)]">
                    {t("calendar.search_hint")}
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                    {t("calendar.search_operator_hint")}
                  </p>
                </div>
              )}

              {view.kind === "empty" && (
                <div className="px-6 py-8 flex flex-col items-center justify-center text-center">
                  <MagnifyingGlassIcon className="w-8 h-8 text-[var(--text-muted)] mb-2" />
                  <p className="text-sm text-[var(--text-muted)] break-words max-w-full">
                    {t("mail.no_results_for", { query: view.query })}
                  </p>
                </div>
              )}

              {view.kind === "results" && (
                <div
                  aria-busy={is_stale}
                  className="transition-opacity duration-150 motion-reduce:transition-none"
                  style={{ opacity: is_stale ? 0.55 : 1 }}
                >
                  <div
                    aria-label={t("calendar.search_results_label")}
                    className="p-1.5 max-h-[420px] overflow-y-auto overscroll-contain"
                    id={listbox_id}
                    role="listbox"
                  >
                    {view.groups.map((group) => {
                      const label = group_label(group);

                      return (
                        <div key={group.key} aria-label={label} role="group">
                          <div className="px-2.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                            {label}
                          </div>
                          {group.events.map((event) => {
                            const key = event_result_key(event);
                            const index = nav_index_by_key.get(key) ?? -1;

                            return (
                              <ResultRow
                                key={key}
                                all_day_label={t("calendar.all_day")}
                                calendar={calendar_by_id.get(event.calendar_id)}
                                event={event}
                                id={`${listbox_id}-${index}`}
                                index={index}
                                is_active={index === active_index}
                                is_past={group.is_past}
                                terms={view.terms}
                                time_format={time_format}
                                untitled_label={t("calendar.untitled_event")}
                                on_hover={set_active_index}
                                on_select={open_event}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </AnimatedHeight>
          </motion.div>,
          document.body,
        )}
    </>
  );
}

function AnimatedHeight({
  children,
  reduce_motion,
}: {
  children: ReactNode;
  reduce_motion: boolean;
}) {
  const inner_ref = useRef<HTMLDivElement>(null);
  const [height, set_height] = useState<number | "auto">("auto");

  useLayoutEffect(() => {
    const element = inner_ref.current;

    if (!element) {
      return;
    }

    set_height(element.offsetHeight);

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      set_height(element.offsetHeight);
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      animate={{ height }}
      initial={false}
      style={{ overflow: "hidden" }}
      transition={{ duration: reduce_motion ? 0 : 0.16, ease: PANEL_EASE }}
    >
      <div ref={inner_ref}>{children}</div>
    </motion.div>
  );
}

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  const segments = useMemo(
    () => highlight_segments(text, terms),
    [text, terms],
  );

  return (
    <>
      {segments.map((segment, index) =>
        segment.is_match ? (
          <span
            key={index}
            className="font-semibold text-[var(--text-primary)]"
          >
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

const ResultRow = memo(function ResultRow({
  event,
  calendar,
  id,
  index,
  is_active,
  is_past,
  terms,
  time_format,
  all_day_label,
  untitled_label,
  on_hover,
  on_select,
}: {
  event: DecryptedCalendarEvent;
  calendar: DecryptedCalendar | undefined;
  id: string;
  index: number;
  is_active: boolean;
  is_past: boolean;
  terms: string[];
  time_format: "12h" | "24h";
  all_day_label: string;
  untitled_label: string;
  on_hover: (index: number) => void;
  on_select: (event: DecryptedCalendarEvent) => void;
}) {
  const color = resolve_event_color(event, calendar?.color);
  const options = { date_format: "MM/DD/YYYY" as const, time_format };
  const time_label = event.is_all_day
    ? all_day_label
    : `${format_time(new Date(event.starts_at), options)} - ${format_time(new Date(event.ends_at), options)}`;
  const secondary = event.location || calendar?.name || "";

  return (
    <div
      aria-selected={is_active}
      className="search_list_row w-full flex items-center gap-3 px-2.5 py-2 rounded-[var(--aster-radius-item,8px)] text-start cursor-pointer"
      data-search-active={is_active ? "true" : undefined}
      id={id}
      role="option"
      tabIndex={-1}
      onClick={() => on_select(event)}
      onMouseDown={(pressed) => pressed.preventDefault()}
      onMouseMove={() => {
        if (!is_active) {
          on_hover(index);
        }
      }}
    >
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color, opacity: is_past ? 0.5 : 1 }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[13px] truncate ${is_past ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}`}
        >
          {event.title ? (
            <Highlighted terms={terms} text={event.title} />
          ) : (
            untitled_label
          )}
        </span>
        {secondary && (
          <span className="block text-[12px] truncate text-[var(--text-muted)]">
            {event.location ? (
              <Highlighted terms={terms} text={secondary} />
            ) : (
              secondary
            )}
          </span>
        )}
      </span>
      <span
        className="flex-shrink-0 text-[12px] text-[var(--text-muted)] tabular-nums"
        dir="ltr"
      >
        {time_label}
      </span>
    </div>
  );
});

function HistoryRow({
  entry,
  id,
  is_active,
  remove_label,
  on_hover,
  on_remove,
  on_select,
}: {
  entry: HistoryEntry;
  id: string;
  is_active: boolean;
  remove_label: string;
  on_hover: () => void;
  on_remove: () => void;
  on_select: () => void;
}) {
  return (
    <div
      aria-selected={is_active}
      className="search_list_row group w-full flex items-center gap-3 px-2.5 py-2 rounded-[var(--aster-radius-item,8px)] text-start cursor-pointer"
      data-search-active={is_active ? "true" : undefined}
      id={id}
      role="option"
      tabIndex={-1}
      onClick={on_select}
      onMouseDown={(pressed) => pressed.preventDefault()}
      onMouseMove={() => {
        if (!is_active) {
          on_hover();
        }
      }}
    >
      <ClockIcon className="w-4 h-4 flex-shrink-0 text-[var(--text-muted)]" />
      <span className="flex-1 min-w-0 truncate text-[13px] text-[var(--text-primary)]">
        {entry.query}
      </span>
      <button
        aria-label={remove_label}
        className={`search_icon_btn p-1 rounded-full flex-shrink-0 ${is_active ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
        type="button"
        onClick={(clicked) => {
          clicked.stopPropagation();
          on_remove();
        }}
      >
        <XMarkIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function SearchChip({
  icon,
  label,
  on_click,
}: {
  icon: ReactNode;
  label: string;
  on_click: () => void;
}) {
  return (
    <button
      className="search_pill inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs"
      type="button"
      onClick={on_click}
      onMouseDown={(pressed) => pressed.preventDefault()}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
