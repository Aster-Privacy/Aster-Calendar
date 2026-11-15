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
import type { ReactNode } from "react";
import type { DecryptedCalendar } from "@/types/calendar";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const update_preference = vi.fn();
const update_preferences = vi.fn();
const show_toast = vi.fn();
const preferences_state: {
  calendar_birthdays_color?: string;
  calendar_birthdays_name?: string;
  calendar_birthdays_removed?: boolean;
  calendar_holidays_color?: string;
  calendar_holiday_region?: string;
} = {};
const edit_dialogs: {
  calendar: DecryptedCalendar | null;
  is_open: boolean;
  on_save_local?: (saved: {
    id: string | null;
    name: string;
    color: string;
  }) => void;
}[] = [];

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: preferences_state,
    update_preference,
    update_preferences,
  }),
}));

vi.mock("@/contexts/auth/use_auth_hook", () => ({
  use_auth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/services/api/preferences", () => ({
  get_cached_sidebar_state: () => false,
  cache_sidebar_state: () => {},
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => show_toast(...args),
}));

vi.mock("@/services/api/calendar", () => ({
  update_calendar: vi.fn(),
}));

vi.mock("@/components/calendar/calendar_edit_dialog", () => ({
  CalendarDeleteDialog: () => null,
  CalendarEditDialog: (props: (typeof edit_dialogs)[number]) => {
    edit_dialogs.push(props);

    return null;
  },
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: ({
    is_open,
    title,
    on_confirm,
  }: {
    is_open: boolean;
    title: string;
    on_confirm: () => void;
  }) =>
    is_open ? (
      <div data-confirm="">
        <span>{title}</span>
        <button data-confirm-ok="" type="button" onClick={on_confirm}>
          ok
        </button>
      </div>
    ) : null,
}));

vi.mock("@/components/calendar/calendar_world_clock", () => ({
  CalendarWorldClock: () => null,
}));

vi.mock("@/components/calendar/up_next_card", () => ({
  UpNextCard: () => null,
}));

vi.mock("@/components/layout/sidebar/sidebar_account_switcher", () => ({
  SidebarAccountSwitcher: () => null,
}));

vi.mock("@/components/layout/sidebar/rail_tip_layer", () => ({
  RailTipLayer: () => null,
}));

vi.mock("@/components/ui/context_menu", () => {
  const pass = ({ children }: { children?: ReactNode }) => <>{children}</>;

  return {
    ContextMenu: pass,
    ContextMenuTrigger: pass,
    ContextMenuContent: ({ children }: { children?: ReactNode }) => (
      <div data-menu="">{children}</div>
    ),
    ContextMenuItem: ({
      children,
      onClick,
      role,
      "aria-checked": aria_checked,
    }: {
      children?: ReactNode;
      onClick?: () => void;
      role?: string;
      "aria-checked"?: boolean;
    }) => (
      <button
        aria-checked={aria_checked}
        data-menu-item=""
        role={role ?? "menuitem"}
        type="button"
        onClick={onClick}
      >
        {children}
      </button>
    ),
    ContextMenuSeparator: () => null,
    ContextMenuSub: pass,
    ContextMenuSubTrigger: ({ children }: { children?: ReactNode }) => (
      <div data-sub-trigger="">{children}</div>
    ),
    ContextMenuSubContent: ({ children }: { children?: ReactNode }) => (
      <div data-sub-content="">{children}</div>
    ),
  };
});

vi.mock("framer-motion", async () => {
  const { forwardRef } = await import("react");
  const skip = new Set([
    "initial",
    "animate",
    "exit",
    "transition",
    "variants",
    "layout",
    "layoutId",
    "whileHover",
    "whileTap",
  ]);
  const cache = new Map<string, unknown>();

  return {
    motion: new Proxy(
      {},
      {
        get: (_target, key: string) => {
          if (!cache.has(key)) {
            cache.set(
              key,
              forwardRef<HTMLDivElement, { children?: ReactNode }>(
                ({ children, ...rest }, ref) => (
                  <div
                    ref={ref}
                    {...Object.fromEntries(
                      Object.entries(rest).filter(([prop]) => !skip.has(prop)),
                    )}
                  >
                    {children}
                  </div>
                ),
              ),
            );
          }

          return cache.get(key);
        },
      },
    ),
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

import { CalendarSidebar } from "@/components/calendar/calendar_sidebar";
import { PICKER_COLOR_OPTIONS } from "@/components/calendar/calendar_utils";
import { BIRTHDAY_CALENDAR_ID } from "@/services/calendar/birthdays";
import { forget_local_visibility_cache } from "@/services/calendar/local_visibility";

const CALENDAR: DecryptedCalendar = {
  id: "cal-1",
  name: "Personal",
  color: "#2563eb",
  icon: "calendar" as DecryptedCalendar["icon"],
  is_visible: true,
  is_default: true,
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <CalendarSidebar
        anchor_date={new Date(2026, 10, 3)}
        available_tags={[]}
        calendars={[CALENDAR]}
        events={[]}
        is_mobile_open={false}
        selected_date={new Date(2026, 10, 3)}
        selected_tags={[]}
        trash_count={0}
        visible_range={null}
        week_start_day={0}
        on_create={() => {}}
        on_create_in_calendar={() => {}}
        on_create_task={() => {}}
        on_day_click={() => {}}
        on_mobile_toggle={() => {}}
        on_open_trash={() => {}}
        on_settings_click={() => {}}
        on_toggle_calendar={() => {}}
        on_toggle_tag={() => {}}
      />,
    ),
  );
}

function birthday_row(): HTMLElement | null {
  return container!.querySelector<HTMLElement>(
    '[data-visibility-row="birthdays"]',
  );
}

function holiday_row(): HTMLElement | null {
  return container!.querySelector<HTMLElement>(
    '[data-visibility-row="holidays"]',
  );
}

function row_menu(scope: HTMLElement): HTMLElement {
  const menu = scope.nextElementSibling as HTMLElement;

  expect(menu.hasAttribute("data-menu")).toBe(true);

  return menu;
}

function menu_item(scope: HTMLElement, label: string): HTMLButtonElement {
  return Array.from(
    row_menu(scope).querySelectorAll<HTMLButtonElement>("[data-menu-item]"),
  ).find((item) => item.textContent?.includes(label))!;
}

function swatches(scope: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    row_menu(scope).querySelectorAll<HTMLButtonElement>("[role=menuitemradio]"),
  );
}

function birthdays_dialog() {
  return edit_dialogs
    .filter((props) => props.calendar?.id === BIRTHDAY_CALENDAR_ID)
    .at(-1)!;
}

beforeEach(() => {
  update_preference.mockReset();
  update_preferences.mockReset();
  show_toast.mockReset();
  edit_dialogs.length = 0;
  for (const key of Object.keys(preferences_state)) {
    delete preferences_state[key as keyof typeof preferences_state];
  }
  preferences_state.calendar_holiday_region = "none";
  window.localStorage.clear();
  forget_local_visibility_cache();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("CalendarSidebar birthdays calendar", () => {
  it("shows the saved name and color", () => {
    preferences_state.calendar_birthdays_name = "Family birthdays";
    preferences_state.calendar_birthdays_color = "#00AA88";
    render();

    expect(birthday_row()!.textContent).toContain("Family birthdays");
    expect(birthday_row()!.textContent).not.toContain(
      "calendar.settings_birthdays",
    );
    expect(birthdays_dialog().calendar?.color).toBe("#00aa88");
    expect(birthdays_dialog().calendar?.name).toBe("Family birthdays");
  });

  it("changes the color from the row menu as a hex value", () => {
    render();

    const options = swatches(birthday_row()!);

    expect(options).toHaveLength(PICKER_COLOR_OPTIONS.length + 1);

    act(() => options[3].click());

    expect(update_preference).toHaveBeenCalledWith(
      "calendar_birthdays_color",
      PICKER_COLOR_OPTIONS[3].hex.toLowerCase(),
    );
  });

  it("renames the calendar from the edit dialog", () => {
    render();

    act(() => menu_item(birthday_row()!, "calendar.edit_calendar").click());

    const dialog = birthdays_dialog();

    expect(dialog.is_open).toBe(true);
    expect(dialog.on_save_local).toBeTypeOf("function");

    act(() =>
      dialog.on_save_local!({
        id: BIRTHDAY_CALENDAR_ID,
        name: "  Friends  ",
        color: "#123ABC",
      }),
    );

    expect(update_preferences).toHaveBeenCalledWith({
      calendar_birthdays_color: "#123abc",
      calendar_birthdays_name: "Friends",
    });
  });

  it("removes the calendar after confirmation", () => {
    render();

    act(() =>
      menu_item(birthday_row()!, "calendar.remove_birthdays_calendar").click(),
    );

    const confirm = container!.querySelector<HTMLElement>("[data-confirm]");

    expect(confirm).not.toBeNull();
    expect(update_preference).not.toHaveBeenCalled();

    act(() =>
      confirm!.querySelector<HTMLButtonElement>("[data-confirm-ok]")!.click(),
    );

    expect(update_preference).toHaveBeenCalledWith(
      "calendar_birthdays_removed",
      true,
    );
    expect(show_toast).toHaveBeenCalledWith(
      "calendar.birthdays_removed_toast",
      "success",
    );
  });

  it("drops the row once the calendar is removed", () => {
    preferences_state.calendar_birthdays_removed = true;
    render();

    expect(birthday_row()).toBeNull();
  });
});

describe("CalendarSidebar holidays calendar", () => {
  it("uses the saved holiday color and changes it from the row menu", () => {
    preferences_state.calendar_holiday_region = "us";
    preferences_state.calendar_holidays_color = PICKER_COLOR_OPTIONS[5].hex;
    render();

    const options = swatches(holiday_row()!);

    expect(options).toHaveLength(PICKER_COLOR_OPTIONS.length + 1);
    expect(options[5].getAttribute("aria-checked")).toBe("true");

    act(() => options[1].click());

    expect(update_preference).toHaveBeenCalledWith(
      "calendar_holidays_color",
      PICKER_COLOR_OPTIONS[1].hex.toLowerCase(),
    );
  });

  it("marks a color outside the presets as the custom color", () => {
    preferences_state.calendar_holiday_region = "us";
    preferences_state.calendar_holidays_color = "#795548";
    render();

    const options = swatches(holiday_row()!);
    const checked = options.filter(
      (option) => option.getAttribute("aria-checked") === "true",
    );

    expect(checked).toHaveLength(1);
    expect(checked[0]).toBe(options.at(-1));
    expect(checked[0].textContent).toContain("common.custom_color");
  });
});
