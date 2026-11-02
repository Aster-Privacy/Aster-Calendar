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
import type {
  PrintCalendarOptions,
  PrintLayout,
  PrintOrientation,
} from "@/services/calendar/print_calendar";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import { useEffect, useMemo, useRef, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button, Switch } from "@aster/ui";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert_dialog";
import { use_i18n } from "@/lib/i18n/context";
import {
  build_print_html,
  PRINT_PAGE_SIZE_PX,
} from "@/services/calendar/print_calendar";

export interface PrintDialogSettings {
  layout: PrintLayout;
  orientation: PrintOrientation;
  show_declined: boolean;
}

interface CalendarPrintDialogProps {
  is_open: boolean;
  range_label: string;
  build_options: (settings: PrintDialogSettings) => PrintCalendarOptions;
  on_cancel: () => void;
  on_confirm: (settings: PrintDialogSettings) => void;
}

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
}

const LAYOUTS: PrintLayout[] = ["grid", "agenda"];
const ORIENTATIONS: PrintOrientation[] = ["portrait", "landscape"];

const PREVIEW_PADDING_PX = 20;

function PageMockup({
  layout,
  orientation,
}: {
  layout: PrintLayout;
  orientation: PrintOrientation;
}) {
  const is_portrait = orientation === "portrait";
  const page_width = is_portrait ? 26 : 36;
  const page_height = is_portrait ? 36 : 26;
  const page_x = (40 - page_width) / 2;
  const page_y = (40 - page_height) / 2;
  const inner_x = page_x + 3.5;
  const inner_y = page_y + 7.5;
  const inner_width = page_width - 7;
  const inner_height = page_height - 11;
  const lines: string[] = [];

  if (layout === "grid") {
    const columns = is_portrait ? 3 : 5;
    const rows = is_portrait ? 4 : 3;

    for (let column = 1; column < columns; column += 1) {
      const x = inner_x + (inner_width / columns) * column;

      lines.push(`M${x} ${inner_y}V${inner_y + inner_height}`);
    }

    for (let row = 1; row < rows; row += 1) {
      const y = inner_y + (inner_height / rows) * row;

      lines.push(`M${inner_x} ${y}H${inner_x + inner_width}`);
    }
  } else {
    const rows = is_portrait ? 6 : 4;

    for (let row = 0; row < rows; row += 1) {
      const y = inner_y + 1.5 + (inner_height / rows) * row;

      lines.push(`M${inner_x} ${y}H${inner_x + 4}`);
      lines.push(`M${inner_x + 6.5} ${y}H${inner_x + inner_width}`);
    }
  }

  return (
    <svg
      aria-hidden="true"
      className="h-9 w-9 shrink-0"
      fill="none"
      viewBox="0 0 40 40"
    >
      <rect
        fill="var(--aster-dialog-bg, var(--modal-bg))"
        height={page_height}
        rx="2.5"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.25"
        width={page_width}
        x={page_x}
        y={page_y}
      />
      <rect
        fill="currentColor"
        height="2"
        opacity="0.6"
        rx="1"
        width={inner_width * 0.55}
        x={inner_x}
        y={page_y + 3}
      />
      {layout === "grid" && (
        <rect
          height={inner_height}
          rx="1"
          stroke="currentColor"
          strokeOpacity="0.4"
          strokeWidth="1"
          width={inner_width}
          x={inner_x}
          y={inner_y}
        />
      )}
      <path
        d={lines.join("")}
        stroke="currentColor"
        strokeLinecap={layout === "grid" ? "butt" : "round"}
        strokeOpacity={layout === "grid" ? 0.4 : 0.5}
        strokeWidth={layout === "grid" ? 1 : 1.5}
      />
    </svg>
  );
}

function ChoiceGroup<T extends string>({
  label,
  name,
  options,
  value,
  on_change,
}: {
  label: string;
  name: string;
  options: ChoiceOption<T>[];
  value: T;
  on_change: (next: T) => void;
}) {
  const group_ref = useRef<HTMLDivElement | null>(null);
  const label_id = `${name}_label`;

  const handle_key_down = (
    key_event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    const forward =
      key_event.key === "ArrowRight" || key_event.key === "ArrowDown";
    const backward =
      key_event.key === "ArrowLeft" || key_event.key === "ArrowUp";

    if (!forward && !backward) {
      return;
    }

    key_event.preventDefault();

    const index = options.findIndex((option) => option.value === value);
    const step = forward ? 1 : options.length - 1;
    const next = options[(index + step) % options.length]?.value ?? value;

    on_change(next);
    window.requestAnimationFrame(() => {
      group_ref.current
        ?.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)
        ?.focus();
    });
  };

  return (
    <div className="min-w-0">
      <p
        className="mb-2 px-0.5 text-[12px] font-semibold uppercase tracking-wider text-txt-muted"
        id={label_id}
      >
        {label}
      </p>
      <div
        ref={group_ref}
        aria-labelledby={label_id}
        className="grid grid-cols-2 gap-2"
        role="radiogroup"
      >
        {options.map((option) => {
          const is_selected = option.value === value;

          return (
            <button
              key={option.value}
              aria-checked={is_selected}
              className={`flex min-h-[52px] min-w-0 items-center gap-2 rounded-[var(--aster-radius-control,12px)] bg-[var(--aster-field-bg)] px-2.5 py-1.5 text-start text-[13px] font-medium outline-none transition-[box-shadow,color,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--aster-dialog-bg,var(--modal-bg))] ${
                is_selected
                  ? "text-txt-primary shadow-[inset_0_0_0_1.5px_var(--accent-color)]"
                  : "text-txt-secondary hover:bg-[var(--aster-hover)] hover:text-txt-primary"
              }`}
              data-testid={`${name}-${option.value}`}
              data-value={option.value}
              role="radio"
              tabIndex={is_selected ? 0 : -1}
              type="button"
              onClick={() => on_change(option.value)}
              onKeyDown={handle_key_down}
            >
              {option.icon}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PrintPreview({
  options,
  title,
}: {
  options: PrintCalendarOptions;
  title: string;
}) {
  const box_ref = useRef<HTMLDivElement | null>(null);
  const [box_size, set_box_size] = useState({ width: 0, height: 0 });
  const html = useMemo(() => build_print_html(options), [options]);
  const page = PRINT_PAGE_SIZE_PX[options.orientation];
  const scale =
    box_size.width > 0 && box_size.height > 0
      ? Math.max(
          0,
          Math.min(
            (box_size.width - PREVIEW_PADDING_PX * 2) / page.width,
            (box_size.height - PREVIEW_PADDING_PX * 2) / page.height,
          ),
        )
      : 0;

  useEffect(() => {
    const node = box_ref.current;

    if (!node) {
      return;
    }

    const measure = () =>
      set_box_size({ width: node.clientWidth, height: node.clientHeight });

    measure();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(measure);

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={box_ref}
      className="relative h-[212px] w-full min-w-0 overflow-hidden rounded-[var(--aster-radius-control,12px)] bg-[var(--aster-field-bg)] md:h-full md:min-h-[380px]"
      data-testid="calendar-print-preview"
    >
      {scale > 0 && (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[3px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.12),0_6px_18px_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.06)]"
          style={{
            height: Math.floor(page.height * scale),
            width: Math.floor(page.width * scale),
          }}
        >
          <iframe
            className="pointer-events-none block origin-top-left border-0 bg-white"
            sandbox=""
            srcDoc={html}
            style={{
              height: page.height,
              transform: `scale(${scale})`,
              width: page.width,
            }}
            tabIndex={-1}
            title={title}
          />
        </div>
      )}
    </div>
  );
}

export function CalendarPrintDialog({
  is_open,
  range_label,
  build_options,
  on_cancel,
  on_confirm,
}: CalendarPrintDialogProps) {
  const { t } = use_i18n();
  const [layout, set_layout] = useState<PrintLayout>("grid");
  const [orientation, set_orientation] =
    useState<PrintOrientation>("landscape");
  const [show_declined, set_show_declined] = useState(false);

  const settings = useMemo<PrintDialogSettings>(
    () => ({ layout, orientation, show_declined }),
    [layout, orientation, show_declined],
  );
  const preview_options = useMemo(
    () => (is_open ? build_options(settings) : null),
    [build_options, is_open, settings],
  );

  const layout_options: ChoiceOption<PrintLayout>[] = LAYOUTS.map((value) => ({
    value,
    label:
      value === "grid"
        ? t("calendar.print_layout_grid")
        : t("calendar.print_layout_agenda"),
    icon: <PageMockup layout={value} orientation={orientation} />,
  }));
  const orientation_options: ChoiceOption<PrintOrientation>[] =
    ORIENTATIONS.map((value) => ({
      value,
      label:
        value === "portrait"
          ? t("calendar.print_portrait")
          : t("calendar.print_landscape"),
      icon: <PageMockup layout={layout} orientation={value} />,
    }));

  return (
    <AlertDialog
      open={is_open}
      onOpenChange={(open) => {
        if (!open) {
          on_cancel();
        }
      }}
    >
      <AlertDialogContent
        className="calendar_form_radius bottom-0 left-0 right-0 top-0 m-auto flex h-fit max-h-[calc(100dvh-24px)] translate-x-0 translate-y-0 ![will-change:auto] w-[calc(100vw-24px)] max-w-[760px] flex-col gap-0 overflow-hidden rounded-[var(--aster-radius-floating,16px)] p-0"
        data-calendar-surface=""
        data-testid="calendar-print-dialog"
        on_overlay_click={on_cancel}
      >
        <div className="flex min-w-0 items-center justify-between gap-3 px-5 pb-3 pt-4">
          <AlertDialogTitle className="min-w-0 truncate text-[17px] font-semibold text-txt-primary">
            {t("calendar.print_title")}
          </AlertDialogTitle>
          <button
            aria-label={t("common.close")}
            className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-txt-muted transition-colors hover:bg-[var(--aster-hover)] hover:text-txt-primary"
            data-testid="calendar-print-close"
            type="button"
            onClick={on_cancel}
          >
            <XMarkIcon aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-1"
          style={{ scrollbarWidth: "thin" }}
        >
          <div className="flex min-w-0 flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_296px] md:gap-5">
            <div className="min-w-0">
              {preview_options && (
                <PrintPreview
                  options={preview_options}
                  title={t("calendar.print_preview")}
                />
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <ChoiceGroup
                label={t("calendar.print_layout")}
                name="calendar-print-layout"
                options={layout_options}
                value={layout}
                on_change={set_layout}
              />
              <ChoiceGroup
                label={t("calendar.print_orientation")}
                name="calendar-print-orientation"
                options={orientation_options}
                value={orientation}
                on_change={set_orientation}
              />

              <div className="overflow-hidden rounded-[var(--aster-radius-control,12px)] bg-[var(--aster-field-bg)]">
                <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3.5 py-2">
                  <span className="min-w-0 text-[13px] font-medium text-txt-primary">
                    {t("calendar.print_show_declined")}
                  </span>
                  <Switch
                    aria-label={t("calendar.print_show_declined")}
                    checked={show_declined}
                    data-testid="calendar-print-show-declined"
                    size="sm"
                    onCheckedChange={set_show_declined}
                  />
                </label>
                <div className="border-t border-[var(--aster-floating-divider)] px-3.5 py-2.5">
                  <p className="text-[13px] font-medium text-txt-primary">
                    {t("calendar.print_date_range")}
                  </p>
                  <p
                    className="mt-0.5 break-words text-[13px] text-txt-secondary"
                    data-testid="calendar-print-range"
                  >
                    {range_label}
                  </p>
                  <AlertDialogDescription className="mt-1 text-[12px] leading-snug text-txt-muted">
                    {t("calendar.print_date_range_hint")}
                  </AlertDialogDescription>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2 px-5 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-4">
          <Button
            className="max-sm:flex-1"
            size="md"
            variant="ghost"
            onClick={on_cancel}
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="max-sm:flex-1"
            data-testid="calendar-print-confirm"
            size="md"
            variant="depth"
            onClick={() => on_confirm(settings)}
          >
            {t("calendar.print_action")}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
