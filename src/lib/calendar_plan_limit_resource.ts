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
const CALENDAR_LIMIT_RESOURCES: ReadonlyArray<readonly [string, string]> = [
  ["/calendar/v1/calendars", "calendars"],
  ["/calendar/v1/schedules", "booking pages"],
];

export function calendar_plan_limit_resource(endpoint: string): string | null {
  const path = endpoint.split(/[?#]/)[0].replace(/\/+$/, "");

  for (const [prefix, resource] of CALENDAR_LIMIT_RESOURCES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return resource;
  }

  return null;
}
