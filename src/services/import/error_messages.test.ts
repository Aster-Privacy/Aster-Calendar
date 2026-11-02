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

import { parse_eml_file } from "./eml_parser";
import { parse_csv_file } from "./csv_parser";
import { parse_pst_file } from "./pst_parser";

function oversized_file(name: string, size: number): File {
  return { name, size } as File;
}

describe("import error messages substitute placeholders (no literal {{ }})", () => {
  it("eml oversized error fills size and limit", async () => {
    const result = await parse_eml_file(
      oversized_file("big.eml", 60 * 1024 * 1024),
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).not.toContain("{{");
    expect(result.errors[0]).toContain("60.0");
    expect(result.errors[0]).toContain("50");
  });

  it("csv oversized error fills size and limit", async () => {
    const result = await parse_csv_file(
      oversized_file("big.csv", 600 * 1024 * 1024),
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).not.toContain("{{");
    expect(result.errors[0]).toContain("600.0");
    expect(result.errors[0]).toContain("500");
  });

  it("pst oversized error fills size and limit", async () => {
    const result = await parse_pst_file(
      oversized_file("big.pst", 600 * 1024 * 1024),
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).not.toContain("{{");
    expect(result.errors[0]).toContain("600.0");
  });
});
