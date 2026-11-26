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
  is_paid_plan_code,
  plan_settled,
} from "@/components/settings/plan_gate";

describe("plan_settled", () => {
  it("waits while limits are loading with no hint", () => {
    expect(
      plan_settled({ has_limits: false, plan_code: null, is_loading: true }),
    ).toBe(false);
  });

  it("settles from cached limits during a refetch", () => {
    expect(
      plan_settled({ has_limits: true, plan_code: "free", is_loading: true }),
    ).toBe(true);
  });

  it("settles from the plan hint before limits arrive", () => {
    expect(
      plan_settled({ has_limits: false, plan_code: "nova", is_loading: true }),
    ).toBe(true);
  });

  it("settles when loading ends without limits", () => {
    expect(
      plan_settled({ has_limits: false, plan_code: null, is_loading: false }),
    ).toBe(true);
  });
});

describe("is_paid_plan_code", () => {
  it("treats the free plan as unpaid", () => {
    expect(is_paid_plan_code("free", false)).toBe(false);
  });

  it("treats other plans as paid", () => {
    expect(is_paid_plan_code("nova", false)).toBe(true);
  });

  it("falls back to the load failure flag with no plan", () => {
    expect(is_paid_plan_code(null, false)).toBe(false);
    expect(is_paid_plan_code(null, true)).toBe(true);
  });
});
