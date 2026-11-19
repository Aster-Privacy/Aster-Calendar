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
import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

const shim_source = readFileSync(
  join(process.cwd(), "public/tauri-crypto-shim.js"),
  "utf8",
);

const MAC_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15";
const LINUX_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15";

type ShimRun = {
  writes: string[];
  navigator_before: object;
  navigator_after: unknown;
  plugins: object;
  mime_types: object;
  read_plugins: () => unknown;
  read_mime_types: () => unknown;
};

function watched<T extends object>(
  target: T,
  label: string,
  writes: string[],
): T {
  return new Proxy(target, {
    set(_target, key) {
      writes.push(`${label}.${String(key)} =`);

      return false;
    },
    defineProperty(_target, key) {
      writes.push(`${label} define ${String(key)}`);

      return false;
    },
    deleteProperty(_target, key) {
      writes.push(`${label} delete ${String(key)}`);

      return false;
    },
    setPrototypeOf() {
      writes.push(`${label} setPrototypeOf`);

      return false;
    },
  });
}

function fake_subtle(): Record<string, () => Promise<never>> {
  const names = [
    "importKey",
    "generateKey",
    "deriveBits",
    "deriveKey",
    "encrypt",
    "decrypt",
    "sign",
    "verify",
    "digest",
    "exportKey",
    "wrapKey",
  ];

  return Object.fromEntries(
    names.map((name) => [name, () => Promise.reject(new Error(name))]),
  );
}

function run_shim(user_agent: string, in_tauri: boolean): ShimRun {
  const writes: string[] = [];
  const plugins = { length: 0 };
  const mime_types = { length: 0 };
  const prototype = watched(
    {
      get plugins() {
        return plugins;
      },
      get mimeTypes() {
        return mime_types;
      },
    },
    "Navigator.prototype",
    writes,
  );
  const navigator = watched(
    Object.create(prototype, { userAgent: { value: user_agent } }),
    "navigator",
    writes,
  );
  const sandbox: Record<string, unknown> = {
    navigator,
    crypto: {
      subtle: fake_subtle(),
      getRandomValues: (array: Uint8Array) => array,
    },
    TextEncoder,
    DOMException,
  };

  if (in_tauri) {
    sandbox.__TAURI_INTERNALS__ = { invoke: () => Promise.resolve([]) };
  }
  sandbox.window = sandbox;
  const context = createContext(sandbox);

  runInContext(shim_source, context);

  return {
    writes,
    navigator_before: navigator,
    navigator_after: runInContext("navigator", context),
    plugins,
    mime_types,
    read_plugins: () => runInContext("navigator.plugins", context),
    read_mime_types: () => runInContext("navigator.mimeTypes", context),
  };
}

describe("desktop crypto shim", () => {
  for (const [platform, user_agent] of [
    ["macOS", MAC_AGENT],
    ["Linux", LINUX_AGENT],
  ] as const) {
    for (const in_tauri of [true, false]) {
      it(`leaves navigator untouched on ${platform} (desktop app: ${in_tauri})`, () => {
        const run = run_shim(user_agent, in_tauri);

        expect(run.writes).toEqual([]);
        expect(run.navigator_after).toBe(run.navigator_before);
        expect(run.read_plugins()).toBe(run.plugins);
        expect(run.read_mime_types()).toBe(run.mime_types);
      });
    }
  }

  it("reports a plugin list written by assignment", () => {
    const writes: string[] = [];
    const target = watched({ plugins: { length: 0 } }, "navigator", writes);

    runInContext(
      "navigator.plugins = { length: 0 };",
      createContext({ navigator: target }),
    );
    expect(writes).toEqual(["navigator.plugins ="]);
  });

  it("reports MIME types and plugins written with defineProperties", () => {
    const writes: string[] = [];
    const target = watched({}, "navigator", writes);

    runInContext(
      "try { Object.defineProperties(navigator, { plugins: { value: 1 }, mimeTypes: { value: 1 } }); } catch (e) {}",
      createContext({ navigator: target }),
    );
    expect(writes).toEqual(["navigator define plugins"]);
  });
});
