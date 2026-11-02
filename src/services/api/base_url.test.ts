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
import { afterEach, describe, expect, it, vi } from "vitest";

import { get_api_base_url, get_ws_base_url } from "./base_url";

const tauri_window = window as unknown as Record<string, unknown>;

afterEach(() => {
  delete tauri_window.__TAURI_INTERNALS__;
  vi.unstubAllEnvs();
});

describe("native base url", () => {
  it("targets the production api from the desktop shell", () => {
    tauri_window.__TAURI_INTERNALS__ = {};
    expect(get_api_base_url()).toBe("https://app.astermail.org/api");
    expect(get_ws_base_url()).toBe("wss://app.astermail.org/ws");
  });

  it("honors a local api in a dev desktop build", () => {
    tauri_window.__TAURI_INTERNALS__ = {};
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_NATIVE_API_URL", "http://127.0.0.1:3000/api/");
    expect(get_api_base_url()).toBe("http://127.0.0.1:3000/api");
    expect(get_ws_base_url()).toBe("ws://127.0.0.1:3000/ws");
  });

  it("ignores the local api outside dev", () => {
    tauri_window.__TAURI_INTERNALS__ = {};
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_NATIVE_API_URL", "http://127.0.0.1:3000/api");
    expect(get_api_base_url()).toBe("https://app.astermail.org/api");
  });

  it("ignores a non http value", () => {
    tauri_window.__TAURI_INTERNALS__ = {};
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_NATIVE_API_URL", "javascript:alert(1)");
    expect(get_api_base_url()).toBe("https://app.astermail.org/api");
  });
});
