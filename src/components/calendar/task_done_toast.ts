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
import type { use_calendar_state } from "@/components/calendar/use_calendar_state";

import { show_toast } from "@/components/toast/simple_toast";

const UNDO_TOAST_MS = 6000;

type CalendarState = Pick<
  ReturnType<typeof use_calendar_state>,
  "handle_toggle_task_done" | "t"
>;

export async function toggle_task_done_with_undo(
  state: CalendarState,
  event: DecryptedCalendarEvent,
): Promise<void> {
  let updated: DecryptedCalendarEvent;

  try {
    updated = await state.handle_toggle_task_done(event);
  } catch {
    show_toast(state.t("calendar.event_save_failed"), "error");

    return;
  }

  show_toast(
    state.t(
      event.is_completed ? "calendar.task_reopened" : "calendar.task_completed",
    ),
    "success",
    UNDO_TOAST_MS,
    {
      label: state.t("common.undo"),
      on_click: () => {
        void state.handle_toggle_task_done(updated).catch(() => {
          show_toast(state.t("calendar.event_save_failed"), "error");
        });
      },
    },
  );
}
