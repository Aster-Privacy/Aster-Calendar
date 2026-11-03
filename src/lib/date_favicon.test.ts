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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type Readback = "faithful" | "random" | "blank";

const CANVAS_URL = "data:image/png;base64,Y2FudmFz";
const PNG_BYTES = new Uint8Array([137, 80, 78, 71]);

function parse_color(value: string): [number, number, number] {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);

  if (hex) {
    return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)];
  }
  const rgb = /rgb\((\d+), (\d+), (\d+)\)/.exec(value);

  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : [0, 0, 0];
}

function install_canvas(readback: Readback) {
  const to_data_url = vi
    .spyOn(HTMLCanvasElement.prototype, "toDataURL")
    .mockReturnValue(CANVAS_URL);

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      const width = this.width;
      const pixels = new Uint8ClampedArray(width * this.height * 4);
      const context = {
        fillStyle: "#000000",
        font: "10px sans-serif",
        fontKerning: "auto",
        textAlign: "start",
        textBaseline: "alphabetic",
        drawImage: () => {
          pixels.fill(40);
        },
        fillText: () => {},
        measureText: (label: string) => {
          const size = Number(/(\d+)px/.exec(context.font)?.[1] ?? "10");

          return {
            actualBoundingBoxLeft: 0.25 * size * label.length,
            actualBoundingBoxRight: 0.25 * size * label.length,
            actualBoundingBoxAscent: 0.7 * size,
            actualBoundingBoxDescent: 0,
          };
        },
        fillRect: (x: number, y: number, w: number, h: number) => {
          const [r, g, b] = parse_color(context.fillStyle);

          for (let row = y; row < y + h; row += 1) {
            for (let column = x; column < x + w; column += 1) {
              const offset = (row * width + column) * 4;

              pixels.set([r, g, b, 255], offset);
            }
          }
        },
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          if (readback === "faithful") return { data: pixels.slice() };
          const data = new Uint8ClampedArray(w * h * 4);

          if (readback === "blank") return { data };
          for (let index = 0; index < data.length; index += 1) {
            data[index] = Math.floor(Math.random() * 256);
          }

          return { data };
        },
      };

      return context as unknown as CanvasRenderingContext2D;
    } as unknown as typeof HTMLCanvasElement.prototype.getContext,
  );

  return to_data_url;
}

class LoadedImage {
  decoding = "auto";
  naturalWidth = 64;
  naturalHeight = 64;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

function icon_links() {
  return Array.from(
    document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'),
  );
}

function static_links() {
  return icon_links().filter((link) => !link.dataset.dateFavicon);
}

async function load_module() {
  vi.resetModules();

  return import("./date_favicon");
}

describe("date favicon", () => {
  let fetch_mock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.head.innerHTML = [
      '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
      '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
    ].join("");
    fetch_mock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => PNG_BYTES.buffer.slice(0),
    }));
    vi.stubGlobal("fetch", fetch_mock);
    vi.stubGlobal("Image", LoadedImage);
  });

  afterEach(() => {
    document.head.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("trusts canvas readback only when the probe pixels come back intact", async () => {
    const { probe_canvas_readback } = await load_module();

    install_canvas("faithful");
    expect(probe_canvas_readback()).toBe(true);
    vi.restoreAllMocks();

    install_canvas("random");
    expect(probe_canvas_readback()).toBe(false);
    vi.restoreAllMocks();

    install_canvas("blank");
    expect(probe_canvas_readback()).toBe(false);
    vi.restoreAllMocks();

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(probe_canvas_readback()).toBe(false);
  });

  it("rejects uniform or noisy favicon pixels", async () => {
    const { compute_favicon_layout, is_trustworthy_favicon_pixels } =
      await load_module();
    const layout = compute_favicon_layout(
      32,
      64,
      64,
      3,
      "sans-serif",
      () => null,
    );
    const [erase_x, erase_y] = layout.erase;
    const blank = new Uint8ClampedArray(32 * 32 * 4);
    const good = new Uint8ClampedArray(32 * 32 * 4);

    good.set([0x1d, 0x58, 0xee, 255], ((erase_y + 1) * 32 + erase_x + 1) * 4);

    expect(is_trustworthy_favicon_pixels(blank, layout)).toBe(false);
    expect(
      is_trustworthy_favicon_pixels(new Uint8ClampedArray(16), layout),
    ).toBe(false);
    expect(is_trustworthy_favicon_pixels(good, layout)).toBe(true);
  });

  it("uses the canvas favicon when readback is trustworthy", async () => {
    const { render_date_favicon } = await load_module();
    const to_data_url = install_canvas("faithful");

    await expect(render_date_favicon(new Date(2026, 10, 3))).resolves.toBe(
      true,
    );

    expect(static_links()).toHaveLength(0);
    expect(icon_links().map((link) => link.dataset.dateFavicon)).toEqual([
      "32",
      "64",
    ]);
    expect(icon_links().every((link) => link.href === CANVAS_URL)).toBe(true);
    expect(to_data_url).toHaveBeenCalledTimes(2);
    expect(fetch_mock).not.toHaveBeenCalled();
  });

  it("switches to an svg favicon and keeps the static icons when readback is poisoned", async () => {
    const { render_date_favicon } = await load_module();
    const to_data_url = install_canvas("random");

    await expect(render_date_favicon(new Date(2026, 10, 3))).resolves.toBe(
      true,
    );

    const links = icon_links();
    const svg_link = links[links.length - 1];
    const svg = decodeURIComponent(
      svg_link.getAttribute("href")!.replace("data:image/svg+xml,", ""),
    );

    expect(static_links()).toHaveLength(2);
    expect(svg_link.dataset.dateFavicon).toBe("svg");
    expect(svg_link.type).toBe("image/svg+xml");
    expect(svg_link.getAttribute("sizes")).toBe("any");
    expect(svg_link.getAttribute("href")).toMatch(/^data:image\/svg\+xml,/);
    expect(svg).toContain('href="data:image/png;base64,iVBORw=="');
    expect(svg).toContain('fill="#1d58ee"');
    expect(svg).toMatch(/text-anchor="middle"[^>]*>3<\/text>/);
    expect(to_data_url).not.toHaveBeenCalled();
    expect(
      links.filter((link) => /^(32|64)$/.test(link.dataset.dateFavicon ?? "")),
    ).toHaveLength(0);
  });

  it("keeps the static icons when neither dated favicon can be built", async () => {
    const { render_date_favicon } = await load_module();

    install_canvas("blank");
    fetch_mock.mockRejectedValue(new Error("offline"));

    await expect(render_date_favicon(new Date(2026, 10, 3))).resolves.toBe(
      false,
    );

    expect(static_links()).toHaveLength(2);
    expect(
      document.head.querySelector('link[data-date-favicon="svg"]'),
    ).toBeNull();
    expect(
      document.head
        .querySelector('link[data-date-favicon="32"]')
        ?.getAttribute("href"),
    ).toBe("/favicon-32x32.png");
  });

  it("builds a self-contained svg with the day centered on the panel", async () => {
    const { build_date_favicon_svg } = await load_module();
    const svg = build_date_favicon_svg(
      "data:image/png;base64,AAAA",
      24,
      (label, font) => {
        const size = Number(/(\d+)px/.exec(font)?.[1] ?? "0");

        return {
          left: 0.25 * size * label.length,
          right: 0.25 * size * label.length,
          ascent: 0.7 * size,
          descent: 0,
        };
      },
    );
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    const text = parsed.querySelector("text");

    expect(parsed.querySelector("svg")?.getAttribute("viewBox")).toBe(
      "0 0 64 64",
    );
    expect(parsed.querySelector("image")?.getAttribute("href")).toBe(
      "data:image/png;base64,AAAA",
    );
    expect(text?.textContent).toBe("24");
    expect(text?.getAttribute("font-weight")).toBe("560");
    expect(text?.getAttribute("fill")).toBe("#ffffff");
    expect(Number(text?.getAttribute("x"))).toBeGreaterThan(32);
    expect(svg).not.toContain("Google Sans Flex");
  });
});
