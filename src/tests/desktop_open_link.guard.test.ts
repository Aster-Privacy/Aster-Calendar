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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { open_external } from "@/utils/open_link";

const invoke_mock = vi.fn();
const shell_open_mock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke_mock(...args),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: (...args: unknown[]) => shell_open_mock(...args),
}));

function read_repo_file(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("desktop link opening", () => {
  let window_open: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    invoke_mock.mockReset();
    shell_open_mock.mockReset();
    shell_open_mock.mockResolvedValue(undefined);
    window_open = vi.spyOn(window, "open").mockReturnValue(null);
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    window_open.mockRestore();
  });

  it("grants the webview no shell permissions", () => {
    const capabilities = JSON.parse(
      read_repo_file("src-tauri/capabilities/default.json"),
    ) as { permissions: unknown[] };
    const names = capabilities.permissions.map((permission) =>
      typeof permission === "string"
        ? permission
        : String((permission as { identifier?: unknown }).identifier ?? ""),
    );

    expect(names.filter((name) => name.startsWith("shell:"))).toEqual([]);
  });

  it("does not ship the shell plugin to the webview", () => {
    const manifest = JSON.parse(read_repo_file("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(manifest.dependencies ?? {}).not.toHaveProperty(
      "@tauri-apps/plugin-shell",
    );
    expect(manifest.devDependencies ?? {}).not.toHaveProperty(
      "@tauri-apps/plugin-shell",
    );
    expect(read_repo_file("src/utils/open_link.ts")).not.toContain(
      "plugin-shell",
    );
  });

  it("falls back to a window, not the shell, when the native command fails", async () => {
    invoke_mock.mockRejectedValue(new Error("denied"));

    open_external("https://example.com/c");
    await flush();

    expect(invoke_mock.mock.calls).toEqual([
      ["open_external_url", { url: "https://example.com/c" }],
    ]);
    expect(shell_open_mock).not.toHaveBeenCalled();
    expect(window_open).toHaveBeenCalledWith(
      "https://example.com/c",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
