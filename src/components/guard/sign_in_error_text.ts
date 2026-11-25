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
import type { TranslationKey } from "@/lib/i18n/types";

import { guard_error_message } from "@/components/guard/guard_error_text";

interface SignInErrorSource {
  error?: string;
  status?: number;
  server_code?: string;
  retry_after_secs?: number;
  details?: Record<string, unknown>;
}

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export function is_guard_sign_in_error(source: SignInErrorSource): boolean {
  return (
    source.status === 426 ||
    source.server_code === "CLIENT_UPGRADE_REQUIRED" ||
    (typeof source.server_code === "string" &&
      source.server_code.startsWith("GUARD_"))
  );
}

export function sign_in_error_text(
  t: Translate,
  source: SignInErrorSource,
  fallback: string,
): string {
  if (!is_guard_sign_in_error(source)) return source.error || fallback;
  const message = guard_error_message(source);

  return message ? t(message.key, message.params) : fallback;
}
