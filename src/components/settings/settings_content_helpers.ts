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
import type * as React from "react";
import type { TranslationKey } from "@/lib/i18n";

import {
  BuildingOffice2Icon,
  SwatchIcon,
  ShieldCheckIcon,
  CreditCardIcon,
  ChatBubbleBottomCenterTextIcon,
  CircleStackIcon,
  UserGroupIcon,
  ArrowUpTrayIcon,
  BellAlertIcon,
  CalendarDaysIcon,
  ClockIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";

import {
  read_last_settings_section,
  write_last_settings_section,
} from "@/lib/settings_section_store";
import { is_onion_host } from "@/lib/onion_host";

export type SettingsSection =
  | "account"
  | "appearance"
  | "accessibility"
  | "security"
  | "trusted_devices"
  | "billing"
  | "storage"
  | "family"
  | "referral"
  | "feedback"
  | "updates"
  | "calendar_views"
  | "calendar_events"
  | "calendar_notifications"
  | "calendar_import_export"
  | "calendar_calendars";

export type Section = SettingsSection;

export const SETTINGS_SECTION_IDS: SettingsSection[] = [
  "appearance",
  "account",
  "security",
  "storage",
  "billing",
  "referral",
  "feedback",
  "calendar_views",
  "calendar_events",
  "calendar_notifications",
  "calendar_import_export",
  "calendar_calendars",
];

export function is_settings_section(value: string): value is SettingsSection {
  return (SETTINGS_SECTION_IDS as string[]).includes(value);
}

const SECTION_ALIASES: Record<string, SettingsSection> = {
  storage_addons: "storage",
  credits: "billing",
  connection: "security",
  plans: "billing",
  subscription: "billing",
  about: "feedback",
  help: "feedback",
  import: "calendar_import_export",
  export: "calendar_import_export",
  notifications: "calendar_notifications",
  calendars: "calendar_calendars",
};

const SECTION_TAB_ALIASES: Record<
  string,
  { section: SettingsSection; tab: string }
> = {
  accessibility: { section: "appearance", tab: "accessibility" },
  trusted_devices: { section: "security", tab: "trusted_devices" },
  family: { section: "billing", tab: "family" },
  updates: { section: "feedback", tab: "updates" },
};

export interface SettingsTabAvailability {
  show_updates: boolean;
  is_family_plan: boolean;
  has_devices: boolean;
}

export function is_settings_tab_available(
  tab: string | undefined,
  availability: SettingsTabAvailability,
): boolean {
  if (tab === "updates") return availability.show_updates;
  if (tab === "family") return availability.is_family_plan;
  if (tab === "trusted_devices") return availability.has_devices;

  return true;
}

export const SETTINGS_TAB_EVENT = "astermail:settings-tab";

let pending_settings_tab: string | null = null;

export function request_settings_tab(tab: string) {
  pending_settings_tab = tab;

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SETTINGS_TAB_EVENT, { detail: tab }));
  }
}

export function consume_settings_tab(): string | null {
  const tab = pending_settings_tab;

  pending_settings_tab = null;

  return tab;
}

export interface NavTarget {
  section: SettingsSection;
  tab?: string;
}

export function resolve_nav_target(candidate: string): NavTarget {
  if (is_settings_section(candidate)) return { section: candidate };

  const tab_alias = SECTION_TAB_ALIASES[candidate];

  if (tab_alias) return { section: tab_alias.section, tab: tab_alias.tab };

  const alias = SECTION_ALIASES[candidate];

  return { section: alias ?? (candidate as SettingsSection) };
}

export function resolve_settings_section(
  candidate: string | null | undefined,
): SettingsSection | undefined {
  if (!candidate) return undefined;
  const key = candidate.trim();

  if (is_settings_section(key)) return key;

  const tab_alias = SECTION_TAB_ALIASES[key];

  if (tab_alias) {
    request_settings_tab(tab_alias.tab);

    return tab_alias.section;
  }

  return SECTION_ALIASES[key];
}

export interface SettingsContentProps {
  section?: Section;
  on_section_change: (section: Section, replace?: boolean) => void;
  on_close: () => void;
  variant?: "page" | "popup";
}

let persisted_section: Section | null = null;

export function get_persisted_section(): Section | null {
  if (persisted_section) return persisted_section;

  const stored = read_last_settings_section();
  const resolved = stored ? resolve_settings_section(stored) : undefined;

  if (resolved) {
    persisted_section = resolved;
  }

  return persisted_section;
}

export function set_persisted_section(section: Section) {
  persisted_section = section;
  write_last_settings_section(section);
}

export interface NavItem {
  id: Section;
  label: string;
  icon: React.ElementType;
  keywords: string[];
  description: string;
}

export interface NavGroup {
  id: "general" | "security" | "billing" | "calendar" | "help";
  label: string;
  items: NavItem[];
}

export type NavItems = NavGroup[];

export function flatten_nav_items(groups: NavItems): NavItem[] {
  return groups.flatMap((group) => group.items);
}

export function get_nav_items(
  t: (key: TranslationKey) => string,
  is_family_plan?: boolean,
): NavItems {
  const on_onion = is_onion_host();

  const general: NavItem[] = [
    {
      id: "appearance",
      label: t("settings.appearance"),
      icon: SwatchIcon,
      description:
        "Theme, color scheme, language, date format, layout density, and accessibility",
      keywords: [
        "theme",
        "dark mode",
        "light mode",
        "system theme",
        "color",
        "layout",
        "compact",
        "density",
        "font",
        "language",
        "locale",
        "time format",
        "date format",
        "24 hour",
        "12 hour",
        "clock",
        "timezone",
        "accessibility",
        "font size",
        "text size",
        "reduce motion",
        "animations",
        "focus ring",
        "keyboard navigation",
        "screen reader",
        "high contrast",
        "dyslexia",
      ],
    },
    {
      id: "account",
      label: t("settings.account"),
      icon: BuildingOffice2Icon,
      description:
        "Display name, profile photo, recovery email, and account deletion",
      keywords: [
        "profile",
        "display name",
        "username",
        "avatar",
        "photo",
        "profile picture",
        "change name",
        "recovery email",
        "inactivity timeout",
        "auto logout",
        "delete account",
        "close account",
        "deactivate",
      ],
    },
    {
      id: "security",
      label: t("settings.security"),
      icon: ShieldCheckIcon,
      description:
        "Password, two-factor authentication, passkeys, and trusted devices",
      keywords: [
        "password",
        "change password",
        "2fa",
        "two factor",
        "two-factor authentication",
        "totp",
        "authenticator app",
        "google authenticator",
        "passkey",
        "hardware key",
        "yubikey",
        "fido",
        "webauthn",
        "biometric",
        "face id",
        "touch id",
        "backup codes",
        "recovery codes",
        "login history",
        "sign out all devices",
        "active sessions",
        "security checkup",
        "trusted devices",
        "my devices",
        "desktop app",
        "mobile app",
        "paired device",
        "revoke access",
        "sign out device",
        "remove device",
        "connection",
        "connection method",
        "direct connection",
        "cdn relay",
        "relay",
        "tor",
        "onion",
        "network",
        "vanguard",
      ],
    },
    ...(!on_onion
      ? [
          {
            id: "storage" as Section,
            label: t("settings.storage"),
            icon: CircleStackIcon,
            description:
              "Storage usage by category, cleanup tools, and storage add-ons",
            keywords: [
              "storage",
              "space",
              "quota",
              "usage",
              "disk",
              "gb",
              "tb",
              "full",
              "storage addon",
              "add storage",
              "buy storage",
              "free up space",
            ],
          },
        ]
      : []),
    {
      id: "billing" as Section,
      label: t("settings.billing"),
      icon: CreditCardIcon,
      description:
        "Subscription plan, payment methods, invoices, family members, and referrals",
      keywords: [
        "plan",
        "subscription",
        "upgrade plan",
        "downgrade plan",
        "payment method",
        "credit card",
        "invoice",
        "billing history",
        "storage addon",
        "add storage",
        "star plan",
        "supernova plan",
        "cancel subscription",
        "renew",
        "price",
        ...(is_family_plan
          ? [
              "family plan",
              "family members",
              "invite member",
              "children accounts",
              "child account",
              "manage family",
            ]
          : []),
      ],
    },
    ...(!on_onion
      ? [
          {
            id: "referral" as Section,
            label: t("settings.invite_friends"),
            icon: UserGroupIcon,
            description:
              "Your invite link, referral rewards, and affiliate payouts",
            keywords: [
              "referral",
              "refer a friend",
              "invite friend",
              "invite friends",
              "referral code",
              "invite link",
              "reward",
              "share invite",
              "affiliate",
              "payout",
            ],
          },
        ]
      : []),
  ];

  const help: NavItem[] = [
    {
      id: "feedback",
      label: t("common.help"),
      icon: ChatBubbleBottomCenterTextIcon,
      description:
        "Report bugs, request features, and check for app updates",
      keywords: [
        "feedback",
        "report bug",
        "bug report",
        "feature request",
        "contact support",
        "help",
        "get help",
        "support ticket",
        "send feedback",
        "about",
        "app version",
        "update",
        "check for updates",
        "auto update",
        "release notes",
      ],
    },
  ];

  const calendar: NavItem[] = [
    {
      id: "calendar_views",
      label: t("calendar.settings_views"),
      icon: CalendarDaysIcon,
      description: t("calendar.settings_views_desc"),
      keywords: [
        "calendar view",
        "default view",
        "week start",
        "monday",
        "sunday",
        "weekend",
        "week number",
        "working hours",
        "day starts",
        "day ends",
        "grid",
      ],
    },
    {
      id: "calendar_events",
      label: t("calendar.settings_events"),
      icon: ClockIcon,
      description: t("calendar.settings_events_desc"),
      keywords: [
        "event duration",
        "default duration",
        "reminder",
        "default reminder",
        "default calendar",
        "new event",
      ],
    },
    {
      id: "calendar_notifications",
      label: t("calendar.settings_notifications"),
      icon: BellAlertIcon,
      description: t("calendar.settings_notifications_desc"),
      keywords: [
        "notification",
        "alert",
        "desktop notification",
        "sound",
        "reminder",
        "keyboard shortcut",
        "shortcuts",
      ],
    },
    {
      id: "calendar_import_export",
      label: t("calendar.settings_import_export"),
      icon: ArrowUpTrayIcon,
      description: t("calendar.settings_import_export_desc"),
      keywords: [
        "import",
        "export",
        "ics",
        "icalendar",
        "backup",
        "download",
        "upload",
      ],
    },
    {
      id: "calendar_calendars",
      label: t("calendar.settings_calendars"),
      icon: Squares2X2Icon,
      description: t("calendar.settings_calendars_desc"),
      keywords: [
        "calendars",
        "my calendars",
        "hide calendar",
        "show calendar",
        "visibility",
      ],
    },
  ];

  const pick = (ids: Section[]): NavItem[] =>
    ids
      .map((id) => general.find((item) => item.id === id))
      .filter((item): item is NavItem => Boolean(item));

  return [
    {
      id: "general",
      label: t("settings.general"),
      items: pick(["appearance", "account"]),
    },
    {
      id: "security",
      label: t("settings.security"),
      items: pick(["security"]),
    },
    {
      id: "billing",
      label: t("settings.billing"),
      items: pick(["storage", "billing", "referral"]),
    },
    { id: "calendar", label: t("calendar.settings_group"), items: calendar },
    { id: "help", label: t("common.help"), items: help },
  ].filter((group): group is NavGroup => group.items.length > 0);
}
