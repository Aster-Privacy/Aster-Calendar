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
import { api_client } from "@/services/api/client";
import { is_tauri_env } from "@/services/api/client/helpers";

export const FEED_MAX_BYTES = 2 * 1024 * 1024;
export const NATIVE_FEED_COMMAND = "fetch_calendar_feed";
export const FEED_RELAY_PATH = "/calendar/v1/subscriptions/fetch";

const WEBCAL_SCHEME_PATTERN = /^webcals?:\/\//i;
const VCALENDAR_PATTERN = /^\uFEFF?\s*BEGIN:VCALENDAR/i;

export function is_ics_document(text: string): boolean {
  return VCALENDAR_PATTERN.test(text);
}

export function feed_request_url(value: string): string | null {
  const trimmed = value.trim();
  const normalized = WEBCAL_SCHEME_PATTERN.test(trimmed)
    ? trimmed.replace(WEBCAL_SCHEME_PATTERN, "https://")
    : trimmed;

  try {
    const parsed = new URL(normalized);

    if (parsed.protocol !== "https:" || parsed.hostname.length === 0) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function accept_feed(text: unknown): string | null {
  if (typeof text !== "string" || text.length > FEED_MAX_BYTES) {
    return null;
  }

  return is_ics_document(text) ? text : null;
}

async function fetch_feed_natively(url: string): Promise<string | null> {
  try {
    const core = await import("@tauri-apps/api/core");

    return accept_feed(await core.invoke<string>(NATIVE_FEED_COMMAND, { url }));
  } catch {
    return null;
  }
}

async function fetch_feed_through_relay(url: string): Promise<string | null> {
  try {
    const response = await api_client.post<{ ics: string }>(FEED_RELAY_PATH, {
      url,
    });

    return accept_feed(response.data?.ics);
  } catch {
    return null;
  }
}

export async function fetch_subscription_feed(
  value: string,
): Promise<string | null> {
  const url = feed_request_url(value);

  if (!url) {
    return null;
  }

  if (is_tauri_env()) {
    return fetch_feed_natively(url);
  }

  return fetch_feed_through_relay(url);
}
