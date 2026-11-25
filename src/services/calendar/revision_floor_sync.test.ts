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
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { use_synced_revision_floors } from "@/components/calendar/use_synced_revision_floors";
import {
  build_merged_preferences,
  DEFAULT_PREFERENCES,
} from "@/services/api/preferences";
import {
  floors_to_publish,
  inherit_synced_floors,
  MAX_SYNCED_FLOORS,
  MAX_SYNCED_TOMBSTONES,
  merge_synced_floors,
  merge_synced_tombstones,
  read_synced_floors,
  tombstones_to_publish,
} from "@/services/calendar/revision_floor_sync";
import {
  accept_revision,
  is_rolled_back,
  is_tombstoned,
  known_revision,
  note_server_delete,
  observe_revision,
  record_tombstone,
  reset_revisions,
} from "@/services/calendar/revision_ledger";
import { TEMP_ID_PREFIX } from "@/services/calendar/temp_id";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("synced revision floors", () => {
  afterEach(() => {
    reset_revisions();
    vi.useRealTimers();
  });

  it("lets a new device refuse a rolled back event using the synced floor", () => {
    inherit_synced_floors({ event: { e1: 200 }, calendar: { c1: 90 } });

    expect(is_rolled_back("event", "e1", 150)).toBe(true);
    expect(is_rolled_back("event", "e1", 250)).toBe(false);
    expect(is_rolled_back("calendar", "c1", 80)).toBe(true);

    accept_revision("event", "e1", 150);
    expect(known_revision("event", "e1")).toBe(200);
  });

  it("keeps the higher local revision when the synced floor is older", () => {
    observe_revision("event", "e1", 500);
    inherit_synced_floors({ event: { e1: 200 }, calendar: {} });

    expect(known_revision("event", "e1")).toBe(500);
    expect(is_rolled_back("event", "e1", 300)).toBe(true);
  });

  it("merges two devices by taking the highest revision per event", () => {
    const merged = merge_synced_floors(
      { event: { a: 10, b: 40 }, calendar: { c: 5 } },
      { event: { a: 30, b: 20, d: 7 }, calendar: { c: 2, k: 9 } },
    );

    expect(merged).toEqual({
      event: { a: 30, b: 40, d: 7 },
      calendar: { c: 5, k: 9 },
    });
  });

  it("publishes only when this device knows a higher floor", () => {
    const stored = { event: { e1: 100 }, calendar: {} };

    observe_revision("event", "e1", 100);
    expect(floors_to_publish(stored)).toBeNull();

    observe_revision("event", "e1", 300);
    observe_revision("calendar", "c1", 40);
    expect(floors_to_publish(stored)).toEqual({
      event: { e1: 300 },
      calendar: { c1: 40 },
    });
  });

  it("ignores malformed stored values and placeholder ids", () => {
    const temp_id = `${TEMP_ID_PREFIX}pending`;

    expect(read_synced_floors(null)).toEqual({ event: {}, calendar: {} });
    expect(read_synced_floors("x")).toEqual({ event: {}, calendar: {} });
    expect(
      read_synced_floors({
        event: { a: "9", b: -1, c: 12.7, [temp_id]: 50 },
        calendar: [1, 2],
      }),
    ).toEqual({ event: { c: 12 }, calendar: {} });
  });

  it("caps the synced list and keeps the newest floors", () => {
    const many: Record<string, number> = {};

    for (let index = 0; index < MAX_SYNCED_FLOORS + 10; index += 1) {
      many[`e${index}`] = index + 1;
    }

    const merged = merge_synced_floors({ event: many, calendar: {} }, {});

    expect(Object.keys(merged.event)).toHaveLength(MAX_SYNCED_FLOORS);
    expect(merged.event.e0).toBeUndefined();
    expect(merged.event[`e${MAX_SYNCED_FLOORS + 9}`]).toBe(
      MAX_SYNCED_FLOORS + 10,
    );
  });

  it("stores the floors in the encrypted preferences with an empty default", () => {
    expect(DEFAULT_PREFERENCES.calendar_revision_floors).toEqual({
      event: {},
      calendar: {},
    });

    const merged = build_merged_preferences(
      { calendar_revision_floors: { event: { e1: 7 }, calendar: {} } },
      null,
    );

    expect(merged.calendar_revision_floors).toEqual({
      event: { e1: 7 },
      calendar: {},
    });
  });

  it("inherits the stored floors and publishes newer ones after the calendar settles", async () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const container = document.createElement("div");
    let root: Root | null = null;

    function Probe({ token }: { token: number }) {
      use_synced_revision_floors({
        loaded: true,
        settled: true,
        stored: { event: { e1: 200 }, calendar: {} },
        change_token: token,
        publish,
      });

      return null;
    }

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(Probe, { token: 1 }));
    });

    expect(is_rolled_back("event", "e1", 150)).toBe(true);

    observe_revision("event", "e2", 900);

    await act(async () => {
      root?.render(createElement(Probe, { token: 2 }));
      vi.advanceTimersByTime(10_000);
    });

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({
      event: { e1: 200, e2: 900 },
      calendar: {},
    });

    await act(async () => {
      root?.unmount();
    });
  });

  it("lets a new device refuse the last copy of an event deleted elsewhere", () => {
    inherit_synced_floors({ event: { e1: 2000 }, calendar: {} });

    expect(is_rolled_back("event", "e1", 2000)).toBe(false);

    expect(
      inherit_synced_floors(
        { event: { e1: 2000 }, calendar: {} },
        { event: { e1: 2000 }, calendar: {} },
      ),
    ).toBe(true);
    expect(is_rolled_back("event", "e1", 2000)).toBe(true);
    expect(is_rolled_back("event", "e1", 2001)).toBe(false);
  });

  it("publishes own deletes and leaves server deletes out", () => {
    observe_revision("event", "mine", 300);
    record_tombstone("event", "mine");
    observe_revision("event", "theirs", 400);
    note_server_delete("event", "theirs");

    expect(tombstones_to_publish({ event: {}, calendar: {} })).toEqual({
      event: { mine: 300 },
      calendar: {},
    });
    expect(
      tombstones_to_publish({ event: { mine: 300 }, calendar: {} }),
    ).toBeNull();
  });

  it("stops sharing a tombstone once a newer copy is confirmed", () => {
    observe_revision("event", "e1", 300);
    record_tombstone("event", "e1");
    accept_revision("event", "e1", 500);

    expect(is_tombstoned("event", "e1")).toBe(false);
    expect(
      tombstones_to_publish({ event: { e1: 300, e2: 50 }, calendar: {} }),
    ).toEqual({ event: { e2: 50 }, calendar: {} });
  });

  it("keeps the shared tombstones bounded by revision", () => {
    const many: Record<string, number> = {};

    for (let index = 0; index < MAX_SYNCED_TOMBSTONES + 10; index += 1) {
      many[`e${index}`] = index + 1;
    }

    const merged = merge_synced_tombstones({ event: many, calendar: {} }, {});

    expect(Object.keys(merged.event)).toHaveLength(MAX_SYNCED_TOMBSTONES);
    expect(merged.event.e0).toBeUndefined();
    expect(merged.event[`e${MAX_SYNCED_TOMBSTONES + 9}`]).toBe(
      MAX_SYNCED_TOMBSTONES + 10,
    );
  });

  it("stores the tombstones in the encrypted preferences with an empty default", () => {
    expect(DEFAULT_PREFERENCES.calendar_revision_tombstones).toEqual({
      event: {},
      calendar: {},
    });

    const merged = build_merged_preferences(
      { calendar_revision_tombstones: { event: { e1: 7 }, calendar: {} } },
      null,
    );

    expect(merged.calendar_revision_tombstones).toEqual({
      event: { e1: 7 },
      calendar: {},
    });
  });

  it("inherits and publishes tombstones from the hook", async () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const publish_tombstones = vi.fn();
    const on_tombstones_inherited = vi.fn();
    const container = document.createElement("div");
    let root: Root | null = null;
    const stored_tombstones = { event: { gone: 700 }, calendar: {} };

    function Probe({ token }: { token: number }) {
      use_synced_revision_floors({
        loaded: true,
        settled: true,
        stored: { event: {}, calendar: {} },
        change_token: token,
        publish,
        stored_tombstones,
        publish_tombstones,
        on_tombstones_inherited,
      });

      return null;
    }

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(Probe, { token: 1 }));
    });

    expect(on_tombstones_inherited).toHaveBeenCalledTimes(1);
    expect(is_rolled_back("event", "gone", 700)).toBe(true);

    observe_revision("event", "local", 900);
    record_tombstone("event", "local");

    await act(async () => {
      root?.render(createElement(Probe, { token: 2 }));
      vi.advanceTimersByTime(10_000);
    });

    expect(on_tombstones_inherited).toHaveBeenCalledTimes(1);
    expect(publish_tombstones).toHaveBeenCalledWith({
      event: { gone: 700, local: 900 },
      calendar: {},
    });

    await act(async () => {
      root?.unmount();
    });
  });
});
