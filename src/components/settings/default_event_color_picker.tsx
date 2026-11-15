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
import { CheckIcon } from "@heroicons/react/24/outline";

import {
  CustomColorSwatch,
  selected_swatch_shadow,
} from "@/components/ui/color_wheel";
import {
  event_color_token,
  ink_on_fill,
  normalize_event_color,
  PICKER_COLOR_OPTIONS,
  selected_event_color_name,
} from "@/components/calendar/calendar_utils";
import { use_i18n } from "@/lib/i18n/context";

const SWATCH_RING = "var(--aster-island-fill)";
const SWATCH_CLASS =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full sm:h-7 sm:w-7 transition-[box-shadow] duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--aster-island-fill)]";

interface DefaultEventColorPickerProps {
  value: string;
  calendar_color?: string;
  label_id?: string;
  on_change: (value: string) => void;
}

export function DefaultEventColorPicker({
  value,
  calendar_color,
  label_id,
  on_change,
}: DefaultEventColorPickerProps) {
  const { t } = use_i18n();
  const uses_calendar = !value;
  const selected_color_name = selected_event_color_name(value);
  const is_custom = !uses_calendar && selected_color_name === null;
  const calendar_fill = event_color_token(calendar_color);

  return (
    <div
      aria-labelledby={label_id}
      className="flex flex-wrap items-center gap-2 py-0.5 sm:gap-2.5"
      data-testid="default-event-color-picker"
      role="radiogroup"
    >
      <button
        aria-checked={uses_calendar}
        aria-label={t("calendar.color_calendar_default")}
        className={SWATCH_CLASS}
        data-default-event-color="calendar"
        role="radio"
        style={{
          backgroundColor: calendar_fill,
          boxShadow: uses_calendar
            ? selected_swatch_shadow(SWATCH_RING)
            : "none",
        }}
        title={t("calendar.color_calendar_default")}
        type="button"
        onClick={() => on_change("")}
      >
        {uses_calendar && (
          <CheckIcon
            className="h-4 w-4"
            strokeWidth={2.5}
            style={{ color: ink_on_fill(calendar_fill) }}
          />
        )}
      </button>
      {PICKER_COLOR_OPTIONS.map((option) => {
        const is_selected = selected_color_name === option.name;

        return (
          <button
            key={option.hex}
            aria-checked={is_selected}
            aria-label={t(option.name_key)}
            className={SWATCH_CLASS}
            data-default-event-color={option.name}
            role="radio"
            style={{
              backgroundColor: option.token,
              boxShadow: is_selected
                ? selected_swatch_shadow(SWATCH_RING)
                : "none",
            }}
            title={t(option.name_key)}
            type="button"
            onClick={() => on_change(option.hex)}
          >
            {is_selected && (
              <CheckIcon
                className="h-4 w-4"
                strokeWidth={2.5}
                style={{ color: option.ink }}
              />
            )}
          </button>
        );
      })}
      <CustomColorSwatch
        check_class="h-4 w-4"
        default_color={normalize_event_color(calendar_color) ?? undefined}
        is_selected={is_custom}
        ring_background={SWATCH_RING}
        role="radio"
        size_class="h-6 w-6 sm:h-7 sm:w-7"
        value={is_custom ? value : null}
        on_commit={on_change}
      />
    </div>
  );
}
