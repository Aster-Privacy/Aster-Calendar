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
import type { PointerEvent as ReactPointerEvent } from "react";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const EVENT_TOOLTIP_DELAY_MS = 400;

const TOOLTIP_GAP_PX = 6;
const TOOLTIP_ESTIMATED_HEIGHT_PX = 96;

export interface EventTooltipContent {
  title: string;
  time: string;
  calendar?: string;
  location?: string;
}

interface TooltipState {
  content: EventTooltipContent;
  left: number;
  top: number;
  placement: "above" | "below";
}

export function resolve_tooltip_placement(
  anchor_bottom: number,
  viewport_height: number,
  estimated_height = TOOLTIP_ESTIMATED_HEIGHT_PX,
): "above" | "below" {
  return anchor_bottom + TOOLTIP_GAP_PX + estimated_height <= viewport_height
    ? "below"
    : "above";
}

function EventTooltipCard({ state }: { state: TooltipState }) {
  const { content, left, top, placement } = state;
  const details = [content.calendar, content.location].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  return (
    <div
      aria-hidden="true"
      className="aster_floating aster_floating_anim pointer-events-none fixed z-[80] max-w-[260px] px-3 py-2 text-[12.5px] leading-[1.35]"
      data-state="open"
      data-testid="calendar-event-tooltip"
      role="tooltip"
      style={{
        left,
        top,
        translate: placement === "below" ? "-50% 0" : "-50% -100%",
      }}
    >
      <div className="truncate font-medium text-txt-primary">
        {content.title}
      </div>
      <div className="tabular-nums text-txt-secondary" dir="ltr">
        {content.time}
      </div>
      {details.map((detail, index) => (
        <div key={index} className="truncate text-txt-muted">
          {detail}
        </div>
      ))}
    </div>
  );
}

export function use_event_tooltip() {
  const [state, set_state] = useState<TooltipState | null>(null);
  const timer_ref = useRef<number | null>(null);

  const clear_timer = () => {
    if (timer_ref.current !== null) {
      window.clearTimeout(timer_ref.current);
      timer_ref.current = null;
    }
  };

  const hide = useCallback(() => {
    clear_timer();
    set_state(null);
  }, []);

  const show = useCallback(
    (anchor: HTMLElement, content: EventTooltipContent) => {
      clear_timer();
      timer_ref.current = window.setTimeout(() => {
        timer_ref.current = null;

        if (!anchor.isConnected) {
          return;
        }

        const rect = anchor.getBoundingClientRect();
        const placement = resolve_tooltip_placement(
          rect.bottom,
          window.innerHeight,
        );

        set_state({
          content,
          left: Math.min(
            Math.max(rect.left + rect.width / 2, 140),
            window.innerWidth - 140,
          ),
          placement,
          top:
            placement === "below"
              ? rect.bottom + TOOLTIP_GAP_PX
              : rect.top - TOOLTIP_GAP_PX,
        });
      }, EVENT_TOOLTIP_DELAY_MS);
    },
    [],
  );

  useEffect(() => {
    const listener_options = { capture: true } as const;

    document.addEventListener("pointerdown", hide, listener_options);
    document.addEventListener("dragstart", hide, listener_options);
    document.addEventListener("scroll", hide, listener_options);
    document.addEventListener("keydown", hide, listener_options);
    window.addEventListener("blur", hide);

    return () => {
      clear_timer();
      document.removeEventListener("pointerdown", hide, listener_options);
      document.removeEventListener("dragstart", hide, listener_options);
      document.removeEventListener("scroll", hide, listener_options);
      document.removeEventListener("keydown", hide, listener_options);
      window.removeEventListener("blur", hide);
    };
  }, [hide]);

  const bind = useCallback(
    (content: EventTooltipContent) => ({
      onPointerEnter: (entered: ReactPointerEvent<HTMLElement>) => {
        if (entered.pointerType === "touch" || entered.buttons !== 0) {
          return;
        }

        show(entered.currentTarget, content);
      },
      onPointerLeave: hide,
    }),
    [hide, show],
  );

  const element = state
    ? createPortal(<EventTooltipCard state={state} />, document.body)
    : null;

  return { bind, element, hide, show };
}
