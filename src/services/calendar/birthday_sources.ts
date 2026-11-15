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
import type { ApiResponse } from "@/services/api/client";
import type { Contact, ContactsListResponse } from "@/types/contacts";
import type {
  BirthdayContact,
  BirthdaySource,
} from "@/services/calendar/birthdays";

import { APP_EVENTS, on_app_events } from "@/hooks/app_events";
import { birthday_sources_from_contacts } from "@/services/calendar/birthdays";

export interface BirthdaySourceLoaders {
  list_contacts: (params: {
    cursor?: string;
    limit?: number;
  }) => Promise<ApiResponse<ContactsListResponse>>;
  decrypt_contact: (contact: Contact) => Promise<BirthdayContact>;
}

const BIRTHDAY_PAGE_LIMIT = 200;
const BIRTHDAY_MAX_PAGES = 20;

export async function load_birthday_sources(
  loaders: BirthdaySourceLoaders,
): Promise<BirthdaySource[]> {
  const contacts: BirthdayContact[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < BIRTHDAY_MAX_PAGES; page += 1) {
    const response = await loaders.list_contacts({
      cursor: cursor ?? undefined,
      limit: BIRTHDAY_PAGE_LIMIT,
    });

    if (!response.data) {
      break;
    }

    for (const contact of response.data.items) {
      try {
        contacts.push(await loaders.decrypt_contact(contact));
      } catch {
        continue;
      }
    }

    if (!response.data.has_more || !response.data.next_cursor) {
      break;
    }

    cursor = response.data.next_cursor;
  }

  return birthday_sources_from_contacts(contacts);
}

export function watch_birthday_sources(
  loaders: BirthdaySourceLoaders,
  on_sources: (sources: BirthdaySource[]) => void,
): () => void {
  let stopped = false;
  let generation = 0;
  let delivered = false;

  const run = async () => {
    generation += 1;
    const current = generation;
    let sources: BirthdaySource[];

    try {
      sources = await load_birthday_sources(loaders);
    } catch {
      if (delivered) {
        return;
      }
      sources = [];
    }

    if (stopped || current !== generation) {
      return;
    }

    delivered = true;
    on_sources(sources);
  };

  void run();

  const unsubscribe = on_app_events([APP_EVENTS.CONTACTS_CHANGED], () => {
    void run();
  });

  return () => {
    stopped = true;
    unsubscribe();
  };
}
