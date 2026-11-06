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
import { describe, expect, it } from "vitest";

import {
  MAX_SHOWN_REMINDERS,
  SHOWN_REMINDER_RETENTION_MS,
  create_indexed_db_shown_store,
  create_memory_shown_store,
  record_shown_reminder,
  reminder_digest,
  take_shown_reminders,
} from "@/lib/shown_reminder_log";

const NOW = Date.parse("2026-03-04T09:00:00.000Z");
const KEY = "evt-1:2026-03-04T08:00:00.000Z:30";

describe("shown reminder log", () => {
  it("stores a digest instead of the reminder key", async () => {
    const store = create_memory_shown_store();

    await record_shown_reminder(store, KEY, NOW);

    expect(store.peek()).toEqual([{ digest: reminder_digest(KEY), at: NOW }]);
    expect(JSON.stringify(store.peek())).not.toContain("evt-1");
  });

  it("hands every shown reminder to the page once", async () => {
    const store = create_memory_shown_store();

    await record_shown_reminder(store, KEY, NOW);
    await record_shown_reminder(store, "evt-2:x:0", NOW + 1);

    const taken = await take_shown_reminders(store, NOW + 2);

    expect(taken.map((entry) => entry.digest)).toEqual([
      reminder_digest(KEY),
      reminder_digest("evt-2:x:0"),
    ]);
    expect(await take_shown_reminders(store, NOW + 3)).toEqual([]);
  });

  it("keeps one entry per reminder", async () => {
    const store = create_memory_shown_store();

    await record_shown_reminder(store, KEY, NOW);
    await record_shown_reminder(store, KEY, NOW + 10);

    expect(store.peek()).toEqual([{ digest: reminder_digest(KEY), at: NOW + 10 }]);
  });

  it("drops entries past the retention window", async () => {
    const store = create_memory_shown_store();

    await record_shown_reminder(store, KEY, NOW);

    expect(
      await take_shown_reminders(store, NOW + SHOWN_REMINDER_RETENTION_MS + 1),
    ).toEqual([]);
  });

  it("caps the number of stored entries", async () => {
    const store = create_memory_shown_store();

    for (let index = 0; index < MAX_SHOWN_REMINDERS + 5; index++) {
      await record_shown_reminder(store, `evt-${index}:x:0`, NOW + index);
    }

    const entries = store.peek();

    expect(entries).toHaveLength(MAX_SHOWN_REMINDERS);
    expect(entries[entries.length - 1].digest).toBe(
      reminder_digest(`evt-${MAX_SHOWN_REMINDERS + 4}:x:0`),
    );
  });

  it("ignores malformed stored data", async () => {
    const store = create_memory_shown_store();

    await store.update(() => ({
      entries: [{ digest: 5, at: "x" }] as never,
      result: undefined,
    }));

    expect(await take_shown_reminders(store, NOW)).toEqual([]);
  });

  it("works as a no-op without IndexedDB", async () => {
    const store = create_indexed_db_shown_store(null);

    await record_shown_reminder(store, KEY, NOW);

    expect(await take_shown_reminders(store, NOW)).toEqual([]);
    await expect(store.destroy()).resolves.toBeUndefined();
  });
});
