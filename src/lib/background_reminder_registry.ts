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
import type { BackgroundReminder } from "@/lib/calendar_reminder_messages";

import { is_background_reminder } from "@/lib/calendar_reminder_messages";

const MAX_REMINDER_DELAY_MS = 2147483647;

interface ScheduledReminder {
  timer: ReturnType<typeof setTimeout>;
  owners: Set<string>;
  fire_at: number;
}

export interface BackgroundReminderRegistry {
  set(client_id: string, reminders: unknown): void;
  clear(client_id: string): void;
  drop(key: unknown): void;
  clear_all(): void;
  size(): number;
}

export function create_background_reminder_registry(
  show: (reminder: BackgroundReminder) => void,
  now: () => number = Date.now,
): BackgroundReminderRegistry {
  const scheduled = new Map<string, ScheduledReminder>();

  const remove = (key: string): void => {
    const entry = scheduled.get(key);

    if (!entry) return;
    clearTimeout(entry.timer);
    scheduled.delete(key);
  };

  const release_owner = (client_id: string, keep: Set<string>): void => {
    for (const [key, entry] of Array.from(scheduled)) {
      if (keep.has(key) || !entry.owners.delete(client_id)) continue;
      if (entry.owners.size === 0) remove(key);
    }
  };

  return {
    set(client_id, reminders) {
      const valid = Array.isArray(reminders)
        ? reminders.filter(is_background_reminder)
        : [];
      const keep = new Set<string>();

      for (const reminder of valid) {
        const delay = reminder.fire_at - now();

        if (delay < 0 || delay > MAX_REMINDER_DELAY_MS) continue;
        keep.add(reminder.key);

        const existing = scheduled.get(reminder.key);

        if (existing && existing.fire_at === reminder.fire_at) {
          existing.owners.add(client_id);
          continue;
        }
        if (existing) clearTimeout(existing.timer);

        scheduled.set(reminder.key, {
          owners: new Set([...(existing?.owners ?? []), client_id]),
          fire_at: reminder.fire_at,
          timer: setTimeout(() => {
            scheduled.delete(reminder.key);
            show(reminder);
          }, delay),
        });
      }

      release_owner(client_id, keep);
    },
    clear(client_id) {
      release_owner(client_id, new Set());
    },
    drop(key) {
      if (typeof key === "string") remove(key);
    },
    clear_all() {
      for (const key of Array.from(scheduled.keys())) remove(key);
    },
    size() {
      return scheduled.size;
    },
  };
}
