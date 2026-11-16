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
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { apply_host_appearance } from "@/pages/mail_panel/mail_panel_appearance";
import { apply_color_theme_class } from "@/contexts/preferences_context/helpers";
import { set_palette_forces_dark, set_theme_is_dark } from "@/lib/dark_mode";

const root = () => document.documentElement;

function palette_classes(): string[] {
  return Array.from(root().classList).filter((name) =>
    name.startsWith("theme-"),
  );
}

describe("mail panel appearance", () => {
  beforeEach(() => {
    set_theme_is_dark(false);
    set_palette_forces_dark(false);
    apply_color_theme_class("default", "", "", "", false);
  });

  afterEach(() => {
    apply_host_appearance(null);
    root().className = "";
    root().removeAttribute("style");
  });

  it("follows a dark host even when the panel's own preferences are light", () => {
    expect(root().classList.contains("dark")).toBe(false);
    expect(palette_classes()).toEqual([]);

    apply_host_appearance({
      theme: "dark",
      palette: "aster-blue",
      accent: "#4f7df3",
    });

    expect(root().classList.contains("dark")).toBe(true);
    expect(root().classList.contains("light")).toBe(false);
    expect(palette_classes()).toEqual(["theme-aster-blue"]);
  });

  it("keeps the host appearance when the panel's preferences apply again", () => {
    apply_host_appearance({ theme: "dark", palette: "default", accent: "" });

    set_theme_is_dark(false);
    apply_color_theme_class("purple", "", "", "", false);

    expect(root().classList.contains("dark")).toBe(true);
    expect(palette_classes()).toEqual([]);
  });

  it("stays light for a light host when the panel's own palette forces dark", () => {
    apply_color_theme_class("purple", "", "", "", true);
    expect(root().classList.contains("dark")).toBe(true);

    apply_host_appearance({ theme: "light", palette: "default", accent: "" });

    expect(root().classList.contains("dark")).toBe(false);
    expect(root().classList.contains("light")).toBe(true);
    expect(palette_classes()).toEqual([]);
  });

  it("switches back to light when the host changes while the panel is open", () => {
    apply_host_appearance({
      theme: "dark",
      palette: "black",
      accent: "",
    });
    apply_host_appearance({ theme: "light", palette: "default", accent: "" });

    expect(root().classList.contains("dark")).toBe(false);
    expect(root().classList.contains("light")).toBe(true);
    expect(palette_classes()).toEqual([]);
  });
});
