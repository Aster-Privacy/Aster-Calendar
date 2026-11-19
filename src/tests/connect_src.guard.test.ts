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

import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: {
    get_cdn_relay_url: () => null,
    fetch_connection_info: () => Promise.resolve(),
  },
}));

import * as relay_transport from "@/services/routing/cdn_relay_transport";

const RELAY_CANDIDATES = [
  "https://relay.astermail.org",
  "https://astermail.org",
  "https://app.astermail.org",
  "https://cdn.astermail.org",
  "https://calendar.astermail.org",
  "https://relay.aster.cx",
];

const nginx = readFileSync(join(process.cwd(), "nginx.conf"), "utf8");

function connect_sources(): string[][] {
  const policies = [...nginx.matchAll(/connect-src ([^;"]+)/g)];

  return policies.map((match) => match[1].trim().split(/\s+/));
}

function page_policies(): string[][] {
  const policies = [...nginx.matchAll(/default "[^"]*connect-src ([^;"]+)/g)];

  return policies.map((match) => match[1].trim().split(/\s+/));
}

describe("public content security policy", () => {
  it("lets the page connect only to named origins", () => {
    const sources = connect_sources();

    expect(sources.length).toBeGreaterThanOrEqual(2);
    for (const list of sources) {
      for (const source of list) {
        expect(["https:", "http:", "wss:", "ws:", "*", "data:", "blob:"]).not.toContain(source);
        expect(source).not.toMatch(/^https?:\/\/\*/);
      }
    }
  });

  it("allows every relay origin the client accepts", () => {
    const accepted = RELAY_CANDIDATES.filter((candidate) =>
      relay_transport.is_relay_host_allowed(candidate),
    );

    expect(accepted).toContain("https://relay.astermail.org");
    expect(page_policies().length).toBe(2);
    for (const policy of page_policies()) {
      for (const candidate of accepted) {
        expect(policy, candidate).toContain(new URL(candidate).origin);
      }
    }
  });

  it("lists each named relay origin in every page policy", () => {
    const origins = relay_transport.CDN_RELAY_ORIGINS;

    expect(origins.length).toBeGreaterThan(0);
    for (const policy of page_policies()) {
      for (const origin of origins) {
        expect(policy, origin).toContain(origin);
      }
    }
  });
});
