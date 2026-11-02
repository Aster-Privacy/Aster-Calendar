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
import { describe, expect, it } from "vitest";

import {
  build_event_link,
  read_event_link,
  strip_event_link,
} from "@/components/calendar/event_link";

const location = { origin: "https://app.example", pathname: "/calendar" };

describe("event_link", () => {
  it("builds a link with the event id and local start date", () => {
    const link = build_event_link(location, {
      id: "evt_1",
      starts_at: new Date(2026, 10, 1, 9, 30).toISOString(),
    });

    expect(link).toBe(
      "https://app.example/calendar?event=evt_1&date=2026-11-01",
    );
  });

  it("omits the date when the start is not a valid timestamp", () => {
    const link = build_event_link(location, {
      id: "evt_2",
      starts_at: "not-a-date",
    });

    expect(link).toBe("https://app.example/calendar?event=evt_2");
  });

  it("reads the id and date back from a search string", () => {
    const target = read_event_link("?event=evt_1&date=2026-11-01");

    expect(target?.event_id).toBe("evt_1");
    expect(target?.date?.getFullYear()).toBe(2026);
    expect(target?.date?.getMonth()).toBe(10);
    expect(target?.date?.getDate()).toBe(1);
  });

  it("ignores an impossible date but keeps the id", () => {
    const target = read_event_link("?event=evt_1&date=2026-02-30");

    expect(target).toEqual({ event_id: "evt_1", date: null });
  });

  it("returns null without an event id", () => {
    expect(read_event_link("?date=2026-11-01")).toBeNull();
    expect(read_event_link("")).toBeNull();
  });

  it("strips only the link params from a URL", () => {
    expect(
      strip_event_link(
        "https://app.example/calendar?event=evt_1&date=2026-11-01&view=week",
      ),
    ).toBe("https://app.example/calendar?view=week");
  });
});
