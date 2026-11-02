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

import { mailto_href } from "@/services/calendar/mailto";

describe("mailto_href", () => {
  it("keeps the at sign readable", () => {
    expect(mailto_href(" Ada@Example.COM ")).toBe("mailto:Ada@example.com");
  });

  it("encodes characters that are unsafe in a url", () => {
    expect(mailto_href("a+b&c?d@example.com")).toBe(
      "mailto:a%2Bb%26c%3Fd@example.com",
    );
  });

  it("rejects addresses that could inject headers or other targets", () => {
    for (const address of [
      "",
      "plain",
      "@example.com",
      "a@b@example.com",
      "a@example.com?cc=x@example.com",
      "a@example.com\r\nBcc: x@example.com",
      "a b@example.com",
      "a..b@example.com",
      "a@-example.com",
      "a@localhost",
      "javascript:alert(1)@example.com",
    ]) {
      expect(mailto_href(address)).toBeNull();
    }
  });
});
