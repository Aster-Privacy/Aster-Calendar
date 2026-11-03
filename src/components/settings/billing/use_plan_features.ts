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
import type { PlanFeature } from "@/components/settings/billing/plan_card";

import { useMemo } from "react";

import { calendar_booking_available } from "@/lib/app_kind";
import { calendar_plan_limits } from "@/lib/calendar_plan_limits";
import { use_i18n } from "@/lib/i18n/context";

type translate = ReturnType<typeof use_i18n>["t"];

function calendar_core_features(
  t: translate,
  plan_code: string,
): PlanFeature[] {
  const limits = calendar_plan_limits(plan_code);

  return [
    {
      label: t("settings.cal_plan_feat_calendars", {
        value: String(limits.calendars),
      }),
      on: true,
      icon: "calendar",
      description: t("settings.cal_plan_desc_calendars"),
    },
    {
      label: t("settings.plan_f_calendar_invites"),
      on: true,
      icon: "invite",
      description: t("settings.cal_plan_desc_invites"),
    },
    {
      label: t("settings.plan_f_calendar_reminders"),
      on: true,
      icon: "schedule",
      description: t("settings.cal_plan_desc_reminders"),
    },
    ...(calendar_booking_available()
      ? ([
          {
            label: t("settings.cal_plan_feat_booking", {
              value: String(limits.booking_pages),
            }),
            on: true,
            icon: "sync",
            description: t("settings.cal_plan_desc_booking"),
          },
          {
            label: t("settings.cal_plan_feat_no_branding"),
            on: limits.removes_branding,
            icon: "theme",
            description: t("settings.cal_plan_desc_no_branding"),
          },
        ] satisfies PlanFeature[])
      : []),
    {
      label: t("settings.plan_f_calendar_subscriptions"),
      on: true,
      icon: "import",
      description: t("settings.cal_plan_desc_subscriptions"),
    },
    {
      label: t("settings.plan_f_calendar_import_export"),
      on: true,
      icon: "export",
      description: t("settings.cal_plan_desc_import_export"),
    },
  ];
}

function calendar_plan_features(t: translate): Record<string, PlanFeature[]> {
  return {
    star: [
      {
        label: t("settings.plan_feat_storage_50"),
        on: true,
        icon: "storage",
      },
      ...calendar_core_features(t, "star"),
      {
        label: t("settings.plan_f_multi_accounts", { value: "3" }),
        on: true,
        icon: "accounts",
        description: t("settings.plan_desc_multi_accounts"),
      },
      {
        label: t("settings.plan_feat_priority_support"),
        on: true,
        icon: "support",
      },
    ],
    nova: [
      {
        label: t("settings.plan_feat_storage_500"),
        on: true,
        icon: "storage",
      },
      ...calendar_core_features(t, "nova"),
      {
        label: t("settings.plan_f_multi_accounts", { value: "5" }),
        on: true,
        icon: "accounts",
        description: t("settings.plan_desc_multi_accounts"),
      },
      {
        label: t("settings.plan_feat_priority_support"),
        on: true,
        icon: "support",
      },
    ],
    supernova: [
      {
        label: t("settings.plan_feat_storage_5tb"),
        on: true,
        icon: "storage",
      },
      ...calendar_core_features(t, "supernova"),
      {
        label: t("settings.plan_f_multi_accounts", { value: "20" }),
        on: true,
        icon: "accounts",
        description: t("settings.plan_desc_multi_accounts"),
      },
      {
        label: t("settings.plan_f_support_dedicated"),
        on: true,
        icon: "support",
        description: t("settings.plan_desc_support_dedicated"),
      },
      {
        label: t("settings.plan_f_early_access"),
        on: true,
        icon: "early_access",
        description: t("settings.plan_desc_early_access"),
      },
    ],
  };
}

export function use_plan_features(): Record<string, PlanFeature[]> {
  const { t } = use_i18n();

  const plan_features: Record<string, PlanFeature[]> = useMemo(
    () => calendar_plan_features(t),
    [t],
  );

  return plan_features;
}
