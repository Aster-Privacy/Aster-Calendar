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
import { beforeEach, describe, expect, it } from "vitest";

import { calendar_plan_limit_resource } from "./calendar_plan_limit_resource";

import {
  close_upgrade_modal,
  get_upgrade_snapshot,
  show_plan_limit_upgrade,
} from "@/stores/upgrade_store";

describe("calendar_plan_limit_resource", () => {
  beforeEach(() => {
    close_upgrade_modal();
    window.history.pushState({}, "", "/");
  });

  it("names the calendar resource behind a rejected endpoint", () => {
    expect(calendar_plan_limit_resource("/calendar/v1/calendars")).toBe(
      "calendars",
    );
    expect(calendar_plan_limit_resource("/calendar/v1/calendars/abc")).toBe(
      "calendars",
    );
    expect(calendar_plan_limit_resource("/calendar/v1/calendars?x=1")).toBe(
      "calendars",
    );
    expect(calendar_plan_limit_resource("/calendar/v1/schedules")).toBe(
      "booking pages",
    );
  });

  it("ignores endpoints that are not calendar limits", () => {
    expect(calendar_plan_limit_resource("/calendar/v1/events")).toBeNull();
    expect(calendar_plan_limit_resource("/calendar/v1/calendarsx")).toBeNull();
    expect(calendar_plan_limit_resource("/mail/v1/aliases")).toBeNull();
  });

  it("opens the upgrade flow with the calendar limit", () => {
    show_plan_limit_upgrade({
      resource: calendar_plan_limit_resource("/calendar/v1/calendars"),
    });
    expect(get_upgrade_snapshot().is_open).toBe(true);
    expect(get_upgrade_snapshot().limit_key).toBe("max_calendars");

    close_upgrade_modal();
    show_plan_limit_upgrade({
      resource: calendar_plan_limit_resource("/calendar/v1/schedules"),
    });
    expect(get_upgrade_snapshot().limit_key).toBe("max_booking_pages");
  });
});
