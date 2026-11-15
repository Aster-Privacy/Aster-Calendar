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

import { describe, it, expect } from "vitest";

const root = process.cwd();

function read(name: string): string {
  return readFileSync(join(root, name), "utf8").replace(/\r\n/g, "\n");
}

function block_body(config: string, header: string): string {
  const start = config.indexOf(header);

  expect(start).toBeGreaterThan(-1);

  let depth = 0;
  let index = start + header.length - 1;

  for (; index < config.length; index += 1) {
    if (config[index] === "{") depth += 1;
    if (config[index] === "}") depth -= 1;
    if (depth === 0) break;
  }

  return config.slice(start + header.length, index);
}

function map_value(config: string, name: string): string {
  const body = block_body(config, `map $host ${name} {`);
  const match = body.match(/default\s+"([^"]*)";/);

  expect(match).not.toBeNull();

  return match?.[1] ?? "";
}

describe("Mail side panel embedding", () => {
  const config = read("nginx.conf");

  it("serves the panel page with a policy that lets Mail embed it", () => {
    const panel = block_body(config, "location = /mail-panel {");

    expect(panel).toMatch(/Content-Security-Policy \$aster_panel_csp always;/);
    expect(panel).toMatch(/try_files \/index\.html =404;/);
    expect(panel).not.toMatch(/X-Frame-Options/);
    expect(map_value(config, "$aster_panel_csp")).toMatch(
      /frame-ancestors https:\/\/app\.astermail\.org;/,
    );
  });

  it("keeps the panel policy identical to the app policy apart from the embedder", () => {
    const app_csp = map_value(config, "$aster_csp");
    const panel_csp = map_value(config, "$aster_panel_csp");

    expect(panel_csp).toBe(
      app_csp.replace(
        "frame-ancestors 'none';",
        "frame-ancestors https://app.astermail.org;",
      ),
    );
  });

  it("keeps every other page out of frames", () => {
    expect(map_value(config, "$aster_csp")).toMatch(/frame-ancestors 'none';/);
  });

  it("renders the panel page instead of the full app on the panel path", () => {
    const main = read("src/main.tsx");

    expect(main).toMatch(/is_mail_panel_path\(app_pathname\(\)\)/);
    expect(main).toMatch(/import\("@\/pages\/mail_panel\/mail_panel_page"\)/);
    expect(main).toMatch(/if \(is_mail_panel\) \{\s*return \(\s*<Suspense fallback=\{null\}>\s*<MailPanelPage \/>/);
  });
});
