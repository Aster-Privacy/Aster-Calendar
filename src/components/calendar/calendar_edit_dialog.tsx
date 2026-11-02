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
import type { DecryptedCalendar } from "@/types/calendar";

import { useEffect, useId, useState } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";
import { Button, ButtonSpinner, IslandDivider } from "@aster/ui";

import {
  DEFAULT_EVENT_COLOR,
  EVENT_COLOR_OPTIONS,
  nearest_event_color,
} from "@/components/calendar/calendar_utils";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { show_toast } from "@/components/toast/simple_toast";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";
import {
  create_calendar,
  delete_calendar,
  update_calendar,
} from "@/services/api/calendar";

export interface CalendarSavedPayload {
  id: string | null;
  name: string;
  color: string;
}

interface CalendarEditDialogProps {
  is_open: boolean;
  calendar: DecryptedCalendar | null;
  on_close: () => void;
  on_saved?: (saved: CalendarSavedPayload) => void;
  on_delete_request?: (calendar: DecryptedCalendar) => void;
}

export function CalendarEditDialog({
  is_open,
  calendar,
  on_close,
  on_saved,
  on_delete_request,
}: CalendarEditDialogProps) {
  const { t } = use_i18n();
  const name_id = useId();
  const color_label_id = useId();
  const [name, set_name] = useState("");
  const [color, set_color] = useState(DEFAULT_EVENT_COLOR.hex);
  const [is_busy, set_is_busy] = useState(false);

  useEffect(() => {
    if (!is_open) {
      return;
    }

    set_name(calendar?.name ?? "");
    set_color(calendar?.color ?? DEFAULT_EVENT_COLOR.hex);
    set_is_busy(false);
  }, [is_open, calendar]);

  const trimmed = name.trim();
  const can_submit = !is_busy && trimmed.length > 0;
  const can_delete = !!calendar && !calendar.is_default && !!on_delete_request;

  const submit = async () => {
    if (!can_submit) {
      return;
    }

    set_is_busy(true);

    try {
      const result = calendar
        ? await update_calendar(calendar.id, trimmed, color)
        : await create_calendar(trimmed, color);

      if (!result.success) {
        show_toast(t("calendar.settings_calendar_save_failed"), "error");

        return;
      }

      on_saved?.({ id: calendar?.id ?? null, name: trimmed, color });
      on_close();
    } catch {
      show_toast(t("calendar.settings_calendar_save_failed"), "error");
    } finally {
      set_is_busy(false);
    }
  };

  return (
    <Modal is_open={is_open} on_close={on_close} size="sm">
      <ModalHeader>
        <ModalTitle>
          {calendar ? t("calendar.edit_calendar") : t("calendar.new_calendar")}
        </ModalTitle>
      </ModalHeader>
      <ModalBody>
        <form
          className="aster_island overflow-hidden"
          data-calendar-edit-form=""
          onSubmit={(submitted) => {
            submitted.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col gap-2 px-4 py-3">
            <label className="block text-sm text-txt-muted" htmlFor={name_id}>
              {t("calendar.settings_calendar_name")}
            </label>
            <Input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="aster_input_tonal w-full"
              id={name_id}
              maxLength={120}
              placeholder={t("calendar.calendar_name_placeholder")}
              size="md"
              type="text"
              value={name}
              onChange={(changed) => set_name(changed.target.value)}
            />
          </div>

          <IslandDivider />

          <div className="flex flex-col gap-2 px-4 py-3">
            <span className="block text-sm text-txt-muted" id={color_label_id}>
              {t("common.select_a_color")}
            </span>
            <div
              aria-labelledby={color_label_id}
              className="flex flex-wrap gap-2.5 py-0.5"
              role="radiogroup"
            >
              {EVENT_COLOR_OPTIONS.map((option) => {
                const is_selected = nearest_event_color(color).name === option.name;

                return (
                  <button
                    key={option.hex}
                    aria-checked={is_selected}
                    aria-label={t(option.name_key)}
                    className="flex h-7 w-7 items-center justify-center rounded-full transition-[box-shadow] duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--aster-island-fill)]"
                    data-calendar-color={option.name}
                    role="radio"
                    style={{
                      backgroundColor: option.token,
                      boxShadow: is_selected
                        ? `0 0 0 2px var(--aster-island-fill), 0 0 0 4px ${option.token}`
                        : "none",
                    }}
                    title={t(option.name_key)}
                    type="button"
                    onClick={() => set_color(option.hex)}
                  >
                    {is_selected && (
                      <CheckIcon
                        className="h-4 w-4"
                        strokeWidth={2.5}
                        style={{ color: "var(--calendar_event_text, #ffffff)" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </form>
      </ModalBody>
      <ModalFooter className="flex items-center gap-2">
        {can_delete && (
          <Button
            className="me-auto text-[var(--color-danger)] hover:text-[var(--color-danger)]"
            disabled={is_busy}
            size="md"
            type="button"
            variant="ghost"
            onClick={() => {
              on_close();
              on_delete_request?.(calendar);
            }}
          >
            {t("calendar.settings_delete_calendar")}
          </Button>
        )}
        <Button
          className={can_delete ? undefined : "ms-auto"}
          disabled={is_busy}
          size="md"
          type="button"
          variant="ghost"
          onClick={on_close}
        >
          {t("common.cancel")}
        </Button>
        <Button
          disabled={!can_submit}
          size="md"
          type="button"
          variant="depth"
          onClick={() => void submit()}
        >
          {calendar ? t("common.save") : t("common.create")}
          {is_busy && <ButtonSpinner />}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

interface CalendarDeleteDialogProps {
  calendar: DecryptedCalendar | null;
  on_close: () => void;
  on_deleted?: (calendar_id: string) => void;
}

export function CalendarDeleteDialog({
  calendar,
  on_close,
  on_deleted,
}: CalendarDeleteDialogProps) {
  const { t } = use_i18n();
  const [is_busy, set_is_busy] = useState(false);

  const confirm = async () => {
    if (!calendar || is_busy) {
      return;
    }

    set_is_busy(true);

    try {
      const result = await delete_calendar(calendar.id);

      if (!result.success) {
        show_toast(t("calendar.settings_calendar_delete_failed"), "error");

        return;
      }

      on_deleted?.(calendar.id);
      on_close();
    } catch {
      show_toast(t("calendar.settings_calendar_delete_failed"), "error");
    } finally {
      set_is_busy(false);
    }
  };

  return (
    <ConfirmationModal
      cancel_text={t("common.cancel")}
      confirm_text={t("calendar.settings_delete_calendar")}
      is_loading={is_busy}
      is_open={calendar !== null}
      message={t("calendar.delete_calendar_message", {
        name: calendar?.name ?? "",
      })}
      on_cancel={on_close}
      on_confirm={() => void confirm()}
      title={t("calendar.settings_delete_calendar_title")}
      variant="danger"
    />
  );
}
