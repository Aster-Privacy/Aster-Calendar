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
import { Button } from "@aster/ui";

import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";

export type InviteSendKind = "request" | "update" | "cancel";

interface InviteSendDialogProps {
  is_open: boolean;
  kind: InviteSendKind;
  guest_count: number;
  is_sending: boolean;
  on_send: () => void;
  on_skip: () => void;
}

export function InviteSendDialog({
  is_open,
  kind,
  guest_count,
  is_sending,
  on_send,
  on_skip,
}: InviteSendDialogProps) {
  const { t } = use_i18n();
  const title =
    kind === "cancel"
      ? t("calendar.invite_cancel_title")
      : t("calendar.invite_send_title");
  const message =
    kind === "cancel"
      ? t("calendar.invite_cancel_message", { count: guest_count })
      : kind === "update"
        ? t("calendar.invite_update_message", { count: guest_count })
        : t("calendar.invite_send_message", { count: guest_count });

  const handle_close = () => {
    if (!is_sending) {
      on_skip();
    }
  };

  return (
    <Modal
      close_on_escape={!is_sending}
      close_on_overlay={!is_sending}
      is_open={is_open}
      show_close_button={false}
      size="sm"
      on_close={handle_close}
    >
      <ModalHeader>
        <ModalTitle>{title}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <p className="text-sm leading-5 text-txt-muted">{message}</p>
      </ModalBody>
      <ModalFooter className="flex items-center justify-end gap-2">
        <Button
          disabled={is_sending}
          size="md"
          type="button"
          variant="ghost"
          onClick={on_skip}
        >
          {t("calendar.invite_skip_action")}
        </Button>
        <Button
          disabled={is_sending}
          size="md"
          type="button"
          variant="depth"
          onClick={on_send}
        >
          {t("calendar.invite_send_action")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
