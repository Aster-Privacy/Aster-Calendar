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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const replace_mock = vi.fn();

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: () => null,
}));

const { default: LinkDevice } = await import("./link_device");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const original_location = window.location;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function set_location(hash: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...original_location,
      pathname: "/link-device",
      search: "",
      hash,
      replace: replace_mock,
    },
  });
}

async function render_page() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<LinkDevice />);
  });
}

describe("link device page", () => {
  beforeEach(() => {
    replace_mock.mockReset();
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    container?.remove();
    root = null;
    container = null;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: original_location,
    });
  });

  it("sends the browser to the mail app with the device fingerprint", async () => {
    set_location("#v=9b16af790a6ae2f255d3");

    await render_page();

    expect(replace_mock).toHaveBeenCalledTimes(1);
    expect(replace_mock).toHaveBeenCalledWith(
      "https://app.astermail.org/link-device#v=9B16AF790A6AE2F255D3",
    );
  });

  it("sends the browser to the mail app without a fingerprint", async () => {
    set_location("");

    await render_page();

    expect(replace_mock).toHaveBeenCalledWith(
      "https://app.astermail.org/link-device",
    );
  });

  it("drops a fragment that is not a device fingerprint", async () => {
    set_location("#v=9B16AF790A6AE2F2&next=https://example.com");

    await render_page();

    expect(replace_mock).toHaveBeenCalledWith(
      "https://app.astermail.org/link-device",
    );
  });

  it("never links the device itself", async () => {
    set_location("#v=9B16AF790A6AE2F255D3");

    await render_page();

    expect(container!.querySelector("input")).toBeNull();
    expect(container!.querySelector("button")).toBeNull();
    expect(container!.querySelector('[role="status"]')).not.toBeNull();
  });
});
