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
export interface CalendarPlanLimits {
  calendars: number;
  booking_pages: number;
  removes_branding: boolean;
}

const FREE_LIMITS: CalendarPlanLimits = {
  calendars: 3,
  booking_pages: 1,
  removes_branding: false,
};

const STAR_LIMITS: CalendarPlanLimits = {
  calendars: 25,
  booking_pages: 3,
  removes_branding: true,
};

const NOVA_LIMITS: CalendarPlanLimits = {
  calendars: 25,
  booking_pages: 10,
  removes_branding: true,
};

const SUPERNOVA_LIMITS: CalendarPlanLimits = {
  calendars: 50,
  booking_pages: 25,
  removes_branding: true,
};

const CALENDAR_PLAN_LIMITS: Record<string, CalendarPlanLimits> = {
  free: FREE_LIMITS,
  star: STAR_LIMITS,
  nova: NOVA_LIMITS,
  duo: NOVA_LIMITS,
  supernova: SUPERNOVA_LIMITS,
  family: SUPERNOVA_LIMITS,
};

export function calendar_plan_limits(
  plan_code: string | null | undefined,
): CalendarPlanLimits {
  return (plan_code && CALENDAR_PLAN_LIMITS[plan_code]) || FREE_LIMITS;
}
