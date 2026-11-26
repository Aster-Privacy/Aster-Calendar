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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { list_calendars, peek_calendars } from "@/services/api/calendar";
import {
  seed_settings_calendars,
  use_settings_calendars,
  type SettingsCalendarsState,
} from "@/components/settings/use_settings_calendars";

vi.mock("@/services/api/calendar", () => ({
  list_calendars: vi.fn(),
  peek_calendars: vi.fn(() => []),
}));

const work = { id: "cal-1", name: "Work" } as unknown as DecryptedCalendar;

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let observed: SettingsCalendarsState[] = [];

function Probe() {
  const { calendars, is_settled } = use_settings_calendars();

  observed.push({ calendars, is_settled });

  return null;
}

describe("seed_settings_calendars", () => {
  it("is settled when the cache has calendars", () => {
    expect(seed_settings_calendars([work]).is_settled).toBe(true);
  });

  it("waits for the server when the cache is empty", () => {
    expect(seed_settings_calendars([]).is_settled).toBe(false);
  });
});

describe("use_settings_calendars", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    observed = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  async function render() {
    await act(async () => {
      root.render(<Probe />);
    });
  }

  it("renders cached calendars on the first render", async () => {
    vi.mocked(peek_calendars).mockReturnValue([work]);
    vi.mocked(list_calendars).mockReturnValue(new Promise(() => {}));
    await render();

    expect(observed[0]).toEqual({ calendars: [work], is_settled: true });
  });

  it("settles once the server responds", async () => {
    vi.mocked(peek_calendars).mockReturnValue([]);
    vi.mocked(list_calendars).mockResolvedValue({ data: [work] } as never);
    await render();

    expect(observed[0].is_settled).toBe(false);
    expect(observed[observed.length - 1]).toEqual({
      calendars: [work],
      is_settled: true,
    });
  });

  it("settles when the server request fails", async () => {
    vi.mocked(peek_calendars).mockReturnValue([]);
    vi.mocked(list_calendars).mockRejectedValue(new Error("offline"));
    await render();

    expect(observed[observed.length - 1]).toEqual({
      calendars: [],
      is_settled: true,
    });
  });
});
