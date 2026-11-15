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
export interface HsvColor {
  h: number;
  s: number;
  v: number;
}

const SHORT_HEX_PATTERN = /^#?([0-9a-f]{3})$/i;
const LONG_HEX_PATTERN = /^#?([0-9a-f]{6})$/i;
const STORED_HEX_PATTERN = /^#[0-9a-f]{6}$/;

export const DEFAULT_CUSTOM_COLOR = "#3b82f6";

export function normalize_hex_color(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const long_match = trimmed.match(LONG_HEX_PATTERN);

  if (long_match) {
    return `#${long_match[1].toLowerCase()}`;
  }

  const short_match = trimmed.match(SHORT_HEX_PATTERN);

  if (short_match) {
    return `#${short_match[1]
      .toLowerCase()
      .split("")
      .map((digit) => digit + digit)
      .join("")}`;
  }

  return null;
}

export function is_stored_hex_color(value: unknown): value is string {
  return (
    typeof value === "string" && STORED_HEX_PATTERN.test(value.toLowerCase())
  );
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

export function hex_to_rgb(hex: string): [number, number, number] | null {
  const normalized = normalize_hex_color(hex);

  if (!normalized) {
    return null;
  }

  const int_value = parseInt(normalized.slice(1), 16);

  return [(int_value >> 16) & 255, (int_value >> 8) & 255, int_value & 255];
}

export function rgb_to_hex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) =>
      Math.round(clamp(channel, 0, 255))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function rgb_to_hsv(red: number, green: number, blue: number): HsvColor {
  const red_unit = clamp(red, 0, 255) / 255;
  const green_unit = clamp(green, 0, 255) / 255;
  const blue_unit = clamp(blue, 0, 255) / 255;
  const max = Math.max(red_unit, green_unit, blue_unit);
  const min = Math.min(red_unit, green_unit, blue_unit);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === red_unit) {
      hue = ((green_unit - blue_unit) / delta) % 6;
    } else if (max === green_unit) {
      hue = (blue_unit - red_unit) / delta + 2;
    } else {
      hue = (red_unit - green_unit) / delta + 4;
    }

    hue *= 60;

    if (hue < 0) {
      hue += 360;
    }
  }

  return { h: hue, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsv_to_rgb(hsv: HsvColor): [number, number, number] {
  const hue = ((hsv.h % 360) + 360) % 360;
  const saturation = clamp(hsv.s, 0, 1);
  const value = clamp(hsv.v, 0, 1);
  const chroma = value * saturation;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = value - chroma;
  let channels: [number, number, number];

  if (hue < 60) {
    channels = [chroma, secondary, 0];
  } else if (hue < 120) {
    channels = [secondary, chroma, 0];
  } else if (hue < 180) {
    channels = [0, chroma, secondary];
  } else if (hue < 240) {
    channels = [0, secondary, chroma];
  } else if (hue < 300) {
    channels = [secondary, 0, chroma];
  } else {
    channels = [chroma, 0, secondary];
  }

  return [
    (channels[0] + offset) * 255,
    (channels[1] + offset) * 255,
    (channels[2] + offset) * 255,
  ];
}

export function hex_to_hsv(hex: string): HsvColor | null {
  const rgb = hex_to_rgb(hex);

  return rgb ? rgb_to_hsv(rgb[0], rgb[1], rgb[2]) : null;
}

export function hsv_to_hex(hsv: HsvColor): string {
  const [red, green, blue] = hsv_to_rgb(hsv);

  return rgb_to_hex(red, green, blue);
}

export function wheel_point_to_hue_saturation(
  offset_x: number,
  offset_y: number,
  radius: number,
): { h: number; s: number } {
  if (radius <= 0) {
    return { h: 0, s: 0 };
  }

  const angle = (Math.atan2(offset_x, -offset_y) * 180) / Math.PI;

  return {
    h: (angle + 360) % 360,
    s: clamp(Math.hypot(offset_x, offset_y) / radius, 0, 1),
  };
}

export function hue_saturation_to_wheel_point(
  hue: number,
  saturation: number,
  radius: number,
): { x: number; y: number } {
  const angle = (hue * Math.PI) / 180;
  const distance = clamp(saturation, 0, 1) * radius;

  return {
    x: Math.sin(angle) * distance,
    y: -Math.cos(angle) * distance,
  };
}
