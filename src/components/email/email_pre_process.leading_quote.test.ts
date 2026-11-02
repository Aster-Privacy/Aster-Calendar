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

import { describe, expect, it } from "vitest";

import { pre_process_email_html } from "./email_pre_process";

const options = {
  forwarded_label: "Forwarded message",
  show_trimmed_label: "Show trimmed content",
  preserve_formatting: false,
  load_remote_content: false,
  proxy_base: "",
};

const quote =
  '<div class="aster_quote"><div class="aster_quote_attr">On Sun, Aug 31, 2026 someone &lt;a@b.com&gt; wrote:</div><blockquote class="aster_quote_body">original text</blockquote></div>';

describe("quoted reply toggle placement", () => {
  it("keeps the toggle after the reply when the reply comes first", () => {
    const out = pre_process_email_html(
      `<div>Hello!</div><div>The Aster Team</div><br><br>${quote}`,
      options,
    );

    expect(out.indexOf("aster-quote-toggle")).toBeGreaterThan(
      out.indexOf("The Aster Team"),
    );
  });

  it("moves the toggle below the reply when the quote leads the body", () => {
    const out = pre_process_email_html(
      `<br><br>${quote}<div data-aster-signature="1">Hello!<br>The Aster Team</div>`,
      options,
    );

    expect(out.indexOf("aster-quote-toggle")).toBeGreaterThan(
      out.indexOf("The Aster Team"),
    );
    expect(out.startsWith("<br>")).toBe(false);
  });
});
