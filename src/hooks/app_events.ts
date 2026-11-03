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
export const APP_EVENTS = {
  AUTH_READY: "aster:auth-ready",
  CONTACTS_CHANGED: "aster:contacts-changed",
  ALIASES_CHANGED: "aster:aliases-changed",
} as const;

export type AppEventType = (typeof APP_EVENTS)[keyof typeof APP_EVENTS];

function emit_app_event(event: AppEventType): void {
  window.dispatchEvent(new CustomEvent(event));
}

export function emit_auth_ready(): void {
  emit_app_event(APP_EVENTS.AUTH_READY);
}

export function emit_contacts_changed(): void {
  emit_app_event(APP_EVENTS.CONTACTS_CHANGED);
}

export function emit_aliases_changed(): void {
  emit_app_event(APP_EVENTS.ALIASES_CHANGED);
}

export function on_app_events(
  events: AppEventType[],
  handler: () => void,
): () => void {
  const listener = () => handler();

  events.forEach((event) => window.addEventListener(event, listener));

  return () => {
    events.forEach((event) => window.removeEventListener(event, listener));
  };
}
