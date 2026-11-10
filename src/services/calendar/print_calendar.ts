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
import type { DecryptedCalendarEvent } from "@/types/calendar";

export type PrintLayout = "grid" | "agenda";

export type PrintOrientation = "portrait" | "landscape";

export interface PrintCalendarOptions {
  title: string;
  subtitle: string;
  days: Date[];
  events: DecryptedCalendarEvent[];
  color_by_event_id: Map<string, string>;
  layout: PrintLayout;
  orientation: PrintOrientation;
  show_declined: boolean;
  language: string;
  time_format: "12h" | "24h";
  labels: {
    all_day: string;
    no_events: string;
    printed_on: string;
    more_events?: string;
  };
}

export const PRINT_ROOT_CLASS = "calendar_print_root";

export const PRINT_PAGE_SIZE_PX: Record<
  PrintOrientation,
  { width: number; height: number }
> = {
  portrait: { width: 794, height: 1123 },
  landscape: { width: 1123, height: 794 },
};

const PRINT_PAGE_MARGIN_PX = 45;

const PRINT_GRID_BUDGET_PX: Record<PrintOrientation, number> = {
  portrait: 860,
  landscape: 600,
};

const PRINT_ROOT_ID = "calendar_print_root";

const MAX_GRID_COLUMNS = 7;
const MAX_FILLED_GRID_ROWS = 6;
const MIN_GRID_ROW_PX = 96;
const GRID_WEEKDAY_ROW_PX = 22;
const GRID_DAY_HEAD_PX = 24;
const GRID_EVENT_LINE_PX = 16;
const GRID_WRAP_MAX_ROWS = 2;
const GRID_CHAR_WIDTH_PX = 5.4;

const SAFE_COLOR_PATTERN =
  /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?(?:(?:\s*[,/]\s*|\s+)[\d.]+%?){2,3}\s*\))$/i;
const CSS_VARIABLE_PATTERN = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/;
const FALLBACK_COLOR = "#3b82f6";

const PRINT_STYLES = `
.${PRINT_ROOT_CLASS} { font-family: Inter, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.4; color: #1a1a1a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.${PRINT_ROOT_CLASS} * { box-sizing: border-box; }
.${PRINT_ROOT_CLASS} .head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin: 0 0 12px; }
.${PRINT_ROOT_CLASS} h1 { font-size: 20px; line-height: 1.2; margin: 0; font-weight: 650; letter-spacing: -0.01em; }
.${PRINT_ROOT_CLASS} .sub { font-size: 11px; color: #5f5f5f; margin: 0; white-space: nowrap; }
.${PRINT_ROOT_CLASS} table.grid { display: table; width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; border: 1px solid #d4d4d4; border-radius: 8px; overflow: hidden; }
.${PRINT_ROOT_CLASS} table.grid thead { display: table-header-group; }
.${PRINT_ROOT_CLASS} table.grid tbody { display: table-row-group; }
.${PRINT_ROOT_CLASS} table.grid tr { display: table-row; }
.${PRINT_ROOT_CLASS} table.grid th, .${PRINT_ROOT_CLASS} table.grid td { display: table-cell; }
.${PRINT_ROOT_CLASS} table.grid th { font-size: 9.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #6b6b6b; text-align: left; padding: 0 6px; height: ${GRID_WEEKDAY_ROW_PX}px; border-left: 1px solid #d4d4d4; background: #f6f6f6; }
.${PRINT_ROOT_CLASS} table.grid th:first-child { border-left: 0; }
.${PRINT_ROOT_CLASS} table.grid tr { page-break-inside: avoid; break-inside: avoid; }
.${PRINT_ROOT_CLASS} table.grid td { border-top: 1px solid #d4d4d4; border-left: 1px solid #d4d4d4; vertical-align: top; padding: 0; }
.${PRINT_ROOT_CLASS} table.grid tbody tr:first-child td { border-top: 0; }
.${PRINT_ROOT_CLASS} table.grid thead + tbody tr:first-child td { border-top: 1px solid #d4d4d4; }
.${PRINT_ROOT_CLASS} table.grid td:first-child { border-left: 0; }
.${PRINT_ROOT_CLASS} .cell { overflow: hidden; padding: 4px 5px; }
.${PRINT_ROOT_CLASS} td.muted .day_head { color: #a3a3a3; }
.${PRINT_ROOT_CLASS} .day_head { font-weight: 600; font-size: 11px; height: ${GRID_DAY_HEAD_PX - 4}px; line-height: ${GRID_DAY_HEAD_PX - 4}px; padding: 0 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.${PRINT_ROOT_CLASS} ul { list-style: none; margin: 0; padding: 0; }
.${PRINT_ROOT_CLASS} .cell li.event { height: ${GRID_EVENT_LINE_PX}px; line-height: ${GRID_EVENT_LINE_PX}px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 3px; border-radius: 3px; font-size: 10px; }
.${PRINT_ROOT_CLASS} .cell li.event + li.event { margin-top: 1px; }
.${PRINT_ROOT_CLASS} table.wrap .cell li.event { height: auto; white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; padding-left: 13px; text-indent: -10px; }
.${PRINT_ROOT_CLASS} .cell li.all_day { color: #1a1a1a; }
.${PRINT_ROOT_CLASS} .cell li.all_day .time { display: none; }
.${PRINT_ROOT_CLASS} .cell li.more { height: ${GRID_EVENT_LINE_PX}px; line-height: ${GRID_EVENT_LINE_PX}px; padding: 0 3px; font-size: 10px; color: #6b6b6b; font-weight: 500; }
.${PRINT_ROOT_CLASS} .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 4px; vertical-align: 1px; }
.${PRINT_ROOT_CLASS} .time { margin-right: 4px; color: #5f5f5f; white-space: nowrap; font-variant-numeric: tabular-nums; }
.${PRINT_ROOT_CLASS} .title { font-weight: 500; }
.${PRINT_ROOT_CLASS} .loc { color: #6b6b6b; margin-left: 4px; }
.${PRINT_ROOT_CLASS} .agenda_day { display: flex; gap: 16px; padding: 8px 0; border-top: 1px solid #e2e2e2; page-break-inside: avoid; break-inside: avoid; }
.${PRINT_ROOT_CLASS} .agenda_day:first-of-type { border-top: 1px solid #c8c8c8; }
.${PRINT_ROOT_CLASS} .agenda_date { flex: 0 0 92px; display: flex; align-items: baseline; gap: 6px; }
.${PRINT_ROOT_CLASS} .agenda_num { font-size: 18px; font-weight: 650; line-height: 1.1; font-variant-numeric: tabular-nums; min-width: 22px; }
.${PRINT_ROOT_CLASS} .agenda_label { font-size: 10px; color: #5f5f5f; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }
.${PRINT_ROOT_CLASS} .agenda_day ul { flex: 1 1 auto; min-width: 0; }
.${PRINT_ROOT_CLASS} .agenda_day li.event { display: flex; align-items: baseline; gap: 8px; padding: 2px 0; }
.${PRINT_ROOT_CLASS} .agenda_day li.event .dot { flex: 0 0 auto; margin: 0; vertical-align: 0; transform: translateY(-1px); }
.${PRINT_ROOT_CLASS} .agenda_day li.event .time { flex: 0 0 128px; margin: 0; }
.${PRINT_ROOT_CLASS} .agenda_day li.event .title { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.${PRINT_ROOT_CLASS} .agenda_day li.event .loc { flex: 0 1 38%; margin: 0; text-align: right; overflow-wrap: anywhere; }
.${PRINT_ROOT_CLASS} .empty { color: #6b6b6b; padding: 24px 0; text-align: center; border-top: 1px solid #c8c8c8; border-bottom: 1px solid #e2e2e2; }
.${PRINT_ROOT_CLASS} .footer { margin-top: 10px; font-size: 9.5px; color: #8a8a8a; }
`;

function resolve_css_variable(value: string): string {
  const match = CSS_VARIABLE_PATTERN.exec(value);

  if (!match || typeof document === "undefined") {
    return value;
  }

  const surface =
    document.querySelector("[data-calendar-surface]") ??
    document.documentElement;

  return getComputedStyle(surface).getPropertyValue(match[1]).trim();
}

function safe_color(value: string | undefined): string {
  const resolved = value ? resolve_css_variable(value.trim()) : "";

  return SAFE_COLOR_PATTERN.test(resolved) ? resolved : FALLBACK_COLOR;
}

export function escape_html(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function day_key(day: Date): string {
  return `${day.getFullYear()}_${day.getMonth()}_${day.getDate()}`;
}

function occurs_on(event: DecryptedCalendarEvent, day: Date): boolean {
  const day_start = new Date(day);

  day_start.setHours(0, 0, 0, 0);

  const day_end = new Date(day_start.getTime() + 86_400_000);
  const starts = new Date(event.starts_at).getTime();
  const ends = new Date(event.ends_at).getTime();

  return starts < day_end.getTime() && ends > day_start.getTime();
}

function format_time(
  value: string,
  language: string,
  time_format: "12h" | "24h",
): string {
  return new Intl.DateTimeFormat(language, {
    hour: "numeric",
    minute: "2-digit",
    hour12: time_format === "12h",
  }).format(new Date(value));
}

function is_declined(event: DecryptedCalendarEvent): boolean {
  return event.attendees.some(
    (attendee) => !attendee.is_organizer && attendee.response === "declined",
  );
}

export function group_events_by_day(
  days: Date[],
  events: DecryptedCalendarEvent[],
  show_declined: boolean,
): Map<string, DecryptedCalendarEvent[]> {
  const grouped = new Map<string, DecryptedCalendarEvent[]>();
  const visible = show_declined
    ? events
    : events.filter((event) => !is_declined(event));

  for (const day of days) {
    const matches = visible
      .filter((event) => occurs_on(event, day))
      .sort((left, right) => {
        if (left.is_all_day !== right.is_all_day) {
          return left.is_all_day ? -1 : 1;
        }

        return (
          new Date(left.starts_at).getTime() -
          new Date(right.starts_at).getTime()
        );
      });

    grouped.set(day_key(day), matches);
  }

  return grouped;
}

function render_event(
  event: DecryptedCalendarEvent,
  options: PrintCalendarOptions,
  is_cell: boolean,
): string {
  const color = escape_html(
    safe_color(options.color_by_event_id.get(event.id)),
  );
  const location = event.location.trim();
  const time = event.is_all_day
    ? options.labels.all_day
    : is_cell
      ? format_time(event.starts_at, options.language, options.time_format)
      : `${format_time(event.starts_at, options.language, options.time_format)} - ${format_time(event.ends_at, options.language, options.time_format)}`;
  const tint =
    is_cell && event.is_all_day
      ? ` style="background:color-mix(in srgb, ${color} 18%, #ffffff)"`
      : "";

  return [
    `<li class="event${event.is_all_day ? " all_day" : ""}"${tint}>`,
    `<span class="dot" style="background:${color}"></span>`,
    `<span class="time">${escape_html(time)}</span>`,
    `<span class="title">${escape_html(event.title)}</span>`,
    location ? `<span class="loc">${escape_html(location)}</span>` : "",
    "</li>",
  ].join("");
}

function primary_month_key(days: Date[]): string {
  const counts = new Map<string, number>();
  let best = "";
  let best_count = 0;

  for (const day of days) {
    const key = `${day.getFullYear()}_${day.getMonth()}`;
    const count = (counts.get(key) ?? 0) + 1;

    counts.set(key, count);

    if (count > best_count) {
      best = key;
      best_count = count;
    }
  }

  return best;
}

function grid_row_height(
  options: PrintCalendarOptions,
  rows: number,
  has_weekday_row: boolean,
): number {
  if (rows > MAX_FILLED_GRID_ROWS) {
    return MIN_GRID_ROW_PX + 14;
  }

  const budget =
    PRINT_GRID_BUDGET_PX[options.orientation] -
    (has_weekday_row ? GRID_WEEKDAY_ROW_PX : 0);

  return Math.max(MIN_GRID_ROW_PX, Math.floor(budget / rows));
}

function event_line_cost(
  event: DecryptedCalendarEvent,
  options: PrintCalendarOptions,
  chars_per_line: number,
): number {
  const time = event.is_all_day
    ? ""
    : format_time(event.starts_at, options.language, options.time_format);
  const location = event.location.trim();
  const length =
    time.length + event.title.length + (location ? location.length + 1 : 0) + 3;

  return Math.max(1, Math.ceil(length / chars_per_line));
}

function render_cell_events(
  day_events: DecryptedCalendarEvent[],
  options: PrintCalendarOptions,
  row_height: number,
  chars_per_line: number | null,
): string {
  if (day_events.length === 0) {
    return "";
  }

  const capacity = Math.max(
    1,
    Math.floor((row_height - 8 - GRID_DAY_HEAD_PX) / (GRID_EVENT_LINE_PX + 1)),
  );
  let shown: DecryptedCalendarEvent[];

  if (chars_per_line === null) {
    shown =
      day_events.length <= capacity
        ? day_events
        : day_events.slice(0, capacity - 1);
  } else {
    const costs = day_events.map((event) =>
      event_line_cost(event, options, chars_per_line),
    );
    const total = costs.reduce((sum, cost) => sum + cost, 0);
    const budget = total <= capacity ? capacity : capacity - 1;
    let used = 0;

    shown = [];

    for (let index = 0; index < day_events.length; index += 1) {
      if (used + costs[index] > budget) break;
      used += costs[index];
      shown.push(day_events[index]);
    }
  }

  const hidden = day_events.length - shown.length;
  const more_template = options.labels.more_events ?? "+{{count}}";
  const more =
    hidden > 0
      ? `<li class="more">${escape_html(more_template.replace("{{count}}", String(hidden)))}</li>`
      : "";

  return `<ul>${shown.map((event) => render_event(event, options, true)).join("")}${more}</ul>`;
}

function render_grid(options: PrintCalendarOptions): string {
  const grouped = group_events_by_day(
    options.days,
    options.events,
    options.show_declined,
  );
  const columns = Math.max(1, Math.min(options.days.length, MAX_GRID_COLUMNS));
  const row_count = Math.ceil(options.days.length / columns);
  const has_weekday_row = columns === MAX_GRID_COLUMNS;
  const row_height = grid_row_height(options, row_count, has_weekday_row);
  const wraps = row_count <= GRID_WRAP_MAX_ROWS;
  const page_width =
    PRINT_PAGE_SIZE_PX[options.orientation].width - PRINT_PAGE_MARGIN_PX * 2;
  const chars_per_line = wraps
    ? Math.max(8, Math.floor((page_width / columns - 26) / GRID_CHAR_WIDTH_PX))
    : null;
  const primary_month = primary_month_key(options.days);
  const weekday_format = new Intl.DateTimeFormat(options.language, {
    weekday: "short",
  });
  const month_day_format = new Intl.DateTimeFormat(options.language, {
    day: "numeric",
    month: "short",
  });
  const full_format = new Intl.DateTimeFormat(options.language, {
    day: "numeric",
    month: "short",
    weekday: "short",
  });
  const rows: string[] = [];

  for (let index = 0; index < options.days.length; index += columns) {
    const week = options.days.slice(index, index + columns);
    const cells = week
      .map((day, offset) => {
        const day_events = grouped.get(day_key(day)) ?? [];
        const is_first = index + offset === 0;
        const heading = !has_weekday_row
          ? full_format.format(day)
          : day.getDate() === 1 || is_first
            ? month_day_format.format(day)
            : String(day.getDate());
        const is_muted =
          row_count > 1 &&
          `${day.getFullYear()}_${day.getMonth()}` !== primary_month;

        return [
          `<td${is_muted ? ' class="muted"' : ""}>`,
          `<div class="cell" style="height:${row_height}px">`,
          `<div class="day_head">${escape_html(heading)}</div>`,
          render_cell_events(day_events, options, row_height, chars_per_line),
          "</div></td>",
        ].join("");
      })
      .join("");

    rows.push(`<tr>${cells}</tr>`);
  }

  const head = has_weekday_row
    ? `<thead><tr>${options.days
        .slice(0, columns)
        .map((day) => `<th>${escape_html(weekday_format.format(day))}</th>`)
        .join("")}</tr></thead>`
    : "";

  return `<table class="grid${wraps ? " wrap" : ""}">${head}<tbody>${rows.join("")}</tbody></table>`;
}

function render_agenda(options: PrintCalendarOptions): string {
  const grouped = group_events_by_day(
    options.days,
    options.events,
    options.show_declined,
  );
  const weekday_format = new Intl.DateTimeFormat(options.language, {
    weekday: "short",
  });
  const month_format = new Intl.DateTimeFormat(options.language, {
    month: "short",
  });
  const blocks = options.days
    .map((day) => {
      const day_events = grouped.get(day_key(day)) ?? [];

      if (day_events.length === 0) {
        return "";
      }

      return [
        '<section class="agenda_day">',
        '<div class="agenda_date">',
        `<span class="agenda_num">${day.getDate()}</span>`,
        `<span class="agenda_label">${escape_html(weekday_format.format(day))}<br>${escape_html(month_format.format(day))}</span>`,
        "</div>",
        `<ul>${day_events.map((event) => render_event(event, options, false)).join("")}</ul>`,
        "</section>",
      ].join("");
    })
    .filter((block) => block.length > 0);

  if (blocks.length === 0) {
    return `<p class="empty">${escape_html(options.labels.no_events)}</p>`;
  }

  return blocks.join("");
}

function page_rule(orientation: PrintOrientation): string {
  return `@page { size: ${orientation}; margin: 12mm; }`;
}

export function build_print_markup(options: PrintCalendarOptions): string {
  const body =
    options.layout === "agenda" ? render_agenda(options) : render_grid(options);

  return [
    '<div class="head">',
    `<h1>${escape_html(options.title)}</h1>`,
    `<p class="sub">${escape_html(options.subtitle)}</p>`,
    "</div>",
    body,
    `<p class="footer">${escape_html(options.labels.printed_on)}</p>`,
  ].join("");
}

export function build_print_html(options: PrintCalendarOptions): string {
  const page = PRINT_PAGE_SIZE_PX[options.orientation];

  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<title>${escape_html(options.title)}</title>`,
    `<style>${page_rule(options.orientation)}`,
    `html, body { margin: 0; background: #fff; }`,
    `body { box-sizing: border-box; width: ${page.width}px; height: ${page.height}px; padding: ${PRINT_PAGE_MARGIN_PX}px; overflow: hidden; }`,
    `${PRINT_STYLES}</style></head>`,
    `<body><div class="${PRINT_ROOT_CLASS}">${build_print_markup(options)}</div></body></html>`,
  ].join("");
}

export function print_calendar(options: PrintCalendarOptions): void {
  document.getElementById(PRINT_ROOT_ID)?.remove();

  const root = document.createElement("div");

  root.id = PRINT_ROOT_ID;
  root.className = PRINT_ROOT_CLASS;
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `<style>${page_rule(options.orientation)}${PRINT_STYLES}</style>${build_print_markup(options)}`;

  document.body.appendChild(root);

  const cleanup = () => {
    window.setTimeout(() => root.remove(), 500);
  };

  window.addEventListener("afterprint", cleanup, { once: true });

  window.setTimeout(() => {
    window.print();
  }, 120);
}
