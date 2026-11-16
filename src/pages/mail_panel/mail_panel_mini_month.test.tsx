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
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { day_key } from "@/pages/mail_panel/mail_panel_days";
import { MailPanelMiniMonth } from "@/pages/mail_panel/mail_panel_mini_month";
import {
  SELECTED_MARKER_CLASS,
  TODAY_MARKER_CLASS,
} from "@/lib/day_marker";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function noop(): void {}

function render_month(today: Date, selected_date: Date): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <MailPanelMiniMonth
        day_buckets={new Map()}
        selected_date={selected_date}
        today={today}
        view_month={new Date(2026, 10, 1)}
        week_start_day={0}
        on_change_month={noop}
        on_reset={noop}
        on_select_day={noop}
      />,
    ),
  );

  return container;
}

function marker_for(host: HTMLElement, day: Date): HTMLElement {
  const key = day_key(day);
  const cell = host.querySelector<HTMLElement>(`[data-day-key='${key}'] > span`);

  if (!cell) throw new Error(`missing cell ${key}`);

  return cell;
}

function marker_classes(): string[] {
  return [TODAY_MARKER_CLASS, SELECTED_MARKER_CLASS];
}

describe("mail panel mini month day markers", () => {
  it("draws today as a solid accent circle with contrast text", () => {
    const host = render_month(new Date(2026, 10, 12), new Date(2026, 10, 12));
    const today = marker_for(host, new Date(2026, 10, 12));

    expect(today.className).toContain(TODAY_MARKER_CLASS);
    expect(today.className).not.toContain("aster-selected");
  });

  it("draws a selected day as a solid circle, never a tint", () => {
    const host = render_month(new Date(2026, 10, 12), new Date(2026, 10, 20));
    const selected = marker_for(host, new Date(2026, 10, 20));
    const today = marker_for(host, new Date(2026, 10, 12));

    expect(selected.className).toContain(SELECTED_MARKER_CLASS);
    expect(selected.className).not.toContain("aster-selected");
    expect(today.className).toContain(TODAY_MARKER_CLASS);
  });

  it("uses only opaque fills for every marker", () => {
    marker_classes().forEach((marker) => {
      expect(marker).toContain("rounded-full");
      expect(marker).toMatch(/\bbg-\[var\(/);
      expect(marker).toMatch(/\btext-\[var\(/);
      expect(marker).not.toMatch(
        /aster-selected|aster-hover|opacity|transparent|\]\/\d+/,
      );
    });
  });

  it("leaves other days without a fill", () => {
    const host = render_month(new Date(2026, 10, 12), new Date(2026, 10, 12));
    const plain = marker_for(host, new Date(2026, 10, 14));

    expect(plain.className).not.toMatch(/\bbg-\[var\(--(calendar_today_marker_bg|text-primary)/);
  });
});
