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

import { en } from "./translations/en";

const LOCALES = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "pt-BR",
  "zh-CN",
  "ja",
  "ko",
  "ar",
  "ru",
  "nl",
  "pl",
  "tr",
  "hi",
];

const MAIL_NAME = "Aster Mail";
const CALENDAR_NAME = "Aster Calendar";

const SELF_NAME_KEYS = [
  "common.welcome_to_aster",
  "common.save_recovery_codes_title",
  "common.recovery_pdf_title",
  "settings.updates_auto_description",
  "settings.updates_banner_title",
  "settings.password_change_client_upgrade_required",
  "settings.password_change_fingerprint_mismatch",
  "settings.password_change_identity_continuity_required",
  "settings.address_change_check_failed",
  "settings.address_change_code_resent",
  "settings.address_change_send_failed",
  "settings.address_change_eligibility_failed",
  "auth.reset_link_sent_desc",
  "auth.support_step_desc",
  "auth.other_way_email_desc",
  "auth.reset_account_desc",
  "errors.tor_unsupported_platform",
  "errors.tor_native_only",
  "errors.tor_plugin_missing",
];

const MAIL_PRODUCT_KEYS = new Set([
  "common.app_name",
  "common.aster_mail",
  "common.workspace_title",
  "common.share_aster_mail_label",
  "common.check_out_aster_mail",
  "common.recovery_pdf_footer",
  "common.tray_show",
  "guard.sign_in_waiting_description",
  "settings.push_subscribe_failed",
  "settings.send_error_reports_description",
  "settings.close_to_tray_description",
  "settings.default_email_app_description",
  "settings.default_email_app_desktop_description",
  "settings.default_email_app_confirm_in_settings",
  "settings.default_email_app_change_in_settings",
  "settings.clear_cache_confirm_message",
  "settings.iconic_sounds_confirm_message",
  "settings.family_join_title",
  "settings.invite_title_named",
  "settings.invite_title_generic",
  "settings.invite_subtitle",
  "settings.invite_not_found_body",
  "settings.test_notification_body",
  "settings.referral_program_description",
  "settings.referral_email_body",
  "settings.referral_email_body_plain",
  "settings.affiliate_status_description",
  "settings.affiliate_info_step_disclosure",
  "settings.affiliate_info_step_account_binding",
  "settings.affiliate_learn_more_irs_confirm_title",
  "settings.error_deleting_account",
  "settings.external_server_unreachable",
  "settings.mailto_unregister_manual",
  "settings.domain_purchase_leave_title",
  "settings.domains_page_description",
  "settings.show_aster_branding",
  "settings.show_aster_branding_description",
  "settings.oauth_reason_wrong_account",
  "settings.rotate_dkim_description_managed",
  "settings.rotate_dkim_confirm_managed",
  "settings.rotate_dkim_confirm_manual",
  "settings.dkim_rotated_auto_published",
  "settings.key_source_aster",
  "settings.alias_import_failed_hint",
  "auth.your_new_aster_address",
  "auth.recovery_email_label",
  "auth.change_account_desc",
  "auth.browser_login_desc",
  "passkeys.managed_in_mail",
  "review_prompt.banner_message",
  "survey.modal_title",
  "survey.q_source",
  "survey.submitted_thanks",
  "calendar.open_mail",
]);

function flat(source: unknown): Map<string, string> {
  const out = new Map<string, string>();

  for (const [ns, entries] of Object.entries(
    source as Record<string, unknown>,
  )) {
    if (!entries || typeof entries !== "object") continue;

    for (const [key, value] of Object.entries(
      entries as Record<string, unknown>,
    )) {
      if (typeof value === "string") out.set(`${ns}.${key}`, value);
    }
  }

  return out;
}

async function load(code: string): Promise<Map<string, string>> {
  const module_exports = await import(`./translations/${code}.ts`);

  return flat(Object.values(module_exports)[0]);
}

describe("calendar app name", () => {
  it.each(LOCALES)("%s never calls this app Aster Mail", async (code) => {
    const strings = await load(code);
    const wrong = SELF_NAME_KEYS.filter((key) =>
      (strings.get(key) ?? "").includes(MAIL_NAME),
    );

    expect(wrong).toEqual([]);
  });

  it("english names the app Aster Calendar", () => {
    const strings = flat(en);
    const missing = SELF_NAME_KEYS.filter(
      (key) => !(strings.get(key) ?? "").includes(CALENDAR_NAME),
    );

    expect(missing).toEqual([]);
  });

  it("every english Aster Mail string refers to the mail product", () => {
    const unexpected = [...flat(en)]
      .filter(([, value]) => value.includes(MAIL_NAME))
      .map(([key]) => key)
      .filter((key) => !MAIL_PRODUCT_KEYS.has(key));

    expect(unexpected).toEqual([]);
  });
});
