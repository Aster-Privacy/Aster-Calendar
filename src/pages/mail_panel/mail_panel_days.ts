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

import {
  compare_events_for_day,
  end_of_day,
  start_of_day,
} from "@/components/calendar/calendar_utils";

export type DayBuckets = ReadonlyMap<string, DecryptedCalendarEvent[]>;

interface DaySlot {
  key: string;
  start_ms: number;
  end_ms: number;
  events: DecryptedCalendarEvent[];
}

export function day_key(day: Date): string {
  return `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
}

function first_slot_ending_at_or_after(slots: DaySlot[], ms: number): number {
  let low = 0;
  let high = slots.length;

  while (low < high) {
    const middle = (low + high) >> 1;

    if (slots[middle].end_ms < ms) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

export function bucket_events_by_day(
  events: DecryptedCalendarEvent[],
  days: Date[],
): DayBuckets {
  const by_key = new Map<string, DaySlot>();

  for (const day of days) {
    const key = day_key(day);

    if (by_key.has(key)) continue;

    by_key.set(key, {
      key,
      start_ms: start_of_day(day).getTime(),
      end_ms: end_of_day(day).getTime(),
      events: [],
    });
  }

  const slots = Array.from(by_key.values()).sort(
    (left, right) => left.start_ms - right.start_ms,
  );

  if (slots.length > 0) {
    for (const event of events) {
      const event_start = new Date(event.starts_at).getTime();
      const event_end = new Date(event.ends_at).getTime();

      if (Number.isNaN(event_start) || Number.isNaN(event_end)) continue;

      let index = first_slot_ending_at_or_after(slots, event_start);

      if (event_end <= event_start) {
        const slot = slots[index];

        if (slot && slot.start_ms <= event_start) slot.events.push(event);

        continue;
      }

      for (; index < slots.length; index += 1) {
        const slot = slots[index];

        if (slot.start_ms >= event_end) break;
        if (event_start <= slot.end_ms) slot.events.push(event);
      }
    }
  }

  const buckets = new Map<string, DecryptedCalendarEvent[]>();

  for (const slot of slots) {
    slot.events.sort(compare_events_for_day);
    buckets.set(slot.key, slot.events);
  }

  return buckets;
}

export function events_on(
  buckets: DayBuckets,
  day: Date,
): DecryptedCalendarEvent[] {
  return buckets.get(day_key(day)) ?? [];
}
