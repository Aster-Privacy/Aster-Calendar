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
import type { PanelAppearance } from "@/pages/mail_panel/mail_panel_bridge";

import { set_theme_override } from "@/contexts/theme_context";
import { set_host_color_theme } from "@/contexts/preferences_context/helpers";
import { set_appearance_lock } from "@/lib/dark_mode";

export function apply_host_appearance(appearance: PanelAppearance | null): void {
  if (appearance === null) {
    set_appearance_lock(null);
    set_host_color_theme(null);
    set_theme_override(null);

    return;
  }

  set_appearance_lock(appearance.theme === "dark");
  set_host_color_theme({
    color_theme: appearance.palette,
    accent_color: appearance.accent,
  });
  set_theme_override(appearance.theme);
}
