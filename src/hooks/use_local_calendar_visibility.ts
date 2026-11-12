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
import type {
  LocalVisibility,
  SyncedVisibility,
} from "@/services/calendar/local_visibility";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import { use_auth } from "@/contexts/auth/use_auth_hook";
import {
  parse_local_visibility,
  read_local_visibility,
  subscribe_local_visibility,
  update_local_visibility,
  visibility_from_synced,
} from "@/services/calendar/local_visibility";

export interface LocalCalendarVisibility {
  account_id: string | null;
  visibility: LocalVisibility;
  is_stored: boolean;
  update: (change: (current: LocalVisibility) => LocalVisibility) => void;
}

export function use_local_calendar_visibility(
  synced: SyncedVisibility,
): LocalCalendarVisibility {
  const { user } = use_auth();
  const account_id = user?.id ?? null;

  const read = useCallback(
    () => read_local_visibility(account_id),
    [account_id],
  );
  const stored = useSyncExternalStore(subscribe_local_visibility, read, read);

  const synced_key = JSON.stringify(visibility_from_synced(synced));
  const fallback = useMemo(
    () => parse_local_visibility(synced_key) ?? visibility_from_synced(synced),
    [synced_key],
  );

  const update = useCallback(
    (change: (current: LocalVisibility) => LocalVisibility) =>
      update_local_visibility(account_id, fallback, change),
    [account_id, fallback],
  );

  return {
    account_id,
    visibility: stored ?? fallback,
    is_stored: stored !== null,
    update,
  };
}
