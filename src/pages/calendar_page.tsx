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

import { Suspense, useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  CalendarApp,
  open_mail_compose,
} from "@/components/calendar/calendar_app";
import { CalendarShortcutsModal } from "@/components/calendar/calendar_shortcuts_modal";
import { AppRail } from "@/components/layout/app_rail";
import { TopBar } from "@/components/layout/top_bar";
import { resolve_settings_section } from "@/components/settings/settings_content_helpers";
import { Spinner } from "@/components/ui/spinner";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { lazy_with_retry, preload_when_idle } from "@/utils/lazy_with_retry";

const load_settings_content = () =>
  import("@/components/settings/settings_content");
const SettingsContent = lazy_with_retry(() =>
  load_settings_content().then((m) => ({
    default: m.SettingsContent,
  })),
);

function SettingsFallback() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Spinner className="h-6 w-6 text-txt-tertiary" size="lg" />
    </div>
  );
}

const DEFAULT_CALENDAR_SETTINGS_SECTION: SettingsSection = "calendar_views";

const noop = () => {};

const SETTINGS_TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "password",
  "url",
  "tel",
  "number",
  "date",
  "datetime-local",
  "time",
  "month",
  "week",
]);

function is_settings_typing_target(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tag = target.tagName.toLowerCase();

  if (tag === "input") {
    return SETTINGS_TEXT_INPUT_TYPES.has((target as HTMLInputElement).type);
  }

  if (tag === "textarea" || tag === "select") return true;

  return target.getAttribute("role") === "textbox";
}

function has_open_dialog(): boolean {
  return (
    document.querySelector(
      '[role="dialog"]:not([data-state="closed"]), [role="alertdialog"]:not([data-state="closed"]), [aria-modal="true"]:not([data-state="closed"])',
    ) !== null
  );
}

export default function CalendarPage() {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [is_rail_contacts_open, set_is_rail_contacts_open] = useState(false);
  const [is_rail_security_open, set_is_rail_security_open] = useState(false);
  const [is_settings_shortcuts_open, set_is_settings_shortcuts_open] =
    useState(false);
  const { preferences } = use_preferences();
  const shortcuts_enabled = preferences.calendar_keyboard_shortcuts_enabled;

  const is_settings_route = location.pathname.startsWith("/settings");
  const resolved_section = resolve_settings_section(params.section);
  const settings_section: SettingsSection | null = is_settings_route
    ? (resolved_section ?? DEFAULT_CALENDAR_SETTINGS_SECTION)
    : null;

  const open_settings = useCallback(
    (section?: SettingsSection) => {
      navigate(`/settings/${section ?? DEFAULT_CALENDAR_SETTINGS_SECTION}`);
    },
    [navigate],
  );

  const close_settings = useCallback(() => navigate("/"), [navigate]);

  const change_settings_section = useCallback(
    (section: SettingsSection, replace?: boolean) => {
      navigate(`/settings/${section}`, { replace: replace === true });
    },
    [navigate],
  );

  useEffect(
    () =>
      preload_when_idle(() => {
        void load_settings_content();
      }),
    [],
  );

  useEffect(() => {
    if (!is_settings_route || resolved_section) return;

    navigate(`/settings/${DEFAULT_CALENDAR_SETTINGS_SECTION}`, {
      replace: true,
    });
  }, [is_settings_route, resolved_section, navigate]);

  useEffect(() => {
    const handle_open = () => open_settings();

    const handle_navigate = (event: Event) => {
      if (is_settings_route) return;

      const detail = (event as CustomEvent<string>).detail;
      const section = resolve_settings_section(
        typeof detail === "string" ? detail.split("#")[0] : null,
      );

      open_settings(section);
    };

    window.addEventListener("aster-calendar-open-settings", handle_open);
    window.addEventListener("aster-calendar-home", close_settings);
    window.addEventListener("navigate-settings", handle_navigate);

    return () => {
      window.removeEventListener("aster-calendar-open-settings", handle_open);
      window.removeEventListener("aster-calendar-home", close_settings);
      window.removeEventListener("navigate-settings", handle_navigate);
    };
  }, [close_settings, is_settings_route, open_settings]);

  const open_settings_shortcuts = useCallback(
    () => set_is_settings_shortcuts_open(true),
    [],
  );

  const close_settings_shortcuts = useCallback(
    () => set_is_settings_shortcuts_open(false),
    [],
  );

  useEffect(() => {
    if (!is_settings_route) {
      set_is_settings_shortcuts_open(false);

      return;
    }

    if (!shortcuts_enabled) return;

    const handle_keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "?") return;
      if (is_settings_typing_target(event.target)) return;
      if (has_open_dialog()) return;

      event.preventDefault();
      set_is_settings_shortcuts_open(true);
    };

    window.addEventListener("keydown", handle_keydown);

    return () => window.removeEventListener("keydown", handle_keydown);
  }, [is_settings_route, shortcuts_enabled]);

  return (
    <>
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--accent-color)] focus:text-[var(--accent-fg,#ffffff)] focus:shadow-lg"
        href="#main-content"
      >
        {t("common.skip_to_content")}
      </a>
      <div
        className="calendar_surface h-screen w-full flex flex-col overflow-hidden"
        style={{ backgroundColor: "var(--bg-secondary)", height: "100dvh" }}
      >
        {settings_section ? (
          <>
            <TopBar
                    is_settings_view={true}
              on_mobile_menu_toggle={noop}
              on_settings_click={noop}
              on_shortcuts_click={open_settings_shortcuts}
            />
            <div className="flex-1 flex transition-colors duration-200 overflow-hidden">
              <Suspense fallback={<SettingsFallback />}>
                <SettingsContent
                  on_close={close_settings}
                  on_section_change={change_settings_section}
                  section={settings_section}
                />
              </Suspense>
              <AppRail
                is_contacts_open={is_rail_contacts_open}
                is_security_open={is_rail_security_open}
                on_compose={open_mail_compose}
                on_contacts_open_change={set_is_rail_contacts_open}
                on_security_open_change={set_is_rail_security_open}
              />
            </div>
            <CalendarShortcutsModal
              is_open={is_settings_shortcuts_open}
              on_close={close_settings_shortcuts}
            />
          </>
        ) : (
          <CalendarApp on_open_settings={open_settings} />
        )}
      </div>
    </>
  );
}
