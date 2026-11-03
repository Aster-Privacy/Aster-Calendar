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

import {
  secure_retrieve,
  secure_store,
} from "@/services/crypto/secure_storage";

export async function read_secure_array<T>(key: string): Promise<T[]> {
  try {
    const parsed = await secure_retrieve<T[]>(key);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function write_secure_array<T>(
  key: string,
  value: T[],
): Promise<boolean> {
  try {
    await secure_store(key, value);

    return true;
  } catch {
    return false;
  }
}
