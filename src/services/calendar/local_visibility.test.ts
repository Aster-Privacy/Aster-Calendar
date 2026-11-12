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

import {
  all_visibility,
  apply_calendar_visibility,
  apply_subscription_visibility,
  forget_local_visibility_cache,
  parse_local_visibility,
  read_local_visibility,
  seed_local_visibility,
  set_calendar_hidden,
  set_subscription_hidden,
  show_only_visibility,
  subscribe_local_visibility,
  update_local_visibility,
  visibility_storage_key,
  write_local_visibility,
  type LocalVisibility,
} from "@/services/calendar/local_visibility";

const EMPTY: LocalVisibility = {
  hidden_calendar_ids: [],
  hidden_subscription_ids: [],
  birthdays_hidden: false,
  holidays_hidden: false,
};

const SYNCED = {
  calendars: [
    { id: "work", is_visible: true },
    { id: "home", is_visible: false },
  ],
  subscriptions: [{ id: "team", hidden: true }, { id: "sports" }],
  birthdays_hidden: true,
};

beforeEach(() => {
  window.localStorage.clear();
  forget_local_visibility_cache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("local calendar visibility storage", () => {
  it("seeds once from the synced values", () => {
    const seeded = seed_local_visibility("user-1", SYNCED);

    expect(seeded).toEqual({
      hidden_calendar_ids: ["home"],
      hidden_subscription_ids: ["team"],
      birthdays_hidden: true,
      holidays_hidden: false,
    });

    const reseeded = seed_local_visibility("user-1", {
      calendars: [{ id: "work", is_visible: false }],
      subscriptions: [],
      birthdays_hidden: false,
    });

    expect(reseeded).toEqual(seeded);
    expect(
      JSON.parse(
        window.localStorage.getItem(visibility_storage_key("user-1"))!,
      ),
    ).toEqual(seeded);
  });

  it("keeps each account separate", () => {
    write_local_visibility("user-1", { ...EMPTY, holidays_hidden: true });

    expect(read_local_visibility("user-2")).toBeNull();
    expect(read_local_visibility("user-1")?.holidays_hidden).toBe(true);
  });

  it("reads back from storage after the cache is cleared", () => {
    write_local_visibility("user-1", {
      ...EMPTY,
      hidden_calendar_ids: ["work"],
    });
    forget_local_visibility_cache();

    expect(read_local_visibility("user-1")?.hidden_calendar_ids).toEqual([
      "work",
    ]);
  });

  it("does nothing without an account", () => {
    write_local_visibility(null, EMPTY);

    expect(read_local_visibility(null)).toBeNull();
    expect(seed_local_visibility(null, SYNCED)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it("keeps working when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(read_local_visibility("user-1")).toBeNull();

    write_local_visibility("user-1", { ...EMPTY, birthdays_hidden: true });

    expect(read_local_visibility("user-1")?.birthdays_hidden).toBe(true);
  });

  it("ignores malformed stored values", () => {
    expect(parse_local_visibility("not json")).toBeNull();
    expect(parse_local_visibility("[]")).toBeNull();
    expect(parse_local_visibility(null)).toBeNull();
    expect(
      parse_local_visibility(
        JSON.stringify({
          hidden_calendar_ids: ["a", 3, "a"],
          hidden_subscription_ids: "b",
          birthdays_hidden: "yes",
          holidays_hidden: true,
        }),
      ),
    ).toEqual({
      hidden_calendar_ids: ["a"],
      hidden_subscription_ids: [],
      birthdays_hidden: false,
      holidays_hidden: true,
    });
  });

  it("updates from the fallback and notifies listeners", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe_local_visibility(listener);

    update_local_visibility("user-1", EMPTY, (current) =>
      set_calendar_hidden(current, "work", true),
    );
    update_local_visibility("user-1", EMPTY, (current) =>
      set_subscription_hidden(current, "team", true),
    );

    expect(read_local_visibility("user-1")).toEqual({
      ...EMPTY,
      hidden_calendar_ids: ["work"],
      hidden_subscription_ids: ["team"],
    });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    update_local_visibility("user-1", EMPTY, (current) => current);

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("local calendar visibility changes", () => {
  it("adds and removes ids without duplicates", () => {
    const hidden = set_calendar_hidden(
      set_calendar_hidden(EMPTY, "work", true),
      "work",
      true,
    );

    expect(hidden.hidden_calendar_ids).toEqual(["work"]);
    expect(
      set_calendar_hidden(hidden, "work", false).hidden_calendar_ids,
    ).toEqual([]);
  });

  it("shows only one source of each kind", () => {
    const calendar_ids = ["work", "home"];
    const subscription_ids = ["team", "sports"];

    expect(
      show_only_visibility(
        { kind: "calendar", id: "home" },
        calendar_ids,
        subscription_ids,
      ),
    ).toEqual({
      hidden_calendar_ids: ["work"],
      hidden_subscription_ids: ["team", "sports"],
      birthdays_hidden: true,
      holidays_hidden: true,
    });
    expect(
      show_only_visibility(
        { kind: "subscription", id: "sports" },
        calendar_ids,
        subscription_ids,
      ),
    ).toEqual({
      hidden_calendar_ids: ["work", "home"],
      hidden_subscription_ids: ["team"],
      birthdays_hidden: true,
      holidays_hidden: true,
    });
    expect(
      show_only_visibility(
        { kind: "holidays" },
        calendar_ids,
        subscription_ids,
      ),
    ).toEqual({
      hidden_calendar_ids: ["work", "home"],
      hidden_subscription_ids: ["team", "sports"],
      birthdays_hidden: true,
      holidays_hidden: false,
    });
    const birthdays_only = show_only_visibility(
      { kind: "birthdays" },
      calendar_ids,
      subscription_ids,
    );

    expect(birthdays_only.birthdays_hidden).toBe(false);
  });

  it("shows or hides everything", () => {
    expect(all_visibility(true, ["work"], ["team"])).toEqual({
      hidden_calendar_ids: ["work"],
      hidden_subscription_ids: ["team"],
      birthdays_hidden: true,
      holidays_hidden: true,
    });
    expect(all_visibility(false, ["work"], ["team"])).toEqual(EMPTY);
  });
});

describe("local calendar visibility filtering", () => {
  it("overrides the synced calendar flag", () => {
    const calendars = [
      { id: "work", is_visible: true, name: "Work" },
      { id: "home", is_visible: false, name: "Home" },
    ];
    const result = apply_calendar_visibility(calendars, {
      ...EMPTY,
      hidden_calendar_ids: ["work"],
    });

    expect(result).toEqual([
      { id: "work", is_visible: false, name: "Work" },
      { id: "home", is_visible: true, name: "Home" },
    ]);
    expect(calendars[0].is_visible).toBe(true);
  });

  it("returns the same list when nothing changes", () => {
    const calendars = [{ id: "work", is_visible: true }];

    expect(apply_calendar_visibility(calendars, EMPTY)).toBe(calendars);
  });

  it("overrides the synced subscription flag", () => {
    const subscriptions = [{ id: "team", hidden: true }, { id: "sports" }];

    expect(
      apply_subscription_visibility(subscriptions, {
        ...EMPTY,
        hidden_subscription_ids: ["sports"],
      }),
    ).toEqual([
      { id: "team", hidden: false },
      { id: "sports", hidden: true },
    ]);
  });
});
