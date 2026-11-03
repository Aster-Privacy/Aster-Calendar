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
import type { IcsSubscription } from "@/services/calendar/subscriptions";
import type { DecryptedCalendar } from "@/types/calendar";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const update_preference = vi.fn();
const show_toast = vi.fn();
const preferences_state: {
  calendar_ics_subscriptions?: IcsSubscription[];
  calendar_birthdays_hidden?: boolean;
} = {};

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: preferences_state, update_preference }),
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
  CalendarEditDialog: () => null,
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
    AnimatePresence: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
  };
});

import { CalendarSidebar } from "@/components/calendar/calendar_sidebar";
import { EVENT_COLOR_OPTIONS } from "@/components/calendar/calendar_utils";

const CALENDAR: DecryptedCalendar = {
  id: "cal-1",
  name: "Personal",
  color: "#2563eb",
  icon: "calendar" as DecryptedCalendar["icon"],
  is_visible: true,
  is_default: true,
};

const TEAM: IcsSubscription = {
  id: "sub-1",
  url: "https://example.com/team.ics",
  name: "Team holidays",
  color: EVENT_COLOR_OPTIONS[0].hex,
};

const SPORTS: IcsSubscription = {
  id: "sub-2",
  url: "https://example.com/sports.ics",
  name: "Sports",
  color: EVENT_COLOR_OPTIONS[1].hex,
  hidden: true,
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const on_settings_click = vi.fn();
const on_toggle_calendar = vi.fn();

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
        on_settings_click={on_settings_click}
        on_toggle_calendar={on_toggle_calendar}
        on_toggle_tag={() => {}}
      />,
    ),
  );
}

function section(): HTMLElement | null {
  return container!.querySelector<HTMLElement>(
    "[data-testid=calendar-sidebar-subscriptions]",
  );
}

function row(id: string): HTMLElement {
  return container!.querySelector<HTMLElement>(
    `[data-subscription-row="${id}"]`,
  )!;
}

function row_menu(scope: HTMLElement): HTMLElement {
  const menu = scope.nextElementSibling as HTMLElement;

  expect(menu.hasAttribute("data-menu")).toBe(true);

  return menu;
}

function menu_item(scope: HTMLElement, label: string): HTMLButtonElement {
  const menu = row_menu(scope);

  return Array.from(
    menu.querySelectorAll<HTMLButtonElement>("[data-menu-item]"),
  ).find((item) => item.textContent?.includes(label))!;
}

function last_subscriptions(): IcsSubscription[] {
  const call = update_preference.mock.calls
    .filter(([key]) => key === "calendar_ics_subscriptions")
    .at(-1);

  return call?.[1] as IcsSubscription[];
}

beforeEach(() => {
  update_preference.mockReset();
  show_toast.mockReset();
  on_settings_click.mockReset();
  on_toggle_calendar.mockReset();
  preferences_state.calendar_ics_subscriptions = [TEAM, SPORTS];
  preferences_state.calendar_birthdays_hidden = false;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("CalendarSidebar subscriptions", () => {
  it("lists subscriptions in their own section", () => {
    render();

    expect(section()).not.toBeNull();
    expect(section()!.textContent).toContain("calendar.subscribed_calendars");
    expect(row("sub-1").textContent).toContain("Team holidays");
    expect(row("sub-2").textContent).toContain("Sports");
    expect(
      row("sub-1").querySelector("[aria-pressed]")?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      row("sub-2").querySelector("[aria-pressed]")?.getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("hides the section without subscriptions", () => {
    preferences_state.calendar_ics_subscriptions = [];
    render();

    expect(section()).toBeNull();
  });

  it("toggles visibility from the row", () => {
    render();

    act(() => row("sub-1").querySelector<HTMLElement>("[aria-pressed]")!.click());

    expect(last_subscriptions()).toEqual([{ ...TEAM, hidden: true }, SPORTS]);

    act(() => row("sub-2").querySelector<HTMLElement>("[aria-pressed]")!.click());

    expect(last_subscriptions()).toEqual([TEAM, { ...SPORTS, hidden: false }]);
  });

  it("changes the color from the row menu", () => {
    render();

    const swatches = Array.from(
      row_menu(row("sub-1")).querySelectorAll<HTMLButtonElement>(
        "[role=menuitemradio]",
      ),
    );

    expect(swatches).toHaveLength(EVENT_COLOR_OPTIONS.length);
    expect(swatches[0].getAttribute("aria-checked")).toBe("true");

    act(() => swatches[0].click());
    expect(update_preference).not.toHaveBeenCalled();

    act(() => swatches[2].click());
    expect(last_subscriptions()).toEqual([
      { ...TEAM, color: EVENT_COLOR_OPTIONS[2].hex },
      SPORTS,
    ]);
  });

  it("shows only the chosen subscription", () => {
    render();

    act(() => menu_item(row("sub-2"), "calendar.show_only_this_calendar").click());

    expect(on_toggle_calendar).toHaveBeenCalledWith("cal-1", false);
    expect(update_preference).toHaveBeenCalledWith(
      "calendar_birthdays_hidden",
      true,
    );
    expect(last_subscriptions()).toEqual([
      { ...TEAM, hidden: true },
      { ...SPORTS, hidden: false },
    ]);
  });

  it("opens the subscription settings and unsubscribes", () => {
    render();

    act(() => menu_item(row("sub-1"), "calendar.subscription_settings").click());
    expect(on_settings_click).toHaveBeenCalledWith("calendar_import_export");

    act(() => menu_item(row("sub-1"), "calendar.ie_sub_remove").click());
    expect(last_subscriptions()).toEqual([SPORTS]);
    expect(show_toast).toHaveBeenCalledWith("calendar.ie_sub_removed", "success");
  });

  it("hides subscriptions when showing only a regular calendar", () => {
    render();

    const show_only = Array.from(
      container!.querySelectorAll<HTMLElement>("[data-menu]"),
    )
      .filter(
        (menu) =>
          menu.previousElementSibling?.textContent?.includes("Personal") ===
          true,
      )
      .flatMap((menu) =>
        Array.from(menu.querySelectorAll<HTMLButtonElement>("[data-menu-item]")),
      )
      .find((item) =>
        item.textContent?.includes("calendar.show_only_this_calendar"),
      )!;

    act(() => show_only.click());

    expect(on_toggle_calendar).not.toHaveBeenCalled();
    expect(last_subscriptions()).toEqual([
      { ...TEAM, hidden: true },
      { ...SPORTS, hidden: true },
    ]);
  });
});
