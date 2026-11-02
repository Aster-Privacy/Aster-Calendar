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
import { useEffect, useState } from "react";

const PHONE_QUERY = "(max-width: 639px)";
const TABLET_QUERY = "(max-width: 1023px)";

function query_matches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : false;
}

function use_media_query(query: string): boolean {
  const [matches, set_matches] = useState(() => query_matches(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia(query);
    const handle_change = (changed: MediaQueryListEvent) =>
      set_matches(changed.matches);

    set_matches(media.matches);
    media.addEventListener("change", handle_change);

    return () => media.removeEventListener("change", handle_change);
  }, [query]);

  return matches;
}

export function use_calendar_breakpoint(): {
  is_phone: boolean;
  is_tablet: boolean;
} {
  const is_phone = use_media_query(PHONE_QUERY);
  const is_tablet = use_media_query(TABLET_QUERY);

  return { is_phone, is_tablet };
}
