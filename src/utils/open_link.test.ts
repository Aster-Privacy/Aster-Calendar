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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { open_external } from "@/utils/open_link";

const invoke_mock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke_mock(...args),
}));

function mark_desktop(): void {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true,
  });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("open_external", () => {
  let window_open: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    invoke_mock.mockReset();
    window_open = vi.spyOn(window, "open").mockReturnValue(null);
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    window_open.mockRestore();
  });

  it("refuses schemes outside the allowed list", () => {
    expect(open_external("ms-settings:privacy")).toBeNull();
    expect(open_external("x-apple.systempreferences:com.apple")).toBeNull();
    expect(open_external("javascript:alert(1)")).toBeNull();
    expect(window_open).not.toHaveBeenCalled();
  });

  it("opens web links in a new tab on the web", () => {
    open_external("https://example.com/a");

    expect(window_open).toHaveBeenCalledWith(
      "https://example.com/a",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("routes desktop links through the native command", async () => {
    mark_desktop();
    invoke_mock.mockResolvedValue(undefined);

    open_external("https://example.com/b");
    await flush();

    expect(invoke_mock).toHaveBeenCalledWith("open_external_url", {
      url: "https://example.com/b",
    });
    expect(window_open).not.toHaveBeenCalled();
  });

  it("falls back to a new window when the native command fails", async () => {
    mark_desktop();
    invoke_mock.mockRejectedValue(new Error("denied"));

    open_external("mailto:someone@example.com");
    await flush();

    expect(window_open).toHaveBeenCalledWith(
      "mailto:someone@example.com",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
