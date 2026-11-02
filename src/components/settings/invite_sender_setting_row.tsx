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
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { SettingControlRow } from "@aster/ui";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { use_invite_senders } from "@/components/calendar/use_invite_senders";
import { AliasNavIcon } from "@/components/common/alias_nav_icon";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { resolve_invite_sender } from "@/services/calendar/invite_sender";

const DEFAULT_VALUE = "__primary__";
const CONTROL_WIDTH = 220;
const AVATAR_SIZE = 24;
const ITEM_CLASS = "[&>span:last-child]:min-w-0 [&>span:last-child]:max-w-full";

function SenderOptionLabel({
  option,
  text,
}: {
  option: SenderOption | undefined;
  text: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {option?.type === "primary" ? (
        <ProfileAvatar
          email={option.email}
          name={
            option.display_name || option.email.split("@")[0] || option.email
          }
          size="xs"
        />
      ) : option ? (
        <AliasNavIcon
          address={option.email}
          is_random={option.is_random === true}
          profile_picture={option.profile_picture}
          size={AVATAR_SIZE}
        />
      ) : null}
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}

export function InviteSenderSettingRow() {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const saved =
    typeof preferences.calendar_default_invite_sender === "string"
      ? preferences.calendar_default_invite_sender.trim()
      : "";
  const senders = use_invite_senders([saved]);
  const resolution = resolve_invite_sender({
    options: senders.all_options,
    requested: saved,
    pending_domain_names: senders.pending_domain_names,
    loading: senders.loading,
  });
  const primary = senders.options.find((option) => option.type === "primary");
  const mail_default =
    senders.options.find(
      (option) =>
        option.type !== "primary" &&
        option.email === senders.mail_default_email,
    ) ?? null;
  const others = senders.options.filter(
    (option) => option.type !== "primary" || mail_default !== null,
  );
  const value =
    saved.length > 0 &&
    resolution.option &&
    (resolution.option.type !== "primary" || mail_default !== null)
      ? resolution.option.email
      : DEFAULT_VALUE;
  const label = t("calendar.settings_default_invite_sender");
  const fallback_email = primary?.email ?? "";
  const notice =
    resolution.issue === null || resolution.requested === null
      ? null
      : t(
          resolution.issue === "unverified_domain"
            ? "calendar.invite_from_unverified_notice"
            : "calendar.invite_from_unavailable_notice",
          { address: resolution.requested, fallback: fallback_email },
        );

  return (
    <SettingControlRow
      control={
        <Select
          disabled={senders.options.length === 0}
          value={value}
          onValueChange={(next) =>
            update_preference(
              "calendar_default_invite_sender",
              next === DEFAULT_VALUE ? "" : next,
            )
          }
        >
          <SelectTrigger aria-label={label} className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-w-[min(360px,calc(100vw-24px))]">
            <SelectItem className={ITEM_CLASS} value={DEFAULT_VALUE}>
              {mail_default ? (
                <SenderOptionLabel
                  option={mail_default}
                  text={t("calendar.invite_from_mail_default_option", {
                    address: mail_default.email,
                  })}
                />
              ) : (
                <SenderOptionLabel
                  option={primary}
                  text={
                    primary
                      ? t("calendar.invite_from_primary_option", {
                          address: primary.email,
                        })
                      : t("calendar.invite_from_primary_fallback")
                  }
                />
              )}
            </SelectItem>
            {others.map((option) => (
              <SelectItem
                key={option.id}
                className={ITEM_CLASS}
                value={option.email}
              >
                <SenderOptionLabel
                  option={option}
                  text={
                    option.type === "primary"
                      ? t("calendar.invite_from_primary_option", {
                          address: option.email,
                        })
                      : option.email
                  }
                />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      control_width={CONTROL_WIDTH}
      description={
        notice
          ? `${t("calendar.settings_default_invite_sender_desc")} ${notice}`
          : t("calendar.settings_default_invite_sender_desc")
      }
      label={label}
    />
  );
}
