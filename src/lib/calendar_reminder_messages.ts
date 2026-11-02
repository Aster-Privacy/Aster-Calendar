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

export const BACKGROUND_REMINDERS_SET = "CALENDAR_REMINDERS_SET";
export const BACKGROUND_REMINDERS_CLEAR = "CALENDAR_REMINDERS_CLEAR";
export const BACKGROUND_REMINDER_FIRED = "CALENDAR_REMINDER_FIRED";
export const BACKGROUND_REMINDER_SHOWN = "aster_calendar_reminder_shown";
export const CALENDAR_NOTIFICATION_TAG_PREFIX = "aster-calendar-";

export interface BackgroundReminder {
  key: string;
  title: string;
  body: string;
  fire_at: number;
}

export function is_background_reminder(
  value: unknown,
): value is BackgroundReminder {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BackgroundReminder>;

  return (
    typeof candidate.key === "string" &&
    candidate.key.length > 0 &&
    typeof candidate.title === "string" &&
    typeof candidate.body === "string" &&
    typeof candidate.fire_at === "number" &&
    Number.isFinite(candidate.fire_at)
  );
}
