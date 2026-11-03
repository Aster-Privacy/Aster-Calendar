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
import type { DecryptedCalendarEvent } from "@/types/calendar";

import type { BackgroundReminder } from "@/lib/calendar_reminder_messages";

import {
  BACKGROUND_REMINDERS_CLEAR,
  BACKGROUND_REMINDERS_SET,
  BACKGROUND_REMINDER_FIRED,
  CALENDAR_NOTIFICATION_TAG_PREFIX,
} from "@/lib/calendar_reminder_messages";

const FIRED_STORAGE_KEY = "aster_calendar_fired_reminders";
const MAX_SCHEDULED = 60;
const MAX_LEAD_MS = 12 * 60 * 60 * 1000;
const MAX_TIMEOUT_MS = 2147483647;
const FIRED_RETENTION_MS = 24 * 60 * 60 * 1000;
const CLAIM_STORAGE_PREFIX = "aster_calendar_reminder_claim:";
const CLAIM_LOCK_PREFIX = "aster_calendar_reminder:";
const CLAIM_TTL_MS = 30 * 1000;
const CLAIM_SETTLE_MS = 60;
const TAB_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export const REMINDER_GRACE_MS = 5 * 60 * 1000;

export interface ReminderTarget {
  event_id: string;
  title: string;
  starts_at: string;
  is_all_day: boolean;
  fire_at: number;
  key: string;
}

interface FiredEntry {
  key: string;
  at: number;
}

function fired_digest(key: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let i = 0; i < key.length; i++) {
    const code = key.charCodeAt(i);

    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return (
    (h2 >>> 0).toString(36).padStart(7, "0") +
    (h1 >>> 0).toString(36).padStart(7, "0")
  );
}

function read_fired(): FiredEntry[] {
  try {
    const raw = window.localStorage.getItem(FIRED_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const cutoff = Date.now() - FIRED_RETENTION_MS;

    return parsed.filter(
      (entry): entry is FiredEntry =>
        !!entry &&
        typeof (entry as FiredEntry).key === "string" &&
        typeof (entry as FiredEntry).at === "number" &&
        (entry as FiredEntry).at > cutoff,
    );
  } catch {
    return [];
  }
}

function write_fired(entries: FiredEntry[]): void {
  try {
    window.localStorage.setItem(
      FIRED_STORAGE_KEY,
      JSON.stringify(entries.slice(-400)),
    );
  } catch {
    return;
  }
}

export function has_fired(key: string): boolean {
  const digest = fired_digest(key);

  return read_fired().some((entry) => entry.key === digest);
}

export function mark_fired(key: string): void {
  const digest = fired_digest(key);
  const entries = read_fired();

  if (entries.some((entry) => entry.key === digest)) {
    return;
  }

  entries.push({ key: digest, at: Date.now() });
  write_fired(entries);
}

function take_claim(key: string): boolean {
  if (has_fired(key)) return false;
  mark_fired(key);

  return true;
}

function read_claim(name: string): { owner: string; at: number } | null {
  const raw = window.localStorage.getItem(name);

  if (!raw) return null;

  const split = raw.lastIndexOf(":");
  const at = Number(raw.slice(split + 1));

  return { owner: raw.slice(0, split), at: Number.isFinite(at) ? at : 0 };
}

async function claim_with_storage(key: string): Promise<boolean> {
  if (has_fired(key)) return false;

  const name = `${CLAIM_STORAGE_PREFIX}${fired_digest(key)}`;

  try {
    const current = read_claim(name);

    if (
      current &&
      current.owner !== TAB_ID &&
      Date.now() - current.at < CLAIM_TTL_MS
    ) {
      return false;
    }
    window.localStorage.setItem(name, `${TAB_ID}:${Date.now()}`);
  } catch {
    return take_claim(key);
  }

  await new Promise((resolve) => setTimeout(resolve, CLAIM_SETTLE_MS));

  try {
    if (read_claim(name)?.owner !== TAB_ID) return false;
  } catch {
    return take_claim(key);
  }

  const claimed = take_claim(key);

  try {
    window.localStorage.removeItem(name);
  } catch {
    return claimed;
  }

  return claimed;
}

export async function claim_reminder(key: string): Promise<boolean> {
  const locks =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { locks?: LockManager }).locks
      : undefined;

  if (locks && typeof locks.request === "function") {
    try {
      return await locks.request(
        `${CLAIM_LOCK_PREFIX}${fired_digest(key)}`,
        { ifAvailable: true },
        async (lock) => (lock ? take_claim(key) : false),
      );
    } catch {
      return claim_with_storage(key);
    }
  }

  return claim_with_storage(key);
}

export function clear_fired_reminders(): void {
  try {
    window.localStorage.removeItem(FIRED_STORAGE_KEY);
  } catch {
    return;
  }
}

function service_worker_controller(): ServiceWorker | null {
  try {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) {
      return null;
    }

    return navigator.serviceWorker.controller;
  } catch {
    return null;
  }
}

export function sync_background_reminders(
  reminders: BackgroundReminder[],
): boolean {
  const controller = service_worker_controller();

  if (!controller) {
    return false;
  }

  controller.postMessage({ type: BACKGROUND_REMINDERS_SET, reminders });

  return true;
}

export function clear_background_reminders(): void {
  service_worker_controller()?.postMessage({
    type: BACKGROUND_REMINDERS_CLEAR,
  });
}

export function report_background_reminder_fired(key: string): void {
  service_worker_controller()?.postMessage({
    key,
    type: BACKGROUND_REMINDER_FIRED,
  });
}

function self_response(
  event: DecryptedCalendarEvent,
  self_email: string | undefined,
): string | null {
  if (!self_email) {
    return null;
  }

  const key = self_email.trim().toLowerCase();
  const match = event.attendees.find(
    (attendee) => attendee.email.trim().toLowerCase() === key,
  );

  return match ? match.response : null;
}

export function build_reminder_targets(
  events: DecryptedCalendarEvent[],
  options: {
    default_reminder_minutes: number;
    default_all_day_reminder_minutes?: number;
    now: number;
    only_accepted: boolean;
    self_email?: string;
  },
): ReminderTarget[] {
  const targets: ReminderTarget[] = [];

  for (const event of events) {
    if (event.status === "cancelled") {
      continue;
    }

    const fallback_minutes =
      event.is_all_day && options.default_all_day_reminder_minutes !== undefined
        ? options.default_all_day_reminder_minutes
        : options.default_reminder_minutes;
    const minutes = event.reminder_minutes ?? fallback_minutes;

    if (minutes < 0) {
      continue;
    }

    if (options.only_accepted) {
      const response = self_response(event, options.self_email);

      if (response === "declined" || response === "needs_action") {
        continue;
      }
    }

    const starts_ms = new Date(event.starts_at).getTime();

    if (!Number.isFinite(starts_ms)) {
      continue;
    }

    const fire_at = starts_ms - minutes * 60 * 1000;

    if (
      fire_at <= options.now - REMINDER_GRACE_MS ||
      fire_at - options.now > MAX_LEAD_MS
    ) {
      continue;
    }

    targets.push({
      event_id: event.id,
      title: event.title,
      starts_at: event.starts_at,
      is_all_day: event.is_all_day,
      fire_at,
      key: `${event.id}:${event.starts_at}:${minutes}`,
    });
  }

  return targets
    .sort((left, right) => left.fire_at - right.fire_at)
    .slice(0, MAX_SCHEDULED);
}

export function play_reminder_sound(): void {
  try {
    const audio_context_ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!audio_context_ctor) {
      return;
    }

    const context = new audio_context_ctor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.4);
    oscillator.onended = () => {
      void context.close();
    };
  } catch {
    return;
  }
}

export function desktop_reminders_allowed(): boolean {
  try {
    return (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    );
  } catch {
    return false;
  }
}

export function show_desktop_reminder(
  title: string,
  body: string,
  key: string = title,
): boolean {
  try {
    if (!desktop_reminders_allowed()) {
      return false;
    }

    new Notification(title, {
      body,
      tag: `${CALENDAR_NOTIFICATION_TAG_PREFIX}${key}`,
    });

    return true;
  } catch {
    return false;
  }
}

export function schedule_reminder(
  target: ReminderTarget,
  on_fire: (target: ReminderTarget) => void,
): number {
  const delay = Math.max(
    0,
    Math.min(target.fire_at - Date.now(), MAX_TIMEOUT_MS),
  );

  return window.setTimeout(() => on_fire(target), delay);
}
