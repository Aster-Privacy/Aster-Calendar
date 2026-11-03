/*
 * Aster Communications Inc.
 *
 * Copyright (c) 2026 Aster Communications Inc.
 *
 * This file is part of this project.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { checkout_highlights } from "./checkout_highlights";

const echo_key = (key: string) => key;

const BOOKING_KEYS = [
  "settings.cal_plan_feat_booking",
  "settings.cal_plan_feat_no_branding",
];

describe("checkout_highlights booking gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("omits booking items while booking is off", () => {
    vi.stubEnv("VITE_CALENDAR_BOOKING_ENABLED", "");

    for (const plan of ["star", "nova", "supernova"]) {
      const items = checkout_highlights(plan, echo_key);

      expect(items).toContain("settings.cal_plan_feat_calendars");
      for (const key of BOOKING_KEYS) {
        expect(items).not.toContain(key);
      }
    }
  });

  it("lists booking items when booking is on", () => {
    vi.stubEnv("VITE_CALENDAR_BOOKING_ENABLED", "true");

    const items = checkout_highlights("nova", echo_key);

    for (const key of BOOKING_KEYS) {
      expect(items).toContain(key);
    }
  });
});
