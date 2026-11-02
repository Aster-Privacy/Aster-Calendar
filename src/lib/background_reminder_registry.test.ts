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

import { create_background_reminder_registry } from "@/lib/background_reminder_registry";

const NOW = 1_000_000;

function reminder(key: string, delay = 60_000) {
  return { key, title: "Standup", body: "9:00", fire_at: NOW + delay };
}

describe("background reminder registry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps another tab's reminders when one tab clears its own", () => {
    const show = vi.fn();
    const registry = create_background_reminder_registry(show, () => NOW);

    registry.set("tab-a", [reminder("a")]);
    registry.set("tab-b", [reminder("b")]);
    registry.clear("tab-a");
    vi.advanceTimersByTime(60_000);

    expect(show).toHaveBeenCalledTimes(1);
    expect(show.mock.calls[0][0].key).toBe("b");
  });

  it("shows a reminder that two tabs scheduled only once", () => {
    const show = vi.fn();
    const registry = create_background_reminder_registry(show, () => NOW);

    registry.set("tab-a", [reminder("a")]);
    registry.set("tab-b", [reminder("a")]);
    registry.clear("tab-a");

    expect(registry.size()).toBe(1);

    vi.advanceTimersByTime(60_000);

    expect(show).toHaveBeenCalledTimes(1);
  });

  it("replaces only the sending tab's list", () => {
    const show = vi.fn();
    const registry = create_background_reminder_registry(show, () => NOW);

    registry.set("tab-a", [reminder("a"), reminder("shared")]);
    registry.set("tab-b", [reminder("shared")]);
    registry.set("tab-a", []);

    expect(registry.size()).toBe(1);

    vi.advanceTimersByTime(60_000);

    expect(show.mock.calls.map((call) => call[0].key)).toEqual(["shared"]);
  });

  it("drops a fired reminder for every tab and clears all on sign-out", () => {
    const show = vi.fn();
    const registry = create_background_reminder_registry(show, () => NOW);

    registry.set("tab-a", [reminder("a"), reminder("b")]);
    registry.set("tab-b", [reminder("a")]);
    registry.drop("a");

    expect(registry.size()).toBe(1);

    registry.clear_all();
    vi.advanceTimersByTime(60_000);

    expect(show).not.toHaveBeenCalled();
  });

  it("ignores reminders that are already past due or malformed", () => {
    const show = vi.fn();
    const registry = create_background_reminder_registry(show, () => NOW);

    registry.set("tab-a", [reminder("late", -1000), { key: 5 }]);

    expect(registry.size()).toBe(0);
  });
});
