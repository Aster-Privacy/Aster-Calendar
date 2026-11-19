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

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    post: (...args: unknown[]) => mocks.post(...args),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mocks.invoke(...args),
}));

const { check_subscription, fetch_subscription_events } = await import(
  "@/services/calendar/subscriptions"
);
const FEED_RELAY_PATH = "/calendar/v1/subscriptions/fetch";

const FEED_URL = "https://feeds.example.com/team.ics?token=private-token";

const SUBSCRIPTION = {
  id: "sub-1",
  url: FEED_URL,
  name: "Team feed",
  color: "#123456",
};

const FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:feed-1",
  "SUMMARY:Standup",
  "DTSTART:20260310T090000Z",
  "DTEND:20260310T093000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const direct_fetch = vi.fn();

function feed_response(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/calendar" },
    ...init,
  });
}

function sent_to_server(): string {
  return JSON.stringify(mocks.post.mock.calls);
}

beforeEach(() => {
  mocks.post.mockReset();
  mocks.post.mockResolvedValue({ data: { ics: FEED } });
  mocks.invoke.mockReset();
  direct_fetch.mockReset();
  vi.stubGlobal("fetch", direct_fetch);
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("subscription feeds load without the browser contacting the feed host", () => {
  it("loads a browser feed only through the relay", async () => {
    direct_fetch.mockResolvedValue(feed_response(FEED));

    const events = await fetch_subscription_events(SUBSCRIPTION);

    expect(events.map((event) => event.title)).toEqual(["Standup"]);
    expect(direct_fetch).not.toHaveBeenCalled();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith(FEED_RELAY_PATH, { url: FEED_URL });
  });

  it("checks a browser feed only through the relay", async () => {
    direct_fetch.mockResolvedValue(feed_response(FEED));

    expect(await check_subscription(FEED_URL)).toBe(1);
    expect(direct_fetch).not.toHaveBeenCalled();
    expect(mocks.post).toHaveBeenCalledWith(FEED_RELAY_PATH, { url: FEED_URL });
  });

  it("sends a webcal feed to the relay as https", async () => {
    await fetch_subscription_events({
      ...SUBSCRIPTION,
      url: "webcal://feeds.example.com/team.ics",
    });

    expect(mocks.post).toHaveBeenCalledWith(FEED_RELAY_PATH, {
      url: "https://feeds.example.com/team.ics",
    });
    expect(direct_fetch).not.toHaveBeenCalled();
  });

  it("uses the native fetch in the desktop app and never the server", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    mocks.invoke.mockResolvedValue(FEED);

    const events = await fetch_subscription_events(SUBSCRIPTION);

    expect(events).toHaveLength(1);
    expect(mocks.invoke).toHaveBeenCalledWith("fetch_calendar_feed", {
      url: FEED_URL,
    });
    expect(direct_fetch).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("keeps the address on the desktop even when the native fetch fails", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    mocks.invoke.mockRejectedValue(new Error("feed could not be loaded"));

    expect(await fetch_subscription_events(SUBSCRIPTION)).toEqual([]);
    expect(sent_to_server()).not.toContain("private-token");
  });

  it("shows no events when the relay fails", async () => {
    mocks.post.mockRejectedValue(new Error("relay unavailable"));

    expect(await fetch_subscription_events(SUBSCRIPTION)).toEqual([]);
    expect(await check_subscription(FEED_URL)).toBeNull();
    expect(direct_fetch).not.toHaveBeenCalled();
  });

  it("ignores a relay response that is not a calendar", async () => {
    mocks.post.mockResolvedValue({ data: { ics: "<html>sign in</html>" } });

    expect(await fetch_subscription_events(SUBSCRIPTION)).toEqual([]);
  });

  it("does not load a plain http feed", async () => {
    expect(
      await fetch_subscription_events({
        ...SUBSCRIPTION,
        url: "http://feeds.example.com/team.ics",
      }),
    ).toEqual([]);
    expect(direct_fetch).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
