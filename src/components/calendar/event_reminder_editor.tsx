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
import type { TranslationKey } from "@/lib/i18n";

import { useState } from "react";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { CalendarSelect } from "@/components/calendar/calendar_select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert_dialog";
import { Button } from "@aster/ui";
import { use_i18n } from "@/lib/i18n/context";
import {
  ALL_DAY_EVENT_REMINDER_CHOICES,
  EVENT_REMINDER_CHOICES,
  MAX_EVENT_REMINDERS,
  PREFERRED_ALL_DAY_REMINDER,
  PREFERRED_TIMED_REMINDER,
  REMINDER_UNITS,
  type ReminderUnit,
  add_reminder,
  custom_reminder_minutes,
  format_reminder,
  next_reminder_choice,
  remove_reminder,
  replace_reminder,
  split_reminder,
} from "@/services/calendar/event_reminders";

const CUSTOM_VALUE = "custom";
const MAX_AMOUNT_DIGITS = 5;

const UNIT_LABEL_KEYS: Record<ReminderUnit, TranslationKey> = {
  minutes: "calendar.reminder_unit_minutes",
  hours: "calendar.reminder_unit_hours",
  days: "calendar.reminder_unit_days",
  weeks: "calendar.reminder_unit_weeks",
};

interface EventReminderEditorProps {
  reminders: number[];
  is_all_day: boolean;
  on_change: (next: number[]) => void;
}

interface CustomTarget {
  replacing: number | null;
}

export function EventReminderEditor({
  reminders,
  is_all_day,
  on_change,
}: EventReminderEditorProps) {
  const { t } = use_i18n();
  const [custom_target, set_custom_target] = useState<CustomTarget | null>(
    null,
  );
  const choices = is_all_day
    ? ALL_DAY_EVENT_REMINDER_CHOICES
    : EVENT_REMINDER_CHOICES;
  const preferred = is_all_day
    ? PREFERRED_ALL_DAY_REMINDER
    : PREFERRED_TIMED_REMINDER;

  const options_for = (current: number) => {
    const values = choices.includes(current) ? choices : [...choices, current];

    return [
      ...[...values]
        .sort((left, right) => left - right)
        .map((minutes) => ({
          value: String(minutes),
          label: format_reminder(minutes, t),
          disabled: minutes !== current && reminders.includes(minutes),
        })),
      { value: CUSTOM_VALUE, label: t("calendar.reminder_custom") },
    ];
  };

  const handle_add = () => {
    const next = next_reminder_choice(reminders, choices, preferred);

    if (next === null) {
      set_custom_target({ replacing: null });

      return;
    }

    on_change(add_reminder(reminders, next));
  };

  const handle_confirm = (minutes: number) => {
    const target = custom_target;

    set_custom_target(null);

    if (!target) {
      return;
    }

    on_change(
      target.replacing === null
        ? add_reminder(reminders, minutes)
        : replace_reminder(reminders, target.replacing, minutes),
    );
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      {reminders.length === 0 && (
        <p className="py-1.5 text-[14px] text-txt-muted">
          {t("calendar.reminder_none")}
        </p>
      )}
      {reminders.map((minutes) => (
        <div key={minutes} className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <CalendarSelect
              aria_label={t("calendar.reminder")}
              class_name="min-w-[10rem]"
              full_width
              options={options_for(minutes)}
              value={String(minutes)}
              on_change={(value) => {
                if (value === CUSTOM_VALUE) {
                  set_custom_target({ replacing: minutes });

                  return;
                }

                on_change(replace_reminder(reminders, minutes, Number(value)));
              }}
            />
          </div>
          <button
            aria-label={t("calendar.remove_reminder")}
            className="rounded-[var(--aster-radius-item)] p-1.5 text-txt-muted transition-colors duration-150 hover:bg-[var(--aster-hover)] hover:text-txt-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
            type="button"
            onClick={() => on_change(remove_reminder(reminders, minutes))}
          >
            <XMarkIcon
              aria-hidden="true"
              className="h-4 w-4"
              strokeWidth={1.75}
            />
          </button>
        </div>
      ))}
      {reminders.length < MAX_EVENT_REMINDERS ? (
        <div>
          <button
            className="-ms-2 inline-flex items-center gap-1.5 rounded-[var(--aster-radius-item)] px-2 py-1.5 text-[13px] font-medium text-txt-secondary hover:bg-[var(--aster-hover)] hover:text-txt-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
            type="button"
            onClick={handle_add}
          >
            <PlusIcon
              aria-hidden="true"
              className="h-3.5 w-3.5"
              strokeWidth={2}
            />
            {t("calendar.add_reminder")}
          </button>
        </div>
      ) : (
        <p className="py-1 text-[12px] text-txt-muted">
          {t("calendar.reminder_limit_reached", {
            count: MAX_EVENT_REMINDERS,
          })}
        </p>
      )}
      <CustomReminderDialog
        initial={custom_target?.replacing ?? null}
        is_open={custom_target !== null}
        on_close={() => set_custom_target(null)}
        on_confirm={handle_confirm}
      />
    </div>
  );
}

interface CustomReminderDialogProps {
  is_open: boolean;
  initial: number | null;
  on_close: () => void;
  on_confirm: (minutes: number) => void;
}

function CustomReminderDialog({
  is_open,
  initial,
  on_close,
  on_confirm,
}: CustomReminderDialogProps) {
  return (
    <AlertDialog
      open={is_open}
      onOpenChange={(open) => {
        if (!open) {
          on_close();
        }
      }}
    >
      {is_open && (
        <CustomReminderForm
          initial={initial}
          on_close={on_close}
          on_confirm={on_confirm}
        />
      )}
    </AlertDialog>
  );
}

function CustomReminderForm({
  initial,
  on_close,
  on_confirm,
}: Omit<CustomReminderDialogProps, "is_open">) {
  const { t } = use_i18n();
  const start =
    initial !== null && initial > 0
      ? split_reminder(initial)
      : { amount: 30, unit: "minutes" as ReminderUnit };
  const [amount, set_amount] = useState(String(start.amount));
  const [unit, set_unit] = useState<ReminderUnit>(start.unit);
  const parsed = amount.length > 0 ? Number(amount) : null;
  const value = custom_reminder_minutes(parsed, unit);
  const too_long = parsed !== null && value === null;

  const submit = () => {
    if (value !== null) {
      on_confirm(value);
    }
  };

  return (
    <AlertDialogContent on_overlay_click={on_close}>
      <div
        className="contents"
        onKeyDown={(key_event) => {
          if (key_event.key === "Escape") {
            key_event.stopPropagation();
            on_close();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("calendar.custom_reminder_title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("calendar.custom_reminder_message")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          noValidate
          className="flex flex-col"
          onSubmit={(form_event) => {
            form_event.preventDefault();
            form_event.stopPropagation();
            submit();
          }}
        >
          <div className="flex items-center gap-2">
            <input
              aria-invalid={too_long}
              aria-label={t("calendar.custom_reminder_amount")}
              className="aster_input aster_input_tonal !h-9 w-[6.5rem] !px-3 !text-[14px]"
              inputMode="numeric"
              maxLength={MAX_AMOUNT_DIGITS}
              placeholder={t("calendar.custom_reminder_amount")}
              type="text"
              value={amount}
              onChange={(input_event) =>
                set_amount(
                  input_event.target.value
                    .replace(/\D/g, "")
                    .slice(0, MAX_AMOUNT_DIGITS),
                )
              }
            />
            <div className="min-w-0 flex-1">
              <CalendarSelect
                aria_label={t("calendar.custom_reminder_title")}
                full_width
                options={REMINDER_UNITS.map((option) => ({
                  value: option,
                  label: t(UNIT_LABEL_KEYS[option]),
                }))}
                value={unit}
                on_change={(next) => set_unit(next as ReminderUnit)}
              />
            </div>
          </div>
          {too_long && (
            <p
              className="mt-1 text-[12px] text-[var(--color-danger)]"
              role="alert"
            >
              {t("calendar.custom_reminder_too_long")}
            </p>
          )}
          <AlertDialogFooter>
            <Button size="md" type="button" variant="ghost" onClick={on_close}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={value === null}
              size="md"
              type="submit"
              variant="depth"
            >
              {t("common.ok")}
            </Button>
          </AlertDialogFooter>
        </form>
      </div>
    </AlertDialogContent>
  );
}
