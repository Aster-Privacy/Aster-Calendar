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
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import { useId, useRef, useState } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";

import { EVENT_COLOR_OPTIONS } from "@/components/calendar/calendar_utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { use_i18n } from "@/lib/i18n/context";

export const TAG_COLOR_GRID_COLUMNS = 6;

export function next_swatch_index(
  key: string,
  index: number,
  total: number,
  columns: number = TAG_COLOR_GRID_COLUMNS,
): number | null {
  if (total <= 0) {
    return null;
  }

  switch (key) {
    case "ArrowRight":
      return (index + 1) % total;
    case "ArrowLeft":
      return (index - 1 + total) % total;
    case "ArrowDown":
      return Math.min(total - 1, index + columns);
    case "ArrowUp":
      return Math.max(0, index - columns);
    case "Home":
      return 0;
    case "End":
      return total - 1;
    default:
      return null;
  }
}

interface TagColorSwatchesProps {
  color: string;
  on_select: (color: string) => void;
}

export function TagColorSwatches({ color, on_select }: TagColorSwatchesProps) {
  const { t } = use_i18n();
  const heading_id = useId();
  const button_refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = color.toLowerCase();
  const selected_index = EVENT_COLOR_OPTIONS.findIndex(
    (option) => option.hex.toLowerCase() === current,
  );
  const focus_index = selected_index >= 0 ? selected_index : 0;

  const handle_key_down = (key_event: ReactKeyboardEvent<HTMLDivElement>) => {
    const active = button_refs.current.findIndex(
      (button) => button === document.activeElement,
    );

    if (active < 0) {
      return;
    }

    const next = next_swatch_index(
      key_event.key,
      active,
      EVENT_COLOR_OPTIONS.length,
    );

    if (next === null) {
      return;
    }

    key_event.preventDefault();
    button_refs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-2.5">
      <p
        className="truncate text-[13px] font-medium text-txt-primary"
        id={heading_id}
      >
        {t("calendar.tag_color")}
      </p>
      <div
        aria-labelledby={heading_id}
        className="grid grid-cols-6 gap-2"
        data-testid="tag-color-swatches"
        role="toolbar"
        onKeyDown={handle_key_down}
      >
        {EVENT_COLOR_OPTIONS.map((option, index) => {
          const is_selected = index === selected_index;

          return (
            <button
              key={option.name}
              ref={(node) => {
                button_refs.current[index] = node;
              }}
              aria-label={t(option.name_key)}
              aria-pressed={is_selected}
              className="flex h-8 w-8 cursor-pointer touch-manipulation items-center justify-center rounded-full transition-shadow duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--aster-floating-bg,var(--bg-primary))]"
              data-autofocus={index === focus_index ? "true" : undefined}
              data-color={option.hex}
              style={{
                backgroundColor: option.token,
                boxShadow: is_selected
                  ? `0 0 0 2px var(--aster-floating-bg, var(--bg-primary)), 0 0 0 4px ${option.token}`
                  : "none",
              }}
              tabIndex={index === focus_index ? 0 : -1}
              title={t(option.name_key)}
              type="button"
              onClick={() => on_select(option.hex)}
            >
              {is_selected && (
                <CheckIcon
                  aria-hidden="true"
                  className="h-4 w-4"
                  style={{ color: "var(--calendar_event_text, #ffffff)" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface TagColorPickerProps extends TagColorSwatchesProps {
  tag: string;
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}

export function TagColorPicker({
  tag,
  color,
  on_select,
  children,
  align = "start",
  side = "bottom",
}: TagColorPickerProps) {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);

  return (
    <Popover open={is_open} onOpenChange={set_is_open}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        aria-label={t("calendar.change_tag_color", { tag })}
        className="w-auto max-w-[calc(100vw-32px)] rounded-[var(--aster-radius-floating)] p-3"
        collisionPadding={16}
        role="dialog"
        side={side}
        sideOffset={6}
        onOpenAutoFocus={(focus_event) => {
          const target = (
            focus_event.currentTarget as HTMLElement | null
          )?.querySelector<HTMLButtonElement>('[data-autofocus="true"]');

          if (target) {
            focus_event.preventDefault();
            target.focus();
          }
        }}
      >
        <TagColorSwatches
          color={color}
          on_select={(next) => {
            on_select(next);
            set_is_open(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
