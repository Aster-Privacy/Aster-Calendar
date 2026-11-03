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
import type { TranslationKey } from "@/lib/i18n";

import { calendar_booking_available } from "@/lib/app_kind";
import { calendar_plan_limits } from "@/lib/calendar_plan_limits";

type translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

interface tier_highlights {
  storage: string;
}

const TIER_HIGHLIGHTS: Record<string, tier_highlights> = {
  star: {
    storage: "50 GB",
  },
  nova: {
    storage: "500 GB",
  },
  supernova: {
    storage: "5 TB",
  },
};

export function checkout_highlights(plan_code: string, t: translate): string[] {
  const tier = TIER_HIGHLIGHTS[plan_code];

  if (!tier) return [];

  const limits = calendar_plan_limits(plan_code);

  return [
    t("settings.cal_plan_feat_calendars", { value: limits.calendars }),
    ...(calendar_booking_available()
      ? [
          t("settings.cal_plan_feat_booking", {
            value: limits.booking_pages,
          }),
          t("settings.cal_plan_feat_no_branding"),
        ]
      : []),
    `${tier.storage} ${t("settings.encrypted_storage_suffix")}`,
    t("settings.plan_f_calendar_invites"),
    t("settings.f_e2ee"),
    t("settings.f_zero_knowledge"),
    t("settings.plan_f_support_priority"),
  ];
}
