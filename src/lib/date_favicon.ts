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
const ICON_SRC = "/favicon-64x64.png";
const FALLBACK_SRC = "/favicon-32x32.png";
const FONT_STACK =
  '"Google Sans Flex", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SIZES = [32, 64] as const;
const PANEL = { left: 0.336, top: 0.347, right: 1, bottom: 1 };
const ERASE = { left: 0.359, top: 0.39, right: 1, bottom: 0.938 };
const PANEL_FILL = "#1d58ee";
const DAY_CHECK_INTERVAL_MS = 60_000;

let icon_promise: Promise<HTMLImageElement> | null = null;

let rendered_key = "";
let midnight_timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function date_key(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
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

  return icon_promise;
}

function draw_day(image: HTMLImageElement, size: number, day: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const glyph_h = Math.round((size * image.naturalHeight) / image.naturalWidth);
  const top = Math.round((size - glyph_h) / 2);
  context.drawImage(image, 0, top, size, glyph_h);

  const erase_left = Math.floor(size * ERASE.left);
  const erase_top = Math.floor(top + glyph_h * ERASE.top);

  context.fillStyle = PANEL_FILL;
  context.fillRect(
    erase_left,
    erase_top,
    Math.ceil(size * ERASE.right) - erase_left,
    Math.ceil(top + glyph_h * ERASE.bottom) - erase_top,
  );

  const panel_left = size * PANEL.left;
  const panel_top = top + glyph_h * PANEL.top;
  const panel_width = size * (PANEL.right - PANEL.left);
  const panel_height = glyph_h * (PANEL.bottom - PANEL.top);
  const label = String(day);

  context.fontKerning = "none";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillStyle = "#ffffff";

  let font_px = Math.floor(panel_height * 1.4);
  let metrics = context.measureText(label);

  for (;;) {
    context.font = `560 ${font_px}px ${FONT_STACK}`;
    metrics = context.measureText(label);
    const ink_width =
      metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
    const ink_height =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

    if (
      font_px <= 6 ||
      (ink_width <= panel_width * 0.78 && ink_height <= panel_height * 0.66)
    ) {
      break;
    }

    font_px -= 1;
  }

  const center_x =
    panel_left +
    panel_width / 2 +
    (metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2;
  const baseline =
    panel_top +
    panel_height / 2 +
    (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;

  context.fillText(label, Math.round(center_x), Math.round(baseline));

  return canvas.toDataURL("image/png");
}

function ensure_link(size: number): HTMLLinkElement {
  const selector = `link[rel="icon"][data-date-favicon="${size}"]`;
  const existing = document.head.querySelector<HTMLLinkElement>(selector);
  if (existing) return existing;

  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  link.sizes.add(`${size}x${size}`);
  link.dataset.dateFavicon = String(size);
  document.head.appendChild(link);

  return link;
}

function remove_static_icons() {
  document.head
    .querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"]:not([data-date-favicon])',
    )
    .forEach((link) => link.remove());
}

export function render_date_favicon(now = new Date()) {
  const day = now.getDate();
  const key = date_key(now);

  return load_icon()
    .then((image) => {
      const urls = SIZES.map(
        (size) => [size, draw_day(image, size, day)] as const,
      );
      if (urls.some(([, url]) => !url)) return false;

      remove_static_icons();
      for (const [size, url] of urls) {
        ensure_link(size).href = url as string;
      }
      rendered_key = key;

      return true;
    })
    .catch(() => {
      ensure_link(32).href = FALLBACK_SRC;

      return false;
    });
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
