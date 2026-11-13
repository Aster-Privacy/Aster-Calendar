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
import { useEffect, useRef, useState } from "react";

import { LockIcon } from "@/components/common/icons";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { discover_external_keys_batch } from "@/services/api/keys";
import { pin_guest_key, unpin_guest_key } from "@/services/guest_key_pins";
import { is_internal_recipient } from "@/services/recipient_classification";

export type GuestEncryptionStatus =
  "encrypted" | "transit" | "checking" | "unknown";

export function use_guest_encryption(
  emails: string[],
): Map<string, GuestEncryptionStatus> {
  const { preferences } = use_preferences();
  const enabled = preferences.show_encryption_indicators;
  const [statuses, set_statuses] = useState<Map<string, GuestEncryptionStatus>>(
    () => new Map(),
  );
  const requested_ref = useRef(new Set<string>());
  const key = emails.map((email) => email.toLowerCase()).join("\n");

  useEffect(() => {
    if (!enabled) return;

    const requested = requested_ref.current;
    const wanted = new Set(key ? key.split("\n") : []);
    const internal: string[] = [];
    const external: string[] = [];

    for (const email of wanted) {
      if (requested.has(email)) continue;
      requested.add(email);

      if (is_internal_recipient(email)) {
        internal.push(email);
      } else {
        external.push(email);
      }
    }

    for (const email of [...requested]) {
      if (!wanted.has(email)) requested.delete(email);
    }

    if (internal.length === 0 && external.length === 0) return;

    set_statuses((previous) => {
      const next = new Map(previous);

      for (const email of internal) next.set(email, "encrypted");
      for (const email of external) next.set(email, "checking");

      return next;
    });

    if (external.length === 0) return;

    let active = true;

    discover_external_keys_batch(external)
      .then((result) => {
        if (!active) return;

        const found = new Map<string, boolean>();

        for (const info of result.data ?? []) {
          const address = info.email.toLowerCase();
          const client_can_encrypt = Boolean(
            info.will_encrypt && info.found && info.public_key,
          );

          found.set(address, client_can_encrypt);

          if (client_can_encrypt && info.public_key) {
            pin_guest_key(address, info.public_key);
          } else {
            unpin_guest_key(address);
          }
        }

        set_statuses((previous) => {
          const next = new Map(previous);

          for (const email of external) {
            const will_encrypt = found.get(email);

            next.set(
              email,
              will_encrypt === undefined
                ? result.error
                  ? "unknown"
                  : "transit"
                : will_encrypt
                  ? "encrypted"
                  : "transit",
            );
          }

          return next;
        });
      })
      .catch(() => {
        if (!active) return;

        set_statuses((previous) => {
          const next = new Map(previous);

          for (const email of external) next.set(email, "unknown");

          return next;
        });
      });

    return () => {
      active = false;

      for (const email of external) requested.delete(email);
    };
  }, [enabled, key]);

  return enabled ? statuses : new Map();
}

export function GuestEncryptionLock({
  status,
}: {
  status: GuestEncryptionStatus | undefined;
}) {
  const { t } = use_i18n();

  if (!status) return null;

  if (status === "checking") {
    return (
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center"
        data-encryption={status}
        style={{ color: "var(--text-muted)", opacity: 0.4 }}
      >
        <LockIcon size={12} />
      </span>
    );
  }

  const label =
    status === "encrypted"
      ? t("common.end_to_end_encrypted_label")
      : status === "unknown"
        ? t("common.encryption_status_unknown")
        : t("common.protected_in_transit");
  const color =
    status === "encrypted"
      ? "var(--accent-color)"
      : status === "unknown"
        ? "var(--color-warning)"
        : "var(--text-muted)";

  return (
    <span
      aria-label={label}
      className="inline-flex shrink-0 items-center"
      data-encryption={status}
      role="img"
      style={{ color }}
      title={label}
    >
      <LockIcon size={12} />
    </span>
  );
}
