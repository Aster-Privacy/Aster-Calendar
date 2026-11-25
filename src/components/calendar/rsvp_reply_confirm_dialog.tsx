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
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { use_i18n } from "@/lib/i18n/context";

interface RsvpReplyConfirmDialogProps {
  organizer_email: string | null;
  on_cancel: () => void;
  on_confirm: () => void;
}

export function RsvpReplyConfirmDialog({
  organizer_email,
  on_cancel,
  on_confirm,
}: RsvpReplyConfirmDialogProps) {
  const { t } = use_i18n();

  return (
    <ConfirmationModal
      cancel_text={t("common.cancel")}
      confirm_text={t("mail.send")}
      extra_content={
        <p className="mt-3 text-[14px] leading-normal font-medium [overflow-wrap:anywhere]">
          {t("calendar.invite_card_reply_to", {
            email: organizer_email ?? "",
          })}
        </p>
      }
      is_open={organizer_email !== null}
      message={t("calendar.invite_card_reply_target_unverified")}
      on_cancel={on_cancel}
      on_confirm={on_confirm}
      title={t("calendar.invite_your_response")}
      variant="warning"
    />
  );
}
