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
import type { TagColorVariant } from "@aster/ui";

import { CheckIcon } from "@heroicons/react/16/solid";

import { CustomColorSwatch } from "@/components/ui/color_wheel";
import { tag_color_label_key } from "@/components/ui/email_tag";
import { hex_to_readable_ink } from "@/components/calendar/calendar_utils";
import { use_i18n } from "@/lib/i18n/context";
import { normalize_hex_color } from "@/lib/color_wheel_math";

export const COLOR_ROW_PRESETS: readonly {
  variant: TagColorVariant;
  hex: string;
}[] = [
  { variant: "red", hex: "#ef4444" },
  { variant: "orange", hex: "#f97316" },
  { variant: "yellow", hex: "#eab308" },
  { variant: "green", hex: "#22c55e" },
  { variant: "teal", hex: "#14b8a6" },
  { variant: "blue", hex: "#3b82f6" },
  { variant: "purple", hex: "#a855f7" },
  { variant: "pink", hex: "#ec4899" },
];

const SWATCH_CLASS_NAME =
  "color_row_swatch relative flex aspect-square w-full min-w-0 items-center justify-center rounded-full";

interface ColorSwatchRowProps {
  value: string | null | undefined;
  on_change: (hex: string) => void;
  on_commit?: (hex: string) => void;
  max_swatch_size?: number;
  class_name?: string;
  labelled_by?: string;
  label?: string;
  align?: "start" | "center" | "end";
}

export function ColorSwatchRow({
  value,
  on_change,
  on_commit,
  max_swatch_size = 32,
  class_name = "w-full",
  labelled_by,
  label,
  align = "end",
}: ColorSwatchRowProps) {
  const { t } = use_i18n();
  const normalized = normalize_hex_color(value);
  const is_custom =
    normalized !== null &&
    !COLOR_ROW_PRESETS.some((preset) => preset.hex === normalized);

  const select_preset = (hex: string) => {
    on_change(hex);
    if (hex !== normalized) on_commit?.(hex);
  };

  return (
    <div
      aria-label={labelled_by ? undefined : label}
      aria-labelledby={labelled_by}
      className={`color_swatch_row grid items-center p-1 ${class_name}`}
      data-color-swatch-row=""
      role="group"
      style={{
        gridTemplateColumns: `repeat(${COLOR_ROW_PRESETS.length + 1}, minmax(0, ${max_swatch_size}px))`,
      }}
    >
      {COLOR_ROW_PRESETS.map((preset) => {
        const is_selected = normalized === preset.hex;

        return (
          <button
            key={preset.hex}
            aria-label={t(tag_color_label_key(preset.variant))}
            aria-pressed={is_selected}
            className={SWATCH_CLASS_NAME}
            data-selected={is_selected ? "true" : undefined}
            style={{ backgroundColor: preset.hex }}
            title={t(tag_color_label_key(preset.variant))}
            type="button"
            onClick={() => select_preset(preset.hex)}
          >
            {is_selected && (
              <CheckIcon
                aria-hidden="true"
                className="pointer-events-none h-[55%] w-[55%]"
                data-swatch-check=""
                style={{ color: hex_to_readable_ink(preset.hex) }}
              />
            )}
          </button>
        );
      })}
      <CustomColorSwatch
        align={align}
        check_class="pointer-events-none h-[55%] w-[55%]"
        is_selected={is_custom}
        size_class="color_row_swatch aspect-square w-full min-w-0"
        value={is_custom ? normalized : null}
        on_change={on_change}
        on_commit={on_commit}
      />
    </div>
  );
}
