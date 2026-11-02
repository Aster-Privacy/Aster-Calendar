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
import type { CalendarEventKind } from "@/types/calendar";

import {
  BoltIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  MoonIcon,
} from "@heroicons/react/24/outline";

interface EventKindIconProps {
  kind: CalendarEventKind;
  className?: string;
}

export function EventKindIcon({ kind, className }: EventKindIconProps) {
  const shared = className ?? "h-3 w-3 flex-shrink-0";

  if (kind === "task") {
    return (
      <CheckCircleIcon
        aria-hidden="true"
        className={shared}
        strokeWidth={1.75}
      />
    );
  }

  if (kind === "out_of_office") {
    return <MoonIcon aria-hidden="true" className={shared} strokeWidth={1.75} />;
  }

  if (kind === "focus_time") {
    return <BoltIcon aria-hidden="true" className={shared} strokeWidth={1.75} />;
  }

  if (kind === "working_location") {
    return (
      <BuildingOffice2Icon
        aria-hidden="true"
        className={shared}
        strokeWidth={1.75}
      />
    );
  }

  return null;
}
