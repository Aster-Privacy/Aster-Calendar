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
import type {
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";
import type { ReactNode } from "react";

import { useRef, useState } from "react";

import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  CheckIcon,
  FolderArrowDownIcon,
  LinkIcon,
  PaintBrushIcon,
  PencilSquareIcon,
  Square2StackIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import {
  default_event_color,
  normalize_event_color,
  PICKER_COLOR_OPTIONS,
  selected_event_color_name,
} from "@/components/calendar/calendar_utils";
import {
  AnchoredColorWheel,
  ColorWheelAnchor,
  CustomColorDot,
} from "@/components/ui/color_wheel";
import { is_read_only_event } from "@/services/calendar/display_colors";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context_menu";

export interface CalendarEventMenuActions {
  on_copy_link: (event: DecryptedCalendarEvent) => void;
  on_delete_request: (event: DecryptedCalendarEvent) => void;
  on_duplicate: (event: DecryptedCalendarEvent) => void;
  on_edit: (event: DecryptedCalendarEvent) => void;
  on_move_to_calendar: (
    event: DecryptedCalendarEvent,
    calendar_id: string,
  ) => void;
  on_open: (event: DecryptedCalendarEvent) => void;
  on_set_color: (event: DecryptedCalendarEvent, color: string | null) => void;
  on_toggle_task_done: (event: DecryptedCalendarEvent) => void;
  read_only_color?: (event: DecryptedCalendarEvent) => ReadOnlyEventColor;
}

export interface ReadOnlyEventColor {
  override: string | null;
  fallback: string;
}

interface CalendarEventContextMenuProps {
  actions?: CalendarEventMenuActions;
  calendars?: DecryptedCalendar[];
  children: ReactNode;
  event: DecryptedCalendarEvent;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const CONTENT_CLASS = "w-56";
const SUB_CONTENT_CLASS = "w-52";
const SHORTCUT_CLASS =
  "ms-auto ps-3 text-xs font-medium tabular-nums text-current opacity-60";
const DESTRUCTIVE_CLASS =
  "text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400";

export function CalendarEventContextMenu({
  actions,
  calendars,
  children,
  event,
  t,
}: CalendarEventContextMenuProps) {
  if (!actions) {
    return <>{children}</>;
  }

  return (
    <EventContextMenuWithActions
      actions={actions}
      calendars={calendars}
      event={event}
      t={t}
    >
      {children}
    </EventContextMenuWithActions>
  );
}

function EventContextMenuWithActions({
  actions,
  calendars,
  children,
  event,
  t,
}: CalendarEventContextMenuProps & { actions: CalendarEventMenuActions }) {
  const [is_wheel_open, set_is_wheel_open] = useState(false);
  const wheel_pending_ref = useRef(false);
  const is_read_only = is_read_only_event(event);
  const read_only_color = is_read_only
    ? actions.read_only_color?.(event)
    : undefined;
  const event_calendar = calendars?.find(
    (calendar) => calendar.id === event.calendar_id,
  );
  const default_color = read_only_color
    ? read_only_color.fallback
    : default_event_color(event.event_kind, event_calendar?.color);
  const chosen_color = is_read_only
    ? (read_only_color?.override ?? null)
    : event.color;
  const selected_color_name = selected_event_color_name(chosen_color);
  const is_custom_color = chosen_color !== null && selected_color_name === null;
  const targets = is_read_only
    ? []
    : (calendars ?? []).filter((calendar) => calendar.id !== event.calendar_id);

  return (
    <AnchoredColorWheel
      default_color={normalize_event_color(default_color) ?? undefined}
      open={is_wheel_open}
      value={is_custom_color ? chosen_color : null}
      on_close={() => set_is_wheel_open(false)}
      on_commit={(hex) => actions.on_set_color(event, hex)}
    >
      <ContextMenu>
        <ColorWheelAnchor asChild>
          <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        </ColorWheelAnchor>
        <ContextMenuContent
          className={CONTENT_CLASS}
          collisionPadding={8}
          onCloseAutoFocus={(focus_event) => {
            if (!wheel_pending_ref.current) {
              return;
            }

            focus_event.preventDefault();
            wheel_pending_ref.current = false;
            set_is_wheel_open(true);
          }}
        >
          <ContextMenuItem onSelect={() => actions.on_open(event)}>
            <ArrowTopRightOnSquareIcon aria-hidden="true" />
            <span>{t("calendar.menu_open")}</span>
          </ContextMenuItem>
          {!is_read_only && (
            <ContextMenuItem onSelect={() => actions.on_edit(event)}>
              <PencilSquareIcon aria-hidden="true" />
              <span>{t("common.edit")}</span>
              <span aria-hidden="true" className={SHORTCUT_CLASS}>
                E
              </span>
            </ContextMenuItem>
          )}
          <ContextMenuItem onSelect={() => actions.on_duplicate(event)}>
            <Square2StackIcon aria-hidden="true" />
            <span>{t("calendar.menu_duplicate")}</span>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => actions.on_copy_link(event)}>
            <LinkIcon aria-hidden="true" />
            <span>{t("calendar.menu_copy_link")}</span>
          </ContextMenuItem>
          {event.event_kind === "task" && (
            <ContextMenuItem
              onSelect={() => actions.on_toggle_task_done(event)}
            >
              <CheckCircleIcon aria-hidden="true" />
              <span>
                {event.is_completed
                  ? t("calendar.mark_not_done")
                  : t("calendar.mark_done")}
              </span>
            </ContextMenuItem>
          )}

          {targets.length > 0 && (
            <>
              <ContextMenuSeparator />
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <FolderArrowDownIcon aria-hidden="true" />
                  <span>{t("calendar.menu_move_to")}</span>
                </ContextMenuSubTrigger>
                <ContextMenuSubContent
                  className={SUB_CONTENT_CLASS}
                  collisionPadding={8}
                >
                  {targets.map((calendar) => (
                    <ContextMenuItem
                      key={calendar.id}
                      onSelect={() =>
                        actions.on_move_to_calendar(event, calendar.id)
                      }
                    >
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: calendar.color }}
                      />
                      <span className="truncate">{calendar.name}</span>
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            </>
          )}

          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <PaintBrushIcon aria-hidden="true" />
              <span className="flex-1 truncate">
                {t("calendar.event_color")}
              </span>
              {event.color && (
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: event.color }}
                />
              )}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent
              className={SUB_CONTENT_CLASS}
              collisionPadding={8}
            >
              <ContextMenuItem
                onSelect={() => actions.on_set_color(event, null)}
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: default_color }}
                />
                <span className="truncate">
                  {t("calendar.color_calendar_default")}
                </span>
                {chosen_color === null && (
                  <CheckIcon
                    aria-hidden="true"
                    className="ms-auto text-[var(--calendar_accent_text,var(--accent-color))]"
                  />
                )}
              </ContextMenuItem>
              {PICKER_COLOR_OPTIONS.map((option) => (
                <ContextMenuItem
                  key={option.hex}
                  onSelect={() => actions.on_set_color(event, option.hex)}
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: option.hex }}
                  />
                  <span className="truncate">{t(option.name_key)}</span>
                  {selected_color_name === option.name && (
                    <CheckIcon
                      aria-hidden="true"
                      className="ms-auto text-[var(--calendar_accent_text,var(--accent-color))]"
                    />
                  )}
                </ContextMenuItem>
              ))}
              <ContextMenuItem
                onSelect={() => {
                  wheel_pending_ref.current = true;
                }}
              >
                <CustomColorDot
                  className="h-2.5 w-2.5"
                  color={is_custom_color ? chosen_color : null}
                />
                <span className="truncate">{t("common.custom_color")}</span>
                {is_custom_color && (
                  <CheckIcon
                    aria-hidden="true"
                    className="ms-auto text-[var(--calendar_accent_text,var(--accent-color))]"
                  />
                )}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          {!is_read_only && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                className={DESTRUCTIVE_CLASS}
                onSelect={() => actions.on_delete_request(event)}
              >
                <TrashIcon aria-hidden="true" />
                <span>{t("common.delete")}</span>
                <span aria-hidden="true" className={SHORTCUT_CLASS}>
                  Del
                </span>
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </AnchoredColorWheel>
  );
}
