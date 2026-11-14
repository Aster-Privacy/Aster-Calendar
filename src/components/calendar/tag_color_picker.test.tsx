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
import type { ReactNode } from "react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const update_preference = vi.fn();
let tag_colors: Record<string, string> | undefined = {};

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { calendar_tag_colors: tag_colors },
    update_preference,
  }),
}));

import { EVENT_COLOR_OPTIONS } from "@/components/calendar/calendar_utils";
import {
  TagColorPicker,
  TagColorSwatches,
  next_swatch_index,
} from "@/components/calendar/tag_color_picker";
import { use_tag_colors } from "@/components/calendar/use_tag_colors";
import { default_tag_color } from "@/services/calendar/tag_colors";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function render(node: ReactNode): HTMLDivElement {
  const container = document.createElement("div");

  document.body.appendChild(container);

  const root = createRoot(container);

  act(() => {
    root.render(node);
  });
  mounted.push({ root, container });

  return container;
}

function swatch_buttons(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      '[data-testid="tag-color-swatches"] button',
    ),
  );
}

function press(target: Element, key: string) {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

function other_color(name: string): string {
  return EVENT_COLOR_OPTIONS.map((option) => option.hex.toLowerCase()).find(
    (hex) => hex !== default_tag_color(name),
  ) as string;
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  update_preference.mockReset();
  tag_colors = {};
});

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  document.body.innerHTML = "";
});

describe("next_swatch_index", () => {
  it("moves through the grid with arrow keys and wraps sideways", () => {
    expect(next_swatch_index("ArrowRight", 16, 17, 6)).toBe(0);
    expect(next_swatch_index("ArrowLeft", 0, 17, 6)).toBe(16);
    expect(next_swatch_index("ArrowDown", 14, 17, 6)).toBe(16);
    expect(next_swatch_index("ArrowUp", 3, 17, 6)).toBe(0);
    expect(next_swatch_index("Home", 9, 17, 6)).toBe(0);
    expect(next_swatch_index("End", 2, 17, 6)).toBe(16);
    expect(next_swatch_index("Enter", 2, 17, 6)).toBeNull();
    expect(next_swatch_index("ArrowRight", 0, 0, 6)).toBeNull();
  });
});

describe("TagColorSwatches", () => {
  it("renders one labeled swatch per event color and marks the current one", () => {
    const selected = EVENT_COLOR_OPTIONS[3];

    render(
      <TagColorSwatches
        color={selected.hex.toUpperCase()}
        on_select={vi.fn()}
      />,
    );

    const buttons = swatch_buttons();

    expect(buttons).toHaveLength(EVENT_COLOR_OPTIONS.length);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(
      EVENT_COLOR_OPTIONS.map((option) => option.name_key),
    );
    expect(
      buttons.filter(
        (button) => button.getAttribute("aria-pressed") === "true",
      ),
    ).toEqual([buttons[3]]);
    expect(buttons[3].tabIndex).toBe(0);
    expect(buttons[0].tabIndex).toBe(-1);
  });

  it("calls on_select with the chosen hex", () => {
    const on_select = vi.fn();

    render(
      <TagColorSwatches
        color={EVENT_COLOR_OPTIONS[0].hex}
        on_select={on_select}
      />,
    );

    act(() => swatch_buttons()[5].click());

    expect(on_select).toHaveBeenCalledWith(EVENT_COLOR_OPTIONS[5].hex);
  });

  it("moves focus between swatches with arrow keys", () => {
    render(
      <TagColorSwatches
        color={EVENT_COLOR_OPTIONS[0].hex}
        on_select={vi.fn()}
      />,
    );

    const buttons = swatch_buttons();

    act(() => buttons[0].focus());
    press(buttons[0], "ArrowRight");
    expect(document.activeElement).toBe(buttons[1]);
    press(buttons[1], "ArrowLeft");
    press(buttons[0], "ArrowLeft");
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });
});

describe("TagColorPicker", () => {
  function render_picker(on_select = vi.fn()): HTMLButtonElement {
    const container = render(
      <TagColorPicker
        color={EVENT_COLOR_OPTIONS[2].hex}
        tag="Work"
        on_select={on_select}
      >
        <button data-testid="trigger" type="button">
          Work
        </button>
      </TagColorPicker>,
    );

    return container.querySelector<HTMLButtonElement>(
      '[data-testid="trigger"]',
    ) as HTMLButtonElement;
  }

  it("opens a labeled dialog from the trigger and focuses the current swatch", () => {
    const trigger = render_picker();

    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(swatch_buttons()).toHaveLength(0);

    act(() => trigger.click());

    const dialog = document.querySelector('[role="dialog"]');

    expect(dialog?.getAttribute("aria-label")).toBe(
      'calendar.change_tag_color:{"tag":"Work"}',
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(swatch_buttons()[2]);
  });

  it("selects a color and closes", () => {
    const on_select = vi.fn();
    const trigger = render_picker(on_select);

    act(() => trigger.click());
    act(() => swatch_buttons()[7].click());

    expect(on_select).toHaveBeenCalledWith(EVENT_COLOR_OPTIONS[7].hex);
    expect(swatch_buttons()).toHaveLength(0);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on Escape without selecting", () => {
    const on_select = vi.fn();
    const trigger = render_picker(on_select);

    act(() => trigger.click());
    press(swatch_buttons()[2], "Escape");

    expect(swatch_buttons()).toHaveLength(0);
    expect(on_select).not.toHaveBeenCalled();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("use_tag_colors", () => {
  let api: ReturnType<typeof use_tag_colors> | null = null;

  function Probe() {
    api = use_tag_colors();

    return null;
  }

  it("resolves stored colors and falls back to the default", () => {
    const stored = other_color("Work");

    tag_colors = { work: stored };
    render(<Probe />);

    expect(api?.color_for("Work")).toBe(stored);
    expect(api?.color_for("Home")).toBe(default_tag_color("Home"));
  });

  it("treats a missing preference as an empty map", () => {
    tag_colors = undefined;
    render(<Probe />);

    expect(api?.color_for("Home")).toBe(default_tag_color("Home"));
  });

  it("saves the updated map through the preference layer", () => {
    const work = other_color("Work");
    const gym = other_color("Gym");

    tag_colors = { work };
    render(<Probe />);

    act(() => api?.set_tag_color("Gym", gym));

    expect(update_preference).toHaveBeenCalledWith("calendar_tag_colors", {
      work,
      gym,
    });
  });

  it("skips the save when the color does not change", () => {
    render(<Probe />);

    act(() => api?.set_tag_color("Gym", default_tag_color("Gym")));
    act(() => api?.set_tag_color("Gym", "#123456"));

    expect(update_preference).not.toHaveBeenCalled();
  });
});
