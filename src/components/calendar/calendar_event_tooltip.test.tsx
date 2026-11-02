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

import {
  EVENT_TOOLTIP_DELAY_MS,
  use_event_tooltip,
} from "./calendar_event_tooltip";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CONTENT = { title: "Standup", time: "9:00 AM" };

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Harness({ anchor }: { anchor: HTMLElement }) {
  const tooltip = use_event_tooltip();

  return (
    <>
      <button
        type="button"
        onClick={() => tooltip.show(anchor, CONTENT)}
        data-testid="trigger"
      />
      {tooltip.element}
    </>
  );
}

function open_tooltip(anchor_rect: Partial<DOMRect>): HTMLElement {
  const anchor = document.createElement("div");

  document.body.appendChild(anchor);
  anchor.getBoundingClientRect = () =>
    ({ left: 400, width: 100, top: 0, bottom: 0, ...anchor_rect }) as DOMRect;

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<Harness anchor={anchor} />));
  act(() => {
    container!.querySelector<HTMLButtonElement>("[data-testid=trigger]")!.click();
  });
  act(() => {
    vi.advanceTimersByTime(EVENT_TOOLTIP_DELAY_MS);
  });

  return document.querySelector<HTMLElement>(
    "[data-testid=calendar-event-tooltip]",
  )!;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  document.body.innerHTML = "";
  root = null;
  container = null;
  vi.useRealTimers();
});

describe("event tooltip offset", () => {
  it("offsets with translate so the open animation cannot displace it", () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 900,
    });

    const card = open_tooltip({ top: 200, bottom: 240 });

    expect(card.style.transform).toBe("");
    expect(card.style.translate).toBe("-50% 0");
    expect(card.style.top).toBe("246px");
  });

  it("sits above the event near the bottom of the screen", () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 900,
    });

    const card = open_tooltip({ top: 820, bottom: 860 });

    expect(card.style.transform).toBe("");
    expect(card.style.translate).toBe("-50% -100%");
    expect(card.style.top).toBe("814px");
  });
});
