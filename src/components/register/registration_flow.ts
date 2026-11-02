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
import type { AppKind } from "@/lib/app_kind";
import type { RegistrationStep } from "@/components/register/register_types";

const MAIL_ONBOARDING_STEPS: readonly RegistrationStep[] = [
  "download_apps",
  "notifications",
  "addresses",
  "custom_domain",
  "import_mail",
  "plan_selection",
];

const CALENDAR_ONBOARDING_STEPS: readonly RegistrationStep[] = [
  "notifications",
  "plan_selection",
  "bring_calendar",
];

export function onboarding_steps(kind: AppKind): readonly RegistrationStep[] {
  return kind === "calendar"
    ? CALENDAR_ONBOARDING_STEPS
    : MAIL_ONBOARDING_STEPS;
}

export function first_onboarding_step(kind: AppKind): RegistrationStep {
  return onboarding_steps(kind)[0];
}

export function step_after_notifications(kind: AppKind): RegistrationStep {
  return kind === "calendar" ? "plan_selection" : "addresses";
}

export function step_after_plan(kind: AppKind): RegistrationStep | null {
  return kind === "calendar" ? "bring_calendar" : null;
}

export function onboarding_resume_step(
  kind: AppKind,
  step: RegistrationStep,
): RegistrationStep {
  if (step === "academic_offer") return first_onboarding_step(kind);
  if (kind === "mail") {
    return step === "bring_calendar" ? "plan_selection" : step;
  }
  if (step === "download_apps") return "notifications";
  if (
    step === "addresses" ||
    step === "custom_domain" ||
    step === "import_mail"
  ) {
    return "plan_selection";
  }

  return step;
}
