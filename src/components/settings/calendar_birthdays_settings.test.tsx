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
  calendar_birthdays_removed?: boolean;
  calendar_birthdays_name?: string;
} = {};

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

vi.mock("@aster/ui", async (original) => ({
  ...(await original<typeof import("@aster/ui")>()),
  show_toast: (...args: unknown[]) => show_toast(...args),
}));

vi.mock("@/services/api/calendar", () => ({
  list_calendars: vi.fn(async () => ({ data: [] })),
}));

vi.mock("@/components/calendar/calendar_edit_dialog", () => ({
  CalendarClearDialog: () => null,
  CalendarDeleteDialog: () => null,
  CalendarEditDialog: () => null,
}));

vi.mock("@/components/ui/dropdown_menu", () => {
  const pass = ({ children }: { children?: ReactNode }) => <>{children}</>;

  return {
    DropdownMenu: pass,
    DropdownMenuTrigger: pass,
    DropdownMenuContent: ({ children }: { children?: ReactNode }) => (
      <div data-dropdown="">{children}</div>
    ),
    DropdownMenuItem: ({
      children,
      onSelect,
    }: {
      children?: ReactNode;
      onSelect?: () => void;
    }) => (
      <button data-dropdown-item="" type="button" onClick={onSelect}>
        {children}
      </button>
    ),
  };
});

import { CalendarListSection } from "@/components/settings/calendar_settings_section";
import { forget_local_visibility_cache } from "@/services/calendar/local_visibility";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<CalendarListSection />);
  });
}

function dropdown_item(label: string): HTMLButtonElement | undefined {
  return Array.from(
    container!.querySelectorAll<HTMLButtonElement>("[data-dropdown-item]"),
  ).find((item) => item.textContent?.includes(label));
}

beforeEach(() => {
  update_preference.mockReset();
  update_preferences.mockReset();
  show_toast.mockReset();
  delete preferences_state.calendar_birthdays_removed;
  delete preferences_state.calendar_birthdays_name;
  window.localStorage.clear();
  forget_local_visibility_cache();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("CalendarListSection birthdays calendar", () => {
  it("lists the birthdays calendar with edit and remove options", async () => {
    preferences_state.calendar_birthdays_name = "Family";
    await render();

    expect(container!.textContent).toContain("Family");
    expect(dropdown_item("calendar.edit_calendar")).toBeDefined();

    act(() => dropdown_item("calendar.remove_birthdays_calendar")!.click());

    expect(update_preference).toHaveBeenCalledWith(
      "calendar_birthdays_removed",
      true,
    );
  });

  it("adds a removed birthdays calendar back", async () => {
    preferences_state.calendar_birthdays_removed = true;
    await render();

    expect(dropdown_item("calendar.remove_birthdays_calendar")).toBeUndefined();

    const add_back = container!.querySelector<HTMLButtonElement>(
      "[data-birthdays-restore]",
    );

    expect(add_back).not.toBeNull();

    act(() => add_back!.click());

    expect(update_preference).toHaveBeenCalledWith(
      "calendar_birthdays_removed",
      false,
    );
    expect(show_toast).toHaveBeenCalledWith(
      "calendar.birthdays_restored_toast",
      "success",
    );
  });
});
