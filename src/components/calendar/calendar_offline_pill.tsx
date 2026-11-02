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
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { use_i18n } from "@/lib/i18n/context";
import { use_online_status } from "@/hooks/use_online_status";
import { use_should_reduce_motion } from "@/provider";
import {
  calendar_mutation_queue,
  subscribe_calendar_queue,
} from "@/services/calendar/mutation_queue";

export function CalendarOfflinePill() {
  const { t } = use_i18n();
  const { is_online } = use_online_status();
  const reduce_motion = use_should_reduce_motion();
  const [pending_count, set_pending_count] = useState(() =>
    calendar_mutation_queue.pending_count(),
  );

  useEffect(
    () =>
      subscribe_calendar_queue((event) => {
        if (event.type === "pending_changed") {
          set_pending_count(event.count);
        }
      }),
    [],
  );

  const label =
    pending_count > 0
      ? t("calendar.sync_offline_pending", { count: pending_count })
      : t("calendar.sync_offline");

  return (
    <AnimatePresence initial={false}>
      {!is_online && (
        <motion.span
          animate={{ opacity: 1, scale: 1 }}
          className="inline-flex h-6 flex-shrink-0 items-center gap-1.5 rounded-[var(--aster-radius-item)] bg-[var(--aster-field-bg)] px-2 text-[12px] font-medium leading-none text-txt-secondary"
          data-testid="calendar-offline-pill"
          exit={{ opacity: 0, scale: 0.96 }}
          initial={reduce_motion ? false : { opacity: 0, scale: 0.96 }}
          role="status"
          transition={{
            duration: reduce_motion ? 0 : 0.15,
            ease: [0.2, 0, 0, 1],
          }}
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]"
          />
          {label}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
