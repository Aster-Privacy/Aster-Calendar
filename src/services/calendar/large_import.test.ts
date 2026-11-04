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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface ServerRow {
  id: string;
  calendar_id: string;
  encrypted_blob: string;
  blob_nonce: string;
  created_at: string;
  updated_at: string;
  version: number;
  deleted: boolean;
}

interface ServerCalendar {
  id: string;
  encrypted_blob: string;
  blob_nonce: string;
  is_default: boolean;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
  version: number;
}

const server = vi.hoisted(() => ({
  events: new Map<string, ServerRow>(),
  calendars: new Map<string, ServerCalendar>(),
  clock_ms: 0,
  legacy_cap: 2000,
  page_cap: 500,
  requests: [] as string[],
}));

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function tick(): string {
  server.clock_ms += 7;

  return iso(server.clock_ms);
}

function ok<T>(data: T) {
  return { data, error: null, status: 200 };
}

function bad_request(code: string) {
  return { data: null, error: code, code, status: 400 };
}

function live_events(include_deleted: boolean): ServerRow[] {
  return [...server.events.values()].filter(
    (row) => include_deleted || !row.deleted,
  );
}

function sorted_by_stamp(rows: ServerRow[]): ServerRow[] {
  return rows.sort((left, right) =>
    left.updated_at === right.updated_at
      ? left.id.localeCompare(right.id)
      : left.updated_at.localeCompare(right.updated_at),
  );
}

function server_time(): string {
  return iso(server.clock_ms - 120_000);
}

function handle_events_get(query: URLSearchParams) {
  const limit = query.get("limit");
  const since = query.get("since");

  if (since !== null) {
    if (limit !== null || query.has("cursor")) {
      return bad_request("INVALID_PARAMS");
    }
    const since_id = query.get("since_id") ?? "￿";
    const include_deleted = query.get("include_deleted") === "true";
    const rows = sorted_by_stamp(live_events(include_deleted)).filter(
      (row) =>
        row.updated_at > since ||
        (row.updated_at === since && row.id > since_id),
    );

    return ok({
      events: rows,
      total: rows.length,
      server_time: server_time(),
      has_more: false,
    });
  }

  if (limit !== null) {
    const size = Number(limit);

    if (!Number.isInteger(size) || size < 1 || size > server.page_cap) {
      return bad_request("INVALID_LIMIT");
    }
    const cursor = query.get("cursor");
    const ordered = live_events(false)
      .filter((row) => cursor === null || row.id > cursor)
      .sort((left, right) => left.id.localeCompare(right.id));
    const page = ordered.slice(0, size);
    const has_more = ordered.length > size;

    return ok({
      events: page,
      total: cursor === null ? live_events(false).length : undefined,
      server_time: server_time(),
      has_more,
      next_cursor: has_more ? page[page.length - 1].id : undefined,
    });
  }

  const rows = live_events(false);

  if (rows.length > server.legacy_cap) {
    return bad_request("PAGINATION_REQUIRED");
  }

  return ok({
    events: rows,
    total: rows.length,
    server_time: server_time(),
    has_more: false,
  });
}

function handle_calendars_get() {
  const calendars = [...server.calendars.values()];

  return ok({
    calendars,
    total: calendars.length,
    server_time: server_time(),
    has_more: false,
  });
}

function api_get(path: string) {
  server.requests.push(`GET ${path}`);
  const [route, raw_query] = path.split("?");
  const query = new URLSearchParams(raw_query ?? "");

  if (route === "/calendar/v1/events") return handle_events_get(query);
  if (route === "/calendar/v1/calendars") return handle_calendars_get();

  return ok({});
}

interface BatchOperation {
  op: string;
  id?: string;
  client_ref?: string;
  calendar_id: string;
  encrypted_blob: string;
  blob_nonce: string;
}

function api_post(path: string, body: Record<string, unknown>) {
  server.requests.push(`POST ${path}`);
  if (path === "/calendar/v1/calendars") {
    const id = String(body.id);
    const at = tick();

    server.calendars.set(id, {
      id,
      encrypted_blob: String(body.encrypted_blob),
      blob_nonce: String(body.blob_nonce),
      is_default: body.is_default === true,
      is_visible: true,
      created_at: at,
      updated_at: at,
      version: 1,
    });

    return ok({ id, success: true, updated_at: at, version: 1 });
  }

  if (path === "/calendar/v1/events/batch") {
    const operations = body.operations as BatchOperation[];

    if (operations.length > 50) return bad_request("TOO_MANY_OPERATIONS");
    const results = operations.map((operation) => {
      if (!server.calendars.has(operation.calendar_id)) {
        throw new Error(`unknown calendar ${operation.calendar_id}`);
      }
      const id = operation.id ?? crypto.randomUUID();
      const at = tick();

      server.events.set(id, {
        id,
        calendar_id: operation.calendar_id,
        encrypted_blob: operation.encrypted_blob,
        blob_nonce: operation.blob_nonce,
        created_at: at,
        updated_at: at,
        version: 1,
        deleted: false,
      });

      return {
        client_ref: operation.client_ref,
        event_id: id,
        updated_at: at,
        version: 1,
      };
    });

    return ok({ results });
  }

  return ok({});
}

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: async (path: string) => api_get(path),
    post: async (path: string, body: Record<string, unknown>) =>
      api_post(path, body),
    put: async () => ok({}),
    patch: async () => ok({}),
    delete: async () => ok({}),
  },
}));

vi.mock("@/services/calendar/identity_guard", () => ({
  confirm_calendar_identity: async () => true,
  reset_calendar_identity: () => undefined,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: () => "acct-1",
}));

vi.mock("@/services/api/sessions", () => ({
  list_sessions: async () => ({ data: { current_session_id: "sess-own" } }),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ identity_key: "test-identity" }),
  get_passphrase_from_memory: () => null,
  on_keys_ready: () => () => undefined,
  wait_for_account_key_load: async () => undefined,
}));

const crypto_state = vi.hoisted(() => ({ poisoned: new Set<string>() }));

vi.mock("@/services/calendar/calendar_crypto", () => ({
  CALENDAR_BLOB_FORMAT_V1: 1,
  CALENDAR_BLOB_FORMAT_V2: 2,
  CALENDAR_BLOB_FORMAT_V3: 3,
  calendar_v3_floor: () => false,
  set_calendar_write_account: () => undefined,
  calendar_write_key: async () => null,
  encrypt_calendar_payload: async (
    payload: unknown,
    _vault: unknown,
    binding: { calendar_id?: string; event_id?: string },
  ) => ({
    ciphertext: JSON.stringify({ binding, payload }),
    nonce: "nonce",
    format: 2,
    bound: true,
  }),
  decrypt_calendar_payload: async (
    record: { ciphertext: string },
    _vault: unknown,
    binding: { calendar_id?: string; event_id?: string },
  ) => {
    const sealed = JSON.parse(record.ciphertext);

    if (
      sealed.binding.calendar_id !== binding.calendar_id ||
      (sealed.binding.event_id ?? null) !== (binding.event_id ?? null)
    ) {
      throw new Error("binding mismatch");
    }
    if (binding.event_id && crypto_state.poisoned.has(binding.event_id)) {
      throw new Error("tampered");
    }

    return { payload: sealed.payload, format: 2, bound: true };
  },
}));

const { parse_ics_events } = await import("@/services/calendar/ics_file");
const { import_entries } = await import("@/services/calendar/ics_import");
const { list_calendars, list_events, reset_calendar_seeding } =
  await import("@/services/api/calendar");
const { calendar_sync_engine } =
  await import("@/services/calendar/sync_engine");
const { MemorySyncStore, set_sync_store_adapter } =
  await import("@/services/calendar/sync_store");

const NOW_MS = Date.UTC(2026, 10, 4, 19, 44, 0);
const PAST_START = Date.UTC(2015, 0, 1);
const FUTURE_END = Date.UTC(2030, 11, 31);

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function ics_utc(ms: number): string {
  const date = new Date(ms);

  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function ics_local(ms: number): string {
  return ics_utc(ms).slice(0, -1);
}

function ics_date(ms: number): string {
  return ics_utc(ms).slice(0, 8);
}

function generated_feed(count: number): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Example//Export//EN",
    "BEGIN:VTIMEZONE",
    "TZID:America/New_York",
    "BEGIN:STANDARD",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
  ];
  const span = FUTURE_END - PAST_START;

  for (let index = 0; index < count; index += 1) {
    const start = PAST_START + Math.floor((span / count) * index);
    const end = start + 60 * 60 * 1000;
    const kind = index % 6;

    lines.push("BEGIN:VEVENT", `UID:event-${index}@example.com`);
    lines.push(`SUMMARY:Event ${index}`, `DTSTAMP:${ics_utc(NOW_MS)}`);
    if (kind === 0) {
      lines.push(`DTSTART:${ics_utc(start)}`, `DTEND:${ics_utc(end)}`);
    } else if (kind === 1) {
      lines.push(
        `DTSTART;VALUE=DATE:${ics_date(start)}`,
        `DTEND;VALUE=DATE:${ics_date(start + 24 * 60 * 60 * 1000)}`,
      );
    } else if (kind === 2) {
      lines.push(
        `DTSTART;TZID=America/New_York:${ics_local(start)}`,
        `DTEND;TZID=America/New_York:${ics_local(end)}`,
      );
    } else if (kind === 3) {
      lines.push(`DTSTART:${ics_local(start)}`, `DTEND:${ics_local(end)}`);
    } else if (kind === 4) {
      lines.push(
        `DTSTART;TZID=Europe/Berlin:${ics_local(start)}`,
        `DTEND;TZID=Europe/Berlin:${ics_local(end)}`,
        "RRULE:FREQ=WEEKLY;COUNT=10",
      );
    } else {
      lines.push(
        `DTSTART:${ics_utc(start)}`,
        `DURATION:PT45M`,
        "RRULE:FREQ=MONTHLY;INTERVAL=1;UNTIL=20321231T000000Z",
      );
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return lines.join("\r\n");
}

function default_calendar_id(): string {
  const found = [...server.calendars.values()].find((row) => row.is_default);

  if (!found) throw new Error("no default calendar");

  return found.id;
}

async function fresh_device(): Promise<void> {
  set_sync_store_adapter(new MemorySyncStore());
  calendar_sync_engine.reset();
}

const EVENT_COUNT = 2002;

beforeEach(() => {
  server.events.clear();
  server.calendars.clear();
  server.requests.length = 0;
  server.clock_ms = NOW_MS;
  crypto_state.poisoned.clear();
  reset_calendar_seeding();
  set_sync_store_adapter(new MemorySyncStore());
  calendar_sync_engine.reset();
});

afterEach(() => {
  set_sync_store_adapter(null);
});

describe("large calendar import", { timeout: 120_000 }, () => {
  it("parses every generated event with valid dates", () => {
    const parsed = parse_ics_events(generated_feed(EVENT_COUNT));

    expect(parsed).toHaveLength(EVENT_COUNT);
    for (const entry of parsed) {
      expect(Number.isNaN(Date.parse(entry.starts_at))).toBe(false);
      expect(Number.isNaN(Date.parse(entry.ends_at))).toBe(false);
      expect(Date.parse(entry.ends_at)).toBeGreaterThanOrEqual(
        Date.parse(entry.starts_at),
      );
    }
  });

  it("shows every imported event on the importing device", async () => {
    await list_calendars();
    const target = default_calendar_id();
    const parsed = parse_ics_events(generated_feed(EVENT_COUNT));
    const created = await import_entries(parsed, target);

    expect(created).toHaveLength(EVENT_COUNT);
    expect(server.events.size).toBe(EVENT_COUNT);

    server.clock_ms += 60 * 60 * 1000;
    await calendar_sync_engine.pull_delta();

    expect(calendar_sync_engine.get_events()).toHaveLength(EVENT_COUNT);
  });

  it("keeps queue work linear while a large import runs", async () => {
    await list_calendars();
    const target = default_calendar_id();
    const original_clone = globalThis.structuredClone;
    let clone_count = 0;

    globalThis.structuredClone = ((
      value: unknown,
      options?: StructuredSerializeOptions,
    ) => {
      clone_count += 1;

      return original_clone(value, options);
    }) as typeof structuredClone;

    try {
      await import_entries(
        parse_ics_events(generated_feed(EVENT_COUNT)),
        target,
      );
    } finally {
      globalThis.structuredClone = original_clone;
    }

    expect(clone_count).toBeLessThan(EVENT_COUNT);
  });

  it("loads more than the legacy row cap on a new device", async () => {
    await list_calendars();
    const target = default_calendar_id();

    await import_entries(parse_ics_events(generated_feed(EVENT_COUNT)), target);
    server.clock_ms += 60 * 60 * 1000;
    await fresh_device();
    await list_calendars();

    expect(calendar_sync_engine.get_events()).toHaveLength(EVENT_COUNT);
    expect(
      server.requests.some((request) => request === "GET /calendar/v1/events"),
    ).toBe(false);

    const shown = await list_events(new Date(PAST_START), new Date(FUTURE_END));
    const masters = new Set(
      shown.data.map((event) => event.recurrence_master_id ?? event.id),
    );

    expect(masters.size).toBe(EVENT_COUNT);
  });

  it("keeps the rest of the calendar when some rows fail to decrypt", async () => {
    await list_calendars();
    const target = default_calendar_id();
    const created = await import_entries(
      parse_ics_events(generated_feed(EVENT_COUNT)),
      target,
    );

    crypto_state.poisoned.add(created[3]);
    crypto_state.poisoned.add(created[1500]);
    server.clock_ms += 60 * 60 * 1000;
    await fresh_device();
    await list_calendars();

    expect(calendar_sync_engine.get_events()).toHaveLength(EVENT_COUNT - 2);
    expect(calendar_sync_engine.failed_decrypt_ids().event_ids.length).toBe(2);
  });
});
