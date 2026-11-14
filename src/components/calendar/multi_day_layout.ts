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
export interface LaneEvent {
  id: string;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
}

export interface LaneSegment<T extends LaneEvent> {
  event: T;
  is_start: boolean;
  is_end: boolean;
  span_days: number;
}

export type LaneSlot<T extends LaneEvent> = LaneSegment<T> | null;

export interface DayLanes<T extends LaneEvent> {
  slots: LaneSlot<T>[];
  hidden_count: number;
}

export interface DayLaneOptions<T extends LaneEvent> {
  is_joinable: (event: T) => boolean;
  max_lanes?: number;
}

interface LaneRun<T extends LaneEvent> {
  event: T;
  key: string;
  first: number;
  last: number;
  order: number;
  lane: number;
}

function local_day_start(date: Date): Date {
  const next = new Date(date);

  next.setHours(0, 0, 0, 0);

  return next;
}

function local_next_day_start(date: Date): Date {
  const next = local_day_start(date);

  next.setDate(next.getDate() + 1);

  return next;
}

export function event_first_day(event: LaneEvent): Date {
  return local_day_start(new Date(event.starts_at));
}

export function event_last_day(event: LaneEvent): Date {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);

  if (end.getTime() <= start.getTime()) {
    return local_day_start(start);
  }

  const last = local_day_start(end);

  if (last.getTime() === end.getTime()) {
    last.setDate(last.getDate() - 1);
  }

  return last;
}

export function spans_multiple_days(event: LaneEvent): boolean {
  return event_first_day(event).getTime() !== event_last_day(event).getTime();
}

export function is_joinable_event(event: LaneEvent): boolean {
  return event.is_all_day || spans_multiple_days(event);
}

export function shows_as_all_day_on(event: LaneEvent, day: Date): boolean {
  if (event.is_all_day) {
    return true;
  }

  const start = new Date(event.starts_at).getTime();
  const end = new Date(event.ends_at).getTime();

  return (
    start <= local_day_start(day).getTime() &&
    end >= local_next_day_start(day).getTime()
  );
}

function run_key(event: LaneEvent): string {
  return `${event.id}|${event.starts_at}`;
}

function build_runs<T extends LaneEvent>(
  lists: T[][],
  is_joinable: (event: T) => boolean,
): LaneRun<T>[] {
  const runs: LaneRun<T>[] = [];
  const open_runs = new Map<string, LaneRun<T>>();

  lists.forEach((list, day_index) => {
    list.forEach((event, order) => {
      const key = run_key(event);
      const open_run = open_runs.get(key);

      if (open_run && open_run.last === day_index - 1 && is_joinable(event)) {
        open_run.last = day_index;

        return;
      }

      const run: LaneRun<T> = {
        event,
        key,
        first: day_index,
        last: day_index,
        order,
        lane: -1,
      };

      open_runs.set(key, run);
      runs.push(run);
    });
  });

  return runs;
}

function assign_lanes<T extends LaneEvent>(
  runs: LaneRun<T>[],
  day_count: number,
): LaneRun<T>[][] {
  const ordered = [...runs].sort(
    (left, right) =>
      left.first - right.first ||
      right.last - right.first - (left.last - left.first) ||
      left.order - right.order,
  );
  const lanes: LaneRun<T>[][] = Array.from({ length: day_count }, () => []);

  for (const run of ordered) {
    let lane = 0;

    while (
      lanes
        .slice(run.first, run.last + 1)
        .some((day_lanes) => day_lanes[lane] !== undefined)
    ) {
      lane += 1;
    }

    run.lane = lane;

    for (let day_index = run.first; day_index <= run.last; day_index += 1) {
      lanes[day_index][lane] = run;
    }
  }

  return lanes;
}

function visible_lane_count(lane_total: number, max_lanes?: number): number {
  if (max_lanes === undefined || lane_total <= max_lanes + 1) {
    return lane_total;
  }

  return Math.max(0, max_lanes);
}

export function layout_day_lanes<T extends LaneEvent>(
  lists: T[][],
  { is_joinable, max_lanes }: DayLaneOptions<T>,
): DayLanes<T>[] {
  const lanes = assign_lanes(build_runs(lists, is_joinable), lists.length);
  const visible = lanes.map((day_lanes) => {
    const shown = visible_lane_count(day_lanes.length, max_lanes);

    return Array.from({ length: shown }, (_, lane) => day_lanes[lane] ?? null);
  });
  const shown_at = (day_index: number, lane: number) =>
    day_index >= 0 && day_index < visible.length
      ? (visible[day_index][lane] ?? null)
      : null;

  return visible.map((day_runs, day_index) => {
    const slots = day_runs.map((run, lane): LaneSlot<T> => {
      if (!run) {
        return null;
      }

      let span_days = 1;

      while (shown_at(day_index + span_days, lane) === run) {
        span_days += 1;
      }

      return {
        event: run.event,
        is_start: shown_at(day_index - 1, lane) !== run,
        is_end: span_days === 1,
        span_days,
      };
    });
    const hidden_count = lanes[day_index]
      .slice(day_runs.length)
      .filter((run) => run !== undefined).length;

    return { slots, hidden_count };
  });
}
