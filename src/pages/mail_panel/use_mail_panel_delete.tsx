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
import type {
  CalendarAttendee,
  DecryptedCalendarEvent,
  RecurrenceEditScope,
} from "@/types/calendar";
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { useCallback, useEffect, useRef, useState } from "react";

import { InviteSendDialog } from "@/components/calendar/invite_send_dialog";
import { RecurrenceScopeDialog } from "@/components/calendar/recurrence_scope_dialog";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  delete_event_occurrence,
  restore_trashed_event,
  trash_event,
} from "@/services/api/calendar";
import { is_booking_event } from "@/services/calendar/appointments";
import { send_invitations } from "@/services/calendar/invite_mail";
import {
  find_invite_sender,
  invite_sender_identity,
} from "@/services/calendar/invite_sender";
import {
  event_guests,
  event_organizer_email,
  is_event_organizer,
  next_sequence,
} from "@/services/calendar/itip";

interface PendingCancel {
  event: DecryptedCalendarEvent;
  guests: CalendarAttendee[];
  sequence: number;
}

interface UseMailPanelDeleteOptions {
  self_email: string;
  sender_options: SenderOption[];
  on_open_in_calendar: (event: DecryptedCalendarEvent) => void;
  on_deleted: (event: DecryptedCalendarEvent) => void;
  reload: () => void;
}

function is_recurring(event: DecryptedCalendarEvent): boolean {
  return event.recurrence !== null || event.recurrence_master_id !== null;
}

export function use_mail_panel_delete({
  self_email,
  sender_options,
  on_open_in_calendar,
  on_deleted,
  reload,
}: UseMailPanelDeleteOptions) {
  const { t, language } = use_i18n();
  const { preferences } = use_preferences();
  const { user } = use_auth();
  const [event_to_delete, set_event_to_delete] =
    useState<DecryptedCalendarEvent | null>(null);
  const [pending_cancel, set_pending_cancel] = useState<PendingCancel | null>(
    null,
  );
  const [is_sending, set_is_sending] = useState(false);
  const busy_ref = useRef(false);

  const confirm_before_delete = preferences.calendar_confirm_before_delete;
  const is_recurring_delete =
    event_to_delete !== null && is_recurring(event_to_delete);
  const skip_confirmation =
    event_to_delete !== null && !is_recurring_delete && !confirm_before_delete;

  const request_delete = useCallback(
    (event: DecryptedCalendarEvent) => {
      if (is_booking_event(event)) {
        on_open_in_calendar(event);

        return;
      }

      set_event_to_delete(event);
    },
    [on_open_in_calendar],
  );

  const confirm_delete = useCallback(
    async (scope: RecurrenceEditScope) => {
      const deleted = event_to_delete;

      if (!deleted || busy_ref.current) return;

      busy_ref.current = true;
      set_event_to_delete(null);

      const to_trash = !is_recurring(deleted) || scope === "series";
      const is_restorable = !is_recurring(deleted);
      const cancel_guests =
        scope === "series" && is_event_organizer(deleted, self_email)
          ? event_guests(deleted, self_email)
          : [];

      let succeeded = false;

      try {
        succeeded = to_trash
          ? Boolean(
              (await trash_event(deleted.recurrence_master_id ?? deleted.id))
                .data,
            )
          : (await delete_event_occurrence(deleted, scope)).success;
      } catch {
        succeeded = false;
      } finally {
        busy_ref.current = false;
        reload();
      }

      if (!succeeded) {
        show_toast(t("calendar.event_delete_failed"), "error");

        return;
      }

      on_deleted(deleted);

      if (cancel_guests.length > 0 && self_email) {
        set_pending_cancel({
          event: deleted,
          guests: cancel_guests,
          sequence: next_sequence(deleted),
        });
      }

      if (is_restorable) {
        show_action_toast({
          action_type: "trash",
          email_ids: [],
          message: t("calendar.event_deleted"),
          on_undo: async () => {
            const result = await restore_trashed_event(
              deleted.recurrence_master_id ?? deleted.id,
            );

            if (!result.data) throw new Error("restore_failed");

            reload();
          },
        });

        return;
      }

      show_toast(t("calendar.event_deleted"), "success");
    },
    [event_to_delete, self_email, reload, on_deleted, t],
  );

  useEffect(() => {
    if (skip_confirmation) void confirm_delete("series");
  }, [skip_confirmation, confirm_delete]);

  const send_cancellations = useCallback(async () => {
    if (!pending_cancel || !self_email) return;

    set_is_sending(true);

    const organizer_address =
      event_organizer_email(pending_cancel.event) ?? self_email;
    const sender = invite_sender_identity(
      find_invite_sender(sender_options, organizer_address),
      self_email,
      user?.display_name,
    );

    try {
      const result = await send_invitations({
        event: pending_cancel.event,
        guests: pending_cancel.guests,
        method: "CANCEL",
        organizer: {
          email: sender.email,
          display_name: sender.display_name ?? user?.display_name ?? null,
        },
        sender: sender.is_primary
          ? null
          : { email: sender.email, address_hash: sender.address_hash },
        sequence: pending_cancel.sequence,
        is_update: false,
        t,
        language,
      });

      if (result.sent > 0) {
        show_toast(
          t("calendar.invite_cancel_sent_toast", { count: result.sent }),
          "success",
        );
      }

      if (result.failed > 0) {
        show_toast(
          t("calendar.invite_send_partial", { count: result.failed }),
          "error",
        );
      }
    } catch {
      show_toast(
        t("calendar.invite_send_partial", {
          count: pending_cancel.guests.length,
        }),
        "error",
      );
    } finally {
      set_is_sending(false);
      set_pending_cancel(null);
    }
  }, [
    pending_cancel,
    self_email,
    sender_options,
    user?.display_name,
    t,
    language,
  ]);

  const dialogs = (
    <>
      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("common.delete")}
        is_open={
          event_to_delete !== null &&
          !is_recurring_delete &&
          confirm_before_delete
        }
        message={t("calendar.delete_event_confirmation", {
          title: event_to_delete?.title ?? "",
        })}
        on_cancel={() => set_event_to_delete(null)}
        on_confirm={() => {
          void confirm_delete("series");
        }}
        title={t("calendar.delete_event")}
        variant="danger"
      />
      <RecurrenceScopeDialog
        is_open={is_recurring_delete}
        mode="delete"
        on_cancel={() => set_event_to_delete(null)}
        on_confirm={(scope) => {
          void confirm_delete(scope);
        }}
      />
      <InviteSendDialog
        guest_count={pending_cancel?.guests.length ?? 0}
        is_open={pending_cancel !== null}
        is_sending={is_sending}
        kind="cancel"
        on_send={() => {
          void send_cancellations();
        }}
        on_skip={() => set_pending_cancel(null)}
      />
    </>
  );

  return { request_delete, dialogs };
}
