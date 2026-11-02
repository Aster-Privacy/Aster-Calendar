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

import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@aster/ui";

import { DatePicker } from "@/components/calendar/date_picker";
import {
  add_days,
  add_months,
  start_of_day,
} from "@/components/calendar/calendar_utils";
import { parse_date_input } from "@/components/calendar/date_input_parse";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";

interface CalendarGoToDateModalProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  is_open: boolean;
  initial_date: Date;
  language?: string;
  week_start_day: number;
  on_go: (date: Date) => void;
  on_close: () => void;
}

export function CalendarGoToDateModal({
  t,
  is_open,
  initial_date,
  language = "en",
  week_start_day,
  on_go,
  on_close,
}: CalendarGoToDateModalProps) {
  const [selected, set_selected] = useState<Date>(initial_date);
  const [typed, set_typed] = useState("");
  const [is_invalid, set_is_invalid] = useState(false);
  const input_id = useId();
  const hint_id = useId();

  useEffect(() => {
    if (is_open) {
      set_selected(initial_date);
      set_typed("");
      set_is_invalid(false);
    }
  }, [is_open, initial_date]);

  const commit = (date: Date) => {
    on_go(date);
    on_close();
  };

  const resolve_typed = (): Date | null => {
    if (!typed.trim()) {
      return selected;
    }

    return parse_date_input(typed, { reference: new Date(), language });
  };

  const handle_typed_change = (next: string) => {
    set_typed(next);
    set_is_invalid(false);

    const parsed = next.trim()
      ? parse_date_input(next, { reference: new Date(), language })
      : null;

    if (parsed) {
      set_selected(parsed);
    }
  };

  const handle_go = () => {
    const resolved = resolve_typed();

    if (!resolved) {
      set_is_invalid(true);

      return;
    }

    commit(resolved);
  };

  const preview_formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [language],
  );

  const today = start_of_day(new Date());
  const quick_picks: { key: TranslationKey; date: Date }[] = [
    { key: "common.today", date: today },
    { key: "common.tomorrow", date: add_days(today, 1) },
    { key: "common.next_week", date: add_days(today, 7) },
    { key: "common.next_month", date: add_months(today, 1) },
  ];

  const status_text = is_invalid
    ? t("calendar.go_to_date_input_invalid")
    : typed.trim()
      ? preview_formatter.format(selected)
      : t("calendar.go_to_date_input_hint");

  return (
    <Modal is_open={is_open} size="sm" on_close={on_close}>
      <ModalHeader>
        <ModalTitle>{t("calendar.go_to_date_title")}</ModalTitle>
      </ModalHeader>
      <ModalBody className="flex flex-col items-stretch gap-4">
        <div className="flex flex-col gap-1.5">
          <Input
            autoFocus
            aria-describedby={hint_id}
            aria-invalid={is_invalid || undefined}
            aria-label={t("calendar.go_to_date_input_label")}
            autoComplete="off"
            data-testid="calendar-go-to-date-input"
            id={input_id}
            placeholder={t("calendar.go_to_date_input_placeholder")}
            size="md"
            value={typed}
            onChange={(event) => handle_typed_change(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handle_go();
              }
            }}
          />
          <p
            aria-live="polite"
            className={`min-h-[18px] px-1 text-xs ${
              is_invalid
                ? "text-[var(--color-danger)]"
                : typed.trim()
                  ? "font-medium text-txt-secondary"
                  : "text-txt-muted"
            }`}
            id={hint_id}
            role={is_invalid ? "alert" : undefined}
          >
            {status_text}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {quick_picks.map((pick) => (
            <Button
              key={pick.key}
              size="sm"
              variant="secondary"
              onClick={() => commit(pick.date)}
            >
              {t(pick.key)}
            </Button>
          ))}
        </div>
        <DatePicker
          show_today={false}
          size="md"
          value={selected}
          week_start_day={week_start_day}
          on_select={commit}
        />
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        <Button size="md" variant="ghost" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button size="md" variant="depth" onClick={handle_go}>
          {t("calendar.go_to_date_action")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
