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
import type { SyncedRevisionFloors } from "@/services/calendar/revision_floor_sync";

import { useEffect, useRef } from "react";

import {
  floors_to_publish,
  inherit_synced_floors,
} from "@/services/calendar/revision_floor_sync";

export const FLOOR_PUBLISH_DELAY_MS = 10_000;

interface SyncedRevisionFloorsOptions {
  loaded: boolean;
  settled: boolean;
  stored: unknown;
  change_token: unknown;
  publish: (floors: SyncedRevisionFloors) => void;
}

export function use_synced_revision_floors({
  loaded,
  settled,
  stored,
  change_token,
  publish,
}: SyncedRevisionFloorsOptions): void {
  const stored_ref = useRef(stored);
  const publish_ref = useRef(publish);

  stored_ref.current = stored;
  publish_ref.current = publish;

  useEffect(() => {
    if (!loaded) return;
    inherit_synced_floors(stored);
  }, [loaded, stored]);

  useEffect(() => {
    if (!loaded || !settled) return;

    const timer = setTimeout(() => {
      const next = floors_to_publish(stored_ref.current);

      if (next) publish_ref.current(next);
    }, FLOOR_PUBLISH_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [loaded, settled, change_token]);
}
