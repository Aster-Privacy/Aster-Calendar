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
export type MapTarget = "device" | "apple" | "openstreetmap";

interface PlatformHints {
  user_agent: string;
  max_touch_points: number;
}

function read_platform_hints(): PlatformHints {
  if (typeof navigator === "undefined") {
    return { user_agent: "", max_touch_points: 0 };
  }

  return {
    user_agent: navigator.userAgent ?? "",
    max_touch_points: navigator.maxTouchPoints ?? 0,
  };
}

export function map_target(hints: PlatformHints = read_platform_hints()): MapTarget {
  const { user_agent, max_touch_points } = hints;

  if (/android/i.test(user_agent)) return "device";
  if (/iphone|ipad|ipod/i.test(user_agent)) return "apple";
  if (/macintosh/i.test(user_agent) && max_touch_points > 1) return "apple";

  return "openstreetmap";
}

export function map_search_url(
  address: string,
  target: MapTarget = map_target(),
): string {
  const query = encodeURIComponent(address.trim());

  if (target === "device") return `geo:0,0?q=${query}`;
  if (target === "apple") return `https://maps.apple.com/?q=${query}`;

  return `https://www.openstreetmap.org/search?query=${query}`;
}
