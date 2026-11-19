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
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();

function read(name: string): string {
  return readFileSync(join(root, name), "utf8").replace(/\r\n/g, "\n");
}

const nginx = read("nginx.conf");
const script = read("docker/edge_auth.sh");
const work_dirs: string[] = [];

function sha256_hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function render(env: Record<string, string>): { code: number; conf: string } {
  const dir = mkdtempSync(join(tmpdir(), "edge-auth-"));
  const target = join(dir, "edge_auth.conf");

  work_dirs.push(dir);

  try {
    execFileSync("sh", ["-c", script], {
      env: { PATH: process.env.PATH ?? "", EDGE_AUTH_CONF: target, ...env },
      stdio: "pipe",
    });
  } catch (error) {
    return { code: (error as { status?: number }).status ?? 1, conf: "" };
  }

  return { code: 0, conf: readFileSync(target, "utf8") };
}

describe("public nginx trusts a client address only through the edge", () => {
  afterEach(() => {
    for (const dir of work_dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("names no internal address ranges", () => {
    expect(nginx).not.toMatch(/set_real_ip_from/);
    expect(nginx).not.toMatch(/real_ip_header/);
    expect(nginx).not.toMatch(/\b10\.\d+\.\d+\.\d+/);
    expect(nginx).not.toMatch(/\bgeo\b/);
  });

  it("keys the rate limit on the edge address only after edge auth passes", () => {
    expect(nginx).toMatch(
      /map "\$edge_auth_valid:\$http_cf_connecting_ip" \$rate_limit_key \{\n\s+"~\^1:\(\?<rate_limit_client_ip>[^\n]+\$rate_limit_client_ip;\n\s+default\s+\$binary_remote_addr;/,
    );
    expect(nginx).not.toMatch(/\$rate_limit_from_cluster/);
  });

  it("forwards the edge address upstream instead of a client supplied value", () => {
    const real_ip_lines = nginx.match(/proxy_set_header X-Real-IP [^;]+;/g);

    expect(real_ip_lines?.length ?? 0).toBeGreaterThan(0);
    for (const line of real_ip_lines ?? []) {
      expect(line).toBe("proxy_set_header X-Real-IP $edge_client_addr;");
    }
  });

  it("adds no address logging", () => {
    expect(nginx).not.toMatch(/log_format/);
    expect(nginx).not.toMatch(/access_log (?!off)/);
  });

  it("installs the edge auth step in the image entrypoint", () => {
    expect(read("Dockerfile")).toMatch(
      /COPY docker\/edge_auth\.sh \/docker-entrypoint\.d\/15-edge-auth\.sh/,
    );
  });

  it("reads the edge digest from the writable runtime directory", () => {
    expect(nginx).toMatch(/^include \/run\/edge_auth\/edge_auth\.conf;$/m);
    expect(read("docker/edge_auth.sh")).toMatch(
      /EDGE_AUTH_CONF:-\/run\/edge_auth\/edge_auth\.conf/,
    );
    expect(read("Dockerfile")).toMatch(/mkdir -p \/run\/edge_auth/);
  });

  it("compares the edge header by digest instead of a plain map", () => {
    expect(nginx).toMatch(/js_import edge_auth from edge_auth\.js;/);
    expect(nginx).toMatch(
      /js_set \$edge_auth_valid edge_auth\.edge_auth_valid;/,
    );
    expect(nginx).not.toMatch(/map \$http_x_edge_auth/);

    const dockerfile = read("Dockerfile");

    expect(dockerfile).toMatch(/load_module modules\/ngx_http_js_module\.so;/);
    expect(dockerfile).toMatch(
      /COPY docker\/edge_auth\.js \/etc\/nginx\/njs\/edge_auth\.js/,
    );
  });

  it("writes only the digest of the configured edge secret", () => {
    const result = render({ EDGE_FORWARD_SECRET: " abc123_-=+/ \n" });

    expect(result.code).toBe(0);
    expect(result.conf).toContain(`default "${sha256_hex("abc123_-=+/")}";`);
    expect(result.conf).not.toContain("abc123");
  });

  it("keeps the current behavior until a secret is configured", () => {
    const result = render({});

    expect(result.code).toBe(0);
    expect(result.conf).toContain('default "";');
  });

  it("refuses to start without a secret when edge auth is required", () => {
    expect(render({ EDGE_AUTH_MODE: "required" }).code).not.toBe(0);
  });

  it("keeps any secret out of the nginx syntax", () => {
    for (const secret of ['abc"; default 1', "a$b", "~.*"]) {
      const result = render({ EDGE_FORWARD_SECRET: secret });

      expect(result.code).toBe(0);
      expect(result.conf).toBe(
        `map "" $edge_auth_secret_sha256 {\n    default "${sha256_hex(secret)}";\n}\n`,
      );
    }
  });
});

interface edge_auth_module {
  edge_auth_valid: (r: {
    variables: Record<string, string | undefined>;
    headersIn: Record<string, string | undefined>;
  }) => string;
  digests_match: (left: string, right: string) => boolean;
}

async function load_edge_auth(): Promise<edge_auth_module> {
  const url = pathToFileURL(join(root, "docker/edge_auth.js")).href;
  const loaded = (await import(/* @vite-ignore */ url)) as {
    default: edge_auth_module;
  };

  return loaded.default;
}

function request(digest: string | undefined, header: string | undefined) {
  return {
    variables: { edge_auth_secret_sha256: digest },
    headersIn: { "X-Edge-Auth": header },
  };
}

describe("edge auth digest check", () => {
  it("accepts only the header whose digest matches", async () => {
    const edge_auth = await load_edge_auth();
    const digest = sha256_hex("edge-secret");

    expect(edge_auth.edge_auth_valid(request(digest, "edge-secret"))).toBe("1");
    expect(edge_auth.edge_auth_valid(request(digest, "edge-secreT"))).toBe("0");
    expect(edge_auth.edge_auth_valid(request(digest, digest))).toBe("0");
    expect(edge_auth.edge_auth_valid(request(digest, ""))).toBe("0");
    expect(edge_auth.edge_auth_valid(request(digest, undefined))).toBe("0");
  });

  it("trusts no forwarded address while no secret is configured", async () => {
    const edge_auth = await load_edge_auth();

    expect(edge_auth.edge_auth_valid(request("", undefined))).toBe("0");
    expect(edge_auth.edge_auth_valid(request("", ""))).toBe("0");
    expect(edge_auth.edge_auth_valid(request(undefined, "anything"))).toBe("0");
    expect(edge_auth.edge_auth_valid(request("abc", "anything"))).toBe("0");
  });

  it("keys on the socket address unless edge auth passes", () => {
    for (const name of ["rate_limit_key", "edge_client_addr"]) {
      const block = nginx.match(
        new RegExp(
          `map "\\$edge_auth_valid:\\$http_cf_connecting_ip" \\$${name} \\{\\n([\\s\\S]*?)\\n\\}`,
        ),
      );
      const lines = (block?.[1] ?? "").split("\n").map((line) => line.trim());

      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/^"~\^1:/);
      expect(lines[1]).toMatch(/^default\s+\$(binary_)?remote_addr;$/);
    }
  });

  it("compares every digest position and rejects other lengths", async () => {
    const edge_auth = await load_edge_auth();
    const digest = sha256_hex("edge-secret");

    expect(edge_auth.digests_match(digest, digest)).toBe(true);
    for (const index of [0, 31, 63]) {
      const flipped =
        digest.slice(0, index) +
        (digest[index] === "0" ? "1" : "0") +
        digest.slice(index + 1);

      expect(edge_auth.digests_match(flipped, digest)).toBe(false);
    }
    expect(edge_auth.digests_match(digest.slice(0, 63), digest)).toBe(false);
    expect(edge_auth.digests_match("", "")).toBe(false);
  });
});
