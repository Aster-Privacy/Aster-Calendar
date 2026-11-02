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
import type { CalendarViewMode } from "@/types/calendar";

import {
  CalendarIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListBulletIcon,
  PrinterIcon,
  Squares2X2Icon,
  TableCellsIcon,
  ViewColumnsIcon,
} from "@heroicons/react/24/outline";
import { PillButton, SegmentedToggle, Tooltip } from "@aster/ui";

import { blur_segment_after_pointer } from "@/components/calendar/segment_pointer_blur";
import { CalendarOfflinePill } from "@/components/calendar/calendar_offline_pill";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { CalendarSelect } from "@/components/calendar/calendar_select";
import { EncryptionInfoDropdown } from "@/components/common/encryption_info_dropdown";

const VIEW_MODES: Array<{
  mode: CalendarViewMode;
  label: TranslationKey;
  icon: typeof CalendarDaysIcon;
  shortcut: string;
}> = [
  { mode: "day", label: "calendar.day", icon: CalendarDaysIcon, shortcut: "D" },
  {
    mode: "week",
    label: "calendar.week",
    icon: ViewColumnsIcon,
    shortcut: "W",
  },
  {
    mode: "month",
    label: "calendar.month",
    icon: Squares2X2Icon,
    shortcut: "M",
  },
  { mode: "year", label: "calendar.year", icon: TableCellsIcon, shortcut: "Y" },
  {
    mode: "agenda",
    label: "calendar.agenda",
    icon: ListBulletIcon,
    shortcut: "A",
  },
  {
    mode: "custom",
    label: "calendar.custom_view",
    icon: CalendarIcon,
    shortcut: "X",
  },
];

const PHONE_ICON_BUTTON =
  "h-11 w-11 rounded-[var(--aster-radius-panel,12px)] flex items-center justify-center transition-colors hover:bg-[var(--aster-hover)] text-[var(--icon-secondary)] hover:text-[var(--icon-active)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]";

const TOOLBAR_ICON_BUTTON =
  "h-9 w-9 rounded-[var(--aster-radius-item,8px)] flex items-center justify-center transition-colors hover:bg-[var(--aster-hover)] text-[var(--icon-secondary)] hover:text-[var(--icon-active)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]";

interface CalendarHeaderProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  period_month: string;
  period_month_short?: string;
  period_year: string;
  view_mode: CalendarViewMode;
  custom_view_days: number;
  is_current_period: boolean;
  on_view_mode_change: (mode: CalendarViewMode) => void;
  on_previous: () => void;
  on_next: () => void;
  on_today: () => void;
  on_print: () => void;
  on_insights: () => void;
  on_period_click?: () => void;
  is_phone?: boolean;
}

export function CalendarHeader({
  t,
  period_month,
  period_month_short,
  period_year,
  view_mode,
  custom_view_days,
  is_current_period,
  on_period_click,
  is_phone = false,
  on_print,
  on_insights,
  on_view_mode_change,
  on_previous,
  on_next,
  on_today,
}: CalendarHeaderProps) {
  const view_label = (mode: CalendarViewMode, label: TranslationKey) =>
    mode === "custom"
      ? t("calendar.custom_view_days", { count: custom_view_days })
      : t(label);

  const active_view =
    VIEW_MODES.find((entry) => entry.mode === view_mode) ?? VIEW_MODES[2];

  const segment_options = VIEW_MODES.map(({ mode, label }) => ({
    label: view_label(mode, label),
    value: mode,
  }));

  const title_content = (
    <span className="flex min-w-0 items-baseline gap-1.5">
      {period_month_short ? (
        <>
          <span className="min-w-0 truncate sm:hidden">
            {period_month_short}
          </span>
          <span className="hidden min-w-0 truncate sm:inline">
            {period_month}
          </span>
        </>
      ) : (
        <span className="min-w-0 truncate">{period_month}</span>
      )}
      <span className="hidden flex-shrink-0 font-normal text-txt-muted min-[400px]:inline">
        {period_year}
      </span>
    </span>
  );

  if (is_phone) {
    const phone_title_text = period_month_short || period_month;
    const phone_title_wraps = phone_title_text.length > 10;
    const phone_title = (
      <span className="flex min-w-0 items-baseline gap-1">
        <span
          className={
            phone_title_wraps
              ? "line-clamp-2 min-w-0 whitespace-normal text-start text-[13px] leading-[1.15]"
              : "min-w-0 truncate"
          }
        >
          {phone_title_wraps
            ? phone_title_text
                .split(" - ")
                .map((part) => part.replace(/ /g, "\u00a0"))
                .join("\u00a0- ")
            : phone_title_text}
        </span>
        {period_year && (view_mode === "month" || view_mode === "year") && (
          <span className="flex-shrink-0 font-normal text-txt-muted">
            {period_year}
          </span>
        )}
      </span>
    );

    return (
      <div
        className="flex flex-shrink-0 select-none items-center gap-0.5 ps-1.5 pe-1.5 py-0.5 min-h-[52px] overflow-hidden"
        data-calendar-toolbar
      >
        <PillButton
          aria-current={is_current_period ? "date" : undefined}
          className="min-h-11 flex-shrink-0 px-2.5"
          size="sm"
          type="button"
          variant="outline"
          onClick={on_today}
        >
          {t("calendar.today")}
        </PillButton>

        <CalendarOfflinePill />

        <div className="-mx-0.5 flex flex-shrink-0 items-center">
          <button
            aria-label={t("calendar.previous_period")}
            className={PHONE_ICON_BUTTON}
            type="button"
            onClick={on_previous}
          >
            <ChevronLeftIcon className="w-[18px] h-[18px] rtl:-scale-x-100" />
          </button>
          <button
            aria-label={t("calendar.next_period")}
            className={PHONE_ICON_BUTTON}
            type="button"
            onClick={on_next}
          >
            <ChevronRightIcon className="w-[18px] h-[18px] rtl:-scale-x-100" />
          </button>
        </div>

        <h1 className="flex min-w-0 flex-1 overflow-hidden whitespace-nowrap text-[14px] font-semibold leading-tight tabular-nums text-txt-primary">
          {on_period_click ? (
            <button
              aria-label={t("calendar.go_to_date_title")}
              className="flex min-h-11 min-w-11 max-w-full items-center rounded-[var(--aster-radius-item,8px)] px-0.5 transition-colors hover:bg-[var(--aster-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
              type="button"
              onClick={on_period_click}
            >
              {phone_title}
            </button>
          ) : (
            <span className="flex min-w-0 items-baseline px-1">
              {phone_title}
            </span>
          )}
        </h1>

        <CalendarSelect
          aria_label={t("calendar.change_view")}
          class_name="h-11 max-w-[128px] ps-2.5 pe-1.5"
          options={segment_options}
          render_value={() => view_label(active_view.mode, active_view.label)}
          trigger_attributes={{ "data-view-select": "" }}
          value={view_mode}
          on_change={(value) => on_view_mode_change(value as CalendarViewMode)}
        />
      </div>
    );
  }

  return (
    <div
      className="@container/toolbar flex flex-shrink-0 select-none items-center justify-between gap-2 ps-3 pe-1 sm:ps-4 sm:pe-2 py-1 min-h-[44px] overflow-hidden"
      data-calendar-toolbar
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <PillButton
          aria-current={is_current_period ? "date" : undefined}
          className="flex-shrink-0"
          size="sm"
          title={`${t("calendar.today")} (T)`}
          type="button"
          variant="outline"
          onClick={on_today}
        >
          {t("calendar.today")}
        </PillButton>

        <div className="flex flex-shrink-0 items-center">
          <Tooltip tip={`${t("calendar.previous_period")} (K)`}>
            <button
              aria-label={t("calendar.previous_period")}
              className={TOOLBAR_ICON_BUTTON}
              type="button"
              onClick={on_previous}
            >
              <ChevronLeftIcon className="w-[18px] h-[18px] rtl:-scale-x-100" />
            </button>
          </Tooltip>
          <Tooltip tip={`${t("calendar.next_period")} (J)`}>
            <button
              aria-label={t("calendar.next_period")}
              className={TOOLBAR_ICON_BUTTON}
              type="button"
              onClick={on_next}
            >
              <ChevronRightIcon className="w-[18px] h-[18px] rtl:-scale-x-100" />
            </button>
          </Tooltip>
        </div>

        <h1 className="flex min-w-0 overflow-hidden whitespace-nowrap text-base font-semibold leading-tight tabular-nums text-txt-primary">
          {on_period_click ? (
            <Tooltip tip={`${t("calendar.go_to_date_title")} (G)`}>
              <button
                className="flex min-w-0 items-baseline gap-1.5 rounded-[var(--aster-radius-item,8px)] px-1.5 py-1 transition-colors hover:bg-[var(--aster-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                type="button"
                onClick={on_period_click}
              >
                {title_content}
              </button>
            </Tooltip>
          ) : (
            <span className="flex min-w-0 items-baseline gap-1.5 px-1.5">
              {title_content}
            </span>
          )}
        </h1>

        <CalendarOfflinePill />
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        <div
          className="inline-flex items-center"
          data-onboarding="view-switcher"
        >
          <div
            className="hidden @min-[860px]/toolbar:inline-flex"
            onClick={blur_segment_after_pointer}
          >
            <SegmentedToggle
              aria-label={t("calendar.change_view")}
              name="calendar_view_mode"
              role="radiogroup"
              options={segment_options}
              value={view_mode}
              on_change={(value) =>
                on_view_mode_change(value as CalendarViewMode)
              }
            />
          </div>

          <div className="inline-flex @min-[860px]/toolbar:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <PillButton
                  aria-label={t("calendar.change_view")}
                  className="group"
                  size="sm"
                  trailing={
                    <ChevronDownIcon className="h-3.5 w-3.5 text-[var(--icon-secondary)] transition-transform duration-200 ease-out group-data-[state=open]:-rotate-180" />
                  }
                  type="button"
                  variant="outline"
                >
                  <active_view.icon className="h-4 w-4 text-[var(--icon-secondary)] sm:hidden" />
                  <span className="hidden min-w-[62px] text-start sm:inline">
                    {view_label(active_view.mode, active_view.label)}
                  </span>
                </PillButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-52 p-1"
                collisionPadding={8}
              >
                {VIEW_MODES.map(({ mode, label, icon: Icon, shortcut }) => {
                  const is_active = mode === view_mode;

                  return (
                    <DropdownMenuItem
                      key={mode}
                      className={is_active ? "bg-[var(--aster-selected)]" : ""}
                      onSelect={() => on_view_mode_change(mode)}
                    >
                      <Icon
                        className={`h-4 w-4 me-2.5 ${
                          is_active
                            ? "text-[var(--accent-color)]"
                            : "text-[var(--icon-secondary)]"
                        }`}
                      />
                      <span
                        className={`flex-1 ${is_active ? "font-medium" : ""}`}
                      >
                        {view_label(mode, label)}
                      </span>
                      <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Tooltip tip={t("calendar.insights")}>
          <button
            aria-label={t("calendar.insights")}
            data-testid="calendar-insights-button"
            className={`hidden md:flex ${TOOLBAR_ICON_BUTTON}`}
            type="button"
            onClick={on_insights}
          >
            <ChartBarIcon className="w-[18px] h-[18px]" />
          </button>
        </Tooltip>

        <Tooltip tip={t("calendar.print_title")}>
          <button
            aria-label={t("calendar.print_title")}
            className={`hidden md:flex ${TOOLBAR_ICON_BUTTON}`}
            type="button"
            onClick={on_print}
          >
            <PrinterIcon className="w-[18px] h-[18px]" />
          </button>
        </Tooltip>

        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center">
          <EncryptionInfoDropdown
            description_key="calendar.only_you_can_read_calendar"
            e2e_verified={true}
            has_pq_protection={true}
            is_external={false}
            label={
              <span className="sr-only">
                {t("common.end_to_end_encrypted_label")}
              </span>
            }
            size={18}
          />
        </div>
      </div>
    </div>
  );
}
