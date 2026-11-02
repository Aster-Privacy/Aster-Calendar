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

import { EVENT_COLOR_OPTIONS } from "@/components/calendar/calendar_utils";

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

  const event_calendar = calendars?.find(
    (calendar) => calendar.id === event.calendar_id,
  );
  const targets = (calendars ?? []).filter(
    (calendar) => calendar.id !== event.calendar_id,
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className={CONTENT_CLASS} collisionPadding={8}>
        <ContextMenuItem onSelect={() => actions.on_open(event)}>
          <ArrowTopRightOnSquareIcon aria-hidden="true" />
          <span>{t("calendar.menu_open")}</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.on_edit(event)}>
          <PencilSquareIcon aria-hidden="true" />
          <span>{t("common.edit")}</span>
          <span aria-hidden="true" className={SHORTCUT_CLASS}>
            E
          </span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.on_duplicate(event)}>
          <Square2StackIcon aria-hidden="true" />
          <span>{t("calendar.menu_duplicate")}</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.on_copy_link(event)}>
          <LinkIcon aria-hidden="true" />
          <span>{t("calendar.menu_copy_link")}</span>
        </ContextMenuItem>
        {event.event_kind === "task" && (
          <ContextMenuItem onSelect={() => actions.on_toggle_task_done(event)}>
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
            <span className="flex-1 truncate">{t("calendar.event_color")}</span>
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
            <ContextMenuItem onSelect={() => actions.on_set_color(event, null)}>
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: event_calendar?.color }}
              />
              <span className="truncate">
                {t("calendar.color_calendar_default")}
              </span>
              {event.color === null && (
                <CheckIcon
                  aria-hidden="true"
                  className="ms-auto text-[var(--calendar_accent_text,var(--accent-color))]"
                />
              )}
            </ContextMenuItem>
            {EVENT_COLOR_OPTIONS.map((option) => (
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
                {event.color === option.hex && (
                  <CheckIcon
                    aria-hidden="true"
                    className="ms-auto text-[var(--calendar_accent_text,var(--accent-color))]"
                  />
                )}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

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
      </ContextMenuContent>
    </ContextMenu>
  );
}
