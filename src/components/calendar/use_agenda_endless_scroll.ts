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
import type { RefObject } from "react";

import { useEffect, useLayoutEffect, useRef } from "react";

import { first_row_at_or_after } from "@/services/calendar/schedule_range";

export const AUTO_EXTEND_LIMIT = 8;
export const SENTINEL_MARGIN_PX = 600;

export interface AgendaEndless {
  is_loading: boolean;
  scroll_request: { token: number; day: Date } | null;
  on_extend: (direction: -1 | 1) => void;
  on_visible_month_change: (month: Date) => void;
}

interface EndlessScrollArgs {
  root_ref: RefObject<HTMLDivElement | null>;
  top_ref: RefObject<HTMLDivElement | null>;
  bottom_ref: RefObject<HTMLDivElement | null>;
  endless: AgendaEndless | undefined;
  header_height: number;
}

type Direction = -1 | 1;

const DAY_KEY_ATTRIBUTE = "data-day-key";

export function anchored_scroll_top(
  scroll_top: number,
  saved_offset: number,
  current_offset: number,
): number {
  return scroll_top + current_offset - saved_offset;
}

function parse_day_key(key: string): Date | null {
  const [year, month, day] = key.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function list_rows(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(`[${DAY_KEY_ATTRIBUTE}]`),
  );
}

function row_offset(root: HTMLElement, row: HTMLElement): number {
  return row.getBoundingClientRect().top - root.getBoundingClientRect().top;
}

export function use_agenda_endless_scroll({
  root_ref,
  top_ref,
  bottom_ref,
  endless,
  header_height,
}: EndlessScrollArgs): void {
  const endless_ref = useRef(endless);
  const anchor_ref = useRef<{ key: string; offset: number } | null>(null);
  const expected_scroll_ref = useRef<number | null>(null);
  const applied_token_ref = useRef(0);
  const chain_ref = useRef<Record<Direction, number>>({ [-1]: 0, [1]: 0 });
  const intersecting_ref = useRef<Record<Direction, boolean>>({
    [-1]: false,
    [1]: false,
  });
  const is_active = Boolean(endless);

  endless_ref.current = endless;

  const has_pending_request = () => {
    const request = endless_ref.current?.scroll_request;

    return Boolean(request && request.token !== applied_token_ref.current);
  };

  const scroll_root_to = (root: HTMLElement, top: number) => {
    const max_top = root.scrollHeight - root.clientHeight;
    const next = Math.max(0, max_top > 0 ? Math.min(top, max_top) : top);

    expected_scroll_ref.current = next;
    root.scrollTo({ top: next, behavior: "instant" });
  };

  const report_month = (key: string) => {
    const day = parse_day_key(key);

    if (day) {
      endless_ref.current?.on_visible_month_change(
        new Date(day.getFullYear(), day.getMonth(), 1),
      );
    }
  };

  const save_anchor = (root: HTMLElement, should_report = true) => {
    const row = list_rows(root).find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const top = rect.top - root.getBoundingClientRect().top;

      return top + rect.height > header_height;
    });

    if (!row) {
      anchor_ref.current = null;

      return;
    }

    const key = row.getAttribute(DAY_KEY_ATTRIBUTE) ?? "";

    anchor_ref.current = { key, offset: row_offset(root, row) };

    if (should_report) {
      report_month(key);
    }
  };

  const try_extend = (direction: Direction) => {
    const current = endless_ref.current;

    if (
      !current ||
      current.is_loading ||
      has_pending_request() ||
      !intersecting_ref.current[direction] ||
      chain_ref.current[direction] >= AUTO_EXTEND_LIMIT
    ) {
      return;
    }

    chain_ref.current[direction] += 1;
    current.on_extend(direction);
  };

  const try_extend_ref = useRef(try_extend);
  const save_anchor_ref = useRef(save_anchor);

  try_extend_ref.current = try_extend;
  save_anchor_ref.current = save_anchor;

  useLayoutEffect(() => {
    const root = root_ref.current;
    const current = endless_ref.current;

    if (!root || !current) {
      return;
    }

    const request = current.scroll_request;

    if (request && request.token !== applied_token_ref.current) {
      if (current.is_loading) {
        return;
      }

      const rows = list_rows(root);
      const days = rows.map(
        (row) =>
          parse_day_key(row.getAttribute(DAY_KEY_ATTRIBUTE) ?? "") ??
          new Date(0),
      );
      const index = first_row_at_or_after(days, request.day);
      const target = index === -1 ? rows[rows.length - 1] : rows[index];

      applied_token_ref.current = request.token;

      if (!target) {
        return;
      }

      scroll_root_to(
        root,
        root.scrollTop + row_offset(root, target) - header_height,
      );
      save_anchor_ref.current(root, false);

      return;
    }

    const anchor = anchor_ref.current;

    if (!anchor) {
      return;
    }

    const row = root.querySelector<HTMLElement>(
      `[${DAY_KEY_ATTRIBUTE}="${anchor.key}"]`,
    );

    if (!row) {
      return;
    }

    const offset = row_offset(root, row);

    if (offset !== anchor.offset) {
      scroll_root_to(
        root,
        anchored_scroll_top(root.scrollTop, anchor.offset, offset),
      );
    }
  });

  useEffect(() => {
    const root = root_ref.current;

    if (!root || !is_active) {
      return;
    }

    const handle_scroll = () => {
      const expected = expected_scroll_ref.current;

      if (expected !== null && Math.abs(root.scrollTop - expected) < 1) {
        expected_scroll_ref.current = null;

        return;
      }

      expected_scroll_ref.current = null;
      chain_ref.current = { [-1]: 0, [1]: 0 };
      save_anchor_ref.current(root);
      try_extend_ref.current(-1);
      try_extend_ref.current(1);
    };

    root.addEventListener("scroll", handle_scroll, { passive: true });

    return () => root.removeEventListener("scroll", handle_scroll);
  }, [is_active, root_ref]);

  useEffect(() => {
    const root = root_ref.current;
    const top = top_ref.current;
    const bottom = bottom_ref.current;

    if (!root || !top || !bottom || !is_active) {
      return;
    }

    const watch = (target: HTMLElement, direction: Direction) => {
      const margin =
        direction < 0
          ? `${SENTINEL_MARGIN_PX}px 0px 0px 0px`
          : `0px 0px ${SENTINEL_MARGIN_PX}px 0px`;
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];

          if (!entry) {
            return;
          }

          intersecting_ref.current[direction] = entry.isIntersecting;
          try_extend_ref.current(direction);
        },
        { root, rootMargin: margin },
      );

      observer.observe(target);

      return observer;
    };

    const observers = [watch(top, -1), watch(bottom, 1)];

    return () => {
      for (const observer of observers) {
        observer.disconnect();
      }

      intersecting_ref.current = { [-1]: false, [1]: false };
    };
  }, [is_active, root_ref, top_ref, bottom_ref]);

  const is_loading = endless?.is_loading ?? false;
  const scroll_token = endless?.scroll_request?.token ?? 0;

  useEffect(() => {
    if (!is_loading) {
      try_extend_ref.current(-1);
      try_extend_ref.current(1);
    }
  }, [is_loading, scroll_token]);
}
