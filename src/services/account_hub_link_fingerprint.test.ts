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

import { confirm_hub_link, HubAccountError } from "./account_hub_link";

describe("hub link request", () => {
  it.each([
    "",
    "9b16af790a6ae2f255d3",
    "9B16 AF79 0A6A E2F2",
    "9B16AF790A6AE2F255D3",
  ])(
    "refuses to ask for a link with the fingerprint %j",
    async (fingerprint) => {
      const frames = document.querySelectorAll("iframe").length;
      const failure = await confirm_hub_link(
        "ABCD2345",
        "acct_a",
        fingerprint,
      ).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(HubAccountError);
      expect((failure as HubAccountError).code).toBe("fingerprint_required");
      expect(document.querySelectorAll("iframe").length).toBe(frames);
    },
  );
});
