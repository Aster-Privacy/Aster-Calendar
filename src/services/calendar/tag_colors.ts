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
import { EVENT_COLOR_OPTIONS } from "@/components/calendar/calendar_utils";

export type TagColorMap = Record<string, string>;

export const TAG_COLOR_MAX_ENTRIES = 500;

const TAG_NAME_MAX_LENGTH = 32;

let tag_palette_cache: string[] | null = null;

function tag_palette(): string[] {
  if (!tag_palette_cache) {
    tag_palette_cache = EVENT_COLOR_OPTIONS.map((option) =>
      option.hex.toLowerCase(),
    );
  }

  return tag_palette_cache;
}

export function tag_color_key(name: string): string {
  return name.trim().slice(0, TAG_NAME_MAX_LENGTH).toLowerCase();
}

export function is_tag_palette_color(value: unknown): value is string {
  return (
    typeof value === "string" && tag_palette().includes(value.toLowerCase())
  );
}

export function default_tag_color(name: string): string {
  const key = name.trim().toLowerCase();
  let hash = 0;

  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }

  const palette = tag_palette();

  return palette[hash % palette.length];
}

function has_own(map: TagColorMap, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

export function sanitize_tag_colors(raw: unknown): TagColorMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const entries = new Map<string, string>();

  for (const [raw_key, raw_value] of Object.entries(raw)) {
    if (entries.size >= TAG_COLOR_MAX_ENTRIES) {
      break;
    }

    if (!is_tag_palette_color(raw_value)) {
      continue;
    }

    const key = tag_color_key(raw_key);

    if (key.length === 0 || entries.has(key)) {
      continue;
    }

    entries.set(key, raw_value.toLowerCase());
  }

  return Object.fromEntries(entries);
}

export function resolve_tag_color(
  name: string,
  colors: TagColorMap | null | undefined,
): string {
  const key = tag_color_key(name);

  if (colors && has_own(colors, key) && is_tag_palette_color(colors[key])) {
    return colors[key].toLowerCase();
  }

  return default_tag_color(name);
}

export function with_tag_color(
  colors: TagColorMap | null | undefined,
  name: string,
  color: string,
): TagColorMap {
  const current = colors ?? {};
  const key = tag_color_key(name);

  if (key.length === 0 || !is_tag_palette_color(color)) {
    return current;
  }

  const next_color = color.toLowerCase();

  if (resolve_tag_color(name, current) === next_color) {
    return current;
  }

  const entries = Object.entries(current).filter(
    ([existing]) => existing !== key,
  );

  if (next_color !== default_tag_color(name)) {
    entries.push([key, next_color]);
  }

  return Object.fromEntries(entries.slice(-TAG_COLOR_MAX_ENTRIES));
}
