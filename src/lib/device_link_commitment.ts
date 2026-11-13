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
import { MAIL_APP_URL } from "@/lib/mail_app";

const COMMITMENT_PARAM = "v";
const FINGERPRINT_HEX_LENGTH = 20;

export const MAIL_LINK_DEVICE_URL = `${MAIL_APP_URL}/link-device`;

function grouped(hex: string): string {
  return hex.match(/.{1,4}/g)?.join(" ") ?? "";
}

export function normalize_fingerprint(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 64) return null;
  if (/[^0-9a-fA-F\s-]/.test(raw)) return null;

  const hex = raw.replace(/[\s-]/g, "").toUpperCase();

  if (hex.length !== FINGERPRINT_HEX_LENGTH) return null;

  return grouped(hex);
}

export function link_device_url(base_url: string, fingerprint: string): string {
  const normalized = normalize_fingerprint(fingerprint);

  if (!normalized) throw new Error("fingerprint_required");

  return `${base_url}#${COMMITMENT_PARAM}=${normalized.replace(/ /g, "")}`;
}

export function mail_link_device_target(hash: string): string {
  const fingerprint =
    hash.length > 1
      ? normalize_fingerprint(
          new URLSearchParams(hash.slice(1)).get(COMMITMENT_PARAM),
        )
      : null;

  return fingerprint
    ? link_device_url(MAIL_LINK_DEVICE_URL, fingerprint)
    : MAIL_LINK_DEVICE_URL;
}
