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
const pinned_keys = new Map<string, string>();

function normalize_address(email: string): string {
  return email.trim().toLowerCase();
}

export function pin_guest_key(email: string, armored_public_key: string): void {
  if (armored_public_key.trim().length === 0) return;

  pinned_keys.set(normalize_address(email), armored_public_key);
}

export function unpin_guest_key(email: string): void {
  pinned_keys.delete(normalize_address(email));
}

export function pinned_guest_key(email: string): string | undefined {
  return pinned_keys.get(normalize_address(email));
}

export function clear_guest_key_pins(): void {
  pinned_keys.clear();
}
