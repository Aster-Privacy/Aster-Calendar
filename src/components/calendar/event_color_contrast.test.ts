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
  contrast_ratio,
} from "./calendar_utils";

const CHIP_TEXT_COLOR = "#ffffff";
const WCAG_AA_TEXT_RATIO = 4.5;

describe("event chip text contrast", () => {
  it("offers the same colors as mail tags", () => {
    expect(EVENT_COLOR_OPTIONS.map((option) => option.hex)).toEqual(
      TAG_COLOR_PRESETS.map((preset) => preset.hex),
    );
  });

  it.each([...EVENT_COLOR_OPTIONS, NEUTRAL_EVENT_COLOR].map((option) => [option.name, option]))(
    "%s keeps white chip text at 4.5:1 in light and dark",
    (_name, option) => {
      const light = contrast_ratio(CHIP_TEXT_COLOR, option.fill);
      const dark = contrast_ratio(CHIP_TEXT_COLOR, option.dark_fill);

      expect(light).not.toBeNull();
      expect(dark).not.toBeNull();
      expect(light ?? 0).toBeGreaterThanOrEqual(WCAG_AA_TEXT_RATIO);
      expect(dark ?? 0).toBeGreaterThanOrEqual(WCAG_AA_TEXT_RATIO);
    },
  );
});
