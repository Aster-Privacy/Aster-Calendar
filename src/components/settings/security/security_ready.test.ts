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
  platform_buttons_ready,
  security_ready,
  type SecurityReadyInput,
} from "@/components/settings/security/security_ready";

const settled: SecurityReadyInput = {
  totp_known: true,
  totp_status_failed: false,
  login_alerts_loaded: true,
  login_alerts_failed: false,
  login_events_loading: false,
  login_events_failed: false,
  login_events_count: 0,
};

describe("security_ready", () => {
  it("is ready when every source has loaded", () => {
    expect(security_ready(settled)).toBe(true);
  });

  it("waits for the two-factor status", () => {
    expect(security_ready({ ...settled, totp_known: false })).toBe(false);
  });

  it("settles the two-factor status on failure", () => {
    expect(
      security_ready({
        ...settled,
        totp_known: false,
        totp_status_failed: true,
      }),
    ).toBe(true);
  });

  it("waits for login alerts unless they failed", () => {
    expect(security_ready({ ...settled, login_alerts_loaded: false })).toBe(
      false,
    );
    expect(
      security_ready({
        ...settled,
        login_alerts_loaded: false,
        login_alerts_failed: true,
      }),
    ).toBe(true);
  });

  it("waits for login events unless they failed or are cached", () => {
    const loading = { ...settled, login_events_loading: true };

    expect(security_ready(loading)).toBe(false);
    expect(security_ready({ ...loading, login_events_failed: true })).toBe(
      true,
    );
    expect(security_ready({ ...loading, login_events_count: 3 })).toBe(true);
  });
});

describe("platform_buttons_ready", () => {
  it("waits for the platform probe", () => {
    expect(platform_buttons_ready(null)).toBe(false);
    expect(platform_buttons_ready(false)).toBe(true);
    expect(platform_buttons_ready(true)).toBe(true);
  });
});
