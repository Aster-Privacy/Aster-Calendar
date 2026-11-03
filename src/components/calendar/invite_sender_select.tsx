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
import type { DecryptedCalendarEvent } from "@/types/calendar";

import { useEffect, useId } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

import { SenderSelector } from "@/components/calendar/sender_selector";
import { use_invite_senders } from "@/components/calendar/use_invite_senders";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { event_organizer_email } from "@/services/calendar/itip";
import {
  invite_form_key,
  resolve_invite_sender,
  set_invite_sender_choice,
  use_invite_sender_choice,
} from "@/services/calendar/invite_sender";
import {
  is_own_address,
  use_own_addresses_version,
} from "@/services/calendar/own_addresses";

interface InviteSenderSelectProps {
  event: DecryptedCalendarEvent | null;
  visible: boolean;
}

export function InviteSenderSelect({
  event,
  visible,
}: InviteSenderSelectProps) {
  const { t } = use_i18n();
  const { user } = use_auth();
  const { preferences } = use_preferences();
  const label_id = useId();
  const self_email = (user?.email ?? "").trim().toLowerCase();
  const form_key = invite_form_key(event);
  const choice = use_invite_sender_choice(form_key);

  use_own_addresses_version();

  const previous_organizer = event ? event_organizer_email(event) : null;
  const is_locked = previous_organizer !== null;
  const default_sender =
    typeof preferences.calendar_default_invite_sender === "string"
      ? preferences.calendar_default_invite_sender
      : "";
  const senders = use_invite_senders([
    is_locked ? previous_organizer : (choice ?? default_sender),
  ]);
  const requested = is_locked
    ? previous_organizer
    : (choice ?? (default_sender || senders.mail_default_email || ""));
  const resolution = resolve_invite_sender({
    options: senders.all_options,
    requested,
    pending_domain_names: senders.pending_domain_names,
    loading: senders.loading,
  });

  useEffect(() => {
    set_invite_sender_choice(form_key, null);
  }, [form_key]);

  if (!visible || self_email.length === 0) {
    return null;
  }

  if (
    previous_organizer !== null &&
    !is_own_address(previous_organizer, self_email)
  ) {
    return null;
  }

  const fallback_email = resolution.option?.email ?? user?.email ?? "";

  return (
    <div className="mt-2">
      <div className="flex min-h-9 items-center gap-2">
        <span className="shrink-0 text-[13px] text-txt-secondary" id={label_id}>
          {t("calendar.invite_from_label")}
        </span>
        <div aria-labelledby={label_id} className="min-w-0 flex-1" role="group">
          <SenderSelector
            disabled={is_locked || senders.options.length <= 1}
            options={senders.options}
            selected={resolution.option}
            on_select={(option) =>
              set_invite_sender_choice(form_key, option.email)
            }
          />
        </div>
      </div>
      {is_locked && resolution.issue === null && (
        <p className="mt-1 text-[12px] leading-[1.35] text-txt-muted">
          {t("calendar.invite_from_locked_hint")}
        </p>
      )}
      {resolution.issue !== null && resolution.requested !== null && (
        <p
          aria-live="polite"
          className="mt-1 flex items-start gap-1.5 text-[12px] leading-[1.35] text-txt-secondary"
        >
          <ExclamationTriangleIcon
            aria-hidden="true"
            className="mt-px h-3.5 w-3.5 shrink-0"
            style={{ color: "var(--color-warning)" }}
          />
          <span className="min-w-0 break-words">
            {t(
              resolution.issue === "unverified_domain"
                ? "calendar.invite_from_unverified_notice"
                : "calendar.invite_from_unavailable_notice",
              { address: resolution.requested, fallback: fallback_email },
            )}
          </span>
        </p>
      )}
    </div>
  );
}
