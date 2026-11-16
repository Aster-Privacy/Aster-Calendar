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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mocks = vi.hoisted(() => ({
  list_events: vi.fn(),
}));

vi.mock("@/services/api/calendar", () => ({
  list_events: mocks.list_events,
  subscribe_calendar_changes: () => () => {},
}));

vi.mock("@/services/calendar/sync_engine", () => ({
  CALENDAR_CHANGED_EVENT: "calendar-changed-test",
  calendar_sync_engine: {
    get_calendars: () => [],
    get_event_row: () => undefined,
  },
}));

vi.mock("@/services/calendar/calendar_crypto", () => ({
  calendar_write_key: async () => null,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_passphrase_from_memory: () => null,
  get_vault_from_memory: () => null,
}));

vi.mock("@/services/calendar/own_addresses", () => ({
  use_own_addresses_version: () => 0,
}));

vi.mock("@/services/calendar/birthdays", () => ({
  is_event_shown: () => true,
}));

vi.mock("@/pages/mail_panel/mail_panel_sources", () => ({
  build_birthday_events: () => [],
  build_holiday_events: () => [],
  expand_subscription_events: () => [],
  is_declined_by: () => false,
  load_birthday_sources: async () => [],
  load_subscription_events: async () => [],
}));

vi.mock("@/contexts/auth/use_auth_hook", () => ({
  use_auth: () => ({
    user: { id: "account-1", email: "me@example.com" },
    current_account_id: "account-1",
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { calendar_birthdays_hidden: true } }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

import {
  PANEL_LOAD_TIMEOUT_MS,
  use_mail_panel_events,
} from "@/pages/mail_panel/use_mail_panel_events";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const RANGE_START = new Date(2026, 10, 1);
const RANGE_END = new Date(2026, 11, 1);

let latest: ReturnType<typeof use_mail_panel_events> | null = null;

function Probe() {
  latest = use_mail_panel_events(RANGE_START, RANGE_END);

  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render_probe(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<Probe />);
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("mail panel events load", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.list_events.mockReset();
    latest = null;
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
  });

  it("stops loading and offers a retry when events never arrive", async () => {
    mocks.list_events.mockReturnValue(new Promise(() => {}));
    await render_probe();

    expect(latest?.status).toBe("loading");

    await advance(PANEL_LOAD_TIMEOUT_MS - 1);

    expect(latest?.status).toBe("loading");

    await advance(1);

    expect(latest?.status).toBe("failed");
  });

  it("shows events that arrive after the wait ran out", async () => {
    let resolve_events: (value: { data: [] }) => void = () => {};

    mocks.list_events.mockReturnValue(
      new Promise((resolve) => {
        resolve_events = resolve;
      }),
    );
    await render_probe();
    await advance(PANEL_LOAD_TIMEOUT_MS);

    expect(latest?.status).toBe("failed");

    mocks.list_events.mockResolvedValue({ data: [] });
    await act(async () => {
      resolve_events({ data: [] });
    });

    expect(latest?.status).toBe("ready");
  });

  it("loads again when you try again after a timeout", async () => {
    mocks.list_events.mockReturnValueOnce(new Promise(() => {}));
    await render_probe();
    await advance(PANEL_LOAD_TIMEOUT_MS);

    expect(latest?.status).toBe("failed");

    mocks.list_events.mockResolvedValue({ data: [] });
    await act(async () => {
      latest?.retry();
    });
    await advance(0);

    expect(latest?.status).toBe("ready");
  });

  it("stays ready when a background refresh is slow", async () => {
    mocks.list_events.mockResolvedValue({ data: [] });
    await render_probe();
    await advance(0);

    expect(latest?.status).toBe("ready");

    mocks.list_events.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      latest?.reload();
    });
    await advance(PANEL_LOAD_TIMEOUT_MS * 2);

    expect(latest?.status).toBe("ready");
  });
});
