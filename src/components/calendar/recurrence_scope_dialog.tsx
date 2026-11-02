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
import type { RecurrenceEditScope } from "@/types/calendar";

import { Fragment, useEffect, useId, useState } from "react";
import { Button, IslandDivider } from "@aster/ui";

import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";

const SCOPES: RecurrenceEditScope[] = ["single", "following", "series"];

interface RecurrenceScopeDialogProps {
  is_open: boolean;
  mode: "edit" | "delete";
  on_cancel: () => void;
  on_confirm: (scope: RecurrenceEditScope) => void;
}

export function RecurrenceScopeDialog({
  is_open,
  mode,
  on_cancel,
  on_confirm,
}: RecurrenceScopeDialogProps) {
  const { t } = use_i18n();
  const group_name = useId();
  const [scope, set_scope] = useState<RecurrenceEditScope>("single");

  useEffect(() => {
    if (is_open) {
      set_scope("single");
    }
  }, [is_open]);

  const scope_label = (option: RecurrenceEditScope) => {
    if (option === "single") {
      return t("calendar.scope_single");
    }

    if (option === "following") {
      return t("calendar.scope_following");
    }

    return t("calendar.scope_series");
  };

  return (
    <Modal is_open={is_open} size="sm" on_close={on_cancel}>
      <form
        onSubmit={(submit_event) => {
          submit_event.preventDefault();
          on_confirm(scope);
        }}
      >
        <ModalHeader>
          <ModalTitle>
            {mode === "delete"
              ? t("calendar.delete_scope_title")
              : t("calendar.edit_scope_title")}
          </ModalTitle>
        </ModalHeader>
        <ModalBody>
          <div
            aria-label={
              mode === "delete"
                ? t("calendar.delete_scope_title")
                : t("calendar.edit_scope_title")
            }
            className="aster_island overflow-hidden"
            role="radiogroup"
          >
            {SCOPES.map((option, index) => {
              const is_selected = scope === option;

              return (
                <Fragment key={option}>
                  {index > 0 && <IslandDivider />}
                  <label
                    className={`flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-3 text-sm transition-colors duration-150 hover:bg-[var(--aster-island-hover)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-[var(--accent-color)] ${is_selected ? "font-medium text-txt-primary" : "text-txt-secondary"}`}
                  >
                    <input
                      autoFocus={index === 0}
                      checked={is_selected}
                      className="aster_radio_input"
                      name={group_name}
                      type="radio"
                      value={option}
                      onChange={() => set_scope(option)}
                    />
                    <span aria-hidden="true" className="aster_radio_circle" />
                    <span className="min-w-0 flex-1">{scope_label(option)}</span>
                  </label>
                </Fragment>
              );
            })}
          </div>
        </ModalBody>
        <ModalFooter className="flex justify-end gap-2">
          <Button size="md" type="button" variant="ghost" onClick={on_cancel}>
            {t("common.cancel")}
          </Button>
          <Button
            size="md"
            type="submit"
            variant={mode === "delete" ? "depth_destructive" : "depth"}
          >
            {mode === "delete" ? t("common.delete") : t("common.save")}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
