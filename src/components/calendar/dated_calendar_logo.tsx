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
import { use_dated_calendar_icon } from "@/lib/dated_calendar_icon";

interface DatedCalendarLogoProps {
  alt: string;
  className: string;
}

export function DatedCalendarLogo({ alt, className }: DatedCalendarLogoProps) {
  const light_src = use_dated_calendar_icon("logo_light");
  const dark_src = use_dated_calendar_icon("logo_dark");

  return (
    <>
      <img
        alt={alt}
        className={`${className} dark:hidden`}
        decoding="async"
        draggable={false}
        src={light_src}
      />
      <img
        alt={alt}
        className={`${className} hidden dark:block`}
        decoding="async"
        draggable={false}
        src={dark_src}
      />
    </>
  );
}
