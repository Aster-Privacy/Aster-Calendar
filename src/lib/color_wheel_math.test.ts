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

import {
  hex_to_hsv,
  hex_to_rgb,
  hsv_to_hex,
  hsv_to_rgb,
  hue_saturation_to_wheel_point,
  is_stored_hex_color,
  normalize_hex_color,
  rgb_to_hex,
  rgb_to_hsv,
  wheel_point_to_hue_saturation,
} from "@/lib/color_wheel_math";

describe("normalize_hex_color", () => {
  it("returns lowercase #rrggbb for six digit input", () => {
    expect(normalize_hex_color("#1A2B3C")).toBe("#1a2b3c");
    expect(normalize_hex_color("1a2b3c")).toBe("#1a2b3c");
    expect(normalize_hex_color("  #ABCDEF  ")).toBe("#abcdef");
  });

  it("expands three digit input", () => {
    expect(normalize_hex_color("#F0a")).toBe("#ff00aa");
    expect(normalize_hex_color("abc")).toBe("#aabbcc");
  });

  it("rejects anything else", () => {
    for (const value of [
      "",
      "#",
      "#12",
      "#1234",
      "#12345",
      "#1234567",
      "#12345g",
      "blue",
      "rgb(1, 2, 3)",
      null,
      undefined,
      42,
    ]) {
      expect(normalize_hex_color(value)).toBeNull();
    }
  });
});

describe("is_stored_hex_color", () => {
  it("accepts only full six digit hex with a hash", () => {
    expect(is_stored_hex_color("#a1b2c3")).toBe(true);
    expect(is_stored_hex_color("#A1B2C3")).toBe(true);
    expect(is_stored_hex_color("a1b2c3")).toBe(false);
    expect(is_stored_hex_color("#abc")).toBe(false);
    expect(is_stored_hex_color(null)).toBe(false);
  });
});

describe("rgb and hex", () => {
  it("round trips every channel boundary", () => {
    expect(hex_to_rgb("#000000")).toEqual([0, 0, 0]);
    expect(hex_to_rgb("#ffffff")).toEqual([255, 255, 255]);
    expect(hex_to_rgb("#ff8000")).toEqual([255, 128, 0]);
    expect(hex_to_rgb("nope")).toBeNull();
    expect(rgb_to_hex(255, 128, 0)).toBe("#ff8000");
    expect(rgb_to_hex(300, -4, 127.6)).toBe("#ff0080");
  });
});

describe("hsv conversion", () => {
  it("converts primaries and neutrals", () => {
    expect(rgb_to_hsv(255, 0, 0)).toEqual({ h: 0, s: 1, v: 1 });
    expect(rgb_to_hsv(0, 255, 0)).toEqual({ h: 120, s: 1, v: 1 });
    expect(rgb_to_hsv(0, 0, 255)).toEqual({ h: 240, s: 1, v: 1 });
    expect(rgb_to_hsv(255, 255, 255)).toEqual({ h: 0, s: 0, v: 1 });
    expect(rgb_to_hsv(0, 0, 0)).toEqual({ h: 0, s: 0, v: 0 });
  });

  it("maps hsv back to rgb", () => {
    expect(hsv_to_rgb({ h: 60, s: 1, v: 1 })).toEqual([255, 255, 0]);
    expect(hsv_to_rgb({ h: 180, s: 1, v: 1 })).toEqual([0, 255, 255]);
    expect(hsv_to_rgb({ h: 300, s: 1, v: 1 })).toEqual([255, 0, 255]);
    expect(hsv_to_hex({ h: 360, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsv_to_hex({ h: -120, s: 1, v: 1 })).toBe("#0000ff");
    expect(hsv_to_hex({ h: 0, s: 0, v: 0.5 })).toBe("#808080");
  });

  it("round trips every sampled hex exactly", () => {
    for (let red = 0; red < 256; red += 17) {
      for (let green = 0; green < 256; green += 51) {
        for (let blue = 0; blue < 256; blue += 85) {
          const hex = rgb_to_hex(red, green, blue);
          const hsv = hex_to_hsv(hex);

          expect(hsv).not.toBeNull();
          expect(hsv_to_hex(hsv!)).toBe(hex);
        }
      }
    }
  });

  it("always emits lowercase six digit hex", () => {
    expect(hsv_to_hex({ h: 210, s: 0.75, v: 0.9 })).toMatch(/^#[0-9a-f]{6}$/);
    expect(hsv_to_hex(hex_to_hsv("#ABCDEF")!)).toBe("#abcdef");
  });
});

describe("wheel geometry", () => {
  it("puts red at the top and runs hue clockwise", () => {
    expect(wheel_point_to_hue_saturation(0, -100, 100)).toEqual({
      h: 0,
      s: 1,
    });
    expect(wheel_point_to_hue_saturation(100, 0, 100).h).toBeCloseTo(90);
    expect(wheel_point_to_hue_saturation(0, 100, 100).h).toBeCloseTo(180);
    expect(wheel_point_to_hue_saturation(-100, 0, 100).h).toBeCloseTo(270);
  });

  it("maps distance to saturation and clamps outside the wheel", () => {
    expect(wheel_point_to_hue_saturation(0, 0, 100).s).toBe(0);
    expect(wheel_point_to_hue_saturation(30, -40, 100).s).toBeCloseTo(0.5);
    expect(wheel_point_to_hue_saturation(300, 0, 100).s).toBe(1);
    expect(wheel_point_to_hue_saturation(5, 5, 0)).toEqual({ h: 0, s: 0 });
  });

  it("inverts the thumb position", () => {
    for (const hue of [0, 45, 135, 200, 315]) {
      for (const saturation of [0.25, 0.6, 1]) {
        const point = hue_saturation_to_wheel_point(hue, saturation, 100);
        const back = wheel_point_to_hue_saturation(point.x, point.y, 100);

        expect(back.h).toBeCloseTo(hue);
        expect(back.s).toBeCloseTo(saturation);
      }
    }
  });
});
