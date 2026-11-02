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
import type { CalendarViewMode } from "@/types/calendar";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  QuickSection,
  QuickToggle,
} from "@/components/settings/quick_settings_panel";

const THUMB_LINE = "var(--text-muted)";

function ViewThumb({ mode }: { mode: CalendarViewMode }) {
  if (mode === "agenda") {
    return (
      <span className="flex h-full w-full flex-col justify-center gap-[3px] p-2">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} className="flex items-center gap-1">
            <span
              className="h-[5px] w-[5px] flex-shrink-0 rounded-full"
              style={{ backgroundColor: "var(--accent-color)" }}
            />
            <span
              className="h-[2.5px] flex-1 rounded-full"
              style={{ backgroundColor: THUMB_LINE, opacity: 0.45 }}
            />
          </span>
        ))}
      </span>
    );
  }

  const columns =
    mode === "day"
      ? 1
      : mode === "week"
        ? 7
        : mode === "custom"
          ? 4
          : mode === "year"
            ? 4
            : 7;
  const rows = mode === "month" ? 4 : mode === "year" ? 3 : 1;
  const cells = columns * rows;

  return (
    <span
      className="grid h-full w-full gap-[2px] p-[6px]"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {Array.from({ length: cells }, (_, index) => (
        <span
          key={index}
          className="rounded-[2px]"
          style={{
            backgroundColor:
              index === Math.min(2, cells - 1)
                ? "var(--accent-color)"
                : THUMB_LINE,
            opacity: index === Math.min(2, cells - 1) ? 0.9 : 0.22,
          }}
        />
      ))}
    </span>
  );
}

export function CalendarQuickSettingsRows() {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();

  const view_options: Array<{ value: CalendarViewMode; label: string }> = [
    { value: "day", label: t("calendar.day") },
    { value: "week", label: t("calendar.week") },
    { value: "month", label: t("calendar.month") },
    { value: "year", label: t("calendar.year") },
    { value: "agenda", label: t("calendar.agenda") },
    { value: "custom", label: t("calendar.custom_view") },
  ];

  return (
    <>
      <QuickSection
        on_change={(value) =>
          update_preference("calendar_default_view", value as CalendarViewMode)
        }
        options={view_options.map((option) => ({
          value: option.value,
          label: option.label,
          thumbnail: <ViewThumb mode={option.value} />,
        }))}
        title={t("calendar.settings_default_view")}
        value={preferences.calendar_default_view ?? "week"}
      />

      <QuickSection
        on_change={(value) =>
          update_preference(
            "calendar_week_starts_on",
            value as "sunday" | "monday" | "saturday",
          )
        }
        options={[
          { value: "monday", label: t("calendar.settings_monday") },
          { value: "sunday", label: t("calendar.settings_sunday") },
          { value: "saturday", label: t("calendar.settings_saturday") },
        ]}
        title={t("calendar.settings_week_start")}
        value={preferences.calendar_week_starts_on ?? "monday"}
      />

      <QuickSection title={t("calendar.calendar")}>
        <QuickToggle
          checked={preferences.calendar_show_weekends !== false}
          label={t("calendar.settings_show_weekends")}
          on_change={(next) =>
            update_preference("calendar_show_weekends", next)
          }
        />
        <QuickToggle
          checked={preferences.calendar_show_week_numbers === true}
          label={t("calendar.settings_show_week_numbers")}
          on_change={(next) =>
            update_preference("calendar_show_week_numbers", next)
          }
        />
      </QuickSection>

      <QuickSection
        on_change={(value) =>
          update_preference("time_format", value as "12h" | "24h", true)
        }
        options={[
          { value: "12h", label: t("settings.time_format_12h") },
          { value: "24h", label: t("settings.time_format_24h") },
        ]}
        title={t("settings.time_format")}
        value={preferences.time_format ?? "12h"}
      />
    </>
  );
}
