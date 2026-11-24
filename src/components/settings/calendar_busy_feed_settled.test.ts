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

import { busy_feeds_settled } from "@/components/settings/calendar_busy_feed_section";

describe("busy_feeds_settled", () => {
  it("waits until availability is known", () => {
    expect(busy_feeds_settled(null)).toBe(false);
  });

  it("settles whether or not feeds are available", () => {
    expect(busy_feeds_settled(true)).toBe(true);
    expect(busy_feeds_settled(false)).toBe(true);
  });
});
