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
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";

import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";
import { Input } from "@aster/ui";

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { hex_to_readable_ink } from "@/components/calendar/calendar_utils";
import {
  DEFAULT_CUSTOM_COLOR,
  type HsvColor,
  hex_to_hsv,
  hsv_to_hex,
  hue_saturation_to_wheel_point,
  normalize_hex_color,
  wheel_point_to_hue_saturation,
} from "@/lib/color_wheel_math";
import { use_i18n } from "@/lib/i18n/context";

export const RAINBOW_CONIC_GRADIENT =
  "conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)";

export const ColorWheelAnchor = PopoverAnchor;

const WHEEL_SIZE_PX = 200;
const HUE_STEP = 3;
const HUE_STEP_LARGE = 15;
const UNIT_STEP = 0.02;
const UNIT_STEP_LARGE = 0.1;
const POPOVER_CLASS =
  "w-[232px] max-w-[calc(100vw-32px)] rounded-[var(--aster-radius-floating)] p-4";
const SLIDER_FOCUS_CLASS =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--aster-floating-bg,var(--bg-primary))]";
const THUMB_CLASS =
  "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.45)]";

function initial_hsv(
  value: string | null | undefined,
  fallback: string,
): HsvColor {
  return (
    hex_to_hsv(normalize_hex_color(value) ?? fallback) ??
    hex_to_hsv(DEFAULT_CUSTOM_COLOR) ?? { h: 0, s: 0, v: 0 }
  );
}

function focus_wheel_on_open(focus_event: Event) {
  const wheel = (
    focus_event.currentTarget as HTMLElement | null
  )?.querySelector<HTMLElement>('[data-testid="color-wheel"]');

  if (wheel) {
    focus_event.preventDefault();
    wheel.focus();
  }
}

interface ColorWheelPanelProps {
  value: string | null | undefined;
  default_color?: string;
  on_change: (hex: string) => void;
  on_submit?: () => void;
}

export function ColorWheelPanel({
  value,
  default_color = DEFAULT_CUSTOM_COLOR,
  on_change,
  on_submit,
}: ColorWheelPanelProps) {
  const { t } = use_i18n();
  const hex_input_id = useId();
  const brightness_label_id = useId();
  const [hsv, set_hsv] = useState<HsvColor>(() =>
    initial_hsv(value, default_color),
  );
  const [hex_draft, set_hex_draft] = useState(() => hsv_to_hex(hsv));
  const [hex_error, set_hex_error] = useState(false);
  const wheel_ref = useRef<HTMLDivElement>(null);
  const slider_ref = useRef<HTMLDivElement>(null);
  const last_hex_ref = useRef(hsv_to_hex(hsv));

  useEffect(() => {
    const incoming = normalize_hex_color(value);

    if (!incoming || incoming === last_hex_ref.current) {
      return;
    }

    const next = hex_to_hsv(incoming);

    if (!next) {
      return;
    }

    last_hex_ref.current = incoming;
    set_hsv(next);
    set_hex_draft(incoming);
    set_hex_error(false);
  }, [value]);

  const emit = (hex: string) => {
    if (hex !== last_hex_ref.current) {
      last_hex_ref.current = hex;
      on_change(hex);
    }
  };

  const apply = (next: HsvColor) => {
    const hex = hsv_to_hex(next);

    set_hsv(next);
    set_hex_draft(hex);
    set_hex_error(false);
    emit(hex);
  };

  const update_from_wheel = (client_x: number, client_y: number) => {
    const element = wheel_ref.current;

    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const radius = rect.width / 2;
    const { h, s } = wheel_point_to_hue_saturation(
      client_x - (rect.left + radius),
      client_y - (rect.top + rect.height / 2),
      radius,
    );

    apply({ h, s, v: hsv.v });
  };

  const update_from_slider = (client_x: number) => {
    const element = slider_ref.current;

    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();

    if (rect.width <= 0) {
      return;
    }

    apply({
      ...hsv,
      v: Math.min(1, Math.max(0, (client_x - rect.left) / rect.width)),
    });
  };

  const start_drag = (
    pointer_event: ReactPointerEvent<HTMLDivElement>,
    update: (client_x: number, client_y: number) => void,
  ) => {
    if (pointer_event.button !== 0) {
      return;
    }

    pointer_event.preventDefault();
    pointer_event.currentTarget.focus();
    pointer_event.currentTarget.setPointerCapture?.(pointer_event.pointerId);
    update(pointer_event.clientX, pointer_event.clientY);
  };

  const move_drag = (
    pointer_event: ReactPointerEvent<HTMLDivElement>,
    update: (client_x: number, client_y: number) => void,
  ) => {
    if (
      pointer_event.currentTarget.hasPointerCapture?.(pointer_event.pointerId)
    ) {
      update(pointer_event.clientX, pointer_event.clientY);
    }
  };

  const handle_wheel_key = (key_event: ReactKeyboardEvent<HTMLDivElement>) => {
    const hue_step = key_event.shiftKey ? HUE_STEP_LARGE : HUE_STEP;
    const unit_step = key_event.shiftKey ? UNIT_STEP_LARGE : UNIT_STEP;
    const steps: Record<string, HsvColor> = {
      ArrowRight: { ...hsv, h: (hsv.h + hue_step) % 360 },
      ArrowLeft: { ...hsv, h: (hsv.h - hue_step + 360) % 360 },
      ArrowUp: { ...hsv, s: Math.min(1, hsv.s + unit_step) },
      ArrowDown: { ...hsv, s: Math.max(0, hsv.s - unit_step) },
    };
    const next = steps[key_event.key];

    if (next) {
      key_event.preventDefault();
      apply(next);
    }
  };

  const handle_slider_key = (
    key_event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const unit_step = key_event.shiftKey ? UNIT_STEP_LARGE : UNIT_STEP;
    const steps: Record<string, number> = {
      ArrowRight: Math.min(1, hsv.v + unit_step),
      ArrowUp: Math.min(1, hsv.v + unit_step),
      ArrowLeft: Math.max(0, hsv.v - unit_step),
      ArrowDown: Math.max(0, hsv.v - unit_step),
      Home: 0,
      End: 1,
    };
    const next = steps[key_event.key];

    if (next !== undefined) {
      key_event.preventDefault();
      apply({ ...hsv, v: next });
    }
  };

  const handle_hex_input = (raw: string) => {
    set_hex_draft(raw);

    const normalized = normalize_hex_color(raw);
    const next = normalized ? hex_to_hsv(normalized) : null;

    if (!normalized || !next) {
      set_hex_error(true);

      return;
    }

    set_hex_error(false);
    set_hsv(next);
    emit(normalized);
  };

  const current_hex = hsv_to_hex(hsv);
  const full_brightness_hex = hsv_to_hex({ ...hsv, v: 1 });
  const radius = WHEEL_SIZE_PX / 2;
  const thumb = hue_saturation_to_wheel_point(hsv.h, hsv.s, radius);
  const brightness_percent = Math.round(hsv.v * 100);

  return (
    <div className="flex flex-col gap-3" dir="ltr">
      <div
        ref={wheel_ref}
        aria-label={t("common.custom_color")}
        aria-valuemax={360}
        aria-valuemin={0}
        aria-valuenow={Math.round(hsv.h)}
        aria-valuetext={current_hex}
        className={`relative mx-auto shrink-0 cursor-crosshair touch-none select-none rounded-full ${SLIDER_FOCUS_CLASS}`}
        data-testid="color-wheel"
        role="slider"
        style={{
          width: WHEEL_SIZE_PX,
          height: WHEEL_SIZE_PX,
          backgroundImage: `radial-gradient(circle closest-side, #ffffff, rgba(255, 255, 255, 0)), ${RAINBOW_CONIC_GRADIENT}`,
        }}
        tabIndex={0}
        onKeyDown={handle_wheel_key}
        onPointerDown={(pointer_event) =>
          start_drag(pointer_event, update_from_wheel)
        }
        onPointerMove={(pointer_event) =>
          move_drag(pointer_event, update_from_wheel)
        }
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full bg-black"
          style={{ opacity: 1 - hsv.v }}
        />
        <div
          aria-hidden="true"
          className={`${THUMB_CLASS} h-5 w-5`}
          style={{
            left: radius + thumb.x,
            top: radius + thumb.y,
            backgroundColor: current_hex,
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span
          className="text-xs font-medium text-txt-muted"
          id={brightness_label_id}
        >
          {t("common.brightness")}
        </span>
        <div
          ref={slider_ref}
          aria-labelledby={brightness_label_id}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={brightness_percent}
          aria-valuetext={`${brightness_percent}%`}
          className={`relative mx-2 h-3 cursor-pointer touch-none select-none rounded-full ${SLIDER_FOCUS_CLASS}`}
          data-testid="color-wheel-brightness"
          role="slider"
          style={{
            backgroundImage: `linear-gradient(to right, #000000, ${full_brightness_hex})`,
            boxShadow: "inset 0 0 0 1px rgba(127, 127, 127, 0.3)",
          }}
          tabIndex={0}
          onKeyDown={handle_slider_key}
          onPointerDown={(pointer_event) =>
            start_drag(pointer_event, update_from_slider)
          }
          onPointerMove={(pointer_event) =>
            move_drag(pointer_event, update_from_slider)
          }
        >
          <div
            aria-hidden="true"
            className={`${THUMB_CLASS} top-1/2 h-4 w-4`}
            style={{
              left: `${hsv.v * 100}%`,
              backgroundColor: current_hex,
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-8 w-8 shrink-0 rounded-full"
          data-testid="color-wheel-preview"
          style={{
            backgroundColor: current_hex,
            boxShadow: "inset 0 0 0 1px rgba(127, 127, 127, 0.35)",
          }}
        />
        <label className="sr-only" htmlFor={hex_input_id}>
          {t("common.hex_color")}
        </label>
        <Input
          aria-invalid={hex_error}
          autoCapitalize="off"
          autoComplete="off"
          className="w-auto min-w-0 flex-1 font-mono"
          data-testid="color-wheel-hex"
          id={hex_input_id}
          maxLength={7}
          placeholder="#rrggbb"
          size="sm"
          spellCheck={false}
          status={hex_error ? "error" : "default"}
          title={t("common.hex_color")}
          type="text"
          value={hex_draft}
          onBlur={() => {
            set_hex_draft(hsv_to_hex(hsv));
            set_hex_error(false);
          }}
          onChange={(change_event) =>
            handle_hex_input(change_event.target.value)
          }
          onKeyDown={(key_event) => {
            if (key_event.key !== "Enter") {
              return;
            }

            key_event.preventDefault();

            if (!hex_error) {
              on_submit?.();
            }
          }}
        />
      </div>
    </div>
  );
}

export function custom_swatch_style(
  color: string | null,
  ring_background: string,
): CSSProperties {
  if (!color) {
    return { backgroundImage: RAINBOW_CONIC_GRADIENT };
  }

  return {
    backgroundImage: `radial-gradient(circle closest-side, ${color} 0 60%, transparent 60%), ${RAINBOW_CONIC_GRADIENT}`,
    boxShadow: `0 0 0 2px ${ring_background}, 0 0 0 4px ${color}`,
  };
}

interface CustomColorSwatchProps {
  value: string | null | undefined;
  is_selected: boolean;
  on_change?: (hex: string) => void;
  on_commit?: (hex: string) => void;
  default_color?: string;
  size_class?: string;
  check_class?: string;
  ring_background?: string;
  role?: "radio";
  tab_index?: number;
  autofocus_marker?: boolean;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  button_ref?: (node: HTMLButtonElement | null) => void;
}

export function CustomColorSwatch({
  value,
  is_selected,
  on_change,
  on_commit,
  default_color = DEFAULT_CUSTOM_COLOR,
  size_class = "h-7 w-7",
  check_class = "h-3.5 w-3.5",
  ring_background = "var(--aster-floating-bg, var(--bg-primary))",
  role,
  tab_index,
  autofocus_marker,
  align = "center",
  side = "bottom",
  button_ref,
}: CustomColorSwatchProps) {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);
  const [draft, set_draft] = useState<string | null>(null);
  const opened_with_ref = useRef<string | null>(null);
  const committed = is_selected ? normalize_hex_color(value) : null;
  const shown_color = (is_open && draft) || committed;

  const handle_open_change = (next_open: boolean) => {
    if (next_open) {
      opened_with_ref.current = committed;
      set_draft(null);
      set_is_open(true);

      return;
    }

    set_is_open(false);

    if (draft && draft !== opened_with_ref.current) {
      on_commit?.(draft);
    }

    set_draft(null);
  };

  return (
    <Popover open={is_open} onOpenChange={handle_open_change}>
      <PopoverTrigger asChild>
        <button
          ref={button_ref}
          aria-checked={role === "radio" ? Boolean(committed) : undefined}
          aria-haspopup="dialog"
          aria-label={t("common.custom_color")}
          aria-pressed={role === "radio" ? undefined : Boolean(committed)}
          className={`relative flex ${size_class} shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-full transition-shadow duration-150 motion-reduce:transition-none ${SLIDER_FOCUS_CLASS}`}
          data-autofocus={autofocus_marker ? "true" : undefined}
          data-color={shown_color ?? undefined}
          data-testid="custom-color-swatch"
          role={role}
          style={custom_swatch_style(shown_color, ring_background)}
          tabIndex={tab_index}
          title={t("common.custom_color")}
          type="button"
        >
          {shown_color && (
            <CheckIcon
              aria-hidden="true"
              className={check_class}
              strokeWidth={2.5}
              style={{ color: hex_to_readable_ink(shown_color) }}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        aria-label={t("common.custom_color")}
        className={POPOVER_CLASS}
        collisionPadding={16}
        data-testid="color-wheel-popover"
        role="dialog"
        side={side}
        sideOffset={8}
        onOpenAutoFocus={focus_wheel_on_open}
      >
        <ColorWheelPanel
          default_color={default_color}
          value={draft ?? committed ?? default_color}
          on_change={(hex) => {
            set_draft(hex);
            on_change?.(hex);
          }}
          on_submit={() => handle_open_change(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

interface AnchoredColorWheelProps {
  open: boolean;
  value: string | null | undefined;
  default_color?: string;
  on_close: () => void;
  on_commit: (hex: string) => void;
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}

export function AnchoredColorWheel({
  open,
  value,
  default_color = DEFAULT_CUSTOM_COLOR,
  on_close,
  on_commit,
  children,
  align = "start",
  side = "bottom",
}: AnchoredColorWheelProps) {
  const { t } = use_i18n();
  const [draft, set_draft] = useState<string | null>(null);
  const opened_with = normalize_hex_color(value);

  const close = () => {
    if (draft && draft !== opened_with) {
      on_commit(draft);
    }

    set_draft(null);
    on_close();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next_open) => {
        if (!next_open) {
          close();
        }
      }}
    >
      {children}
      <PopoverContent
        align={align}
        aria-label={t("common.custom_color")}
        className={POPOVER_CLASS}
        collisionPadding={16}
        data-testid="color-wheel-popover"
        role="dialog"
        side={side}
        sideOffset={8}
        onFocusOutside={(focus_event) => focus_event.preventDefault()}
        onOpenAutoFocus={focus_wheel_on_open}
      >
        {open && (
          <ColorWheelPanel
            default_color={default_color}
            value={draft ?? opened_with ?? default_color}
            on_change={set_draft}
            on_submit={close}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

export function CustomColorDot({
  color,
  className = "h-3 w-3",
}: {
  color?: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`block shrink-0 rounded-full ${className}`}
      style={{
        backgroundImage: color
          ? `radial-gradient(circle closest-side, ${color} 0 55%, transparent 55%), ${RAINBOW_CONIC_GRADIENT}`
          : RAINBOW_CONIC_GRADIENT,
      }}
    />
  );
}
