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
  ConflictVersion,
  SyncConflict,
} from "@/services/calendar/mutation_queue";

import { useState } from "react";
import { Button, ButtonSpinner, IslandDivider } from "@aster/ui";

import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";
import { calendar_mutation_queue } from "@/services/calendar/mutation_queue";
import { app_hour12 } from "@/utils/date_format";

interface CalendarConflictDialogProps {
  conflicts: SyncConflict[];
  language: string;
}

function format_conflict_time(
  version: ConflictVersion,
  language: string,
): string {
  if (!version.starts_at) {
    return "";
  }

  const starts = new Date(version.starts_at);
  const ends = new Date(version.ends_at ?? Number.NaN);

  if (Number.isNaN(starts.getTime())) {
    return "";
  }

  if (version.is_all_day) {
    return new Intl.DateTimeFormat(language, {
      day: "numeric",
      month: "short",
    }).format(starts);
  }

  const day_formatter = new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: app_hour12(),
  });
  const time_formatter = new Intl.DateTimeFormat(language, {
    hour: "numeric",
    minute: "2-digit",
    hour12: app_hour12(),
  });
  const same_day =
    !Number.isNaN(ends.getTime()) &&
    starts.toDateString() === ends.toDateString();

  return same_day
    ? `${day_formatter.format(starts)} - ${time_formatter.format(ends)}`
    : day_formatter.format(starts);
}

interface ConflictVersionCardProps {
  label: string;
  version: ConflictVersion;
  language: string;
  deleted_label: string;
  untitled_label: string;
  unreadable_label: string;
  all_day_label: string;
}

function ConflictVersionCard({
  label,
  version,
  language,
  deleted_label,
  untitled_label,
  unreadable_label,
  all_day_label,
}: ConflictVersionCardProps) {
  const time = format_conflict_time(version, language);

  return (
    <div className="flex w-full flex-col items-start gap-0.5 px-4 py-2 text-sm">
      <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-txt-muted">
        {label}
      </span>
      {version.deleted ? (
        <span className="text-sm text-txt-secondary">{deleted_label}</span>
      ) : version.unreadable ? (
        <span className="text-sm text-txt-secondary">{unreadable_label}</span>
      ) : (
        <>
          <span className="w-full truncate text-sm font-medium text-txt-primary">
            {version.title.trim() || untitled_label}
          </span>
          <span className="text-xs tabular-nums text-txt-muted">
            {version.is_all_day && time ? `${time}, ${all_day_label}` : time}
          </span>
        </>
      )}
    </div>
  );
}

export function CalendarConflictDialog({
  conflicts,
  language,
}: CalendarConflictDialogProps) {
  const { t } = use_i18n();
  const [busy_id, set_busy_id] = useState<string | null>(null);
  const conflict = conflicts[0] ?? null;
  const remaining = Math.max(conflicts.length - 1, 0);
  const is_busy = conflict !== null && busy_id === conflict.id;

  const resolve = async (choice: "keep_mine" | "use_theirs") => {
    if (!conflict) {
      return;
    }

    set_busy_id(conflict.id);

    try {
      await calendar_mutation_queue.resolve_conflict(conflict.id, choice);
    } finally {
      set_busy_id(null);
    }
  };

  return (
    <Modal is_open={conflict !== null} on_close={() => {}} size="sm">
      <ModalHeader>
        <ModalTitle>
          {t(
            conflict?.target === "calendar"
              ? "calendar.sync_conflict_calendar_title"
              : "calendar.sync_conflict_title",
          )}
        </ModalTitle>
      </ModalHeader>
      <ModalBody>
        {conflict && (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-snug text-txt-secondary">
              {t("calendar.sync_conflict_description")}
            </p>
            <div
              className="aster_island overflow-hidden py-1"
              data-testid="calendar-conflict-versions"
            >
              <ConflictVersionCard
                all_day_label={t("calendar.all_day")}
                deleted_label={t("calendar.sync_conflict_deleted")}
                label={t("calendar.sync_conflict_mine")}
                language={language}
                unreadable_label={t("calendar.sync_conflict_unreadable")}
                untitled_label={t("calendar.untitled_event")}
                version={conflict.local}
              />
              <IslandDivider />
              <ConflictVersionCard
                all_day_label={t("calendar.all_day")}
                deleted_label={t("calendar.sync_conflict_deleted")}
                label={t("calendar.sync_conflict_theirs")}
                language={language}
                unreadable_label={t("calendar.sync_conflict_unreadable")}
                untitled_label={t("calendar.untitled_event")}
                version={conflict.server}
              />
            </div>
            {remaining > 0 && (
              <p className="text-xs text-txt-muted">
                {t("calendar.sync_conflict_remaining", { count: remaining })}
              </p>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter className="flex items-center justify-end gap-2">
        <Button
          data-testid="calendar-conflict-use-theirs"
          disabled={is_busy}
          size="md"
          type="button"
          variant="ghost"
          onClick={() => void resolve("use_theirs")}
        >
          {t("calendar.sync_conflict_use_theirs")}
        </Button>
        <Button
          data-testid="calendar-conflict-keep-mine"
          disabled={is_busy}
          size="md"
          type="button"
          variant="depth"
          onClick={() => void resolve("keep_mine")}
        >
          {t("calendar.sync_conflict_keep_mine")}
          {is_busy && <ButtonSpinner />}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
