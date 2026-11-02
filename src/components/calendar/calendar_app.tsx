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

import { useCallback, useEffect, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { PlusIcon } from "@heroicons/react/24/outline";

import { CalendarContent } from "@/components/calendar/calendar_content";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDetailsPanel } from "@/components/calendar/calendar_details_panel";
import { CalendarInsightsPanel } from "@/components/calendar/calendar_insights_panel";
import { CalendarGoToDateModal } from "@/components/calendar/calendar_go_to_date_modal";
import { CalendarSearchBar } from "@/components/calendar/calendar_search_bar";
import { CalendarTour } from "@/components/calendar/calendar_tour";
import { CalendarTrashModal } from "@/components/calendar/calendar_trash_modal";
import { CalendarSidebar } from "@/components/calendar/calendar_sidebar";
import { AppRail } from "@/components/layout/app_rail";
import { CalendarShortcutsModal } from "@/components/calendar/calendar_shortcuts_modal";
import { CalendarConflictDialog } from "@/components/calendar/calendar_conflict_dialog";
import { CalendarDecryptBanner } from "@/components/calendar/calendar_decrypt_banner";
import { use_calendar_sync_status } from "@/components/calendar/use_calendar_sync_status";
import { TopBar } from "@/components/layout/top_bar";
import { CalendarQuickSettingsRows } from "@/components/calendar/calendar_quick_settings_rows";
import { QuickSettingsPanel } from "@/components/settings/quick_settings_panel";
import { use_calendar_state } from "@/components/calendar/use_calendar_state";
import { use_calendar_reminders } from "@/components/calendar/use_calendar_reminders";
import {
  OPEN_CALENDAR_EVENT,
  take_pending_open_event,
} from "@/components/calendar/up_next_card";
import { use_is_mobile } from "@/hooks/use_platform";
import { use_i18n } from "@/lib/i18n/context";
import { toggle_task_done_with_undo } from "@/components/calendar/task_done_toast";
import { use_should_reduce_motion } from "@/provider";
import { account_hub_url } from "@/services/account_hub_link";
import { mailto_href } from "@/services/calendar/mailto";

const LOAD_TIMEOUT_MS = 15000;
const MOBILE_BREAKPOINT = 768;

interface CalendarAppProps {
  on_open_settings: (section?: SettingsSection) => void;
}

function SkeletonBar({
  className,
  radius = 8,
}: {
  className?: string;
  radius?: number;
}) {
  return <Skeleton className={className} style={{ borderRadius: radius }} />;
}

function CalendarShellSkeleton() {
  const { t } = use_i18n();

  const grid_lines = {
    backgroundImage:
      "repeating-linear-gradient(to bottom, var(--border-primary) 0px, var(--border-primary) 1px, transparent 1px, transparent 48px), repeating-linear-gradient(to right, var(--border-primary) 0px, var(--border-primary) 1px, transparent 1px, transparent 14.28%)",
    opacity: 0.4,
  };

  return (
    <div
      aria-busy="true"
      aria-label={t("calendar.loading_calendar")}
      className="flex-1 flex min-h-0 min-w-0 overflow-hidden"
      role="status"
    >
      <div
        className="hidden md:flex h-full w-64 min-w-[256px] flex-col gap-3 px-3 pt-2 pb-4 bg-sidebar-bg-custom"
        aria-hidden="true"
      >
        <SkeletonBar className="h-10 w-full" radius={16} />
        <div className="grid grid-cols-7 gap-1.5 pt-2">
          {Array.from({ length: 42 }, (_, index) => (
            <SkeletonBar key={index} className="h-6 w-full" />
          ))}
        </div>
        <div className="flex flex-col gap-2 pt-3">
          <SkeletonBar className="h-2.5 w-1/2" radius={4} />
          <SkeletonBar className="h-5 w-full" />
          <SkeletonBar className="h-5 w-full" />
          <SkeletonBar className="h-5 w-4/5" />
        </div>
      </div>

      <div className="flex-1 px-1 pb-1 md:px-2 md:pb-2 min-h-0 min-w-0 flex flex-col overflow-hidden">
        <div
          aria-hidden="true"
          className="flex-1 min-h-0 min-w-0 flex flex-col rounded-[var(--aster-island-radius)] overflow-hidden"
          style={{ backgroundColor: "var(--bg-primary)" }}
        >
          <div className="flex items-center gap-1 ps-2 pe-2 md:ps-3 h-12 flex-shrink-0">
            <SkeletonBar className="h-8 w-[68px]" radius={16} />
            <SkeletonBar className="ms-1 h-7 w-7" radius={10} />
            <SkeletonBar className="h-7 w-7" radius={10} />
            <SkeletonBar className="ms-2 h-4 w-36" radius={4} />
            <div className="flex-1" />
            <SkeletonBar className="h-7 w-7" radius={10} />
            <SkeletonBar className="ms-1 h-7 w-7" radius={10} />
          </div>
          <div
            className="hidden lg:flex h-12 flex-shrink-0 items-center gap-6 border-b px-6"
            style={{ borderColor: "var(--border-primary)" }}
          >
            {Array.from({ length: 6 }, (_, index) => (
              <SkeletonBar key={index} className="h-3 w-14" radius={4} />
            ))}
          </div>
          <div
            className="flex-1 min-h-0 border-t lg:border-t-0"
            style={{ borderColor: "var(--border-primary)", ...grid_lines }}
          />
        </div>
      </div>
    </div>
  );
}

export function open_mail_compose(address: string): void {
  const url =
    account_hub_url(`/compose?to=${encodeURIComponent(address)}`) ??
    mailto_href(address);

  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function CalendarApp({ on_open_settings }: CalendarAppProps) {
  const { language, t } = use_i18n();
  const sync_status = use_calendar_sync_status();
  const state = use_calendar_state();
  const reduce_motion = use_should_reduce_motion();

  use_calendar_reminders();

  const [is_mobile_sidebar_open, set_is_mobile_sidebar_open] = useState(false);
  const [is_trash_open, set_is_trash_open] = useState(false);
  const [is_rail_contacts_open, set_is_rail_contacts_open] = useState(false);
  const [is_rail_security_open, set_is_rail_security_open] = useState(false);
  const [is_quick_settings_open, set_is_quick_settings_open] = useState(false);
  const [load_timed_out, set_load_timed_out] = useState(false);
  const [retry_token, set_retry_token] = useState(0);
  const search_input_ref = useRef<HTMLInputElement>(null);

  const trash_entries = state.trash_entries;
  const has_load_error = state.load_failed || load_timed_out;
  const show_skeleton = state.is_loading && !has_load_error;
  const is_mobile = use_is_mobile();

  const toggle_mobile_sidebar = useCallback(
    () => set_is_mobile_sidebar_open((previous) => !previous),
    [],
  );

  const open_settings = useCallback(
    (section?: SettingsSection) => on_open_settings(section),
    [on_open_settings],
  );

  const open_shortcuts = useCallback(
    () => state.set_is_shortcuts_open(true),
    [state.set_is_shortcuts_open],
  );

  const toggle_quick_settings = useCallback(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      set_is_quick_settings_open((previous) => !previous);

      return;
    }

    set_is_quick_settings_open(false);
    open_settings();
  }, [open_settings]);

  useEffect(() => {
    if (!state.is_loading) {
      set_load_timed_out(false);

      return;
    }

    const timer = window.setTimeout(
      () => set_load_timed_out(true),
      LOAD_TIMEOUT_MS,
    );

    return () => window.clearTimeout(timer);
  }, [state.is_loading, retry_token]);

  useEffect(() => {
    if (!is_mobile_sidebar_open) {
      return;
    }

    const previous_overflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous_overflow;
    };
  }, [is_mobile_sidebar_open]);

  useEffect(() => {
    if (!is_mobile_sidebar_open) {
      return;
    }

    const handle_key_down = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        set_is_mobile_sidebar_open(false);
      }
    };

    window.addEventListener("keydown", handle_key_down);

    return () => window.removeEventListener("keydown", handle_key_down);
  }, [is_mobile_sidebar_open]);

  useEffect(() => {
    const handle_resize = () => {
      if (window.innerWidth >= MOBILE_BREAKPOINT) {
        set_is_mobile_sidebar_open(false);
      }
    };

    window.addEventListener("resize", handle_resize);

    return () => window.removeEventListener("resize", handle_resize);
  }, []);

  useEffect(() => {
    const handle_home = () => {
      set_is_mobile_sidebar_open(false);
      state.set_selected_event(null);
      state.set_search_query("");
      state.go_to_today();
    };

    window.addEventListener("aster-calendar-home", handle_home);

    return () => window.removeEventListener("aster-calendar-home", handle_home);
  }, [state.go_to_today, state.set_search_query, state.set_selected_event]);

  const open_event_ref = useRef(state.handle_event_click);

  open_event_ref.current = state.handle_event_click;

  useEffect(() => {
    if (show_skeleton) {
      return;
    }

    const handle_open = () => {
      const event = take_pending_open_event();

      if (!event) {
        return;
      }

      set_is_mobile_sidebar_open(false);
      open_event_ref.current(event);
    };

    handle_open();
    window.addEventListener(OPEN_CALENDAR_EVENT, handle_open);

    return () => window.removeEventListener(OPEN_CALENDAR_EVENT, handle_open);
  }, [show_skeleton]);

  const handle_retry = () => {
    set_load_timed_out(false);
    set_retry_token((token) => token + 1);
    state.reload();
  };

  const is_overlay_open =
    is_mobile_sidebar_open ||
    state.is_form_open ||
    !!state.event_to_delete ||
    !!state.selected_event;

  return (
    <>
      <TopBar
        brand="calendar"
        on_mobile_menu_toggle={toggle_mobile_sidebar}
        on_settings_click={toggle_quick_settings}
        on_shortcuts_click={open_shortcuts}
        search_slot={
          <CalendarSearchBar
            applied_query={state.applied_search_query}
            calendar_by_id={state.calendar_by_id}
            input_ref={search_input_ref}
            is_pending={state.is_search_pending}
            is_window_loading={state.is_search_window_loading}
            language={language}
            query={state.search_query}
            results={state.events}
            t={state.t}
            time_format={state.preferences.time_format}
            on_prefetch={state.prefetch_search_window}
            on_query_change={state.set_search_query}
            on_result_click={state.handle_event_click}
          />
        }
      />

      <div className="relative flex-1 flex transition-colors duration-200 overflow-hidden">
        {show_skeleton ? (
          <CalendarShellSkeleton />
        ) : (
          <>
            <CalendarSidebar
              anchor_date={state.anchor_date}
              visible_range={
                state.view_mode === "day" ||
                state.view_mode === "week" ||
                state.view_mode === "custom"
                  ? { end: state.range_end, start: state.range_start }
                  : null
              }
              available_tags={state.available_tags}
              calendars={state.calendars}
              is_mobile_open={is_mobile_sidebar_open}
              selected_tags={state.selected_tags}
              on_toggle_tag={state.handle_toggle_tag}
              on_create={() => {
                set_is_mobile_sidebar_open(false);
                state.handle_create_click();
              }}
              on_create_task={() => {
                set_is_mobile_sidebar_open(false);
                state.handle_create_task_click();
              }}
              on_create_in_calendar={(calendar_id) => {
                set_is_mobile_sidebar_open(false);
                state.handle_create_in_calendar(calendar_id);
              }}
              on_day_click={(day) => {
                set_is_mobile_sidebar_open(false);
                state.handle_day_click(day);
              }}
              on_mobile_toggle={toggle_mobile_sidebar}
              on_open_trash={() => {
                set_is_mobile_sidebar_open(false);
                set_is_trash_open(true);
              }}
              on_settings_click={(section) => {
                set_is_mobile_sidebar_open(false);
                open_settings(section);
              }}
              trash_count={trash_entries.length}
              on_toggle_calendar={state.handle_toggle_calendar}
              events={state.events}
              selected_date={state.selected_date}
              week_start_day={state.week_start_day}
            />

            <div className="flex-1 px-1 pb-1 md:px-2 md:pb-2 min-h-0 min-w-0 flex flex-col overflow-hidden">
              <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden relative">
                <div
                  className="flex-1 min-w-0 rounded-[var(--aster-island-radius)] overflow-hidden"
                  id="main-content"
                  role="main"
                  style={{ backgroundColor: "var(--bg-primary)" }}
                  tabIndex={-1}
                >
                  <CalendarContent
                    has_load_error={has_load_error}
                    on_retry={handle_retry}
                    state={state}
                  />
                </div>

                <AnimatePresence initial={false}>
                  {(state.selected_event || state.is_insights_open) && (
                    <div key="calendar-side-panel" className="contents">
                      {state.selected_event ? (
                        <CalendarDetailsPanel
                          key="calendar-details-panel"
                          calendar_by_id={state.calendar_by_id}
                          events={state.events}
                          on_delete_request={state.set_event_to_delete}
                          on_dismiss={() => state.set_selected_event(null)}
                          on_edit={state.handle_edit_event}
                          on_event_click={state.handle_event_click}
                          on_respond={(event, response) => {
                            void state.handle_event_respond(event, response);
                          }}
                          on_toggle_task_done={(event) => {
                            void toggle_task_done_with_undo(state, event);
                          }}
                          selected_date={state.selected_date}
                          selected_event={state.selected_event}
                          self_email={state.self_email}
                          t={state.t}
                          time_format={state.preferences.time_format}
                        />
                      ) : (
                        <CalendarInsightsPanel
                          key="calendar-insights-panel"
                          calendar_by_id={state.calendar_by_id}
                          language={language}
                          load_events={state.load_events_in_range}
                          on_dismiss={() => state.set_is_insights_open(false)}
                          self_email={state.self_email}
                          t={state.t}
                          week_start_day={state.week_start_day}
                        />
                      )}
                    </div>
                  )}
                </AnimatePresence>
                <QuickSettingsPanel
                  is_open={is_quick_settings_open}
                  rows={<CalendarQuickSettingsRows />}
                  on_close={() => set_is_quick_settings_open(false)}
                  on_open_full_settings={(section) => {
                    set_is_quick_settings_open(false);
                    open_settings(section);
                  }}
                />
              </div>
            </div>

            {!is_mobile && (
              <AppRail
                account_only={true}
                is_contacts_open={is_rail_contacts_open}
                is_security_open={is_rail_security_open}
                on_compose={open_mail_compose}
                on_contacts_open_change={set_is_rail_contacts_open}
                on_security_open_change={set_is_rail_security_open}
              />
            )}
          </>
        )}
      </div>

      <CalendarGoToDateModal
        initial_date={state.anchor_date}
        is_open={state.is_go_to_date_open}
        language={language}
        t={state.t}
        week_start_day={state.week_start_day}
        on_close={() => state.set_is_go_to_date_open(false)}
        on_go={(date) => state.handle_day_click(date)}
      />

      <CalendarTrashModal
        calendar_by_id={state.calendar_by_id}
        entries={trash_entries}
        is_open={is_trash_open}
        language={language}
        t={state.t}
        on_close={() => set_is_trash_open(false)}
        on_delete_forever={state.handle_delete_trash_entries}
        on_restore={state.handle_restore_trash_entries}
        on_undo_delete_forever={state.handle_undo_delete_trash_entries}
      />

      <CalendarShortcutsModal
        is_open={state.is_shortcuts_open}
        on_close={() => state.set_is_shortcuts_open(false)}
      />

      <CalendarConflictDialog
        conflicts={sync_status.conflicts}
        language={language}
      />

      <CalendarDecryptBanner />

      {!show_skeleton && !has_load_error && !is_mobile && (
        <CalendarTour has_existing_events={state.events.length > 0} />
      )}

      {!show_skeleton && !is_overlay_open && !has_load_error && (
        <motion.button
          animate={{ opacity: 1, scale: 1 }}
          aria-label={t("calendar.new_event")}
          className="calendar_fab md:hidden fixed z-30 flex items-center justify-center w-14 h-14 rounded-full"
          initial={reduce_motion ? false : { opacity: 0, scale: 0.9 }}
          style={{
            backgroundColor: "var(--accent-color)",
            color: "var(--accent-fg, #ffffff)",
            bottom: "calc(1.25rem + env(safe-area-inset-bottom))",
          }}
          transition={{ duration: reduce_motion ? 0 : 0.16, ease: "easeOut" }}
          type="button"
          onClick={state.handle_create_click}
        >
          <PlusIcon className="w-6 h-6" />
        </motion.button>
      )}
    </>
  );
}
