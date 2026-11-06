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
import type { SettingsSection } from "@/components/settings/settings_content";
import type { IcsSubscription } from "@/services/calendar/subscriptions";
import type {
  CalendarTag,
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  EllipsisHorizontalIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilIcon,
  StarIcon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  SidebarAsideView,
  SidebarCloseButton,
  SidebarNavRow,
  SidebarRailOpenButton,
  SidebarRailSectionButton,
  SidebarScrollAreaView,
  SidebarSectionAddButton,
  SidebarSectionToggle,
  SidebarTagRow,
  SidebarTopBarView,
} from "@aster/ui";

import { CalendarEmptyState } from "@/components/calendar/calendar_empty_state";
import { NoCalendarsIllustration } from "@/components/calendar/illustrations/calendar_illustrations";

import {
  add_months,
  build_month_grid,
  grid_contains_day,
  is_same_day,
  event_color_token,
  EVENT_COLOR_OPTIONS,
  nearest_event_color,
} from "@/components/calendar/calendar_utils";
import { calendar_now } from "@/services/calendar/view_zone";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context_menu";
import { show_toast } from "@/components/toast/simple_toast";
import { update_calendar } from "@/services/api/calendar";
import {
  CalendarClearDialog,
  CalendarDeleteDialog,
  CalendarEditDialog,
} from "@/components/calendar/calendar_edit_dialog";
import { CalendarWorldClock } from "@/components/calendar/calendar_world_clock";
import { RailTipLayer } from "@/components/layout/sidebar/rail_tip_layer";
import { SidebarAccountSwitcher } from "@/components/layout/sidebar/sidebar_account_switcher";
import { UpNextCard } from "@/components/calendar/up_next_card";
import { use_preferences } from "@/contexts/preferences_context";
import { BIRTHDAY_COLOR } from "@/services/calendar/birthdays";
import { subscription_color } from "@/services/calendar/subscriptions";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import {
  cache_sidebar_state,
  get_cached_sidebar_state,
} from "@/services/api/preferences";

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 360;
const SIDEBAR_DEFAULT_WIDTH = 256;
const CALENDARS_COLLAPSED_KEY = "calendar_sidebar_calendars_collapsed";
const LABELS_COLLAPSED_KEY = "calendar_sidebar_labels_collapsed";
const SUBSCRIPTIONS_COLLAPSED_KEY = "calendar_sidebar_subscriptions_collapsed";

type ShowOnlyTarget =
  | { kind: "calendar"; id: string }
  | { kind: "subscription"; id: string }
  | { kind: "birthdays" };

const DESTRUCTIVE_MENU_CLASS =
  "text-[var(--color-danger)] focus:!bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] focus:text-[var(--color-danger)]";
const focus_ring =
  "focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-0";

interface CalendarSidebarProps {
  anchor_date: Date;
  selected_date: Date;
  visible_range: { start: Date; end: Date } | null;
  week_start_day: number;
  calendars: DecryptedCalendar[];
  events: DecryptedCalendarEvent[];
  is_mobile_open: boolean;
  on_mobile_toggle: () => void;
  on_create: () => void;
  on_create_task: () => void;
  on_create_in_calendar: (calendar_id: string) => void;
  on_day_click: (day: Date) => void;
  available_tags: CalendarTag[];
  selected_tags: string[];
  on_toggle_tag: (tag: string) => void;
  on_toggle_calendar: (calendar_id: string, is_visible: boolean) => void;
  on_settings_click: (section?: SettingsSection) => void;
  trash_count: number;
  on_open_trash: () => void;
}

export function CalendarSidebar({
  anchor_date,
  selected_date,
  visible_range,
  week_start_day,
  calendars,
  events,
  is_mobile_open,
  on_mobile_toggle,
  on_create,
  on_create_task,
  on_create_in_calendar,
  on_day_click,
  available_tags,
  selected_tags,
  on_toggle_tag,
  on_toggle_calendar,
  on_settings_click,
  trash_count,
  on_open_trash,
}: CalendarSidebarProps) {
  const { t, language } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [mini_anchor, set_mini_anchor] = useState<Date | null>(null);
  const [mini_focus_key, set_mini_focus_key] = useState<string | null>(null);
  const mini_grid_ref = useRef<HTMLDivElement | null>(null);
  const mini_focus_pending = useRef(false);
  const [is_mobile, set_is_mobile] = useState(false);
  const [is_tablet, set_is_tablet] = useState(false);
  const [force_expanded, set_force_expanded] = useState(false);
  const [calendars_collapsed, set_calendars_collapsed] = useState(() =>
    get_cached_sidebar_state(CALENDARS_COLLAPSED_KEY),
  );
  const [labels_collapsed, set_labels_collapsed] = useState(() =>
    get_cached_sidebar_state(LABELS_COLLAPSED_KEY),
  );
  const [subscriptions_collapsed, set_subscriptions_collapsed] = useState(() =>
    get_cached_sidebar_state(SUBSCRIPTIONS_COLLAPSED_KEY),
  );
  const { preferences, update_preference } = use_preferences();

  useEffect(() => {
    const check_breakpoints = () => {
      const width = window.innerWidth;

      set_is_mobile(width < 768);
      set_is_tablet(width >= 768 && width < 1024);
    };

    check_breakpoints();
    window.addEventListener("resize", check_breakpoints);

    return () => window.removeEventListener("resize", check_breakpoints);
  }, []);

  useEffect(() => {
    if (!is_tablet) {
      set_force_expanded(false);
    }
  }, [is_tablet, preferences.sidebar_minimized]);

  useEffect(() => {
    set_mini_anchor(null);
  }, [anchor_date]);

  const forced_collapse =
    is_tablet || ((preferences.sidebar_minimized ?? false) && !is_mobile);
  const is_collapsed = forced_collapse && !force_expanded;

  const toggle_calendars_section = useCallback(() => {
    set_calendars_collapsed((previous) => {
      cache_sidebar_state(CALENDARS_COLLAPSED_KEY, !previous);

      return !previous;
    });
  }, []);

  const toggle_labels_section = useCallback(() => {
    set_labels_collapsed((previous) => {
      cache_sidebar_state(LABELS_COLLAPSED_KEY, !previous);

      return !previous;
    });
  }, []);

  const toggle_subscriptions_section = useCallback(() => {
    set_subscriptions_collapsed((previous) => {
      cache_sidebar_state(SUBSCRIPTIONS_COLLAPSED_KEY, !previous);

      return !previous;
    });
  }, []);

  const effective_mini_anchor = mini_anchor ?? anchor_date;

  const mini_grid = useMemo(
    () => build_month_grid(effective_mini_anchor, week_start_day),
    [effective_mini_anchor, week_start_day],
  );

  const mini_rows = useMemo(() => {
    const rows: Date[][] = [];

    for (let index = 0; index < mini_grid.length; index += 7) {
      rows.push(mini_grid.slice(index, index + 7));
    }

    return rows;
  }, [mini_grid]);

  const day_key_of = (day: Date) =>
    `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;

  const mini_tab_key = useMemo(() => {
    const keys = mini_grid.map(day_key_of);

    if (mini_focus_key !== null && keys.includes(mini_focus_key)) {
      return mini_focus_key;
    }

    const selected_key = day_key_of(selected_date);

    if (keys.includes(selected_key)) {
      return selected_key;
    }

    const first_of_month = mini_grid.find(
      (day) => day.getMonth() === effective_mini_anchor.getMonth(),
    );

    return first_of_month ? day_key_of(first_of_month) : keys[0];
  }, [effective_mini_anchor, mini_focus_key, mini_grid, selected_date]);

  useEffect(() => {
    if (!mini_focus_pending.current) {
      return;
    }

    mini_focus_pending.current = false;

    const cell = mini_grid_ref.current?.querySelector<HTMLElement>(
      `[data-mini-day="${mini_tab_key}"]`,
    );

    cell?.focus();
  }, [mini_tab_key]);

  const move_mini_focus = (day: Date) => {
    mini_focus_pending.current = true;
    set_mini_focus_key(day_key_of(day));

    const in_grid = mini_grid.some((candidate) => is_same_day(candidate, day));

    if (!in_grid) {
      set_mini_anchor(new Date(day.getFullYear(), day.getMonth(), 1));
    }
  };

  const handle_mini_grid_key = (
    key_event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const target = key_event.target as HTMLElement;
    const key = target.dataset.miniDay;

    if (!key) {
      return;
    }

    const index = mini_grid.findIndex((day) => day_key_of(day) === key);

    if (index < 0) {
      return;
    }

    const current = mini_grid[index];
    const is_rtl = document.documentElement.dir === "rtl";
    const horizontal_step = is_rtl ? -1 : 1;
    const shifted = (delta_days: number) =>
      new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate() + delta_days,
      );

    let next: Date | null = null;

    switch (key_event.key) {
      case "ArrowLeft":
        next = shifted(-horizontal_step);
        break;
      case "ArrowRight":
        next = shifted(horizontal_step);
        break;
      case "ArrowUp":
        next = shifted(-7);
        break;
      case "ArrowDown":
        next = shifted(7);
        break;
      case "Home":
        next = mini_grid[index - (index % 7)];
        break;
      case "End":
        next = mini_grid[index - (index % 7) + 6];
        break;
      case "PageUp":
        next = add_months(current, key_event.shiftKey ? -12 : -1);
        break;
      case "PageDown":
        next = add_months(current, key_event.shiftKey ? 12 : 1);
        break;
      default:
        return;
    }

    if (!next) {
      return;
    }

    key_event.preventDefault();
    move_mini_focus(next);
  };

  const event_day_keys = useMemo(() => {
    const keys = new Set<string>();

    if (mini_grid.length === 0) {
      return keys;
    }

    const grid_start = new Date(mini_grid[0]);

    grid_start.setHours(0, 0, 0, 0);
    const grid_end = new Date(mini_grid[mini_grid.length - 1]);

    grid_end.setHours(23, 59, 59, 999);

    for (const event of events) {
      const starts = new Date(event.starts_at);
      const ends = new Date(event.ends_at);

      if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
        continue;
      }

      const last = ends > starts ? new Date(ends.getTime() - 1) : starts;

      if (last < grid_start || starts > grid_end) {
        continue;
      }

      const cursor = new Date(Math.max(starts.getTime(), grid_start.getTime()));

      cursor.setHours(0, 0, 0, 0);

      while (cursor <= last && cursor <= grid_end) {
        keys.add(
          `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`,
        );
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return keys;
  }, [events, mini_grid]);

  const mini_title = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        month: "long",
        year: "numeric",
      }).format(effective_mini_anchor),
    [language, effective_mini_anchor],
  );

  const weekday_names = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(language, { weekday: "long" });

    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(2024, 0, 7 + week_start_day + index)),
    );
  }, [language, week_start_day]);

  const weekday_initials = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(language, { weekday: "narrow" });

    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(2024, 0, 7 + week_start_day + index)),
    );
  }, [language, week_start_day]);

  const day_label_formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [language],
  );

  const today = calendar_now();

  const subscriptions: IcsSubscription[] =
    preferences.calendar_ics_subscriptions ?? [];

  const update_subscription = (
    subscription: IcsSubscription,
    patch: Partial<IcsSubscription>,
  ) => {
    update_preference(
      "calendar_ics_subscriptions",
      subscriptions.map((entry) =>
        entry.id === subscription.id ? { ...entry, ...patch } : entry,
      ),
    );
  };

  const set_subscription_visible = (
    subscription: IcsSubscription,
    is_visible: boolean,
  ) => update_subscription(subscription, { hidden: !is_visible });

  const change_subscription_color = (
    subscription: IcsSubscription,
    color: string,
  ) => {
    if (subscription.color.toLowerCase() === color.toLowerCase()) {
      return;
    }

    update_subscription(subscription, { color });
  };

  const unsubscribe = (subscription: IcsSubscription) => {
    update_preference(
      "calendar_ics_subscriptions",
      subscriptions.filter((entry) => entry.id !== subscription.id),
    );
    show_toast(
      t("calendar.ie_sub_removed", { name: subscription.name }),
      "success",
    );
  };

  const show_only = (target: ShowOnlyTarget) => {
    for (const calendar of calendars) {
      const next_visible =
        target.kind === "calendar" && calendar.id === target.id;

      if (calendar.is_visible !== next_visible) {
        on_toggle_calendar(calendar.id, next_visible);
      }
    }

    const birthdays_hidden = target.kind !== "birthdays";

    if ((preferences.calendar_birthdays_hidden === true) !== birthdays_hidden) {
      update_preference("calendar_birthdays_hidden", birthdays_hidden);
    }

    const is_target = (subscription: IcsSubscription) =>
      target.kind === "subscription" && subscription.id === target.id;

    if (
      subscriptions.some(
        (subscription) =>
          (subscription.hidden === true) === is_target(subscription),
      )
    ) {
      update_preference(
        "calendar_ics_subscriptions",
        subscriptions.map((subscription) => ({
          ...subscription,
          hidden: !is_target(subscription),
        })),
      );
    }
  };

  const go_to_today = () => {
    set_mini_anchor(null);
    on_day_click(today);
  };

  const [calendar_editor, set_calendar_editor] = useState<{
    is_open: boolean;
    calendar: DecryptedCalendar | null;
  }>({ is_open: false, calendar: null });
  const [calendar_to_delete, set_calendar_to_delete] =
    useState<DecryptedCalendar | null>(null);
  const [calendar_to_clear, set_calendar_to_clear] =
    useState<DecryptedCalendar | null>(null);

  const open_new_calendar = () =>
    set_calendar_editor({ is_open: true, calendar: null });
  const open_edit_calendar = (calendar: DecryptedCalendar) =>
    set_calendar_editor({ is_open: true, calendar });
  const close_calendar_clear = useCallback(
    () => set_calendar_to_clear(null),
    [],
  );
  const close_calendar_editor = () =>
    set_calendar_editor((current) => ({ ...current, is_open: false }));

  const desired_width = preferences.sidebar_width ?? SIDEBAR_DEFAULT_WIDTH;
  const expanded_width = Math.min(
    SIDEBAR_MAX_WIDTH,
    Math.max(SIDEBAR_MIN_WIDTH, desired_width),
  );

  const create_choice_ref = useRef(false);

  const create_button = (
    <div
      className={`${is_collapsed ? "px-2 flex justify-center" : "px-2.5"} pb-3`}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className={
              is_collapsed
                ? "w-14 h-14 min-w-14 !h-14 !p-0 flex items-center justify-center"
                : "w-full gap-2"
            }
            data-onboarding="compose-button"
            data-rail-tip={is_collapsed ? t("calendar.create") : undefined}
            variant="depth"
          >
            <PlusIcon
              className={
                is_collapsed ? "w-[22px] h-[22px]" : "w-[15px] h-[15px]"
              }
            />
            {!is_collapsed && <span>{t("calendar.create")}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={is_collapsed ? "start" : "center"}
          className="w-48 p-[var(--aster-floating-pad)]"
          collisionPadding={8}
          side={is_collapsed ? "right" : "bottom"}
          onCloseAutoFocus={(event) => {
            if (create_choice_ref.current) {
              create_choice_ref.current = false;
              event.preventDefault();
            }
          }}
        >
          <DropdownMenuItem
            onSelect={() => {
              create_choice_ref.current = true;
              on_create();
            }}
          >
            <CalendarIcon className="h-4 w-4 me-2.5 text-[var(--icon-secondary)]" />
            <span className="flex-1">{t("calendar.create_menu_event")}</span>
            <DropdownMenuShortcut>C</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              create_choice_ref.current = true;
              on_create_task();
            }}
          >
            <CheckCircleIcon className="h-4 w-4 me-2.5 text-[var(--icon-secondary)]" />
            <span className="flex-1">{t("calendar.create_menu_task")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const mini_picker = (
    <div className="mb-2 px-2 pt-1 pb-2" data-onboarding="mini-month">
      <div className="mb-1 flex h-8 items-center gap-0.5">
        <button
          aria-label={t("calendar.back_to_today")}
          className={`inline-flex h-8 min-w-0 flex-1 items-center rounded-[10px] px-2 text-[14px] font-medium text-txt-primary transition-colors duration-150 hover:bg-[var(--aster-hover)] ${focus_ring}`}
          type="button"
          onClick={go_to_today}
        >
          <span className="truncate">{mini_title}</span>
        </button>
        {!grid_contains_day(mini_grid, today) && (
          <button
            aria-label={t("calendar.back_to_today")}
            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] transition-colors duration-150 hover:bg-[var(--aster-hover)] ${focus_ring}`}
            data-testid="calendar-mini-today"
            title={t("calendar.back_to_today")}
            type="button"
            onClick={go_to_today}
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-[var(--calendar_today_marker_bg,var(--accent-color))]"
            />
          </button>
        )}
        <button
          aria-label={t("calendar.previous_month")}
          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] text-[var(--icon-secondary)] transition-colors duration-150 hover:bg-[var(--aster-hover)] hover:text-[var(--icon-active)] ${focus_ring}`}
          type="button"
          onClick={() => set_mini_anchor(add_months(effective_mini_anchor, -1))}
        >
          <ChevronLeftIcon className="h-4 w-4 rtl:-scale-x-100" />
        </button>
        <button
          aria-label={t("calendar.next_month")}
          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] text-[var(--icon-secondary)] transition-colors duration-150 hover:bg-[var(--aster-hover)] hover:text-[var(--icon-active)] ${focus_ring}`}
          type="button"
          onClick={() => set_mini_anchor(add_months(effective_mini_anchor, 1))}
        >
          <ChevronRightIcon className="h-4 w-4 rtl:-scale-x-100" />
        </button>
      </div>

      <div
        aria-label={t("calendar.a11y_mini_month")}
        className="flex flex-col"
        ref={mini_grid_ref}
        role="grid"
        onKeyDown={handle_mini_grid_key}
      >
        <div className="grid grid-cols-7" role="row">
          {weekday_initials.map((initial, index) => (
            <span
              key={`${initial}_${index}`}
              className="inline-flex h-7 items-center justify-center text-[10px] font-semibold uppercase tracking-[0.05em] text-txt-secondary"
              role="columnheader"
            >
              <span aria-hidden="true">{initial}</span>
              <span className="sr-only">{weekday_names[index]}</span>
            </span>
          ))}
        </div>
        {mini_rows.map((row, row_index) => (
          <div
            className="grid grid-cols-7 gap-y-0.5"
            key={row_index}
            role="row"
          >
            {row.map((day, cell_index) => {
              const index = row_index * 7 + cell_index;
              const day_key = day_key_of(day);
              const is_current_month =
                day.getMonth() === effective_mini_anchor.getMonth();
              const is_today = is_same_day(day, today);
              const is_selected = is_same_day(day, selected_date);
              const is_in_range = (candidate: Date | undefined) =>
                candidate !== undefined &&
                visible_range !== null &&
                candidate >= visible_range.start &&
                candidate <= visible_range.end;
              const in_visible_range = is_in_range(day);
              const previous_in_range =
                index % 7 !== 0 && is_in_range(mini_grid[index - 1]);
              const next_in_range =
                index % 7 !== 6 && is_in_range(mini_grid[index + 1]);
              const show_band =
                in_visible_range && (previous_in_range || next_in_range);
              const has_events = event_day_keys.has(
                `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`,
              );

              return (
                <button
                  key={day_key}
                  aria-current={is_today ? "date" : undefined}
                  aria-label={day_label_formatter.format(day)}
                  aria-selected={is_selected}
                  className="group/day relative flex h-7 w-full items-center justify-center focus:outline-none focus-visible:[&>span:last-child]:shadow-[0_0_0_2px_var(--accent-color)]"
                  data-mini-day={day_key}
                  role="gridcell"
                  tabIndex={day_key === mini_tab_key ? 0 : -1}
                  type="button"
                  onClick={() => {
                    set_mini_focus_key(day_key);
                    on_day_click(day);
                  }}
                >
                  {show_band && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 bg-[var(--aster-selected)]"
                      style={{
                        borderEndEndRadius: next_in_range ? 0 : 8,
                        borderEndStartRadius: previous_in_range ? 0 : 8,
                        borderStartEndRadius: next_in_range ? 0 : 8,
                        borderStartStartRadius: previous_in_range ? 0 : 8,
                        insetInlineEnd: next_in_range ? 0 : "calc(50% - 14px)",
                        insetInlineStart: previous_in_range
                          ? 0
                          : "calc(50% - 14px)",
                      }}
                    />
                  )}
                  <span
                    className={`relative flex h-7 w-7 items-center justify-center rounded-[8px] text-[12px] leading-none tabular-nums transition-colors duration-150 ease-out motion-reduce:transition-none ${
                      is_today
                        ? "bg-[var(--calendar_today_marker_bg,var(--accent-color))] font-semibold text-[var(--calendar_today_marker_text,var(--accent-fg,#ffffff))]"
                        : is_selected
                          ? "bg-[var(--aster-selected)] font-medium text-txt-primary"
                          : is_current_month
                            ? "text-txt-primary group-hover/day:bg-[var(--aster-hover)]"
                            : "text-txt-muted group-hover/day:bg-[var(--aster-hover)]"
                    }`}
                  >
                    {day.getDate()}
                    {has_events && (
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute bottom-[3px] left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full ${
                          is_today
                            ? "bg-[var(--accent-fg,#ffffff)]"
                            : "bg-[var(--accent-color)]"
                        } ${is_current_month ? "" : "opacity-50"}`}
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  const change_calendar_color = async (
    calendar: DecryptedCalendar,
    color: string,
  ) => {
    if (calendar.color === color) {
      return;
    }

    try {
      const result = await update_calendar(
        calendar.id,
        calendar.name,
        color,
        calendar.icon,
      );

      if (!result.success) {
        show_toast(t("calendar.settings_calendar_save_failed"), "error");
      }
    } catch {
      show_toast(t("calendar.settings_calendar_save_failed"), "error");
    }
  };

  const open_calendar_menu = (pressed: ReactMouseEvent<HTMLButtonElement>) => {
    pressed.preventDefault();
    pressed.stopPropagation();

    const rect = pressed.currentTarget.getBoundingClientRect();
    const is_rtl = document.documentElement.dir === "rtl";

    pressed.currentTarget.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: is_rtl ? rect.right : rect.left,
        clientY: rect.bottom + 4,
        view: window,
      }),
    );
  };

  const visibility_box = (color: string, is_visible: boolean) => (
    <span
      aria-hidden="true"
      className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] transition-[background-color,box-shadow] duration-150 ease-out motion-reduce:transition-none"
      style={{
        backgroundColor: is_visible ? event_color_token(color) : "transparent",
        boxShadow: is_visible
          ? "none"
          : `inset 0 0 0 1.5px ${event_color_token(color)}`,
      }}
    >
      <svg
        className="h-[11px] w-[11px] transition-opacity duration-150 ease-out motion-reduce:transition-none"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={3}
        style={{ opacity: is_visible ? 1 : 0 }}
        viewBox="0 0 24 24"
      >
        <path d="M5 12l5 5L20 6" />
      </svg>
    </span>
  );

  const effective_default_calendar_id =
    calendars.find(
      (calendar) => calendar.id === preferences.calendar_default_calendar_id,
    )?.id ??
    calendars.find((calendar) => calendar.is_default)?.id ??
    calendars[0]?.id ??
    "";

  const birthdays_visible = preferences.calendar_birthdays_hidden !== true;

  const birthday_row = (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={`group relative rounded-[var(--aster-radius-item,8px)] data-[state=open]:[&>button]:bg-[var(--aster-hover)] ${
            birthdays_visible ? "" : "[&>button_span.flex-1]:opacity-55"
          }`}
        >
          <SidebarTagRow
            rail_tip
            aria-pressed={birthdays_visible}
            color={BIRTHDAY_COLOR}
            icon_slot={visibility_box(BIRTHDAY_COLOR, birthdays_visible)}
            is_collapsed={is_collapsed}
            label={t("calendar.settings_birthdays")}
            on_click={() =>
              update_preference("calendar_birthdays_hidden", birthdays_visible)
            }
            trailing={!is_collapsed ? <span className="w-5" /> : undefined}
          />
          {!is_collapsed && (
            <button
              aria-haspopup="menu"
              aria-label={t("calendar.calendar_options")}
              className={`absolute end-1.5 top-1/2 z-[2] inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-[8px] text-[var(--icon-muted)] opacity-0 transition-[opacity,background-color,color] duration-150 hover:bg-[var(--aster-hover)] hover:text-[var(--icon-active)] group-hover:opacity-100 group-data-[state=open]:opacity-100 focus-visible:opacity-100 ${focus_ring}`}
              type="button"
              onClick={open_calendar_menu}
            >
              <EllipsisHorizontalIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={() => show_only({ kind: "birthdays" })}>
          <EyeIcon className="me-2 h-4 w-4" />
          {t("calendar.show_only_this_calendar")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() =>
            update_preference("calendar_birthdays_hidden", birthdays_visible)
          }
        >
          {birthdays_visible ? (
            <EyeSlashIcon className="me-2 h-4 w-4" />
          ) : (
            <EyeIcon className="me-2 h-4 w-4" />
          )}
          {birthdays_visible
            ? t("calendar.hide_this_calendar")
            : t("calendar.show_this_calendar")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );

  const calendar_rows = calendars.map((calendar) => (
    <ContextMenu key={calendar.id}>
      <ContextMenuTrigger asChild>
        <div
          className={`group relative rounded-[var(--aster-radius-item,8px)] data-[state=open]:[&>button]:bg-[var(--aster-hover)] ${
            calendar.is_visible ? "" : "[&>button_span.flex-1]:opacity-55"
          }`}
        >
          <SidebarTagRow
            rail_tip
            color={calendar.color}
            icon_slot={visibility_box(calendar.color, calendar.is_visible)}
            aria-pressed={calendar.is_visible}
            is_collapsed={is_collapsed}
            label={calendar.name}
            on_click={() =>
              on_toggle_calendar(calendar.id, !calendar.is_visible)
            }
            trailing={!is_collapsed ? <span className="w-5" /> : undefined}
          />
          {!is_collapsed && (
            <button
              aria-haspopup="menu"
              aria-label={t("calendar.calendar_options")}
              className={`absolute end-1.5 top-1/2 z-[2] inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-[8px] text-[var(--icon-muted)] opacity-0 transition-[opacity,background-color,color] duration-150 hover:bg-[var(--aster-hover)] hover:text-[var(--icon-active)] group-hover:opacity-100 group-data-[state=open]:opacity-100 focus-visible:opacity-100 ${focus_ring}`}
              type="button"
              onClick={open_calendar_menu}
            >
              <EllipsisHorizontalIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={() => on_create_in_calendar(calendar.id)}>
          <PlusIcon className="me-2 h-4 w-4" />
          {t("calendar.new_event")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => show_only({ kind: "calendar", id: calendar.id })}
        >
          <EyeIcon className="me-2 h-4 w-4" />
          {t("calendar.show_only_this_calendar")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => on_toggle_calendar(calendar.id, !calendar.is_visible)}
        >
          {calendar.is_visible ? (
            <EyeSlashIcon className="me-2 h-4 w-4" />
          ) : (
            <EyeIcon className="me-2 h-4 w-4" />
          )}
          {calendar.is_visible
            ? t("calendar.hide_this_calendar")
            : t("calendar.show_this_calendar")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <span
              aria-hidden="true"
              className="me-2 inline-flex h-4 w-4 items-center justify-center"
            >
              <span
                className="h-3 w-3 rounded-[3px]"
                style={{ backgroundColor: event_color_token(calendar.color) }}
              />
            </span>
            {t("common.change_color")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            {EVENT_COLOR_OPTIONS.map((option) => {
              const is_current =
                option.hex.toLowerCase() === calendar.color.toLowerCase();

              return (
                <ContextMenuItem
                  key={option.hex}
                  aria-checked={is_current}
                  role="menuitemradio"
                  onClick={() =>
                    void change_calendar_color(calendar, option.hex)
                  }
                >
                  <span
                    aria-hidden="true"
                    className="me-2 inline-flex h-4 w-4 items-center justify-center"
                  >
                    <span
                      className="h-3 w-3 rounded-[3px]"
                      style={{ backgroundColor: option.token }}
                    />
                  </span>
                  <span className="flex-1">{t(option.name_key)}</span>
                  {is_current && (
                    <CheckIcon className="ms-2 h-4 w-4 text-txt-secondary" />
                  )}
                </ContextMenuItem>
              );
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onClick={() => open_edit_calendar(calendar)}>
          <PencilIcon className="me-2 h-4 w-4" />
          {t("calendar.edit_calendar")}
        </ContextMenuItem>
        {calendar.id !== effective_default_calendar_id && (
          <ContextMenuItem
            onClick={() => {
              update_preference("calendar_default_calendar_id", calendar.id);
              show_toast(
                t("calendar.settings_default_calendar_set"),
                "success",
              );
            }}
          >
            <StarIcon className="me-2 h-4 w-4" />
            {t("calendar.settings_set_default_calendar")}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          className={DESTRUCTIVE_MENU_CLASS}
          onClick={() => set_calendar_to_clear(calendar)}
        >
          <XCircleIcon className="me-2 h-4 w-4" />
          {t("calendar.clear_calendar_events")}
        </ContextMenuItem>
        {!calendar.is_default && (
          <ContextMenuItem
            className={DESTRUCTIVE_MENU_CLASS}
            onClick={() => set_calendar_to_delete(calendar)}
          >
            <TrashIcon className="me-2 h-4 w-4" />
            {t("calendar.settings_delete_calendar")}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  ));

  const subscription_rows = subscriptions.map((subscription) => {
    const color = subscription_color(subscription);
    const current_color_name = nearest_event_color(color).name;
    const is_visible = subscription.hidden !== true;

    return (
      <ContextMenu key={subscription.id}>
        <ContextMenuTrigger asChild>
          <div
            className={`group relative rounded-[var(--aster-radius-item,8px)] data-[state=open]:[&>button]:bg-[var(--aster-hover)] ${
              is_visible ? "" : "[&>button_span.flex-1]:opacity-55"
            }`}
            data-subscription-row={subscription.id}
          >
            <SidebarTagRow
              rail_tip
              aria-pressed={is_visible}
              color={color}
              icon_slot={visibility_box(color, is_visible)}
              is_collapsed={is_collapsed}
              label={subscription.name}
              on_click={() =>
                set_subscription_visible(subscription, !is_visible)
              }
              trailing={!is_collapsed ? <span className="w-5" /> : undefined}
            />
            {!is_collapsed && (
              <button
                aria-haspopup="menu"
                aria-label={t("calendar.calendar_options")}
                className={`absolute end-1.5 top-1/2 z-[2] inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-[8px] text-[var(--icon-muted)] opacity-0 transition-[opacity,background-color,color] duration-150 hover:bg-[var(--aster-hover)] hover:text-[var(--icon-active)] group-hover:opacity-100 group-data-[state=open]:opacity-100 focus-visible:opacity-100 ${focus_ring}`}
                type="button"
                onClick={open_calendar_menu}
              >
                <EllipsisHorizontalIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuItem
            onClick={() =>
              show_only({ kind: "subscription", id: subscription.id })
            }
          >
            <EyeIcon className="me-2 h-4 w-4" />
            {t("calendar.show_only_this_calendar")}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => set_subscription_visible(subscription, !is_visible)}
          >
            {is_visible ? (
              <EyeSlashIcon className="me-2 h-4 w-4" />
            ) : (
              <EyeIcon className="me-2 h-4 w-4" />
            )}
            {is_visible
              ? t("calendar.hide_this_calendar")
              : t("calendar.show_this_calendar")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <span
                aria-hidden="true"
                className="me-2 inline-flex h-4 w-4 items-center justify-center"
              >
                <span
                  className="h-3 w-3 rounded-[3px]"
                  style={{ backgroundColor: event_color_token(color) }}
                />
              </span>
              {t("common.change_color")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-44">
              {EVENT_COLOR_OPTIONS.map((option) => {
                const is_current = option.name === current_color_name;

                return (
                  <ContextMenuItem
                    key={option.hex}
                    aria-checked={is_current}
                    role="menuitemradio"
                    onClick={() =>
                      change_subscription_color(subscription, option.hex)
                    }
                  >
                    <span
                      aria-hidden="true"
                      className="me-2 inline-flex h-4 w-4 items-center justify-center"
                    >
                      <span
                        className="h-3 w-3 rounded-[3px]"
                        style={{ backgroundColor: option.token }}
                      />
                    </span>
                    <span className="flex-1">{t(option.name_key)}</span>
                    {is_current && (
                      <CheckIcon className="ms-2 h-4 w-4 text-txt-secondary" />
                    )}
                  </ContextMenuItem>
                );
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem
            onClick={() => on_settings_click("calendar_import_export")}
          >
            <Cog6ToothIcon className="me-2 h-4 w-4" />
            {t("calendar.subscription_settings")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className={DESTRUCTIVE_MENU_CLASS}
            onClick={() => unsubscribe(subscription)}
          >
            <TrashIcon className="me-2 h-4 w-4" />
            {t("calendar.ie_sub_remove")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  });

  const sidebar_content = (
    <SidebarAsideView
      expanded_width={expanded_width}
      is_collapsed={is_collapsed}
      is_mobile={is_mobile}
      label={t("calendar.calendar_navigation")}
    >
      {is_collapsed && is_tablet && (
        <SidebarRailOpenButton
          label={t("common.open_menu")}
          on_click={() => set_force_expanded(true)}
        />
      )}
      <SidebarTopBarView
        is_collapsed={is_collapsed}
        is_compact={is_mobile || (forced_collapse && !is_collapsed)}
      >
        {is_mobile && (
          <>
            <div aria-hidden="true" className="h-6" />
            <SidebarCloseButton
              label={t("common.close_menu")}
              on_click={on_mobile_toggle}
            />
          </>
        )}
        {!is_mobile && forced_collapse && !is_collapsed && (
          <SidebarCloseButton
            label={t("common.close_menu")}
            on_click={() => set_force_expanded(false)}
            type="button"
          />
        )}
      </SidebarTopBarView>

      {create_button}

      <RailTipLayer />

      <SidebarScrollAreaView
        indicator_style={{}}
        is_collapsed={is_collapsed}
        show_indicator={false}
      >
        {!is_collapsed && mini_picker}

        <div data-onboarding="calendars-section">
          <SidebarSectionToggle
            is_collapsed={is_collapsed}
            label={t("calendar.my_calendars")}
            margin_top
            on_toggle={toggle_calendars_section}
            right_slot={
              <SidebarSectionAddButton
                label={t("calendar.add_calendar")}
                on_click={open_new_calendar}
              />
            }
            section_collapsed={calendars_collapsed}
          />

          {is_collapsed && (
            <SidebarRailSectionButton
              icon={CalendarIcon}
              label={t("calendar.add_calendar")}
              on_click={open_new_calendar}
            />
          )}

          {!calendars_collapsed && (
            <div className={is_collapsed ? undefined : "py-1"}>
              {calendar_rows}
              {calendars.length > 0 && birthday_row}
              {calendars.length === 0 && !is_collapsed && (
                <CalendarEmptyState
                  action={
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={open_new_calendar}
                    >
                      {t("calendar.add_calendar")}
                    </Button>
                  }
                  body={t("calendar.no_calendars_body")}
                  compact
                  data-testid="calendar-sidebar-empty"
                  illustration={<NoCalendarsIllustration />}
                  title={t("calendar.no_calendars_title")}
                />
              )}
            </div>
          )}
        </div>

        {subscriptions.length > 0 && (
          <div data-testid="calendar-sidebar-subscriptions">
            <SidebarSectionToggle
              is_collapsed={is_collapsed}
              label={t("calendar.subscribed_calendars")}
              on_toggle={toggle_subscriptions_section}
              section_collapsed={subscriptions_collapsed}
            />
            {!subscriptions_collapsed && (
              <div className={is_collapsed ? undefined : "py-1"}>
                {subscription_rows}
              </div>
            )}
          </div>
        )}

        <div className={is_collapsed ? "mt-3" : "mt-1"}>
          <SidebarNavRow
            rail_tip
            count={trash_count}
            icon={TrashIcon}
            is_collapsed={is_collapsed}
            label={t("calendar.trash_sidebar")}
            show_count
            on_click={on_open_trash}
          />
        </div>

        {available_tags.length > 0 && (
          <>
            <SidebarSectionToggle
              is_collapsed={is_collapsed}
              label={t("common.labels")}
              on_toggle={toggle_labels_section}
              section_collapsed={labels_collapsed}
            />
            {!labels_collapsed && (
              <div className={is_collapsed ? "mt-3" : undefined}>
                {available_tags.map((tag) => {
                  const is_selected = selected_tags.some(
                    (value) => value.toLowerCase() === tag.name.toLowerCase(),
                  );

                  return (
                    <SidebarTagRow
                      key={tag.name}
                      rail_tip
                      color={tag.color}
                      is_collapsed={is_collapsed}
                      label={tag.name}
                      selected={is_selected}
                      on_click={() => on_toggle_tag(tag.name)}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}

        {!is_collapsed && (
          <CalendarWorldClock
            timezones={preferences.calendar_world_clock_timezones}
            use_24_hour={preferences.time_format === "24h"}
          />
        )}
      </SidebarScrollAreaView>

      <SidebarAccountSwitcher
        is_collapsed={is_collapsed}
        on_settings_click={on_settings_click}
        on_toggle_collapse={
          is_mobile || is_tablet
            ? undefined
            : () => {
                update_preference(
                  "sidebar_minimized",
                  !(preferences.sidebar_minimized ?? false),
                  true,
                );
              }
        }
        storage_slot={<UpNextCard calendars={calendars} className="mb-3" />}
      />
    </SidebarAsideView>
  );

  const calendar_dialogs = (
    <>
      <CalendarEditDialog
        calendar={calendar_editor.calendar}
        is_open={calendar_editor.is_open}
        on_close={close_calendar_editor}
        on_delete_request={set_calendar_to_delete}
      />
      <CalendarDeleteDialog
        calendar={calendar_to_delete}
        on_close={() => set_calendar_to_delete(null)}
      />
      <CalendarClearDialog
        calendar={calendar_to_clear}
        on_close={close_calendar_clear}
      />
    </>
  );

  if (!is_mobile) {
    return (
      <>
        {sidebar_content}
        {calendar_dialogs}
      </>
    );
  }

  return (
    <>
      {calendar_dialogs}
      <AnimatePresence>
        {is_mobile_open && (
          <>
            <motion.div
              animate={{ opacity: 1 }}
              className="fixed inset-0 aster_scrim z-40"
              exit={{ opacity: 0 }}
              initial={reduce_motion ? false : { opacity: 0 }}
              transition={{ duration: reduce_motion ? 0 : 0.2 }}
              onClick={on_mobile_toggle}
            />
            <motion.div
              animate={{ x: 0 }}
              className="fixed top-0 start-0 h-full z-50"
              exit={{ x: -(window.innerWidth + 20) }}
              initial={reduce_motion ? false : { x: -(window.innerWidth + 20) }}
              transition={{
                type: "tween",
                duration: reduce_motion ? 0 : 0.18,
                ease: [0.2, 0, 0, 1],
              }}
            >
              {sidebar_content}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
