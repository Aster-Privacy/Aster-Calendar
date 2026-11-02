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
import type { SyncConflict } from "@/services/calendar/mutation_queue";

import { useEffect, useState } from "react";

import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_online_status } from "@/hooks/use_online_status";
import {
  calendar_mutation_queue,
  subscribe_calendar_queue,
} from "@/services/calendar/mutation_queue";

export interface CalendarSyncStatus {
  is_online: boolean;
  pending_count: number;
  conflicts: SyncConflict[];
}

export function use_calendar_sync_status(): CalendarSyncStatus {
  const { t } = use_i18n();
  const { is_online } = use_online_status();
  const [pending_count, set_pending_count] = useState(() =>
    calendar_mutation_queue.pending_count(),
  );
  const [conflicts, set_conflicts] = useState<SyncConflict[]>(() =>
    calendar_mutation_queue.get_conflicts(),
  );

  useEffect(() => {
    let had_offline_queue = false;

    return subscribe_calendar_queue((event) => {
      if (event.type === "pending_changed") {
        set_pending_count(event.count);

        return;
      }

      if (event.type === "conflicts_changed") {
        set_conflicts(calendar_mutation_queue.get_conflicts());

        return;
      }

      if (event.type === "queued_offline") {
        had_offline_queue = true;
        show_toast(t("calendar.sync_saved_offline"), "info");

        return;
      }

      if (event.type === "drained") {
        if (had_offline_queue) {
          had_offline_queue = false;
          show_toast(t("calendar.sync_back_online"), "success");
        }

        return;
      }

      if (event.type === "dropped") {
        if (event.reason === "plan_limit") return;
        show_toast(
          t(
            event.reason === "not_found"
              ? event.target === "calendar"
                ? "calendar.sync_calendar_missing"
                : "calendar.sync_event_missing"
              : "calendar.sync_change_rejected",
          ),
          "error",
        );
      }
    });
  }, [t]);

  return { is_online, pending_count, conflicts };
}
