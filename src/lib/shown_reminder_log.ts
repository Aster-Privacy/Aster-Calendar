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
const DB_NAME = "aster_calendar_reminder_log";
const STORE_NAME = "shown";
const RECORD_KEY = "entries";
const OPEN_TIMEOUT_MS = 5000;

export const SHOWN_REMINDER_RETENTION_MS = 25 * 60 * 60 * 1000;
export const MAX_SHOWN_REMINDERS = 400;

export interface ShownReminderEntry {
  digest: string;
  at: number;
}

export type ShownReminderChange<T> = (entries: ShownReminderEntry[]) => {
  entries: ShownReminderEntry[];
  result: T;
};

export interface ShownReminderStore {
  update<T>(change: ShownReminderChange<T>): Promise<T>;
  destroy(): Promise<void>;
}

export function reminder_digest(key: string): string {
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

function is_entry(value: unknown): value is ShownReminderEntry {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as ShownReminderEntry).digest === "string" &&
    typeof (value as ShownReminderEntry).at === "number" &&
    Number.isFinite((value as ShownReminderEntry).at)
  );
}

function fresh_entries(value: unknown, now: number): ShownReminderEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const cutoff = now - SHOWN_REMINDER_RETENTION_MS;

  return value.filter(is_entry).filter((entry) => entry.at > cutoff);
}

export function record_shown_reminder(
  store: ShownReminderStore,
  key: string,
  now: number = Date.now(),
): Promise<void> {
  const digest = reminder_digest(key);

  return store.update((stored) => {
    const entries = fresh_entries(stored, now).filter(
      (entry) => entry.digest !== digest,
    );

    entries.push({ digest, at: now });

    return { entries: entries.slice(-MAX_SHOWN_REMINDERS), result: undefined };
  });
}

export function take_shown_reminders(
  store: ShownReminderStore,
  now: number = Date.now(),
): Promise<ShownReminderEntry[]> {
  return store.update((stored) => ({
    entries: [],
    result: fresh_entries(stored, now),
  }));
}

export function create_memory_shown_store(): ShownReminderStore & {
  peek(): ShownReminderEntry[];
} {
  let entries: ShownReminderEntry[] = [];

  return {
    async update<T>(change: ShownReminderChange<T>): Promise<T> {
      const next = change(entries.slice());

      entries = next.entries;

      return next.result;
    },
    async destroy() {
      entries = [];
    },
    peek() {
      return entries.slice();
    },
  };
}

function open_database(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("reminder log open timed out")),
      OPEN_TIMEOUT_MS,
    );
    const request = factory.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error);
    };
  });
}

export function create_indexed_db_shown_store(
  factory: IDBFactory | null = typeof indexedDB === "undefined"
    ? null
    : indexedDB,
): ShownReminderStore {
  return {
    async update<T>(change: ShownReminderChange<T>): Promise<T> {
      if (!factory) {
        return change([]).result;
      }

      const db = await open_database(factory);

      try {
        return await new Promise<T>((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, "readwrite");
          const store = transaction.objectStore(STORE_NAME);
          const read = store.get(RECORD_KEY);
          let result: T;

          read.onsuccess = () => {
            const next = change(
              Array.isArray(read.result) ? read.result : [],
            );

            result = next.result;
            store.put(next.entries, RECORD_KEY);
          };
          transaction.oncomplete = () => resolve(result as T);
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } finally {
        db.close();
      }
    },
    async destroy() {
      if (!factory) {
        return;
      }

      await new Promise<void>((resolve) => {
        const request = factory.deleteDatabase(DB_NAME);

        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    },
  };
}
