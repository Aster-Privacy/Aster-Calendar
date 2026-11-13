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

import { map_search_url, map_target } from "@/utils/map_link";

const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

describe("map_target", () => {
  it("hands addresses to the device map app on Android", () => {
    expect(map_target({ user_agent: ANDROID_CHROME, max_touch_points: 5 })).toBe(
      "device",
    );
  });

  it("uses Apple Maps on iPhone and iPad", () => {
    expect(map_target({ user_agent: IPHONE_SAFARI, max_touch_points: 5 })).toBe(
      "apple",
    );
    expect(map_target({ user_agent: MAC_SAFARI, max_touch_points: 5 })).toBe(
      "apple",
    );
  });

  it("keeps OpenStreetMap on desktop", () => {
    expect(map_target({ user_agent: MAC_SAFARI, max_touch_points: 0 })).toBe(
      "openstreetmap",
    );
    expect(map_target({ user_agent: WINDOWS_CHROME, max_touch_points: 0 })).toBe(
      "openstreetmap",
    );
  });
});

describe("map_search_url", () => {
  const address = " 221B Baker Street, London ";

  it("builds a geo URI for the device map app", () => {
    expect(map_search_url(address, "device")).toBe(
      "geo:0,0?q=221B%20Baker%20Street%2C%20London",
    );
  });

  it("builds an Apple Maps search", () => {
    expect(map_search_url(address, "apple")).toBe(
      "https://maps.apple.com/?q=221B%20Baker%20Street%2C%20London",
    );
  });

  it("builds an OpenStreetMap search", () => {
    expect(map_search_url(address, "openstreetmap")).toBe(
      "https://www.openstreetmap.org/search?query=221B%20Baker%20Street%2C%20London",
    );
  });
});
