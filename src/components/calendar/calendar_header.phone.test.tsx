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
import type { CalendarViewMode } from "@/types/calendar";

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string) => key,
    language: "en",
  }),
}));

vi.mock("@/hooks/use_online_status", () => ({
  use_online_status: () => ({ is_online: true }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/components/calendar/use_calendar_now_tick", () => ({
  use_calendar_today: () => new Date(2026, 8, 16),
}));

import { CalendarHeader } from "@/components/calendar/calendar_header";

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

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

function render_phone_header(
  view_mode: CalendarViewMode,
  period_month_short: string,
  period_year = "2026",
): HTMLDivElement {
  return render(
    <CalendarHeader
      is_phone
      can_page
      custom_view_days={4}
      is_current_period={false}
      period_month="September"
      period_month_short={period_month_short}
      period_year={period_year}
      t={(key) => key}
      view_mode={view_mode}
      on_insights={() => {}}
      on_next={() => {}}
      on_period_click={() => {}}
      on_previous={() => {}}
      on_print={() => {}}
      on_today={() => {}}
      on_view_mode_change={() => {}}
    />,
  );
}

const CLIPPING_CLASSES =
  /\b(truncate|line-clamp-\d|text-ellipsis|overflow-hidden|whitespace-nowrap)\b/;

function title_heading(container: HTMLElement): HTMLHeadingElement {
  const heading = container.querySelector("h1");

  if (!heading) throw new Error("missing period title");

  return heading;
}

describe("CalendarHeader on phones", () => {
  it.each<[CalendarViewMode, string]>([
    ["month", "September"],
    ["day", "16. September"],
    ["week", "16. September - 18"],
    ["agenda", "сентябрь"],
  ])("never clips the %s title", (view_mode, title) => {
    const container = render_phone_header(view_mode, title);
    const heading = title_heading(container);

    expect(heading.textContent?.replace(/ /g, " ")).toContain(title);
    expect(heading.className).not.toMatch(CLIPPING_CLASSES);

    for (const element of Array.from(heading.querySelectorAll("*"))) {
      expect(element.getAttribute("class") ?? "").not.toMatch(CLIPPING_CLASSES);
    }
  });

  it("shows the year next to the month in month view", () => {
    const heading = title_heading(render_phone_header("month", "September"));

    expect(heading.textContent).toContain("2026");
  });

  it("lets a range wrap between its two ends instead of cutting it", () => {
    const heading = title_heading(
      render_phone_header("week", "30. Sept. - 2. Okt."),
    );
    const parts = Array.from(
      heading.querySelectorAll<HTMLElement>("[data-period-part]"),
    ).map((part) => part.textContent?.replace(/ /g, " "));

    expect(parts).toEqual(["30. Sept. -", "2. Okt."]);
  });

  it("collapses Today to a dated icon so the title keeps its room", () => {
    const container = render_phone_header("month", "September");
    const today = container.querySelector<HTMLButtonElement>(
      'button[aria-label="calendar.today"]',
    );

    expect(today).not.toBeNull();
    expect(today?.textContent).toBe("16");
  });

  it("collapses the view picker to an icon with a hidden label", () => {
    const container = render_phone_header("month", "September");
    const trigger = container.querySelector<HTMLElement>("[data-view-select]");

    expect(trigger).not.toBeNull();

    const visible_text = Array.from(trigger!.querySelectorAll("*"))
      .filter((node) => !node.classList.contains("sr-only"))
      .flatMap((node) =>
        Array.from(node.childNodes).filter(
          (child) => child.nodeType === Node.TEXT_NODE,
        ),
      )
      .map((child) => child.textContent?.trim())
      .filter(Boolean);

    expect(visible_text).toEqual([]);
    expect(trigger!.querySelector(".sr-only")?.textContent).toBe(
      "calendar.month",
    );
  });
});
