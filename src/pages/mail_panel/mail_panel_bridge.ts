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

import { DARK_ONLY_COLOR_THEMES } from "@/lib/dark_mode";
import { app_pathname } from "@/lib/account_index_url";
import { is_handoff_user_id } from "@/lib/session_handoff/session_handoff_protocol";

export const MAIL_PANEL_PATH = "/mail-panel";
export const MAIL_PANEL_SOURCE = "aster-calendar-panel";
export const MAIL_HOST_SOURCE = "aster-mail";
export const PANEL_ACCOUNT_PARAM = "account";

const PRODUCTION_HOST_ORIGINS: readonly string[] = [
  "https://app.astermail.org",
];
const DEV_HOST_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export type PanelTheme = "light" | "dark";

export type PanelPalette = "default" | (typeof DARK_ONLY_COLOR_THEMES)[number];

export interface PanelAppearance {
  theme: PanelTheme;
  palette: PanelPalette;
  accent: string;
}

const PANEL_PALETTES: ReadonlySet<string> = new Set<string>([
  "default",
  ...DARK_ONLY_COLOR_THEMES,
]);
const ACCENT_PATTERN = /^#[0-9a-f]{6}$/i;

export type PanelMessage =
  | { type: "ready" }
  | { type: "close" }
  | { type: "status"; status: "signed_out" | "locked" | "failed" };

export type HostMessage =
  | ({ type: "theme" } & PanelAppearance)
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

export function parse_panel_palette(value: unknown): PanelPalette {
  return typeof value === "string" && PANEL_PALETTES.has(value)
    ? (value as PanelPalette)
    : "default";
}

export function parse_panel_accent(value: unknown): string {
  return typeof value === "string" && ACCENT_PATTERN.test(value) ? value : "";
}

export function parse_panel_appearance(
  theme: unknown,
  palette: unknown,
  accent: unknown,
): PanelAppearance | null {
  const parsed_theme = parse_panel_theme(theme);

  if (parsed_theme === null) return null;

  return {
    theme: parsed_theme,
    palette: parse_panel_palette(palette),
    accent: parse_panel_accent(accent),
  };
}

export function read_initial_panel_appearance(
  search: string,
): PanelAppearance | null {
  try {
    const params = new URLSearchParams(search);

    return parse_panel_appearance(
      params.get("theme"),
      params.get("palette"),
      params.get("accent"),
    );
  } catch {
    return null;
  }
}

export function read_panel_expected_user(search: string): string | null {
  try {
    const value = new URLSearchParams(search).get(PANEL_ACCOUNT_PARAM);

    return is_handoff_user_id(value) ? value.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function panel_expected_user(): string | null {
  if (typeof window === "undefined") return null;
  if (!is_mail_panel_path(app_pathname())) return null;

  return read_panel_expected_user(window.location.search);
}

export function is_panel_account_allowed(
  expected_user_id: string | null,
  user_id: string | null | undefined,
): boolean {
  if (expected_user_id === null) return true;
  if (!user_id) return false;

  return user_id.toLowerCase() === expected_user_id;
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
    const appearance = parse_panel_appearance(
      data.theme,
      data.palette,
      data.accent,
    );

    return appearance ? { type: "theme", ...appearance } : null;
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
