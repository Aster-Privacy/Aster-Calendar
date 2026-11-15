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
import { useSyncExternalStore } from "react";

export const MAIL_PANEL_PATH = "/mail-panel";
export const MAIL_PANEL_SOURCE = "aster-calendar-panel";
export const MAIL_HOST_SOURCE = "aster-mail";

const PRODUCTION_HOST_ORIGINS: readonly string[] = [
  "https://app.astermail.org",
];
const DEV_HOST_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export type PanelTheme = "light" | "dark";

export type PanelMessage =
  | { type: "ready" }
  | { type: "close" }
  | { type: "status"; status: "signed_out" | "locked" | "failed" };

export type HostMessage =
  | { type: "theme"; theme: PanelTheme }
  | { type: "visibility"; visible: boolean };

type VisibilityListener = () => void;

let panel_visible = true;
const visibility_listeners = new Set<VisibilityListener>();

export function get_panel_visible(): boolean {
  return panel_visible;
}

export function set_panel_visible(visible: boolean): void {
  if (panel_visible === visible) return;

  panel_visible = visible;

  for (const listener of Array.from(visibility_listeners)) {
    listener();
  }
}

export function subscribe_panel_visible(
  listener: VisibilityListener,
): () => void {
  visibility_listeners.add(listener);

  return () => {
    visibility_listeners.delete(listener);
  };
}

export function use_panel_visible(): boolean {
  return useSyncExternalStore(
    subscribe_panel_visible,
    get_panel_visible,
    get_panel_visible,
  );
}

export function is_allowed_host_origin(
  origin: string,
  allow_dev: boolean = import.meta.env.DEV,
): boolean {
  if (PRODUCTION_HOST_ORIGINS.includes(origin)) return true;

  return allow_dev && DEV_HOST_PATTERN.test(origin);
}

export function is_mail_panel_path(pathname: string): boolean {
  return pathname === MAIL_PANEL_PATH || pathname === `${MAIL_PANEL_PATH}/`;
}

export function parse_panel_theme(value: unknown): PanelTheme | null {
  return value === "light" || value === "dark" ? value : null;
}

export function read_initial_panel_theme(search: string): PanelTheme | null {
  try {
    return parse_panel_theme(new URLSearchParams(search).get("theme"));
  } catch {
    return null;
  }
}

function host_window(): Window | null {
  if (typeof window === "undefined") return null;
  if (window.parent === window) return null;

  return window.parent;
}

function ancestor_origin(): string | null {
  try {
    const ancestors = window.location.ancestorOrigins;

    if (ancestors && ancestors.length > 0) return ancestors[0] ?? null;
  } catch {
    return null;
  }

  return null;
}

export function post_to_host(message: PanelMessage): void {
  const target = host_window();

  if (!target) return;

  const payload = { source: MAIL_PANEL_SOURCE, ...message };
  const known = ancestor_origin();

  if (known !== null) {
    if (is_allowed_host_origin(known)) target.postMessage(payload, known);

    return;
  }

  for (const origin of PRODUCTION_HOST_ORIGINS) {
    target.postMessage(payload, origin);
  }
}

export function read_host_message(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  expected_source: MessageEventSource | null,
): HostMessage | null {
  if (expected_source === null || event.source !== expected_source) {
    return null;
  }

  if (!is_allowed_host_origin(event.origin)) return null;

  const data = event.data as Record<string, unknown> | null;

  if (typeof data !== "object" || data === null) return null;
  if (data.source !== MAIL_HOST_SOURCE) return null;

  if (data.type === "theme") {
    const theme = parse_panel_theme(data.theme);

    return theme ? { type: "theme", theme } : null;
  }

  if (data.type === "visibility") {
    return typeof data.visible === "boolean"
      ? { type: "visibility", visible: data.visible }
      : null;
  }

  return null;
}

export function open_in_new_tab(url: string): void {
  const opened = window.open(url, "_blank", "noopener,noreferrer");

  if (opened) opened.opener = null;
}
