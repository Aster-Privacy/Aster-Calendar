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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

import {
  ColorWheelPanel,
  custom_swatch_style,
  selected_swatch_shadow,
} from "@/components/ui/color_wheel";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function render_panel(on_change = vi.fn(), on_submit = vi.fn()) {
  const container = document.createElement("div");

  document.body.appendChild(container);

  const root = createRoot(container);

  act(() => {
    root.render(
      <ColorWheelPanel
        on_change={on_change}
        on_submit={on_submit}
        value="#3b82f6"
      />,
    );
  });
  mounted.push({ root, container });

  const input = container.querySelector<HTMLInputElement>(
    '[data-testid="color-wheel-hex"]',
  ) as HTMLInputElement;

  return { container, input, on_change, on_submit };
}

function type_into(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function error_message(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-testid="color-wheel-hex-error"]');
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  document.body.innerHTML = "";
});

describe("ColorWheelPanel hex field", () => {
  it("keeps a normal field while typing a partial value", () => {
    const { container, input, on_change } = render_panel();

    type_into(input, "#12z");

    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(error_message(container)).toBeNull();
    expect(on_change).not.toHaveBeenCalled();
  });

  it("shows the message on blur and keeps the last valid color", () => {
    const { container, input, on_change } = render_panel();

    type_into(input, "#12z");
    act(() => {
      input.focus();
      input.blur();
    });

    expect(error_message(container)?.textContent).toBe(
      "common.hex_color_invalid",
    );
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(on_change).not.toHaveBeenCalled();
  });

  it("does not submit an invalid value on Enter", () => {
    const { container, input, on_submit } = render_panel();

    type_into(input, "zzz");
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(on_submit).not.toHaveBeenCalled();
    expect(error_message(container)).not.toBeNull();
  });

  it("applies a valid hex live and submits on Enter", () => {
    const { container, input, on_change, on_submit } = render_panel();

    type_into(input, "#A1B2C3");
    expect(on_change).toHaveBeenLastCalledWith("#a1b2c3");

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(on_submit).toHaveBeenCalledTimes(1);
    expect(error_message(container)).toBeNull();
  });

  it("expands a short hex when it is committed", () => {
    const { input, on_change } = render_panel();

    type_into(input, "#f0a");
    act(() => {
      input.focus();
      input.blur();
    });

    expect(on_change).toHaveBeenLastCalledWith("#ff00aa");
  });
});

describe("custom swatch styles", () => {
  it("uses the same theme ring for every selected swatch", () => {
    const style = custom_swatch_style("#123456", "var(--modal-bg)");

    expect(style.backgroundColor).toBe("#123456");
    expect(style.boxShadow).toBe(selected_swatch_shadow("var(--modal-bg)"));
    expect(selected_swatch_shadow("var(--modal-bg)")).toContain(
      "var(--text-primary)",
    );
  });

  it("shows the rainbow when no custom color is selected", () => {
    const style = custom_swatch_style(null, "var(--modal-bg)");

    expect(String(style.background ?? style.backgroundImage)).toContain(
      "conic-gradient",
    );
  });
});
