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
import { memo, useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppRailView } from "@aster/ui";

import {
  AppRailIcon,
  app_rail_logo,
} from "@/components/icons/app_rail_icon";
import { QuickAgendaPanel } from "@/components/layout/quick_agenda_panel";
import { QuickContactsPanel } from "@/components/layout/quick_contacts_panel";
import { QuickSecurityPanel } from "@/components/layout/quick_security_panel";
import { use_panel_transition } from "@/components/layout/use_panel_transition";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { DatedCalendarImage } from "@/components/icons/dated_calendar_image";
import {
  read_rail_contacts_open,
  write_rail_contacts_open,
} from "@/lib/rail_contacts_open";
import {
  read_rail_security_open,
  write_rail_security_open,
} from "@/lib/rail_security_open";

const RAIL_HIDDEN_KEY = "aster_app_rail_hidden";
const CALENDAR_HOME_EVENT = "aster-calendar-home";

function read_hidden() {
  try {
    return localStorage.getItem(RAIL_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

interface AppRailProps {
  is_contacts_open: boolean;
  is_security_open: boolean;
  on_contacts_open_change: (is_open: boolean) => void;
  on_security_open_change: (is_open: boolean) => void;
  on_compose: (address: string) => void;
}

function AppRailComponent({
  is_contacts_open,
  is_security_open,
  on_contacts_open_change,
  on_security_open_change,
  on_compose,
}: AppRailProps) {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const location = useLocation();
  const navigate = useNavigate();
  const is_settings_view = location.pathname.startsWith("/settings");
  const [is_hidden, set_is_hidden] = useState(read_hidden);
  const [is_swapping, set_is_swapping] = useState(false);
  const [is_agenda_open, set_is_agenda_open] = useState(false);

  const close_contacts = useCallback(() => {
    write_rail_contacts_open(false);
    on_contacts_open_change(false);
  }, [on_contacts_open_change]);

  const close_security = useCallback(() => {
    write_rail_security_open(false);
    on_security_open_change(false);
  }, [on_security_open_change]);

  const toggle_contacts = useCallback(() => {
    const next = !is_contacts_open;

    set_is_swapping(next && (is_security_open || is_agenda_open));
    write_rail_contacts_open(next);
    on_contacts_open_change(next);
    if (next) {
      set_is_agenda_open(false);
      write_rail_security_open(false);
      on_security_open_change(false);
    }
  }, [
    is_agenda_open,
    is_contacts_open,
    is_security_open,
    on_contacts_open_change,
    on_security_open_change,
  ]);

  const toggle_security = useCallback(() => {
    const next = !is_security_open;

    set_is_swapping(next && (is_contacts_open || is_agenda_open));
    write_rail_security_open(next);
    on_security_open_change(next);
    if (next) {
      set_is_agenda_open(false);
      write_rail_contacts_open(false);
      on_contacts_open_change(false);
    }
  }, [
    is_agenda_open,
    is_contacts_open,
    is_security_open,
    on_contacts_open_change,
    on_security_open_change,
  ]);

  const close_agenda = useCallback(() => {
    set_is_agenda_open(false);
  }, []);

  const toggle_agenda = useCallback(() => {
    const next = !is_agenda_open;

    set_is_swapping(next && (is_contacts_open || is_security_open));
    set_is_agenda_open(next);
    if (next) {
      write_rail_contacts_open(false);
      on_contacts_open_change(false);
      write_rail_security_open(false);
      on_security_open_change(false);
    }
  }, [
    is_agenda_open,
    is_contacts_open,
    is_security_open,
    on_contacts_open_change,
    on_security_open_change,
  ]);

  const on_calendar_click = useCallback(() => {
    if (!is_settings_view) {
      toggle_agenda();

      return;
    }
    set_is_agenda_open(false);
    navigate("/");
    window.dispatchEvent(new CustomEvent(CALENDAR_HOME_EVENT));
  }, [is_settings_view, navigate, toggle_agenda]);

  useEffect(() => {
    if (is_contacts_open || is_security_open) set_is_agenda_open(false);
  }, [is_contacts_open, is_security_open]);

  useEffect(() => {
    if (!is_swapping) return;

    set_is_swapping(false);
  }, [is_swapping]);

  const { is_visible: is_slot_visible } = use_panel_transition(
    is_contacts_open || is_security_open || is_agenda_open,
  );

  const toggle_hidden = useCallback(() => {
    set_is_hidden((hidden) => !hidden);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_HIDDEN_KEY, is_hidden ? "1" : "0");
    } catch {
      return;
    }
  }, [is_hidden]);

  useEffect(() => {
    if (!is_hidden) return;
    set_is_agenda_open(false);
    on_contacts_open_change(false);
    on_security_open_change(false);
  }, [is_hidden, on_contacts_open_change, on_security_open_change]);

  useEffect(() => {
    if (!preferences.show_side_panel) return;
    if (read_hidden()) return;
    if (read_rail_contacts_open()) {
      on_contacts_open_change(true);

      return;
    }
    if (read_rail_security_open()) on_security_open_change(true);
  }, [
    on_contacts_open_change,
    on_security_open_change,
    preferences.show_side_panel,
  ]);

  if (!preferences.show_side_panel) return null;

  return (
    <AppRailView
      is_hidden={is_hidden}
      is_panel_visible={is_slot_visible}
      is_settings_view={is_settings_view}
      items={[
        {
          key: "calendar",
          label: t("common.app_name_calendar"),
          selected: is_agenda_open,
          fallback_icon: (
            <DatedCalendarImage
              className="h-6 w-6 shrink-0"
              fallback={<AppRailIcon name="calendar" />}
              kind="app"
            />
          ),
          on_click: on_calendar_click,
        },
        {
          key: "contacts",
          label: t("common.contacts"),
          selected: is_contacts_open,
          ...app_rail_logo("contacts"),
          fallback_icon: <AppRailIcon name="contacts" />,
          on_click: toggle_contacts,
        },
        {
          key: "security",
          label: t("common.security_center"),
          selected: is_security_open,
          ...app_rail_logo("security"),
          fallback_icon: <AppRailIcon name="security" />,
          on_click: toggle_security,
        },
      ]}
      labels={{
        expand: t("common.expand_sidebar"),
        collapse: t("common.collapse_sidebar"),
      }}
      panel={
        <>
          <QuickAgendaPanel
            is_open={is_agenda_open}
            is_swapping={is_swapping}
            on_close={close_agenda}
          />
          <QuickContactsPanel
            is_open={is_contacts_open}
            is_swapping={is_swapping}
            on_close={close_contacts}
            on_compose={on_compose}
          />
          <QuickSecurityPanel
            is_open={is_security_open}
            is_swapping={is_swapping}
            on_close={close_security}
          />
        </>
      }
      on_toggle_hidden={toggle_hidden}
    />
  );
}

export const AppRail = memo(AppRailComponent);
