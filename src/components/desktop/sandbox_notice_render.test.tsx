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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

const { SandboxNotice } = await import("./sandbox_notice");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type TauriWindow = { __TAURI_INTERNALS__?: unknown };

describe("SandboxNotice", () => {
  let container: HTMLDivElement;
  let root: Root;

  const mount = async () => {
    await act(async () => {
      root.render(<SandboxNotice />);
    });
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  };

  beforeEach(() => {
    invoke.mockReset();
    (window as unknown as TauriWindow).__TAURI_INTERNALS__ = {};
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (window as unknown as TauriWindow).__TAURI_INTERNALS__;
  });

  it("warns when the shell reports the sandbox could not start", async () => {
    invoke.mockResolvedValue({ enabled: false, reason: "bwrap_missing" });
    await mount();

    expect(invoke).toHaveBeenCalledWith("webkit_sandbox_status");
    expect(container.textContent).toBe("settings.sandbox_off_notice");
  });

  it("names the setting when the sandbox was turned off on purpose", async () => {
    for (const reason of ["forced_off", "disabled_by_environment"]) {
      act(() => root.unmount());
      root = createRoot(container);
      invoke.mockResolvedValue({ enabled: false, reason });
      await mount();

      expect(container.textContent).toBe(
        "settings.sandbox_off_by_setting_notice",
      );
    }
  });

  it("stays hidden when the sandbox is on", async () => {
    invoke.mockResolvedValue({ enabled: true, reason: "probe_passed" });
    await mount();

    expect(container.textContent).toBe("");
  });

  it("stays hidden when the status is missing or malformed", async () => {
    for (const value of [null, "off", { enabled: false }]) {
      act(() => root.unmount());
      root = createRoot(container);
      invoke.mockResolvedValue(value);
      await mount();

      expect(container.textContent).toBe("");
    }
    act(() => root.unmount());
    root = createRoot(container);
    invoke.mockRejectedValue(new Error("unavailable"));
    await mount();

    expect(container.textContent).toBe("");
  });

  it("stays hidden in a browser and never asks the shell", async () => {
    delete (window as unknown as TauriWindow).__TAURI_INTERNALS__;
    await mount();

    expect(container.textContent).toBe("");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("is mounted once at the app level", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");

    expect(app.match(/<SandboxNotice \/>/g)).toHaveLength(1);
    expect(app).not.toMatch(/<WebSandboxNotice/);
  });
});
