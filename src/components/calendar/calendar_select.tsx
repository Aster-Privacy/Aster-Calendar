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
import type { CSSProperties, ReactNode } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface CalendarSelectOption {
  value: string;
  label: ReactNode;
  text?: string;
  disabled?: boolean;
}

interface CalendarSelectProps {
  value: string;
  options: CalendarSelectOption[];
  on_change: (value: string) => void;
  aria_label?: string;
  aria_labelledby?: string;
  class_name?: string;
  content_avoid_collisions?: boolean;
  content_class_name?: string;
  content_side?: "top" | "bottom";
  content_style?: CSSProperties;
  data_testid?: string;
  disabled?: boolean;
  full_width?: boolean;
  id?: string;
  on_open_change?: (open: boolean) => void;
  placeholder?: ReactNode;
  render_value?: (option: CalendarSelectOption | undefined) => ReactNode;
  trigger_attributes?: Record<string, string>;
}

const TRIGGER_CLASS =
  "calendar_select_trigger h-9 min-w-0 shrink-0 cursor-pointer !rounded-[var(--aster-radius-field,10px)] !border-transparent !bg-[var(--aster-field-bg)] ps-3 pe-2 text-[14px] font-normal text-txt-primary hover:!bg-[var(--aster-field-hover)] data-[state=open]:!bg-[var(--aster-field-hover)] data-[placeholder]:text-txt-muted disabled:cursor-default disabled:opacity-70";

const CONTENT_CLASS =
  "calendar_select_content aster_floating aster_floating_anim !rounded-[var(--aster-radius-floating,16px)] !border-transparent p-[var(--aster-floating-pad,6px)] [&_[data-radix-select-viewport]]:!min-w-[calc(var(--radix-select-trigger-width)_-_12px)]";

const ITEM_CLASS =
  "calendar_select_item min-h-[34px] cursor-pointer !rounded-[var(--aster-radius-item,8px)] py-1.5 ps-2.5 pe-8 text-[14px] transition-colors duration-150 data-[highlighted]:bg-[var(--aster-hover)] data-[state=checked]:bg-[var(--aster-selected)]";

export function CalendarSelect({
  value,
  options,
  on_change,
  aria_label,
  aria_labelledby,
  class_name,
  content_avoid_collisions,
  content_class_name,
  content_side,
  content_style,
  data_testid,
  disabled = false,
  full_width = false,
  id,
  on_open_change,
  placeholder,
  render_value,
  trigger_attributes,
}: CalendarSelectProps) {
  const selected = options.find((option) => option.value === value);
  const display = render_value
    ? render_value(selected)
    : (selected?.label ?? null);

  return (
    <Select
      disabled={disabled || options.length === 0}
      value={value}
      onOpenChange={on_open_change}
      onValueChange={on_change}
    >
      <SelectTrigger
        aria-label={aria_label}
        aria-labelledby={aria_labelledby}
        className={cn(
          TRIGGER_CLASS,
          full_width ? "w-full" : "w-auto",
          class_name,
        )}
        data-testid={data_testid}
        id={id}
        {...trigger_attributes}
      >
        <SelectValue placeholder={placeholder}>{display}</SelectValue>
      </SelectTrigger>
      <SelectContent
        avoidCollisions={content_avoid_collisions}
        className={cn(CONTENT_CLASS, content_class_name)}
        side={content_side}
        style={content_style}
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            className={ITEM_CLASS}
            disabled={option.disabled}
            textValue={option.text}
            value={option.value}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
