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
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

import {
  COLOR_ROW_PRESETS,
  ColorSwatchRow,
} from "@/components/ui/color_swatch_row";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function render_row(value: string, on_change = vi.fn(), on_commit = vi.fn()) {
  const container = document.createElement("div");

  document.body.appendChild(container);

  const root = createRoot(container);

  act(() => {
    root.render(
      <ColorSwatchRow
        label="profile color"
        value={value}
        on_change={on_change}
        on_commit={on_commit}
      />,
    );
  });
  mounted.push({ root, container });

  return { container, on_change, on_commit };
}

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

describe("ColorSwatchRow", () => {
  it("renders every preset plus the custom swatch", () => {
    const { container } = render_row("#3b82f6");
    const row = container.querySelector('[data-color-swatch-row=""]');

    expect(row?.getAttribute("aria-label")).toBe("profile color");
    expect(container.querySelectorAll(".color_row_swatch")).toHaveLength(
      COLOR_ROW_PRESETS.length + 1,
    );
  });

  it("marks only the matching preset as selected", () => {
    const { container } = render_row("#3B82F6");
    const selected = container.querySelectorAll('[data-selected="true"]');

    expect(selected).toHaveLength(1);
    expect(selected[0].getAttribute("aria-label")).toBe("common.color_blue");
  });

  it("commits a new preset and skips the current one", () => {
    const { container, on_change, on_commit } = render_row("#3b82f6");
    const red = container.querySelector<HTMLButtonElement>(
      '[aria-label="common.color_red"]',
    );
    const blue = container.querySelector<HTMLButtonElement>(
      '[aria-label="common.color_blue"]',
    );

    act(() => red?.click());
    act(() => blue?.click());

    expect(on_change).toHaveBeenCalledWith("#ef4444");
    expect(on_commit).toHaveBeenCalledTimes(1);
    expect(on_commit).toHaveBeenCalledWith("#ef4444");
  });

  it("shows a color outside the presets on the custom swatch", () => {
    const { container } = render_row("#123456");
    const custom = container.querySelector('[data-testid="custom-color-swatch"]');

    expect(custom?.getAttribute("data-color")).toBe("#123456");
    expect(container.querySelectorAll('[data-selected="true"]')).toHaveLength(0);
  });
});
