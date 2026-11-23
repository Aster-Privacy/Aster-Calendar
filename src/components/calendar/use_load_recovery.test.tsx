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
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { use_load_recovery } from "./use_load_recovery";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
const reload = vi.fn();

function Probe({ failed }: { failed: boolean }) {
  use_load_recovery(failed, reload);

  return null;
}

async function render(failed: boolean) {
  await act(async () => {
    root.render(createElement(Probe, { failed }));
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("use_load_recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reload.mockReset();
    root = createRoot(document.createElement("div"));
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does nothing while the calendar loads normally", async () => {
    await render(false);
    await advance(300_000);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("focus"));
    });

    expect(reload).not.toHaveBeenCalled();
  });

  it("retries on its own with growing delays after a failed load", async () => {
    await render(true);
    await advance(1_999);

    expect(reload).not.toHaveBeenCalled();

    await advance(1);

    expect(reload).toHaveBeenCalledTimes(1);

    await advance(5_000);

    expect(reload).toHaveBeenCalledTimes(2);

    await advance(300_000);

    const calls = reload.mock.calls.length;

    expect(calls).toBeGreaterThan(4);
    expect(calls).toBeLessThan(12);
  });

  it("stops retrying once a load succeeds", async () => {
    await render(true);
    await advance(2_000);
    await render(false);

    const calls = reload.mock.calls.length;

    await advance(300_000);

    expect(reload).toHaveBeenCalledTimes(calls);
  });

  it("waits for the connection before retrying", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await render(true);
    await advance(300_000);

    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads when the connection returns", async () => {
    await render(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads when the window gains focus or comes back into view", async () => {
    await render(true);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(reload).toHaveBeenCalledTimes(1);

    await advance(1_500);
    reload.mockReset();
    await advance(5_000);
    reload.mockReset();

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads once when several window events fire together", async () => {
    await render(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("stops retrying after unmount", async () => {
    await render(true);
    await act(async () => {
      root.render(null);
    });
    await advance(300_000);

    expect(reload).not.toHaveBeenCalled();
  });
});
