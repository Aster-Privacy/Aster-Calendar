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
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, it, expect } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const renderer_source = readFileSync(
  resolve(here, "sandboxed_email_renderer/renderer.tsx"),
  "utf8",
);
const secure_view_source = readFileSync(
  resolve(here, "../../pages/secure_view.tsx"),
  "utf8",
);

function sandbox_values(source: string): string[] {
  return source.match(/sandbox="([^"]*)"/g) ?? [];
}

describe("email iframe sandbox safety invariants", () => {
  it("main renderer never combines allow-scripts with allow-same-origin", () => {
    const values = sandbox_values(renderer_source);

    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      const has_scripts = value.includes("allow-scripts");
      const has_same_origin = value.includes("allow-same-origin");

      expect(has_scripts && has_same_origin).toBe(false);
    }
  });

  it("main renderer disables scripts in the email frame via CSP", () => {
    expect(renderer_source.includes("script-src 'none'")).toBe(true);
  });

  it("secure view runs untrusted email at a null origin (no allow-same-origin)", () => {
    const values = sandbox_values(secure_view_source);

    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value.includes("allow-same-origin")).toBe(false);
    }
  });

  it("secure view confines scripts to a per-render nonce", () => {
    expect(secure_view_source.includes("script-src 'nonce-")).toBe(true);
    const script_directives =
      secure_view_source.match(/script-src[^;"`]*/g) ?? [];

    expect(script_directives.length).toBeGreaterThan(0);
    for (const directive of script_directives) {
      expect(directive.includes("unsafe-inline")).toBe(false);
      expect(directive.includes("unsafe-eval")).toBe(false);
    }
  });

  it("main renderer disables DNS prefetch of anchor hosts in the email frame", () => {
    expect(
      /http-equiv="x-dns-prefetch-control"\s+content="off"/i.test(
        renderer_source,
      ),
    ).toBe(true);
  });

  it("secure view disables DNS prefetch of anchor hosts in the email frame", () => {
    expect(
      /http-equiv="x-dns-prefetch-control"\s+content="off"/i.test(
        secure_view_source,
      ),
    ).toBe(true);
  });

  it("app document disables DNS prefetch for shadow-root previews and print", () => {
    const index_source = readFileSync(
      resolve(here, "../../../index.html"),
      "utf8",
    );

    expect(
      /http-equiv="x-dns-prefetch-control"\s+content="off"/i.test(index_source),
    ).toBe(true);
  });
});
