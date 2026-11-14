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

import { DefaultEventColorPicker } from "@/components/settings/default_event_color_picker";
import { PICKER_COLOR_OPTIONS } from "@/components/calendar/calendar_utils";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function render_picker(value: string, on_change = vi.fn()) {
  const container = document.createElement("div");

  document.body.appendChild(container);

  const root = createRoot(container);

  act(() => {
    root.render(
      <DefaultEventColorPicker
        calendar_color="#3b82f6"
        value={value}
        on_change={on_change}
      />,
    );
  });
  mounted.push({ root, container });

  const radios = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  );

  return { container, radios, on_change };
}

function checked_indexes(radios: HTMLButtonElement[]): number[] {
  return radios.flatMap((radio, index) =>
    radio.getAttribute("aria-checked") === "true" ? [index] : [],
  );
}

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

describe("DefaultEventColorPicker", () => {
  it("shows the calendar color, one preset row, and the custom swatch", () => {
    const { radios } = render_picker("");

    expect(radios).toHaveLength(PICKER_COLOR_OPTIONS.length + 2);
    expect(radios[0].dataset.defaultEventColor).toBe("calendar");
    expect(radios[radios.length - 1].dataset.testid).toBe(
      "custom-color-swatch",
    );
    expect(checked_indexes(radios)).toEqual([0]);
  });

  it("marks only the matching preset and stores its hex", () => {
    const target = PICKER_COLOR_OPTIONS[3];
    const { radios, on_change } = render_picker(target.hex);

    expect(checked_indexes(radios)).toEqual([4]);
    expect(radios[4].querySelector("svg")).not.toBeNull();

    act(() => radios[1].click());
    expect(on_change).toHaveBeenCalledWith(PICKER_COLOR_OPTIONS[0].hex);

    act(() => radios[0].click());
    expect(on_change).toHaveBeenLastCalledWith("");
  });

  it("marks a color outside the presets as the custom color", () => {
    const { radios } = render_picker("#795548");
    const custom = radios[radios.length - 1];

    expect(checked_indexes(radios)).toEqual([radios.length - 1]);
    expect(custom.dataset.color).toBe("#795548");
  });

  it("stores a hex entered in the wheel", () => {
    const { radios, on_change } = render_picker("");
    const custom = radios[radios.length - 1];

    act(() => custom.click());

    const input = document.querySelector<HTMLInputElement>(
      '[data-testid="color-wheel-hex"]',
    );

    expect(input).not.toBeNull();

    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;

    act(() => {
      setter?.call(input, "#1a2b3c");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      input!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(on_change).toHaveBeenLastCalledWith("#1a2b3c");
  });
});
