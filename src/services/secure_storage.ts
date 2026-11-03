
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
const DB_NAME = "astermail_session_db";
const DB_VERSION = 1;
const STORE_NAME = "session_data";

let db_instance: IDBDatabase | null = null;
let db_promise: Promise<IDBDatabase> | null = null;

async function open_database(): Promise<IDBDatabase> {
  if (db_instance) {
    return db_instance;
  }

  if (db_promise) {
    return db_promise;
  }

  db_promise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      db_promise = null;
      reject(new Error("Failed to open session database"));
    };

    request.onsuccess = () => {
      db_instance = request.result;
      db_instance.onclose = () => {
        db_instance = null;
        db_promise = null;
      };
      resolve(db_instance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });

  return db_promise;
}

export async function secure_remove(key: string): Promise<void> {
  try {
    const db = await open_database();

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    return;
  }
}

export function clear_session(): void {
  if (db_instance) {
    db_instance.close();
    db_instance = null;
    db_promise = null;
  }
}

export async function clear_all_session_data(): Promise<void> {
  try {
    const db = await open_database();

    await new Promise<void>((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    return;
  }

  clear_session();
}
