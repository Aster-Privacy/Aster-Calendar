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

import { clear_account_memory_stores } from "./account_memory_stores";

import { request_cache } from "@/services/api/request_cache";
import { clear_plan_limits_cache } from "@/hooks/use_plan_limits";
import { clear_resubscribe_cache } from "@/hooks/use_resubscribe";
import { clear_attachment_limits_cache } from "@/services/attachment_limits";
import { clear_aliases_cache } from "@/components/settings/hooks/use_aliases";
import { clear_plan_cache } from "@/services/plan_limits";

import {
  clear_attachment_keys,
} from "@/services/crypto/inbound_attachment_keys";
import {
  clear_unreadable_attachment_rows,
} from "@/services/crypto/attachment_crypto";
import {
  clear_all_ratchet_states,
} from "@/services/crypto/ratchet_state_store";
import { clear_preferred_sender_local } from "@/lib/preferred_sender";
import { clear_sender_aliases_cache } from "@/hooks/use_sender_aliases";
import { clear_recovery_email_cache } from "@/services/api/recovery_email";
import { clear_preferences_cache } from "@/services/api/preferences";
import { clear_profiles_cache } from "@/services/api/profiles";
import { clear_contact_photo_cache } from "@/services/contact_photo_cache";
import { clear_ghost_entries } from "@/stores/ghost_alias_store";
import { reset_special_offer_status } from "@/stores/special_offer_status";

export const AUTH_VERIFY_TIMEOUT_MS = 12000;

export type SnapshotClearScope =
  | "current_account"
  | "none"
  | { account_id: string };

export async function clear_account_scoped_caches(
  snapshots: SnapshotClearScope = "none",
): Promise<void> {
  const calendar_cache_cleared = import("@/services/calendar/sync_engine")
    .then((module) => {
      if (snapshots === "none") return module.reset_calendar_session();
      if (typeof snapshots === "object") {
        return module.clear_calendar_sync_state(snapshots.account_id);
      }

      return module.clear_calendar_sync_state();
    })
    .catch(() => undefined)
    .then(() =>
      Promise.all([
        import("@/services/calendar/blob_migration"),
        import("@/services/calendar/event_render_key"),
      ]),
    )
    .then(([migration, render_key]) => {
      migration.reset_blob_migration_state();
      render_key.reset_event_render_aliases();
    })
    .catch(() => undefined);

  clear_plan_limits_cache();
  clear_resubscribe_cache();
  reset_special_offer_status();
  clear_attachment_limits_cache();
  clear_aliases_cache();
  clear_plan_cache();
  clear_recovery_email_cache();
  clear_preferred_sender_local();
  clear_preferences_cache();
  clear_sender_aliases_cache();
  clear_attachment_keys();
  clear_unreadable_attachment_rows();
  clear_profiles_cache();
  clear_contact_photo_cache();
  clear_ghost_entries();
  clear_account_memory_stores();
  request_cache.clear();
  await Promise.all([
    calendar_cache_cleared,
    clear_all_ratchet_states(),
  ]);
}

export function safe_log_error(err: unknown): void {
  if (!import.meta.env.DEV) return;
  const payload =
    err instanceof Error ? { name: err.name } : { kind: typeof err };

  console.error("auth error", JSON.stringify(payload));
}

export const with_timeout = async <T>(
  p: Promise<T>,
  ms: number,
): Promise<T | null> => {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race<T | null>([
      p.catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
};
