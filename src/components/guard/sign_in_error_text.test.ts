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
import { describe, expect, it } from "vitest";

import {
  is_guard_sign_in_error,
  sign_in_error_text,
} from "@/components/guard/sign_in_error_text";

const t = ((key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as never;

describe("sign_in_error_text", () => {
  it("shows the update message instead of the raw upgrade reply", () => {
    const raw = "Client upgrade required: send X-Aster-Guard";

    expect(
      sign_in_error_text(
        t,
        { error: raw, status: 426, server_code: "CLIENT_UPGRADE_REQUIRED" },
        "fallback",
      ),
    ).toBe("guard.error_upgrade");
    expect(
      sign_in_error_text(t, { error: raw, status: 426 }, "fallback"),
    ).toBe("guard.error_upgrade");
  });

  it("maps a paused Guard reply to its own message", () => {
    expect(
      sign_in_error_text(
        t,
        { error: "paused", status: 429, server_code: "GUARD_PAUSED" },
        "fallback",
      ),
    ).toBe("guard.error_paused_soon");
  });

  it("keeps other server messages as they are", () => {
    expect(
      sign_in_error_text(
        t,
        { error: "Invalid code", status: 400, server_code: "INVALID_CODE" },
        "fallback",
      ),
    ).toBe("Invalid code");
    expect(sign_in_error_text(t, { status: 500 }, "fallback")).toBe(
      "fallback",
    );
  });

  it("treats only Guard and upgrade replies as Guard errors", () => {
    expect(is_guard_sign_in_error({ status: 426 })).toBe(true);
    expect(is_guard_sign_in_error({ server_code: "GUARD_REQUIRED" })).toBe(
      true,
    );
    expect(is_guard_sign_in_error({ server_code: "PENDING_LOGIN_EXPIRED" })).toBe(
      false,
    );
  });
});
