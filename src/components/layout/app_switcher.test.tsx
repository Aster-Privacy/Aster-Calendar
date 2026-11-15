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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AppSwitcher } from "./app_switcher";

const open_external = vi.hoisted(() => vi.fn());

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/utils/open_link", () => ({ open_external }));

vi.mock("@aster/ui", async (original) => ({
  ...(await original<typeof import("@aster/ui")>()),
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("app launcher", () => {
  let container: HTMLDivElement;
  let root: Root;

  const open_launcher = async () => {
    const trigger = container.querySelector<HTMLButtonElement>(
      "[data-app-switcher]",
    );

    expect(trigger?.getAttribute("aria-label")).toBe("common.aster_apps");

    await act(async () => {
      trigger?.focus();
      trigger?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
  };

  const launcher_item = (id: string) =>
    document.body.querySelector<HTMLElement>(
      `[data-app-switcher-item="${id}"]`,
    );

  beforeEach(async () => {
    open_external.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<AppSwitcher on_open_current={() => {}} />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("lists Mail, linked to the Mail web app", async () => {
    await open_launcher();

    const mail = launcher_item("mail");

    expect(mail).not.toBeNull();
    expect(mail?.textContent).toContain("common.app_name_mail");
    expect(mail?.getAttribute("href")).toBe("https://app.astermail.org");
    expect(mail?.querySelector("img")?.getAttribute("src")).toMatch(
      /^data:image\/png/,
    );
  });

  it("marks Calendar as the current app", async () => {
    await open_launcher();

    const calendar = launcher_item("calendar");

    expect(calendar?.textContent).toContain("common.app_name_calendar");
    expect(calendar?.getAttribute("aria-current")).toBe("page");
  });
});
