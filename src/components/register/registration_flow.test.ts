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
  first_onboarding_step,
  onboarding_resume_step,
  onboarding_steps,
  step_after_notifications,
  step_after_plan,
} from "./registration_flow";

describe("registration_flow", () => {
  it("keeps the mail onboarding order unchanged", () => {
    expect(onboarding_steps("mail")).toEqual([
      "download_apps",
      "notifications",
      "addresses",
      "custom_domain",
      "import_mail",
      "plan_selection",
    ]);
    expect(first_onboarding_step("mail")).toBe("download_apps");
    expect(step_after_notifications("mail")).toBe("addresses");
    expect(step_after_plan("mail")).toBeNull();
  });

  it("skips mail-only steps in the calendar order", () => {
    const steps = onboarding_steps("calendar");

    expect(steps).toEqual(["notifications", "plan_selection", "bring_calendar"]);
    for (const mail_only of [
      "download_apps",
      "addresses",
      "custom_domain",
      "import_mail",
    ] as const) {
      expect(steps).not.toContain(mail_only);
    }
    expect(first_onboarding_step("calendar")).toBe("notifications");
    expect(step_after_notifications("calendar")).toBe("plan_selection");
    expect(step_after_plan("calendar")).toBe("bring_calendar");
  });

  it("maps resumed steps onto each app's flow", () => {
    expect(onboarding_resume_step("mail", "import_mail")).toBe("import_mail");
    expect(onboarding_resume_step("mail", "academic_offer")).toBe(
      "download_apps",
    );
    expect(onboarding_resume_step("mail", "bring_calendar")).toBe(
      "plan_selection",
    );
    expect(onboarding_resume_step("calendar", "academic_offer")).toBe(
      "notifications",
    );
    expect(onboarding_resume_step("calendar", "download_apps")).toBe(
      "notifications",
    );
    expect(onboarding_resume_step("calendar", "custom_domain")).toBe(
      "plan_selection",
    );
    expect(onboarding_resume_step("calendar", "bring_calendar")).toBe(
      "bring_calendar",
    );
    expect(onboarding_resume_step("calendar", "recovery_key")).toBe(
      "recovery_key",
    );
  });
});
