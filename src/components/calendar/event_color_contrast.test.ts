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

import { TAG_COLOR_PRESETS } from "@/components/ui/email_tag";

import {
  EVENT_COLOR_OPTIONS,
  NEUTRAL_EVENT_COLOR,
  READABLE_INK_DARK,
  READABLE_INK_LIGHT,
  build_event_block_style,
  contrast_ratio,
  find_event_color_option,
  ink_on_fill,
  parse_color_channels,
} from "./calendar_utils";

const WCAG_AA_TEXT_RATIO = 4.5;
const HOVER_FILL_SHARE = 0.94;
const LEGACY_TOKEN_NAMES = [
  "rose",
  "amber",
  "lime",
  "emerald",
  "cyan",
  "sky",
  "indigo",
  "violet",
  "fuchsia",
  "slate",
];

function hover_fill(fill: string): string {
  const channels = parse_color_channels(fill);

  if (!channels) {
    throw new Error(`unparsable fill ${fill}`);
  }

  const darken = (channel: number) =>
    Math.round(channel * HOVER_FILL_SHARE)
      .toString(16)
      .padStart(2, "0");

  return `#${darken(channels.red)}${darken(channels.green)}${darken(channels.blue)}`;
}

describe("event chip text contrast", () => {
  it("keeps its own list apart from the mail tag presets", () => {
    expect(TAG_COLOR_PRESETS).toHaveLength(17);
    expect(EVENT_COLOR_OPTIONS).toHaveLength(10);
    expect(new Set(EVENT_COLOR_OPTIONS.map((option) => option.hex)).size).toBe(
      EVENT_COLOR_OPTIONS.length,
    );
    expect(new Set(EVENT_COLOR_OPTIONS.map((option) => option.fill)).size).toBe(
      EVENT_COLOR_OPTIONS.length,
    );
    expect(EVENT_COLOR_OPTIONS).toContain(NEUTRAL_EVENT_COLOR);
  });

  it.each(EVENT_COLOR_OPTIONS.map((option) => [option.name, option]))(
    "%s title ink reaches 4.5:1 in light, dark, and hover",
    (_name, option) => {
      const ink = ink_on_fill(option.token);

      expect([READABLE_INK_LIGHT, READABLE_INK_DARK]).toContain(ink);
      expect(ink).toBe(option.ink);
      expect(build_event_block_style(option.hex).color).toBe(ink);

      for (const fill of [
        option.fill,
        option.dark_fill,
        hover_fill(option.fill),
      ]) {
        expect(contrast_ratio(ink, fill) ?? 0).toBeGreaterThanOrEqual(
          WCAG_AA_TEXT_RATIO,
        );
      }
    },
  );

  it("uses dark ink on yellow and orange", () => {
    expect(ink_on_fill("var(--cal_color_yellow)")).toBe(READABLE_INK_DARK);
    expect(ink_on_fill("var(--cal_color_orange)")).toBe(READABLE_INK_DARK);
  });

  it.each(LEGACY_TOKEN_NAMES)(
    "earlier token %s resolves to a swatch ink that reaches 4.5:1",
    (name) => {
      const token = `var(--cal_color_${name})`;
      const style = build_event_block_style(token);
      const option = find_event_color_option(token);

      expect(option).not.toBeNull();
      expect(EVENT_COLOR_OPTIONS).toContain(option);
      expect(style["--cal_color"]).toBe(token);
      expect(style.color).toBe(option?.ink);
      expect(
        contrast_ratio(style.color ?? "", option?.fill ?? "") ?? 0,
      ).toBeGreaterThanOrEqual(WCAG_AA_TEXT_RATIO);
    },
  );
});
