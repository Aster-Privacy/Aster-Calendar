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
import type { MailItemMetadata } from "@/types/email";

import { encrypt_metadata } from "./envelope";
import { get_derived_encryption_key } from "./memory_key_store";
import { zero_uint8_array } from "./secure_memory";

const MAIL_METADATA_CONTEXT = "mail-item-metadata";

export interface EncryptedMailMetadataResult {
  encrypted_metadata: string;
  metadata_nonce: string;
}

export async function encrypt_mail_metadata(
  metadata: MailItemMetadata,
): Promise<EncryptedMailMetadataResult | null> {
  const master_key = get_derived_encryption_key();

  if (!master_key) {
    return null;
  }

  try {
    const blob = await encrypt_metadata(
      metadata,
      master_key,
      MAIL_METADATA_CONTEXT,
    );

    if (!blob) {
      return null;
    }

    return {
      encrypted_metadata: blob.encrypted_data,
      metadata_nonce: blob.nonce,
    };
  } catch {
    return null;
  } finally {
    if (master_key instanceof Uint8Array) {
      zero_uint8_array(master_key);
    }
  }
}
