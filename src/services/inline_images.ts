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

import { purify_outgoing_html } from "@/lib/html_sanitizer_compose";

export interface InlineImage {
  id: string;
  cid: string;
  data: ArrayBuffer;
  mime_type: string;
  filename: string;
}

export const MAX_INLINE_IMAGES = 20;
export const MAX_INLINE_IMAGE_SIZE = 5 * 1024 * 1024;
export const MAX_TOTAL_INLINE_SIZE = 10 * 1024 * 1024;

export function extract_inline_images(html: string): {
  processed_html: string;
  images: InlineImage[];
} {
  const doc = new DOMParser().parseFromString(
    purify_outgoing_html(html),
    "text/html",
  );
  const imgs = doc.querySelectorAll("img[src^='data:']");
  const extracted: InlineImage[] = [];
  let total_size = 0;

  for (const img of Array.from(imgs)) {
    if (extracted.length >= MAX_INLINE_IMAGES) break;

    const src = img.getAttribute("src") || "";
    const match = src.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);

    if (!match) continue;

    const mime_type = match[1];
    const b64_data = match[2];

    if (mime_type === "image/svg+xml") continue;

    const binary = atob(b64_data);

    if (binary.length === 0) continue;

    const buffer = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buffer);

    for (let i = 0; i < binary.length; i++) {
      view[i] = binary.charCodeAt(i);
    }

    if (buffer.byteLength > MAX_INLINE_IMAGE_SIZE) continue;
    if (total_size + buffer.byteLength > MAX_TOTAL_INLINE_SIZE) continue;

    total_size += buffer.byteLength;

    const cid = `img_${crypto.randomUUID()}@astermail.org`;
    const ext = mime_type.split("/")[1] || "png";
    const original_name = img.getAttribute("data-filename");
    const filename = original_name || `inline_${extracted.length + 1}.${ext}`;

    extracted.push({
      id: crypto.randomUUID(),
      cid,
      data: buffer,
      mime_type,
      filename,
    });

    img.setAttribute("src", `cid:${cid}`);
  }

  return {
    processed_html: doc.body.innerHTML,
    images: extracted,
  };
}
