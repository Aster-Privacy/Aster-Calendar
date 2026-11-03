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
import { DatedCalendarImage } from "@/components/icons/dated_calendar_image";

interface DatedCalendarLogoProps {
  alt: string;
  className: string;
  align?: "start" | "center";
}

export function DatedCalendarLogo({
  alt,
  className,
  align = "start",
}: DatedCalendarLogoProps) {
  return (
    <>
      <DatedCalendarImage
        align={align}
        alt={alt}
        className={`${className} dark:hidden`}
        fallback={
          <img
            alt={alt}
            className={`${className} dark:hidden`}
            decoding="async"
            draggable={false}
            src="/aster_calendar_logo_31_light.png"
          />
        }
        kind="logo_light"
      />
      <DatedCalendarImage
        align={align}
        alt={alt}
        className={`${className} hidden dark:block`}
        fallback={
          <img
            alt={alt}
            className={`${className} hidden dark:block`}
            decoding="async"
            draggable={false}
            src="/aster_calendar_logo_31_dark.png"
          />
        }
        kind="logo_dark"
      />
    </>
  );
}
