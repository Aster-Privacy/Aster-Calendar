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
import type { DecryptedCalendar } from "@/types/calendar";
import type { IcsSubscription } from "@/services/calendar/subscriptions";

import { get_derived_encryption_key } from "@/services/crypto/memory_key_store";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  CALENDAR_VISIBILITY_PREFIX,
  scoped_get,
  scoped_set,
} from "@/services/crypto/storage_key_names";

export interface LocalVisibility {
  hidden_calendar_ids: string[];
  hidden_subscription_ids: string[];
  birthdays_hidden: boolean;
  holidays_hidden: boolean;
}

export interface SyncedVisibility {
  calendars: Pick<DecryptedCalendar, "id" | "is_visible">[];
  subscriptions: Pick<IcsSubscription, "id" | "hidden">[];
  birthdays_hidden: boolean;
}

export type ShowOnlyTarget =
  | { kind: "calendar"; id: string }
  | { kind: "subscription"; id: string }
  | { kind: "birthdays" }
  | { kind: "holidays" };

const STORAGE_PREFIX = CALENDAR_VISIBILITY_PREFIX;
const LEGACY_PLAIN_PREFIX = "aster_calendar_visibility:";
const STORAGE_NAME = "sidebar";

const memory = new Map<string, LocalVisibility>();
const loaded = new Set<string>();
const loading = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let cache_generation = 0;

function string_list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(
      value.filter((entry): entry is string => typeof entry === "string"),
    ),
  ];
}

export function parse_local_visibility(
  raw: string | null,
): LocalVisibility | null {
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const record = parsed as Record<string, unknown>;

    return {
      hidden_calendar_ids: string_list(record.hidden_calendar_ids),
      hidden_subscription_ids: string_list(record.hidden_subscription_ids),
      birthdays_hidden: record.birthdays_hidden === true,
      holidays_hidden: record.holidays_hidden === true,
    };
  } catch {
    return null;
  }
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

async function visibility_storage_key(): Promise<CryptoKey | null> {
  const key_bytes = get_derived_encryption_key();

  if (!key_bytes) return null;

  try {
    return await crypto.subtle.importKey(
      "raw",
      key_bytes,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    zero_uint8_array(key_bytes);
  }
}

async function persist_visibility(
  account_id: string,
  visibility: LocalVisibility,
): Promise<void> {
  try {
    const storage_key = await visibility_storage_key();

    if (!storage_key) return;

    await scoped_set(
      STORAGE_PREFIX,
      account_id,
      STORAGE_NAME,
      JSON.stringify(visibility),
      storage_key,
    );
  } catch {
    void 0;
  }
}

function take_legacy_plain(account_id: string): LocalVisibility | null {
  try {
    const name = `${LEGACY_PLAIN_PREFIX}${account_id}`;
    const parsed = parse_local_visibility(window.localStorage.getItem(name));

    window.localStorage.removeItem(name);

    return parsed;
  } catch {
    return null;
  }
}

export function remove_legacy_plain_visibility(): void {
  try {
    const names: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const name = window.localStorage.key(index);

      if (name?.startsWith(LEGACY_PLAIN_PREFIX)) names.push(name);
    }

    for (const name of names) window.localStorage.removeItem(name);
  } catch {
    void 0;
  }
}

async function fetch_visibility(account_id: string): Promise<void> {
  const generation = cache_generation;
  let stored: LocalVisibility | null = null;

  try {
    const storage_key = await visibility_storage_key();

    if (storage_key) {
      const raw = await scoped_get<string>(
        STORAGE_PREFIX,
        account_id,
        STORAGE_NAME,
        storage_key,
      );

      stored = parse_local_visibility(typeof raw === "string" ? raw : null);
    }
  } catch {
    stored = null;
  }

  const legacy = take_legacy_plain(account_id);

  if (generation !== cache_generation || loaded.has(account_id)) return;

  if (!stored && legacy) {
    stored = legacy;
    void persist_visibility(account_id, legacy);
  }

  if (stored) memory.set(account_id, stored);
  loaded.add(account_id);
  notify();
}

export function load_local_visibility(
  account_id: string | null,
): Promise<void> {
  if (!account_id || loaded.has(account_id)) return Promise.resolve();

  const pending = loading.get(account_id);

  if (pending) return pending;

  const started = fetch_visibility(account_id).finally(() => {
    if (loading.get(account_id) === started) loading.delete(account_id);
  });

  loading.set(account_id, started);

  return started;
}

export function is_local_visibility_loaded(account_id: string | null): boolean {
  return Boolean(account_id) && loaded.has(account_id as string);
}

export function read_local_visibility(
  account_id: string | null,
): LocalVisibility | null {
  if (!account_id) return null;

  return memory.get(account_id) ?? null;
}

export function write_local_visibility(
  account_id: string | null,
  visibility: LocalVisibility,
): void {
  if (!account_id) return;

  memory.set(account_id, visibility);
  loaded.add(account_id);
  void persist_visibility(account_id, visibility);
  notify();
}

export function visibility_from_synced(
  synced: SyncedVisibility,
): LocalVisibility {
  return {
    hidden_calendar_ids: synced.calendars
      .filter((calendar) => !calendar.is_visible)
      .map((calendar) => calendar.id),
    hidden_subscription_ids: synced.subscriptions
      .filter((subscription) => subscription.hidden === true)
      .map((subscription) => subscription.id),
    birthdays_hidden: synced.birthdays_hidden,
    holidays_hidden: false,
  };
}

export async function seed_local_visibility(
  account_id: string | null,
  synced: SyncedVisibility,
): Promise<LocalVisibility | null> {
  if (!account_id) return null;

  await load_local_visibility(account_id);

  const existing = read_local_visibility(account_id);

  if (existing) return existing;

  const seeded = visibility_from_synced(synced);

  write_local_visibility(account_id, seeded);

  return seeded;
}

export function update_local_visibility(
  account_id: string | null,
  fallback: LocalVisibility,
  update: (current: LocalVisibility) => LocalVisibility,
): void {
  if (!account_id) return;

  write_local_visibility(
    account_id,
    update(read_local_visibility(account_id) ?? fallback),
  );
}

export function subscribe_local_visibility(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function forget_local_visibility_cache(): void {
  cache_generation += 1;
  memory.clear();
  loaded.clear();
  loading.clear();
  notify();
}

function with_id(ids: string[], id: string, present: boolean): string[] {
  const without = ids.filter((entry) => entry !== id);

  return present ? [...without, id] : without;
}

export function set_calendar_hidden(
  visibility: LocalVisibility,
  calendar_id: string,
  hidden: boolean,
): LocalVisibility {
  return {
    ...visibility,
    hidden_calendar_ids: with_id(
      visibility.hidden_calendar_ids,
      calendar_id,
      hidden,
    ),
  };
}

export function set_subscription_hidden(
  visibility: LocalVisibility,
  subscription_id: string,
  hidden: boolean,
): LocalVisibility {
  return {
    ...visibility,
    hidden_subscription_ids: with_id(
      visibility.hidden_subscription_ids,
      subscription_id,
      hidden,
    ),
  };
}

export function show_only_visibility(
  target: ShowOnlyTarget,
  calendar_ids: string[],
  subscription_ids: string[],
): LocalVisibility {
  return {
    hidden_calendar_ids: calendar_ids.filter(
      (id) => !(target.kind === "calendar" && target.id === id),
    ),
    hidden_subscription_ids: subscription_ids.filter(
      (id) => !(target.kind === "subscription" && target.id === id),
    ),
    birthdays_hidden: target.kind !== "birthdays",
    holidays_hidden: target.kind !== "holidays",
  };
}

export function all_visibility(
  hidden: boolean,
  calendar_ids: string[],
  subscription_ids: string[],
): LocalVisibility {
  return {
    hidden_calendar_ids: hidden ? [...calendar_ids] : [],
    hidden_subscription_ids: hidden ? [...subscription_ids] : [],
    birthdays_hidden: hidden,
    holidays_hidden: hidden,
  };
}

export function apply_calendar_visibility<
  T extends Pick<DecryptedCalendar, "id" | "is_visible">,
>(calendars: T[], visibility: LocalVisibility): T[] {
  const hidden = new Set(visibility.hidden_calendar_ids);
  let changed = false;
  const next = calendars.map((calendar) => {
    const is_visible = !hidden.has(calendar.id);

    if (calendar.is_visible === is_visible) return calendar;
    changed = true;

    return { ...calendar, is_visible };
  });

  return changed ? next : calendars;
}

export function apply_subscription_visibility<
  T extends Pick<IcsSubscription, "id" | "hidden">,
>(subscriptions: T[], visibility: LocalVisibility): T[] {
  const hidden = new Set(visibility.hidden_subscription_ids);
  let changed = false;
  const next = subscriptions.map((subscription) => {
    const is_hidden = hidden.has(subscription.id);

    if ((subscription.hidden === true) === is_hidden) return subscription;
    changed = true;

    return { ...subscription, hidden: is_hidden };
  });

  return changed ? next : subscriptions;
}
