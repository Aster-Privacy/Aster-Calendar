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
export const EVENT_LINK_ID_PARAM = "event";
export const EVENT_LINK_DATE_PARAM = "date";

interface EventLinkSource {
  id: string;
  starts_at: string;
}

interface LinkLocation {
  origin: string;
  pathname: string;
}

export interface EventLinkTarget {
  event_id: string;
  date: Date | null;
}

const pad = (value: number) => String(value).padStart(2, "0");

export function format_link_date(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function build_event_link(
  location: LinkLocation,
  event: EventLinkSource,
): string {
  const url = new URL(location.pathname, location.origin);
  const start = new Date(event.starts_at);

  url.searchParams.set(EVENT_LINK_ID_PARAM, event.id);

  if (!Number.isNaN(start.getTime())) {
    url.searchParams.set(EVENT_LINK_DATE_PARAM, format_link_date(start));
  }

  return url.toString();
}

export function read_event_link(search: string): EventLinkTarget | null {
  const params = new URLSearchParams(search);
  const event_id = params.get(EVENT_LINK_ID_PARAM)?.trim() ?? "";

  if (event_id.length === 0) {
    return null;
  }

  const raw_date = params.get(EVENT_LINK_DATE_PARAM) ?? "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw_date);
  let date: Date | null = null;

  if (match) {
    const candidate = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );

    if (
      candidate.getMonth() === Number(match[2]) - 1 &&
      candidate.getDate() === Number(match[3])
    ) {
      date = candidate;
    }
  }

  return { event_id, date };
}

export function strip_event_link(href: string): string {
  const url = new URL(href);

  url.searchParams.delete(EVENT_LINK_ID_PARAM);
  url.searchParams.delete(EVENT_LINK_DATE_PARAM);

  return url.toString();
}
