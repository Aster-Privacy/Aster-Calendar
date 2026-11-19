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
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

const h = vi.hoisted(() => ({ vault: null as unknown }));

vi.mock("@/services/crypto/memory_key_store", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => "correct horse battery staple",
  get_passphrase_bytes: () => new Uint8Array(32).fill(1),
  wait_for_keys_ready: vi.fn(async () => {}),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({ code: "NOT_FOUND" })),
    put: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({})),
  },
}));

import {
  parse_booking_sealing_key,
  seal_booking_details,
} from "@/services/calendar/booking_seal";
import { open_booking } from "@/services/calendar/appointments";
import {
  decrypt_inbound_ecies,
  decrypt_inbound_pq_hybrid,
} from "@/services/crypto/decrypt_envelope";
import { array_to_base64 } from "@/services/crypto/base64";

const DETAILS = {
  guest_email: "Guest@Example.com",
  guest_name: "Guest Name",
  note: "Looking forward to it",
};

const SCHEDULE_ID = "6f1c2b9e-3d4a-4b5c-8d6e-7f8091a2b3c4";
const OTHER_SCHEDULE_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const STARTS_AT = "2030-01-01T10:00:00.000Z";
const CONTEXT = {
  schedule_id: SCHEDULE_ID,
  starts_at: STARTS_AT,
};
const BOUND_DETAILS = {
  ...DETAILS,
  schedule_id: SCHEDULE_ID,
  starts_at: STARTS_AT,
};

async function generate_identity() {
  const keypair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const pq_seed = crypto.getRandomValues(new Uint8Array(64));
  const pq = ml_kem768.keygen(pq_seed);

  return {
    private_jwk_str: JSON.stringify(
      await crypto.subtle.exportKey("jwk", keypair.privateKey),
    ),
    public_raw: new Uint8Array(
      await crypto.subtle.exportKey("raw", keypair.publicKey),
    ),
    pq_seed_b64: array_to_base64(pq_seed),
    pq_public: pq.publicKey,
    pq_secret_b64: array_to_base64(pq.secretKey),
  };
}

function bytes_of(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function parsed_details(plain: Uint8Array | null): unknown {
  return plain ? JSON.parse(new TextDecoder().decode(plain)) : null;
}

describe("parse_booking_sealing_key", () => {
  it("accepts a valid uncompressed point and an ML-KEM key", async () => {
    const identity = await generate_identity();
    const key = parse_booking_sealing_key({
      ecdh: array_to_base64(identity.public_raw),
      pq: array_to_base64(identity.pq_public),
    });

    expect(key).not.toBe("invalid");
    if (key === "invalid") return;
    expect(key?.ecdh).toEqual(identity.public_raw);
    expect(key?.pq).toEqual(identity.pq_public);
  });

  it("accepts a curve key without a post-quantum key", async () => {
    const identity = await generate_identity();
    const key = parse_booking_sealing_key({
      ecdh: array_to_base64(identity.public_raw),
    });

    expect(key).toEqual({ ecdh: identity.public_raw, pq: null });
  });

  it("treats a missing key as no key", () => {
    expect(parse_booking_sealing_key(undefined)).toBeNull();
    expect(parse_booking_sealing_key(null)).toBeNull();
  });

  it("marks a malformed post-quantum key invalid instead of dropping it", async () => {
    const identity = await generate_identity();

    expect(
      parse_booking_sealing_key({
        ecdh: array_to_base64(identity.public_raw),
        pq: array_to_base64(new Uint8Array(10)),
      }),
    ).toBe("invalid");
    expect(
      parse_booking_sealing_key({
        ecdh: array_to_base64(identity.public_raw),
        pq: "not base64!",
      }),
    ).toBe("invalid");
  });

  it("marks malformed or off-curve keys invalid", () => {
    const off_curve = new Uint8Array(65).fill(7);

    off_curve[0] = 0x04;

    expect(parse_booking_sealing_key("key")).toBe("invalid");
    expect(parse_booking_sealing_key({})).toBe("invalid");
    expect(parse_booking_sealing_key({ ecdh: "not base64!" })).toBe("invalid");
    expect(
      parse_booking_sealing_key({ ecdh: array_to_base64(new Uint8Array(33)) }),
    ).toBe("invalid");
    expect(
      parse_booking_sealing_key({ ecdh: array_to_base64(off_curve) }),
    ).toBe("invalid");
  });
});

describe("seal_booking_details", () => {
  it("seals to the owner key so only the owner can read the details", async () => {
    const identity = await generate_identity();
    const sealed = await seal_booking_details(
      DETAILS,
      { ecdh: identity.public_raw, pq: null },
      CONTEXT,
    );
    const bytes = bytes_of(sealed.sealed_details);

    expect(bytes[0]).toBe(0x03);
    expect(sealed.sealed_details).not.toContain("Guest");
    expect(
      parsed_details(
        await decrypt_inbound_ecies(
          bytes,
          bytes_of(sealed.details_nonce),
          identity.private_jwk_str,
          true,
        ),
      ),
    ).toEqual(BOUND_DETAILS);

    const other = await generate_identity();

    expect(
      await decrypt_inbound_ecies(
        bytes,
        bytes_of(sealed.details_nonce),
        other.private_jwk_str,
        true,
      ),
    ).toBeNull();
  });

  it("uses the post-quantum hybrid when the owner has an ML-KEM key", async () => {
    const identity = await generate_identity();
    const sealed = await seal_booking_details(
      DETAILS,
      { ecdh: identity.public_raw, pq: identity.pq_public },
      CONTEXT,
    );
    const bytes = bytes_of(sealed.sealed_details);

    expect(bytes[0]).toBe(0x04);
    expect(
      parsed_details(
        await decrypt_inbound_pq_hybrid(
          bytes,
          bytes_of(sealed.details_nonce),
          identity.private_jwk_str,
          identity.pq_secret_b64,
        ),
      ),
    ).toEqual(BOUND_DETAILS);
  });

  it("refuses to seal to a malformed key", async () => {
    const identity = await generate_identity();

    await expect(
      seal_booking_details(
        DETAILS,
        { ecdh: identity.public_raw, pq: new Uint8Array(10) },
        CONTEXT,
      ),
    ).rejects.toThrow();
    await expect(
      seal_booking_details(
        DETAILS,
        { ecdh: new Uint8Array(33), pq: null },
        CONTEXT,
      ),
    ).rejects.toThrow();
  });

  it("carries no guest identifier beside the sealed details", async () => {
    const identity = await generate_identity();
    const sealed = await seal_booking_details(
      DETAILS,
      { ecdh: identity.public_raw, pq: null },
      CONTEXT,
    );

    expect(Object.keys(sealed).sort()).toEqual([
      "details_nonce",
      "sealed_details",
    ]);
  });
});

describe("open_booking with guest-sealed details", () => {
  beforeEach(() => {
    h.vault = null;
  });

  it("opens details the guest sealed in the browser", async () => {
    const identity = await generate_identity();

    h.vault = {
      identity_key: "",
      ratchet_identity_key: identity.private_jwk_str,
      ratchet_identity_public: array_to_base64(identity.public_raw),
      ratchet_pq_identity_seed: identity.pq_seed_b64,
    };

    const sealed = await seal_booking_details(
      DETAILS,
      { ecdh: identity.public_raw, pq: identity.pq_public },
      CONTEXT,
    );
    const booking = await open_booking({
      details_nonce: sealed.details_nonce,
      ends_at: "2030-01-01T10:30:00Z",
      id: "booking-1",
      schedule_id: SCHEDULE_ID,
      schedule_title: "Intro call",
      sealed_details: sealed.sealed_details,
      starts_at: "2030-01-01T10:00:00Z",
    });

    expect(booking.guest_name).toBe(DETAILS.guest_name);
    expect(booking.guest_email).toBe(DETAILS.guest_email);
    expect(booking.note).toBe(DETAILS.note);
  });

  it("hides details sealed for another slot or schedule", async () => {
    const identity = await generate_identity();

    h.vault = {
      identity_key: "",
      ratchet_identity_key: identity.private_jwk_str,
      ratchet_identity_public: array_to_base64(identity.public_raw),
      ratchet_pq_identity_seed: identity.pq_seed_b64,
    };

    const sealed = await seal_booking_details(
      DETAILS,
      { ecdh: identity.public_raw, pq: identity.pq_public },
      CONTEXT,
    );
    const record = {
      details_nonce: sealed.details_nonce,
      ends_at: "2030-01-02T10:30:00Z",
      id: "booking-2",
      schedule_id: SCHEDULE_ID,
      schedule_title: "Intro call",
      sealed_details: sealed.sealed_details,
      starts_at: "2030-01-02T10:00:00Z",
    };
    const blank = { guest_email: "", guest_name: "", note: "" };

    expect(await open_booking(record)).toMatchObject(blank);
    expect(
      await open_booking({
        ...record,
        schedule_id: OTHER_SCHEDULE_ID,
        starts_at: STARTS_AT,
      }),
    ).toMatchObject(blank);
  });
});
