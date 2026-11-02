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
import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";

import {
  get_invite_info,
  type InviteLookupResponse,
} from "@/services/api/invite";
import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import { Logo } from "@/components/auth/auth_styles";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { format_bytes } from "@/lib/utils";
import {
  bonus_bytes_per_referral,
  has_storage_bonus,
} from "@/lib/referral_bonus";
import { remember_invite_code } from "@/lib/pending_invite_code";

const page_wrap =
  "grid min-h-screen w-full place-items-center bg-surf-secondary px-4 py-10";
const content_wrap = "mx-auto w-full max-w-sm";
const INVITE_DISCOUNT_PERCENT = 20;

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const { t } = use_i18n();

  const [invite, set_invite] = useState<InviteLookupResponse | null>(null);
  const [is_loading, set_is_loading] = useState(true);
  const [load_failed, set_load_failed] = useState(false);
  const [reload_token, set_reload_token] = useState(0);

  useEffect(() => {
    if (!code) {
      set_is_loading(false);

      return;
    }

    let cancelled = false;

    set_is_loading(true);
    set_load_failed(false);

    get_invite_info(code)
      .then((r) => {
        if (cancelled) return;
        if (r.data) {
          if (r.data.valid) remember_invite_code(code);
          set_invite(
            r.data.valid
              ? r.data
              : {
                  valid: false,
                  referrer_display_name: null,
                  bonus_bytes_per_referral: bonus_bytes_per_referral(
                    r.data.bonus_bytes_per_referral,
                  ),
                },
          );

          return;
        }
        set_load_failed(true);
      })
      .catch(() => {
        if (!cancelled) set_load_failed(true);
      })
      .finally(() => {
        if (!cancelled) set_is_loading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [code, reload_token]);

  if (is_loading) {
    return (
      <div className={page_wrap}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (load_failed) {
    return (
      <div className={page_wrap}>
        <div
          className={`${content_wrap} flex flex-col items-center space-y-6 text-center`}
        >
          <Logo />
          <LoadFailedNotice
            on_retry={() => set_reload_token((value) => value + 1)}
          />
        </div>
      </div>
    );
  }

  if (!code || !invite || !invite.valid) {
    return (
      <div className={page_wrap}>
        <div
          className={`${content_wrap} flex flex-col items-center space-y-6 text-center`}
        >
          <Logo />
          <ExclamationTriangleIcon className="w-12 h-12 text-txt-muted" />
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-txt-primary">
              {t("settings.invite_not_found_title")}
            </h1>
            <p className="text-txt-muted text-sm">
              {t("settings.invite_cal_not_found_body")}
            </p>
          </div>
          <div className="w-full space-y-3">
            <Link
              className="aster_btn aster_btn_primary aster_btn_lg w-full text-center block"
              to="/register"
            >
              {t("settings.invite_not_found_cta_register")}
            </Link>
            <Link
              className="aster_btn aster_btn_secondary aster_btn_lg w-full text-center block"
              to="/sign-in"
            >
              {t("settings.invite_not_found_cta_sign_in")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const storage_bonus = has_storage_bonus(invite.bonus_bytes_per_referral);
  const bonus_amount = format_bytes(invite.bonus_bytes_per_referral);

  const title = invite.referrer_display_name
    ? t("settings.invite_cal_title_named", {
        name: invite.referrer_display_name,
      })
    : t("settings.invite_cal_title_generic");

  return (
    <div className={page_wrap}>
      <div className={`${content_wrap} space-y-6`}>
        <div className="flex flex-col items-center space-y-3 text-center">
          <Logo />
          <div>
            <h1 className="text-2xl font-bold text-txt-primary">{title}</h1>
            <p className="text-txt-muted text-sm mt-3 max-w-xs mx-auto leading-relaxed">
              {t("settings.invite_cal_subtitle")}
            </p>
          </div>
        </div>

        <div
          className="rounded-2xl p-5 space-y-1 text-center"
          style={{ background: "var(--accent-mix-b85, #326fd1)" }}
        >
          {storage_bonus ? (
            <>
              <p className="text-lg font-bold text-white">
                {t("settings.invite_storage_line", { amount: bonus_amount })}
              </p>
              <p className="text-sm text-white/75">
                {t("settings.invite_storage_note")}
              </p>
              <p className="text-xs text-white/60 pt-1">
                {t("settings.invite_discount_note", {
                  percent: INVITE_DISCOUNT_PERCENT,
                })}
              </p>
            </>
          ) : (
            <p className="text-lg font-bold text-white">
              {t("settings.invite_discount_line", {
                percent: INVITE_DISCOUNT_PERCENT,
              })}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-edge-secondary p-5 space-y-3 bg-surf-primary">
          <p className="text-xs font-semibold text-txt-muted uppercase tracking-wide">
            {t("settings.invite_benefits_heading")}
          </p>
          {[
            t("settings.invite_cal_benefit_email"),
            t("settings.invite_cal_benefit_calendar"),
            t("settings.invite_cal_benefit_no_ads"),
            t("settings.invite_cal_benefit_open_source"),
          ].map((item) => (
            <div key={item} className="flex items-start gap-2">
              <CheckCircleIcon className="mt-0.5 w-4 h-4 text-green-500 flex-shrink-0" />
              <span className="text-sm text-txt-primary">{item}</span>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <Link
            className="aster_btn aster_btn_primary aster_btn_lg w-full text-center flex items-center justify-center gap-2 font-bold text-base"
            to={`/register?ref=${encodeURIComponent(code)}`}
          >
            {t("settings.invite_cta_create_account_storage")}
            <ArrowRightIcon className="w-4 h-4 flex-shrink-0 rtl:-scale-x-100" />
          </Link>
          <Link
            className="text-center text-sm text-txt-muted hover:text-txt-secondary transition-colors block"
            to="/sign-in"
          >
            {t("settings.invite_cta_sign_in")}
          </Link>
        </div>
      </div>
    </div>
  );
}
