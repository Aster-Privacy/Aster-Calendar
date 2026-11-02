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
import { useEffect, useState } from "react";

export interface VisibleViewport {
  top: number;
  height: number;
  bottom_inset: number;
}

const SCALE_TOLERANCE = 0.01;

function read_visible_viewport(): VisibleViewport | null {
  const viewport = window.visualViewport;

  if (!viewport || Math.abs(viewport.scale - 1) > SCALE_TOLERANCE) {
    return null;
  }

  const top = Math.max(0, Math.round(viewport.offsetTop));
  const height = Math.round(viewport.height);
  const bottom_inset = Math.max(
    0,
    Math.round(window.innerHeight - top - height),
  );

  return { top, height, bottom_inset };
}

function same_viewport(
  current: VisibleViewport | null,
  next: VisibleViewport | null,
): boolean {
  if (current === null || next === null) {
    return current === next;
  }

  return (
    current.top === next.top &&
    current.height === next.height &&
    current.bottom_inset === next.bottom_inset
  );
}

export function use_visible_viewport(enabled: boolean): VisibleViewport | null {
  const [visible, set_visible] = useState<VisibleViewport | null>(null);

  useEffect(() => {
    const viewport =
      typeof window === "undefined" ? undefined : window.visualViewport;

    if (!enabled || !viewport) {
      set_visible(null);

      return;
    }

    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = read_visible_viewport();

        set_visible((current) =>
          same_viewport(current, next) ? current : next,
        );
      });
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [enabled]);

  return visible;
}
