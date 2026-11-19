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

const get = vi.fn();
const post = vi.fn();
const del = vi.fn();
const decrypt_mail_envelope = vi.fn();

vi.mock("@/services/crypto/decrypt_envelope", () => ({
  decrypt_mail_envelope: (...args: unknown[]) => decrypt_mail_envelope(...args),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    delete: (...args: unknown[]) => del(...args),
  },
}));

const {
  book_public_slot,
  create_schedule,
  delete_booking,
  delete_schedule,
  fetch_public_schedule,
  is_booking_event,
  list_bookings,
  list_schedules,
} = await import("@/services/calendar/appointments");

const BOOKING = {
  starts_at: "2026-10-12T09:00:00.000Z",
  guest_name: "Guest",
  guest_email: "guest@example.com",
  note: "",
};

async function page_sealing() {
  const keypair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const ecdh = new Uint8Array(
    await crypto.subtle.exportKey("raw", keypair.publicKey),
  );

  return { schedule_id: null, sealing_key: { ecdh, pq: null } };
}

function http(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

let fetch_mock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  del.mockReset();
  decrypt_mail_envelope.mockReset();
  fetch_mock = vi.fn();
  vi.stubGlobal("fetch", fetch_mock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("appointment schedule api", () => {
  it("recognizes booking ids by prefix", () => {
    expect(is_booking_event({ id: "booking-1" })).toBe(true);
    expect(is_booking_event({ id: "evt-1" })).toBe(false);
  });

  it("lists, creates, and deletes schedules through the api client", async () => {
    get.mockResolvedValue({ data: [] });
    post.mockResolvedValue({ data: { id: "s1" } });
    del.mockResolvedValue({ data: { success: true } });

    await list_schedules();
    expect(get).toHaveBeenCalledWith("/calendar/v1/schedules", {
      silent_statuses: [404],
    });

    const request = {
      slug: "coffee",
      title: "Coffee",
      duration_minutes: 30,
      windows: [{ day: 1, start_minute: 540, end_minute: 1020 }],
      timezone: "UTC",
    };

    await create_schedule(request);
    expect(post).toHaveBeenCalledWith("/calendar/v1/schedules", request);

    await delete_schedule("s1");
    expect(del).toHaveBeenCalledWith("/calendar/v1/schedules/s1");

    await delete_booking("b/1");
    expect(del).toHaveBeenCalledWith("/calendar/v1/schedule_bookings/b%2F1");
  });

  it("lists bookings for an encoded time range", async () => {
    get.mockResolvedValue({ data: [] });

    const start = new Date("2026-10-01T00:00:00.000Z");
    const end = new Date("2026-10-31T00:00:00.000Z");

    await list_bookings(start, end);

    expect(get).toHaveBeenCalledWith(
      `/calendar/v1/schedule_bookings?start=${encodeURIComponent(
        start.toISOString(),
      )}&end=${encodeURIComponent(end.toISOString())}`,
      { silent_statuses: [404] },
    );
  });
});

describe("sealed booking details", () => {
  const sealed = {
    id: "b1",
    schedule_id: "s1",
    schedule_title: "Coffee",
    starts_at: "2026-10-12T09:00:00.000Z",
    ends_at: "2026-10-12T09:30:00.000Z",
    sealed_details: "c2VhbGVk",
    details_nonce: "bm9uY2Vub25jZTEy",
  };

  it("opens the guest details with the mail envelope key", async () => {
    get.mockResolvedValue({ data: [sealed] });
    decrypt_mail_envelope.mockResolvedValue({
      guest_name: "Guest",
      guest_email: "guest@example.com",
      note: "Hi",
    });

    const response = await list_bookings(new Date(0), new Date(1));

    expect(decrypt_mail_envelope).toHaveBeenCalledWith(
      sealed.sealed_details,
      sealed.details_nonce,
    );
    expect(response.data).toEqual([
      {
        id: "b1",
        schedule_id: "s1",
        schedule_title: "Coffee",
        starts_at: sealed.starts_at,
        ends_at: sealed.ends_at,
        guest_name: "Guest",
        guest_email: "guest@example.com",
        note: "Hi",
      },
    ]);
  });

  it("never reads booking details that are not sealed", async () => {
    get.mockResolvedValue({
      data: [
        {
          ...sealed,
          sealed_details: btoa(JSON.stringify({ guest_name: "Guest" })),
          details_nonce: "",
        },
      ],
    });

    const response = await list_bookings(new Date(0), new Date(1));

    expect(decrypt_mail_envelope).not.toHaveBeenCalled();
    expect(response.data?.[0]).toMatchObject({ id: "b1", guest_name: "" });
  });

  it("keeps the booking with empty details when they cannot be opened", async () => {
    get.mockResolvedValue({ data: [sealed] });
    decrypt_mail_envelope.mockRejectedValue(new Error("locked"));

    const response = await list_bookings(new Date(0), new Date(1));

    expect(response.data?.[0]).toMatchObject({
      id: "b1",
      guest_name: "",
      guest_email: "",
      note: "",
    });
  });

  it("ignores details that are not strings", async () => {
    get.mockResolvedValue({ data: [sealed] });
    decrypt_mail_envelope.mockResolvedValue({ guest_name: 7, note: null });

    const response = await list_bookings(new Date(0), new Date(1));

    expect(response.data?.[0]).toMatchObject({ guest_name: "", note: "" });
  });
});

describe("public booking page", () => {
  it("returns the schedule when the page exists", async () => {
    const schedule = {
      title: "Coffee",
      duration_minutes: 30,
      windows: [],
      timezone: "UTC",
      booked_starts: [],
      show_branding: false,
    };

    fetch_mock.mockResolvedValue(http(200, schedule));

    expect(await fetch_public_schedule("my slug")).toEqual({
      status: "ok",
      schedule: {
        ...schedule,
        schedule_id: null,
        sealing_key: null,
        booking_unavailable: false,
      },
    });
    expect(fetch_mock).toHaveBeenCalledWith(
      "/api/calendar/v1/public/booking/my%20slug",
    );
  });

  it("keeps the page but marks booking unavailable when the server says so", async () => {
    fetch_mock.mockResolvedValue(
      http(200, {
        title: "Coffee",
        duration_minutes: 30,
        windows: [],
        timezone: "UTC",
        booked_starts: [],
        show_branding: false,
        booking_unavailable: true,
      }),
    );

    const result = await fetch_public_schedule("coffee");

    expect(result.status).toBe("ok");
    expect(result).toMatchObject({
      schedule: { title: "Coffee", booking_unavailable: true },
    });
  });

  it("keeps the schedule id only when it is a valid identifier", async () => {
    const base = {
      title: "Coffee",
      duration_minutes: 30,
      windows: [],
      timezone: "UTC",
      booked_starts: [],
    };

    fetch_mock.mockResolvedValueOnce(
      http(200, { ...base, id: "6F1C2B9E-3D4A-4B5C-8D6E-7F8091A2B3C4" }),
    );
    expect(await fetch_public_schedule("coffee")).toMatchObject({
      schedule: { schedule_id: "6f1c2b9e-3d4a-4b5c-8d6e-7f8091a2b3c4" },
    });

    fetch_mock.mockResolvedValueOnce(http(200, { ...base, id: "../owner" }));
    expect(await fetch_public_schedule("coffee")).toMatchObject({
      schedule: { schedule_id: null },
    });
  });

  it("distinguishes a missing page from a server error", async () => {
    fetch_mock.mockResolvedValueOnce(http(404));
    expect(await fetch_public_schedule("gone")).toEqual({
      status: "not_found",
    });

    fetch_mock.mockResolvedValueOnce(http(500));
    expect(await fetch_public_schedule("broken")).toEqual({ status: "error" });

    fetch_mock.mockRejectedValueOnce(new Error("offline"));
    expect(await fetch_public_schedule("offline")).toEqual({ status: "error" });
  });

  it("sends only sealed details when the page offers a sealing key", async () => {
    const keypair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    );
    const ecdh = new Uint8Array(
      await crypto.subtle.exportKey("raw", keypair.publicKey),
    );

    fetch_mock.mockResolvedValueOnce(http(201));
    expect(
      await book_public_slot("coffee", BOOKING, {
        schedule_id: null,
        sealing_key: { ecdh, pq: null },
      }),
    ).toBe("booked");

    const [, init] = fetch_mock.mock.lastCall as [string, { body: string }];
    const body = JSON.parse(init.body) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual([
      "details_nonce",
      "sealed_details",
      "starts_at",
    ]);
    expect(init.body).not.toContain(BOOKING.guest_email);
    expect(init.body).not.toContain(BOOKING.guest_name);
  });

  it("refuses to send the booking when the page has no sealing key", async () => {
    fetch_mock.mockResolvedValue(http(201));

    expect(await book_public_slot("coffee", BOOKING)).toBe(
      "sealing_unavailable",
    );
    expect(
      await book_public_slot("coffee", BOOKING, {
        schedule_id: null,
        sealing_key: null,
      }),
    ).toBe("sealing_unavailable");
    expect(fetch_mock).not.toHaveBeenCalled();
  });

  it("refuses to book when the page offers a malformed sealing key", async () => {
    const keypair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    );
    const ecdh = new Uint8Array(
      await crypto.subtle.exportKey("raw", keypair.publicKey),
    );
    let binary = "";

    for (const byte of ecdh) binary += String.fromCharCode(byte);

    fetch_mock.mockResolvedValueOnce(
      http(200, {
        title: "Coffee",
        duration_minutes: 30,
        windows: [],
        timezone: "UTC",
        booked_starts: [],
        sealing_key: { ecdh: btoa(binary), pq: btoa("short") },
      }),
    );

    const page = await fetch_public_schedule("coffee");

    if (page.status !== "ok") throw new Error("schedule did not load");

    fetch_mock.mockClear();
    fetch_mock.mockResolvedValue(http(201));

    expect(await book_public_slot("coffee", BOOKING, page.schedule)).toBe(
      "sealing_unavailable",
    );
    expect(fetch_mock).not.toHaveBeenCalled();
  });

  it("posts the sealed booking as json and maps every outcome", async () => {
    const sealing = await page_sealing();

    fetch_mock.mockResolvedValueOnce(http(201));
    expect(await book_public_slot("coffee", BOOKING, sealing)).toBe("booked");
    expect(fetch_mock).toHaveBeenLastCalledWith(
      "/api/calendar/v1/public/booking/coffee",
      expect.objectContaining({
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    fetch_mock.mockResolvedValueOnce(http(429));
    expect(await book_public_slot("coffee", BOOKING, sealing)).toBe(
      "rate_limited",
    );

    fetch_mock.mockResolvedValueOnce(http(403));
    expect(await book_public_slot("coffee", BOOKING, sealing)).toBe(
      "verification_failed",
    );

    fetch_mock.mockResolvedValueOnce(
      http(409, { code: "BOOKING_LIMIT_REACHED" }),
    );
    expect(await book_public_slot("coffee", BOOKING, sealing)).toBe(
      "limit_reached",
    );

    fetch_mock.mockResolvedValueOnce(http(409, { code: "SLOT_TAKEN" }));
    expect(await book_public_slot("coffee", BOOKING, sealing)).toBe(
      "slot_taken",
    );

    fetch_mock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    expect(await book_public_slot("coffee", BOOKING, sealing)).toBe(
      "slot_taken",
    );

    fetch_mock.mockResolvedValueOnce(
      http(400, { code: "BOOKING_SEALING_REQUIRED" }),
    );
    expect(await book_public_slot("coffee", BOOKING, sealing)).toBe(
      "sealing_required",
    );

    fetch_mock.mockResolvedValueOnce(http(400, { code: "VALIDATION_ERROR" }));
    expect(await book_public_slot("coffee", BOOKING, sealing)).toBe("failed");

    fetch_mock.mockResolvedValueOnce(http(500));
    expect(await book_public_slot("coffee", BOOKING, sealing)).toBe("failed");

    fetch_mock.mockRejectedValueOnce(new Error("offline"));
    expect(await book_public_slot("coffee", BOOKING, sealing)).toBe("failed");
  });

  it("sends the security check token with the booking", async () => {
    fetch_mock.mockResolvedValueOnce(http(201));
    const with_token = { ...BOOKING, turnstile_token: "token-1" };

    expect(
      await book_public_slot("coffee", with_token, await page_sealing()),
    ).toBe("booked");
    expect(
      JSON.parse(
        (fetch_mock.mock.calls.at(-1)?.[1] as RequestInit).body as string,
      ),
    ).toMatchObject({ turnstile_token: "token-1" });
  });
});
