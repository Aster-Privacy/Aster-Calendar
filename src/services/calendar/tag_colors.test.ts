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
import { describe, expect, it } from "vitest";

import { EVENT_COLOR_OPTIONS } from "@/components/calendar/calendar_utils";
import { collect_tags, tag_color } from "@/components/calendar/calendar_utils";
import {
  TAG_COLOR_MAX_ENTRIES,
  default_tag_color,
  is_tag_palette_color,
  resolve_tag_color,
  sanitize_tag_colors,
  tag_color_key,
  with_tag_color,
} from "@/services/calendar/tag_colors";

const palette = EVENT_COLOR_OPTIONS.map((option) => option.hex.toLowerCase());

function other_color(name: string): string {
  const fallback = default_tag_color(name);

  return palette.find((hex) => hex !== fallback) as string;
}

describe("tag_color_key", () => {
  it("trims, lowercases, and caps the name like event tags", () => {
    expect(tag_color_key("  Work ")).toBe("work");
    expect(tag_color_key("x".repeat(40))).toBe("x".repeat(32));
  });
});

describe("default_tag_color", () => {
  it("is stable, case insensitive, and stays on the palette", () => {
    expect(default_tag_color("Work")).toBe(default_tag_color(" work "));
    expect(palette).toContain(default_tag_color("Work"));
    expect(tag_color("Work")).toBe(default_tag_color("Work"));
  });
});

describe("is_tag_palette_color", () => {
  it("accepts palette colors in any case and rejects the rest", () => {
    expect(is_tag_palette_color(palette[0].toUpperCase())).toBe(true);
    expect(is_tag_palette_color("#123456")).toBe(false);
    expect(is_tag_palette_color("red")).toBe(false);
    expect(is_tag_palette_color(42)).toBe(false);
  });
});

describe("sanitize_tag_colors", () => {
  it("returns an empty map for anything that is not a plain object", () => {
    expect(sanitize_tag_colors(null)).toEqual({});
    expect(sanitize_tag_colors("x")).toEqual({});
    expect(sanitize_tag_colors([palette[0]])).toEqual({});
  });

  it("normalizes keys, drops invalid colors, and keeps the first duplicate", () => {
    expect(
      sanitize_tag_colors({
        " Work ": palette[1].toUpperCase(),
        work: palette[2],
        Home: "#123456",
        "   ": palette[3],
        gym: palette[4],
      }),
    ).toEqual({ work: palette[1], gym: palette[4] });
  });

  it("caps the number of entries", () => {
    const raw: Record<string, string> = {};

    for (let index = 0; index < TAG_COLOR_MAX_ENTRIES + 20; index += 1) {
      raw[`tag${index}`] = palette[0];
    }

    expect(Object.keys(sanitize_tag_colors(raw))).toHaveLength(
      TAG_COLOR_MAX_ENTRIES,
    );
  });
});

describe("resolve_tag_color", () => {
  it("uses the stored color when present and the hashed default otherwise", () => {
    const stored = other_color("Work");

    expect(resolve_tag_color("Work", { work: stored })).toBe(stored);
    expect(resolve_tag_color("Home", { work: stored })).toBe(
      default_tag_color("Home"),
    );
    expect(resolve_tag_color("Home", null)).toBe(default_tag_color("Home"));
  });

  it("ignores inherited keys and invalid stored values", () => {
    expect(resolve_tag_color("constructor", {})).toBe(
      default_tag_color("constructor"),
    );
    expect(resolve_tag_color("Work", { work: "#123456" })).toBe(
      default_tag_color("Work"),
    );
  });
});

describe("with_tag_color", () => {
  it("stores a new color under the normalized key without mutating", () => {
    const current = Object.freeze({ gym: palette[0] });
    const color = other_color("Work");
    const next = with_tag_color(current, " Work ", color.toUpperCase());

    expect(next).toEqual({ gym: palette[0], work: color });
    expect(current).toEqual({ gym: palette[0] });
  });

  it("returns the same map when nothing changes", () => {
    const color = other_color("Work");
    const current = { work: color };

    expect(with_tag_color(current, "work", color)).toBe(current);
    expect(with_tag_color(current, "work", "#123456")).toBe(current);
    expect(with_tag_color(current, "   ", palette[0])).toBe(current);
  });

  it("drops the entry when the color goes back to the default", () => {
    const current = { work: other_color("Work"), gym: palette[0] };

    expect(with_tag_color(current, "Work", default_tag_color("Work"))).toEqual({
      gym: palette[0],
    });
  });

  it("keeps only the newest entries at the cap", () => {
    const current: Record<string, string> = {};

    for (let index = 0; index < TAG_COLOR_MAX_ENTRIES; index += 1) {
      current[`tag${index}`] = other_color(`tag${index}`);
    }

    const next = with_tag_color(current, "fresh", other_color("fresh"));

    expect(Object.keys(next)).toHaveLength(TAG_COLOR_MAX_ENTRIES);
    expect(next.fresh).toBe(other_color("fresh"));
    expect(next.tag0).toBeUndefined();
  });
});

describe("collect_tags", () => {
  it("applies stored colors to the collected tags", () => {
    const stored = other_color("Work");
    const tags = collect_tags(
      [{ tags: ["Work", "home"] }, { tags: ["work"] }] as unknown as Parameters<
        typeof collect_tags
      >[0],
      { work: stored },
    );
    const by_name = Object.fromEntries(
      tags.map((tag) => [tag.name.toLowerCase(), tag.color]),
    );

    expect(by_name.work).toBe(stored);
    expect(by_name.home).toBe(default_tag_color("home"));
  });
});
