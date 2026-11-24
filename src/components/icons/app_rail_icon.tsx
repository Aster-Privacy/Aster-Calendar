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
import { CalendarDaysIcon, UsersIcon } from "@heroicons/react/24/outline";

import { AsterSecurityMark } from "@/components/icons/aster_security_mark";

export type AppRailIconName = "calendar" | "contacts" | "security";

interface AppRailIconProps {
  name: AppRailIconName;
}

const ICON_CLASS = "app_rail_icon";

export function AppRailIcon({ name }: AppRailIconProps) {
  if (name === "calendar") {
    return <CalendarDaysIcon aria-hidden="true" className={ICON_CLASS} />;
  }

  if (name === "contacts") {
    return <UsersIcon aria-hidden="true" className={ICON_CLASS} />;
  }

  return <AsterSecurityMark className={ICON_CLASS} />;
}
