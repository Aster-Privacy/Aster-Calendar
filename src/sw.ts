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
/// <reference lib="webworker" />
import { ignore_error } from "@/lib/ignore_error";
import {
  push_fallback_body,
  push_fallback_title,
} from "@/lib/push_fallback_strings";
import { create_background_reminder_registry } from "@/lib/background_reminder_registry";
import type { BackgroundReminder } from "@/lib/calendar_reminder_messages";

import {
  BACKGROUND_REMINDERS_CLEAR,
  BACKGROUND_REMINDERS_SET,
  BACKGROUND_REMINDER_FIRED,
  BACKGROUND_REMINDER_SHOWN,
  CALENDAR_NOTIFICATION_TAG_PREFIX,
} from "@/lib/calendar_reminder_messages";

export {};

declare let self: ServiceWorkerGlobalScope;

const PUSH_STRINGS_CACHE = "aster_push_strings";
const PUSH_STRINGS_URL = "/__aster_push_strings";

self.addEventListener("install", (event: ExtendableEvent) => {
  void event;
  self.skipWaiting();
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      try {
        if (typeof caches !== "undefined") {
          const keys = await caches.keys();

          await Promise.all(
            keys
              .filter((k) => k !== PUSH_STRINGS_CACHE)
              .map((k) => caches.delete(k).catch(() => false)),
          );
        }
      } catch (caught) {
        ignore_error("sw", caught);
      }
      try {
        await self.clients.claim();
      } catch (caught) {
        ignore_error("sw", caught);
      }
    })(),
  );
});

async function show_background_reminder(
  reminder: BackgroundReminder,
): Promise<void> {
  try {
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    if (clients.some((client) => client.visibilityState === "visible")) {
      return;
    }

    await self.registration.showNotification(reminder.title, {
      body: reminder.body,
      icon: "/pwa-192x192.png",
      badge: "/favicon-32x32.png",
      tag: `${CALENDAR_NOTIFICATION_TAG_PREFIX}${reminder.key}`,
      data: { url: "/calendar" },
    });

    for (const client of clients) {
      client.postMessage({ type: BACKGROUND_REMINDER_SHOWN, key: reminder.key });
    }
  } catch (caught) {
    ignore_error("sw", caught);
  }
}

const background_reminders = create_background_reminder_registry(
  (reminder) => void show_background_reminder(reminder),
);

function message_client_id(event: ExtendableMessageEvent): string {
  const source = event.source as { id?: unknown } | null;

  return source && typeof source.id === "string" ? source.id : "";
}

let logout_purge_in_progress = false;

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.origin && event.origin !== self.location.origin) {
    return;
  }
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === BACKGROUND_REMINDERS_SET) {
    background_reminders.set(message_client_id(event), event.data.reminders);
  }
  if (event.data && event.data.type === BACKGROUND_REMINDERS_CLEAR) {
    background_reminders.clear(message_client_id(event));
  }
  if (event.data && event.data.type === BACKGROUND_REMINDER_FIRED) {
    background_reminders.drop(event.data.key);
  }
  if (event.data && event.data.type === "LOGOUT_PURGE") {
    if (logout_purge_in_progress) return;
    logout_purge_in_progress = true;
    background_reminders.clear_all();
    event.waitUntil(
      (async () => {
        try {
          if (typeof caches !== "undefined") {
            const keys = await caches.keys();

            await Promise.all(
              keys
                .filter((k) => k !== PUSH_STRINGS_CACHE)
                .map((k) => caches.delete(k).catch(() => false)),
            );
          }
        } catch (caught) {
          ignore_error("sw", caught);
        }
        logout_purge_in_progress = false;
      })(),
    );
  }
});

const ALLOWED_NOTIFICATION_PATH_PREFIXES = [
  "/inbox",
  "/calendar",
  "/email/",
  "/search",
  "/settings",
  "/contacts",
  "/subscriptions",
  "/all",
  "/starred",
  "/sent",
  "/drafts",
  "/archive",
  "/spam",
  "/trash",
  "/folder/",
  "/tag/",
];

function sanitize_notification_path(input: unknown): string {
  if (typeof input !== "string") return "/";
  if (!input.startsWith("/")) return "/";
  if (input.startsWith("//")) return "/";
  if (input.startsWith("/\\")) return "/";
  if (/[\r\n\t]/.test(input)) return "/";
  if (input.length > 256) return "/";
  for (const prefix of ALLOWED_NOTIFICATION_PATH_PREFIXES) {
    if (input === prefix.replace(/\/$/, "") || input.startsWith(prefix)) {
      return input;
    }
  }

  return "/";
}

interface PushNotificationStrings {
  title: string;
  body: string;
}

function stored_string(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

async function push_notification_strings(): Promise<PushNotificationStrings> {
  const fallback = {
    title: push_fallback_title(),
    body: push_fallback_body(self.navigator.language),
  };

  try {
    const cache = await caches.open(PUSH_STRINGS_CACHE);
    const stored = await cache.match(PUSH_STRINGS_URL);

    if (!stored) return fallback;
    const parsed = (await stored.json()) as {
      app_title?: unknown;
      new_message?: unknown;
    };

    return {
      title: stored_string(parsed.app_title, fallback.title),
      body: stored_string(parsed.new_message, fallback.body),
    };
  } catch {
    return fallback;
  }
}

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let data: { type?: string; url?: unknown } = {};

  try {
    data = event.data.json();
  } catch {
    data = {};
  }

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const is_test = data.type === "test";
      const app_is_open = clients.length > 0;

      if (app_is_open && !is_test) {
        for (const client of clients) {
          client.postMessage({ type: "aster_push_arrived" });
        }

        return;
      }

      const safe_url = sanitize_notification_path(data.url);
      const strings = await push_notification_strings();
      const options: NotificationOptions = {
        body: strings.body,
        icon: "/pwa-192x192.png",
        badge: "/favicon-32x32.png",
        tag: typeof data.type === "string" && data.type ? data.type : "default",
        data: { url: safe_url },
      };

      await self.registration.showNotification(strings.title, options);
    })(),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const url_to_open = sanitize_notification_path(event.notification.data?.url);

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((window_clients) => {
        for (const client of window_clients) {
          if (client.url.includes(url_to_open) && "focus" in client) {
            return client.focus();
          }
        }

        return self.clients.openWindow(url_to_open);
      }),
  );
});
