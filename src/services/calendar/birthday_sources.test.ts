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
import type { Contact } from "@/types/contacts";
import type { BirthdayContact } from "@/services/calendar/birthdays";

import { afterEach, describe, expect, it, vi } from "vitest";

import { emit_contacts_changed } from "@/hooks/app_events";
import {
  load_birthday_sources,
  watch_birthday_sources,
} from "@/services/calendar/birthday_sources";

function encrypted(id: string): Contact {
  return { id } as unknown as Contact;
}

function contact_store(initial: BirthdayContact[]) {
  let contacts = initial;

  return {
    decrypt_contact: vi.fn(async (contact: Contact) => {
      const found = contacts.find((entry) => entry.id === contact.id);

      if (!found) throw new Error("missing");

      return found;
    }),
    list_contacts: vi.fn(async () => ({
      data: {
        has_more: false,
        items: contacts.map((entry) => encrypted(entry.id)),
        next_cursor: null,
      },
    })),
    set(next: BirthdayContact[]) {
      contacts = next;
    },
  };
}

const ana = { birthday: "1990-03-14", first_name: "Ana", id: "ana" };
const ben = { birthday: "1990-03-14", first_name: "Ben", id: "ben" };
const trashed_at = "2026-11-01T10:00:00.000Z";

async function settle() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

describe("load_birthday_sources", () => {
  it("skips contacts that are in the trash", async () => {
    const store = contact_store([ana, { ...ben, deleted_at: trashed_at }]);

    const sources = await load_birthday_sources(store);

    expect(sources.map((source) => source.id)).toEqual(["ana"]);
  });
});

describe("watch_birthday_sources", () => {
  const stops: (() => void)[] = [];

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
  });

  it("drops a birthday when its contact moves to the trash", async () => {
    const store = contact_store([ana, ben]);
    const on_sources = vi.fn();
    const stop = watch_birthday_sources(store, on_sources);

    await settle();
    expect(on_sources).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "ana" }),
      expect.objectContaining({ id: "ben" }),
    ]);

    store.set([ana, { ...ben, deleted_at: trashed_at }]);
    emit_contacts_changed();
    await settle();

    expect(on_sources).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "ana" }),
    ]);

    stop();
    emit_contacts_changed();
    await settle();
    expect(store.list_contacts).toHaveBeenCalledTimes(2);
  });

  it("brings a birthday back when its contact is restored", async () => {
    const store = contact_store([ana, { ...ben, deleted_at: trashed_at }]);
    const on_sources = vi.fn();

    stops.push(watch_birthday_sources(store, on_sources));
    await settle();
    expect(on_sources).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "ana" }),
    ]);

    store.set([ana, { ...ben, deleted_at: "" }]);
    emit_contacts_changed();
    await settle();

    expect(on_sources).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "ana" }),
      expect.objectContaining({ id: "ben" }),
    ]);
  });
});
