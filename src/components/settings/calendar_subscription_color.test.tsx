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

const update_preference = vi.fn();
let subscriptions: Array<{
  id: string;
  url: string;
  name: string;
  color: string;
}> = [];

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { calendar_ics_subscriptions: subscriptions },
    update_preference,
  }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/services/api/calendar", () => ({
  list_calendars: vi.fn(async () => []),
  list_event_masters: vi.fn(async () => []),
}));

vi.mock("@/services/api/client", () => ({
  api_client: { post: vi.fn() },
}));

import { CalendarSubscriptionsCard } from "@/components/settings/calendar_import_export_section";
import { EVENT_COLOR_OPTIONS } from "@/components/calendar/calendar_utils";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function render_card(): HTMLDivElement {
  const container = document.createElement("div");

  document.body.appendChild(container);

  const root = createRoot(container);

  act(() => {
    root.render(<CalendarSubscriptionsCard />);
  });
  mounted.push({ root, container });

  return container;
}

function all_color_buttons(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-subscription-color]"),
  );
}

function color_buttons(): HTMLButtonElement[] {
  return all_color_buttons().filter((button) =>
    (button.getAttribute("aria-label") ?? "").includes(
      "calendar.ie_sub_color_named",
    ),
  );
}

function new_color_button(): HTMLButtonElement {
  return all_color_buttons().find(
    (button) =>
      button.getAttribute("aria-label") === "calendar.ie_sub_color_label",
  )!;
}

function type_into(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;

  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submit_form() {
  const form = document.querySelector("form")!;

  act(() => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

function open_picker(index: number): HTMLButtonElement[] {
  return open_picker_for(color_buttons()[index]);
}

function open_picker_for(button: HTMLButtonElement): HTMLButtonElement[] {
  act(() => {
    button.click();
  });

  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      "[data-subscription-color-option]",
    ),
  );
}

beforeEach(() => {
  update_preference.mockReset();
  subscriptions = [
    {
      id: "sub-1",
      url: "https://example.com/one.ics",
      name: "Holidays",
      color: "#0b8043",
    },
    {
      id: "sub-2",
      url: "https://example.com/two.ics",
      name: "Team",
      color: "#3f51b5",
    },
  ];
});

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

describe("subscription color picker", () => {
  it("shows a labeled color button for each subscription", () => {
    render_card();

    const buttons = color_buttons();

    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute("aria-label")).toContain(
      "calendar.ie_sub_color_named",
    );
    expect(buttons[0].getAttribute("aria-label")).toContain("Holidays");
    expect(buttons[0].dataset.subscriptionColor).toBe("green");
  });

  it("marks the current color and saves a new one for only that subscription", () => {
    render_card();

    const options = open_picker(1);

    expect(options.length).toBeGreaterThan(1);

    const selected = options.filter(
      (option) => option.getAttribute("aria-checked") === "true",
    );

    expect(selected).toHaveLength(1);

    const target = options.find(
      (option) => option.dataset.subscriptionColorOption === "red",
    )!;

    act(() => {
      target.click();
    });

    expect(update_preference).toHaveBeenCalledTimes(1);

    const [key, value] = update_preference.mock.calls[0];

    expect(key).toBe("calendar_ics_subscriptions");
    expect(value).toHaveLength(2);
    expect(value[0]).toEqual(subscriptions[0]);
    expect(value[1]).toEqual({
      ...subscriptions[1],
      color: expect.any(String),
    });
    expect(value[1].color).not.toBe(subscriptions[1].color);
    expect(value[1].color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(
      document.querySelectorAll("[data-subscription-color-option]"),
    ).toHaveLength(0);
  });

  it("does not save when the current color is picked again", () => {
    render_card();

    const options = open_picker(0);
    const current = options.find(
      (option) => option.getAttribute("aria-checked") === "true",
    )!;

    act(() => {
      current.click();
    });

    expect(update_preference).not.toHaveBeenCalled();
  });
});

describe("adding a subscription", () => {
  it("suggests a color that no subscription or holiday calendar uses", () => {
    render_card();

    const button = new_color_button();

    expect(button).toBeDefined();
    expect(button.dataset.subscriptionColor).not.toBe("green");
    expect(button.dataset.subscriptionColor).not.toBe(
      color_buttons()[1].dataset.subscriptionColor,
    );
  });

  it("saves the color picked in the form", () => {
    render_card();

    const options = open_picker_for(new_color_button());
    const purple = options.find(
      (option) => option.dataset.subscriptionColorOption === "purple",
    )!;

    act(() => {
      purple.click();
    });

    expect(new_color_button().dataset.subscriptionColor).toBe("purple");

    type_into("calendar_subscription_name", "Club");
    type_into("calendar_subscription_url", "https://example.com/club.ics");
    submit_form();

    expect(update_preference).toHaveBeenCalledTimes(1);

    const [key, value] = update_preference.mock.calls[0];
    const added = value[value.length - 1];

    expect(key).toBe("calendar_ics_subscriptions");
    expect(value).toHaveLength(3);
    expect(added.name).toBe("Club");
    expect(added.color.toLowerCase()).toBe(
      EVENT_COLOR_OPTIONS.find(
        (option) => option.name === "purple",
      )!.hex.toLowerCase(),
    );
  });

  it("accepts a webcal link and stores it as https", () => {
    render_card();

    type_into("calendar_subscription_name", "Club");
    type_into("calendar_subscription_url", "webcal://example.com/club.ics");
    submit_form();

    expect(update_preference).toHaveBeenCalledTimes(1);

    const value = update_preference.mock.calls[0][1];

    expect(value[value.length - 1].url).toBe("https://example.com/club.ics");
  });
});
