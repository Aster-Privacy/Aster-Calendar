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
import type { TagColorMap } from "@/services/calendar/tag_colors";

import { useCallback, useMemo } from "react";

import { use_preferences } from "@/contexts/preferences_context";
import {
  resolve_tag_color,
  with_tag_color,
} from "@/services/calendar/tag_colors";

const EMPTY_TAG_COLORS: TagColorMap = {};

export interface TagColorsApi {
  colors: TagColorMap;
  color_for: (name: string) => string;
  set_tag_color: (name: string, color: string) => void;
}

export function use_tag_colors(): TagColorsApi {
  const { preferences, update_preference } = use_preferences();
  const colors = preferences.calendar_tag_colors ?? EMPTY_TAG_COLORS;

  const color_for = useCallback(
    (name: string) => resolve_tag_color(name, colors),
    [colors],
  );

  const set_tag_color = useCallback(
    (name: string, color: string) => {
      const next = with_tag_color(colors, name, color);

      if (next !== colors) {
        update_preference("calendar_tag_colors", next);
      }
    },
    [colors, update_preference],
  );

  return useMemo(
    () => ({ colors, color_for, set_tag_color }),
    [colors, color_for, set_tag_color],
  );
}
