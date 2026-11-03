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

export function sanitize_download_filename(filename: string): string {
  let cleaned = "";

  for (const ch of filename) {
    const code = ch.codePointAt(0) ?? 0;
    const is_control = code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    const is_bidi =
      code === 0x200e ||
      code === 0x200f ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069);

    if (is_control || is_bidi) continue;

    cleaned += code === 0x2f || code === 0x5c ? "_" : ch;
  }

  cleaned = cleaned.trim();

  return cleaned || "download";
}
