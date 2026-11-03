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
import type { ApiResponse } from "@/services/api/client/helpers";

import { api_client } from "@/services/api/client";
import { decrypt_mail_envelope } from "@/services/crypto/decrypt_envelope";
import { zone_offset_ms } from "@/services/calendar/recurrence";

export const BOOKING_EVENT_PREFIX = "booking-";
export const BOOKING_CALENDAR_ID = "__bookings__";
export const BOOKING_COLOR = "#039be5";

export interface AvailabilityWindow {
  day: number;
  start_minute: number;
  end_minute: number;
}

export interface AppointmentSchedule {
  id: string;
  slug: string;
  title: string;
  duration_minutes: number;
  windows: AvailabilityWindow[];
  timezone: string;
  is_enabled: boolean;
}

export interface AppointmentBooking {
  id: string;
  schedule_id: string;
  schedule_title: string;
  starts_at: string;
  ends_at: string;
  guest_name: string;
  guest_email: string;
  note: string;
}

export interface SealedAppointmentBooking {
  id: string;
  schedule_id: string;
  schedule_title: string;
  starts_at: string;
  ends_at: string;
  sealed_details: string;
  details_nonce: string;
}

interface BookingDetails {
  guest_name?: unknown;
  guest_email?: unknown;
  note?: unknown;
}

function details_text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function is_sealed_nonce(value: string): boolean {
  try {
    return atob(value).length === 12;
  } catch {
    return false;
  }
}

export async function open_booking(
  sealed: SealedAppointmentBooking,
): Promise<AppointmentBooking> {
  let details: BookingDetails | null = null;

  try {
    if (!is_sealed_nonce(sealed.details_nonce)) {
      throw new Error("booking details are not sealed");
    }
    details = await decrypt_mail_envelope<BookingDetails>(
      sealed.sealed_details,
      sealed.details_nonce,
    );
  } catch {
    details = null;
  }

  return {
    ends_at: sealed.ends_at,
    guest_email: details_text(details?.guest_email),
    guest_name: details_text(details?.guest_name),
    id: sealed.id,
    note: details_text(details?.note),
    schedule_id: sealed.schedule_id,
    schedule_title: sealed.schedule_title,
    starts_at: sealed.starts_at,
  };
}

export interface PublicSchedule {
  title: string;
  duration_minutes: number;
  windows: AvailabilityWindow[];
  timezone: string;
  windows_set_at?: string;
  booked_starts: string[];
  show_branding: boolean;
}

export function is_booking_event(event: { id: string }): boolean {
  return event.id.startsWith(BOOKING_EVENT_PREFIX);
}

export async function list_schedules() {
  return api_client.get<AppointmentSchedule[]>("/calendar/v1/schedules", {
    silent_statuses: [404],
  });
}

export async function create_schedule(request: {
  slug: string;
  title: string;
  duration_minutes: number;
  windows: AvailabilityWindow[];
  timezone: string;
}) {
  return api_client.post<AppointmentSchedule>(
    "/calendar/v1/schedules",
    request,
  );
}

export async function delete_schedule(schedule_id: string) {
  return api_client.delete<{ success: boolean }>(
    `/calendar/v1/schedules/${encodeURIComponent(schedule_id)}`,
  );
}

export async function delete_booking(booking_id: string) {
  return api_client.delete<{ success: boolean }>(
    `/calendar/v1/schedule_bookings/${encodeURIComponent(booking_id)}`,
  );
}

export async function list_bookings(
  start: Date,
  end: Date,
): Promise<ApiResponse<AppointmentBooking[]>> {
  const response = await api_client.get<SealedAppointmentBooking[]>(
    `/calendar/v1/schedule_bookings?start=${encodeURIComponent(
      start.toISOString(),
    )}&end=${encodeURIComponent(end.toISOString())}`,
    { silent_statuses: [404] },
  );

  if (!response.data) return { ...response, data: undefined };

  return {
    ...response,
    data: await Promise.all(response.data.map(open_booking)),
  };
}

export type PublicScheduleResult =
  | { status: "ok"; schedule: PublicSchedule }
  | { status: "not_found" }
  | { status: "error" };

export type PublicBookingResult =
  | "booked"
  | "failed"
  | "limit_reached"
  | "rate_limited"
  | "slot_taken"
  | "verification_failed";

const MAX_PUBLIC_WINDOWS = 64;
const MAX_PUBLIC_BOOKED = 2000;
const MINUTES_PER_DAY = 1440;

function is_minute(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MINUTES_PER_DAY
  );
}

export function booked_start_keys(values: unknown): Set<string> {
  const keys = new Set<string>();

  if (!Array.isArray(values)) {
    return keys;
  }

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      keys.add(parsed.toISOString());
    }
  }

  return keys;
}

export function sanitize_public_schedule(raw: unknown): PublicSchedule | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const value = raw as Record<string, unknown>;
  const windows = Array.isArray(value.windows) ? value.windows : [];
  const booked = Array.isArray(value.booked_starts) ? value.booked_starts : [];

  if (typeof value.duration_minutes !== "number") {
    return null;
  }

  return {
    title: typeof value.title === "string" ? value.title : "",
    duration_minutes: value.duration_minutes,
    timezone: typeof value.timezone === "string" ? value.timezone : "UTC",
    windows_set_at:
      typeof value.windows_set_at === "string"
        ? value.windows_set_at
        : undefined,
    windows: windows
      .filter(
        (window): window is AvailabilityWindow =>
          !!window &&
          typeof window === "object" &&
          Number.isInteger((window as AvailabilityWindow).day) &&
          (window as AvailabilityWindow).day >= 0 &&
          (window as AvailabilityWindow).day <= 6 &&
          is_minute((window as AvailabilityWindow).start_minute) &&
          is_minute((window as AvailabilityWindow).end_minute) &&
          (window as AvailabilityWindow).start_minute <
            (window as AvailabilityWindow).end_minute,
      )
      .slice(0, MAX_PUBLIC_WINDOWS)
      .map(({ day, start_minute, end_minute }) => ({
        day,
        start_minute,
        end_minute,
      })),
    booked_starts: booked
      .filter(
        (start): start is string =>
          typeof start === "string" && !Number.isNaN(Date.parse(start)),
      )
      .slice(0, MAX_PUBLIC_BOOKED),
    show_branding: value.show_branding !== false,
  };
}

export async function fetch_public_schedule(
  slug: string,
): Promise<PublicScheduleResult> {
  try {
    const response = await fetch(
      `/api/calendar/v1/public/booking/${encodeURIComponent(slug)}`,
    );

    if (response.status === 404) {
      return { status: "not_found" };
    }

    if (!response.ok) {
      return { status: "error" };
    }

    const schedule = sanitize_public_schedule(await response.json());

    return schedule ? { schedule, status: "ok" } : { status: "error" };
  } catch {
    return { status: "error" };
  }
}

export async function book_public_slot(
  slug: string,
  request: {
    starts_at: string;
    guest_name: string;
    guest_email: string;
    note: string;
    turnstile_token?: string;
  },
): Promise<PublicBookingResult> {
  let response: Response;

  try {
    response = await fetch(
      `/api/calendar/v1/public/booking/${encodeURIComponent(slug)}`,
      {
        body: JSON.stringify(request),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
  } catch {
    return "failed";
  }

  if (response.ok) {
    return "booked";
  }

  if (response.status === 429) {
    return "rate_limited";
  }

  if (response.status === 403) {
    return "verification_failed";
  }

  if (response.status === 409) {
    const body = (await response.json().catch(() => null)) as {
      code?: string;
    } | null;

    return body?.code === "BOOKING_LIMIT_REACHED"
      ? "limit_reached"
      : "slot_taken";
  }

  return "failed";
}

function zone_offset_minutes(time_zone: string | null, at: Date): number {
  if (!time_zone) {
    return at.getTimezoneOffset();
  }

  const offset = zone_offset_ms(time_zone, at.getTime());

  return offset === null ? at.getTimezoneOffset() : -offset / 60_000;
}

export function booking_slot_start(
  time_zone: string,
  windows_set_at: string | undefined,
  window_instant_ms: number,
): Date | null {
  const reference_ms = windows_set_at ? Date.parse(windows_set_at) : NaN;

  if (Number.isNaN(reference_ms)) {
    return new Date(window_instant_ms);
  }

  const offset_at = (instant_ms: number) =>
    zone_offset_ms(time_zone, instant_ms);
  const reference_offset = offset_at(reference_ms);

  if (reference_offset === null) {
    return new Date(window_instant_ms);
  }

  let starts_ms = window_instant_ms;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const offset = offset_at(starts_ms) ?? reference_offset;

    starts_ms = window_instant_ms - (offset - reference_offset);
  }

  const settled = offset_at(starts_ms) ?? reference_offset;

  return starts_ms + settled - reference_offset === window_instant_ms
    ? new Date(starts_ms)
    : null;
}

export function local_windows_to_utc(
  days: number[],
  from_hour: number,
  to_hour: number,
  time_zone: string | null = null,
  at: Date = new Date(),
): AvailabilityWindow[] {
  const offset = zone_offset_minutes(time_zone, at);
  const result: AvailabilityWindow[] = [];

  for (const day of days) {
    let start = from_hour * 60 + offset;
    let end = to_hour * 60 + offset;
    let shifted_day = day;

    if (start < 0) {
      start += 1440;
      end += 1440;
      shifted_day = (day + 6) % 7;
    }

    if (end <= 1440) {
      result.push({ day: shifted_day, end_minute: end, start_minute: start });

      continue;
    }

    if (start < 1440) {
      result.push({ day: shifted_day, end_minute: 1440, start_minute: start });
    }

    result.push({
      day: (shifted_day + 1) % 7,
      end_minute: end - 1440,
      start_minute: Math.max(0, start - 1440),
    });
  }

  return result;
}
