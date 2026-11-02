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
const LOCAL_PART_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_PATTERN =
  /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const MAX_ADDRESS_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;

export function mailto_href(address: string): string | null {
  const trimmed = address.trim();

  if (trimmed.length === 0 || trimmed.length > MAX_ADDRESS_LENGTH) {
    return null;
  }

  const at = trimmed.lastIndexOf("@");

  if (at <= 0 || at !== trimmed.indexOf("@")) {
    return null;
  }

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  if (
    local.length > MAX_LOCAL_LENGTH ||
    !LOCAL_PART_PATTERN.test(local) ||
    !DOMAIN_PATTERN.test(domain)
  ) {
    return null;
  }

  return `mailto:${encodeURIComponent(local)}@${domain.toLowerCase()}`;
}
