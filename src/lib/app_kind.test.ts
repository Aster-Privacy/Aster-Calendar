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
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  probe_webauthn_related_origins,
  reset_webauthn_related_origins_probe,
  webauthn_available_here,
} from "@/lib/app_kind";
import { is_webauthn_supported } from "@/services/api/webauthn";
import { is_passkey_supported } from "@/services/api/passkeys";

describe("webauthn_available_here", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    reset_webauthn_related_origins_probe();
  });

  function stub_credential_api(capabilities: Record<string, boolean> | null) {
    const credential_api = function public_key_credential() {};

    if (capabilities) {
      Object.assign(credential_api, {
        getClientCapabilities: () => Promise.resolve(capabilities),
      });
    }

    vi.stubGlobal("PublicKeyCredential", credential_api);
  }

  it("is off in the calendar until related origins are configured", () => {
    vi.stubEnv("VITE_APP_KIND", "calendar");
    vi.stubEnv("VITE_WEBAUTHN_RELATED_ORIGINS", "");
    vi.stubGlobal("PublicKeyCredential", function public_key_credential() {});

    expect(webauthn_available_here()).toBe(false);
    expect(is_webauthn_supported()).toBe(false);
    expect(is_passkey_supported()).toBe(false);
  });

  it("is on in the calendar when configured and the browser supports related origins", async () => {
    vi.stubEnv("VITE_APP_KIND", "calendar");
    vi.stubEnv("VITE_WEBAUTHN_RELATED_ORIGINS", "true");
    stub_credential_api({ relatedOrigins: true });

    expect(await probe_webauthn_related_origins()).toBe(true);
    expect(webauthn_available_here()).toBe(true);
    expect(is_webauthn_supported()).toBe(true);
    expect(is_passkey_supported()).toBe(true);
  });

  it("stays off in the calendar when the browser lacks related origins", async () => {
    vi.stubEnv("VITE_APP_KIND", "calendar");
    vi.stubEnv("VITE_WEBAUTHN_RELATED_ORIGINS", "true");
    stub_credential_api({ relatedOrigins: false });

    expect(await probe_webauthn_related_origins()).toBe(false);
    expect(webauthn_available_here()).toBe(false);
    expect(is_passkey_supported()).toBe(false);
  });

  it("stays off in the calendar when the browser cannot report capabilities", async () => {
    vi.stubEnv("VITE_APP_KIND", "calendar");
    vi.stubEnv("VITE_WEBAUTHN_RELATED_ORIGINS", "true");
    stub_credential_api(null);

    expect(await probe_webauthn_related_origins()).toBe(false);
    expect(webauthn_available_here()).toBe(false);
  });

  it("stays off in the calendar until the probe has run", () => {
    vi.stubEnv("VITE_APP_KIND", "calendar");
    vi.stubEnv("VITE_WEBAUTHN_RELATED_ORIGINS", "true");
    stub_credential_api({ relatedOrigins: true });

    expect(webauthn_available_here()).toBe(false);
  });

  it("is always on in the mail build", () => {
    vi.stubEnv("VITE_APP_KIND", "mail");
    vi.stubEnv("VITE_WEBAUTHN_RELATED_ORIGINS", "");

    expect(webauthn_available_here()).toBe(true);
  });
});
