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
  EmailParams,
  QueueCallbacks,
  QueuedEmailInternal,
} from "./send_queue_types";

import { create_error, type SendError } from "./send_queue_types";
import {
  check_send_readiness_internal,
  execute_send,
} from "./send_queue_encryption";

import { show_toast } from "@/components/toast/simple_toast";
import { get_active_translations } from "@/lib/i18n/translations";

export type {
  SendErrorType,
  EncryptionOptions,
  EmailParams,
  QueueCallbacks,
  QueuedEmail,
} from "./send_queue_types";

export { SendError } from "./send_queue_types";

export { execute_external_send } from "./send_queue_encryption";

class SendQueue {
  private queued_emails: QueuedEmailInternal[] = [];
  private send_mutex: Promise<void> = Promise.resolve();
  private error_handler: ((error: SendError) => void) | null = null;

  set_error_handler(handler: (error: SendError) => void): void {
    this.error_handler = handler;
  }

  private report_error(error: SendError): void {
    if (this.error_handler) {
      this.error_handler(error);
    }
  }

  private async with_send_lock<T>(operation: () => Promise<T>): Promise<T> {
    let release: () => void;
    const acquire = new Promise<void>((resolve) => {
      release = resolve;
    });

    const previous = this.send_mutex;

    this.send_mutex = acquire;

    await previous;

    try {
      return await operation();
    } finally {
      release!();
    }
  }

  private normalize_error(err: unknown): SendError {
    if (err && typeof err === "object" && "type" in err && "message" in err) {
      return err as SendError;
    }
    if (err instanceof Error) {
      return create_error("send_failed", err.message);
    }

    return create_error(
      "send_failed",
      get_active_translations().common.unexpected_error,
    );
  }

  private find_and_remove(id: string): QueuedEmailInternal | null {
    const index = this.queued_emails.findIndex((e) => e.id === id);

    if (index === -1) {
      return null;
    }

    return this.queued_emails.splice(index, 1)[0];
  }

  private async process_queued_email(id: string): Promise<void> {
    await this.with_send_lock(async () => {
      const current_email = this.find_and_remove(id);

      if (!current_email) {
        return;
      }

      try {
        const sent_id = await execute_send(current_email);

        current_email.callbacks.on_complete(sent_id);
      } catch (err) {
        const error = this.normalize_error(err);

        this.report_error(error);
        if (current_email.callbacks.on_error) {
          current_email.callbacks.on_error(error);
        }
        current_email.callbacks.on_cancel();
        show_toast(
          error.message ||
            get_active_translations().common.failed_to_send_email,
          "error",
        );
      }
    });
  }

  queue(email: EmailParams & QueueCallbacks, delay_ms: number): string | null {
    const readiness = check_send_readiness_internal();

    if (readiness.ready === false) {
      if (email.on_error) {
        email.on_error(readiness.error);
      }
      this.report_error(readiness.error);

      return null;
    }

    const id = crypto.randomUUID();
    const scheduled_time = Date.now() + delay_ms;

    const timeout_id = window.setTimeout(() => {
      this.process_queued_email(id);
    }, delay_ms);

    this.queued_emails.push({
      id,
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      subject: email.subject,
      envelope_subject: email.envelope_subject,
      body: email.body,
      thread_id: email.thread_id,
      sender_email: email.sender_email,
      sender_alias_hash: email.sender_alias_hash,
      sender_display_name: email.sender_display_name,
      expires_at: email.expires_at,
      attachments: email.attachments,
      forward_original_mail_id: email.forward_original_mail_id,
      in_reply_to: email.in_reply_to,
      force_pgp: email.force_pgp,
      allow_non_post_quantum: email.allow_non_post_quantum,
      is_plain_text: email.is_plain_text,
      pgp_recipients: email.pgp_recipients,
      pgp_recipient_keys: email.pgp_recipient_keys,
      obscure_subject: email.obscure_subject,
      scheduled_time,
      timeout_id,
      callbacks: {
        on_complete: email.on_complete,
        on_cancel: email.on_cancel,
        on_error: email.on_error,
      },
    });

    return id;
  }

  cancel(id: string): QueuedEmailInternal | null {
    const cancelled = this.find_and_remove(id);

    if (!cancelled) {
      return null;
    }

    window.clearTimeout(cancelled.timeout_id);

    return cancelled;
  }

  async send_now(id: string): Promise<void> {
    const current_email = this.find_and_remove(id);

    if (!current_email) {
      return;
    }

    window.clearTimeout(current_email.timeout_id);

    await this.with_send_lock(async () => {
      try {
        const sent_id = await execute_send(current_email);

        current_email.callbacks.on_complete(sent_id);
      } catch (err) {
        const error = this.normalize_error(err);

        this.report_error(error);
        if (current_email.callbacks.on_error) {
          current_email.callbacks.on_error(error);
        }
        current_email.callbacks.on_cancel();
        show_toast(
          error.message ||
            get_active_translations().common.failed_to_send_email,
          "error",
        );
      }
    });
  }

  get_queued(): QueuedEmailInternal | null {
    return this.queued_emails.length > 0 ? this.queued_emails[0] : null;
  }

  pending_count(): number {
    return this.queued_emails.length;
  }

  flush_all_now(): void {
    const pending = [...this.queued_emails];

    for (const email of pending) {
      window.clearTimeout(email.timeout_id);
      void this.process_queued_email(email.id);
    }
  }
}

export const send_queue = new SendQueue();

export function flush_pending_sends(): void {
  send_queue.flush_all_now();
}

export function pending_send_count(): number {
  return send_queue.pending_count();
}

function install_send_queue_unload_guards(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("pagehide", () => {
    send_queue.flush_all_now();
  });

  window.addEventListener("beforeunload", (event) => {
    if (send_queue.pending_count() === 0) return;

    send_queue.flush_all_now();
    event.preventDefault();
    event.returnValue = "";
  });
}

install_send_queue_unload_guards();

export function check_send_readiness(): { ready: boolean; error?: string } {
  const result = check_send_readiness_internal();

  if (result.ready === false) {
    return { ready: false, error: result.error.message };
  }

  return { ready: true };
}

export function queue_email(
  email: EmailParams & {
    on_complete: (sent_id?: string) => void;
    on_cancel: () => void;
    on_error?: (error: string) => void;
  },
  delay_ms: number,
): string | null {
  const wrapped_error_handler = email.on_error
    ? (err: SendError) => email.on_error!(err.message)
    : undefined;

  return send_queue.queue(
    {
      ...email,
      on_error: wrapped_error_handler,
    },
    delay_ms,
  );
}
