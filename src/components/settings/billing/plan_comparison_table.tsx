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
import type { TranslationKey } from "@/lib/i18n/types";

import { Fragment, useMemo } from "react";
import { XCircleIcon } from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { Island } from "@aster/ui";

import { InfoPopover } from "@/components/ui/info_popover";
import { calendar_booking_available } from "@/lib/app_kind";
import { calendar_plan_limits } from "@/lib/calendar_plan_limits";
import { use_i18n } from "@/lib/i18n/context";

type TranslateFunction = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export interface ComparisonRow {
  category: string;
  label: string;
  free: string;
  star: string;
  nova: string;
  supernova: string;
  tip?: string;
}

const cap = (s: string) => {
  const trimmed = s.trim();

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

function get_calendar_comparison_rows(t: TranslateFunction): ComparisonRow[] {
  const yes = "✓";
  const no = "-";
  const general = t("settings.plan_cat_general");
  const calendar = t("settings.plan_cat_calendar");
  const security = t("settings.plan_cat_security");
  const support = t("settings.plan_cat_support");
  const all = (label: string, tip?: string): ComparisonRow => ({
    category: calendar,
    label,
    tip,
    free: yes,
    star: yes,
    nova: yes,
    supernova: yes,
  });

  return [
    {
      category: general,
      label: cap(t("settings.plan_f_storage", { value: "" })),
      free: "10 GB",
      star: "50 GB",
      nova: "500 GB",
      supernova: "5 TB",
    },
    {
      category: general,
      label: t("settings.plan_f_signed_in_accounts"),
      tip: t("settings.plan_tip_signed_in_accounts"),
      free: "2",
      star: "3",
      nova: "5",
      supernova: "20",
    },
    {
      category: general,
      label: t("settings.f_e2ee"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: general,
      label: t("settings.f_zero_knowledge"),
      tip: t("settings.plan_tip_zero_knowledge"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: calendar,
      label: t("settings.plan_f_calendars"),
      free: String(calendar_plan_limits("free").calendars),
      star: String(calendar_plan_limits("star").calendars),
      nova: String(calendar_plan_limits("nova").calendars),
      supernova: String(calendar_plan_limits("supernova").calendars),
    },
    all(t("settings.plan_f_calendar_events")),
    all(t("settings.plan_f_calendar_invites")),
    all(t("settings.plan_f_calendar_reminders")),
    ...(calendar_booking_available()
      ? [
          {
            category: calendar,
            label: t("settings.cal_plan_f_booking_pages"),
            tip: t("settings.cal_plan_desc_booking"),
            free: String(calendar_plan_limits("free").booking_pages),
            star: String(calendar_plan_limits("star").booking_pages),
            nova: String(calendar_plan_limits("nova").booking_pages),
            supernova: String(calendar_plan_limits("supernova").booking_pages),
          },
          {
            category: calendar,
            label: t("settings.cal_plan_feat_no_branding"),
            tip: t("settings.cal_plan_desc_no_branding"),
            free: no,
            star: yes,
            nova: yes,
            supernova: yes,
          },
        ]
      : []),
    all(t("settings.plan_f_calendar_subscriptions")),
    all(t("settings.plan_f_calendar_import_export")),
    { ...all(t("settings.feature_two_factor")), category: security },
    { ...all(t("settings.feature_login_notifications")), category: security },
    { ...all(t("settings.plan_f_biometric")), category: security },
    {
      category: support,
      label: t("settings.plan_f_support_priority"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
  ];
}

export function get_plan_comparison_rows(
  t: TranslateFunction,
): ComparisonRow[] {
  return get_calendar_comparison_rows(t);
}

type ColumnKey = "free" | "star" | "nova" | "supernova";

const COLUMNS: ColumnKey[] = ["free", "star", "nova", "supernova"];

function render_cell(value: string) {
  if (value === "✓") {
    return (
      <CheckCircleIcon
        aria-hidden="true"
        className="mx-auto block h-[22px] w-[22px]"
        style={{ color: "var(--accent-blue)" }}
      />
    );
  }

  if (value === "-") {
    return (
      <XCircleIcon
        aria-hidden="true"
        className="mx-auto block h-[22px] w-[22px]"
        style={{ color: "var(--color-danger)", strokeWidth: 1.8 }}
      />
    );
  }

  return <span className="text-sm font-medium text-txt-primary">{value}</span>;
}

function FeatureLabel({ label, tip }: { label: string; tip?: string }) {
  if (!tip) {
    return <>{label}</>;
  }

  const words = label.split(" ");
  const last_word = words.pop();
  const leading_words = words.join(" ");

  return (
    <span>
      {leading_words ? `${leading_words} ` : ""}
      <span className="whitespace-nowrap">
        {last_word}
        <span className="ms-1.5 inline-block translate-y-[3px]">
          <InfoPopover description={tip} title={label} />
        </span>
      </span>
    </span>
  );
}

export function PlanComparisonTable({
  highlight_plan_code,
}: {
  highlight_plan_code?: string | null;
}) {
  const { t } = use_i18n();
  const rows = useMemo<ComparisonRow[]>(() => get_plan_comparison_rows(t), [t]);
  const column_labels: Record<ColumnKey, string> = {
    free: t("settings.plan_free"),
    star: "Star",
    nova: "Nova",
    supernova: "Supernova",
  };
  const active_column =
    COLUMNS.find((key) => key === highlight_plan_code) ?? null;

  return (
    <Island className="overflow-x-auto">
      <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="w-[200px] border-b border-[color:var(--aster-island-divider)]" />
            {COLUMNS.map((key) => (
              <th
                key={key}
                className="border-b border-[color:var(--aster-island-divider)] px-4 py-4 text-center align-top"
                scope="col"
              >
                <span
                  className="text-base font-semibold"
                  style={{
                    color:
                      active_column === key
                        ? "var(--accent-blue)"
                        : "var(--text-primary)",
                  }}
                >
                  {column_labels[key]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <Fragment key={row.label}>
              {(index === 0 || rows[index - 1].category !== row.category) && (
                <tr>
                  <td className="px-5 pb-2 pt-5" colSpan={COLUMNS.length + 1}>
                    <span className="flex items-center gap-2.5 text-[15px] font-semibold text-txt-primary">
                      {row.category}
                    </span>
                  </td>
                </tr>
              )}
              <tr>
                <th
                  className="w-[200px] px-5 py-3 text-start text-sm font-normal text-txt-muted"
                  scope="row"
                >
                  <FeatureLabel label={row.label} tip={row.tip} />
                </th>
                {COLUMNS.map((key) => (
                  <td
                    key={key}
                    className="px-4 py-3 text-center align-middle tabular-nums"
                  >
                    {render_cell(row[key])}
                  </td>
                ))}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </Island>
  );
}
