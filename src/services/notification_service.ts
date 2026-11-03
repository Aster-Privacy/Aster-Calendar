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
function is_tauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function request_notification_permission(): Promise<NotificationPermission> {
  if (is_tauri()) {
    try {
      const { isPermissionGranted, requestPermission } =
        await import("@tauri-apps/plugin-notification");

      const permitted = await isPermissionGranted();

      if (permitted) return "granted";

      const result = await requestPermission();

      return result === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }

  if (!("Notification" in window)) {
    return "denied";
  }

  if (Notification.permission !== "default") {
    return Notification.permission;
  }

  return await Notification.requestPermission();
}

export async function load_notification_preferences(
  _vault?: unknown,
): Promise<{ enabled: boolean }> {
  if (is_tauri()) {
    try {
      const { isPermissionGranted } =
        await import("@tauri-apps/plugin-notification");

      return { enabled: await isPermissionGranted() };
    } catch {
      return { enabled: false };
    }
  }

  if (!("Notification" in window)) {
    return { enabled: false };
  }

  return { enabled: Notification.permission === "granted" };
}
