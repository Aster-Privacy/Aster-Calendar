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
import { p256 } from "@noble/curves/nist";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

export interface BookingSealingKey {
  ecdh: Uint8Array;
  pq: Uint8Array | null;
}

export interface BookingGuestDetails {
  guest_name: string;
  guest_email: string;
  note: string;
}

interface BookingSealContext {
  starts_at: string;
  schedule_id: string | null;
}

interface SealedBookingDetails {
  sealed_details: string;
  details_nonce: string;
}

const ECIES_MARKER = 0x02;
const ECIES_COMPRESSED_MARKER = 0x03;
const PQ_HYBRID_MARKER = 0x04;
const P256_UNCOMPRESSED_LEN = 65;
const ML_KEM_768_EK_LEN = 1184;
const ECIES_INFO = new TextEncoder().encode("aster-inbound-v1");
const PQ_HYBRID_INFO = new TextEncoder().encode("aster-inbound-pq-v1");

function decode_base64(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || value.length === 0) return null;

  try {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function encode_base64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary);
}

function is_valid_point(bytes: Uint8Array): boolean {
  try {
    p256.ProjectivePoint.fromHex(bytes).assertValidity();

    return true;
  } catch {
    return false;
  }
}

export type ParsedBookingSealingKey = BookingSealingKey | "invalid" | null;

function is_valid_sealing_key(key: BookingSealingKey): boolean {
  return (
    key.ecdh.length === P256_UNCOMPRESSED_LEN &&
    is_valid_point(key.ecdh) &&
    (key.pq === null || key.pq.length === ML_KEM_768_EK_LEN)
  );
}

export function parse_booking_sealing_key(
  raw: unknown,
): ParsedBookingSealingKey {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") return "invalid";

  const value = raw as Record<string, unknown>;
  const ecdh = decode_base64(value.ecdh);
  const has_pq = value.pq !== undefined && value.pq !== null;
  const pq = has_pq ? decode_base64(value.pq) : null;

  if (!ecdh || (has_pq && !pq)) return "invalid";

  const key = { ecdh, pq };

  return is_valid_sealing_key(key) ? key : "invalid";
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;

  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));

  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function aes_key_from(
  ikm: Uint8Array,
  info: Uint8Array,
): Promise<CryptoKey> {
  const hkdf_key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveKey",
  ]);

  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info },
    hkdf_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
}

function pq_encapsulation(
  pq_key: Uint8Array | null,
): { cipher_text: Uint8Array; shared_secret: Uint8Array } | null {
  if (!pq_key) return null;

  const { cipherText, sharedSecret } = ml_kem768.encapsulate(pq_key);

  return { cipher_text: cipherText, shared_secret: sharedSecret };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

export async function seal_booking_details(
  details: BookingGuestDetails,
  key: BookingSealingKey,
  context: BookingSealContext,
): Promise<SealedBookingDetails> {
  if (!is_valid_sealing_key(key)) {
    throw new Error("booking sealing key is not valid");
  }

  const bound = {
    ...details,
    starts_at: context.starts_at,
    ...(context.schedule_id ? { schedule_id: context.schedule_id } : {}),
  };
  const plaintext = new TextEncoder().encode(JSON.stringify(bound));
  const ephemeral_secret = p256.utils.randomPrivateKey();

  try {
    const ephemeral_public = p256.getPublicKey(ephemeral_secret, false);
    const shared_x = p256
      .getSharedSecret(ephemeral_secret, key.ecdh, false)
      .slice(1, 33);
    const compressed = await deflate(plaintext);
    const pq = compressed ? pq_encapsulation(key.pq) : null;
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const header = pq ? [ephemeral_public, pq.cipher_text] : [ephemeral_public];
    const marker = pq
      ? PQ_HYBRID_MARKER
      : compressed
        ? ECIES_COMPRESSED_MARKER
        : ECIES_MARKER;
    const aes_key = pq
      ? await aes_key_from(
          concat([shared_x, pq.shared_secret.slice(0, 32)]),
          PQ_HYBRID_INFO,
        )
      : await aes_key_from(shared_x, ECIES_INFO);

    pq?.shared_secret.fill(0);
    shared_x.fill(0);

    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce },
        aes_key,
        compressed ?? plaintext,
      ),
    );

    return {
      details_nonce: encode_base64(nonce),
      sealed_details: encode_base64(
        concat([Uint8Array.of(marker), ...header, ciphertext]),
      ),
    };
  } finally {
    ephemeral_secret.fill(0);
    plaintext.fill(0);
  }
}
