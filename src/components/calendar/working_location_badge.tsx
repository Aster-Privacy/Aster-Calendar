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
  DayWorkingLocation,
  UsualLocation,
} from "@/services/calendar/working_location";

import {
  BuildingOffice2Icon,
  CheckIcon,
  HomeIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { show_toast } from "@/components/toast/simple_toast";

type TranslateFn = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export type WorkingLocationAction = "office" | "home" | "other" | "reset";

export interface WorkingLocationMenuItem {
  action: WorkingLocationAction;
  label: string;
  is_active: boolean;
}

export interface WorkingLocationHandlers {
  resolve: (day: Date) => DayWorkingLocation | null;
  usual_for: (day: Date) => UsualLocation;
  can_reset: (day: Date) => boolean;
  on_set: (day: Date, location: "office" | "home") => Promise<void>;
  on_reset: (day: Date) => Promise<void>;
  on_other: (day: Date) => void;
}

const LOCATION_LABELS = {
  office: "calendar.working_location_office",
  home: "calendar.working_location_home",
  other: "calendar.working_location_other",
} as const;

function location_name(resolution: DayWorkingLocation, t: TranslateFn): string {
  if (resolution.location === "other" && resolution.place) {
    return resolution.place;
  }

  return t(LOCATION_LABELS[resolution.location]);
}

export function working_location_label(
  resolution: DayWorkingLocation | null,
  t: TranslateFn,
): string {
  if (!resolution) {
    return t("calendar.working_location_set");
  }

  return t(
    resolution.source === "usual"
      ? "calendar.working_location_usual_for_day"
      : "calendar.working_location_for_day",
    { location: location_name(resolution, t) },
  );
}

export function working_location_menu(
  resolution: DayWorkingLocation | null,
  usual: UsualLocation,
  t: TranslateFn,
  can_reset = true,
): WorkingLocationMenuItem[] {
  const current = resolution?.location ?? null;
  const items: WorkingLocationMenuItem[] = [
    {
      action: "office",
      label: t("calendar.working_location_office"),
      is_active: current === "office",
    },
    {
      action: "home",
      label: t("calendar.working_location_home"),
      is_active: current === "home",
    },
    {
      action: "other",
      label: t("calendar.working_location_other_place"),
      is_active: current === "other",
    },
  ];

  if (resolution?.source === "event" && can_reset) {
    items.push({
      action: "reset",
      label: usual
        ? t("calendar.working_location_use_usual", {
            location: t(LOCATION_LABELS[usual]),
          })
        : t("calendar.working_location_clear"),
      is_active: false,
    });
  }

  return items;
}

function LocationIcon({
  location,
  className,
}: {
  location: DayWorkingLocation["location"] | null;
  className: string;
}) {
  if (location === "home") {
    return <HomeIcon aria-hidden="true" className={className} />;
  }

  if (location === "other") {
    return <MapPinIcon aria-hidden="true" className={className} />;
  }

  return <BuildingOffice2Icon aria-hidden="true" className={className} />;
}

interface WorkingLocationBadgeProps {
  t: TranslateFn;
  day: Date;
  handlers: WorkingLocationHandlers;
  variant: "header" | "cell";
}

export function WorkingLocationBadge({
  t,
  day,
  handlers,
  variant,
}: WorkingLocationBadgeProps) {
  const resolution = handlers.resolve(day);
  const usual = handlers.usual_for(day);
  const label = working_location_label(resolution, t);
  const items = working_location_menu(
    resolution,
    usual,
    t,
    handlers.can_reset(day),
  );
  const is_empty = resolution === null;
  const size = variant === "header" ? "h-6 w-6" : "h-5 w-5";
  const icon_size = variant === "header" ? "h-3.5 w-3.5" : "h-3 w-3";

  const run = (action: WorkingLocationAction) => {
    if (action === "other") {
      handlers.on_other(day);

      return;
    }

    const pending =
      action === "reset"
        ? handlers.on_reset(day)
        : handlers.on_set(day, action);

    pending.catch(() => {
      show_toast(t("calendar.event_save_failed"), "error");
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={label}
          className={`inline-flex ${size} flex-shrink-0 items-center justify-center rounded-full transition-[opacity,background-color] duration-150 ease-out hover:bg-[var(--aster-hover)] focus:outline-none focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-color)] data-[state=open]:opacity-100 ${
            is_empty
              ? "opacity-0 group-hover/working:opacity-60 max-sm:hidden"
              : ""
          }`}
          data-testid="working-location-badge"
          style={{
            color:
              resolution?.source === "event"
                ? "var(--text-secondary)"
                : "var(--text-muted)",
          }}
          title={label}
          type="button"
          onClick={(clicked) => clicked.stopPropagation()}
          onDoubleClick={(clicked) => clicked.stopPropagation()}
        >
          <LocationIcon
            className={icon_size}
            location={resolution?.location ?? null}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 p-1"
        collisionPadding={8}
      >
        {items.map((item) => (
          <div key={item.action}>
            {item.action === "reset" && <DropdownMenuSeparator />}
            <DropdownMenuItem
              className={item.is_active ? "bg-[var(--aster-selected)]" : ""}
              onSelect={() => run(item.action)}
            >
              {item.action !== "reset" && (
                <LocationIcon
                  className="me-2 h-4 w-4 text-[var(--icon-secondary)]"
                  location={item.action}
                />
              )}
              <span className={`flex-1 ${item.is_active ? "font-medium" : ""}`}>
                {item.label}
              </span>
              {item.is_active && (
                <CheckIcon
                  aria-hidden="true"
                  className="ms-2 h-4 w-4 text-[var(--accent-color)]"
                />
              )}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
