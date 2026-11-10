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
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  AUTO_EXTEND_LIMIT,
  anchored_scroll_top,
  use_agenda_endless_scroll,
  type AgendaEndless,
} from "./use_agenda_endless_scroll";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const HEADER = 32;
const ROW = 100;

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  targets: Element[];
};

let observers: ObserverRecord[] = [];
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let scroll_top = 0;
let row_tops = new Map<string, number>();
let scroll_calls: number[] = [];

class FakeIntersectionObserver {
  private record: ObserverRecord;

  constructor(callback: IntersectionObserverCallback) {
    this.record = { callback, targets: [] };
    observers.push(this.record);
  }

  observe(target: Element) {
    this.record.targets.push(target);
  }

  unobserve() {}

  disconnect() {
    observers = observers.filter((entry) => entry !== this.record);
  }

  takeRecords() {
    return [];
  }
}

function set_intersecting(test_id: string, is_intersecting: boolean) {
  for (const record of observers) {
    const target = record.targets.find(
      (element) => element.getAttribute("data-testid") === test_id,
    );

    if (target) {
      record.callback(
        [
          {
            isIntersecting: is_intersecting,
            target,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    }
  }
}

function Harness({
  days,
  endless,
}: {
  days: string[];
  endless: AgendaEndless;
}) {
  const root_ref = useRef<HTMLDivElement>(null);
  const top_ref = useRef<HTMLDivElement>(null);
  const bottom_ref = useRef<HTMLDivElement>(null);

  use_agenda_endless_scroll({
    root_ref,
    top_ref,
    bottom_ref,
    endless,
    header_height: HEADER,
  });

  return (
    <div ref={root_ref} data-testid="root">
      <div ref={top_ref} data-testid="top" />
      {days.map((key) => (
        <div key={key} data-day-key={key} />
      ))}
      <div ref={bottom_ref} data-testid="bottom" />
    </div>
  );
}

function layout(days: string[], first_top = 0) {
  row_tops = new Map(days.map((key, index) => [key, first_top + index * ROW]));
}

function attach_geometry() {
  const scroller = container!.querySelector<HTMLElement>(
    '[data-testid="root"]',
  )!;

  Object.defineProperty(scroller, "scrollTop", {
    configurable: true,
    get: () => scroll_top,
    set: (value: number) => {
      scroll_top = value;
    },
  });
  scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  scroller.scrollTo = ((options: ScrollToOptions) => {
    scroll_top = options.top ?? 0;
    scroll_calls.push(scroll_top);
    scroller.dispatchEvent(new Event("scroll"));
  }) as typeof scroller.scrollTo;

  for (const row of scroller.querySelectorAll<HTMLElement>("[data-day-key]")) {
    const key = row.getAttribute("data-day-key")!;

    row.getBoundingClientRect = () =>
      ({
        top: (row_tops.get(key) ?? 0) - scroll_top,
        height: ROW,
        bottom: (row_tops.get(key) ?? 0) - scroll_top + ROW,
      }) as DOMRect;
  }

  return scroller;
}

function build_endless(overrides: Partial<AgendaEndless> = {}): AgendaEndless {
  return {
    is_loading: false,
    scroll_request: null,
    on_extend: vi.fn(),
    on_visible_month_change: vi.fn(),
    ...overrides,
  };
}

function render(days: string[], endless: AgendaEndless) {
  act(() => {
    root!.render(<Harness days={days} endless={endless} />);
  });

  return attach_geometry();
}

beforeEach(() => {
  observers = [];
  scroll_top = 0;
  scroll_calls = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

describe("anchored_scroll_top", () => {
  it("moves the scroll by how far the anchor row moved", () => {
    expect(anchored_scroll_top(1000, 40, 940)).toBe(1900);
  });
});

describe("use_agenda_endless_scroll", () => {
  it("applies a scroll request only after loading finishes", () => {
    const days = ["2026-11-01", "2026-11-10", "2026-11-20"];
    const request = { token: 1, day: new Date(2026, 10, 10) };

    layout(days);
    render(days, build_endless({ is_loading: true, scroll_request: request }));
    render(days, build_endless({ is_loading: true, scroll_request: request }));
    expect(scroll_calls).toEqual([]);

    render(days, build_endless({ is_loading: false, scroll_request: request }));
    expect(scroll_calls).toEqual([ROW - HEADER]);
  });

  it("leaves the requested month alone when it has no rows", () => {
    const days = ["2026-11-20", "2026-12-05"];
    const endless = build_endless({
      scroll_request: { token: 1, day: new Date(2026, 9, 1) },
    });

    layout(days);
    render(days, build_endless());
    render(days, endless);

    expect(endless.on_visible_month_change).not.toHaveBeenCalled();
  });

  it("counts a scroll clamped at the end as programmatic", () => {
    const days = ["2026-11-10", "2026-11-20"];
    const on_extend = vi.fn();
    const request = { token: 1, day: new Date(2026, 10, 20) };

    layout(days);
    const scroller = render(days, build_endless({ on_extend }));

    Object.defineProperty(scroller, "scrollHeight", {
      configurable: true,
      value: 240,
    });
    Object.defineProperty(scroller, "clientHeight", {
      configurable: true,
      value: 200,
    });
    scroller.scrollTo = ((options: ScrollToOptions) => {
      scroll_top = Math.min(options.top ?? 0, 40);
      scroll_calls.push(scroll_top);
      scroller.dispatchEvent(new Event("scroll"));
    }) as typeof scroller.scrollTo;
    act(() => set_intersecting("bottom", true));

    for (let step = 0; step < AUTO_EXTEND_LIMIT; step += 1) {
      render(days, build_endless({ on_extend, is_loading: true }));
      render(days, build_endless({ on_extend, is_loading: false }));
    }

    const calls = on_extend.mock.calls.length;

    render(days, build_endless({ on_extend, scroll_request: request }));

    expect(on_extend.mock.calls.length).toBe(calls);
  });

  it("keeps the anchor row in place when rows are inserted above", () => {
    const days = ["2026-11-10", "2026-11-20"];
    const endless = build_endless({
      scroll_request: { token: 1, day: new Date(2026, 10, 20) },
    });

    layout(days);
    render(days, build_endless());
    render(days, endless);
    expect(scroll_top).toBe(ROW - HEADER);

    const grown = ["2026-08-01", "2026-08-15", "2026-08-30", ...days];

    layout(grown);
    render(grown, endless);

    expect(scroll_top).toBe(ROW - HEADER + 3 * ROW);
  });

  it("stops chaining after 8 automatic extensions", () => {
    const days = ["2026-11-10"];
    const on_extend = vi.fn();

    layout(days);
    render(days, build_endless({ on_extend }));
    act(() => set_intersecting("top", true));

    for (let step = 0; step < 12; step += 1) {
      render(days, build_endless({ on_extend, is_loading: true }));
      render(days, build_endless({ on_extend, is_loading: false }));
    }

    expect(on_extend).toHaveBeenCalledTimes(AUTO_EXTEND_LIMIT);
    expect(on_extend).toHaveBeenCalledWith(-1);

    const scroller = container!.querySelector('[data-testid="root"]')!;

    act(() => {
      scroll_top = 5;
      scroller.dispatchEvent(new Event("scroll"));
    });

    expect(on_extend).toHaveBeenCalledTimes(AUTO_EXTEND_LIMIT + 1);
  });
});
