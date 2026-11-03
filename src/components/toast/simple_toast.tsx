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
import {
  SimpleToast as SimpleToastView,
  dismiss_toast as dismiss_ui_toast,
  show_toast as show_ui_toast,
} from "@aster/ui";

import { use_should_reduce_motion } from "@/provider";
import { use_translation } from "@/lib/i18n";
import { hide_action_toast } from "@/components/toast/action_toast";
import {
  use_toast_position,
  type ToastPosition,
} from "@/components/toast/toast_position";

export type { ToastPosition };

export {
  dismiss_toast,
  set_toast_min_duration,
  TOAST_DURATION_DEFAULT_MS,
  TOAST_DURATION_BILLING_MS,
} from "@aster/ui";

const visible_toasts = new Map<string, string>();

function clear_simple_toasts(keep_key?: string) {
  visible_toasts.forEach((key, id) => {
    if (key === keep_key) return;
    dismiss_ui_toast(id);
    visible_toasts.delete(id);
  });
}

window.addEventListener("aster-action-toast-show", () => clear_simple_toasts());

export function show_toast(
  ...args: Parameters<typeof show_ui_toast>
): ReturnType<typeof show_ui_toast> {
  const key = `${args[1] ?? ""}:${args[0]}`;

  hide_action_toast(true);
  clear_simple_toasts(key);

  const id = show_ui_toast(...args);

  visible_toasts.set(id, key);
  window.setTimeout(
    () => {
      if (visible_toasts.get(id) === key) visible_toasts.delete(id);
    },
    Math.max(args[2] ?? 0, 30000),
  );

  return id;
}

interface SimpleToastProps {
  position?: ToastPosition;
}

export function SimpleToast({ position }: SimpleToastProps) {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_translation();

  const { layout, y_offset } = use_toast_position(position);

  return (
    <div className="aster_simple_toast_host">
      <SimpleToastView
        dismiss_label={t("common.dismiss")}
        layout={layout}
        reduce_motion={reduce_motion}
        y_offset={y_offset}
      />
    </div>
  );
}
