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
import type { ComponentProps } from "react";

import {
  ArrowDownTrayIcon,
  CalendarDaysIcon,
  CalendarIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

type IllustrationProps = ComponentProps<typeof CalendarIcon>;

const ICON_CLASS = "h-12 w-12 text-txt-muted";
const ICON_STROKE = 1.25;

function icon_props({ className, ...props }: IllustrationProps) {
  return {
    "aria-hidden": true,
    className: className ?? ICON_CLASS,
    strokeWidth: ICON_STROKE,
    ...props,
  };
}

export function EmptyRangeIllustration(props: IllustrationProps) {
  return <CalendarIcon {...icon_props(props)} />;
}

export function EmptyScheduleIllustration(props: IllustrationProps) {
  return <CalendarDaysIcon {...icon_props(props)} />;
}

export function NoResultsIllustration(props: IllustrationProps) {
  return <MagnifyingGlassIcon {...icon_props(props)} />;
}

export function EmptyTrashIllustration(props: IllustrationProps) {
  return <TrashIcon {...icon_props(props)} />;
}

export function NoCalendarsIllustration(props: IllustrationProps) {
  return <CalendarIcon {...icon_props(props)} />;
}

export function ImportNothingIllustration(props: IllustrationProps) {
  return <ArrowDownTrayIcon {...icon_props(props)} />;
}

export function DecryptFailureIllustration(props: IllustrationProps) {
  return <ExclamationTriangleIcon {...icon_props(props)} />;
}
