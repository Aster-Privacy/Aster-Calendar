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
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

import { css_color_to_hex } from "@/lib/avatar_color";

export function is_native_platform(): boolean {
  return Capacitor.isNativePlatform();
}

export function get_platform(): "ios" | "android" | "web" {
  return Capacitor.getPlatform() as "ios" | "android" | "web";
}

function status_bar_color(is_dark: boolean): string {
  const fallback = is_dark ? "#121212" : "#ffffff";

  if (typeof document === "undefined") return fallback;

  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue("--bg-secondary")
    .trim();

  return css_color_to_hex(bg) ?? fallback;
}

export async function update_status_bar_theme(is_dark: boolean): Promise<void> {
  if (!is_native_platform()) return;

  await StatusBar.setStyle({ style: is_dark ? Style.Dark : Style.Light });

  if (get_platform() === "android") {
    await StatusBar.setBackgroundColor({ color: status_bar_color(is_dark) });
  }
}
