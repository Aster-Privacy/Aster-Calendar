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
export type AppKind = "mail" | "calendar";

export function app_kind(): AppKind {
  return import.meta.env.VITE_APP_KIND === "mail" ? "mail" : "calendar";
}

export function is_calendar_app(): boolean {
  return app_kind() === "calendar";
}

type ClientCapabilities = Record<string, boolean | undefined>;

let related_origins_supported = false;
let related_origins_probe: Promise<boolean> | null = null;

function related_origins_configured(): boolean {
  return import.meta.env.VITE_WEBAUTHN_RELATED_ORIGINS === "true";
}

export function probe_webauthn_related_origins(): Promise<boolean> {
  if (!is_calendar_app()) {
    return Promise.resolve(true);
  }

  if (related_origins_probe) {
    return related_origins_probe;
  }

  related_origins_probe = (async () => {
    try {
      const credential_api =
        typeof window === "undefined"
          ? undefined
          : (window.PublicKeyCredential as unknown as
              | { getClientCapabilities?: () => Promise<ClientCapabilities> }
              | undefined);
      const capabilities =
        typeof credential_api?.getClientCapabilities === "function"
          ? await credential_api.getClientCapabilities()
          : null;

      related_origins_supported = capabilities?.relatedOrigins === true;
    } catch {
      related_origins_supported = false;
    }

    return related_origins_supported;
  })();

  return related_origins_probe;
}

export function reset_webauthn_related_origins_probe(): void {
  related_origins_supported = false;
  related_origins_probe = null;
}

export function webauthn_available_here(): boolean {
  if (!is_calendar_app()) {
    return true;
  }

  return related_origins_configured() && related_origins_supported;
}

export function calendar_booking_available(): boolean {
  return import.meta.env.VITE_CALENDAR_BOOKING_ENABLED === "true";
}
