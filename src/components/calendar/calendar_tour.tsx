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
import type { OnboardingStep } from "@/components/common/onboarding_tour";
import type { TranslationKey } from "@/lib/i18n/types";

import { useCallback, useEffect, useMemo } from "react";

import { OnboardingTour } from "@/components/common/onboarding_tour";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { safe_local_get } from "@/lib/safe_storage";

export const CALENDAR_FIRST_RUN_TOUR_KEY = "aster_calendar_first_run_tour";

export function get_calendar_tour_steps(
  t: (key: TranslationKey) => string,
): OnboardingStep[] {
  return [
    {
      title: t("calendar.tour_welcome_title"),
      description: t("calendar.tour_welcome_description"),
      position: "center",
    },
    {
      title: t("calendar.tour_create_title"),
      description: t("calendar.tour_create_description"),
      target_selector: "[data-onboarding='compose-button']",
      position: "right",
    },
    {
      title: t("calendar.tour_views_title"),
      description: t("calendar.tour_views_description"),
      target_selector: "[data-onboarding='view-switcher']",
      position: "bottom",
    },
    {
      title: t("calendar.tour_mini_month_title"),
      description: t("calendar.tour_mini_month_description"),
      target_selector: "[data-onboarding='mini-month']",
      position: "right",
    },
    {
      title: t("calendar.tour_calendars_title"),
      description: t("calendar.tour_calendars_description"),
      target_selector: "[data-onboarding='calendars-section']",
      position: "right",
    },
    {
      title: t("calendar.tour_search_title"),
      description: t("calendar.tour_search_description"),
      target_selector: "[data-onboarding='search-bar']",
      position: "bottom",
    },
    {
      title: t("calendar.tour_settings_title"),
      description: t("calendar.tour_settings_description"),
      target_selector: "[data-onboarding='settings-button']",
      position: "bottom",
    },
    {
      title: t("calendar.tour_done_title"),
      description: t("calendar.tour_done_description"),
      position: "center",
    },
  ];
}

interface CalendarTourProps {
  has_existing_events: boolean;
}

export function CalendarTour({ has_existing_events }: CalendarTourProps) {
  const { t } = use_i18n();
  const steps = useMemo(() => get_calendar_tour_steps(t), [t]);
  const { preferences, update_preference, has_loaded_from_server } =
    use_preferences();
  const synced_done = preferences.calendar_tour_completed === true;

  const mark_synced_done = useCallback(() => {
    update_preference("calendar_tour_completed", true, true);
  }, [update_preference]);

  useEffect(() => {
    if (!has_loaded_from_server || synced_done) return;
    if (
      has_existing_events ||
      safe_local_get(CALENDAR_FIRST_RUN_TOUR_KEY) === "done"
    ) {
      mark_synced_done();
    }
  }, [
    has_loaded_from_server,
    synced_done,
    has_existing_events,
    mark_synced_done,
  ]);

  if (!has_loaded_from_server || synced_done || has_existing_events) {
    return null;
  }

  return (
    <OnboardingTour
      on_finish={mark_synced_done}
      steps={steps}
      storage_key={CALENDAR_FIRST_RUN_TOUR_KEY}
    />
  );
}
