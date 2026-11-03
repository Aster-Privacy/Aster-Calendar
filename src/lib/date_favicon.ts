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
import {
  DATED_ICON_FONT_WEIGHT,
  DATED_ICON_PANEL_FILL,
  DATED_ICON_TEXT_FILL,
  fit_dated_label,
  measure_label_with_canvas,
  type DatedLabelLayout,
  type LabelMeasurer,
} from "@/lib/dated_calendar_icon";

const ICON_SRC = "/favicon-64x64.png";
const ICON_NATURAL_SIZE = 64;
const FALLBACK_SRC = "/favicon-32x32.png";
const CANVAS_FONT_STACK =
  '"Google Sans Flex", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SVG_FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SIZES = [32, 64] as const;
const SVG_SIZE = 64;
const PANEL = { left: 0.336, top: 0.347, right: 1, bottom: 1 };
const ERASE = { left: 0.359, top: 0.39, right: 1, bottom: 0.938 };
const PANEL_RGB = [0x1d, 0x58, 0xee] as const;
const LABEL_HEIGHT_RATIO = 0.66;
const DAY_CHECK_INTERVAL_MS = 60_000;
const PROBE_SIZE = 64;
const PROBE_COLORS = [
  [0x1d, 0x58, 0xee],
  [0xf2, 0x41, 0x0b],
  [0x2a, 0xc7, 0x5d],
  [0xfe, 0xfd, 0xfc],
] as const;

type Rgb = readonly [number, number, number];

export interface FaviconLayout {
  size: number;
  glyph_top: number;
  glyph_height: number;
  erase: readonly [number, number, number, number];
  label: DatedLabelLayout;
}

let icon_promise: Promise<HTMLImageElement> | null = null;
let icon_data_promise: Promise<string> | null = null;

let rendered_key = "";
let midnight_timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function date_key(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function rgb_css([r, g, b]: Rgb) {
  return `rgb(${r}, ${g}, ${b})`;
}

function load_icon(): Promise<HTMLImageElement> {
  if (icon_promise) return icon_promise;
  icon_promise = new Promise((resolve, reject) => {
    const image = new Image();

    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("favicon icon failed to load"));
    image.src = ICON_SRC;
  });
  icon_promise.catch(() => {
    icon_promise = null;
  });

  return icon_promise;
}

function bytes_to_base64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;

  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }

  return btoa(binary);
}

function load_icon_data_url(): Promise<string> {
  if (icon_data_promise) return icon_data_promise;
  icon_data_promise = fetch(ICON_SRC)
    .then((response) => {
      if (!response.ok) throw new Error("favicon icon failed to load");

      return response.arrayBuffer();
    })
    .then((buffer) => {
      const bytes = new Uint8Array(buffer);

      if (bytes.length === 0) throw new Error("favicon icon is empty");

      return `data:image/png;base64,${bytes_to_base64(bytes)}`;
    });
  icon_data_promise.catch(() => {
    icon_data_promise = null;
  });

  return icon_data_promise;
}

export function compute_favicon_layout(
  size: number,
  natural_width: number,
  natural_height: number,
  day: number,
  font_stack: string,
  measure: LabelMeasurer = measure_label_with_canvas,
): FaviconLayout {
  const glyph_height = Math.round((size * natural_height) / natural_width);
  const glyph_top = Math.round((size - glyph_height) / 2);
  const erase_left = Math.floor(size * ERASE.left);
  const erase_top = Math.floor(glyph_top + glyph_height * ERASE.top);
  const erase = [
    erase_left,
    erase_top,
    Math.ceil(size * ERASE.right) - erase_left,
    Math.ceil(glyph_top + glyph_height * ERASE.bottom) - erase_top,
  ] as const;
  const label = fit_dated_label(
    String(day),
    {
      left: size * PANEL.left,
      top: glyph_top + glyph_height * PANEL.top,
      width: size * (PANEL.right - PANEL.left),
      height: glyph_height * (PANEL.bottom - PANEL.top),
    },
    LABEL_HEIGHT_RATIO,
    font_stack,
    measure,
  );

  return { size, glyph_top, glyph_height, erase, label };
}

function pixel_matches(data: Uint8ClampedArray, offset: number, rgb: Rgb) {
  return (
    data[offset] === rgb[0] &&
    data[offset + 1] === rgb[1] &&
    data[offset + 2] === rgb[2] &&
    data[offset + 3] === 255
  );
}

export function probe_canvas_readback(): boolean {
  try {
    const canvas = document.createElement("canvas");

    canvas.width = PROBE_SIZE;
    canvas.height = PROBE_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) return false;

    const half = PROBE_SIZE / 2;

    PROBE_COLORS.forEach((rgb, index) => {
      context.fillStyle = rgb_css(rgb);
      context.fillRect(
        (index % 2) * half,
        Math.floor(index / 2) * half,
        half,
        half,
      );
    });

    const data = context.getImageData(0, 0, PROBE_SIZE, PROBE_SIZE).data;

    if (data.length !== PROBE_SIZE * PROBE_SIZE * 4) return false;

    for (let y = 0; y < PROBE_SIZE; y += 1) {
      for (let x = 0; x < PROBE_SIZE; x += 1) {
        const quadrant = (y < half ? 0 : 2) + (x < half ? 0 : 1);
        const offset = (y * PROBE_SIZE + x) * 4;

        if (!pixel_matches(data, offset, PROBE_COLORS[quadrant])) return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function is_trustworthy_favicon_pixels(
  data: Uint8ClampedArray,
  layout: FaviconLayout,
): boolean {
  const { size, erase } = layout;

  if (data.length !== size * size * 4) return false;

  const sample = ((erase[1] + 1) * size + erase[0] + 1) * 4;

  if (!pixel_matches(data, sample, PANEL_RGB)) return false;

  for (let offset = 4; offset < data.length; offset += 4) {
    if (
      data[offset] !== data[0] ||
      data[offset + 1] !== data[1] ||
      data[offset + 2] !== data[2] ||
      data[offset + 3] !== data[3]
    ) {
      return true;
    }
  }

  return false;
}

function draw_day(image: HTMLImageElement, size: number, day: number) {
  try {
    const canvas = document.createElement("canvas");

    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context || !image.naturalWidth || !image.naturalHeight) return null;

    const layout = compute_favicon_layout(
      size,
      image.naturalWidth,
      image.naturalHeight,
      day,
      CANVAS_FONT_STACK,
    );
    const [erase_x, erase_y, erase_w, erase_h] = layout.erase;

    context.drawImage(image, 0, layout.glyph_top, size, layout.glyph_height);
    context.fillStyle = DATED_ICON_PANEL_FILL;
    context.fillRect(erase_x, erase_y, erase_w, erase_h);
    context.fontKerning = "none";
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.fillStyle = DATED_ICON_TEXT_FILL;
    context.font = `${DATED_ICON_FONT_WEIGHT} ${layout.label.font_px}px ${CANVAS_FONT_STACK}`;
    context.fillText(layout.label.label, layout.label.x, layout.label.y);

    const pixels = context.getImageData(0, 0, size, size).data;

    if (!is_trustworthy_favicon_pixels(pixels, layout)) return null;

    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export function build_date_favicon_svg(
  icon_data_url: string,
  day: number,
  measure: LabelMeasurer = measure_label_with_canvas,
): string {
  const layout = compute_favicon_layout(
    SVG_SIZE,
    ICON_NATURAL_SIZE,
    ICON_NATURAL_SIZE,
    day,
    SVG_FONT_STACK,
    measure,
  );
  const [erase_x, erase_y, erase_w, erase_h] = layout.erase;
  const { label } = layout;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_SIZE}" height="${SVG_SIZE}" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}">`,
    `<image href="${icon_data_url}" x="0" y="${layout.glyph_top}" width="${SVG_SIZE}" height="${layout.glyph_height}" preserveAspectRatio="none"/>`,
    `<rect fill="${DATED_ICON_PANEL_FILL}" x="${erase_x}" y="${erase_y}" width="${erase_w}" height="${erase_h}"/>`,
    `<text fill="${DATED_ICON_TEXT_FILL}" font-family='${SVG_FONT_STACK}' font-size="${label.font_px}" font-weight="${DATED_ICON_FONT_WEIGHT}" text-anchor="middle" x="${label.x}" y="${label.y}">${label.label}</text>`,
    "</svg>",
  ].join("");
}

function ensure_link(size: number): HTMLLinkElement {
  const selector = `link[rel="icon"][data-date-favicon="${size}"]`;
  const existing = document.head.querySelector<HTMLLinkElement>(selector);

  if (existing) return existing;

  const link = document.createElement("link");

  link.rel = "icon";
  link.type = "image/png";
  link.setAttribute("sizes", `${size}x${size}`);
  link.dataset.dateFavicon = String(size);
  document.head.appendChild(link);

  return link;
}

function ensure_svg_link(): HTMLLinkElement {
  const link =
    document.head.querySelector<HTMLLinkElement>(
      'link[rel="icon"][data-date-favicon="svg"]',
    ) ?? document.createElement("link");

  link.rel = "icon";
  link.type = "image/svg+xml";
  link.setAttribute("sizes", "any");
  link.dataset.dateFavicon = "svg";
  document.head.appendChild(link);

  return link;
}

function remove_links(selector: string) {
  document.head
    .querySelectorAll<HTMLLinkElement>(selector)
    .forEach((link) => link.remove());
}

function remove_static_icons() {
  remove_links('link[rel="icon"]:not([data-date-favicon])');
}

function remove_svg_icon() {
  remove_links('link[rel="icon"][data-date-favicon="svg"]');
}

function remove_png_date_icons() {
  remove_links(
    'link[rel="icon"][data-date-favicon]:not([data-date-favicon="svg"])',
  );
}

async function render_canvas_favicon(day: number): Promise<boolean> {
  if (!probe_canvas_readback()) return false;

  const image = await load_icon().catch(() => null);

  if (!image) return false;

  const urls = SIZES.map((size) => [size, draw_day(image, size, day)] as const);

  if (urls.some(([, url]) => !url)) return false;

  remove_svg_icon();
  remove_static_icons();
  for (const [size, url] of urls) {
    ensure_link(size).href = url as string;
  }

  return true;
}

async function render_svg_favicon(day: number): Promise<boolean> {
  const icon_data_url = await load_icon_data_url().catch(() => null);

  if (!icon_data_url) return false;

  const svg = build_date_favicon_svg(icon_data_url, day);

  remove_png_date_icons();
  ensure_svg_link().href = `data:image/svg+xml,${encodeURIComponent(svg)}`;

  return true;
}

export function render_date_favicon(now = new Date()): Promise<boolean> {
  const day = now.getDate();
  const key = date_key(now);

  return render_canvas_favicon(day)
    .then((applied) => applied || render_svg_favicon(day))
    .then((applied) => {
      if (applied) {
        rendered_key = key;

        return true;
      }
      remove_svg_icon();
      ensure_link(32).href = FALLBACK_SRC;

      return false;
    })
    .catch(() => false);
}

function ms_until_midnight(now = new Date()) {
  const next = new Date(now);

  next.setHours(24, 0, 0, 0);

  return Math.max(1000, next.getTime() - now.getTime());
}

function refresh_if_day_changed() {
  const now = new Date();

  if (date_key(now) !== rendered_key) void render_date_favicon(now);
}

function schedule_midnight() {
  if (midnight_timer) clearTimeout(midnight_timer);
  midnight_timer = setTimeout(() => {
    refresh_if_day_changed();
    schedule_midnight();
  }, ms_until_midnight());
}

export function start_date_favicon() {
  if (started || typeof document === "undefined") return;
  started = true;

  const render = () => {
    void render_date_favicon();
    schedule_midnight();
  };

  if (document.fonts?.load) {
    document.fonts.load(`700 14px "Google Sans Flex"`).then(render, render);
  } else {
    render();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refresh_if_day_changed();
      schedule_midnight();
    }
  });
  window.addEventListener("focus", refresh_if_day_changed);
  window.addEventListener("pageshow", refresh_if_day_changed);
  setInterval(refresh_if_day_changed, DAY_CHECK_INTERVAL_MS);
}
