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
import { safe_local_set, safe_local_remove } from "@/lib/safe_storage";

export const FIRST_RUN_TOUR_KEY = "aster_first_run_tour";
export const FIRST_RUN_PLAN_KEY = "aster_first_run_plan";
export const FIRST_RUN_AT_KEY = "aster_first_run_at";
export const FIRST_RUN_PLAN_DUE_KEY = "aster_first_run_plan_due";

export const FIRST_RUN_TOUR_DONE_EVENT = "aster:first-run-tour-done";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function mark_first_run(): void {
  safe_local_set(FIRST_RUN_TOUR_KEY, "pending");
  safe_local_set(FIRST_RUN_PLAN_KEY, "pending");
  safe_local_set(FIRST_RUN_AT_KEY, String(Date.now()));
}

export function first_run_age_ms(): number | null {
  const raw = read(FIRST_RUN_AT_KEY);

  if (!raw) return null;

  const started = Number(raw);

  if (!Number.isFinite(started)) return null;

  return Date.now() - started;
}

export function is_first_run_tour_pending(): boolean {
  return read(FIRST_RUN_TOUR_KEY) === "pending";
}

export function clear_first_run_tour(): void {
  safe_local_remove(FIRST_RUN_TOUR_KEY);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FIRST_RUN_TOUR_DONE_EVENT));
  }
}

export function clear_first_run_plan(): void {
  safe_local_remove(FIRST_RUN_PLAN_KEY);
  safe_local_remove(FIRST_RUN_PLAN_DUE_KEY);
}

export function restore_first_run_plan(): void {
  safe_local_set(FIRST_RUN_PLAN_KEY, "pending");
  safe_local_remove(FIRST_RUN_PLAN_DUE_KEY);
}
