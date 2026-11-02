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
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();

vi.mock("@/services/api/client", () => ({
  api_client: {
    post: (...args: unknown[]) => post(...args),
  },
}));

const {
  fetch_subscription_events,
  is_subscription_event,
  MAX_SUBSCRIPTION_RECURRING_EVENTS,
} = await import(
  "@/services/calendar/subscriptions"
);

const SUBSCRIPTION = {
  id: "sub-1",
  url: "https://example.com/feed.ics?a=1&b=2",
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
  "LOCATION:Room 1",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:feed-2",
  "SUMMARY:Offsite",
  "DTSTART;VALUE=DATE:20260312",
  "DTEND;VALUE=DATE:20260313",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

beforeEach(() => {
  post.mockReset();
});

describe("subscription events", () => {
  it("recognizes subscription ids by prefix", () => {
    expect(is_subscription_event({ id: "subscription-sub-1-0" })).toBe(true);
    expect(is_subscription_event({ id: "evt-1" })).toBe(false);
  });

  it("posts the feed url to the backend proxy", async () => {
    post.mockResolvedValue({ data: { ics: FEED } });

    await fetch_subscription_events(SUBSCRIPTION);

    expect(post).toHaveBeenCalledWith("/calendar/v1/subscriptions/fetch", {
      url: SUBSCRIPTION.url,
    });
  });

  it("returns nothing when the proxy has no body", async () => {
    post.mockResolvedValue({ data: null, error: "upstream", status: 502 });

    expect(await fetch_subscription_events(SUBSCRIPTION)).toEqual([]);
  });

  it("maps parsed feed entries onto read-only events in a virtual calendar", async () => {
    post.mockResolvedValue({ data: { ics: FEED } });

    const events = await fetch_subscription_events(SUBSCRIPTION);

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.id)).toEqual([
      "subscription-sub-1-ufeed-1",
      "subscription-sub-1-ufeed-2",
    ]);
    expect(events[0]).toMatchObject({
      calendar_id: "__subscription_sub-1__",
      color: "#123456",
      title: "Standup",
      location: "Room 1",
      is_all_day: false,
      availability: "free",
      attendees: [],
      recurrence_master_id: null,
    });
    expect(events[1]).toMatchObject({ title: "Offsite", is_all_day: true });
    expect(events.every((event) => is_subscription_event(event))).toBe(true);
  });

  function vevent(lines: string[]): string[] {
    return ["BEGIN:VEVENT", ...lines, "END:VEVENT"];
  }

  it("keys ids on uid and recurrence id and keeps them unique", async () => {
    const feed = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      ...vevent(["SUMMARY:No uid", "DTSTART:20260310T090000Z", "DTEND:20260310T093000Z"]),
      ...vevent(["UID:same", "SUMMARY:First", "DTSTART:20260311T090000Z", "DTEND:20260311T093000Z"]),
      ...vevent(["UID:same", "SUMMARY:Second", "DTSTART:20260312T090000Z", "DTEND:20260312T093000Z"]),
      ...vevent([
        "UID:same",
        "RECURRENCE-ID:20260313T090000Z",
        "SUMMARY:Moved",
        "DTSTART:20260313T100000Z",
        "DTEND:20260313T103000Z",
      ]),
      "END:VCALENDAR",
    ].join("\r\n");

    post.mockResolvedValue({ data: { ics: feed } });

    const ids = (await fetch_subscription_events(SUBSCRIPTION)).map((event) => event.id);

    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe("subscription-sub-1-n0");
    expect(ids[1]).toBe("subscription-sub-1-usame");
    expect(ids[2].startsWith("subscription-sub-1-usame.")).toBe(true);
    expect(ids[2]).not.toContain("::");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("caps the recurring events a feed can add", async () => {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0"];

    for (let index = 0; index < MAX_SUBSCRIPTION_RECURRING_EVENTS + 5; index += 1) {
      lines.push(
        ...vevent([
          `UID:r-${index}`,
          "SUMMARY:Daily",
          "DTSTART:20260310T090000Z",
          "DTEND:20260310T093000Z",
          "RRULE:FREQ=DAILY",
        ]),
      );
    }

    lines.push(
      ...vevent(["UID:single", "SUMMARY:Once", "DTSTART:20260310T090000Z", "DTEND:20260310T093000Z"]),
      "END:VCALENDAR",
    );
    post.mockResolvedValue({ data: { ics: lines.join("\r\n") } });

    const events = await fetch_subscription_events(SUBSCRIPTION);

    expect(events.filter((event) => event.recurrence !== null)).toHaveLength(
      MAX_SUBSCRIPTION_RECURRING_EVENTS,
    );
    expect(events.some((event) => event.title === "Once")).toBe(true);
  });
});
