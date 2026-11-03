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
import { describe, expect, it } from "vitest";

import {
  FIRST_ONBOARDING_STEP,
  ONBOARDING_STEPS,
  STEP_AFTER_NOTIFICATIONS,
  STEP_AFTER_PLAN,
} from "./registration_flow";

describe("registration_flow", () => {
  it("runs the calendar onboarding order", () => {
    expect(ONBOARDING_STEPS).toEqual([
      "notifications",
      "plan_selection",
      "bring_calendar",
    ]);
    expect(FIRST_ONBOARDING_STEP).toBe("notifications");
    expect(STEP_AFTER_NOTIFICATIONS).toBe("plan_selection");
    expect(STEP_AFTER_PLAN).toBe("bring_calendar");
  });
});
