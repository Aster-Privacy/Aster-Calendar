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
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const state_source = readFileSync(
  join(process.cwd(), "src/components/calendar/use_calendar_state.ts"),
  "utf8",
);

describe("invite reply confirmation", () => {
  it("keeps no memory of organizers confirmed earlier", () => {
    expect(state_source).not.toMatch(/rsvp_confirmation_key/);
    expect(state_source).not.toMatch(/confirmed_rsvp_organizers/);
  });

  it("marks a reply confirmed only from the confirmation handler", () => {
    const confirmed = [...state_source.matchAll(/confirmed_organizer:\s*([^,\n]+)/g)];
    const handler_start = state_source.indexOf("const confirm_rsvp_reply = useCallback");

    expect(handler_start).toBeGreaterThan(0);
    for (const match of confirmed) {
      if (match[1].trim() === "false") continue;
      expect(match[1].trim()).toBe("true");
      expect(match.index).toBeGreaterThan(handler_start);
    }
  });
});
