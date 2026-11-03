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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@aster/ui";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert_dialog";
import { use_i18n } from "@/lib/i18n/context";

interface ConfirmModalProps {
  show: boolean;
  title: string;
  description: string;
  confirm_text: string;
  confirm_variant: "default" | "destructive";
  dont_ask: boolean;
  on_dont_ask_change: (value: boolean) => void;
  on_confirm: () => void;
  on_cancel: () => void;
  hide_dont_ask?: boolean;
}

export function ConfirmModal({
  show,
  title,
  description,
  confirm_text,
  confirm_variant,
  dont_ask,
  on_dont_ask_change,
  on_confirm,
  on_cancel,
  hide_dont_ask = false,
}: ConfirmModalProps): React.ReactElement {
  const { t } = use_i18n();
  const is_destructive = confirm_variant === "destructive";

  return (
    <AlertDialog open={show} onOpenChange={(open) => !open && on_cancel()}>
      <AlertDialogContent
        className="gap-0 p-0 overflow-hidden max-w-[380px]"
        on_overlay_click={on_cancel}
      >
        <div className="px-6 pt-6 pb-5">
          <AlertDialogHeader className="space-y-2">
            <AlertDialogTitle className="text-base font-semibold">
              {title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-normal">
              {description}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {!hide_dont_ask && (
            <label
              className="inline-flex items-center gap-2 cursor-pointer select-none mt-5"
              htmlFor="dont-ask-checkbox"
            >
              <Checkbox
                checked={dont_ask}
                id="dont-ask-checkbox"
                onCheckedChange={(checked) =>
                  on_dont_ask_change(checked === true)
                }
              />
              <span className="text-[13px] text-txt-muted">
                {t("common.dont_ask_again")}
              </span>
            </label>
          )}
        </div>

        <AlertDialogFooter className="flex-row gap-3 px-6 pb-6 pt-2 sm:justify-end">
          <AlertDialogCancel asChild>
            <Button className="mt-0 max-sm:flex-1" variant="outline">
              {t("common.cancel")}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              className="max-sm:flex-1"
              variant={is_destructive ? "destructive" : "primary"}
              onClick={on_confirm}
            >
              {confirm_text}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
