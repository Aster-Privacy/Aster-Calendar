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

import { describe, it, expect } from "vitest";

import { meets_min_search_length, min_search_length } from "./search_query";

describe("min_search_length", () => {
  it("requires two characters for latin queries", () => {
    expect(min_search_length("a")).toBe(2);
    expect(min_search_length("hello")).toBe(2);
  });

  it("allows a single character for scripts where one glyph is a word", () => {
    expect(min_search_length("税")).toBe(1);
    expect(min_search_length("あ")).toBe(1);
    expect(min_search_length("한")).toBe(1);
  });
});

describe("meets_min_search_length", () => {
  it("rejects a single latin character", () => {
    expect(meets_min_search_length("a")).toBe(false);
  });

  it("accepts a single ideograph", () => {
    expect(meets_min_search_length("税")).toBe(true);
  });

  it("accepts two latin characters", () => {
    expect(meets_min_search_length("hi")).toBe(true);
  });
});
