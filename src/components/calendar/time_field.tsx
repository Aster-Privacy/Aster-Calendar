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

import { useEffect, useId, useRef, useState } from "react";

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";

const MERIDIEM_PATTERN = /^(.*?)\s*(a|am|a\.m\.?|p|pm|p\.m\.?)$/;
const SEPARATED_PATTERN = /^(\d{1,2})\s*[:.h]\s*(\d{2})$/;
const COMPACT_PATTERN = /^(\d{1,4})$/;

function pad_two(value: number): string {
  return String(value).padStart(2, "0");
}

export function time_value_to_minutes(value: string): number {
  const [hours, minutes] = value.split(":");

  return Number(hours ?? 0) * 60 + Number(minutes ?? 0);
}

export function parse_time_input(raw: string): string | null {
  const text = raw
    .toLowerCase()
    .replace(/[  ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return null;
  }

  const meridiem_match = MERIDIEM_PATTERN.exec(text);
  const body = (meridiem_match ? meridiem_match[1] : text).trim();
  const meridiem = meridiem_match ? meridiem_match[2].charAt(0) : null;

  let hours: number;
  let minutes: number;

  const separated = SEPARATED_PATTERN.exec(body);

  if (separated) {
    hours = Number(separated[1]);
    minutes = Number(separated[2]);
  } else {
    const compact = COMPACT_PATTERN.exec(body);

    if (!compact) {
      return null;
    }

    const digits = compact[1];

    if (digits.length <= 2) {
      hours = Number(digits);
      minutes = 0;
    } else {
      hours = Number(digits.slice(0, digits.length - 2));
      minutes = Number(digits.slice(-2));
    }
  }

  if (minutes > 59) {
    return null;
  }

  if (meridiem) {
    if (hours < 1 || hours > 12) {
      return null;
    }

    if (meridiem === "p" && hours < 12) {
      hours += 12;
    } else if (meridiem === "a" && hours === 12) {
      hours = 0;
    }
  } else if (hours > 23) {
    return null;
  }

  return `${pad_two(hours)}:${pad_two(minutes)}`;
}

function nearest_index(options: string[], value: string | null): number {
  if (!value || options.length === 0) {
    return -1;
  }

  const target = time_value_to_minutes(value);
  let best = 0;

  options.forEach((option, index) => {
    if (time_value_to_minutes(option) <= target) {
      best = index;
    }
  });

  return best;
}

interface TimeFieldProps {
  aria_label: string;
  value: string;
  options: string[];
  format_label: (value: string) => string;
  render_option?: (value: string) => ReactNode;
  invalid_message: string;
  list_label: string;
  class_name?: string;
  data_testid?: string;
  on_change: (value: string) => void;
}

export function TimeField({
  aria_label,
  value,
  options,
  format_label,
  render_option,
  invalid_message,
  list_label,
  class_name,
  data_testid,
  on_change,
}: TimeFieldProps) {
  const list_id = useId();
  const error_id = useId();
  const input_ref = useRef<HTMLInputElement | null>(null);
  const list_ref = useRef<HTMLDivElement | null>(null);
  const touch_focus_ref = useRef(false);
  const [draft, set_draft] = useState<string | null>(null);
  const [is_open, set_is_open] = useState(false);
  const [highlight, set_highlight] = useState(-1);
  const [has_error, set_has_error] = useState(false);

  const display = draft ?? format_label(value);

  useEffect(() => {
    if (!is_open || highlight < 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      list_ref.current
        ?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [highlight, is_open]);

  const open_list = () => {
    set_highlight(nearest_index(options, value));
    set_is_open(true);
  };

  const resolve_text = (text: string): string | null => {
    const parsed = parse_time_input(text);

    if (parsed) {
      return parsed;
    }

    const normalized = text.replace(/[  ]/g, " ").trim().toLowerCase();

    return (
      options.find(
        (option) =>
          format_label(option).replace(/[  ]/g, " ").toLowerCase() ===
          normalized,
      ) ?? null
    );
  };

  const commit = (next: string) => {
    set_draft(null);
    set_has_error(false);
    set_is_open(false);

    if (next !== value) {
      on_change(next);
    }
  };

  const commit_draft = (): boolean => {
    if (draft === null) {
      set_is_open(false);

      return true;
    }

    const resolved = resolve_text(draft);

    if (!resolved) {
      set_has_error(true);

      return false;
    }

    commit(resolved);

    return true;
  };

  const revert = () => {
    set_draft(null);
    set_has_error(false);
    set_is_open(false);
  };

  const handle_key_down = (key_event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (key_event.key === "ArrowDown" || key_event.key === "ArrowUp") {
      key_event.preventDefault();

      if (!is_open) {
        open_list();

        return;
      }

      const step = key_event.key === "ArrowDown" ? 1 : -1;

      set_highlight((current) => {
        const start = current < 0 ? nearest_index(options, value) : current;

        return Math.min(Math.max(start + step, 0), options.length - 1);
      });

      return;
    }

    if (key_event.key === "Enter") {
      key_event.preventDefault();

      if (draft === null && is_open && highlight >= 0) {
        const picked = options[highlight];

        if (picked) {
          commit(picked);
        }

        return;
      }

      if (commit_draft()) {
        input_ref.current?.select();
      }

      return;
    }

    if (key_event.key === "Escape") {
      if (draft !== null || is_open) {
        key_event.preventDefault();
        key_event.stopPropagation();
        revert();
        input_ref.current?.select();
      }

      return;
    }

    if (key_event.key === "Tab" && draft !== null) {
      const resolved = resolve_text(draft);

      if (resolved) {
        commit(resolved);
      } else {
        revert();
      }
    }
  };

  return (
    <Popover open={is_open} onOpenChange={set_is_open}>
      <PopoverAnchor asChild>
        <input
          ref={input_ref}
          aria-activedescendant={
            is_open && highlight >= 0 ? `${list_id}_${highlight}` : undefined
          }
          aria-autocomplete="list"
          aria-controls={is_open ? list_id : undefined}
          aria-describedby={has_error ? error_id : undefined}
          aria-expanded={is_open}
          aria-invalid={has_error}
          aria-label={aria_label}
          autoComplete="off"
          className={`aster_input aster_input_tonal !h-9 !w-[6.75rem] shrink-0 !px-3 !text-[14px] tabular-nums text-txt-primary ${
            has_error ? "!shadow-[inset_0_0_0_1px_var(--color-danger)]" : ""
          } ${class_name ?? ""}`}
          data-testid={data_testid}
          inputMode="text"
          role="combobox"
          spellCheck={false}
          type="text"
          value={display}
          onBlur={() => {
            if (draft === null) {
              set_is_open(false);

              return;
            }

            const resolved = resolve_text(draft);

            if (resolved) {
              commit(resolved);
            } else {
              revert();
            }
          }}
          onChange={(input_event) => {
            const text = input_event.target.value;

            set_draft(text);
            set_has_error(false);
            set_highlight(nearest_index(options, parse_time_input(text)));
            set_is_open(true);
          }}
          onClick={() => {
            if (!is_open) {
              open_list();
            }
          }}
          onFocus={(focus_event) => {
            const field = focus_event.currentTarget;

            if (touch_focus_ref.current) {
              touch_focus_ref.current = false;
              field.setSelectionRange(field.value.length, field.value.length);

              return;
            }

            field.select();
          }}
          onKeyDown={handle_key_down}
          onPointerDown={(pointer_event) => {
            touch_focus_ref.current =
              pointer_event.pointerType !== "mouse" &&
              document.activeElement !== pointer_event.currentTarget;
          }}
        />
      </PopoverAnchor>
      {has_error && (
        <span className="sr-only" id={error_id} role="alert">
          {invalid_message}
        </span>
      )}
      <PopoverContent
        align="start"
        className="w-auto min-w-[9rem] rounded-[var(--aster-radius-floating,16px)] p-[var(--aster-floating-pad,6px)]"
        sideOffset={6}
        onCloseAutoFocus={(focus_event) => focus_event.preventDefault()}
        onInteractOutside={(outside_event) => {
          if (outside_event.target === input_ref.current) {
            outside_event.preventDefault();
          }
        }}
        onOpenAutoFocus={(focus_event) => focus_event.preventDefault()}
      >
        <div
          ref={list_ref}
          aria-label={list_label}
          className="max-h-60 overflow-y-auto"
          id={list_id}
          role="listbox"
        >
          {options.map((option, index) => {
            const is_selected = option === value;
            const is_highlighted = index === highlight;

            return (
              <div
                key={option}
                aria-selected={is_selected}
                className={`flex min-h-[34px] cursor-pointer items-center whitespace-nowrap rounded-[var(--aster-radius-item,8px)] px-2.5 text-[14px] tabular-nums text-txt-primary ${
                  is_highlighted
                    ? "bg-[var(--aster-hover)]"
                    : is_selected
                      ? "bg-[var(--aster-selected)]"
                      : ""
                }`}
                data-index={index}
                id={`${list_id}_${index}`}
                role="option"
                onClick={() => commit(option)}
                onMouseDown={(mouse_event) => mouse_event.preventDefault()}
                onMouseEnter={() => set_highlight(index)}
              >
                {render_option ? render_option(option) : format_label(option)}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
