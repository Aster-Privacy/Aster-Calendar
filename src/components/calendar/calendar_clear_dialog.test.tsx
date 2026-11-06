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
import type { DecryptedCalendar } from "@/types/calendar";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const show_toast = vi.fn();
const list_calendar_event_ids = vi.fn();
const delete_all_calendar_events = vi.fn();

const translate = (key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: translate, language: "en" }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => show_toast(...args),
}));

vi.mock("@/services/api/calendar", () => ({
  create_calendar: vi.fn(),
  delete_calendar: vi.fn(),
  update_calendar: vi.fn(),
  list_calendar_event_ids: (...args: unknown[]) =>
    list_calendar_event_ids(...args),
  delete_all_calendar_events: (...args: unknown[]) =>
    delete_all_calendar_events(...args),
}));

vi.mock("@/services/calendar/sync_engine", () => ({
  calendar_sync_engine: {},
}));

vi.mock("@/stores/upgrade_store", () => ({
  show_plan_limit_upgrade: vi.fn(),
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: ({
    is_open,
    is_loading,
    title,
    message,
    confirm_text,
    on_confirm,
  }: {
    is_open: boolean;
    is_loading?: boolean;
    title: string;
    message: string;
    confirm_text: string;
    on_confirm: () => void;
  }) =>
    is_open ? (
      <div data-confirm="" data-loading={is_loading ? "true" : "false"}>
        <span data-title="">{title}</span>
        <span data-message="">{message}</span>
        <button data-confirm-ok="" type="button" onClick={on_confirm}>
          {confirm_text}
        </button>
      </div>
    ) : null,
}));

const { CalendarClearDialog } = await import(
  "@/components/calendar/calendar_edit_dialog"
);

const WORK: DecryptedCalendar = {
  color: "#14b8a6",
  icon: "briefcase",
  id: "cal-work",
  is_default: false,
  is_visible: true,
  name: "Work",
};

let container: HTMLDivElement;
let root: Root;
const on_close = vi.fn();

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function render(calendar: DecryptedCalendar | null) {
  await act(async () => {
    root.render(<CalendarClearDialog calendar={calendar} on_close={on_close} />);
  });
  await flush();
}

function text(selector: string): string {
  return container.querySelector(selector)?.textContent ?? "";
}

async function confirm() {
  await act(async () => {
    (container.querySelector("[data-confirm-ok]") as HTMLButtonElement).click();
  });
  await flush();
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  show_toast.mockReset();
  list_calendar_event_ids.mockReset();
  delete_all_calendar_events.mockReset();
  on_close.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("CalendarClearDialog", () => {
  it("shows the event count and name before deleting", async () => {
    list_calendar_event_ids.mockResolvedValue(["a", "b", "c"]);

    await render(WORK);

    expect(list_calendar_event_ids).toHaveBeenCalledWith("cal-work");
    expect(text("[data-title]")).toBe("calendar.clear_calendar_title");
    expect(text("[data-message]")).toBe(
      'calendar.clear_calendar_message {"count":3,"name":"Work"}',
    );
    expect(delete_all_calendar_events).not.toHaveBeenCalled();
  });

  it("keeps the confirm button loading while counting", async () => {
    list_calendar_event_ids.mockReturnValue(new Promise(() => undefined));

    await render(WORK);

    expect(
      container.querySelector("[data-confirm]")?.getAttribute("data-loading"),
    ).toBe("true");
    expect(text("[data-message]")).toBe("calendar.clear_calendar_counting");

    await confirm();

    expect(delete_all_calendar_events).not.toHaveBeenCalled();
  });

  it("shows a notice and deletes nothing for an empty calendar", async () => {
    list_calendar_event_ids.mockResolvedValue([]);

    await render(WORK);

    expect(text("[data-title]")).toBe("calendar.clear_calendar_empty_title");
    expect(text("[data-message]")).toBe(
      'calendar.clear_calendar_empty_message {"name":"Work"}',
    );

    await confirm();

    expect(on_close).toHaveBeenCalled();
    expect(delete_all_calendar_events).not.toHaveBeenCalled();
  });

  it("deletes the chosen calendar's events and reports the count", async () => {
    list_calendar_event_ids.mockResolvedValue(["a", "b"]);
    delete_all_calendar_events.mockResolvedValue({ deleted: 2, failed: 0 });

    await render(WORK);
    await confirm();

    expect(delete_all_calendar_events).toHaveBeenCalledTimes(1);
    expect(delete_all_calendar_events).toHaveBeenCalledWith("cal-work");
    expect(show_toast).toHaveBeenLastCalledWith(
      'calendar.clear_calendar_done {"count":2}',
      "success",
    );
  });

  it("reports how many events could not be deleted", async () => {
    list_calendar_event_ids.mockResolvedValue(["a", "b"]);
    delete_all_calendar_events.mockResolvedValue({ deleted: 10, failed: 50 });

    await render(WORK);
    await confirm();

    expect(show_toast).toHaveBeenLastCalledWith(
      'calendar.clear_calendar_partial_failed {"count":50}',
      "error",
    );
  });

  it("closes with an error when the events cannot be counted", async () => {
    list_calendar_event_ids.mockRejectedValue(new Error("offline"));

    await render(WORK);

    expect(show_toast).toHaveBeenCalledWith(
      "calendar.clear_calendar_count_failed",
      "error",
    );
    expect(on_close).toHaveBeenCalled();
    expect(container.querySelector("[data-confirm]")).toBeNull();
    expect(delete_all_calendar_events).not.toHaveBeenCalled();
  });
});
