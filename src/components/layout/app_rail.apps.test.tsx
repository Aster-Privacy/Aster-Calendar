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
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";

import { AppRail } from "./app_rail";

const open_external = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { show_side_panel: true } }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/utils/open_link", () => ({ open_external }));

vi.mock("@/components/layout/quick_contacts_panel", () => ({
  QuickContactsPanel: () => null,
}));

vi.mock("@/components/layout/quick_security_panel", () => ({
  QuickSecurityPanel: () => null,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function LocationProbe() {
  const location = useLocation();

  return <output data-testid="path">{location.pathname}</output>;
}

describe("app rail apps", () => {
  let container: HTMLDivElement;
  let root: Root;
  let on_contacts_open_change: Mock<(is_open: boolean) => void>;
  let on_security_open_change: Mock<(is_open: boolean) => void>;

  const render_rail = async (initial_path = "/", is_contacts_open = false) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initial_path]}>
          <AppRail
            is_contacts_open={is_contacts_open}
            is_security_open={false}
            on_compose={() => {}}
            on_contacts_open_change={on_contacts_open_change}
            on_security_open_change={on_security_open_change}
          />
          <LocationProbe />
        </MemoryRouter>,
      );
    });
  };

  const rail_items = () =>
    Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        ".app_rail_column button[aria-expanded]",
      ),
    );

  const rail_labels = () =>
    rail_items().map((button) => button.getAttribute("aria-label"));

  const rail_item = (label: string) =>
    rail_items().find((button) => button.getAttribute("aria-label") === label);

  const path = () =>
    container.querySelector('[data-testid="path"]')?.textContent;

  beforeEach(() => {
    open_external.mockReset();
    on_contacts_open_change = vi.fn<(is_open: boolean) => void>();
    on_security_open_change = vi.fn<(is_open: boolean) => void>();
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("leaves Mail out of the rail because the app launcher lists it", async () => {
    await render_rail();

    expect(rail_labels()).toEqual([
      "common.app_name_calendar",
      "common.contacts",
      "common.security_center",
    ]);
    expect(rail_item("common.app_name_mail")).toBeUndefined();
  });

  it.each([
    ["common.app_name_calendar", "rail"],
    ["common.contacts", "contacts"],
    ["common.security_center", "security"],
  ])("draws %s with the bundled brand artwork", async (label, marker) => {
    await render_rail();

    const item = rail_item(label);
    const icon = item?.querySelector("svg.app_rail_icon");
    const href = icon?.querySelector("image")?.getAttribute("href");

    expect(
      icon?.getAttribute("data-app-rail-icon") ??
        icon?.getAttribute("data-dated-calendar-icon"),
    ).toBe(marker);
    expect(href?.startsWith("data:image/png;base64,")).toBe(true);
    expect(item?.querySelector("img")).toBeNull();
    expect(item?.querySelector("svg[stroke]")).toBeNull();
  });

  it("never swaps the rail to outline icons when artwork reports an error", async () => {
    await render_rail();

    const rail = container.querySelector(".app_rail_column");
    const before = rail?.innerHTML;

    act(() => {
      rail
        ?.querySelectorAll("image")
        .forEach((image) => image.dispatchEvent(new Event("error")));
    });

    expect(rail?.innerHTML).toBe(before);
    expect(rail?.querySelectorAll("svg.app_rail_icon image")).toHaveLength(3);
    expect(rail?.innerHTML).not.toContain("M6.75 3v2.25M17.25 3v2.25");
    expect(rail?.innerHTML).not.toContain(
      "M15 19.128a9.38 9.38 0 0 0 2.625.372",
    );
  });

  it("never marks the Calendar shortcut as an open panel", async () => {
    await render_rail();

    expect(
      rail_item("common.app_name_calendar")?.getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("returns to today in the calendar when Calendar is chosen", async () => {
    const listener = vi.fn();

    window.addEventListener("aster-calendar-home", listener);
    await render_rail("/settings/appearance");

    await act(async () => {
      rail_item("common.app_name_calendar")?.click();
    });
    window.removeEventListener("aster-calendar-home", listener);

    expect(path()).toBe("/");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(open_external).not.toHaveBeenCalled();
  });

  it("toggles Contacts from the rail", async () => {
    await render_rail();

    await act(async () => {
      rail_item("common.contacts")?.click();
    });

    expect(on_contacts_open_change).toHaveBeenCalledWith(true);
    expect(on_security_open_change).toHaveBeenCalledWith(false);
  });
});
