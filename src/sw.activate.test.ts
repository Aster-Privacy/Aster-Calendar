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

type Listener = (event: unknown) => void;

const PUSH_STRINGS_CACHE = "aster_push_strings";
const STALE_APP_CACHES = [
  "workbox-precache-v2-https://calendar.astermail.org/",
  "aster-runtime-assets",
];

let listeners: Map<string, Listener>;
let cache_names: Set<string>;
let deleted: string[];
let window_clients: Array<{ visibilityState: string; postMessage: Listener }>;
let shown: ReturnType<typeof vi.fn>;

async function dispatch(type: string, data?: unknown): Promise<void> {
  const pending: Promise<unknown>[] = [];
  const listener = listeners.get(type);

  expect(listener).toBeDefined();
  listener!({
    data,
    origin: "",
    waitUntil: (promise: Promise<unknown>) => pending.push(promise),
  });
  await Promise.all(pending);
}

beforeEach(async () => {
  listeners = new Map();
  cache_names = new Set([PUSH_STRINGS_CACHE, ...STALE_APP_CACHES]);
  deleted = [];
  window_clients = [];
  shown = vi.fn(async () => undefined);

  vi.stubGlobal("caches", {
    keys: vi.fn(async () => [...cache_names]),
    delete: vi.fn(async (name: string) => {
      deleted.push(name);

      return cache_names.delete(name);
    }),
  });
  vi.stubGlobal("self", {
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, listener);
    },
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => window_clients),
    },
    registration: { showNotification: shown },
    location: { origin: "https://calendar.astermail.org" },
    navigator: { language: "en-US" },
  });

  vi.resetModules();
  await import("./sw");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("service worker activate", () => {
  it("keeps the push strings cache across app updates", async () => {
    await dispatch("activate");

    expect(cache_names.has(PUSH_STRINGS_CACHE)).toBe(true);
    expect(deleted).not.toContain(PUSH_STRINGS_CACHE);
  });

  it("still deletes every stale app cache", async () => {
    await dispatch("activate");

    expect(deleted).toHaveLength(STALE_APP_CACHES.length);
    expect([...deleted].sort()).toEqual([...STALE_APP_CACHES].sort());
  });

  it("titles a push notification with the calendar name", async () => {
    await dispatch("push", {
      json: () => ({ title: "Spoofed", type: "new_mail" }),
      text: () => "",
    });

    expect(shown).toHaveBeenCalledTimes(1);
    expect(shown.mock.calls[0][0]).toBe("Aster Calendar");
    expect(shown.mock.calls[0][1]).toMatchObject({
      body: "You have a new message",
      data: { url: "/" },
    });
  });

  it("opens only calendar routes from a notification", async () => {
    await dispatch("push", {
      json: () => ({ type: "test", url: "/settings/notifications" }),
      text: () => "",
    });
    await dispatch("push", {
      json: () => ({ type: "test", url: "/inbox" }),
      text: () => "",
    });

    expect(shown.mock.calls[0][1]).toMatchObject({
      data: { url: "/settings/notifications" },
    });
    expect(shown.mock.calls[1][1]).toMatchObject({ data: { url: "/" } });
  });

  it("removes every cache but the push strings on logout purge", async () => {
    await dispatch("message", { type: "LOGOUT_PURGE" });

    expect([...cache_names]).toEqual([PUSH_STRINGS_CACHE]);
  });
});


describe("background calendar reminders", () => {
  const reminder = {
    body: "10:00",
    fire_at: 0,
    key: "evt-1:2026-03-04T10:00:00.000Z:30",
    title: "Standup",
  };

  it("shows a reminder from the worker when every tab is hidden", async () => {
    vi.useFakeTimers();

    const hidden = { postMessage: vi.fn(), visibilityState: "hidden" };

    window_clients = [hidden];
    await dispatch("message", {
      reminders: [{ ...reminder, fire_at: Date.now() + 1_000 }],
      type: "CALENDAR_REMINDERS_SET",
    });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(shown).toHaveBeenCalledTimes(1);
    expect(shown.mock.calls[0][0]).toBe("Standup");
    expect(shown.mock.calls[0][1]).toMatchObject({
      body: "10:00",
      data: { url: "/" },
      tag: "aster-calendar-evt-1:2026-03-04T10:00:00.000Z:30",
    });
    expect(hidden.postMessage).toHaveBeenCalledWith({
      key: reminder.key,
      type: "aster_calendar_reminder_shown",
    });

    vi.useRealTimers();
  });

  it("leaves the reminder to a visible tab", async () => {
    vi.useFakeTimers();

    window_clients = [{ postMessage: vi.fn(), visibilityState: "visible" }];
    await dispatch("message", {
      reminders: [{ ...reminder, fire_at: Date.now() + 1_000 }],
      type: "CALENDAR_REMINDERS_SET",
    });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(shown).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("drops reminders that were cleared or already fired in a tab", async () => {
    vi.useFakeTimers();

    await dispatch("message", {
      reminders: [
        { ...reminder, fire_at: Date.now() + 1_000 },
        { ...reminder, fire_at: Date.now() + 2_000, key: "evt-2" },
      ],
      type: "CALENDAR_REMINDERS_SET",
    });
    await dispatch("message", {
      key: reminder.key,
      type: "CALENDAR_REMINDER_FIRED",
    });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(shown).not.toHaveBeenCalled();

    await dispatch("message", { type: "CALENDAR_REMINDERS_CLEAR" });
    await vi.advanceTimersByTimeAsync(2_000);

    expect(shown).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
