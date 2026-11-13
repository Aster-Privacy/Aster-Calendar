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
import { describe, expect, it } from "vitest";

import {
  link_device_url,
  mail_link_device_target,
  normalize_fingerprint,
} from "@/lib/device_link_commitment";

const BASE = "https://app.astermail.org/link-device";

describe("device link commitment", () => {
  it("groups a fingerprint in blocks of four", () => {
    expect(normalize_fingerprint("9b16af790a6ae2f255d3")).toBe(
      "9B16 AF79 0A6A E2F2 55D3",
    );
    expect(normalize_fingerprint("9B16-AF79-0A6A-E2F2-55D3")).toBe(
      "9B16 AF79 0A6A E2F2 55D3",
    );
  });

  it("refuses values that are not a fingerprint", () => {
    expect(normalize_fingerprint("9B16AF79")).toBeNull();
    expect(normalize_fingerprint("9B16AF790A6AE2F255D3AA")).toBeNull();
    expect(normalize_fingerprint("9B16AF790A6AE2F255DZ")).toBeNull();
    expect(normalize_fingerprint(null)).toBeNull();
    expect(normalize_fingerprint("0".repeat(65))).toBeNull();
  });

  it("puts the fingerprint in the link fragment", () => {
    expect(link_device_url(BASE, "9B16 AF79 0A6A E2F2 55D3")).toBe(
      `${BASE}#v=9B16AF790A6AE2F255D3`,
    );
    expect(() => link_device_url(BASE, "nope")).toThrow("fingerprint_required");
  });

  it("builds the mail app target from the page fragment", () => {
    expect(mail_link_device_target("#v=9B16AF790A6AE2F255D3")).toBe(
      `${BASE}#v=9B16AF790A6AE2F255D3`,
    );
    expect(mail_link_device_target("")).toBe(BASE);
    expect(mail_link_device_target("#")).toBe(BASE);
    expect(mail_link_device_target("#code=ABCD-EFGH")).toBe(BASE);
    expect(mail_link_device_target("#v=javascript:alert(1)")).toBe(BASE);
  });
});
