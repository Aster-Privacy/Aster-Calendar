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

const RETIRED_UPDATER_KEY_ID = "C6AD17B1E5D340F1";

function read_text(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function updater_key_ids(): { comment_id: string; embedded_id: string } {
  const config = JSON.parse(read_text("src-tauri/tauri.conf.json"));
  const decoded = Buffer.from(config.plugins.updater.pubkey, "base64")
    .toString("utf8")
    .trim()
    .split(/\r?\n/);
  const comment_id = decoded[0].split(":").pop()?.trim().toUpperCase() ?? "";
  const key_bytes = Buffer.from(decoded[1].trim(), "base64");
  const embedded_id = Buffer.from(key_bytes.subarray(2, 10))
    .reverse()
    .toString("hex")
    .toUpperCase();

  return { comment_id, embedded_id };
}

describe("desktop release configuration", () => {
  it("verifies updates with the current signing key", () => {
    const { comment_id, embedded_id } = updater_key_ids();

    expect(embedded_id).toHaveLength(16);
    expect(comment_id).toBe(embedded_id);
    expect(embedded_id).not.toBe(RETIRED_UPDATER_KEY_ID);
  });

  it("audits every Rust advisory without exceptions", () => {
    const workflow = read_text(".github/workflows/ci.yml");

    expect(workflow).toMatch(/cargo audit --file/);
    expect(workflow).not.toMatch(/cargo audit[^\n]*--ignore/);
  });
});
