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
      schedule,
    });
    expect(fetch_mock).toHaveBeenCalledWith(
      "/api/calendar/v1/public/booking/my%20slug",
    );
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

  it("posts the booking as json and maps every outcome", async () => {
    fetch_mock.mockResolvedValueOnce(http(201));
    expect(await book_public_slot("coffee", BOOKING)).toBe("booked");
    expect(fetch_mock).toHaveBeenLastCalledWith(
      "/api/calendar/v1/public/booking/coffee",
      {
        body: JSON.stringify(BOOKING),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );

    fetch_mock.mockResolvedValueOnce(http(429));
    expect(await book_public_slot("coffee", BOOKING)).toBe("rate_limited");

    fetch_mock.mockResolvedValueOnce(http(403));
    expect(await book_public_slot("coffee", BOOKING)).toBe(
      "verification_failed",
    );

    fetch_mock.mockResolvedValueOnce(
      http(409, { code: "BOOKING_LIMIT_REACHED" }),
    );
    expect(await book_public_slot("coffee", BOOKING)).toBe("limit_reached");

    fetch_mock.mockResolvedValueOnce(http(409, { code: "SLOT_TAKEN" }));
    expect(await book_public_slot("coffee", BOOKING)).toBe("slot_taken");

    fetch_mock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    expect(await book_public_slot("coffee", BOOKING)).toBe("slot_taken");

    fetch_mock.mockResolvedValueOnce(http(500));
    expect(await book_public_slot("coffee", BOOKING)).toBe("failed");

    fetch_mock.mockRejectedValueOnce(new Error("offline"));
    expect(await book_public_slot("coffee", BOOKING)).toBe("failed");
  });

  it("sends the security check token with the booking", async () => {
    fetch_mock.mockResolvedValueOnce(http(201));
    const with_token = { ...BOOKING, turnstile_token: "token-1" };

    expect(await book_public_slot("coffee", with_token)).toBe("booked");
    expect(
      JSON.parse(
        (fetch_mock.mock.calls.at(-1)?.[1] as RequestInit).body as string,
      ),
    ).toMatchObject({ turnstile_token: "token-1" });
  });
});
