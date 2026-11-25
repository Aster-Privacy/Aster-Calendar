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
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

const REPLY_HANDLERS = [
  "src/components/calendar/use_calendar_state.ts",
  "src/pages/mail_panel/mail_panel_page.tsx",
];

const SEND_REPLY_OWNERS = new Set([
  "src/services/calendar/invite_mail.ts",
  "src/services/calendar/rsvp_reply.ts",
]);

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function source_files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);

    if (statSync(full).isDirectory()) return source_files(full);
    if (!/\.(ts|tsx)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) return [];

    return [full];
  });
}

describe("invite reply confirmation", () => {
  it("keeps no memory of organizers confirmed earlier", () => {
    for (const path of REPLY_HANDLERS) {
      const source = read(path);

      expect(source).not.toMatch(/rsvp_confirmation_key/);
      expect(source).not.toMatch(/confirmed_rsvp_organizers/);
    }
  });

  it("marks a reply confirmed only from the confirmation handler", () => {
    for (const path of REPLY_HANDLERS) {
      const source = read(path);
      const confirmed = [...source.matchAll(/confirmed_organizer:\s*([^,\n]+)/g)];
      const handler_start = source.indexOf("const confirm_rsvp_reply = useCallback");

      expect(handler_start).toBeGreaterThan(0);
      for (const match of confirmed) {
        if (match[1].trim() === "false") continue;
        expect(match[1].trim()).toBe("true");
        expect(match.index).toBeGreaterThan(handler_start);
      }
    }
  });

  it("sends invite replies only through deliver_rsvp_reply", () => {
    const callers = source_files(SRC)
      .filter((file) => /\bsend_reply\b/.test(readFileSync(file, "utf8")))
      .map((file) => relative(process.cwd(), file).split("\\").join("/"))
      .filter((file) => !SEND_REPLY_OWNERS.has(file));

    expect(callers).toEqual([]);
  });

  it("routes every reply handler through deliver_rsvp_reply", () => {
    for (const path of REPLY_HANDLERS) {
      expect(read(path)).toMatch(/deliver_rsvp_reply\(/);
    }
  });
});
