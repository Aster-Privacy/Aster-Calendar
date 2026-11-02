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
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  UNDO_WINDOW_MS,
  clear_undo,
  has_undo,
  register_undo,
  take_undo,
} from "@/services/calendar/undo_stack";

const NOW = 1_800_000_000_000;

describe("undo_stack", () => {
  beforeEach(() => {
    clear_undo();
  });

  it("returns nothing when no action was registered", () => {
    expect(take_undo(NOW)).toBeNull();
    expect(has_undo(NOW)).toBe(false);
  });

  it("returns the registered action once", async () => {
    const run = vi.fn(async () => {});

    register_undo(run, NOW);

    expect(has_undo(NOW)).toBe(true);

    const taken = take_undo(NOW);

    expect(taken).not.toBeNull();

    await taken?.();

    expect(run).toHaveBeenCalledTimes(1);
    expect(take_undo(NOW)).toBeNull();
  });

  it("keeps only the most recent action", async () => {
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});

    register_undo(first, NOW);
    register_undo(second, NOW);

    await take_undo(NOW)?.();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("expires after the undo window", () => {
    register_undo(async () => {}, NOW);

    expect(has_undo(NOW + UNDO_WINDOW_MS + 1)).toBe(false);
    expect(take_undo(NOW + UNDO_WINDOW_MS + 1)).toBeNull();
  });

  it("clears a pending action", () => {
    register_undo(async () => {}, NOW);
    clear_undo();

    expect(take_undo(NOW)).toBeNull();
  });
});
