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

import { BUILTIN_CATEGORIES } from "@/data/category_catalog";
import { en } from "@/lib/i18n/translations/en";

function english(key: string): string {
  const [section, name] = key.split(".");

  return (en as unknown as Record<string, Record<string, string>>)[section][
    name
  ];
}

const CANONICAL = [
  ["primary", "Inbox"],
  ["promotions", "Deals"],
  ["newsletters", "Newsletters"],
  ["social", "Social"],
  ["updates", "Notifications"],
  ["transactions", "Purchases"],
  ["forums", "Discussions"],
  ["finance", "Finance"],
  ["travel", "Travel"],
  ["shopping", "Shopping"],
];

describe("category_catalog", () => {
  it("keeps the canonical order and labels", () => {
    expect(
      BUILTIN_CATEGORIES.map((def) => [def.id, english(def.label_key)]),
    ).toEqual(CANONICAL);
  });
});
