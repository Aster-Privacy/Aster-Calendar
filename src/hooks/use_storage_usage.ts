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
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { use_auth } from "@/contexts/auth_context";
import { get_storage_overview } from "@/services/api/storage";
import { ignore_error } from "@/lib/ignore_error";

export interface StorageUsage {
  storage_used_bytes: number;
  storage_total_bytes: number;
}

interface StorageUsageState {
  stats: StorageUsage;
  has_initialized: boolean;
}

const FRESH_MS = 60_000;

const EMPTY_STATE: StorageUsageState = {
  stats: { storage_used_bytes: 0, storage_total_bytes: 0 },
  has_initialized: false,
};

let state: StorageUsageState = EMPTY_STATE;
let owner_id: string | null = null;
let fetched_at = 0;
let generation = 0;
let in_flight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function get_snapshot(): StorageUsageState {
  return state;
}

function set_owner(user_id: string | null): void {
  if (owner_id === user_id) return;
  owner_id = user_id;
  clear_storage_usage();
}

function load(force: boolean): Promise<void> {
  if (!owner_id) return Promise.resolve();
  if (!force && state.has_initialized && Date.now() - fetched_at < FRESH_MS) {
    return Promise.resolve();
  }
  if (in_flight) return in_flight;

  const request_generation = generation;

  in_flight = get_storage_overview()
    .then((response) => {
      if (request_generation !== generation || !response.data) return;
      fetched_at = Date.now();
      state = {
        stats: {
          storage_used_bytes: response.data.total_used_bytes,
          storage_total_bytes: response.data.total_limit_bytes,
        },
        has_initialized: true,
      };
      notify();
    })
    .catch((caught) => ignore_error("hooks/use_storage_usage:load", caught))
    .finally(() => {
      in_flight = null;
    });

  return in_flight;
}

export function invalidate_storage_usage(): void {
  fetched_at = 0;
  if (listeners.size > 0) void load(true);
}

export function prefetch_storage_usage(): void {
  void load(false);
}

export function clear_storage_usage(): void {
  generation += 1;
  fetched_at = 0;
  in_flight = null;
  state = EMPTY_STATE;
  notify();
}

export function use_storage_usage(): StorageUsageState & {
  refresh: () => void;
} {
  const { user } = use_auth();
  const user_id = user?.id ?? null;
  const snapshot = useSyncExternalStore(subscribe, get_snapshot, get_snapshot);

  useEffect(() => {
    set_owner(user_id);
    if (user_id) void load(false);
  }, [user_id]);

  const refresh = useCallback(() => {
    void load(true);
  }, []);

  return { ...snapshot, refresh };
}
