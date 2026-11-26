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
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  hold_calendar_floors,
  release_held_calendar_floors,
} from "@/services/calendar/preferences_floor_hold";
import { stored_v3_floor } from "@/services/calendar/calendar_v3_floor_store";

let account_counter = 0;
let ACCOUNT = "";

function prefs(
  v3_only: boolean,
  event: Record<string, number>,
  calendar: Record<string, number> = {},
) {
  return {
    calendar_v3_only: v3_only,
    calendar_revision_floors: { event, calendar },
  };
}

describe("calendar floor hold", () => {
  beforeEach(() => {
    account_counter += 1;
    ACCOUNT = "acct-floor-hold-" + account_counter;
  });

  afterEach(() => {
    release_held_calendar_floors(ACCOUNT);
    release_held_calendar_floors("acct-other-" + account_counter);
    window.localStorage.clear();
  });

  it("keeps a newer blob unchanged", () => {
    const fresh = prefs(true, { e1: 5 });

    expect(hold_calendar_floors(fresh, ACCOUNT)).toBe(fresh);
  });

  it("does not let an older blob lower the floors or the v3 rule", () => {
    hold_calendar_floors(prefs(true, { e1: 9 }, { c1: 4 }), ACCOUNT);

    const held = hold_calendar_floors(prefs(false, { e1: 3 }), ACCOUNT);

    expect(held.calendar_v3_only).toBe(true);
    expect(held.calendar_revision_floors.event.e1).toBe(9);
    expect(held.calendar_revision_floors.calendar.c1).toBe(4);
  });

  it("raises the held floors when a blob carries higher ones", () => {
    hold_calendar_floors(prefs(false, { e1: 2 }), ACCOUNT);

    const held = hold_calendar_floors(prefs(false, { e1: 7, e2: 1 }), ACCOUNT);

    expect(held.calendar_revision_floors.event).toEqual({ e1: 7, e2: 1 });
    expect(held.calendar_v3_only).toBe(false);
  });

  it("keeps the floors after a reload", () => {
    hold_calendar_floors(prefs(true, { e1: 11 }), ACCOUNT);
    const stored = window.localStorage.getItem(
      "aster_calendar_prefs_floor:" + ACCOUNT,
    );

    release_held_calendar_floors(ACCOUNT);
    window.localStorage.setItem(
      "aster_calendar_prefs_floor:" + ACCOUNT,
      stored ?? "",
    );

    const held = hold_calendar_floors(prefs(false, {}), ACCOUNT);

    expect(held.calendar_revision_floors.event.e1).toBe(11);
    expect(held.calendar_v3_only).toBe(true);
    expect(stored_v3_floor(ACCOUNT)).toBe(true);
  });

  it("keeps accounts apart", () => {
    hold_calendar_floors(prefs(true, { e1: 9 }), ACCOUNT);

    const other = prefs(false, { e1: 1 });

    expect(hold_calendar_floors(other, "acct-other-" + account_counter)).toBe(other);
  });

  it("passes the blob through when no account is known", () => {
    const blob = prefs(false, {});

    expect(hold_calendar_floors(blob, null)).toBe(blob);
  });

  it("ignores a corrupt stored record", () => {
    window.localStorage.setItem(
      "aster_calendar_prefs_floor:" + ACCOUNT,
      "{not json",
    );

    const held = hold_calendar_floors(prefs(false, { e1: 2 }), ACCOUNT);

    expect(held.calendar_revision_floors.event.e1).toBe(2);
  });
});
