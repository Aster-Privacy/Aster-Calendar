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

import { api_client } from "./api/client";
import { get_ws_base_url } from "./api/base_url";
import { request_cache } from "./api/request_cache";
import { connection_store } from "./routing/connection_store";
import { open_sync_socket } from "./routing/pinned_sync_socket";
import { TorUnavailableError } from "./routing/tor_unavailable_error";

import { is_onion_host } from "@/lib/onion_host";
import {
  is_any_lockdown_active,
  LOCKDOWN_CHANGED_EVENT,
} from "@/services/lockdown_store";
import { is_low_network } from "@/services/low_network_state";
import { emit_contacts_changed } from "@/hooks/app_events";
import { ignore_error } from "@/lib/ignore_error";
import {
  calendar_sync_engine,
  handle_calendar_mutation_frame,
} from "@/services/calendar/sync_engine";

type ServerMessageType =
  | "auth_success"
  | "auth_error"
  | "preferences"
  | "preferences_saved"
  | "prekey_low"
  | "session_revoked"
  | "contacts_changed"
  | "preferences_changed"
  | "calendar_mutation"
  | "ping"
  | "pong";

interface ServerMessage {
  type: ServerMessageType;
  encrypted?: string | null;
  nonce?: string | null;
  success?: boolean;
  message?: string;
  action?: string;
  ids?: string[];
  origin_device?: string | null;
}

const HEARTBEAT_INTERVAL_MS = 30000;
const LIVENESS_TIMEOUT_MS = 75000;
export const PUSH_ARRIVED_MESSAGE = "aster_push_arrived";
export const PREFERENCES_CHANGED_EVENT = "aster_preferences_changed";
const RECONNECT_MAX_DELAY_MS = 30000;
const WAKE_RECONNECT_MIN_GAP_MS = 5000;

type MessageHandler = (data: ServerMessage) => void;

interface PendingRequest {
  resolve: (data: ServerMessage) => void;
  reject: (error: Error) => void;
  type: string;
  timeout_id: ReturnType<typeof setTimeout>;
}

class SyncClient {
  private socket: WebSocket | null = null;
  private authenticated = false;
  private pending_requests: PendingRequest[] = [];
  private reconnect_timeout: ReturnType<typeof setTimeout> | null = null;
  private message_handlers: Map<string, MessageHandler[]> = new Map();
  private should_reconnect = false;
  private auth_error_count = 0;
  private last_auth_error = false;
  private reconnect_attempt = 0;
  private failure_streak_reported = false;
  private has_authenticated_before = false;
  private pending_connect_reject: ((err: Error) => void) | null = null;
  private heartbeat_timer: ReturnType<typeof setInterval> | null = null;
  private last_message_at = 0;
  private last_connect_started_at = 0;

  async connect(): Promise<void> {
    const method = connection_store.get_method();

    if (method === "tor" || method === "tor_snowflake") {
      this.should_reconnect = false;
      throw new TorUnavailableError(
        "tor_not_running",
        "WebSocket sync is disabled in Tor mode to prevent IP leaks",
      );
    }

    if (is_onion_host()) {
      this.should_reconnect = false;
      throw new TorUnavailableError(
        "tor_not_running",
        "WebSocket sync is disabled on onion sites",
      );
    }

    if (is_any_lockdown_active()) {
      this.should_reconnect = false;
      throw new Error("WebSocket sync is disabled in Lockdown Mode");
    }

    this.should_reconnect = true;

    if (this.reconnect_timeout) {
      clearTimeout(this.reconnect_timeout);
      this.reconnect_timeout = null;
    }

    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      this.socket.close();
      this.socket = null;
    }

    if (this.pending_connect_reject) {
      this.pending_connect_reject(
        new Error("Superseded by a new connection attempt"),
      );
      this.pending_connect_reject = null;
    }

    return new Promise((resolve, reject) => {
      this.pending_connect_reject = reject;

      const settle_resolve = () => {
        if (this.pending_connect_reject === reject) {
          this.pending_connect_reject = null;
        }
        resolve();
      };
      const settle_reject = (err: Error) => {
        if (this.pending_connect_reject === reject) {
          this.pending_connect_reject = null;
        }
        reject(err);
      };
      const ws_url = get_ws_base_url();

      this.last_connect_started_at = Date.now();
      this.socket = open_sync_socket(ws_url);

      this.socket.onopen = () => {
        const token = api_client.get_access_token();

        if (token) {
          this.send_message({ type: "auth", token });
        } else {
          this.socket?.close();
          settle_reject(new Error("No access token available"));
        }
      };

      this.socket.onmessage = (event) => {
        let data: ServerMessage;

        try {
          const parsed: unknown = JSON.parse(event.data);

          if (
            typeof parsed !== "object" ||
            parsed === null ||
            typeof (parsed as Record<string, unknown>).type !== "string"
          ) {
            return;
          }

          data = parsed as ServerMessage;
        } catch {
          return;
        }

        request_cache.end_fresh_joins();
        this.handle_message(data);

        if (data.type === "auth_success") {
          const is_reconnect =
            this.reconnect_attempt > 0 || this.has_authenticated_before;

          this.authenticated = true;
          this.has_authenticated_before = true;
          this.auth_error_count = 0;
          this.last_auth_error = false;
          this.reconnect_attempt = 0;
          this.failure_streak_reported = false;
          this.start_heartbeat();
          if (is_reconnect) {
            calendar_sync_engine.schedule_pull(0);
            window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
          }
          settle_resolve();
        } else if (data.type === "auth_error") {
          this.last_auth_error = true;
          settle_reject(new Error(data.message || "Authentication failed"));
        }
      };

      this.socket.onerror = () => {
        settle_reject(new Error("WebSocket connection failed"));
      };

      this.socket.onclose = () => {
        this.authenticated = false;
        this.stop_heartbeat();
        this.clear_pending_requests();
        this.schedule_reconnect();
      };
    });
  }

  private start_heartbeat(): void {
    this.stop_heartbeat();
    this.last_message_at = Date.now();

    this.heartbeat_timer = setInterval(() => {
      if (this.socket?.readyState !== WebSocket.OPEN) {
        return;
      }

      if (Date.now() - this.last_message_at > LIVENESS_TIMEOUT_MS) {
        this.socket.close();

        return;
      }

      this.send_message({ type: "ping" });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stop_heartbeat(): void {
    if (this.heartbeat_timer) {
      clearInterval(this.heartbeat_timer);
      this.heartbeat_timer = null;
    }
  }

  on_wake(): void {
    this.reconnect_now();
  }

  reconnect_now(): void {
    if (!this.should_reconnect) return;

    if (
      this.socket?.readyState !== WebSocket.OPEN &&
      Date.now() - this.last_connect_started_at < WAKE_RECONNECT_MIN_GAP_MS
    ) {
      return;
    }

    if (this.reconnect_timeout) {
      clearTimeout(this.reconnect_timeout);
      this.reconnect_timeout = null;
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      if (Date.now() - this.last_message_at <= LIVENESS_TIMEOUT_MS) {
        this.send_message({ type: "ping" });

        return;
      }
      this.socket.close();

      return;
    }

    if (this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.reconnect_attempt = 0;
    this.connect().catch((caught) =>
      ignore_error("services/sync_client:reconnect_now", caught),
    );
  }

  private schedule_reconnect(): void {
    if (this.reconnect_timeout || !this.should_reconnect) return;

    const base_delay = is_low_network() ? 10000 : 3000;
    const max_delay = RECONNECT_MAX_DELAY_MS;
    const backoff = Math.min(
      base_delay * Math.pow(2, Math.min(this.reconnect_attempt, 10)),
      max_delay,
    );
    const jitter = 1 + (Math.random() * 0.5 - 0.25);
    const delay = Math.max(base_delay, Math.min(backoff * jitter, max_delay));

    this.reconnect_attempt++;

    this.reconnect_timeout = setTimeout(async () => {
      this.reconnect_timeout = null;
      if (!this.should_reconnect) return;

      if (this.last_auth_error) {
        this.auth_error_count++;

        if (this.auth_error_count > 10) {
          this.should_reconnect = false;

          return;
        }

        await api_client.refresh_session();

        if (!api_client.is_authenticated()) {
          this.should_reconnect = false;

          return;
        }

        this.last_auth_error = false;
      }

      this.connect().catch((caught) => {
        if (this.reconnect_attempt < 3 || this.failure_streak_reported) return;

        this.failure_streak_reported = true;
        ignore_error("services/sync_client:reconnect_failed", caught);
        window.dispatchEvent(
          new CustomEvent("astermail:sync-connection-failed"),
        );
      });
    }, delay);
  }

  private send_message(msg: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  private handle_message(data: ServerMessage): void {
    this.last_message_at = Date.now();

    if (data.type === "ping" || data.type === "pong") {
      return;
    }

    if (data.type === "calendar_mutation") {
      handle_calendar_mutation_frame({
        type: "calendar_mutation",
        action: data.action,
        ids: data.ids,
        origin_device: data.origin_device,
      });

      return;
    }

    if (data.type === "session_revoked") {
      this.should_reconnect = false;
      this.disconnect();
      window.dispatchEvent(new CustomEvent("astermail:session-revoked"));

      return;
    }

    if (data.type === "contacts_changed") {
      emit_contacts_changed();

      return;
    }

    if (data.type === "preferences_changed") {
      window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));

      return;
    }

    if (data.type === "prekey_low") {
      return;
    }

    const handlers = this.message_handlers.get(data.type);

    if (handlers) {
      handlers.forEach((h) => h(data));
    }

    const request_types: Record<string, string> = {
      preferences: "get_preferences",
      preferences_saved: "save_preferences",
    };

    const request_type = request_types[data.type];

    if (request_type) {
      const idx = this.pending_requests.findIndex(
        (r) => r.type === request_type,
      );

      if (idx !== -1) {
        const request = this.pending_requests.splice(idx, 1)[0];

        clearTimeout(request.timeout_id);
        request.resolve(data);
      }
    }
  }

  private async send_and_wait(
    msg: Record<string, unknown>,
    _response_type: string,
  ): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      if (!this.authenticated || this.socket?.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));

        return;
      }

      const pending: PendingRequest = {
        resolve,
        reject,
        type: msg.type as string,
        timeout_id: null as unknown as ReturnType<typeof setTimeout>,
      };

      pending.timeout_id = setTimeout(() => {
        const idx = this.pending_requests.indexOf(pending);

        if (idx !== -1) {
          this.pending_requests.splice(idx, 1);
          reject(new Error("Request timeout"));
        }
      }, 10000);

      this.pending_requests.push(pending);

      this.send_message(msg);
    });
  }

  async get_preferences(): Promise<{
    encrypted: string | null;
    nonce: string | null;
  }> {
    const response = await this.send_and_wait(
      { type: "get_preferences" },
      "preferences",
    );

    return {
      encrypted: response.encrypted || null,
      nonce: response.nonce || null,
    };
  }

  async save_preferences(encrypted: string, nonce: string): Promise<boolean> {
    const response = await this.send_and_wait(
      { type: "save_preferences", encrypted, nonce },
      "preferences_saved",
    );

    return response.success === true;
  }

  disconnect(): void {
    this.should_reconnect = false;
    this.last_auth_error = false;
    this.auth_error_count = 0;
    this.reconnect_attempt = 0;
    this.has_authenticated_before = false;
    if (this.reconnect_timeout) {
      clearTimeout(this.reconnect_timeout);
      this.reconnect_timeout = null;
    }
    this.stop_heartbeat();
    this.clear_pending_requests();
    this.authenticated = false;
    this.socket?.close();
    this.socket = null;
  }

  private clear_pending_requests(): void {
    for (const request of this.pending_requests) {
      clearTimeout(request.timeout_id);
      request.reject(new Error("Connection closed"));
    }
    this.pending_requests = [];
  }

  is_connected(): boolean {
    return this.authenticated && this.socket?.readyState === WebSocket.OPEN;
  }

  register_handler(message_type: string, handler: MessageHandler): () => void {
    if (!this.message_handlers.has(message_type)) {
      this.message_handlers.set(message_type, []);
    }

    this.message_handlers.get(message_type)!.push(handler);

    return () => {
      const handlers = this.message_handlers.get(message_type);

      if (handlers) {
        const idx = handlers.indexOf(handler);

        if (idx !== -1) {
          handlers.splice(idx, 1);
        }
      }
    };
  }

  async wait_for_connection(timeout_ms: number = 5000): Promise<boolean> {
    if (this.is_connected()) return true;

    return new Promise((resolve) => {
      let settled = false;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.socket?.removeEventListener("open", on_open);
        this.socket?.removeEventListener("close", on_close);
      };

      const on_open = () => {
        cleanup();
        resolve(true);
      };

      const on_close = () => {
        cleanup();
        resolve(false);
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeout_ms);

      if (this.is_connected()) {
        cleanup();
        resolve(true);
      } else if (this.socket) {
        this.socket.addEventListener("open", on_open, { once: true });
        this.socket.addEventListener("close", on_close, { once: true });
      } else {
        cleanup();
        resolve(false);
      }
    });
  }
}

export const sync_client = new SyncClient();

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    sync_client.disconnect();
  });
  window.addEventListener(LOCKDOWN_CHANGED_EVENT, (e) => {
    const detail = (e as CustomEvent).detail;

    if (detail?.enabled) {
      sync_client.disconnect();
    }
  });
  window.addEventListener("online", () => {
    sync_client.on_wake();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      sync_client.on_wake();
    }
  });
  window.addEventListener("focus", () => {
    sync_client.on_wake();
  });
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = (event as MessageEvent).data as
        { type?: string } | null | undefined;

      if (data?.type === PUSH_ARRIVED_MESSAGE) {
        request_cache.end_fresh_joins();
        calendar_sync_engine.schedule_pull(0);
      }
    });
  }
}
