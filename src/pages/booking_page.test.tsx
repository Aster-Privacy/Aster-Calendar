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
import type { PublicSchedule } from "@/services/calendar/appointments";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import BookingPage from "./booking_page";

const fetch_public_schedule = vi.fn();
const book_public_slot = vi.fn();

vi.mock("@/services/calendar/appointments", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/calendar/appointments")
  >()),
  fetch_public_schedule: (...args: unknown[]) => fetch_public_schedule(...args),
  book_public_slot: (...args: unknown[]) => book_public_slot(...args),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/components/auth/turnstile_widget", () => ({
  TURNSTILE_SITE_KEY: "",
  TurnstileWidget: () => null,
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ slug: "coffee" }),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SEALING_KEY = { ecdh: new Uint8Array(65).fill(4), pq: null };

function schedule_with(overrides: Partial<PublicSchedule>): PublicSchedule {
  return {
    title: "Coffee",
    duration_minutes: 30,
    windows: Array.from({ length: 7 }, (_, day) => ({
      day,
      start_minute: 0,
      end_minute: 1440,
    })),
    timezone: "UTC",
    booked_starts: [],
    show_branding: false,
    schedule_id: null,
    sealing_key: SEALING_KEY,
    booking_unavailable: false,
    ...overrides,
  } as PublicSchedule;
}

let container: HTMLDivElement;
let root: Root;

async function render_page(schedule: PublicSchedule) {
  fetch_public_schedule.mockResolvedValue({ status: "ok", schedule });

  await act(async () => {
    root.render(<BookingPage />);
  });

  for (
    let attempt = 0;
    attempt < 50 && container.textContent?.includes("calendar.booking_loading");
    attempt += 1
  ) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

function slot_buttons(): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      "button[aria-pressed]:not([data-day-index])",
    ),
  );
}

describe("BookingPage booking availability", () => {
  beforeEach(() => {
    fetch_public_schedule.mockReset();
    book_public_slot.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("offers open slots when the page can seal booking details", async () => {
    await render_page(schedule_with({}));

    expect(slot_buttons().length).toBeGreaterThan(0);
    expect(slot_buttons().every((button) => !button.disabled)).toBe(true);
    expect(container.textContent).not.toContain(
      "calendar.booking_sealing_unavailable",
    );
  });

  it("shows booking as unavailable on load when the page has no sealing key", async () => {
    await render_page(schedule_with({ sealing_key: null }));

    expect(container.textContent).toContain("Coffee");
    expect(container.textContent).toContain(
      "calendar.booking_sealing_unavailable",
    );
    expect(slot_buttons().length).toBeGreaterThan(0);
    expect(slot_buttons().every((button) => button.disabled)).toBe(true);
  });

  it("shows booking as unavailable on load when the server marks it so", async () => {
    await render_page(schedule_with({ booking_unavailable: true }));

    expect(container.textContent).toContain(
      "calendar.booking_sealing_unavailable",
    );
    expect(slot_buttons().every((button) => button.disabled)).toBe(true);

    slot_buttons()[0]?.click();

    expect(book_public_slot).not.toHaveBeenCalled();
  });

  it("shows booking as unavailable before any day is selected", async () => {
    await render_page(
      schedule_with({
        windows: [],
        sealing_key: null,
        booking_unavailable: true,
      }),
    );

    expect(
      container.querySelector('[data-day-index][aria-pressed="true"]'),
    ).toBeNull();
    expect(container.textContent).toContain("calendar.booking_no_slots");
    expect(container.textContent).toContain(
      "calendar.booking_sealing_unavailable",
    );
  });

  it("shows booking as unavailable on load when the sealing key is malformed", async () => {
    await render_page(schedule_with({ sealing_key: "invalid" }));

    expect(container.textContent).toContain(
      "calendar.booking_sealing_unavailable",
    );
    expect(slot_buttons().every((button) => button.disabled)).toBe(true);
  });
});
