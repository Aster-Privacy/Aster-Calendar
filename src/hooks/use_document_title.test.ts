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

import { format_app_title } from "./use_document_title";

describe("format_app_title", () => {
  it("puts the period, the user and the app in the title", () => {
    expect(format_app_title("November 2026", "alex", "Aster Calendar")).toBe(
      "November 2026 | Alex | Aster Calendar",
    );
  });

  it("falls back to the app name when the user has no name", () => {
    expect(format_app_title("November 2026", "  ", "Aster Calendar")).toBe(
      "November 2026 | Aster Calendar",
    );
  });

  it("shows only the workspace when there is no period", () => {
    expect(format_app_title("", "alex", "Aster Calendar")).toBe(
      "Alex | Aster Calendar",
    );
  });
});
