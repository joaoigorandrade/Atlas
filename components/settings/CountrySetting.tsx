"use client";

// Whose rules a jurisdictional topic teaches (W2.5): finance in Brazil names
// Tesouro, the CDI and the FGC; the same map in Portugal names its own. It is
// the learner's country, defaulted from the device and changed here, and only
// a jurisdictional topic ever reads it — linear algebra keys the same for all.

import { patchProfile } from "@/lib/persistence";
import { setCountry, useCountry } from "@/lib/topicAxesStore";
import { useLanguage, useT } from "@/lib/i18n";
import { color, font } from "@/lib/theme";
import { logWarning } from "@/lib/log";

/** The countries offered — where the app's learners are; the device's own
 *  region is added when it is not among them. */
const COUNTRIES = [
  "BR",
  "PT",
  "US",
  "GB",
  "CA",
  "AU",
  "IE",
  "ES",
  "MX",
  "AR",
  "CO",
  "CL",
  "FR",
  "DE",
  "IT",
  "NL",
  "AO",
  "MZ",
  "IN",
  "JP",
];

const STRINGS = {
  en: {
    label: "Country",
    hint: "money, law and tax topics use its rules",
  },
  "pt-BR": {
    label: "País",
    hint: "temas de finanças, direito e impostos usam as regras dele",
  },
} as const;

export default function CountrySetting() {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const country = useCountry();
  const name = (code: string) => {
    try {
      return new Intl.DisplayNames([language], { type: "region" }).of(code) ?? code;
    } catch {
      return code;
    }
  };
  const options = [...new Set([...(country ? [country] : []), ...COUNTRIES])];
  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ fontSize: 14, color: color.inkSoft, marginBottom: 12 }}>
        {t.label} <span style={{ color: color.inkGhost }}>— {t.hint}</span>
      </div>
      <select
        data-testid="field-country"
        value={country ?? ""}
        onChange={(e) => {
          setCountry(e.target.value);
          patchProfile({ country: e.target.value }).catch((err: unknown) =>
            logWarning("country_save_failed", err),
          );
        }}
        style={{
          padding: "9px 12px",
          fontSize: 14,
          fontFamily: font.sans,
          color: color.ink,
          background: color.card,
          border: `1px solid ${color.hairlineStrong}`,
          borderRadius: 3,
        }}
      >
        {!country && <option value="" />}
        {options.map((code) => (
          <option key={code} value={code}>
            {name(code)}
          </option>
        ))}
      </select>
    </div>
  );
}
