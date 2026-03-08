import { signIn, signUp, signOut, getSession, getUser, supabase } from "./lib/supabase.js";
import { useState, useRef, useEffect, useCallback } from "react";

// ─── EU VAT Rates & Countries ─────────────────────────────────────────────────
const EU_COUNTRIES = [
  { code: "AT", name: "Oostenrijk", vat: 20 }, { code: "BE", name: "België", vat: 21 },
  { code: "BG", name: "Bulgarije", vat: 20 }, { code: "CY", name: "Cyprus", vat: 19 },
  { code: "CZ", name: "Tsjechië", vat: 21 }, { code: "DE", name: "Duitsland", vat: 19 },
  { code: "DK", name: "Denemarken", vat: 25 }, { code: "EE", name: "Estland", vat: 22 },
  { code: "ES", name: "Spanje", vat: 21 }, { code: "FI", name: "Finland", vat: 25.5 },
  { code: "FR", name: "Frankrijk", vat: 20 }, { code: "GR", name: "Griekenland", vat: 24 },
  { code: "HR", name: "Kroatië", vat: 25 }, { code: "HU", name: "Hongarije", vat: 27 },
  { code: "IE", name: "Ierland", vat: 23 }, { code: "IT", name: "Italië", vat: 22 },
  { code: "LT", name: "Litouwen", vat: 21 }, { code: "LU", name: "Luxemburg", vat: 17 },
  { code: "LV", name: "Letland", vat: 21 }, { code: "MT", name: "Malta", vat: 18 },
  { code: "NL", name: "Nederland", vat: 21 }, { code: "PL", name: "Polen", vat: 23 },
  { code: "PT", name: "Portugal", vat: 23 }, { code: "RO", name: "Roemenië", vat: 19 },
  { code: "SE", name: "Zweden", vat: 25 }, { code: "SI", name: "Slovenië", vat: 22 },
  { code: "SK", name: "Slowakije", vat: 20 },
];
const NON_EU_COUNTRIES = [
  { code: "GB", name: "Verenigd Koninkrijk", vat: 0 }, { code: "US", name: "Verenigde Staten", vat: 0 },
  { code: "CA", name: "Canada", vat: 0 }, { code: "AU", name: "Australië", vat: 0 },
  { code: "NO", name: "Noorwegen", vat: 0 }, { code: "CH", name: "Zwitserland", vat: 0 },
  { code: "OTHER", name: "Overig", vat: 0 },
];
const ALL_COUNTRIES = [...EU_COUNTRIES, ...NON_EU_COUNTRIES];
// ─── Pricing Plans ────────────────────────────────────────────────────────────
const PLANS = {
  starter: { id: "starter", name: "Starter", sites: 2,  connected_products: 500,   monthly: 7.99,  annual_mo: 7.19  },
  growth:  { id: "growth",  name: "Growth",  sites: 5,  connected_products: 2000,  monthly: 11.99, annual_mo: 10.79 },
  pro:     { id: "pro",     name: "Pro",     sites: 10, connected_products: 10000, monthly: 19.99, annual_mo: 17.99 },
};
const PLAN_LIST = [PLANS.starter, PLANS.growth, PLANS.pro];
const ANNUAL_DISCOUNT = 10; // % off monthly

const getPlanPrice = (planId, billingPeriod = "monthly") => {
  const plan = PLANS[planId];
  if (!plan) return 0;
  return billingPeriod === "annual" ? plan.annual_mo : plan.monthly;
};

// priceInclNL = the plan price incl. 21% Dutch VAT (our listed price)
const getVatInfo = (countryCode, vatValidated, priceInclNL = 19.99) => {
  const p = parseFloat(priceInclNL) || 19.99;
  const excl = parseFloat((p / 1.21).toFixed(4));
  const euC = EU_COUNTRIES.find(c => c.code === countryCode);
  if (!countryCode || countryCode === "NL") {
    return { rate: 21, excl: excl.toFixed(2), total: p.toFixed(2) };
  }
  if (euC && vatValidated) {
    return { rate: 0, excl: excl.toFixed(2), total: excl.toFixed(2), reverseCharge: true };
  }
  if (euC) {
    const total = parseFloat((excl * (1 + euC.vat / 100)).toFixed(2));
    return { rate: euC.vat, excl: excl.toFixed(2), total: total.toFixed(2) };
  }
  return { rate: 0, excl: excl.toFixed(2), total: excl.toFixed(2) };
};



// ─── Google Fonts ─────────────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap";
fontLink.rel = "stylesheet";
document.head.appendChild(fontLink);

// ─── Global Styles ────────────────────────────────────────────────────────────
const G = () => {
  useEffect(() => {
    const s = document.createElement("style");
    s.textContent = `
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      :root {
        --bg: #080B12; --s1: #0F1320; --s2: #161B2C; --s3: #1E2438;
        --b1: #252B3E; --b2: #2E3550; --b3: #3A4260;
        --pr: #5B5BD6; --pr-h: #6E6EF7; --pr-l: rgba(91,91,214,0.15);
        --ac: #F59E0B; --ac-h: #FBB928; --ac-l: rgba(245,158,11,0.15);
        --gr: #22C55E; --gr-l: rgba(34,197,94,0.15);
        --re: #EF4444; --re-l: rgba(239,68,68,0.15);
        --or: #F97316; --or-l: rgba(249,115,22,0.12);
        --tx: #E8EBF4; --mx: #9BA3BC; --dm: #4E5672;
        --rd: 8px; --rd-lg: 12px; --rd-xl: 16px;
        --sh: 0 4px 24px rgba(0,0,0,0.4);
        --font-h: 'Manrope', sans-serif; --font-b: 'DM Sans', sans-serif;
      }
      body { background: var(--bg); color: var(--tx); font-family: var(--font-b); font-size: 14px; line-height: 1.5; overflow-x: hidden; }
      * { font-family: var(--font-b); }
      h1,h2,h3,h4,h5 { font-family: var(--font-h); }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: var(--s1); }
      ::-webkit-scrollbar-thumb { background: var(--b2); border-radius: 3px; }
      ::-webkit-scrollbar-thumb:hover { background: var(--b3); }
      input, textarea, select { outline: none; font-family: var(--font-b); }
      input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
      .fade-in { animation: fadeIn 0.3s ease; }
      .slide-up { animation: slideUp 0.25s ease; }
      @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
      @keyframes slideUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:none } }
      @keyframes spin { to { transform: rotate(360deg) } }
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
      .spin { animation: spin 1s linear infinite; }
      .pulse { animation: pulse 2s ease infinite; }
      @keyframes gradMove { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }

      /* ── Landing footer ───────────────────────────────────────── */
      .landing-footer {
        border-top: 1px solid var(--b1);
        padding: 24px 32px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: var(--dm);
        font-size: 12px;
        gap: 12px;
      }
      @media (max-width: 550px) {
        .landing-footer {
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 14px;
          padding: 24px 20px;
        }
      }

      /* ── Contact page grid ────────────────────────────────────── */
      .contact-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 40px;
      }
      .contact-info { display: flex; flex-direction: column; gap: 24px; order: 2; }
      .contact-form { order: 1; }
      @media (max-width: 550px) {
        .contact-grid {
          grid-template-columns: 1fr;
          gap: 32px;
        }
        .contact-info { order: 1; }
        .contact-form { order: 2; }
      }

      /* ── Dashboard TopNav ─────────────────────────────────────── */
      .topnav-root {
        background: var(--s1);
        border-bottom: 1px solid var(--b1);
        position: sticky;
        top: 0;
        z-index: 100;
        flex-shrink: 0;
      }
      .topnav-row1 {
        height: 52px;
        display: flex;
        align-items: center;
        padding: 0 14px;
        gap: 10px;
      }
      .topnav-tabs {
        height: 38px;
        display: none;
        align-items: center;
        padding: 0 14px 0;
        gap: 2px;
        border-top: 1px solid var(--b1);
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .topnav-tabs::-webkit-scrollbar { display: none; }
      .topnav-site-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: var(--s2);
        border: 1px solid var(--b2);
        border-radius: var(--rd);
        cursor: pointer;
        color: var(--tx);
        font-size: 13px;
        font-weight: 500;
        min-width: 0;
        flex-shrink: 1;
        overflow: hidden;
      }
      .topnav-site-name {
        flex: 1;
        text-align: left;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
      }
      .topnav-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
      .topnav-sync-label { display: inline; }
      .topnav-push-label { display: inline; }

      /* Desktop: tabs inline in row1 */
      @media (min-width: 769px) {
        .topnav-tabs-inline { display: flex; gap: 2px; margin-left: 4px; flex-shrink: 0; }
        .topnav-tabs-row { display: none; }
        .topnav-site-btn { min-width: 180px; max-width: 220px; }
      }

      /* Mobile: tabs move to second row */
      @media (max-width: 768px) {
        .topnav-tabs-inline { display: none; }
        .topnav-tabs-row { display: flex; }
        .topnav-site-btn { max-width: 160px; }
        .topnav-sync-label { display: none; }
        .topnav-push-label { display: none; }
      }

      /* ── Dashboard main content ───────────────────────────────── */
      .dashboard-content {
        flex: 1;
        overflow: auto;
        padding: 24px 28px;
      }
      @media (max-width: 768px) {
        .dashboard-content { padding: 16px 14px; }
      }

      /* ── Product table ────────────────────────────────────────── */
      .product-table-header {
        display: grid;
        grid-template-columns: 2fr 90px 90px 100px 80px;
        gap: 0;
        padding: 8px 14px;
      }
      @media (max-width: 640px) {
        .product-table-header { display: none; }
        .product-table-header-row { display: none !important; }
      }
      /* Product table scroll on small screens */
      .products-table-scroll {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }

      /* ── Settings grid ────────────────────────────────────────── */
      .settings-2col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      @media (max-width: 640px) {
        .settings-2col { grid-template-columns: 1fr; }
      }

      /* ── Overlay / modal ─────────────────────────────────────── */
      @media (max-width: 600px) {
        .overlay-panel {
          width: calc(100vw - 24px) !important;
          max-width: calc(100vw - 24px) !important;
          max-height: 92vh !important;
          border-radius: 16px 16px 0 0 !important;
          margin-bottom: 0 !important;
          align-self: flex-end !important;
        }
        .overlay-backdrop {
          align-items: flex-end !important;
        }
      }

      /* ── Connected sites view ─────────────────────────────────── */
      @media (max-width: 640px) {
        .conn-row-actions { flex-wrap: wrap; gap: 4px; }
      }

      /* ── Tab label hide on very small ─────────────────────────── */
      @media (max-width: 360px) {
        .topnav-tab-label { display: none; }
      }

      /* ── Admin user table ─────────────────────────────────────── */
      @media (max-width: 900px) {
        .admin-user-table-header { display: none !important; }
        .admin-user-row { flex-direction: column !important; align-items: flex-start !important; }
      }

      /* ── SuperAdmin header ────────────────────────────────────── */
      /* Desktop: show inline nav, email, logout; hide hamburger + current-tab label */
      @media (min-width: 769px) {
        .sa-desktop-nav  { display: flex !important; }
        .sa-hamburger    { display: none !important; }
        .sa-current-tab  { display: none !important; }
        .sa-email-label  { display: block !important; }
        .sa-logout-desktop { display: inline-flex !important; }
      }

      /* Mobile: hide inline nav + email + logout; show hamburger + current-tab */
      @media (max-width: 768px) {
        .sa-desktop-nav     { display: none !important; }
        .sa-hamburger       { display: flex !important; }
        .sa-current-tab     { display: block !important; }
        .sa-email-label     { display: none !important; }
        .sa-logout-desktop  { display: none !important; }
      }

      /* Drawer slide-in animation */
      @keyframes slideRight {
        from { transform: translateX(-100%); opacity: 0; }
        to   { transform: translateX(0);    opacity: 1; }
      }
      .slide-right { animation: slideRight 0.22s cubic-bezier(0.32,0.72,0,1); }
    `;
    document.head.appendChild(s);
    return () => document.head.removeChild(s);
  }, []);
  return null;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const SUPERADMIN_EMAIL = "leadingvation@gmail.com";

const LOCALE_OPTIONS = [
  { value: "nl_NL", label: "nl_NL – Nederlands (NL)" },
  { value: "nl_BE", label: "nl_BE – Nederlands (BE)" },
  { value: "fr_BE", label: "fr_BE – Français (BE)" },
  { value: "fr_FR", label: "fr_FR – Français (FR)" },
  { value: "fr_LU", label: "fr_LU – Français (LU)" },
  { value: "de_DE", label: "de_DE – Deutsch (DE)" },
  { value: "de_AT", label: "de_AT – Deutsch (AT)" },
  { value: "de_CH", label: "de_CH – Deutsch (CH)" },
  { value: "de_LU", label: "de_LU – Deutsch (LU)" },
  { value: "en_US", label: "en_US – English (US)" },
  { value: "en_GB", label: "en_GB – English (GB)" },
  { value: "en_IE", label: "en_IE – English (IE)" },
  { value: "en_MT", label: "en_MT – English (MT)" },
  { value: "es_ES", label: "es_ES – Español (ES)" },
  { value: "ca_ES", label: "ca_ES – Català (ES)" },
  { value: "it_IT", label: "it_IT – Italiano (IT)" },
  { value: "pt_PT", label: "pt_PT – Português (PT)" },
  { value: "pt_BR", label: "pt_BR – Português (BR)" },
  { value: "pl_PL", label: "pl_PL – Polski (PL)" },
  { value: "cs_CZ", label: "cs_CZ – Čeština (CZ)" },
  { value: "sk_SK", label: "sk_SK – Slovenčina (SK)" },
  { value: "hu_HU", label: "hu_HU – Magyar (HU)" },
  { value: "ro_RO", label: "ro_RO – Română (RO)" },
  { value: "bg_BG", label: "bg_BG – Български (BG)" },
  { value: "hr_HR", label: "hr_HR – Hrvatski (HR)" },
  { value: "sl_SI", label: "sl_SI – Slovenščina (SI)" },
  { value: "lt_LT", label: "lt_LT – Lietuvių (LT)" },
  { value: "lv_LV", label: "lv_LV – Latviešu (LV)" },
  { value: "et_EE", label: "et_EE – Eesti (EE)" },
  { value: "fi_FI", label: "fi_FI – Suomi (FI)" },
  { value: "sv_SE", label: "sv_SE – Svenska (SE)" },
  { value: "da_DK", label: "da_DK – Dansk (DK)" },
  { value: "nb_NO", label: "nb_NO – Norsk (NO)" },
  { value: "el_GR", label: "el_GR – Ελληνικά (GR)" },
  { value: "tr_TR", label: "tr_TR – Türkçe (TR)" },
  { value: "ar", label: "ar – العربية" },
  { value: "he_IL", label: "he_IL – עברית (IL)" },
  { value: "zh_CN", label: "zh_CN – 中文 (简体)" },
  { value: "zh_TW", label: "zh_TW – 中文 (繁體)" },
  { value: "ja", label: "ja – 日本語" },
  { value: "ko_KR", label: "ko_KR – 한국어" },
  { value: "ru_RU", label: "ru_RU – Русский (RU)" },
  { value: "uk", label: "uk – Українська" },
];

// Common flag emojis by locale prefix
const LOCALE_FLAG_MAP = {
  nl_NL:"🇳🇱", nl_BE:"🇧🇪", fr_BE:"🇧🇪", fr_FR:"🇫🇷", fr_LU:"🇱🇺",
  de_DE:"🇩🇪", de_AT:"🇦🇹", de_CH:"🇨🇭", de_LU:"🇱🇺",
  en_US:"🇺🇸", en_GB:"🇬🇧", en_IE:"🇮🇪", en_MT:"🇲🇹",
  es_ES:"🇪🇸", ca_ES:"🇪🇸", it_IT:"🇮🇹",
  pt_PT:"🇵🇹", pt_BR:"🇧🇷", pl_PL:"🇵🇱",
  cs_CZ:"🇨🇿", sk_SK:"🇸🇰", hu_HU:"🇭🇺", ro_RO:"🇷🇴",
  bg_BG:"🇧🇬", hr_HR:"🇭🇷", sl_SI:"🇸🇮", lt_LT:"🇱🇹",
  lv_LV:"🇱🇻", et_EE:"🇪🇪", fi_FI:"🇫🇮", sv_SE:"🇸🇪",
  da_DK:"🇩🇰", nb_NO:"🇳🇴", el_GR:"🇬🇷", tr_TR:"🇹🇷",
  ar:"🇸🇦", he_IL:"🇮🇱", zh_CN:"🇨🇳", zh_TW:"🇹🇼",
  ja:"🇯🇵", ko_KR:"🇰🇷", ru_RU:"🇷🇺", uk:"🇺🇦",
};

const FLAG_SHAPES = ["emoji", "rect", "circle"];

// ─── Utility ──────────────────────────────────────────────────────────────────
const css = (...a) => a.filter(Boolean).join(" ");
const fmtPrice = (p) => p ? `€${parseFloat(p).toFixed(2).replace(".", ",")}` : "—";

// ─── Base UI Components ───────────────────────────────────────────────────────
const Btn = ({ children, variant = "primary", size = "md", onClick, disabled, icon, style: extStyle, ...p }) => {
  const sz = { sm: { padding: "5px 12px", fontSize: 12, gap: 5 }, md: { padding: "8px 16px", fontSize: 13, gap: 6 }, lg: { padding: "11px 22px", fontSize: 14, gap: 8 } }[size];
  const vs = {
    primary: { background: "var(--pr)", color: "#fff", border: "none", hover: "var(--pr-h)" },
    secondary: { background: "var(--s3)", color: "var(--tx)", border: "1px solid var(--b1)", hover: "var(--b1)" },
    ghost: { background: "transparent", color: "var(--mx)", border: "none", hover: "var(--s2)" },
    danger: { background: "transparent", color: "var(--re)", border: "1px solid var(--re)", hover: "var(--re-l)" },
    accent: { background: "var(--ac)", color: "#000", border: "none", hover: "var(--ac-h)" },
    success: { background: "var(--gr-l)", color: "var(--gr)", border: "1px solid rgba(34,197,94,0.3)", hover: "rgba(34,197,94,0.2)" },
  }[variant];
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: "var(--rd)", fontFamily: "var(--font-b)", fontWeight: 500, transition: "all 0.15s", opacity: disabled ? 0.5 : 1,
        background: hov && !disabled ? vs.hover : vs.background, color: vs.color, border: vs.border || "none",
        ...sz, ...extStyle }} {...p}>
      {icon && <span style={{ fontSize: size === "sm" ? 13 : 15 }}>{icon}</span>}
      {children}
    </button>
  );
};

const Field = ({ label, hint, required, children, style }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
    {label && <label style={{ fontSize: 12, fontWeight: 500, color: "var(--mx)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {label}{required && <span style={{ color: "var(--re)", marginLeft: 3 }}>*</span>}
    </label>}
    {children}
    {hint && <span style={{ fontSize: 11, color: "var(--dm)" }}>{hint}</span>}
  </div>
);

const Inp = ({ value, onChange, placeholder, type = "text", multiline, rows = 3, style: extStyle, prefix, suffix, ...p }) => {
  const base = { background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd)", color: "var(--tx)", fontSize: 13, padding: "7px 10px", width: "100%", transition: "border 0.15s", ...extStyle };
  if (multiline) return <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} style={{ ...base, resize: "vertical", lineHeight: 1.6 }} {...p} />;
  if (prefix || suffix) return (
    <div style={{ display: "flex", alignItems: "center", background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd)", overflow: "hidden" }}>
      {prefix && <span style={{ padding: "7px 8px 7px 10px", color: "var(--dm)", fontSize: 13, background: "var(--s3)", borderRight: "1px solid var(--b1)" }}>{prefix}</span>}
      <input value={value} onChange={onChange} placeholder={placeholder} type={type} style={{ ...base, border: "none", borderRadius: 0, flex: 1 }} {...p} />
      {suffix && <span style={{ padding: "7px 10px 7px 8px", color: "var(--dm)", fontSize: 13, background: "var(--s3)", borderLeft: "1px solid var(--b1)" }}>{suffix}</span>}
    </div>
  );
  return <input value={value ?? ""} onChange={onChange} placeholder={placeholder} type={type} style={base} {...p} />;
};

const Sel = ({ value, onChange, options, style }) => (
  <select value={value} onChange={onChange} style={{ background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd)", color: "var(--tx)", fontSize: 13, padding: "7px 10px", width: "100%", cursor: "pointer", ...style }}>
    {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
  </select>
);

const Tog = ({ checked, onChange, label }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
    <div onClick={() => onChange(!checked)} style={{ width: 34, height: 19, borderRadius: 10, background: checked ? "var(--pr)" : "var(--b2)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 2, left: checked ? 17 : 2, width: 15, height: 15, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
    </div>
    {label && <span style={{ fontSize: 13, color: "var(--mx)" }}>{label}</span>}
  </label>
);

const Chk = ({ checked, onChange, label, indeterminate }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", userSelect: "none" }}>
    <div onClick={() => onChange(!checked)} style={{ width: 16, height: 16, borderRadius: 4, border: checked || indeterminate ? "none" : "1.5px solid var(--b3)", background: checked || indeterminate ? "var(--pr)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", flexShrink: 0 }}>
      {checked && <span style={{ color: "#fff", fontSize: 11 }}>✓</span>}
      {indeterminate && !checked && <span style={{ color: "#fff", fontSize: 13, lineHeight: 1 }}>−</span>}
    </div>
    {label && <span style={{ fontSize: 13, color: "var(--mx)" }}>{label}</span>}
  </label>
);

const Badge = ({ children, color = "default", size = "sm" }) => {
  const colors = { default: { bg: "var(--s3)", c: "var(--mx)" }, green: { bg: "var(--gr-l)", c: "var(--gr)" }, red: { bg: "var(--re-l)", c: "var(--re)" }, amber: { bg: "var(--ac-l)", c: "var(--ac)" }, blue: { bg: "var(--pr-l)", c: "var(--pr-h)" }, orange: { bg: "var(--or-l)", c: "var(--or)" } }[color];
  return <span style={{ display: "inline-flex", alignItems: "center", padding: size === "sm" ? "2px 8px" : "3px 10px", borderRadius: 100, fontSize: size === "sm" ? 11 : 12, fontWeight: 500, background: colors.bg, color: colors.c, whiteSpace: "nowrap" }}>{children}</span>;
};

const Divider = ({ my = 12 }) => <div style={{ height: 1, background: "var(--b1)", margin: `${my}px 0` }} />;

const Overlay = ({ open, onClose, children, width = 860, title }) => {
  useEffect(() => { if (open) document.body.style.overflow = "hidden"; else document.body.style.overflow = ""; return () => { document.body.style.overflow = ""; }; }, [open]);
  if (!open) return null;
  const backdropRef = useRef(null);
  const downTargetRef = useRef(null);
  return (
    <div
      ref={backdropRef}
      onMouseDown={e => { downTargetRef.current = e.target; }}
      onMouseUp={e => { if (e.target === backdropRef.current && downTargetRef.current === backdropRef.current) onClose?.(); }}
      className="overlay-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onMouseDown={e => e.stopPropagation()} className="slide-up overlay-panel" style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: "var(--rd-xl)", width: "100%", maxWidth: width, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
        {title && <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--mx)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 6px", borderRadius: 4 }}>×</button>
        </div>}
        <div style={{ overflow: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
};

const Tabs = ({ tabs, active, onChange, size = "md" }) => (
  <div style={{ display: "flex", gap: 2, background: "var(--s2)", padding: 3, borderRadius: "var(--rd)", flexWrap: "wrap", overflowX: "auto" }}>
    {tabs.map(t => (
      <button key={t.id} onClick={() => onChange(t.id)} style={{ padding: size === "sm" ? "4px 10px" : "6px 14px", fontSize: size === "sm" ? 12 : 13, fontWeight: active === t.id ? 600 : 400, background: active === t.id ? "var(--s3)" : "transparent", color: active === t.id ? "var(--tx)" : "var(--mx)", border: active === t.id ? "1px solid var(--b1)" : "1px solid transparent", borderRadius: 6, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
        {t.icon && <span>{t.icon}</span>}{t.label}
      </button>
    ))}
  </div>
);

// ─── Tiered Pricing Component ─────────────────────────────────────────────────
const TieredPricing = ({ tiers, onChange, type, onTypeChange }) => {
  const add = () => onChange([...tiers, { qty: "", price: "" }]);
  const rm = i => onChange(tiers.filter((_, j) => j !== i));
  const upd = (i, f, v) => onChange(tiers.map((t, j) => j === i ? { ...t, [f]: v } : t));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Field label="Tiered pricing type">
        <Sel value={type} onChange={e => onTypeChange(e.target.value)} options={[{ value: "fixed", label: "Fixed price" }, { value: "percentage", label: "Percentage discount" }]} />
      </Field>
      <Field label="Tiers">
        {tiers.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <Inp value={t.qty} onChange={e => upd(i, "qty", e.target.value)} placeholder="Starting quantity" type="number" style={{ flex: 1 }} />
            <Inp value={t.price} onChange={e => upd(i, "price", e.target.value)} placeholder={type === "percentage" ? "Discount %" : "Product price"} type="number" style={{ flex: 1 }} />
            <button onClick={() => rm(i)} style={{ background: "none", border: "none", color: "var(--re)", cursor: "pointer", fontSize: 16, padding: "4px 6px" }}>⊗</button>
          </div>
        ))}
        <Btn variant="secondary" size="sm" onClick={add}>+ Add tier</Btn>
      </Field>
    </div>
  );
};

// ─── WQM Quantity Design Builder ──────────────────────────────────────────────
const QtyDesignBuilder = ({ rows, onChange }) => {
  const add = () => onChange([...rows, { qty: "", label: "", byline: "", label_right: "", highlight: "" }]);
  const rm = i => onChange(rows.filter((_, j) => j !== i));
  const upd = (i, f, v) => onChange(rows.map((r, j) => j === i ? { ...r, [f]: v } : r));
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr 1fr 28px", gap: 4, marginBottom: 6 }}>
        {["Qty", "Label", "Byline", "Label right", "Highlight", ""].map((h, i) => (
          <span key={i} style={{ fontSize: 10, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 0" }}>{h}</span>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr 1fr 28px", gap: 4, marginBottom: 4 }}>
          {["qty", "label", "byline", "label_right", "highlight"].map(f => (
            <Inp key={f} value={r[f]} onChange={e => upd(i, f, e.target.value)} placeholder={f === "qty" ? "#" : "..."} style={{ padding: "5px 8px", fontSize: 12 }} />
          ))}
          <button onClick={() => rm(i)} style={{ background: "none", border: "none", color: "var(--re)", cursor: "pointer", fontSize: 14 }}>⊗</button>
        </div>
      ))}
      <Btn variant="secondary" size="sm" onClick={add} style={{ marginTop: 4 }}>+ Add row</Btn>
    </div>
  );
};

// ─── Product Edit Modal ───────────────────────────────────────────────────────
const BASE_EDIT_TABS = [
  { id: "general", label: "Algemeen", icon: "⚙" },
  { id: "stock", label: "Voorraad", icon: "📦" },
  { id: "variations", label: "Variaties", icon: "🔀" },
  { id: "attributes", label: "Attributen", icon: "🏷" },
  { id: "description", label: "Beschrijving", icon: "📝" },
  { id: "images", label: "Afbeeldingen", icon: "🖼" },
  { id: "connected", label: "Verbonden", icon: "🔗" },
];
// "Hoeveelheid" tab is only shown when the active shop has WQM installed

const ProductEditModal = ({ product, open, onClose, onSaveDirect, onAttributeTermAdded, shopCache, sites, activeSite }) => {
  const hasWqm = activeSite?.installed_plugins?.includes("woocommerce-quantity-manager") || activeSite?.has_wqm;
  const editTabs = hasWqm
    ? [...BASE_EDIT_TABS.slice(0, 3), { id: "quantity", label: "Hoeveelheid", icon: "🔢" }, ...BASE_EDIT_TABS.slice(3)]
    : BASE_EDIT_TABS;
  const [tab, setTab] = useState("general");
  const [p, setP] = useState(null);
  const [confirmAttr, setConfirmAttr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [variationsLoading, setVariationsLoading] = useState(false);

  // Use live attributes/categories from shopCache, fallback to empty
  const liveAttributes = shopCache?.attributes || [];
  const liveCategories = shopCache?.categories || [];

  useEffect(() => {
    if (!product || !open) return;
    const fresh = JSON.parse(JSON.stringify(product));
    setP(fresh);
    setSaveError(null);
    setTab("general");

    // Fetch full variation details if variable product (products list only has variation IDs)
    if (product.type === "variable" && product.id && activeSite?.id) {
      const hasFullVariations = Array.isArray(product.variations) && product.variations.length > 0 && typeof product.variations[0] === "object" && product.variations[0].regular_price !== undefined;
      if (!hasFullVariations) {
        setVariationsLoading(true);
        supabase.auth.getSession().then(({ data: { session } }) => {
          fetch("/api/woo", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
            body: JSON.stringify({ shop_id: activeSite.id, endpoint: `products/${product.id}/variations?per_page=100`, method: "GET" }),
          })
            .then(r => r.json())
            .then(vars => {
              if (Array.isArray(vars) && vars.length > 0) {
                setP(prev => prev ? { ...prev, variations: vars } : prev);
              }
            })
            .catch(err => console.error("Variations fetch failed:", err))
            .finally(() => setVariationsLoading(false));
        });
      }
    }
  }, [product?.id, open]);

  if (!open || !p) return null;

  const upd = (path, val) => {
    const next = { ...p };
    const keys = path.split(".");
    let obj = next;
    keys.slice(0, -1).forEach(k => { obj[k] = { ...obj[k] }; obj = obj[k]; });
    obj[keys[keys.length - 1]] = val;
    setP(next);
  };

  const isVariable = p.type === "variable";
  const filteredTabs = isVariable ? editTabs : editTabs.filter(t => t.id !== "variations");

  return (
    <Overlay open={open} onClose={onClose} width={940} title={null}>
      {/* Header */}
      <div style={{ padding: "16px 20px 0", borderBottom: "1px solid var(--b1)", flexShrink: 0, background: "var(--s1)", borderRadius: "var(--rd-xl) var(--rd-xl) 0 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, overflow: "hidden", background: "var(--s3)", flexShrink: 0 }}>
              {p.featured_image && <img src={p.featured_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-h)" }}>{p.name}</div>
              <div style={{ fontSize: 12, color: "var(--dm)" }}>SKU: {p.sku} · {isVariable ? "Variabel product" : "Enkelvoudig product"}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge color={p.status === "publish" ? "green" : "amber"}>{p.status === "publish" ? "Gepubliceerd" : "Concept"}</Badge>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--mx)", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: "0 4px" }}>×</button>
          </div>
        </div>
        <Tabs tabs={filteredTabs} active={tab} onChange={setTab} size="sm" />
      </div>

      {/* Body */}
      <div style={{ padding: 20, overflow: "auto", flex: 1 }}>

        {/* ── ALGEMEEN ── */}
        {tab === "general" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="fade-in">
            <Field label="BTW status">
              <Sel value={p.tax_status} onChange={e => upd("tax_status", e.target.value)} options={[{ value: "taxable", label: "Belastbaar" }, { value: "none", label: "Geen" }]} />
            </Field>
            <Field label="Belastingklasse">
              <Sel value={p.tax_class} onChange={e => upd("tax_class", e.target.value)} options={[{ value: "standard", label: "Standaard" }, { value: "reduced-rate", label: "Gereduceerd" }, { value: "zero-rate", label: "Nul tarief" }]} />
            </Field>
            {!isVariable && <>
              <Field label="Reguliere prijs (€)">
                <Inp value={p.regular_price} onChange={e => upd("regular_price", e.target.value)} type="number" prefix="€" />
              </Field>
              <Field label="Actieprijs (€)">
                <Inp value={p.sale_price} onChange={e => upd("sale_price", e.target.value)} type="number" prefix="€" />
              </Field>
            </>}
            <div style={{ gridColumn: "1 / -1" }}>
              <TieredPricing tiers={p.wqm_tiers} onChange={v => upd("wqm_tiers", v)} type={p.wqm_settings?.tiered_pricing_type || "fixed"} onTypeChange={v => upd("wqm_settings.tiered_pricing_type", v)} />
            </div>
            <Divider my={0} />
            <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12, color: "var(--mx)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>Kortingen</div>
              <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", display: "flex", flexDirection: "column", gap: 10 }}>
                <Chk checked={p.afhaalkkorting_active} onChange={v => upd("afhaalkkorting_active", v)} label="Markeer product voor extra afhaalkorting (30%, momenteel 20%)" />
                <Chk checked={p.product_korting_active} onChange={v => upd("product_korting_active", v)} label="Zet aan om een %-korting in te voeren (5–30%)" />
                {p.product_korting_active && (
                  <Field label="Percentage korting">
                    <Inp value={p.product_korting_pct} onChange={e => upd("product_korting_pct", e.target.value)} type="number" suffix="%" style={{ maxWidth: 160 }} />
                  </Field>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── VOORRAAD ── */}
        {tab === "stock" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="fade-in">
            {!isVariable && <>
              <Field label="Voorraad beheren" hint="Schakel per product voorraad beheer in">
                <Tog checked={p.manage_stock} onChange={v => upd("manage_stock", v)} label={p.manage_stock ? "Ingeschakeld" : "Uitgeschakeld"} />
              </Field>
              {p.manage_stock && <>
                <Field label="Voorraad aantal">
                  <Inp value={p.stock_quantity ?? ""} onChange={e => upd("stock_quantity", e.target.value)} type="number" />
                </Field>
                <Field label="Voorraadstatus">
                  <Sel value={p.stock_status} onChange={e => upd("stock_status", e.target.value)} options={[{ value: "instock", label: "Op voorraad" }, { value: "outofstock", label: "Niet op voorraad" }, { value: "onbackorder", label: "Nabestelling" }]} />
                </Field>
              </>}
            </>}
            {isVariable && (
              <div style={{ gridColumn: "1/-1", padding: 14, background: "var(--ac-l)", borderRadius: "var(--rd)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <span style={{ fontSize: 13, color: "var(--ac)" }}>💡 Voor variabele producten wordt voorraad per variatie beheerd. Ga naar het <strong>Variaties</strong> tabblad.</span>
              </div>
            )}
          </div>
        )}

        {/* ── VARIATIES ── */}
        {tab === "variations" && isVariable && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }} className="fade-in">
            {variationsLoading && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, color: "var(--mx)", fontSize: 13 }}>
                <div style={{ width: 14, height: 14, border: "2px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                Variaties laden van WooCommerce...
              </div>
            )}
            {!variationsLoading && (!p.variations || p.variations.length === 0) && (
              <div style={{ padding: 16, color: "var(--dm)", fontSize: 13 }}>Geen variaties gevonden voor dit product.</div>
            )}
            {!variationsLoading && (p.variations || []).filter(v => typeof v === "object" && v.id).map((v, vi) => (
              <div key={v.id} style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: "var(--s2)", display: "flex", alignItems: "center", gap: 10 }}>
                  <Badge color="default">#{v.id}</Badge>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{Object.entries(v.attributes).map(([k, val]) => `${liveAttributes.find(a => a.slug === k)?.name || k}: ${val}`).join(" · ")}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--dm)" }}>SKU: {v.sku}</span>
                </div>
                <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="SKU">
                    <Inp value={v.sku} onChange={e => { const vars = [...p.variations]; vars[vi] = { ...v, sku: e.target.value }; upd("variations", vars); }} />
                  </Field>
                  <Field label="GTIN / EAN">
                    <Inp value={v.gtin} onChange={e => { const vars = [...p.variations]; vars[vi] = { ...v, gtin: e.target.value }; upd("variations", vars); }} />
                  </Field>
                  <div style={{ gridColumn: "1/-1", display: "flex", gap: 16 }}>
                    <Chk checked={v.enabled} onChange={c => { const vars = [...p.variations]; vars[vi] = { ...v, enabled: c }; upd("variations", vars); }} label="Ingeschakeld" />
                    <Chk checked={v.downloadable} onChange={c => { const vars = [...p.variations]; vars[vi] = { ...v, downloadable: c }; upd("variations", vars); }} label="Downloadbaar" />
                    <Chk checked={v.virtual} onChange={c => { const vars = [...p.variations]; vars[vi] = { ...v, virtual: c }; upd("variations", vars); }} label="Virtueel" />
                    <Chk checked={v.manage_stock} onChange={c => { const vars = [...p.variations]; vars[vi] = { ...v, manage_stock: c }; upd("variations", vars); }} label="Voorraad beheren" />
                  </div>
                  <Field label="Reguliere prijs (€)">
                    <Inp value={v.regular_price} onChange={e => { const vars = [...p.variations]; vars[vi] = { ...v, regular_price: e.target.value }; upd("variations", vars); }} type="number" prefix="€" />
                  </Field>
                  <Field label="Actieprijs (€)">
                    <Inp value={v.sale_price} onChange={e => { const vars = [...p.variations]; vars[vi] = { ...v, sale_price: e.target.value }; upd("variations", vars); }} type="number" prefix="€" />
                  </Field>
                  {v.manage_stock && <>
                    <Field label="Voorraad aantal">
                      <Inp value={v.stock_quantity} onChange={e => { const vars = [...p.variations]; vars[vi] = { ...v, stock_quantity: e.target.value }; upd("variations", vars); }} type="number" />
                    </Field>
                    <Field label="Voorraadstatus">
                      <Sel value={v.stock_status} onChange={e => { const vars = [...p.variations]; vars[vi] = { ...v, stock_status: e.target.value }; upd("variations", vars); }} options={[{ value: "instock", label: "Op voorraad" }, { value: "outofstock", label: "Niet op voorraad" }, { value: "onbackorder", label: "Nabestelling" }]} />
                    </Field>
                  </>}
                  <div style={{ gridColumn: "1/-1" }}>
                    <TieredPricing tiers={v.wqm_tiers || []} onChange={val => { const vars = [...p.variations]; vars[vi] = { ...v, wqm_tiers: val }; upd("variations", vars); }} type={v.wqm_settings?.tiered_pricing_type || "fixed"} onTypeChange={val => { const vars = [...p.variations]; vars[vi] = { ...v, wqm_settings: { ...v.wqm_settings, tiered_pricing_type: val } }; upd("variations", vars); }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── HOEVEELHEID (WQM) ── */}
        {tab === "quantity" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="fade-in">
            <Field label="Quantity selector type">
              <Sel value={p.wqm_settings?.qty_design || "full_width_swatches"} onChange={e => upd("wqm_settings.qty_design", e.target.value)} options={[{ value: "full_width_swatches", label: "Full width swatches" }, { value: "dropdown", label: "Dropdown" }, { value: "buttons", label: "Buttons" }, { value: "default", label: "Default (number input)" }]} />
            </Field>
            <Field label="Quantity title">
              <Inp value={p.wqm_settings?.title || ""} onChange={e => upd("wqm_settings.title", e.target.value)} placeholder="Selecteer aantal" />
            </Field>
            <Field label="Minimum quantity">
              <Inp value={p.wqm_settings?.min_qty || ""} onChange={e => upd("wqm_settings.min_qty", e.target.value)} type="number" placeholder="1" />
            </Field>
            <Field label="Maximum quantity">
              <Inp value={p.wqm_settings?.max_qty || ""} onChange={e => upd("wqm_settings.max_qty", e.target.value)} type="number" placeholder="Maximum" />
            </Field>
            <Field label="Default quantity">
              <Inp value={p.wqm_settings?.default_qty || ""} onChange={e => upd("wqm_settings.default_qty", e.target.value)} type="number" placeholder="1" />
            </Field>
            <Field label="Step interval">
              <Inp value={p.wqm_settings?.step || ""} onChange={e => upd("wqm_settings.step", e.target.value)} type="number" placeholder="1" />
            </Field>
            <div style={{ gridColumn: "1/-1" }}>
              <Chk checked={p.wqm_settings?.variant_selector || false} onChange={v => upd("wqm_settings.variant_selector", v)} label="Custom variant selector – voor elke gekozen hoeveelheid kan de klant de variaties apart kiezen (werkt alleen als alle variaties dezelfde prijs hebben)" />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Design your quantity selector" hint="Quantity · Label · Byline · Label (right) · Highlight">
                <QtyDesignBuilder rows={p.wqm_settings?.dyo_rows || []} onChange={v => upd("wqm_settings.dyo_rows", v)} />
              </Field>
            </div>
          </div>
        )}

        {/* ── ATTRIBUTEN ── */}
        {tab === "attributes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }} className="fade-in">
            {(liveAttributes.length === 0 && !shopCache?.loaded) ? (
              <div style={{ color: "var(--dm)", fontSize: 13, padding: 16 }}>Attributen laden...</div>
            ) : liveAttributes.length === 0 ? (
              <div style={{ color: "var(--dm)", fontSize: 13, padding: 16 }}>Geen attributen gevonden voor deze shop.</div>
            ) : liveAttributes.map(attr => {
              const pa = p.attributes?.find(a => a.slug === attr.slug) || { id: attr.id, slug: attr.slug, values: [], visible: false, variation: false };
              const idx = p.attributes?.findIndex(a => a.slug === attr.slug) ?? -1;
              const setAttr = (newPa) => {
                const attrs = [...(p.attributes || [])];
                if (idx >= 0) attrs[idx] = newPa; else attrs.push(newPa);
                upd("attributes", attrs);
              };
              return (
                <div key={attr.slug} style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd)", padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{attr.name} <span style={{ color: "var(--dm)", fontWeight: 400, fontSize: 11 }}>({attr.slug})</span></span>
                    <div style={{ display: "flex", gap: 12 }}>
                      <Chk checked={pa.visible} onChange={v => setAttr({ ...pa, visible: v })} label="Zichtbaar op frontend" />
                      {isVariable && <Chk checked={pa.variation} onChange={v => setAttr({ ...pa, variation: v })} label="Gebruikt voor variaties" />}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {attr.terms.map(term => (
                      <button key={term} onClick={() => {
                        const newVals = pa.values.includes(term) ? pa.values.filter(v => v !== term) : [...pa.values, term];
                        setAttr({ ...pa, values: newVals });
                      }} style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: pa.values.includes(term) ? "1.5px solid var(--pr)" : "1px solid var(--b2)", background: pa.values.includes(term) ? "var(--pr-l)" : "transparent", color: pa.values.includes(term) ? "var(--pr-h)" : "var(--mx)", transition: "all 0.15s" }}>
                        {term}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Inp placeholder={`Nieuwe waarde toevoegen aan ${attr.name}...`} style={{ flex: 1, fontSize: 12, padding: "5px 8px" }}
                      onKeyDown={e => {
                        if (e.key === "Enter" && e.target.value.trim()) {
                          setConfirmAttr({ attr, term: e.target.value.trim(), input: e.target });
                        }
                      }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── BESCHRIJVING ── */}
        {tab === "description" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }} className="fade-in">
            <Field label="Productnaam" required>
              <Inp value={p.name} onChange={e => upd("name", e.target.value)} />
            </Field>
            <Field label="Product slug" hint="URL-vriendelijke naam (automatisch gegenereerd)">
              <Inp value={p.slug} onChange={e => upd("slug", e.target.value)} prefix="/" />
            </Field>
            <Field label="Korte beschrijving" hint="Verschijnt naast de productafbeelding">
              <Inp value={p.short_description} onChange={e => upd("short_description", e.target.value)} multiline rows={3} />
            </Field>
            <Field label="Productbeschrijving">
              <Inp value={p.description} onChange={e => upd("description", e.target.value)} multiline rows={7} />
            </Field>
            <Field label="Categorieën">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 10, background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd)" }}>
                {liveCategories.map(cat => {
                  // p.categories from WooCommerce is [{id, name}], normalize to check by id
                  const catIds = (p.categories || []).map(c => typeof c === "object" ? c.id : c);
                  return (
                    <Chk key={cat.id} checked={catIds.includes(cat.id)} onChange={c => {
                      const current = (p.categories || []).map(x => typeof x === "object" ? x : { id: x });
                      const updated = c ? [...current, { id: cat.id, name: cat.name }] : current.filter(x => x.id !== cat.id);
                      upd("categories", updated);
                    }} label={cat.name} />
                  );
                })}
              </div>
            </Field>
          </div>
        )}

        {/* ── AFBEELDINGEN ── */}
        {tab === "images" && (() => {
          const currentImages = p.images || (p.featured_image ? [{ src: p.featured_image, alt: "" }, ...(p.gallery_images || []).map(s => ({ src: s, alt: "" }))] : []);
          const uploadImage = async (file, replaceIdx = null) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
              const base64 = e.target.result.split(",")[1];
              const { data: { session } } = await supabase.auth.getSession();
              try {
                // Pipeline: base64 → image-pipeline → compressed base64 → WooCommerce media
                const pipeRes = await fetch("/api/image-pipeline", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
                  body: JSON.stringify({ base64, filename: file.name, shop_id: activeSite?.id, media_type: file.type }),
                });
                if (!pipeRes.ok) throw new Error("Pipeline failed");
                const pipeData = await pipeRes.json();
                const newImg = { src: pipeData.url || pipeData.src, alt: "" };
                const imgs = [...currentImages];
                if (replaceIdx !== null) { imgs[replaceIdx] = newImg; } else { imgs.push(newImg); }
                upd("images", imgs);
              } catch (err) {
                alert("Upload mislukt: " + err.message);
              }
            };
            reader.readAsDataURL(file);
          };
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="fade-in">
              <Field label="Uitgelichte afbeelding">
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <label style={{ width: 140, height: 140, border: "2px dashed var(--b2)", borderRadius: "var(--rd-lg)", overflow: "hidden", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--s2)", position: "relative", flexShrink: 0 }}>
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) uploadImage(e.target.files[0], 0); }} />
                    {currentImages[0]?.src
                      ? <img src={currentImages[0].src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ textAlign: "center", color: "var(--dm)", fontSize: 12 }}>📷<br/>Klik om<br/>te uploaden</div>
                    }
                  </label>
                  {currentImages[0]?.src && (
                    <Btn variant="ghost" size="sm" onClick={() => { const imgs = [...currentImages]; imgs.splice(0, 1); upd("images", imgs); }}>🗑 Verwijderen</Btn>
                  )}
                </div>
              </Field>
              <Divider />
              <Field label="Galerij afbeeldingen">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {currentImages.slice(1).map((img, i) => (
                    <div key={i} style={{ width: 90, height: 90, border: "1px solid var(--b1)", borderRadius: "var(--rd)", overflow: "hidden", position: "relative", cursor: "pointer" }}
                      onClick={() => { const imgs = [...currentImages]; imgs.splice(i + 1, 1); upd("images", imgs); }}
                      title="Klik om te verwijderen">
                      <img src={img.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <div style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.6)", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>✕</div>
                    </div>
                  ))}
                  <label style={{ width: 90, height: 90, border: "2px dashed var(--b2)", borderRadius: "var(--rd)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--s2)", color: "var(--dm)", fontSize: 24 }}>
                    <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => { Array.from(e.target.files).forEach(f => uploadImage(f)); }} />
                    +
                  </label>
                </div>
              </Field>
              <div style={{ padding: 12, background: "var(--pr-l)", borderRadius: "var(--rd)", border: "1px solid rgba(91,91,214,0.2)" }}>
                <div style={{ fontSize: 12, color: "var(--pr-h)", fontWeight: 600, marginBottom: 4 }}>🤖 AI Image Pipeline</div>
                <div style={{ fontSize: 12, color: "var(--mx)" }}>Uploads gaan via Gemini (resize/optimize) → TinyPNG (compressie) → max 400KB. Klik op een galerij-afbeelding om die te verwijderen.</div>
              </div>
            </div>
          );
        })()}

        {/* ── VERBONDEN SITES ── */}
        {tab === "connected" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }} className="fade-in">
            <div style={{ padding: 12, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", fontSize: 13, color: "var(--mx)" }}>
              Selecteer welke velden gesynchroniseerd worden naar verbonden shops. Losgekoppelde velden kunnen per shop afzonderlijk worden bewerkt.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sites.filter(s => s.id !== activeSite?.id && p.connected_sites?.includes(s.id)).map(site => (
                <div key={site.id} style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", background: "var(--s2)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{site.flag}</span>
                    <span style={{ fontWeight: 600 }}>{site.name}</span>
                    <Badge color="green" size="sm">Verbonden</Badge>
                  </div>
                  <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {[["name", "Productnaam"], ["description", "Beschrijving"], ["short_description", "Korte beschr."], ["regular_price", "Prijs"], ["stock_quantity", "Voorraad"], ["categories", "Categorieën"], ["featured_image", "Uitgelichte afb."], ["attributes", "Attributen"], ["wqm_tiers", "Tiered pricing"], ["wqm_settings", "Hoeveelh. opties"]].map(([field, label]) => (
                      <Chk key={field} checked={(p.connected_fields || {})[field] !== false} onChange={v => upd(`connected_fields.${field}`, v)} label={label} />
                    ))}
                  </div>
                </div>
              ))}
              {(!p.connected_sites || p.connected_sites.length <= 1) && (
                <div style={{ textAlign: "center", padding: 24, color: "var(--dm)", fontSize: 13 }}>
                  Dit product is nog niet verbonden met andere shops.<br />
                  <span style={{ color: "var(--pr-h)", cursor: "pointer", textDecoration: "underline" }}>Klik hier</span> om verbindingen in te stellen.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "14px 20px", borderTop: "1px solid var(--b1)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ fontSize: 12 }}>
          {saveError
            ? <span style={{ color: "var(--re)" }}>⚠ {saveError}</span>
            : <span style={{ color: "var(--dm)" }}>Wijzigingen worden direct opgeslagen naar WooCommerce</span>
          }
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Annuleren</Btn>
          <Btn variant="primary" disabled={saving} onClick={async () => {
            setSaving(true);
            setSaveError(null);
            try {
              await onSaveDirect(p);
              onClose();
            } catch (err) {
              setSaveError(err.message || "Opslaan mislukt");
            } finally {
              setSaving(false);
            }
          }}>
            {saving
              ? <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.6s linear infinite" }} />Opslaan...</span>
              : "Opslaan naar WooCommerce"
            }
          </Btn>
        </div>
      </div>

      {/* Confirm new attribute term */}
      {confirmAttr && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--rd-xl)" }}>
          <div style={{ background: "var(--s1)", border: "1px solid var(--b2)", borderRadius: "var(--rd-lg)", padding: 24, maxWidth: 380, width: "100%" }} className="slide-up">
            <h4 style={{ marginBottom: 8 }}>Nieuwe attribuutwaarde toevoegen</h4>
            <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 16 }}>
              Weet je zeker dat je <strong style={{ color: "var(--tx)" }}>"{confirmAttr.term}"</strong> wilt toevoegen aan het attribuut <strong style={{ color: "var(--tx)" }}>{confirmAttr.attr.name}</strong>? Dit maakt de waarde ook beschikbaar voor andere producten.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setConfirmAttr(null)}>Annuleren</Btn>
              <Btn variant="primary" onClick={async () => {
                const attr = confirmAttr.attr;
                const pa = p.attributes?.find(a => a.slug === attr.slug) || { id: attr.id, slug: attr.slug, values: [], visible: false, variation: false };
                const idx = p.attributes?.findIndex(a => a.slug === attr.slug) ?? -1;
                const newPa = { ...pa, values: [...pa.values, confirmAttr.term] };
                const attrs = [...(p.attributes || [])];
                if (idx >= 0) attrs[idx] = newPa; else attrs.push(newPa);
                upd("attributes", attrs);
                // POST new term to WooCommerce so it's available for other products
                if (onAttributeTermAdded && attr.id) {
                  onAttributeTermAdded(attr.id, confirmAttr.term).catch(err => console.warn("Term add failed:", err));
                }
                setConfirmAttr(null);
              }}>Bevestigen & Toevoegen</Btn>
            </div>
          </div>
        </div>
      )}
    </Overlay>
  );
};

// ─── Products Table ───────────────────────────────────────────────────────────
const ProductsTable = ({ products, onEdit, onConnect, activeSite }) => {
  const [expanded, setExpanded] = useState([]);
  const [expandedVars, setExpandedVars] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const toggle = id => setExpanded(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleVar = id => setExpandedVars(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const filtered = products.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "instock" && p.stock_status !== "instock") return false;
    if (filter === "variable" && p.type !== "variable") return false;
    return true;
  });

  const hasPending = p => Object.keys(p.pending_changes || {}).length > 0;

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍  Zoek op naam of SKU..." style={{ maxWidth: 280 }} />
        <Sel value={filter} onChange={e => setFilter(e.target.value)} options={[{ value: "all", label: "Alle producten" }, { value: "variable", label: "Variabel" }, { value: "instock", label: "Op voorraad" }]} style={{ maxWidth: 160 }} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Btn variant="secondary" size="sm" icon="↑">Importeer CSV</Btn>
          <Btn variant="primary" size="sm" icon="+">Nieuw product</Btn>
        </div>
      </div>

      {/* Table */}
      <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
        {/* Header */}
        <div className="product-table-header-row" style={{ display: "grid", gridTemplateColumns: "28px 44px 1fr 100px 100px 90px 90px 110px", gap: 0, background: "var(--s2)", borderBottom: "1px solid var(--b1)", padding: "8px 12px", alignItems: "center" }}>
          {["", "", "Product", "SKU", "Prijs", "Voorraad", "Status", "Acties"].map((h, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 600, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
          ))}
        </div>

        {filtered.map((product, pi) => (
          <div key={product.id}>
            {/* Product Row */}
            <div style={{ display: "grid", gridTemplateColumns: "28px 44px 1fr 100px 100px 90px 90px 110px", gap: 0, padding: "10px 12px", alignItems: "center", borderBottom: "1px solid var(--b1)", background: pi % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)", transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--s2)"}
              onMouseLeave={e => e.currentTarget.style.background = pi % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)"}>
              <button onClick={() => product.type === "variable" && toggle(product.id)} style={{ background: "none", border: "none", cursor: product.type === "variable" ? "pointer" : "default", color: "var(--mx)", fontSize: 12, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 3, transition: "transform 0.15s", transform: expanded.includes(product.id) ? "rotate(90deg)" : "none" }}>
                {product.type === "variable" ? "▶" : ""}
              </button>
              <div style={{ width: 36, height: 36, borderRadius: 6, overflow: "hidden", background: "var(--s3)" }}>
                {product.featured_image && <img src={product.featured_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                  {product.name}
                  {hasPending(product) && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ac)", flexShrink: 0, display: "inline-block" }} title="Wijzigingen wachten op sync" />}
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  <Badge color={product.type === "variable" ? "blue" : "default"} size="sm">{product.type === "variable" ? "Variabel" : "Enkelvoudig"}</Badge>
                  {(product.connected_sites || []).length > 1 && <Badge color="green" size="sm">🔗 {product.connected_sites.length} shops</Badge>}
                </div>
              </div>
              <span style={{ fontSize: 12, color: "var(--mx)", fontFamily: "monospace" }}>{product.sku}</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{product.type === "variable" ? <span style={{ color: "var(--dm)" }}>per variatie</span> : fmtPrice(product.regular_price)}</span>
              <div>
                {product.type === "simple" && product.manage_stock ? (
                  <span style={{ fontSize: 13, fontWeight: 600, color: product.stock_quantity > 10 ? "var(--gr)" : product.stock_quantity > 0 ? "var(--ac)" : "var(--re)" }}>{product.stock_quantity}</span>
                ) : <span style={{ fontSize: 12, color: "var(--dm)" }}>—</span>}
              </div>
              <Badge color={product.status === "publish" ? "green" : "amber"}>{product.status === "publish" ? "Actief" : "Concept"}</Badge>
              <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                <Btn variant="secondary" size="sm" onClick={() => onConnect(product)} title="Verbind met andere shops">🔗</Btn>
                <Btn variant="primary" size="sm" onClick={() => onEdit(product)}>Bewerken</Btn>
              </div>
            </div>

            {/* Variations */}
            {expanded.includes(product.id) && product.variations.map((v, vi) => (
              <div key={v.id}>
                <div style={{ display: "grid", gridTemplateColumns: "28px 44px 1fr 100px 100px 90px 90px 110px", gap: 0, padding: "8px 12px 8px 28px", alignItems: "center", borderBottom: "1px solid var(--b1)", background: "var(--s1)" }}>
                  <button onClick={() => toggleVar(v.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dm)", fontSize: 11, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.15s", transform: expandedVars.includes(v.id) ? "rotate(90deg)" : "none" }}>▶</button>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: v.enabled ? "var(--gr)" : "var(--dm)" }} />
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--mx)" }}>
                      {Object.entries(v.attributes).map(([k, val]) => <Badge key={k} color="default" size="sm">{liveAttributes.find(a => a.slug === k)?.name || k}: {val}</Badge>)}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--dm)", fontFamily: "monospace" }}>{v.sku}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--pr-h)" }}>{fmtPrice(v.regular_price)}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: v.stock_quantity > 10 ? "var(--gr)" : v.stock_quantity > 0 ? "var(--ac)" : "var(--re)" }}>
                    {v.manage_stock ? v.stock_quantity : <span style={{ color: "var(--dm)" }}>—</span>}
                  </span>
                  <Badge color={v.stock_status === "instock" ? "green" : "red"} size="sm">{v.stock_status === "instock" ? "Op voorraad" : "Niet op voorraad"}</Badge>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Btn variant="ghost" size="sm" onClick={() => onEdit({ ...product, _editVariation: v.id })}>Bewerken</Btn>
                  </div>
                </div>
                {/* Expanded variation details */}
                {expandedVars.includes(v.id) && (
                  <div style={{ padding: "10px 28px 10px 52px", background: "rgba(91,91,214,0.03)", borderBottom: "1px solid var(--b1)", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                    {[["SKU", v.sku], ["EAN/GTIN", v.gtin || "—"], ["Min. qty", v.wqm_settings?.min_qty || "1"], ["Stap", v.wqm_settings?.step || "1"]].map(([k, val]) => (
                      <div key={k}><span style={{ fontSize: 10, color: "var(--dm)", display: "block", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k}</span><span style={{ fontSize: 12, color: "var(--mx)" }}>{val}</span></div>
                    ))}
                    {v.wqm_tiers?.length > 0 && (
                      <div style={{ gridColumn: "1/-1", display: "flex", gap: 6 }}>
                        <span style={{ fontSize: 10, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 4 }}>Tiers:</span>
                        {v.wqm_tiers.map((t, i) => <Badge key={i} color="blue" size="sm">≥{t.qty}: {fmtPrice(t.price)}</Badge>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--dm)" }}>Geen producten gevonden</div>
        )}
      </div>
    </div>
  );
};

// ─── Connected Sites View ─────────────────────────────────────────────────────
const ALL_SYNC_FIELDS = [
  { id: "regular_price",     label: "Reguliere prijs" },
  { id: "sale_price",        label: "Actieprijs" },
  { id: "stock_quantity",    label: "Voorraad" },
  { id: "name",              label: "Productnaam" },
  { id: "short_description", label: "Korte beschrijving" },
  { id: "description",       label: "Beschrijving" },
  { id: "categories",        label: "Categorieën" },
  { id: "attributes",        label: "Attributen" },
  { id: "status",            label: "Status" },
];
const DEFAULT_SYNC_FIELDS = ["regular_price", "sale_price", "stock_quantity"];

// ── AI Scan Modal ─────────────────────────────────────────────────────────────
const AiScanModal = ({ sourceShop, targetShop, onClose, onConfirmMatches, getToken }) => {
  const [phase, setPhase] = useState("idle"); // idle | scanning | review | done
  const [scanResult, setScanResult] = useState(null);
  const [decisions, setDecisions] = useState({}); // { idx: 'accept'|'reject' }
  const [saving, setSaving] = useState(false);
  const [syncFields, setSyncFields] = useState(DEFAULT_SYNC_FIELDS);
  const [minConfidence, setMinConfidence] = useState(0.75);
  const [error, setError] = useState(null);

  const startScan = async () => {
    setPhase("scanning");
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/ai-match-products", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ source_shop_id: sourceShop.id, target_shop_id: targetShop.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan mislukt");
      setScanResult(data);
      // Pre-accept all matches above threshold
      const initial = {};
      data.matches.forEach((m, i) => { initial[i] = m.confidence >= minConfidence ? "accept" : "review"; });
      setDecisions(initial);
      setPhase("review");
    } catch (e) {
      setError(e.message);
      setPhase("idle");
    }
  };

  const acceptAll = () => {
    const d = {};
    scanResult.matches.forEach((m, i) => { d[i] = m.confidence >= minConfidence ? "accept" : decisions[i] || "review"; });
    setDecisions(d);
  };

  const rejectAll = () => {
    const d = {};
    scanResult.matches.forEach((_, i) => { d[i] = "reject"; });
    setDecisions(d);
  };

  const saveAccepted = async () => {
    const accepted = scanResult.matches.filter((_, i) => decisions[i] === "accept");
    if (!accepted.length) { onClose(); return; }
    setSaving(true);
    try {
      const token = await getToken();
      let saved = 0, failed = 0;
      for (const m of accepted) {
        const res = await fetch("/api/connected-products", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({
            source_shop_id: sourceShop.id,
            source_product_id: m.source_product.id,
            source_sku: m.source_product.sku,
            source_product_name: m.source_product.name,
            target_shop_id: targetShop.id,
            target_product_id: m.target_product.id,
            target_sku: m.target_product.sku,
            match_mode: "ai",
            sync_fields: syncFields,
          }),
        });
        if (res.ok || res.status === 409) saved++; else failed++;
      }
      onConfirmMatches(saved, failed);
      setPhase("done");
    } catch (e) {
      alert("Opslaan mislukt: " + e.message);
    } finally { setSaving(false); }
  };

  const acceptCount = Object.values(decisions).filter(d => d === "accept").length;
  const totalMatches = scanResult?.matches?.length || 0;

  const ConfidenceBar = ({ value }) => {
    const pct = Math.round(value * 100);
    const color = pct >= 90 ? "#22c55e" : pct >= 75 ? "#84cc16" : pct >= 60 ? "#f59e0b" : "#ef4444";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <div style={{ width: 60, height: 6, background: "var(--b2)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 32 }}>{pct}%</span>
      </div>
    );
  };

  return (
    <Overlay open title={`🤖 AI Scan — ${sourceShop.flag} ${sourceShop.name} → ${targetShop.flag} ${targetShop.name}`} onClose={onClose} width={700}>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, overflow: "auto", flex: 1 }}>

        {/* idle */}
        {phase === "idle" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", fontSize: 13 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Hoe werkt de AI scan?</div>
              <div style={{ color: "var(--mx)", fontSize: 12, lineHeight: 1.6 }}>
                De AI vergelijkt alle producten van <strong>{sourceShop.name}</strong> met die van <strong>{targetShop.name}</strong> op basis van naam, SKU, beschrijving en attributen — meertalig en met eenheid-normalisatie (bijv. 125 cm = 1.25 m). Je krijgt een lijst met suggesties inclusief betrouwbaarheidsscore, die je per stuk kunt accepteren of afwijzen.
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Field label="Minimale betrouwbaarheid" hint="Suggesties onder deze drempel tonen als 'ter beoordeling'" style={{ flex: "0 0 auto" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="range" min={50} max={95} step={5} value={Math.round(minConfidence * 100)}
                    onChange={e => setMinConfidence(e.target.value / 100)}
                    style={{ width: 120, accentColor: "var(--pr)" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, minWidth: 36 }}>{Math.round(minConfidence * 100)}%</span>
                </div>
              </Field>
            </div>
            <SyncFieldsPicker syncFields={syncFields} onChange={setSyncFields} />
            {error && <div style={{ padding: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--rd)", fontSize: 12, color: "#ef4444" }}>❌ {error}</div>}
            <Btn variant="primary" onClick={startScan} style={{ alignSelf: "flex-start" }}>🤖 Start AI scan</Btn>
          </div>
        )}

        {/* scanning */}
        {phase === "scanning" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "40px 0", textAlign: "center" }}>
            <div style={{ width: 48, height: 48, border: "4px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>AI scant producten...</div>
              <div style={{ fontSize: 12, color: "var(--dm)", marginTop: 4 }}>
                Alle producten van beide shops worden vergeleken. Dit kan 15–60 seconden duren.
              </div>
            </div>
          </div>
        )}

        {/* review */}
        {phase === "review" && scanResult && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Meta bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--s2)", borderRadius: "var(--rd)", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--mx)" }}>
                <strong>{totalMatches}</strong> suggesties · <strong style={{ color: "#22c55e" }}>{acceptCount}</strong> geselecteerd
              </span>
              <span style={{ fontSize: 11, color: "var(--dm)" }}>
                {scanResult.meta.source_count} bron · {scanResult.meta.target_count} doel · via {scanResult.meta.ai_provider}
              </span>
              <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                <Btn variant="ghost" size="sm" onClick={acceptAll}>Alles boven {Math.round(minConfidence*100)}% ✓</Btn>
                <Btn variant="ghost" size="sm" onClick={rejectAll}>Alles afwijzen</Btn>
              </div>
            </div>

            {/* Pricing plugin warnings */}
            {(scanResult.meta.source_pricing_plugins?.length > 0 || scanResult.meta.target_pricing_plugins?.length > 0) && (
              <div style={{ padding: "10px 12px", background: "rgba(234,179,8,0.07)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: "var(--rd)", fontSize: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠ Aangepaste prijsplugins gedetecteerd</div>
                {[
                  ...(scanResult.meta.source_pricing_plugins || []).map(p => ({ ...p, shop: sourceShop.name })),
                  ...(scanResult.meta.target_pricing_plugins || []).map(p => ({ ...p, shop: targetShop.name })),
                ].map((p, i) => (
                  <div key={i} style={{ color: "var(--mx)", marginBottom: 2 }}>
                    <strong>{p.shop}</strong> – {p.label}: {p.note}
                  </div>
                ))}
              </div>
            )}

            {/* Match list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 460, overflowY: "auto" }}>
              {scanResult.matches.map((m, i) => {
                const dec = decisions[i] || "review";
                const pct = Math.round(m.confidence * 100);
                return (
                  <div key={i} style={{ border: `1px solid ${dec === "accept" ? "rgba(34,197,94,0.4)" : dec === "reject" ? "rgba(239,68,68,0.2)" : "var(--b1)"}`, borderRadius: "var(--rd)", overflow: "hidden", background: dec === "accept" ? "rgba(34,197,94,0.04)" : dec === "reject" ? "rgba(239,68,68,0.03)" : "var(--s2)", opacity: dec === "reject" ? 0.6 : 1 }}>
                    {/* Main row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
                      {/* Source product */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                        {m.source_product.image && <img src={m.source_product.image} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.source_product.name}</div>
                          <div style={{ fontSize: 10, color: "var(--dm)" }}>SKU: {m.source_product.sku || "—"} · €{m.source_product.price || "—"}</div>
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
                        <span style={{ fontSize: 14, color: "var(--mx)" }}>→</span>
                        <ConfidenceBar value={m.confidence} />
                      </div>

                      {/* Target product */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                        {m.target_product.image && <img src={m.target_product.image} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.target_product.name}</div>
                          <div style={{ fontSize: 10, color: "var(--dm)" }}>SKU: {m.target_product.sku || "—"} · €{m.target_product.price || "—"}</div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button onClick={() => setDecisions(d => ({ ...d, [i]: "accept" }))}
                          style={{ width: 30, height: 30, borderRadius: "var(--rd)", border: "1px solid", borderColor: dec === "accept" ? "#22c55e" : "var(--b2)", background: dec === "accept" ? "rgba(34,197,94,0.15)" : "transparent", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", color: dec === "accept" ? "#22c55e" : "var(--mx)" }}>✓</button>
                        <button onClick={() => setDecisions(d => ({ ...d, [i]: "reject" }))}
                          style={{ width: 30, height: 30, borderRadius: "var(--rd)", border: "1px solid", borderColor: dec === "reject" ? "#ef4444" : "var(--b2)", background: dec === "reject" ? "rgba(239,68,68,0.12)" : "transparent", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", color: dec === "reject" ? "#ef4444" : "var(--mx)" }}>✕</button>
                      </div>
                    </div>

                    {/* Detail row: reasoning + warnings */}
                    {(m.reasoning || m.unit_notes || m.price_diff) && (
                      <div style={{ padding: "6px 12px 8px", borderTop: "1px solid var(--b1)", display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11 }}>
                        {m.reasoning && <span style={{ color: "var(--mx)" }}>💬 {m.reasoning}</span>}
                        {m.unit_notes && <span style={{ color: "var(--pr-h)", background: "var(--pr-l)", padding: "1px 6px", borderRadius: 10 }}>📐 {m.unit_notes}</span>}
                        {m.price_diff && (
                          <span style={{ color: "#f59e0b", background: "rgba(245,158,11,0.1)", padding: "1px 6px", borderRadius: 10 }}>
                            ⚠ Prijsverschil {m.price_diff.pct}% (€{m.price_diff.source_price} vs €{m.price_diff.target_price})
                          </span>
                        )}
                        {m.match_basis && <span style={{ color: "var(--dm)", background: "var(--s3)", padding: "1px 6px", borderRadius: 10 }}>via {m.match_basis}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Sync fields for accepted */}
            <div style={{ borderTop: "1px solid var(--b1)", paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Velden voor {acceptCount} te koppelen producten:</div>
              <SyncFieldsPicker syncFields={syncFields} onChange={setSyncFields} />
            </div>

            <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
              <Btn variant="primary" disabled={saving || acceptCount === 0} onClick={saveAccepted} style={{ minWidth: 180 }}>
                {saving ? "Opslaan..." : `✓ ${acceptCount} koppelingen opslaan`}
              </Btn>
              <Btn variant="ghost" onClick={onClose}>Annuleren</Btn>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Koppelingen opgeslagen</div>
            <div style={{ fontSize: 13, color: "var(--mx)", marginTop: 6 }}>De verbonden producten zijn klaar voor synchronisatie.</div>
            <Btn variant="primary" onClick={onClose} style={{ marginTop: 20 }}>Sluiten</Btn>
          </div>
        )}
      </div>
    </Overlay>
  );
};

const ConnectedSitesView = ({ products, sites, activeSite, wooCall }) => {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState({});
  const [savingFields, setSavingFields] = useState({});
  const [openFields, setOpenFields] = useState({});
  const [pendingFields, setPendingFields] = useState({});
  const [aiScanModal, setAiScanModal] = useState(null); // { targetShop }

  // Connect modal state
  const [connectModal, setConnectModal] = useState(null);
  const [saving, setSaving] = useState(false);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/connected-products", { headers: { "Authorization": `Bearer ${token}` } });
        const data = await res.json();
        setConnections(Array.isArray(data) ? data : []);
      } catch (e) { console.error("Load connections failed:", e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const isConnected = (sourceProductId, targetShopId) =>
    connections.some(c => c.source_shop_id === activeSite?.id && c.source_product_id === sourceProductId && c.target_shop_id === targetShopId);

  const getConn = (sourceProductId, targetShopId) =>
    connections.find(c => c.source_shop_id === activeSite?.id && c.source_product_id === sourceProductId && c.target_shop_id === targetShopId);

  const disconnect = async (conn) => {
    if (!confirm("Verbinding verwijderen?")) return;
    const token = await getToken();
    await fetch(`/api/connected-products?id=${conn.id}`, { method: "DELETE", headers: { "Authorization": `Bearer ${token}` } });
    setConnections(cs => cs.filter(c => c.id !== conn.id));
    setOpenFields(o => { const n = {...o}; delete n[conn.id]; return n; });
    setPendingFields(o => { const n = {...o}; delete n[conn.id]; return n; });
  };

  // ── Open connect modal ─────────────────────────────────────────────────────
  const openConnect = (product, targetShop) => {
    setConnectModal({
      product, targetShop,
      step: "mode",
      mode: null,
      matchAttribute: "",
      searchQuery: product.sku || product.name || "",
      searchResults: [],
      searching: false,
      autoMatch: null,
      autoSearching: false,
      syncFields: DEFAULT_SYNC_FIELDS,
    });
  };

  const updModal = (patch) => setConnectModal(m => m ? { ...m, ...patch } : null);

  const runSkuMatch = async () => {
    const { product, targetShop } = connectModal;
    if (!product.sku) { updModal({ autoMatch: "no_sku" }); return; }
    updModal({ autoSearching: true, autoMatch: null });
    try {
      const results = await wooCall(targetShop.id, `products?sku=${encodeURIComponent(product.sku)}&per_page=5`);
      const match = Array.isArray(results) ? results.find(r => r.sku === product.sku) || results[0] : null;
      updModal({ autoMatch: match || "not_found", autoSearching: false });
    } catch {
      updModal({ autoMatch: "error", autoSearching: false });
    }
  };

  const runAttributeMatch = async (attrSlug) => {
    const { product, targetShop } = connectModal;
    const attr = product.attributes?.find(a => a.slug === attrSlug || a.name === attrSlug);
    const attrVal = attr?.options?.[0] || attr?.option || "";
    if (!attrVal) { updModal({ searchResults: [], autoSearching: false }); return; }
    updModal({ autoSearching: true, searchResults: [] });
    try {
      const results = await wooCall(targetShop.id, `products?search=${encodeURIComponent(attrVal)}&per_page=20`);
      updModal({ searchResults: Array.isArray(results) ? results : [], autoSearching: false });
    } catch {
      updModal({ searchResults: [], autoSearching: false });
    }
  };

  useEffect(() => {
    if (!connectModal || connectModal.mode !== "manual" || connectModal.step !== "find") return;
    if (!connectModal.searchQuery?.trim()) { updModal({ searchResults: [] }); return; }
    const timer = setTimeout(async () => {
      updModal({ searching: true });
      try {
        const data = await wooCall(connectModal.targetShop.id, `products?search=${encodeURIComponent(connectModal.searchQuery)}&per_page=20`);
        updModal({ searchResults: Array.isArray(data) ? data : [], searching: false });
      } catch { updModal({ searchResults: [], searching: false }); }
    }, 400);
    return () => clearTimeout(timer);
  }, [connectModal?.searchQuery, connectModal?.mode, connectModal?.step]);

  const connect = async (targetProduct) => {
    const { product, targetShop, mode, matchAttribute, syncFields } = connectModal;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/connected-products", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          source_shop_id: activeSite.id, source_product_id: product.id,
          source_sku: product.sku, source_product_name: product.name,
          target_shop_id: targetShop.id, target_product_id: targetProduct.id, target_sku: targetProduct.sku,
          match_mode: mode || "manual", match_attribute: matchAttribute || null,
          sync_fields: syncFields,
        }),
      });
      const data = await res.json();
      if (res.ok) { setConnections(cs => [...cs, data]); setConnectModal(null); }
      else alert(data.error || "Verbinden mislukt");
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const syncProduct = async (sourceProduct, targetShopId) => {
    const key = `${sourceProduct.id}_${targetShopId}`;
    setSyncing(s => ({ ...s, [key]: true }));
    try {
      const token = await getToken();
      const res = await fetch("/api/sync-products", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ source_shop_id: activeSite.id, product_id: sourceProduct.id, target_shop_ids: [targetShopId] }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) alert(data.error || "Sync mislukt");
      else alert(`✓ Gesynchroniseerd naar ${data.results?.[0]?.shop_name || "shop"}`);
    } catch (e) { alert(e.message); }
    finally { setSyncing(s => { const n = { ...s }; delete n[key]; return n; }); }
  };

  const saveSyncFields = async (connId) => {
    const fields = pendingFields[connId];
    if (!fields) return;
    setSavingFields(s => ({ ...s, [connId]: true }));
    try {
      const token = await getToken();
      const res = await fetch(`/api/connected-products?id=${connId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ sync_fields: fields }),
      });
      const data = await res.json();
      if (res.ok) {
        setConnections(cs => cs.map(c => c.id === connId ? { ...c, sync_fields: fields } : c));
        setPendingFields(p => { const n = {...p}; delete n[connId]; return n; });
        setOpenFields(o => ({ ...o, [connId]: false }));
      } else alert(data.error || "Opslaan mislukt");
    } catch (e) { alert(e.message); }
    finally { setSavingFields(s => { const n = {...s}; delete n[connId]; return n; }); }
  };

  const toggleField = (connId, fieldId) => {
    const current = pendingFields[connId] ?? (connections.find(c => c.id === connId)?.sync_fields || DEFAULT_SYNC_FIELDS);
    const next = current.includes(fieldId) ? current.filter(f => f !== fieldId) : [...current, fieldId];
    setPendingFields(p => ({ ...p, [connId]: next }));
  };

  const otherSites = sites.filter(s => s.id !== activeSite?.id);
  const matchModeLabel = { sku: "🔑 SKU", attribute: "🏷 Attribuut", manual: "🔍 Handmatig", ai: "🤖 AI" };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "60px 0", justifyContent: "center", color: "var(--mx)", fontSize: 13 }}>
      <div style={{ width: 18, height: 18, border: "2px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      Verbindingen laden...
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Verbonden producten</h2>
          <p style={{ fontSize: 13, color: "var(--mx)" }}>
            Koppel producten van <strong>{activeSite?.name}</strong> aan dezelfde producten in andere shops.
            Gebruik de AI scan voor automatisch koppelen op basis van naam, SKU en attributen.
          </p>
        </div>
        <Badge color={connections.length > 0 ? "green" : "default"}>{connections.length} verbindingen</Badge>
      </div>

      {otherSites.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", border: "1px dashed var(--b2)", borderRadius: "var(--rd-lg)", color: "var(--dm)", fontSize: 13 }}>
          Voeg eerst meerdere shops toe via <strong>Instellingen</strong> om producten te koppelen.
        </div>
      )}

      {otherSites.length > 0 && products.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", border: "1px dashed var(--b2)", borderRadius: "var(--rd-lg)", color: "var(--dm)", fontSize: 13 }}>
          Geen producten geladen. Ga naar <strong>Producten</strong> tab om producten te laden.
        </div>
      )}

      {/* Per-shop AI scan buttons */}
      {otherSites.length > 0 && products.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {otherSites.map(ts => {
            const connCount = connections.filter(c => c.source_shop_id === activeSite?.id && c.target_shop_id === ts.id).length;
            return (
              <div key={ts.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--s2)", borderRadius: "var(--rd-lg)", border: "1px solid var(--b1)" }}>
                <span>{ts.flag}</span>
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{ts.name}</div>
                  <div style={{ color: "var(--dm)", fontSize: 11 }}>{connCount} verbonden</div>
                </div>
                <Btn variant="accent" size="sm" onClick={() => setAiScanModal({ targetShop: ts })}>🤖 AI Scan</Btn>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {products.map(p => {
          const thumb = p.images?.[0]?.src || p.featured_image;
          return (
            <div key={p.id} style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden", background: "var(--s1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--b1)", background: "var(--s2)" }}>
                {thumb && <img src={thumb} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--dm)" }}>SKU: {p.sku || "—"} · {p.type}</div>
                </div>
                {otherSites.every(s => isConnected(p.id, s.id)) && otherSites.length > 0
                  ? <Badge color="green" size="sm">🔗 Volledig</Badge>
                  : otherSites.some(s => isConnected(p.id, s.id))
                    ? <Badge color="amber" size="sm">⚡ Gedeeltelijk</Badge>
                    : <Badge color="default" size="sm">Niet verbonden</Badge>
                }
              </div>

              <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                {otherSites.map(targetShop => {
                  const conn = getConn(p.id, targetShop.id);
                  const syncKey = `${p.id}_${targetShop.id}`;
                  const isSyncing = syncing[syncKey];
                  const fieldsExpanded = conn && openFields[conn.id];
                  const currentFields = conn ? (pendingFields[conn.id] ?? conn.sync_fields ?? DEFAULT_SYNC_FIELDS) : DEFAULT_SYNC_FIELDS;
                  const isDirty = conn && !!pendingFields[conn.id];

                  return (
                    <div key={targetShop.id} style={{ border: `1px solid ${conn ? "rgba(91,214,141,0.4)" : "var(--b1)"}`, borderRadius: "var(--rd)", background: conn ? "rgba(91,214,141,0.04)" : "var(--s2)", overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px" }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>{targetShop.flag}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{targetShop.name}</div>
                          {conn ? (
                            <div style={{ fontSize: 11, color: "var(--mx)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span>→ #{conn.target_product_id}{conn.target_sku ? ` (SKU: ${conn.target_sku})` : ""}</span>
                              <span style={{ padding: "1px 6px", borderRadius: 10, background: "var(--s3)", fontSize: 10 }}>{matchModeLabel[conn.match_mode] || "🔍 Handmatig"}</span>
                              <span style={{ fontSize: 10, color: "var(--dm)" }}>{(conn.sync_fields || DEFAULT_SYNC_FIELDS).length} velden</span>
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: "var(--dm)" }}>Nog niet gekoppeld</div>
                          )}
                        </div>
                        {conn ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <Btn variant="ghost" size="sm" onClick={() => {
                              setOpenFields(o => ({ ...o, [conn.id]: !o[conn.id] }));
                              if (!pendingFields[conn.id]) setPendingFields(p => ({ ...p, [conn.id]: conn.sync_fields || DEFAULT_SYNC_FIELDS }));
                            }} style={{ fontSize: 11 }}>⚙{isDirty ? " *" : ""}</Btn>
                            <Btn variant="primary" size="sm" disabled={isSyncing} onClick={() => syncProduct(p, targetShop.id)}>
                              {isSyncing ? <span style={{ display: "inline-block", width: 10, height: 10, border: "1.5px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} /> : "↑ Sync"}
                            </Btn>
                            <Btn variant="ghost" size="sm" onClick={() => disconnect(conn)}>✕</Btn>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 6 }}>
                            <Btn variant="ghost" size="sm" onClick={() => openConnect(p, targetShop)}>🔗 Koppelen</Btn>
                          </div>
                        )}
                      </div>

                      {fieldsExpanded && conn && (
                        <div style={{ borderTop: "1px solid var(--b1)", padding: "10px 12px", background: "var(--s1)" }}>
                          <div style={{ fontSize: 11, color: "var(--mx)", marginBottom: 8, fontWeight: 600 }}>Welke velden synchroniseren?</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                            {ALL_SYNC_FIELDS.map(f => {
                              const checked = currentFields.includes(f.id);
                              return (
                                <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 8px", borderRadius: "var(--rd)", border: `1px solid ${checked ? "var(--pr)" : "var(--b2)"}`, background: checked ? "rgba(var(--pr-rgb,99,102,241),0.08)" : "var(--s2)", cursor: "pointer", fontSize: 11, userSelect: "none" }}>
                                  <input type="checkbox" checked={checked} onChange={() => toggleField(conn.id, f.id)} style={{ margin: 0, accentColor: "var(--pr)" }} />
                                  {f.label}
                                </label>
                              );
                            })}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <Btn variant="primary" size="sm" disabled={savingFields[conn.id]} onClick={() => saveSyncFields(conn.id)}>
                              {savingFields[conn.id] ? "Opslaan..." : "Opslaan"}
                            </Btn>
                            <Btn variant="ghost" size="sm" onClick={() => {
                              setPendingFields(p => { const n = {...p}; delete n[conn.id]; return n; });
                              setOpenFields(o => ({ ...o, [conn.id]: false }));
                            }}>Annuleren</Btn>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Connect modal */}
      {connectModal && (() => {
        const { product, targetShop, step, mode, matchAttribute, searchQuery, searchResults, searching, autoMatch, autoSearching, syncFields } = connectModal;
        return (
          <Overlay open title={`Koppel aan ${targetShop.flag} ${targetShop.name}`} onClose={() => setConnectModal(null)} width={540}>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16, overflow: "auto", flex: 1 }}>
              <div style={{ padding: "8px 12px", background: "var(--s2)", borderRadius: "var(--rd)", fontSize: 12, display: "flex", alignItems: "center", gap: 10 }}>
                {product.images?.[0]?.src && <img src={product.images[0].src} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }} />}
                <div><div style={{ fontWeight: 600 }}>{product.name}</div><div style={{ color: "var(--dm)", fontSize: 11 }}>SKU: {product.sku || "—"}</div></div>
              </div>

              {step === "mode" && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: "var(--mx)" }}>Hoe wil je koppelen?</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { id: "sku", icon: "🔑", title: "Koppelen via SKU", desc: `Zoek automatisch het product met SKU "${product.sku || "—"}"`, disabled: !product.sku },
                      { id: "attribute", icon: "🏷", title: "Koppelen via attribuut", desc: "Gebruik een attribuut als identifier", disabled: !product.attributes?.length },
                      { id: "manual", icon: "🔍", title: "Handmatig zoeken", desc: "Zoek en selecteer het product zelf" },
                    ].map(opt => (
                      <button key={opt.id} disabled={opt.disabled} onClick={() => {
                        updModal({ mode: opt.id, step: "find" });
                        if (opt.id === "sku") setTimeout(runSkuMatch, 50);
                      }} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", border: `1px solid ${opt.disabled ? "var(--b1)" : "var(--b2)"}`, borderRadius: "var(--rd)", background: opt.disabled ? "var(--s1)" : "var(--s2)", cursor: opt.disabled ? "not-allowed" : "pointer", textAlign: "left", opacity: opt.disabled ? 0.5 : 1 }}>
                        <span style={{ fontSize: 20 }}>{opt.icon}</span>
                        <div><div style={{ fontWeight: 600, fontSize: 13 }}>{opt.title}</div><div style={{ fontSize: 11, color: "var(--dm)" }}>{opt.desc}</div></div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === "find" && mode === "sku" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--mx)" }}>Zoeken naar SKU <strong>{product.sku}</strong> in {targetShop.name}...</div>
                  {autoSearching && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--dm)" }}><div style={{ width: 14, height: 14, border: "2px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />Zoeken...</div>}
                  {!autoSearching && autoMatch === "no_sku" && <div style={{ padding: 10, background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: "var(--rd)", fontSize: 12 }}>⚠️ Geen SKU. <Btn variant="secondary" size="sm" onClick={() => updModal({ mode: "manual" })}>Handmatig</Btn></div>}
                  {!autoSearching && autoMatch === "not_found" && <div style={{ fontSize: 12, color: "var(--re)" }}>❌ SKU niet gevonden. <Btn variant="secondary" size="sm" onClick={() => updModal({ mode: "manual", searchQuery: product.sku || product.name })}>Handmatig</Btn></div>}
                  {!autoSearching && typeof autoMatch === "object" && autoMatch !== null && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>✅ Match:</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid rgba(91,214,141,0.4)", borderRadius: "var(--rd)", background: "rgba(91,214,141,0.06)" }}>
                        {autoMatch.images?.[0]?.src && <img src={autoMatch.images[0].src} alt="" style={{ width: 32, height: 32, borderRadius: 4 }} />}
                        <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{autoMatch.name}</div><div style={{ fontSize: 11, color: "var(--dm)" }}>SKU: {autoMatch.sku}</div></div>
                      </div>
                      <SyncFieldsPicker syncFields={syncFields} onChange={f => updModal({ syncFields: f })} />
                      <div style={{ marginTop: 12 }}><Btn variant="primary" disabled={saving} onClick={() => connect(autoMatch)}>{saving ? "..." : "Bevestig"}</Btn></div>
                    </div>
                  )}
                  <Btn variant="ghost" size="sm" onClick={() => updModal({ step: "mode", mode: null, autoMatch: null })}>← Terug</Btn>
                </div>
              )}

              {step === "find" && mode === "attribute" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <select value={matchAttribute} onChange={e => { updModal({ matchAttribute: e.target.value, searchResults: [] }); if (e.target.value) setTimeout(() => runAttributeMatch(e.target.value), 50); }} style={{ width: "100%", padding: "8px 10px", background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: "var(--rd)", color: "var(--tx)", fontSize: 13 }}>
                    <option value="">Selecteer attribuut...</option>
                    {product.attributes?.map(a => <option key={a.id || a.slug} value={a.slug || a.name}>{a.name} ({(a.options || [a.option]).join(", ")})</option>)}
                  </select>
                  {autoSearching && <div style={{ fontSize: 12, color: "var(--dm)" }}>Zoeken...</div>}
                  {searchResults.map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--b1)", borderRadius: "var(--rd)", background: "var(--s2)" }}>
                      {r.images?.[0]?.src && <img src={r.images[0].src} alt="" style={{ width: 28, height: 28, borderRadius: 4 }} />}
                      <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 500 }}>{r.name}</div><div style={{ fontSize: 11, color: "var(--dm)" }}>SKU: {r.sku}</div></div>
                      <Btn variant="primary" size="sm" onClick={() => updModal({ autoMatch: r })}>Selecteer</Btn>
                    </div>
                  ))}
                  {typeof autoMatch === "object" && autoMatch !== null && (
                    <div>
                      <SyncFieldsPicker syncFields={syncFields} onChange={f => updModal({ syncFields: f })} />
                      <div style={{ marginTop: 10 }}><Btn variant="primary" disabled={saving} onClick={() => connect(autoMatch)}>{saving ? "..." : "Bevestig"}</Btn></div>
                    </div>
                  )}
                  <Btn variant="ghost" size="sm" onClick={() => updModal({ step: "mode", mode: null, autoMatch: null, searchResults: [] })}>← Terug</Btn>
                </div>
              )}

              {step === "find" && mode === "manual" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Inp value={searchQuery} onChange={e => updModal({ searchQuery: e.target.value })} placeholder="Zoek op naam of SKU..." />
                  {searching && <div style={{ fontSize: 12, color: "var(--dm)" }}>Zoeken...</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                    {searchResults.map(r => (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--b1)", borderRadius: "var(--rd)", background: "var(--s2)" }}>
                        {r.images?.[0]?.src && <img src={r.images[0].src} alt="" style={{ width: 28, height: 28, borderRadius: 4 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div><div style={{ fontSize: 11, color: "var(--dm)" }}>SKU: {r.sku} · #{r.id}</div></div>
                        <Btn variant="primary" size="sm" disabled={saving} onClick={() => updModal({ autoMatch: r })}>Selecteer</Btn>
                      </div>
                    ))}
                  </div>
                  {typeof autoMatch === "object" && autoMatch !== null && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>✅ {autoMatch.name}</div>
                      <SyncFieldsPicker syncFields={syncFields} onChange={f => updModal({ syncFields: f })} />
                      <div style={{ marginTop: 10 }}><Btn variant="primary" disabled={saving} onClick={() => connect(autoMatch)}>{saving ? "..." : "Bevestig koppeling"}</Btn></div>
                    </div>
                  )}
                  <Btn variant="ghost" size="sm" onClick={() => updModal({ step: "mode", mode: null, autoMatch: null, searchResults: [] })}>← Terug</Btn>
                </div>
              )}
            </div>
          </Overlay>
        );
      })()}

      {/* AI Scan Modal */}
      {aiScanModal && (
        <AiScanModal
          sourceShop={activeSite}
          targetShop={aiScanModal.targetShop}
          getToken={getToken}
          onClose={() => setAiScanModal(null)}
          onConfirmMatches={(saved, failed) => {
            // Reload connections after AI batch save
            const reload = async () => {
              const token = await getToken();
              const res = await fetch("/api/connected-products", { headers: { "Authorization": `Bearer ${token}` } });
              const data = await res.json();
              if (Array.isArray(data)) setConnections(data);
            };
            reload();
            if (failed > 0) alert(`${saved} koppelingen opgeslagen, ${failed} mislukt`);
          }}
        />
      )}
    </div>
  );
};

// ── Sync Fields Picker ────────────────────────────────────────────────────────
const SyncFieldsPicker = ({ syncFields, onChange }) => (
  <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid var(--b1)", borderRadius: "var(--rd)", background: "var(--s1)" }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--mx)", marginBottom: 8 }}>Welke velden synchroniseren?</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {ALL_SYNC_FIELDS.map(f => {
        const checked = syncFields.includes(f.id);
        return (
          <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 10, border: `1px solid ${checked ? "var(--pr)" : "var(--b2)"}`, background: checked ? "rgba(var(--pr-rgb,99,102,241),0.08)" : "var(--s2)", cursor: "pointer", fontSize: 11, userSelect: "none" }}>
            <input type="checkbox" checked={checked} onChange={() => onChange(checked ? syncFields.filter(x => x !== f.id) : [...syncFields, f.id])} style={{ margin: 0, accentColor: "var(--pr)" }} />
            {f.label}
          </label>
        );
      })}
    </div>
  </div>
);


// ─── Marketing View ───────────────────────────────────────────────────────────
const EXPIRY_OPTIONS = [
  { label: "1 uur vanaf nu",    hours: 1 },
  { label: "2 uur vanaf nu",    hours: 2 },
  { label: "3 uur vanaf nu",    hours: 3 },
  { label: "8 uur vanaf nu",    hours: 8 },
  { label: "24 uur vanaf nu",   hours: 24 },
  { label: "3 dagen vanaf nu",  hours: 72 },
  { label: "1 week vanaf nu",   hours: 168 },
];

const DISCOUNT_TYPES = [
  { value: "percent",        label: "Procentuele korting" },
  { value: "fixed_cart",     label: "Vaste winkelwagenkorting" },
  { value: "fixed_product",  label: "Vaste productkorting" },
];

const CouponManager = ({ activeSite, user }) => {
  const [hasAdvCoupons, setHasAdvCoupons] = useState(null); // null=checking, true/false
  const [checkingPlugin, setCheckingPlugin] = useState(false);
  const [form, setForm] = useState({
    code: "",
    discount_type: "percent",
    amount: "",
    usage_limit: "",
    usage_limit_per_user: "",
    use_schedule: true,
    expiry_hours: 24,
  });
  const [creating, setCreating] = useState(false);
  const [result, setCouponResult] = useState(null); // { ok, coupon_url, coupon_code, error }
  const [codeGenerated, setCodeGenerated] = useState(false);

  // Check if Advanced Coupons is installed on the active shop
  useEffect(() => {
    if (!activeSite) return;
    setHasAdvCoupons(null);
    setCheckingPlugin(true);
    const checkPlugin = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await fetch("/api/woo", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ shopId: activeSite.id, endpoint: "system_status", method: "GET" }),
        });
        if (!res.ok) { setHasAdvCoupons(false); return; }
        const d = await res.json();
        const plugins = d.active_plugins || [];
        const hasIt = plugins.some(p =>
          (p.plugin || p.name || "").toLowerCase().includes("advanced-coupons") ||
          (p.plugin || p.name || "").toLowerCase().includes("advanced_coupons")
        );
        setHasAdvCoupons(hasIt);
      } catch { setHasAdvCoupons(false); }
      finally { setCheckingPlugin(false); }
    };
    checkPlugin();
  }, [activeSite?.id]);

  const generateCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    setForm(f => ({ ...f, code }));
    setCodeGenerated(true);
    setCouponResult(null);
  };

  const createCoupon = async () => {
    if (!form.code || !form.amount) return;
    setCreating(true);
    setCouponResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/coupon-create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          shopId: activeSite.id,
          code: form.code.toUpperCase().trim(),
          discount_type: form.discount_type,
          amount: form.amount,
          usage_limit: form.usage_limit ? parseInt(form.usage_limit) : null,
          usage_limit_per_user: form.usage_limit_per_user ? parseInt(form.usage_limit_per_user) : null,
          use_schedule: form.use_schedule,
          expiry_hours: form.expiry_hours,
          has_adv_coupons: hasAdvCoupons,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Aanmaken mislukt");
      setCouponResult(d);
      // reset form code for next coupon
      setForm(f => ({ ...f, code: "", amount: "" }));
      setCodeGenerated(false);
    } catch (e) {
      setCouponResult({ ok: false, error: e.message });
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  if (!activeSite) return (
    <div style={{ padding: "40px 0", textAlign: "center", color: "var(--mx)", fontSize: 13 }}>
      Selecteer een shop om kortingscodes te beheren.
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 680 }}>

      {/* Plugin status banner */}
      {checkingPlugin ? (
        <div style={{ padding: "10px 14px", background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", fontSize: 12, color: "var(--mx)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ animation: "spin 0.8s linear infinite", display: "inline-block" }}>↻</span> Plugin status controleren voor {activeSite.name}...
        </div>
      ) : hasAdvCoupons === true ? (
        <div style={{ padding: "10px 14px", background: "rgba(34,197,94,0.08)", borderRadius: "var(--rd)", border: "1px solid rgba(34,197,94,0.25)", fontSize: 12, color: "var(--gr)", display: "flex", alignItems: "center", gap: 8 }}>
          ✓ Advanced Coupons for WooCommerce gedetecteerd — alle functies beschikbaar inclusief URL-kortingscodes
        </div>
      ) : hasAdvCoupons === false ? (
        <div style={{ padding: "10px 14px", background: "rgba(251,191,36,0.08)", borderRadius: "var(--rd)", border: "1px solid rgba(251,191,36,0.3)", fontSize: 12, color: "var(--am)", display: "flex", gap: 8 }}>
          <span>⚠</span>
          <span>Advanced Coupons plugin niet gevonden op {activeSite.name}. Datumplanning uitgeschakeld. <a href="https://wordpress.org/plugins/advanced-coupons-for-woocommerce-free/" target="_blank" rel="noopener noreferrer" style={{ color: "var(--pr-h)", textDecoration: "none" }}>Plugin installeren →</a></span>
        </div>
      ) : null}

      {/* Success result */}
      {result?.ok && (
        <div style={{ padding: 16, background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "var(--rd-lg)" }}>
          <div style={{ fontWeight: 700, color: "var(--gr)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <span>✓</span> Kortingscode aangemaakt
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--mx)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>Kortingscode</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <code style={{ background: "var(--s3)", padding: "4px 10px", borderRadius: 4, fontSize: 15, fontWeight: 700, letterSpacing: "0.1em", border: "1px solid var(--b1)", color: "var(--gr)" }}>{result.coupon_code}</code>
                <Btn variant="secondary" size="sm" onClick={() => copyToClipboard(result.coupon_code)}>📋 Kopieer</Btn>
              </div>
            </div>
            {result.coupon_url && (
              <div>
                <div style={{ fontSize: 11, color: "var(--mx)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>Kortingsbon URL</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <code style={{ background: "var(--s3)", padding: "4px 10px", borderRadius: 4, fontSize: 12, border: "1px solid var(--b1)", color: "var(--pr-h)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{result.coupon_url}</code>
                  <Btn variant="secondary" size="sm" onClick={() => copyToClipboard(result.coupon_url)}>📋 Kopieer</Btn>
                </div>
                <div style={{ fontSize: 11, color: "var(--dm)", marginTop: 4 }}>
                  Bezoekers die op deze URL klikken krijgen automatisch de kortingscode toegepast.
                </div>
              </div>
            )}
            {result.expires_at && (
              <div style={{ fontSize: 12, color: "var(--mx)" }}>⏰ Vervalt op: {new Date(result.expires_at).toLocaleString("nl-NL")}</div>
            )}
          </div>
          <Btn variant="ghost" size="sm" onClick={() => setCouponResult(null)} style={{ marginTop: 10 }}>Nieuwe kortingscode aanmaken</Btn>
        </div>
      )}

      {result?.ok === false && (
        <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--rd)", fontSize: 13, color: "var(--re)" }}>
          ✗ {result.error}
        </div>
      )}

      {/* Coupon form */}
      {!result?.ok && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Code */}
          <Field label="Waardebon code" required>
            <div style={{ display: "flex", gap: 8 }}>
              <Inp
                value={form.code}
                onChange={e => { setForm(f => ({ ...f, code: e.target.value.toUpperCase() })); setCouponResult(null); }}
                placeholder="Bijv. ZOMER10"
                style={{ flex: 1, fontFamily: "monospace", fontWeight: 600, letterSpacing: "0.05em" }}
              />
              <Btn variant="secondary" size="sm" onClick={generateCode}>Genereer</Btn>
            </div>
          </Field>

          {/* Discount type + amount */}
          <div className="settings-2col">
            <Field label="Kortingstype">
              <Sel
                value={form.discount_type}
                onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))}
                options={DISCOUNT_TYPES}
              />
            </Field>
            <Field label={form.discount_type === "percent" ? "Kortingspercentage (%)" : "Kortingsbedrag (€)"} required>
              <Inp
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                type="number"
                placeholder={form.discount_type === "percent" ? "Bijv. 10" : "Bijv. 5.00"}
              />
            </Field>
          </div>

          {/* Usage limits */}
          <div className="settings-2col">
            <Field label="Gebruikslimiet per waardebon" hint="Leeg = onbeperkt">
              <Inp
                value={form.usage_limit}
                onChange={e => setForm(f => ({ ...f, usage_limit: e.target.value }))}
                type="number"
                placeholder="Onbeperkt gebruik"
              />
            </Field>
            <Field label="Gebruikslimiet per klant" hint="Leeg = onbeperkt">
              <Inp
                value={form.usage_limit_per_user}
                onChange={e => setForm(f => ({ ...f, usage_limit_per_user: e.target.value }))}
                type="number"
                placeholder="Onbeperkt gebruik"
              />
            </Field>
          </div>

          {/* Date Range Schedule */}
          <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: `1px solid ${form.use_schedule ? "rgba(91,91,214,0.4)" : "var(--b1)"}`, transition: "border-color 0.2s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: form.use_schedule ? 14 : 0 }}>
              <input
                type="checkbox"
                id="use-schedule"
                checked={form.use_schedule}
                onChange={e => setForm(f => ({ ...f, use_schedule: e.target.checked }))}
                style={{ width: 16, height: 16, cursor: "pointer" }}
                disabled={hasAdvCoupons === false}
              />
              <label htmlFor="use-schedule" style={{ fontSize: 13, fontWeight: 600, cursor: hasAdvCoupons === false ? "not-allowed" : "pointer", color: hasAdvCoupons === false ? "var(--dm)" : "var(--tx)" }}>
                Date Range Schedules {hasAdvCoupons === false && <span style={{ fontWeight: 400, fontSize: 11, color: "var(--dm)" }}>(vereist Advanced Coupons)</span>}
              </label>
            </div>
            {form.use_schedule && (
              <div className="settings-2col">
                <Field label="Startdatum coupon" hint="Wordt ingesteld op nu (WooCommerce direct geldig)">
                  <Inp value="Nu (direct geldig)" onChange={() => {}} style={{ color: "var(--dm)" }} />
                </Field>
                <Field label="Vervaldatum coupon">
                  <Sel
                    value={form.expiry_hours}
                    onChange={e => setForm(f => ({ ...f, expiry_hours: parseInt(e.target.value) }))}
                    options={EXPIRY_OPTIONS.map(o => ({ value: o.hours, label: o.label }))}
                  />
                </Field>
              </div>
            )}
          </div>

          <Btn
            variant="primary"
            onClick={createCoupon}
            disabled={creating || !form.code || !form.amount}
            icon={creating ? <span style={{ animation: "spin 0.8s linear infinite", display: "inline-block" }}>↻</span> : "🎟"}
          >
            {creating ? "Aanmaken..." : "Kortingscode aanmaken"}
          </Btn>
        </div>
      )}
    </div>
  );
};

const MarketingView = ({ activeSite, shops, user }) => {
  const [marketingTab, setMarketingTab] = useState("coupons");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Marketing</h2>
        <p style={{ fontSize: 13, color: "var(--mx)" }}>Beheer kortingscodes en marketingacties voor {activeSite?.name || "je shops"}.</p>
      </div>
      <Tabs
        tabs={[{ id: "coupons", label: "🎟 Kortingscodes", icon: "" }]}
        active={marketingTab}
        onChange={setMarketingTab}
        size="sm"
      />
      {marketingTab === "coupons" && <CouponManager activeSite={activeSite} user={user} />}
    </div>
  );
};

// ─── Hreflang Manager ─────────────────────────────────────────────────────────
const HreflangView = ({ sites }) => {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [xDefaults, setXDefaults] = useState({}); // { connId: bool }
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/connected-products", { headers: { "Authorization": `Bearer ${session?.access_token}` } });
        const data = await res.json();
        const conns = Array.isArray(data) ? data : [];
        setConnections(conns);
        // Auto-set x-default for first connection per source product
        const defaults = {};
        const seen = new Set();
        conns.forEach(c => {
          const key = `${c.source_shop_id}_${c.source_product_id}`;
          if (!seen.has(key)) { defaults[c.id] = true; seen.add(key); }
        });
        setXDefaults(defaults);
      } catch (e) { console.error("Load connections failed:", e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const getSite = id => sites.find(s => s.id === id);

  const generateTag = (conn) => {
    const src = getSite(conn.source_shop_id);
    const tgt = getSite(conn.target_shop_id);
    if (!src || !tgt) return "";
    const srcBase = src.site_url?.replace(/\/$/, "") || "";
    const tgtBase = tgt.site_url?.replace(/\/$/, "") || "";
    const srcLocale = src.locale?.replace("_", "-").toLowerCase() || "nl";
    const tgtLocale = tgt.locale?.replace("_", "-").toLowerCase() || "nl";
    const srcSlug = conn.source_sku ? `/${conn.source_sku}/` : "/product/";
    const tgtSlug = conn.target_sku ? `/${conn.target_sku}/` : "/product/";
    return `<!-- ${conn.source_product_name || "Product"} -->
<link rel="alternate" hreflang="${srcLocale}" href="${srcBase}${srcSlug}" />
<link rel="alternate" hreflang="${tgtLocale}" href="${tgtBase}${tgtSlug}" />${xDefaults[conn.id] ? `
<link rel="alternate" hreflang="x-default" href="${srcBase}${srcSlug}" />` : ""}`;
  };

  const copyAll = () => {
    const all = connections.map(c => generateTag(c)).join("\n\n");
    navigator.clipboard.writeText(all).then(() => { setCopied("all"); setTimeout(() => setCopied(null), 2000); });
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "60px 0", justifyContent: "center", color: "var(--mx)", fontSize: 13 }}>
      <div style={{ width: 18, height: 18, border: "2px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      Hreflang laden...
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Hreflang Manager</h2>
          <p style={{ fontSize: 13, color: "var(--mx)" }}>Gegenereerde hreflang-tags op basis van jouw verbonden producten. Kopieer ze naar je WordPress theme of plugin.</p>
        </div>
        {connections.length > 0 && (
          <Btn variant="secondary" size="sm" onClick={copyAll}>{copied === "all" ? "✓ Gekopieerd!" : "📋 Kopieer alles"}</Btn>
        )}
      </div>

      <div style={{ padding: 14, background: "var(--pr-l)", borderRadius: "var(--rd)", border: "1px solid rgba(91,91,214,0.2)", marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "var(--pr-h)", fontWeight: 600, marginBottom: 4 }}>💡 Automatische hreflang-injectie</div>
        <div style={{ fontSize: 12, color: "var(--mx)" }}>
          Tags worden gegenereerd op basis van verbonden producten. Koppel producten eerst via de <strong>Verbonden</strong> tab.
          De Hreflang Manager Pro plugin leest deze data automatisch uit via de companion plugin REST API.
        </div>
      </div>

      {connections.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", border: "1px dashed var(--b2)", borderRadius: "var(--rd-lg)", color: "var(--dm)", fontSize: 13 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🌐</div>
          Geen verbonden producten gevonden.<br />
          Ga naar <strong>Verbonden</strong> tab om producten te koppelen.
        </div>
      ) : (
        <>
          {/* Table */}
          <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden", marginBottom: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px 80px 80px", background: "var(--s2)", padding: "8px 14px", borderBottom: "1px solid var(--b1)" }}>
              {["Bronshop / Product", "Doelshop / Product", "Hreflang locale", "x-default", ""].map((h, i) => (
                <span key={i} style={{ fontSize: 11, color: "var(--dm)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</span>
              ))}
            </div>
            {connections.map(conn => {
              const srcSite = getSite(conn.source_shop_id);
              const tgtSite = getSite(conn.target_shop_id);
              const locale = tgtSite?.locale?.replace("_", "-").toLowerCase() || "?";
              const tag = generateTag(conn);
              return (
                <div key={conn.id} style={{ borderBottom: "1px solid var(--b1)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px 80px 80px", padding: "10px 14px", alignItems: "center", gap: 8 }}>
                    <div>
                      <Badge color="default" size="sm">{srcSite?.flag} {srcSite?.name}</Badge>
                      <div style={{ fontSize: 11, color: "var(--dm)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {conn.source_product_name || `#${conn.source_product_id}`}
                      </div>
                    </div>
                    <div>
                      <Badge color="default" size="sm">{tgtSite?.flag} {tgtSite?.name}</Badge>
                      <div style={{ fontSize: 11, color: "var(--dm)", marginTop: 3 }}>#{conn.target_product_id} {conn.target_sku ? `(${conn.target_sku})` : ""}</div>
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--pr-h)", background: "var(--s2)", padding: "3px 8px", borderRadius: 4 }}>
                      hreflang="{locale}"
                    </div>
                    <Chk checked={!!xDefaults[conn.id]} onChange={v => setXDefaults(d => ({ ...d, [conn.id]: v }))} label="" />
                    <Btn variant="ghost" size="sm" onClick={() => {
                      navigator.clipboard.writeText(tag).then(() => { setCopied(conn.id); setTimeout(() => setCopied(null), 2000); });
                    }}>{copied === conn.id ? "✓" : "📋"}</Btn>
                  </div>
                  {/* Collapsible tag preview */}
                  <div style={{ padding: "0 14px 10px", fontFamily: "monospace", fontSize: 11, color: "var(--mx)", background: "var(--s3)", whiteSpace: "pre", overflowX: "auto" }}>
                    {tag}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Admin Panel (superadmin only) ────────────────────────────────────────────
const AdminPanel = ({ adminTab, setAdminTab }) => {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [editUser, setEditUser] = useState(null);
  const [paymentsData, setPaymentsData] = useState(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [invoiceUser, setInvoiceUser] = useState(null);
  const [userInvoices, setUserInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  const loadPayments = async () => {
    setPaymentsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/mollie-payments", { headers: { "Authorization": `Bearer ${session?.access_token}` } });
      const data = await res.json();
      if (!data.error) setPaymentsData(data);
      else setPaymentsData({ error: data.error });
    } catch (e) { setPaymentsData({ error: e.message }); }
    finally { setPaymentsLoading(false); }
  };

  useEffect(() => { if (adminTab === "payments") loadPayments(); }, [adminTab]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await fetch("/api/admin-users", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Laden mislukt");
        const data = await res.json();
        setUsers(data || []);
      } catch (e) {
        console.error("Failed to load users:", e);
      } finally {
        setUsersLoading(false);
      }
    };
    loadUsers();
  }, []);

  const updUser = (id, field, val) => setUsers(us => us.map(u => u.id === id ? { ...u, [field]: val } : u));
  const saveUser = async (u) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const payload = {
        id: u.id,
        plan: u.plan,
        max_shops: u.max_shops ? parseInt(u.max_shops) : (PLANS[u.plan]?.sites || 10),
        max_connected_products: u.max_connected_products ? parseInt(u.max_connected_products) : (PLANS[u.plan]?.connected_products || 500),
        is_admin: u.is_admin ?? false,
        ai_taxonomy_enabled: u.ai_taxonomy_enabled ?? false,
        ai_taxonomy_model: u.ai_taxonomy_model || "gemini-2.5-flash-image",
        ai_taxonomy_threshold: u.ai_taxonomy_threshold ? parseFloat(u.ai_taxonomy_threshold) : 0.85,
        gemini_model: u.gemini_model || "gemini-2.5-flash-image",
        img_max_kb: u.img_max_kb ? parseInt(u.img_max_kb) : 400,
        img_quality: u.img_quality ? parseInt(u.img_quality) : 85,
        img_max_width: u.img_max_width ? parseInt(u.img_max_width) : 1200,
      };
      const res = await fetch("/api/admin-users", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok || result.error) {
        alert("Opslaan mislukt: " + (result.error || res.statusText));
        return;
      }
      setUsers(us => us.map(usr => usr.id === u.id ? { ...usr, ...payload } : usr));
      setEditUser(null);
    } catch (e) { alert("Opslaan mislukt: " + e.message); }
  };

  const archiveUser = async (u) => {
    const isArchived = u.archived;
    const label = isArchived ? "Dearchiveren" : "Archiveren";
    if (!window.confirm(`${label}: ${u.email}? ${isArchived ? "Account wordt hersteld." : "Account wordt gesuspendeerd en verborgen."}`)) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ id: u.id, archived: !isArchived }),
      });
      const result = await res.json();
      if (!res.ok) { alert("Fout: " + result.error); return; }
      setUsers(us => us.map(usr => usr.id === u.id ? { ...usr, archived: !isArchived, plan: !isArchived ? "suspended" : usr.plan } : usr));
    } catch (e) { alert("Fout: " + e.message); }
  };

  const deleteUser = async (u) => {
    if (!window.confirm(`PERMANENT VERWIJDEREN: ${u.email}?

Dit kan niet ongedaan worden gemaakt. Alle data wordt gewist.`)) return;
    if (!window.confirm("Weet je het zeker? Dit verwijdert het account permanent uit de database en authenticatie.")) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin-users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ id: u.id }),
      });
      const result = await res.json();
      if (!res.ok) { alert("Fout: " + result.error); return; }
      setUsers(us => us.filter(usr => usr.id !== u.id));
    } catch (e) { alert("Fout: " + e.message); }
  };

  return (
    <div className="fade-in">
      <div style={{ marginTop: 4 }}>

        {/* Users */}
        {adminTab === "users" && (() => {
          const loadInvoices = async (u) => {
            setInvoiceUser(u); setInvoicesLoading(true);
            try {
              // First try DB
              const { data } = await supabase.from("invoices").select("*").eq("user_id", u.id).order("issued_at", { ascending: false });
              if (data?.length) { setUserInvoices(data); setInvoicesLoading(false); return; }
              // If no DB records but user has a paid mollie_payment_id, try get-invoice which creates on-demand
              if (u.mollie_payment_id && PLANS[u.plan]) {
                const { data: { session } } = await supabase.auth.getSession();
                const res = await fetch(`/api/get-invoice?payment_id=${u.mollie_payment_id}`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
                if (res.ok) {
                  // After on-demand creation, re-query DB
                  const { data: fresh } = await supabase.from("invoices").select("*").eq("user_id", u.id).order("issued_at", { ascending: false });
                  setUserInvoices(fresh || []);
                } else { setUserInvoices([]); }
              } else { setUserInvoices([]); }
            } catch { setUserInvoices([]); } finally { setInvoicesLoading(false); }
          };

          const visibleUsers = users.filter(u => showArchived ? u.archived : !u.archived);
          const archivedCount = users.filter(u => u.archived).length;

          return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "var(--mx)" }}>{visibleUsers.length} gebruiker{visibleUsers.length !== 1 ? "s" : ""}</span>
                <Btn variant="ghost" size="sm" onClick={() => setShowArchived(a => !a)}>
                  {showArchived ? "← Actieve gebruikers" : `📦 Gearchiveerd (${archivedCount})`}
                </Btn>
              </div>
              <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "150px 170px 120px 70px 90px 60px 80px 1fr", gap: 0, background: "var(--s2)", padding: "8px 14px", borderBottom: "1px solid var(--b1)" }}>
                  {["Naam", "E-mail", "Bedrijf / Land", "BTW", "Plan", "Shops", "Status", "Acties"].map((h, i) => (
                    <span key={i} style={{ fontSize: 11, color: "var(--dm)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</span>
                  ))}
                </div>
                {visibleUsers.length === 0 && (
                  <div style={{ padding: "20px 14px", fontSize: 13, color: "var(--dm)" }}>Geen gebruikers gevonden.</div>
                )}
                {visibleUsers.map(u => (
                  <div key={u.id} style={{ display: "grid", gridTemplateColumns: "150px 170px 120px 70px 90px 60px 80px 1fr", gap: 0, padding: "10px 14px", borderBottom: "1px solid var(--b1)", alignItems: "center", opacity: u.archived ? 0.6 : 1, background: u.archived ? "rgba(239,68,68,0.03)" : "transparent" }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{u.full_name || u.name || "—"}</div>
                      {u.address_city && <div style={{ fontSize: 11, color: "var(--dm)" }}>{u.address_city}</div>}
                      {u.archived && <Badge color="red" size="sm">Gearchiveerd</Badge>}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--mx)", wordBreak: "break-all" }}>{u.email}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--mx)" }}>{u.business_name || "—"}</div>
                      {u.country && <div style={{ fontSize: 11, color: "var(--dm)" }}>{u.country}</div>}
                    </div>
                    <div style={{ fontSize: 11 }}>
                      {u.vat_number ? <div style={{ color: u.vat_validated ? "var(--gr)" : "var(--mx)" }}>{u.vat_validated ? "✓ " : ""}{u.vat_number}</div> : <span style={{ color: "var(--dm)" }}>—</span>}
                    </div>
                    <Badge color={u.plan === "free_forever" ? "green" : u.plan === "suspended" ? "red" : "blue"} size="sm">
                      {u.plan === "free_forever" ? "🎁 Free ∞" : u.plan === "suspended" ? "Gesuspendeerd" : u.plan === "pending_payment" ? "⏳ Pending" : PLANS[u.plan]?.name || u.plan || "–"}
                    </Badge>
                    <span style={{ fontSize: 13 }}>{u.sites || 0} / {u.max_shops || 10}</span>
                    <Badge color={u.plan === "free_forever" ? "green" : u.status === "active" ? "green" : "amber"} size="sm">
                      {u.plan === "free_forever" ? "Free forever" : u.plan === "pending_payment" ? "In afwachting" : u.status === "active" ? "Actief" : "In afwachting"}
                    </Badge>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <Btn variant="ghost" size="sm" onClick={() => setEditUser(u)}>✏</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => loadInvoices(u)} title="Facturen">🧾</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => archiveUser(u)} title={u.archived ? "Dearchiveren" : "Archiveren"} style={{ color: u.archived ? "var(--gr)" : "var(--ac)" }}>{u.archived ? "↩" : "📦"}</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => deleteUser(u)} title="Permanent verwijderen" style={{ color: "var(--re)" }}>🗑</Btn>
                    </div>
                  </div>
                ))}
              </div>

              {/* Invoices panel */}
              {invoiceUser && (
                <Overlay open onClose={() => { setInvoiceUser(null); setUserInvoices([]); }} width={660} title={`Facturen: ${invoiceUser.full_name || invoiceUser.name || invoiceUser.email}`}>
                  <div style={{ padding: 20 }}>
                    {invoicesLoading ? (
                      <div style={{ color: "var(--mx)", fontSize: 13 }}>Laden...</div>
                    ) : userInvoices.length === 0 ? (
                      <div>
                        <div style={{ color: "var(--dm)", fontSize: 13, padding: "12px 0 20px" }}>Geen facturen gevonden voor deze gebruiker.</div>
                        {PLANS[invoiceUser?.plan] && invoiceUser.mollie_payment_id && (
                          <div style={{ background: "rgba(91,91,214,0.08)", border: "1px solid rgba(91,91,214,0.2)", borderRadius: "var(--rd)", padding: "12px 14px", fontSize: 13 }}>
                            <div style={{ fontWeight: 600, marginBottom: 6 }}>Factuur handmatig aanmaken</div>
                            <div style={{ color: "var(--dm)", fontSize: 12, marginBottom: 10 }}>
                              Er is een betaling gevonden maar nog geen factuur. Klik om alsnog een factuur aan te maken en te mailen.
                            </div>
                            <Btn variant="primary" size="sm" onClick={async () => {
                              setInvoicesLoading(true);
                              try {
                                const { data: { session } } = await supabase.auth.getSession();
                                const res = await fetch("/api/send-invoice", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
                                  body: JSON.stringify({
                                    user_id: invoiceUser.id,
                                    payment_id: invoiceUser.mollie_payment_id,
                                    amount: invoiceUser.price_total || "19.99",
                                  }),
                                });
                                const result = await res.json();
                                if (result.ok) {
                                  // Reload invoices
                                  const { data } = await supabase.from("invoices").select("*").eq("user_id", invoiceUser.id).order("issued_at", { ascending: false });
                                  setUserInvoices(data || []);
                                } else { alert("Fout: " + (result.error || "onbekend")); }
                              } catch (e) { alert("Fout: " + e.message); } finally { setInvoicesLoading(false); }
                            }}>📄 Factuur aanmaken + mailen</Btn>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "140px 100px 80px 80px 90px 80px", gap: 0, background: "var(--s2)", padding: "7px 12px", borderRadius: "var(--rd)", marginBottom: 4 }}>
                          {["Nummer", "Datum", "Excl.", "BTW", "Totaal", ""].map(h => (
                            <span key={h} style={{ fontSize: 11, color: "var(--dm)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</span>
                          ))}
                        </div>
                        {userInvoices.map(inv => (
                          <div key={inv.id} style={{ display: "grid", gridTemplateColumns: "140px 100px 80px 80px 90px 80px", gap: 0, padding: "9px 12px", background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", alignItems: "center" }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: "var(--pr-h)" }}>{inv.invoice_number}</span>
                            <span style={{ fontSize: 12, color: "var(--mx)" }}>{new Date(inv.issued_at).toLocaleDateString("nl-NL")}</span>
                            <span style={{ fontSize: 13 }}>€{parseFloat(inv.amount_excl_vat || 0).toFixed(2).replace(".", ",")}</span>
                            <span style={{ fontSize: 13 }}>€{parseFloat(inv.vat_amount || 0).toFixed(2).replace(".", ",")}</span>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>€{parseFloat(inv.amount || 0).toFixed(2).replace(".", ",")}</span>
                            <Btn variant="ghost" size="sm" onClick={async () => {
                              const { data: { session } } = await supabase.auth.getSession();
                              const win = window.open("about:blank", "_blank");
                              const res = await fetch(`/api/get-invoice?id=${inv.id}`, { headers: { "Authorization": `Bearer ${session?.access_token}` } });
                              const html = await res.text();
                              win.document.write(html); win.document.close();
                            }}>⬇ PDF</Btn>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Overlay>
              )}
            </div>
          );
        })()}

        {/* Payments */}
        {adminTab === "payments" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {paymentsLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "40px 0", color: "var(--mx)", fontSize: 13 }}>
                <div style={{ width: 18, height: 18, border: "2px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                Mollie data laden...
              </div>
            ) : paymentsData?.error ? (
              <div style={{ padding: 16, background: "var(--re-l)", borderRadius: "var(--rd)", border: "1px solid rgba(239,68,68,0.3)", fontSize: 13, color: "var(--re)" }}>
                {paymentsData.error === "Mollie API key not configured"
                  ? "⚠ Mollie API key nog niet ingesteld. Ga naar Platform → Mollie configuratie."
                  : `Fout bij laden: ${paymentsData.error}`}
              </div>
            ) : paymentsData ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                  {[
                    ["Maandelijks MRR", `€${parseFloat(paymentsData.stats?.mrr || 0).toFixed(2).replace(".", ",")}`, `${paymentsData.stats?.paidCount || 0} betalingen`],
                    ["Unieke klanten", paymentsData.stats?.totalCustomers || 0, "via Mollie"],
                    ["In afwachting", paymentsData.stats?.pendingCount || 0, "openstaande betalingen"],
                  ].map(([label, val, sub]) => (
                    <div key={label} style={{ padding: 16, background: "var(--s2)", borderRadius: "var(--rd-lg)", border: "1px solid var(--b1)" }}>
                      <div style={{ fontSize: 12, color: "var(--mx)", marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "var(--font-h)" }}>{val}</div>
                      <div style={{ fontSize: 11, color: "var(--dm)", marginTop: 2 }}>{sub}</div>
                    </div>
                  ))}
                </div>
                <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
                  <div style={{ padding: "8px 14px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", fontWeight: 600, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Recente betalingen (via Mollie)</span>
                    <Btn variant="ghost" size="sm" onClick={loadPayments}>↻ Verversen</Btn>
                  </div>
                  {(paymentsData.payments || []).length === 0 ? (
                    <div style={{ padding: "20px 14px", fontSize: 13, color: "var(--dm)" }}>Geen betalingen gevonden.</div>
                  ) : (paymentsData.payments || []).map((p, i) => {
                    const statusLabel = { paid: "Geslaagd", pending: "In afwachting", open: "Open", failed: "Mislukt", canceled: "Geannuleerd", expired: "Verlopen" }[p.status] || p.status;
                    const statusColor = { paid: "green", pending: "amber", open: "amber", failed: "red", canceled: "red", expired: "red" }[p.status] || "default";
                    return (
                      <div key={p.id || i} style={{ display: "grid", gridTemplateColumns: "110px 1fr 80px 110px", gap: 0, padding: "9px 14px", borderBottom: "1px solid var(--b1)", fontSize: 13, alignItems: "center" }}>
                        <span style={{ color: "var(--dm)" }}>{p.date}</span>
                        <span style={{ color: "var(--mx)", fontSize: 12 }}>{p.description}</span>
                        <span style={{ fontWeight: 600 }}>{p.amount}</span>
                        <Badge color={statusColor} size="sm">{statusLabel}</Badge>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* Tracking */}
        {adminTab === "tracking" && <TrackingSettings />}

        {/* Platform */}
        {adminTab === "platform" && <PlatformSettings />}
        {/* Logs */}
        {adminTab === "logs" && <SystemLogsPanel />}
      </div>

      {/* Per-user config overlay */}
      {editUser && (
        <Overlay open onClose={() => setEditUser(null)} width={580} title={`Configuratie: ${editUser.name || editUser.email || "gebruiker"}`}>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ padding: 12, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", display: "flex", gap: 16, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{editUser.email}</div>
                <div style={{ fontSize: 12, color: "var(--dm)" }}>{editUser.sites} shops verbonden</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <Badge color={editUser.plan === "free_forever" ? "green" : editUser.plan === "suspended" ? "red" : "blue"}>
                  {editUser.plan === "free_forever" ? "🎁 Free forever" : editUser.plan === "suspended" ? "Gesuspendeerd" : `${PLANS[editUser.plan]?.name || editUser.plan} €${PLANS[editUser.plan]?.monthly?.toFixed(2).replace(".", ",") || "—"}/mnd`}
                </Badge>
                <Badge color={editUser.plan === "suspended" ? "red" : editUser.status === "active" ? "green" : "amber"}>{editUser.plan === "suspended" ? "Gesuspendeerd" : editUser.status === "active" ? "Actief" : "In afwachting"}</Badge>
              </div>
            </div>
            <Field label="Plan">
              <Sel value={editUser.plan} onChange={e => setEditUser(u => ({ ...u, plan: e.target.value }))} options={[
  { value: "starter", label: "Starter – €7,99 / maand (2 shops, 500 producten)" },
  { value: "growth",  label: "Growth – €11,99 / maand (5 shops, 2000 producten)" },
  { value: "pro",     label: "Pro – €19,99 / maand (10 shops, 10k producten)" },
  { value: "free_forever", label: "Free forever (code: freeforever)" },
  { value: "suspended", label: "Gesuspendeerd" },
  { value: "pending_payment", label: "In afwachting betaling" },
]} />
            </Field>
            <div className="settings-2col">
              <Field label="Max shops (override)" hint={`Standaard plan: ${PLANS[editUser.plan]?.sites ?? "—"}`}>
                <Inp value={editUser.max_shops ?? (PLANS[editUser.plan]?.sites || 10)}
                  onChange={e => setEditUser(u => ({ ...u, max_shops: e.target.value }))} type="number" />
              </Field>
              <Field label="Max verbonden producten (override)" hint={`Standaard plan: ${(PLANS[editUser.plan]?.connected_products || 0).toLocaleString("nl-NL")}`}>
                <Inp value={editUser.max_connected_products ?? (PLANS[editUser.plan]?.connected_products || 500)}
                  onChange={e => setEditUser(u => ({ ...u, max_connected_products: e.target.value }))} type="number" />
              </Field>
            </div>
            <Divider />
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--mx)", textTransform: "uppercase", letterSpacing: "0.04em" }}>🤖 AI image pipeline (per gebruiker)</div>
            <div className="settings-2col">
              <Field label="Gemini model">
                <Sel value={editUser.gemini_model} onChange={e => setEditUser(u => ({ ...u, gemini_model: e.target.value }))} options={[{ value: "gemini-2.5-flash-image", label: "Nano Banana (snel & zuinig)" }, { value: "gemini-3.1-flash-image-preview", label: "Nano Banana 2 (hoge efficiëntie)" }, { value: "gemini-3-pro-image-preview", label: "Nano Banana Pro (professioneel)" }]} />
              </Field>
              <Field label="Max bestandsgrootte">
                <Inp value={editUser.img_max_kb} onChange={e => setEditUser(u => ({ ...u, img_max_kb: e.target.value }))} type="number" suffix="KB" />
              </Field>
              <Field label="Compressiekwaliteit">
                <Inp value={editUser.img_quality} onChange={e => setEditUser(u => ({ ...u, img_quality: e.target.value }))} type="number" suffix="%" />
              </Field>
              <Field label="Max breedte">
                <Inp value={editUser.img_max_width} onChange={e => setEditUser(u => ({ ...u, img_max_width: e.target.value }))} type="number" suffix="px" />
              </Field>
            </div>
            <Divider />
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--mx)", textTransform: "uppercase", letterSpacing: "0.04em" }}>🧠 AI Taxonomie Vertaling (per gebruiker)</div>
            <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>Functie inschakelen</div>
                  <div style={{ fontSize: 12, color: "var(--dm)", marginTop: 2 }}>Staat de gebruiker toe AI-taxonomievertaling te activeren vanuit zijn instellingen.</div>
                </div>
                <Tog checked={editUser.ai_taxonomy_enabled ?? false} onChange={v => setEditUser(u => ({ ...u, ai_taxonomy_enabled: v }))} />
              </div>
              {(editUser.ai_taxonomy_enabled) && <>
                <Divider my={4} />
                <Field label="Gemini model voor taxonomie" hint="Kan afwijken van image pipeline model">
                  <Sel value={editUser.ai_taxonomy_model ?? "gemini-2.0-flash"}
                    onChange={e => setEditUser(u => ({ ...u, ai_taxonomy_model: e.target.value }))}
                    options={[
                      { value: "gemini-2.0-flash-lite", label: "Flash Lite – zuinig, geschikt voor eenvoudige vertalingen" },
                      { value: "gemini-2.0-flash",      label: "Flash – gebalanceerd (aanbevolen)" },
                      { value: "gemini-2.5-pro",        label: "2.5 Pro – hoogste kwaliteit, meer tokens" },
                    ]} />
                </Field>
                <Field label="Confidence drempel" hint="Vertalingen onder deze score vereisen handmatige review">
                  <Inp value={editUser.ai_taxonomy_threshold ?? "80"} onChange={e => setEditUser(u => ({ ...u, ai_taxonomy_threshold: e.target.value }))} type="number" suffix="%" style={{ maxWidth: 120 }} />
                </Field>
                <div style={{ padding: "8px 10px", background: "var(--pr-l)", borderRadius: "var(--rd)", border: "1px solid rgba(91,91,214,0.2)", fontSize: 12, color: "var(--mx)" }}>
                  💡 De gebruiker kan de functie zelf aan/uitzetten via <strong style={{ color: "var(--tx)" }}>Instellingen → AI Vertaling</strong>. Dit admin-veld bepaalt of de optie überhaupt beschikbaar is voor zijn account.
                </div>
              </>}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8 }}>
              <Btn variant="secondary" onClick={() => setEditUser(null)}>Annuleren</Btn>
              <Btn variant="primary" onClick={() => saveUser(editUser)}>Opslaan</Btn>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
};

// ─── AI Translation Cache Viewer ─────────────────────────────────────────────
const AiTranslationSettings = ({ enabled, onToggleEnabled, locked = false }) => {
  const [cache, setCache] = useState([]);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [filterLocale, setFilterLocale] = useState("all");
  const [filterField, setFilterField] = useState("all");
  const [testOpen, setTestOpen] = useState(false);
  const [testSource, setTestSource] = useState("Bamboehaag");
  const [testSrcLocale, setTestSrcLocale] = useState("nl_NL");
  const [testTgtLocale, setTestTgtLocale] = useState("fr_BE");
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState(null);

  // Load real translation cache from Supabase
  useEffect(() => {
    if (!enabled) return;
    const load = async () => {
      setCacheLoading(true);
      try {
        const { data, error } = await supabase
          .from("ai_translation_cache")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200);
        if (!error && data) setCache(data);
      } catch {}
      finally { setCacheLoading(false); }
    };
    load();
  }, [enabled]);

  const filteredCache = cache.filter(e =>
    (filterLocale === "all" || e.target_locale === filterLocale) &&
    (filterField === "all" || e.field === filterField)
  );

  const runTest = async () => {
    setTestLoading(true);
    setTestResult(null);
    setTestError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/ai-translate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ term: testSource, source_locale: testSrcLocale, target_locale: testTgtLocale, field: "category" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Vertaling mislukt");
      setTestResult(data);
      // Refresh cache after test
      const { data: cacheData } = await supabase.from("ai_translation_cache").select("*").order("created_at", { ascending: false }).limit(200);
      if (cacheData) setCache(cacheData);
    } catch (e) {
      setTestError(e.message);
    } finally {
      setTestLoading(false);
    }
  };

  const clearEntry = async (entry) => {
    setCache(c => c.filter(e => e.id !== entry.id));
    if (entry.id) {
      await supabase.from("ai_translation_cache").delete().eq("id", entry.id);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="fade-in">

      {/* Locked state */}
      {locked && (
        <div style={{ padding: 20, background: "var(--s2)", borderRadius: "var(--rd-lg)", border: "1px solid var(--b1)", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>AI Taxonomie Vertaling niet beschikbaar</div>
          <div style={{ fontSize: 13, color: "var(--mx)", maxWidth: 420, margin: "0 auto" }}>
            Deze functie is nog niet ingeschakeld voor jouw account. Neem contact op met de beheerder om toegang aan te vragen.
          </div>
        </div>
      )}

      {!locked && (<>
      <div style={{ padding: 20, background: enabled ? "linear-gradient(135deg, rgba(91,91,214,0.12), var(--s2))" : "var(--s2)", border: `1px solid ${enabled ? "rgba(91,91,214,0.4)" : "var(--b1)"}`, borderRadius: "var(--rd-lg)", transition: "all 0.3s" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 20 }}>🤖</span>
              <span style={{ fontWeight: 700, fontSize: 15, fontFamily: "var(--font-h)" }}>AI Taxonomie Vertaling</span>
              {enabled && <Badge color="green">Actief</Badge>}
            </div>
            <p style={{ fontSize: 13, color: "var(--mx)", lineHeight: 1.6, maxWidth: 560, margin: 0 }}>
              Wanneer je een categorie, attribuutwaarde of tag wijzigt op een verbonden product, detecteert de AI automatisch de overeenkomstige term in de doeltaal. Resultaten worden gecached zodat elke combinatie slechts eenmalig de API aanroept.
            </p>
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[["Categorieën", "📂"], ["Attribuutwaarden", "🏷"], ["Tags", "🔖"], ["Toekomstig: producttitels", "✨"]].map(([f, icon]) => (
                <span key={f} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 20, background: "var(--s3)", border: "1px solid var(--b1)", fontSize: 11, color: "var(--mx)" }}>
                  {icon} {f}
                </span>
              ))}
            </div>
          </div>
          <Tog checked={enabled} onChange={onToggleEnabled} />
        </div>
      </div>

      {!enabled && (
        <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", fontSize: 13, color: "var(--dm)", textAlign: "center" }}>
          Schakel AI Taxonomie Vertaling in om de instellingen en cache te bekijken.
        </div>
      )}

      {enabled && (<>

        {/* How it works */}
        <div style={{ padding: 14, background: "var(--pr-l)", borderRadius: "var(--rd)", border: "1px solid rgba(91,91,214,0.2)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--pr-h)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Hoe werkt het?</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {[
              ["1. Wijziging detecteren", "Je past een categorie aan op Shop A (nl_NL): Bamboehaag wordt Bamboe & Grassen."],
              ["2. AI-vertaling opvragen", "Gemini ontvangt: bronterm, bronlocale, doellocale en de volledige taxonomielijst van de doelshop."],
              ["3. Beste match koppelen", "De AI kiest de dichtstbijzijnde bestaande term in de doelshop of stelt een nieuwe voor. Resultaat wordt gecached."],
            ].map(([title, desc]) => (
              <div key={title} style={{ padding: "10px 12px", background: "rgba(91,91,214,0.08)", borderRadius: "var(--rd)", border: "1px solid rgba(91,91,214,0.15)" }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: "var(--pr-h)", marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 12, color: "var(--mx)", lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Behaviour settings */}
        <div style={{ padding: 16, background: "var(--s2)", borderRadius: "var(--rd-lg)", border: "1px solid var(--b1)" }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>⚙ Gedrag</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Chk checked={true} onChange={() => {}} label="Alleen exact overeenkomende bestaande termen gebruiken — stel geen nieuwe termen voor" />
            <Chk checked={false} onChange={() => {}} label="Altijd bevestiging vragen vóór een vertaling wordt toegepast" />
            <Chk checked={true} onChange={() => {}} label="Vertalingen cachen per term-paar (aanbevolen — bespaart API-kosten)" />
            <Chk checked={false} onChange={() => {}} label="Vertalingen ook toepassen op productomschrijvingen (experimenteel)" />
            <div style={{ paddingTop: 6 }}>
              <Field label="Minimale betrouwbaarheidsdrempel" hint="Vertalingen onder dit percentage worden genegeerd en vragen om handmatige keuze">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="range" min="50" max="100" defaultValue="80" style={{ flex: 1, accentColor: "var(--pr)" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, minWidth: 36 }}>80%</span>
                </div>
              </Field>
            </div>
          </div>
        </div>

        {/* Test tool */}
        <div style={{ padding: 16, background: "var(--s2)", borderRadius: "var(--rd-lg)", border: "1px solid var(--b1)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>🧪 Vertaling testen</div>
            <Btn variant="ghost" size="sm" onClick={() => setTestOpen(v => !v)}>{testOpen ? "Inklappen ▲" : "Uitklappen ▼"}</Btn>
          </div>
          {testOpen && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 120px", gap: 8, alignItems: "end" }} className="fade-in">
              <Field label="Term om te vertalen">
                <Inp value={testSource} onChange={e => setTestSource(e.target.value)} placeholder="bijv. Bamboehaag" />
              </Field>
              <Field label="Van">
                <Sel value={testSrcLocale} onChange={e => setTestSrcLocale(e.target.value)} options={[{ value: "nl_NL", label: "nl_NL" }, { value: "fr_BE", label: "fr_BE" }, { value: "nl_BE", label: "nl_BE" }]} />
              </Field>
              <Field label="Naar">
                <Sel value={testTgtLocale} onChange={e => setTestTgtLocale(e.target.value)} options={[{ value: "fr_BE", label: "fr_BE" }, { value: "nl_BE", label: "nl_BE" }, { value: "nl_NL", label: "nl_NL" }]} />
              </Field>
              <Btn variant="primary" onClick={runTest} disabled={testLoading} icon={testLoading ? <span className="spin">↻</span> : "→"}>
                {testLoading ? "Bezig..." : "Vertalen"}
              </Btn>
              {testResult && (
                <div style={{ gridColumn: "1/-1", padding: 12, background: testResult.error ? "rgba(239,68,68,0.08)" : "var(--s3)", borderRadius: "var(--rd)", border: `1px solid ${testResult.error ? "rgba(239,68,68,0.3)" : "var(--b2)"}`, display: "flex", gap: 16, alignItems: "center" }} className="slide-up">
                  {testResult.error ? (
                    <div style={{ fontSize: 13, color: "var(--re)" }}>⚠ {testResult.error}</div>
                  ) : <>
                    <div>
                      <span style={{ fontSize: 11, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Resultaat</span>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--gr)", marginTop: 2 }}>{testResult.term}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Betrouwbaarheid</span>
                      <div style={{ fontSize: 15, fontWeight: 700, color: testResult.confidence >= 0.9 ? "var(--gr)" : "var(--ac)", marginTop: 2 }}>{Math.round((testResult.confidence || 0) * 100)}%</div>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Model</span>
                      <div style={{ fontSize: 12, color: "var(--mx)", marginTop: 2 }}>{testResult.model}</div>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                      <Badge color={testResult.cached ? "amber" : "blue"}>{testResult.cached ? "📦 Uit cache" : "✨ Nieuw gegenereerd"}</Badge>
                      {testResult.is_existing && <Badge color="green" size="sm">Bestaande term</Badge>}
                    </div>
                  </>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Translation cache */}
        <div style={{ padding: 16, background: "var(--s2)", borderRadius: "var(--rd-lg)", border: "1px solid var(--b1)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>📦 Vertaalcache <span style={{ fontSize: 12, color: "var(--dm)", fontWeight: 400 }}>({filteredCache.length} van {cache.length} items)</span></div>
            <div style={{ display: "flex", gap: 6 }}>
              <Sel value={filterLocale} onChange={e => setFilterLocale(e.target.value)} options={[{ value: "all", label: "Alle doellocales" }, { value: "fr_BE", label: "→ fr_BE" }, { value: "nl_BE", label: "→ nl_BE" }]} style={{ fontSize: 12 }} />
              <Sel value={filterField} onChange={e => setFilterField(e.target.value)} options={[{ value: "all", label: "Alle veldtypen" }, { value: "category", label: "Categorieën" }, { value: "attribute", label: "Attributen" }, { value: "tag", label: "Tags" }]} style={{ fontSize: 12 }} />
              <Btn variant="danger" size="sm" onClick={async () => {
                  if (!confirm("Weet je zeker dat je de volledige vertaalcache wilt wissen?")) return;
                  setCache([]);
                  const { data: { session } } = await supabase.auth.getSession();
                  // Delete all cache entries for this user via Supabase
                  await supabase.from("ai_translation_cache").delete().neq("id", 0);
                }}>Cache wissen</Btn>
            </div>
          </div>
          <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd)", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "90px 80px 1fr 1fr 70px 50px 24px", gap: 0, background: "var(--s3)", padding: "6px 12px", borderBottom: "1px solid var(--b1)" }}>
              {["Type", "Richting", "Bronterm", "Doelterm", "Vertrouwen", "Gebruikt", ""].map((h, i) => (
                <span key={i} style={{ fontSize: 10, color: "var(--dm)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
              ))}
            </div>
            {cacheLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 20, justifyContent: "center", color: "var(--mx)", fontSize: 13 }}>
                <div style={{ width: 14, height: 14, border: "2px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Cache laden...
              </div>
            ) : filteredCache.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--dm)", fontSize: 13 }}>Geen gecachede vertalingen. Gebruik de testknop of sync een product om vertalingen te genereren.</div>
            ) : null}
            {filteredCache.map((e, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 80px 1fr 1fr 70px 50px 24px", gap: 0, padding: "8px 12px", borderBottom: "1px solid var(--b1)", alignItems: "center", fontSize: 12 }}>
                <Badge color={e.field === "category" ? "blue" : "default"} size="sm">{e.field === "category" ? "categorie" : "attribuut"}</Badge>
                <span style={{ color: "var(--dm)", fontSize: 11 }}>{e.source_locale.split("_")[1]} → {e.target_locale.split("_")[1]}</span>
                <span style={{ color: "var(--mx)" }}>{e.source_term}</span>
                <span style={{ fontWeight: 500 }}>{e.target_term}</span>
                <span style={{ color: e.confidence >= 0.95 ? "var(--gr)" : e.confidence >= 0.80 ? "var(--ac)" : "var(--re)", fontWeight: 600 }}>{Math.round(e.confidence * 100)}%</span>
                <span style={{ color: "var(--dm)" }}>{e.used}×</span>
                <button onClick={() => clearEntry(e)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dm)", fontSize: 13, padding: 0 }} title="Verwijder uit cache">×</button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--dm)" }}>
            Gecachede vertalingen worden hergebruikt zonder extra API-aanroepen. Verwijder een regel om een hervertaling te forceren.
          </div>
        </div>

        {/* Pending / unmatched */}
        <div style={{ padding: 16, background: "var(--s2)", borderRadius: "var(--rd-lg)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--ac)" }}>⚠</span> Handmatige review vereist
            <Badge color="amber">1</Badge>
          </div>
          <div style={{ padding: "10px 12px", background: "var(--ac-l)", borderRadius: "var(--rd)", border: "1px solid rgba(245,158,11,0.2)", display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 2 }}>nl_NL → fr_BE · categorie</div>
              <div style={{ fontWeight: 600 }}>"Bamboe & Grassen"</div>
              <div style={{ fontSize: 12, color: "var(--mx)", marginTop: 2 }}>Beste suggestie: <strong>"Bambou &amp; Graminées"</strong> (72%) — onder drempel</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn variant="success" size="sm">✓ Accepteren</Btn>
              <Btn variant="secondary" size="sm">Aanpassen</Btn>
              <Btn variant="ghost" size="sm">Overslaan</Btn>
            </div>
          </div>
        </div>

      </>)}

      </>)}
    </div>
  );
};
// ─── Billing Tab Component ─────────────────────────────────────────────────────
const BillingTab = ({ userProfile }) => {
  const isFreeForever = userProfile?.plan === "free_forever";
  const planKey = userProfile?.plan && PLANS[userProfile.plan] ? userProfile.plan : null;
  const currentPlan = planKey ? PLANS[planKey] : null;
  const billingPeriod = userProfile?.billing_period || "monthly";
  const isPending = !isFreeForever && !userProfile?.mollie_customer_id && userProfile?.plan !== "pending_payment";
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [invoices, setInvoices] = useState({}); // keyed by payment_id

  useEffect(() => {
    if (isFreeForever || !userProfile?.id) return;
    // Load invoices from Supabase for download links
    supabase.from("invoices").select("id, invoice_number, payment_id, issued_at").eq("user_id", userProfile.id).order("issued_at", { ascending: false })
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(inv => {
          if (inv.payment_id) map[inv.payment_id] = inv;
          // Also store by invoice id for fallback lookup
          map[`inv_${inv.id}`] = inv;
        });
        // If there are invoices without payment_id, attach them to unmatched paid payments later via __all
        map.__all = data || [];
        setInvoices(map);
      });
  }, [userProfile?.id]);

  useEffect(() => {
    if (isFreeForever || !userProfile?.id) return;
    const load = async () => {
      setPaymentsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/mollie-payments", { headers: { "Authorization": `Bearer ${session?.access_token}` } });
        const data = await res.json();
        setPayments(data.payments || []);
      } catch {} finally { setPaymentsLoading(false); }
    };
    load();
  }, [userProfile?.id, isFreeForever]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ padding: 20, background: isFreeForever ? "linear-gradient(135deg,rgba(34,197,94,0.08),var(--s2))" : "linear-gradient(135deg, var(--pr-l), var(--s2))", borderRadius: "var(--rd-lg)", border: isFreeForever ? "1px solid rgba(34,197,94,0.3)" : "1px solid var(--b2)" }}>
        <div style={{ fontSize: 13, color: "var(--mx)", marginBottom: 4 }}>Huidig abonnement</div>
        {isFreeForever ? (
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-h)", color: "var(--gr)" }}>Gratis <span style={{ fontSize: 14, fontWeight: 400, color: "var(--mx)" }}>voor altijd</span></div>
        ) : currentPlan ? (
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-h)", color: "var(--pr-h)" }}>
              {currentPlan.name}
              <span style={{ fontSize: 16, fontWeight: 400, color: "var(--mx)", marginLeft: 10 }}>€{getPlanPrice(planKey, billingPeriod).toFixed(2).replace(".", ",")} / maand</span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-h)", color: "var(--pr-h)" }}>€{userProfile?.price_total || "19,99"} <span style={{ fontSize: 14, fontWeight: 400, color: "var(--mx)" }}>/ maand</span></div>
        )}
        {currentPlan && (
          <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12, color: "var(--mx)", flexWrap: "wrap" }}>
            <span>🏪 Tot {userProfile?.max_shops || currentPlan.sites} shops</span>
            <span>🔗 {(userProfile?.max_connected_products || currentPlan.connected_products).toLocaleString("nl-NL")} verbonden producten
              {userProfile?.max_connected_products && userProfile.max_connected_products !== currentPlan.connected_products
                ? <span style={{ marginLeft: 4, fontSize: 10, color: "var(--pr-h)", fontWeight: 700 }}>✦ aangepast</span>
                : null}
            </span>
            <span>📅 {billingPeriod === "annual" ? "Jaarlijks" : "Maandelijks"}</span>
          </div>
        )}
        {isFreeForever
          ? <Badge color="green" style={{ marginTop: 8, display: "inline-flex" }}>✓ Free forever account</Badge>
          : userProfile?.plan === "pending_payment"
            ? <Badge color="amber" style={{ marginTop: 8, display: "inline-flex" }}>⏳ Betaling in afwachting</Badge>
            : currentPlan
              ? <Badge color="blue" style={{ marginTop: 8, display: "inline-flex" }}>✓ {currentPlan.name} · actief via Mollie</Badge>
              : <Badge color="amber" style={{ marginTop: 8, display: "inline-flex" }}>⚠ Onbekend plan</Badge>
        }
      </div>
      {!isFreeForever && (
        <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Betalingsgeschiedenis</div>
          {paymentsLoading ? (
            <div style={{ fontSize: 13, color: "var(--dm)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 14, height: 14, border: "2px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              Laden...
            </div>
          ) : payments.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--dm)" }}>Nog geen betalingen gevonden.</div>
          ) : payments.map((p, i) => {
            const statusLabel = { paid: "Geslaagd", pending: "In afwachting", open: "Open", failed: "Mislukt", canceled: "Geannuleerd", expired: "Verlopen" }[p.status] || p.status;
            const statusColor = { paid: "green", pending: "amber", open: "amber", failed: "red", canceled: "red", expired: "red" }[p.status] || "default";
            return (
              <div key={p.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: i < payments.length - 1 ? "1px solid var(--b1)" : "none" }}>
                <span style={{ fontSize: 12, color: "var(--dm)" }}>{p.date}</span>
                <span style={{ fontSize: 12, color: "var(--mx)", flex: 1, marginLeft: 12 }}>{p.description}</span>
                <span style={{ fontWeight: 600, fontSize: 13, marginRight: 12 }}>{p.amount}</span>
                <Badge color={statusColor} size="sm">{statusLabel}</Badge>
                {p.status === "paid" && (
                  <button
                    onClick={async () => {
                      const { data: { session } } = await supabase.auth.getSession();
                      const win = window.open("about:blank", "_blank");
                      // Always try payment_id first; API creates invoice on demand if missing
                      const param = p.id ? `payment_id=${p.id}` : invoices.__all?.[0]?.id ? `id=${invoices.__all[0].id}` : null;
                      if (!param) { win.close(); return; }
                      const res = await fetch(`/api/get-invoice?${param}`, { headers: { "Authorization": `Bearer ${session?.access_token}` } });
                      if (!res.ok) { win.document.write("<p>Factuur niet beschikbaar. Probeer het later opnieuw.</p>"); win.document.close(); return; }
                      const html = await res.text();
                      win.document.write(html); win.document.close();
                    }}
                    style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--pr-h)", background: "none", padding: "3px 8px", border: "1px solid var(--pr)", borderRadius: "var(--rd)", whiteSpace: "nowrap", cursor: "pointer" }}
                  >
                    ⬇ Factuur
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!isFreeForever && <Btn variant="danger" size="sm" style={{ alignSelf: "flex-start" }}>Abonnement opzeggen</Btn>}
    </div>
  );
};

const SettingsView = ({ user, shops = [], onShopAdded, onShopUpdated, onShopDeleted }) => {
  const [settingsTab, setSettingsTab] = useState("sites");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const aiTaxonomyUnlocked = userProfile?.ai_taxonomy_enabled ?? false;
  const [profileForm, setProfileForm] = useState({ name: user?.name || "", password: "", business_name: "", country: "NL", vat_number: "", vat_validated: false, address_street: "", address_city: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [addShopOpen, setAddShopOpen] = useState(false);
  const [newShop, setNewShop] = useState({ name: "", site_url: "", locale: "nl_NL", flag: "🌐", consumer_key: "", consumer_secret: "" });
  const [testingShop, setTestingShop] = useState(null); // shopId being tested
  const [testResults, setTestResults] = useState({}); // {shopId: {ok, wc_version, ...}}
  const [savingShop, setSavingShop] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("user_profiles").select("*").eq("id", user.id).single()
      .then(({ data }) => {
        if (data) {
          setUserProfile(data);
          setAiEnabled(data.ai_taxonomy_enabled || false);
          setProfileForm(f => ({
            ...f,
            name: data.full_name || user?.name || "",
            business_name: data.business_name || "",
            country: data.country || "NL",
            vat_number: data.vat_number || "",
            vat_validated: data.vat_validated || false,
            address_street: data.address_street || "",
            address_city: data.address_city || "",
          }));
          // Notify App if payment not completed
          if (data.plan === "pending_payment" && onPaymentWall) {
            onPaymentWall(true);
          }
        }
      });
  }, [user?.id]);

  const testConnection = async (shop) => {
    setTestingShop(shop.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/woo-test", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ site_url: shop.site_url, consumer_key: shop.consumer_key, consumer_secret: shop.consumer_secret })
      });
      const result = await res.json();
      setTestResults(r => ({ ...r, [shop.id]: result }));
      if (result.ok) {
        // Detect WQM plugin from system status
        const statusRes = await fetch("/api/woo", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ shop_id: shop.id, endpoint: "system_status", method: "GET" })
        });
        const status = await statusRes.json();
        const activePlugins = status?.active_plugins || [];
        const hasWqm = activePlugins.some(p => p.plugin?.includes("quantity-manager") || p.name?.toLowerCase().includes("quantity manager"));
        const updatedShop = { ...shop, wc_version: result.wc_version, wp_version: result.wp_version, has_wqm: hasWqm, last_connected: new Date().toISOString() };
        await supabase.from("shops").update({ wc_version: result.wc_version, wp_version: result.wp_version, has_wqm: hasWqm, last_connected: new Date().toISOString() }).eq("id", shop.id);
        onShopUpdated?.(updatedShop);
      }
    } catch (e) {
      setTestResults(r => ({ ...r, [shop.id]: { ok: false, error: e.message } }));
    } finally {
      setTestingShop(null); }
  };

  const handleAddShop = async () => {
    if (!newShop.name || !newShop.site_url || !newShop.consumer_key || !newShop.consumer_secret) return alert("Vul alle verplichte velden in");
    setSavingShop(true);
    try {
      const { data, error } = await supabase.from("shops").insert([{ ...newShop, user_id: user.id }]).select().single();
      if (error) throw error;
      onShopAdded?.(data);
      setAddShopOpen(false);
      setNewShop({ name: "", site_url: "", locale: "nl_NL", flag: "🌐", consumer_key: "", consumer_secret: "" });
    } catch (e) { alert("Shop toevoegen mislukt: " + e.message); }
    finally { setSavingShop(false); }
  };

  const handleDeleteShop = async (shopId) => {
    if (!confirm("Weet je zeker dat je deze shop wil verwijderen?")) return;
    await supabase.from("shops").delete().eq("id", shopId);
    onShopDeleted?.(shopId);
  };

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    try {
      if (profileForm.password) {
        await supabase.auth.updateUser({ password: profileForm.password });
      }
      const vatInfo = getVatInfo(profileForm.country, profileForm.vat_validated);
      await supabase.from("user_profiles").update({
        full_name: profileForm.name,
        business_name: profileForm.business_name,
        country: profileForm.country,
        vat_number: profileForm.vat_number,
        vat_validated: profileForm.vat_validated,
        address_street: profileForm.address_street,
        address_city: profileForm.address_city,
        vat_rate: vatInfo.rate,
        price_excl_vat: vatInfo.excl,
        price_total: vatInfo.total,
      }).eq("id", user.id);
    } catch (e) { alert("Opslaan mislukt: " + e.message); }
    finally { setProfileSaving(false); }
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Instellingen</h2>
      <Tabs tabs={[{ id: "sites", label: "🏪 Mijn shops" }, { id: "ai", label: "🤖 AI Vertaling" }, { id: "billing", label: "💳 Abonnement" }, { id: "profile", label: "👤 Profiel" }, { id: "support", label: "💬 Support" }]} active={settingsTab} onChange={setSettingsTab} />
      <div style={{ marginTop: 20 }}>
        {settingsTab === "sites" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", fontSize: 13, color: "var(--mx)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
              <div>
                <div style={{ fontWeight: 600, color: "var(--tx)", marginBottom: 4 }}>Verbinden via WooCommerce REST API</div>
                <div>Genereer een Consumer Key &amp; Secret in <strong style={{ color: "var(--tx)" }}>WooCommerce → Instellingen → Geavanceerd → REST API</strong> met <em>lees/schrijf</em>-rechten. Of installeer onze companion plugin voor automatische verbinding.</div>
              </div>
              <a href="/woosyncshop-companion.zip" download style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "var(--s3)", border: "1px solid var(--b2)", borderRadius: "var(--rd)", color: "var(--tx)", fontSize: 12, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
                🔌 Download plugin
              </a>
            </div>
            {shops.map(shop => {
              const tr = testResults[shop.id];
              const isTesting = testingShop === shop.id;
              return (
                <div key={shop.id} style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", background: "var(--s2)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{shop.flag || "🌐"}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{shop.name}</div>
                      <div style={{ fontSize: 11, color: "var(--dm)" }}>{shop.locale} · {shop.site_url?.replace("https://","").replace("http://","")}</div>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                      {shop.last_connected && <Badge color="green">✓ Verbonden</Badge>}
                      {shop.has_wqm && <Badge color="blue">WQM</Badge>}
                      <Btn variant="ghost" size="sm" onClick={() => handleDeleteShop(shop.id)}>🗑</Btn>
                    </div>
                  </div>
                  <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Field label="Site URL"><Inp value={shop.site_url || ""} onChange={() => {}} readOnly /></Field>
                    <Field label="Taal / Locale"><Inp value={shop.locale || ""} onChange={() => {}} readOnly /></Field>
                    <Field label="Consumer Key"><Inp value="ck_••••••••••••••••" onChange={() => {}} type="password" readOnly /></Field>
                    <Field label="Consumer Secret"><Inp value="cs_••••••••••••••••" onChange={() => {}} type="password" readOnly /></Field>
                    <div style={{ gridColumn: "1/-1", display: "flex", gap: 8, alignItems: "center" }}>
                      {tr && (
                        tr.ok
                          ? <><div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--gr)" }} />
                            <span style={{ fontSize: 12, color: "var(--mx)" }}>OK · WooCommerce {tr.wc_version} · WordPress {tr.wp_version}{shop.has_wqm ? " · WQM actief" : ""}</span></>
                          : <><div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--re)" }} />
                            <span style={{ fontSize: 12, color: "var(--re)" }}>Verbinding mislukt: {tr.error}</span></>
                      )}
                      <Btn variant="secondary" size="sm" style={{ marginLeft: "auto" }} onClick={() => testConnection(shop)} disabled={isTesting}>
                        {isTesting ? "Testen..." : "Verbinding testen"}
                      </Btn>
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Add shop form */}
            {addShopOpen ? (
              <div style={{ border: "1px solid var(--pr-l)", borderRadius: "var(--rd-lg)", padding: 20, background: "var(--s2)" }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Nieuwe shop toevoegen</div>
                <div className="settings-2col">
                  <Field label="Naam" required><Inp value={newShop.name} onChange={e => setNewShop(s => ({ ...s, name: e.target.value }))} placeholder="bijv. HaagDirect NL" /></Field>
                  <Field label="Site URL" required><Inp value={newShop.site_url} onChange={e => setNewShop(s => ({ ...s, site_url: e.target.value.replace(/\/$/, "") }))} placeholder="https://mijnshop.nl" /></Field>
                  <Field label="Taal / Locale" required>
                    <Sel value={newShop.locale} onChange={v => {
                      const autoFlag = LOCALE_FLAG_MAP[v] || "🌐";
                      setNewShop(s => ({ ...s, locale: v, flag: autoFlag, flagShape: s.flagShape || "emoji" }));
                    }} options={LOCALE_OPTIONS} />
                  </Field>
                  <Field label="Vlag">
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {/* Shape selector */}
                      {FLAG_SHAPES.map(shape => (
                        <button key={shape} onClick={() => setNewShop(s => ({ ...s, flagShape: shape }))}
                          style={{ padding: "4px 10px", borderRadius: "var(--rd)", border: `1px solid ${(newShop.flagShape||"emoji") === shape ? "var(--pr)" : "var(--b1)"}`, background: (newShop.flagShape||"emoji") === shape ? "var(--pr-l)" : "var(--s2)", cursor: "pointer", fontSize: 12, color: (newShop.flagShape||"emoji") === shape ? "var(--pr-h)" : "var(--mx)", fontWeight: (newShop.flagShape||"emoji") === shape ? 700 : 400 }}>
                          {shape === "emoji" ? "🏳️ Emoji" : shape === "rect" ? "▬ Rechthoek" : "⬤ Cirkel"}
                        </button>
                      ))}
                    </div>
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontSize: (newShop.flagShape||"emoji") === "emoji" ? 28 : 0, lineHeight: 1 }}>{(newShop.flagShape||"emoji") === "emoji" ? (newShop.flag || LOCALE_FLAG_MAP[newShop.locale] || "🌐") : null}</div>
                      {(newShop.flagShape||"emoji") !== "emoji" && (() => {
                        const flagEmoji = newShop.flag || LOCALE_FLAG_MAP[newShop.locale] || "🌐";
                        const shape = newShop.flagShape || "emoji";
                        return <div style={{ width: shape === "rect" ? 32 : 24, height: shape === "rect" ? 20 : 24, borderRadius: shape === "circle" ? "50%" : 4, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: shape === "rect" ? 20 : 18, background: "var(--s3)", border: "1px solid var(--b1)" }}>{flagEmoji}</div>;
                      })()}
                      <Inp value={newShop.flag} onChange={e => setNewShop(s => ({ ...s, flag: e.target.value }))} placeholder={LOCALE_FLAG_MAP[newShop.locale] || "🌐"} style={{ maxWidth: 80 }} />
                    </div>
                  </Field>
                  <Field label="Consumer Key" required><Inp value={newShop.consumer_key} onChange={e => setNewShop(s => ({ ...s, consumer_key: e.target.value }))} placeholder="ck_..." type="password" /></Field>
                  <Field label="Consumer Secret" required><Inp value={newShop.consumer_secret} onChange={e => setNewShop(s => ({ ...s, consumer_secret: e.target.value }))} placeholder="cs_..." type="password" /></Field>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <Btn variant="primary" onClick={handleAddShop} disabled={savingShop}>{savingShop ? "Opslaan..." : "Shop opslaan"}</Btn>
                  <Btn variant="ghost" onClick={() => setAddShopOpen(false)}>Annuleren</Btn>
                </div>
              </div>
            ) : (
              <Btn variant="primary" icon="+" onClick={() => setAddShopOpen(true)}>Shop toevoegen</Btn>
            )}
          </div>
        )}
        {settingsTab === "ai" && (
          <AiTranslationSettings enabled={aiEnabled} onToggleEnabled={setAiEnabled} locked={!aiTaxonomyUnlocked} />
        )}
        {settingsTab === "billing" && (
          <BillingTab userProfile={userProfile} />
        )}
        {settingsTab === "profile" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
            <div className="settings-2col">
              <Field label="Naam"><Inp value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} /></Field>
              <Field label="Bedrijfsnaam (optioneel)"><Inp value={profileForm.business_name || ""} onChange={e => setProfileForm(f => ({ ...f, business_name: e.target.value }))} placeholder="Jouw bedrijf B.V." /></Field>
            </div>
            <Field label="E-mailadres"><Inp value={user?.email || ""} onChange={() => {}} type="email" readOnly style={{ opacity: 0.6 }} /></Field>
            <div className="settings-2col">
              <Field label="Straat + huisnummer"><Inp value={profileForm.address_street || ""} onChange={e => setProfileForm(f => ({ ...f, address_street: e.target.value }))} placeholder="Voorbeeldstraat 1" /></Field>
              <Field label="Postcode + Stad"><Inp value={profileForm.address_city || ""} onChange={e => setProfileForm(f => ({ ...f, address_city: e.target.value }))} placeholder="1234 AB Amsterdam" /></Field>
            </div>
            <Field label="Land">
              <select value={profileForm.country || "NL"} onChange={e => setProfileForm(f => ({ ...f, country: e.target.value, vat_number: "" }))}
                style={{ width: "100%", padding: "9px 12px", background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: "var(--rd)", color: "var(--tx)", fontSize: 13 }}>
                {ALL_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </Field>
            {EU_COUNTRIES.some(c => c.code === (profileForm.country || "NL")) && (profileForm.country || "NL") !== "NL" && (
              <Field label="BTW-nummer (voor btw-vrijstelling)">
                <div style={{ display: "flex", gap: 8 }}>
                  <Inp value={profileForm.vat_number || ""} onChange={e => setProfileForm(f => ({ ...f, vat_number: e.target.value, vat_validated: false }))} placeholder={`${profileForm.country}XXXXXXXXXX`} style={{ flex: 1 }} />
                  <Btn variant="secondary" size="sm" onClick={async () => {
                    if (!profileForm.vat_number) return;
                    const res = await fetch("/api/vies-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vat_number: profileForm.vat_number }) });
                    const d = await res.json();
                    if (d.valid) setProfileForm(f => ({ ...f, vat_validated: true }));
                    else alert(d.retry ? "VIES tijdelijk niet beschikbaar, probeer later opnieuw." : "BTW-nummer ongeldig of niet gevonden in VIES.");
                  }}>Verifiëren</Btn>
                </div>
                {profileForm.vat_validated && <div style={{ fontSize: 12, color: "var(--gr)", marginTop: 4 }}>✓ BTW-nummer geverifieerd — btw-vrijstelling van toepassing</div>}
              </Field>
            )}
            <div style={{ borderTop: "1px solid var(--b1)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Nieuw wachtwoord" hint="Laat leeg om het huidig wachtwoord te bewaren"><Inp value={profileForm.password} onChange={e => setProfileForm(f => ({ ...f, password: e.target.value }))} type="password" placeholder="••••••••" /></Field>
            </div>
            <Btn variant="primary" style={{ alignSelf: "flex-start" }} onClick={handleSaveProfile} disabled={profileSaving}>{profileSaving ? "Opslaan..." : "Profiel opslaan"}</Btn>
          </div>
        )}
        {settingsTab === "support" && (
          <div style={{ maxWidth: 640 }}>
            {/* Quick contact cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
              {[
                { icon: "💬", title: "WhatsApp", sub: "Direct antwoord", val: "+31 (0)6 4020 3503", href: "https://wa.me/31640203503", color: "#25D366" },
                { icon: "📞", title: "Bellen", sub: "Ma–Vr 9:00–18:00", val: "+31 (0)6 4020 3503", href: "tel:+31640203503", color: "var(--pr-h)" },
                { icon: "📧", title: "E-mail", sub: "Reactie binnen 1 werkdag", val: "info@woosyncshop.com", href: "mailto:info@woosyncshop.com", color: "var(--ac)" },
              ].map(c => (
                <a key={c.title} href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer"
                  style={{ textDecoration: "none", padding: "16px", background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", display: "block", transition: "border-color 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--b3)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--b1)"}>
                  <span style={{ fontSize: 22 }}>{c.icon}</span>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--tx)", marginTop: 8, marginBottom: 2 }}>{c.title}</div>
                  <div style={{ fontSize: 11, color: "var(--dm)", marginBottom: 6 }}>{c.sub}</div>
                  <div style={{ fontSize: 12, color: c.color, fontWeight: 600 }}>{c.val}</div>
                </a>
              ))}
            </div>
            {/* Inline support form */}
            <div style={{ background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", padding: 20 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Stuur een bericht</div>
              <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 18 }}>We reageren binnen 1 werkdag.</p>
              <SupportForm prefillEmail={user?.email || ""} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Top Nav ──────────────────────────────────────────────────────────────────
const TopNav = ({ activeSite, setActiveSite, sites, activeView, setActiveView, pendingCount, onSync, onPush, isAdmin, onLogout, user, onGoToSettings }) => {
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [noShopModal, setNoShopModal] = useState(null); // "sync"|"push"|null

  const handleSync = async () => {
    if (!sites?.length) { setNoShopModal("sync"); return; }
    setSyncing(true);
    try { await onSync?.(); } catch {}
    finally { setSyncing(false); }
  };
  const handlePush = async () => {
    if (!sites?.length) { setNoShopModal("push"); return; }
    setPushing(true);
    try { await onPush?.(); } catch {}
    finally { setPushing(false); }
  };

  const tabDefs = [["products", "📦", "Producten"], ["connected", "🔗", "Verbonden"], ["hreflang", "🌐", "Hreflang"], ["marketing", "📣", "Marketing"], ["settings", "⚙", "Instellingen"], ...(isAdmin ? [["admin", "🛡", "Admin"]] : [])];

  const TabBtn = ({ id, icon, label }) => (
    <button onClick={() => setActiveView(id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: activeView === id ? (id === "admin" ? "rgba(239,68,68,0.15)" : "var(--s2)") : "transparent", border: activeView === id ? (id === "admin" ? "1px solid rgba(239,68,68,0.3)" : "1px solid var(--b2)") : "1px solid transparent", borderRadius: "var(--rd)", cursor: "pointer", color: activeView === id ? (id === "admin" ? "var(--re)" : "var(--tx)") : id === "admin" ? "rgba(239,68,68,0.7)" : "var(--mx)", fontSize: 12, fontWeight: activeView === id ? 600 : 400, transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0 }}>
      <span>{icon}</span><span className="topnav-tab-label">{label}</span>
    </button>
  );

  return (
    <div className="topnav-root">
      {noShopModal && (
        <div onClick={() => setNoShopModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--s1)", border: "1px solid var(--b2)", borderRadius: "var(--rd-xl)", padding: 36, maxWidth: 420, textAlign: "center", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{noShopModal === "sync" ? "🔄" : "🚀"}</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-h)", marginBottom: 8 }}>
              {noShopModal === "sync" ? "Eerst een shop verbinden" : "Geen shops om naar te pushen"}
            </h2>
            <p style={{ fontSize: 14, color: "var(--mx)", lineHeight: 1.6, marginBottom: 24 }}>
              {noShopModal === "sync"
                ? "Voeg minimaal één WooCommerce shop toe voordat je kunt synchroniseren. Je hebt een Consumer Key en Consumer Secret nodig."
                : "Voeg minimaal één WooCommerce shop toe en koppel producten voordat je kunt pushen naar verbonden shops."}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <Btn variant="secondary" onClick={() => setNoShopModal(null)}>Sluiten</Btn>
              <Btn variant="primary" onClick={() => { setNoShopModal(null); setActiveView("settings"); onGoToSettings?.(); }}>
                Shop toevoegen →
              </Btn>
            </div>
          </div>
        </div>
      )}
      {/* Row 1: logo + site switcher + [desktop: tabs] + actions */}
      <div className="topnav-row1">
        {/* Logo */}
        <div onClick={() => setActiveView("products")} style={{ marginRight: 6, cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}>
          <img src="/woo-sync-shop-logo.png" alt="Woo Sync Shop" style={{ height: 20 }} />
        </div>

        {/* Site Switcher */}
        <div style={{ position: "relative", flexShrink: 1, minWidth: 0 }}>
          <button onClick={() => setSiteOpen(v => !v)} className="topnav-site-btn">
            <span style={{ flexShrink: 0 }}>{activeSite?.flag}</span>
            <span className="topnav-site-name">{activeSite?.name || "Selecteer shop"}</span>
            <span style={{ color: "var(--dm)", fontSize: 11, flexShrink: 0 }}>{siteOpen ? "▲" : "▼"}</span>
          </button>
          {siteOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, minWidth: 220, background: "var(--s1)", border: "1px solid var(--b2)", borderRadius: "var(--rd-lg)", boxShadow: "var(--sh)", zIndex: 200 }} className="slide-up">
              {sites.map(s => (
                <button key={s.id} onClick={() => { setActiveSite(s); setSiteOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", background: s.id === activeSite?.id ? "var(--s2)" : "transparent", border: "none", cursor: "pointer", color: "var(--tx)", fontSize: 13, textAlign: "left" }}>
                  <span>{s.flag}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: s.id === activeSite?.id ? 600 : 400 }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: "var(--dm)" }}>{s.domain}</div>
                  </div>
                  {s.id === activeSite?.id && <span style={{ color: "var(--pr-h)" }}>✓</span>}
                </button>
              ))}
              <div style={{ borderTop: "1px solid var(--b1)", padding: "6px" }}>
                <button onClick={() => { setSiteOpen(false); setActiveView("settings"); }} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 10px", background: "transparent", border: "none", cursor: "pointer", color: "var(--pr-h)", fontSize: 12 }}>
                  <span>+</span> Shop toevoegen
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Desktop tabs (inline) */}
        <div className="topnav-tabs-inline">
          {tabDefs.map(([id, icon, label]) => <TabBtn key={id} id={id} icon={icon} label={label} />)}
        </div>

        <div className="topnav-actions">
          {pendingCount > 0 && <Badge color="amber" style={{ display: "none" }}>{pendingCount}</Badge>}
          <Btn variant="secondary" size="sm" onClick={handleSync} disabled={syncing} icon={syncing ? <span className="spin">↻</span> : "↔"}>
            <span className="topnav-sync-label">{syncing ? "Bezig..." : "Sync"}</span>
          </Btn>
          <Btn variant="accent" size="sm" onClick={handlePush} disabled={pushing} icon={pushing ? <span className="spin">↻</span> : "↑"}>
            <span className="topnav-push-label">{pushing ? "..." : "Push"}</span>
          </Btn>
          <div style={{ position: "relative" }}>
          <div
            onClick={() => setAvatarOpen(o => !o)}
            title="Account"
            style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--pr)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0, userSelect: "none" }}
          >
            {(user?.name || user?.email || "?")[0].toUpperCase()}
          </div>
          {avatarOpen && (
            <>
              <div onClick={() => setAvatarOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
              <div style={{ position: "absolute", top: 38, right: 0, zIndex: 100, background: "var(--s1)", border: "1px solid var(--b2)", borderRadius: "var(--rd-lg)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)", minWidth: 180, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--b1)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name || user?.email}</div>
                  <div style={{ fontSize: 11, color: "var(--dm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</div>
                </div>
                <button onClick={() => { setActiveView("settings"); setAvatarOpen(false); }} style={{ width: "100%", padding: "10px 16px", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: "var(--tx)", display: "flex", alignItems: "center", gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--s2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  ⚙ Instellingen
                </button>
                <button onClick={() => { setAvatarOpen(false); onLogout(); }} style={{ width: "100%", padding: "10px 16px", textAlign: "left", background: "transparent", border: "none", borderTop: "1px solid var(--b1)", cursor: "pointer", fontSize: 13, color: "var(--re)", display: "flex", alignItems: "center", gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.07)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  ⎋ Afmelden
                </button>
              </div>
            </>
          )}
        </div>
        </div>
      </div>

      {/* Mobile tab row (row 2) */}
      <div className="topnav-tabs topnav-tabs-row">
        {tabDefs.map(([id, icon, label]) => (
          <button key={id} onClick={() => setActiveView(id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", background: activeView === id ? (id === "admin" ? "rgba(239,68,68,0.15)" : "rgba(var(--pr-rgb,99,102,241),0.1)") : "transparent", border: "none", borderBottom: activeView === id ? "2px solid var(--pr-h)" : "2px solid transparent", cursor: "pointer", color: activeView === id ? (id === "admin" ? "var(--re)" : "var(--pr-h)") : "var(--mx)", fontSize: 12, fontWeight: activeView === id ? 600 : 400, transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0, borderRadius: 0 }}>
            <span>{icon}</span><span style={{ marginLeft: 3 }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── SuperAdmin Dashboard ──────────────────────────────────────────────────────
const ADMIN_TABS = [
  { id: "users",    icon: "👥", label: "Gebruikers" },
  { id: "payments", icon: "💳", label: "Betalingen" },
  { id: "platform", icon: "⚙",  label: "Platform" },
  { id: "tracking", icon: "📊", label: "Tracking" },
  { id: "logs",     icon: "📋", label: "Logs" },
];

const SuperAdminDashboard = ({ user, onLogout }) => {
  const [adminTab, setAdminTab] = useState("users");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeTabDef = ADMIN_TABS.find(t => t.id === adminTab);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)" }}>

      {/* ── Top bar ── */}
      <nav style={{ height: 56, padding: "0 16px", display: "flex", alignItems: "center", gap: 10, background: "var(--s1)", borderBottom: "1px solid var(--b1)", flexShrink: 0, position: "sticky", top: 0, zIndex: 100 }}>
        {/* Logo */}
        <img src="/woo-sync-shop-logo.png" alt="Woo Sync Shop" style={{ height: 20, flexShrink: 0 }} />
        <span style={{ fontSize: 10, padding: "2px 7px", background: "rgba(239,68,68,0.15)", color: "var(--re)", borderRadius: 4, fontWeight: 800, letterSpacing: "0.06em", flexShrink: 0 }}>SUPERADMIN</span>

        {/* Current tab label — visible on mobile only */}
        <span className="sa-current-tab" style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)", marginLeft: 4 }}>
          {activeTabDef?.icon} {activeTabDef?.label}
        </span>

        {/* Desktop tab nav */}
        <div className="sa-desktop-nav" style={{ display: "flex", gap: 2, marginLeft: 8 }}>
          {ADMIN_TABS.map(t => (
            <button key={t.id} onClick={() => setAdminTab(t.id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: "var(--rd)", border: adminTab === t.id ? "1px solid var(--b2)" : "1px solid transparent", background: adminTab === t.id ? "var(--s2)" : "transparent", color: adminTab === t.id ? "var(--tx)" : "var(--mx)", fontSize: 12, fontWeight: adminTab === t.id ? 600 : 400, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}>
              <span>{t.icon}</span><span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Right: email + logout (desktop) / hamburger (mobile) */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span className="sa-email-label" style={{ fontSize: 12, color: "var(--mx)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{user.email}</span>
          <Btn className="sa-logout-desktop" variant="ghost" size="sm" onClick={onLogout}>Uitloggen</Btn>
          {/* Hamburger — mobile only */}
          <button className="sa-hamburger" onClick={() => setDrawerOpen(true)} style={{ display: "none", width: 36, height: 36, alignItems: "center", justifyContent: "center", background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: "var(--rd)", cursor: "pointer", flexShrink: 0 }}>
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none"><rect y="0" width="16" height="2" rx="1" fill="currentColor"/><rect y="5" width="16" height="2" rx="1" fill="currentColor"/><rect y="10" width="16" height="2" rx="1" fill="currentColor"/></svg>
          </button>
        </div>
      </nav>

      {/* ── Mobile drawer overlay ── */}
      {drawerOpen && (
        <>
          <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200 }} />
          <div style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 260, background: "var(--s1)", borderRight: "1px solid var(--b1)", zIndex: 201, display: "flex", flexDirection: "column", boxShadow: "4px 0 24px rgba(0,0,0,0.4)" }} className="slide-right">
            {/* Drawer header */}
            <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <img src="/woo-sync-shop-logo.png" alt="" style={{ height: 18 }} />
                <span style={{ fontSize: 10, padding: "2px 6px", background: "rgba(239,68,68,0.15)", color: "var(--re)", borderRadius: 4, fontWeight: 800, letterSpacing: "0.05em" }}>SUPERADMIN</span>
              </div>
              <button onClick={() => setDrawerOpen(false)} style={{ background: "none", border: "none", color: "var(--mx)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
            </div>

            {/* Drawer account info */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--b1)" }}>
              <div style={{ fontSize: 11, color: "var(--dm)", marginBottom: 2 }}>Ingelogd als</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
            </div>

            {/* Drawer nav */}
            <nav style={{ flex: 1, padding: "8px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
              {ADMIN_TABS.map(t => (
                <button key={t.id} onClick={() => { setAdminTab(t.id); setDrawerOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", borderRadius: "var(--rd)", border: "none", background: adminTab === t.id ? "var(--s2)" : "transparent", color: adminTab === t.id ? "var(--tx)" : "var(--mx)", fontSize: 14, fontWeight: adminTab === t.id ? 600 : 400, cursor: "pointer", textAlign: "left", transition: "background 0.15s", borderLeft: adminTab === t.id ? "3px solid var(--pr-h)" : "3px solid transparent" }}>
                  <span style={{ fontSize: 18, width: 24, textAlign: "center", flexShrink: 0 }}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </nav>

            {/* Drawer footer: logout */}
            <div style={{ padding: "12px 8px", borderTop: "1px solid var(--b1)" }}>
              <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", width: "100%", borderRadius: "var(--rd)", border: "none", background: "transparent", color: "var(--re)", fontSize: 14, fontWeight: 500, cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>⎋</span>
                Afmelden
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: "auto", padding: "clamp(14px, 3vw, 28px)" }}>
        <AdminPanel adminTab={adminTab} setAdminTab={setAdminTab} />
      </div>
    </div>
  );
};

// ─── User Dashboard ────────────────────────────────────────────────────────────
const VALID_VIEWS = ["products", "connected", "hreflang", "marketing", "settings"];

const Dashboard = ({ user, onLogout, onPaymentWall }) => {
  const [shops, setShops] = useState([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [activeSite, setActiveSite] = useState(null);

  // Hash-based routing so browser back/forward works
  const getViewFromHash = () => {
    const h = window.location.hash.replace("#", "");
    return VALID_VIEWS.includes(h) ? h : "products";
  };
  const [activeView, setActiveViewState] = useState(getViewFromHash);

  const setActiveView = (view) => {
    window.location.hash = view;
    setActiveViewState(view);
  };

  useEffect(() => {
    const onHashChange = () => setActiveViewState(getViewFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [notification, setNotification] = useState(null);

  // Per-shop cache: attributes (with terms) + categories
  const [shopCache, setShopCache] = useState({}); // { [shopId]: { attributes: [], categories: [], loaded: false } }

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  const wooCall = async (shopId, endpoint, method = "GET", data = null) => {
    const token = await getToken();
    const res = await fetch("/api/woo", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ shop_id: shopId, endpoint, method, data }),
    });
    if (!res.ok) throw new Error(`WooCommerce ${method} ${endpoint} failed: HTTP ${res.status}`);
    return res.json();
  };

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Load shops from Supabase on mount
  useEffect(() => {
    const loadShops = async () => {
      try {
        const { data, error } = await supabase.from("shops").select("*").eq("user_id", user.id).order("created_at", { ascending: true });
        if (error) throw error;
        const shopList = data || [];
        setShops(shopList);
        if (shopList.length > 0) setActiveSite(shopList[0]);
      } catch (e) {
        console.error("Failed to load shops:", e);
        notify("Kon shops niet laden: " + e.message, "error");
      } finally {
        setShopsLoading(false);
      }
    };
    loadShops();
  }, [user.id]);

  // Load products + shop metadata (attributes, categories) when active shop changes
  useEffect(() => {
    if (!activeSite) return;
    const shopId = activeSite.id;

    const loadProducts = async () => {
      setProductsLoading(true);
      try {
        const data = await wooCall(shopId, "products?per_page=100&orderby=date&order=desc");
        if (Array.isArray(data)) {
          setProducts(data.map(p => ({ ...p, pending_changes: {} })));
        } else {
          setProducts([]);
        }
      } catch (e) {
        notify("Producten laden mislukt: " + e.message, "error");
        setProducts([]);
      } finally {
        setProductsLoading(false);
      }
    };

    const loadShopMeta = async () => {
      if (shopCache[shopId]?.loaded) return; // already cached
      try {
        // Fetch attributes + their terms in parallel
        const [rawAttrs, rawCats] = await Promise.all([
          wooCall(shopId, "products/attributes?per_page=100"),
          wooCall(shopId, "products/categories?per_page=100&hide_empty=false"),
        ]);

        const attrs = Array.isArray(rawAttrs) ? rawAttrs : [];
        const cats = Array.isArray(rawCats) ? rawCats : [];

        // Fetch terms for each attribute in parallel
        const attrTermsPromises = attrs.map(attr =>
          wooCall(shopId, `products/attributes/${attr.id}/terms?per_page=100`)
            .then(terms => ({ ...attr, terms: Array.isArray(terms) ? terms.map(t => t.name) : [] }))
            .catch(() => ({ ...attr, terms: [] }))
        );
        const attrsWithTerms = await Promise.all(attrTermsPromises);

        setShopCache(prev => ({
          ...prev,
          [shopId]: { attributes: attrsWithTerms, categories: cats, loaded: true },
        }));
      } catch (e) {
        console.error("Shop meta load failed:", e);
      }
    };

    loadProducts();
    loadShopMeta();
  }, [activeSite?.id]);

  const handleShopAdded = (newShop) => {
    setShops(s => [...s, newShop]);
    setActiveSite(newShop);
    notify("Shop toegevoegd ✓");
  };

  const handleShopUpdated = (updatedShop) => {
    setShops(s => s.map(x => x.id === updatedShop.id ? updatedShop : x));
    if (activeSite?.id === updatedShop.id) setActiveSite(updatedShop);
    notify("Shop bijgewerkt ✓");
  };

  const handleShopDeleted = (shopId) => {
    const remaining = shops.filter(s => s.id !== shopId);
    setShops(remaining);
    if (activeSite?.id === shopId) {
      setActiveSite(remaining[0] || null);
      setProducts([]);
    }
    notify("Shop verwijderd");
  };

  const pendingCount = products.reduce((sum, p) => sum + Object.keys(p.pending_changes || {}).length, 0);

  if (shopsLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 32, height: 32, border: "3px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <span style={{ color: "var(--mx)", fontSize: 13 }}>Shops laden...</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)" }}>
      <TopNav
        activeSite={activeSite} setActiveSite={setActiveSite}
        sites={shops} activeView={activeView} setActiveView={setActiveView}
        pendingCount={pendingCount} isAdmin={false}
        onLogout={onLogout} user={user}
        onGoToSettings={() => setActiveView("settings")}
        onSync={async () => {
          // Re-fetch products from WooCommerce for the active shop
          if (!activeSite) return;
          setProductsLoading(true);
          try {
            const data = await wooCall(activeSite.id, "products?per_page=100&orderby=date&order=desc");
            if (Array.isArray(data)) setProducts(data.map(p => ({ ...p, pending_changes: {} })));
            notify("Producten gesynchroniseerd van " + activeSite.name + " ✓");
          } catch (e) {
            notify("Sync mislukt: " + e.message, "error");
          } finally {
            setProductsLoading(false);
          }
        }}
        onPush={async () => {
          // Push all products that have connections to their connected shops
          if (!activeSite) return;
          try {
            const token = await getToken();
            const connRes = await fetch("/api/connected-products", { headers: { "Authorization": `Bearer ${token}` } });
            const conns = await connRes.json();
            const sourceConns = Array.isArray(conns) ? conns.filter(c => c.source_shop_id === activeSite.id) : [];
            if (sourceConns.length === 0) { notify("Geen verbonden producten om te pushen"); return; }
            const uniqueProductIds = [...new Set(sourceConns.map(c => c.source_product_id))];
            const SYNC_FIELDS = ["name","description","short_description","regular_price","sale_price","stock_quantity","categories","attributes"];
            let ok = 0, fail = 0;
            await Promise.all(uniqueProductIds.map(async pid => {
              try {
                const res = await fetch("/api/sync-products", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                  body: JSON.stringify({ source_shop_id: activeSite.id, product_id: pid, fields: SYNC_FIELDS }),
                });
                const d = await res.json();
                if (d.ok) ok += d.synced; else fail++;
              } catch { fail++; }
            }));
            notify(fail > 0 ? `Push klaar: ${ok} geslaagd, ${fail} mislukt` : `${ok} producten gepushed naar verbonden shops ✓`);
          } catch (e) {
            notify("Push mislukt: " + e.message, "error");
          }
        }} />
      <div className="dashboard-content">
        {shops.length === 0 && activeView !== "settings" ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 16, textAlign: "center" }}>
            <div style={{ fontSize: 48 }}>🏪</div>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Nog geen shops toegevoegd</h2>
            <p style={{ color: "var(--mx)", fontSize: 14, maxWidth: 380 }}>
              Voeg je eerste WooCommerce shop toe om te beginnen. Je hebt een Consumer Key en Consumer Secret nodig.
            </p>
            <Btn variant="primary" onClick={() => setActiveView("settings")}>Shop toevoegen →</Btn>
          </div>
        ) : (
          <>
            {activeView === "products" && (
              productsLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "40px 0" }}>
                  <div style={{ width: 20, height: 20, border: "2px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  <span style={{ color: "var(--mx)", fontSize: 13 }}>Producten laden van {activeSite?.name}...</span>
                </div>
              ) : (
                <ProductsTable products={products} onEdit={p => { setEditProduct(p); setEditOpen(true); }} onConnect={() => setActiveView("connected")} activeSite={activeSite} />
              )
            )}
            {activeView === "connected" && <ConnectedSitesView products={products} sites={shops} activeSite={activeSite} wooCall={wooCall} />}
            {activeView === "hreflang" && <HreflangView sites={shops} />}
            {activeView === "marketing" && <MarketingView activeSite={activeSite} shops={shops} user={user} />}
          </>
        )}
        {activeView === "settings" && (
          <SettingsView
            user={user} shops={shops}
            onShopAdded={handleShopAdded}
            onShopUpdated={handleShopUpdated}
            onShopDeleted={handleShopDeleted} />
        )}
      </div>

      <ProductEditModal product={editProduct} open={editOpen} onClose={() => setEditOpen(false)}
        shopCache={shopCache[activeSite?.id] || { attributes: [], categories: [], loaded: false }}
        onSaveDirect={async (updated) => {
          const shopId = activeSite?.id;
          if (!shopId) throw new Error("Geen actieve shop");

          // Build WooCommerce product payload
          const payload = {
            name: updated.name,
            slug: updated.slug,
            description: updated.description || "",
            short_description: updated.short_description || "",
            status: updated.status || "publish",
            catalog_visibility: updated.catalog_visibility || "visible",
          };
          // Price (simple products only)
          if (updated.type !== "variable") {
            if (updated.regular_price !== undefined) payload.regular_price = String(updated.regular_price || "");
            if (updated.sale_price !== undefined) payload.sale_price = String(updated.sale_price || "");
          }
          // Stock
          payload.manage_stock = !!updated.manage_stock;
          if (updated.manage_stock) {
            payload.stock_quantity = parseInt(updated.stock_quantity) || 0;
            payload.stock_status = updated.stock_status || "instock";
          } else {
            payload.stock_status = updated.stock_status || "instock";
          }
          // Backorders
          if (updated.backorders !== undefined) payload.backorders = updated.backorders;
          // Categories
          if (updated.categories) {
            payload.categories = (updated.categories || []).map(cat =>
              typeof cat === "object" ? { id: cat.id } : { id: cat }
            );
          }
          // Attributes
          if (updated.attributes) {
            payload.attributes = (updated.attributes || []).map(attr => ({
              id: attr.id || 0,
              name: attr.name || attr.slug || "",
              visible: !!attr.visible,
              variation: !!attr.variation,
              options: attr.values || attr.options || [],
            }));
          }
          // Images
          const images = [];
          if (updated.images && updated.images.length > 0) {
            // WooCommerce images array: first is featured
            updated.images.forEach(img => {
              if (img && (img.src || img.id)) images.push(img.id ? { id: img.id } : { src: img.src });
            });
          } else {
            if (updated.featured_image) images.push({ src: updated.featured_image });
            (updated.gallery_images || []).forEach(src => { if (src) images.push({ src }); });
          }
          if (images.length > 0) payload.images = images;

          // PUT the main product
          await wooCall(shopId, `products/${updated.id}`, "PUT", payload);

          // PUT variations if variable and variations changed
          if (updated.type === "variable" && updated.variations?.length > 0) {
            const varPromises = updated.variations.map(v => {
              if (!v.id) return Promise.resolve();
              const varPayload = {
                sku: v.sku || "",
                regular_price: String(v.regular_price || ""),
                sale_price: String(v.sale_price || ""),
                manage_stock: !!v.manage_stock,
                stock_status: v.stock_status || "instock",
                status: v.enabled === false ? "private" : "publish",
              };
              if (v.manage_stock) varPayload.stock_quantity = parseInt(v.stock_quantity) || 0;
              if (v.backorders !== undefined) varPayload.backorders = v.backorders;
              return wooCall(shopId, `products/${updated.id}/variations/${v.id}`, "PUT", varPayload);
            });
            await Promise.all(varPromises);
          }

          // Update local state
          setProducts(prev => prev.map(p => p.id === updated.id ? { ...updated, pending_changes: {} } : p));
        }}
        onAttributeTermAdded={async (attributeId, termName) => {
          // POST new term to WooCommerce + refresh cache
          const shopId = activeSite?.id;
          if (!shopId) return;
          await wooCall(shopId, `products/attributes/${attributeId}/terms`, "POST", { name: termName });
          // Refresh this attribute's terms in cache
          const terms = await wooCall(shopId, `products/attributes/${attributeId}/terms?per_page=100`);
          setShopCache(prev => {
            const cur = prev[shopId] || { attributes: [], categories: [] };
            return {
              ...prev,
              [shopId]: {
                ...cur,
                attributes: cur.attributes.map(a =>
                  a.id === attributeId ? { ...a, terms: Array.isArray(terms) ? terms.map(t => t.name) : a.terms } : a
                ),
              },
            };
          });
        }}
        sites={shops} activeSite={activeSite} />

      {notification && (
        <div style={{ position: "fixed", bottom: 24, right: 24, padding: "12px 20px", background: notification.type === "success" ? "var(--gr)" : "var(--re)", color: "#fff", borderRadius: "var(--rd-lg)", fontSize: 13, fontWeight: 500, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 2000 }} className="slide-up">
          {notification.msg}
        </div>
      )}
    </div>
  );
};

// ─── Auth Modal ───────────────────────────────────────────────────────────────
const AuthModal = ({ mode, onClose, onSuccess, initialPlan, initialBillingPeriod }) => {
  const [step, setStep] = useState(
    mode === "signup" ? (initialPlan ? "form" : "plan") :
    mode === "reset" ? "reset" :
    mode === "payment" ? "payment" : "login"
  );
  const [form, setForm] = useState({
    name: "", email: "", password: "", code: "",
    business_name: "", country: "NL",
    vat_number: "", vat_validated: false, vat_checking: false, vat_error: null,
    address_street: "", address_zip: "", address_city: "",
    plan: initialPlan || "growth",
    billingPeriod: initialBillingPeriod || "monthly",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [methodsLoading, setMethodsLoading] = useState(false);

  // Load Mollie payment methods (sequenceType=first) when entering payment step
  useEffect(() => {
    if (step !== "payment") return;
    setMethodsLoading(true);
    const fallbackMethods = [
        { id: "ideal", description: "iDEAL", image: { size1x: "https://www.mollie.com/external/icons/payment-methods/ideal.png" } },
        { id: "creditcard", description: "Creditcard", image: { size1x: "https://www.mollie.com/external/icons/payment-methods/creditcard.png" } },
        { id: "directdebit", description: "SEPA Overboeking", image: { size1x: "https://www.mollie.com/external/icons/payment-methods/directdebit.png" } },
        { id: "bancontact", description: "Bancontact", image: { size1x: "https://www.mollie.com/external/icons/payment-methods/bancontact.png" } },
      ];
    const useFallback = (list) => { setPaymentMethods(fallbackMethods); setSelectedMethod("ideal"); };
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch("/api/mollie-payments?type=methods", {
        headers: session?.access_token ? { "Authorization": `Bearer ${session.access_token}` } : {},
      })
        .then(r => r.json())
        .then(data => {
          // data is now an array of {id, description, image: {size1x, size2x}}
          const methods = Array.isArray(data) ? data : [];
          if (methods.length === 0 || data.error) { useFallback(); return; }
          // Normalise image to always have size1x
          const normalised = methods.map(m => ({
            ...m,
            image: m.image?.size1x ? m.image : { size1x: `https://www.mollie.com/external/icons/payment-methods/${m.id}.png` }
          }));
          setPaymentMethods(normalised);
          setSelectedMethod(normalised[0].id);
        })
        .catch(useFallback)
        .finally(() => setMethodsLoading(false));
    }).catch(() => { useFallback(); setMethodsLoading(false); });
  }, [step]);
  const isFree = form.code.toLowerCase() === "freeforever";
  const planPrice = getPlanPrice(form.plan, form.billingPeriod);
  const vatInfo = getVatInfo(form.country, form.vat_validated, planPrice);
  const isEUNonNL = EU_COUNTRIES.some(c => c.code === form.country) && form.country !== "NL";

  const handleCode = (code) => setForm(f => ({ ...f, code }));

  const checkVAT = async () => {
    if (!form.vat_number) return;
    setForm(f => ({ ...f, vat_checking: true, vat_error: null }));
    try {
      const res = await fetch("/api/vies-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vat_number: form.vat_number }) });
      const d = await res.json();
      if (d.valid) setForm(f => ({ ...f, vat_validated: true, vat_checking: false }));
      else setForm(f => ({ ...f, vat_validated: false, vat_checking: false, vat_error: d.retry ? "VIES tijdelijk niet beschikbaar" : "BTW-nummer niet gevonden in VIES" }));
    } catch { setForm(f => ({ ...f, vat_checking: false, vat_error: "Verificatie mislukt" })); }
  };

  const handleLogin = async () => {
    setLoading(true); setError(null);
    try {
      const { user } = await signIn(form.email, form.password);
      onSuccess({ id: user.id, name: user.user_metadata?.full_name || form.email, email: user.email });
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const handleSignup = async () => {
    setLoading(true); setError(null);
    try {
      if (!form.name?.trim()) { setError("Vul je naam in."); return; }
      if (!form.email?.trim()) { setError("Vul je e-mailadres in."); return; }
      if (!form.password || form.password.length < 8) { setError("Wachtwoord moet minimaal 8 tekens zijn."); return; }
      if (!form.address_city?.trim()) { setError("Vul je stad in."); return; }
      if (!form.country) { setError("Selecteer je land."); return; }

      const vi = getVatInfo(form.country, form.vat_validated, getPlanPrice(form.plan, form.billingPeriod));

      // Register via server-side API — creates user pre-confirmed, no confirmation email sent
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          metadata: {
            full_name: form.name, business_name: form.business_name,
            country: form.country, vat_number: form.vat_number,
            vat_validated: form.vat_validated, address_street: form.address_street,
            address_zip: form.address_zip, address_city: form.address_city,
            plan: isFree ? "free_forever" : form.plan,
            billing_period: form.billingPeriod,
            price_total: vi.total, vat_rate: vi.rate,
          },
        }),
      });
      const result = await res.json();
      if (!res.ok) { setError(result.error || "Registratie mislukt."); return; }

      // Sign in to get session (always works — user is pre-confirmed)
      await signIn(form.email, form.password);

      if (isFree) { setStep("success"); } else { setStep("payment"); }
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const handlePayment = async () => {
    setLoading(true); setError(null);
    try {
      // Ensure we have a fresh session
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
        session = data?.session;
      }
      if (!session?.access_token) { setError("Sessie verlopen. Probeer opnieuw in te loggen."); setLoading(false); return; }
      const vi = getVatInfo(form.country, form.vat_validated, getPlanPrice(form.plan, form.billingPeriod));
      const res = await fetch("/api/mollie-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({
          email: form.email,
          name: form.name,
          plan: form.plan,
          billing_period: form.billingPeriod,
          price_total: vi.total,
          method: selectedMethod,
          return_url: window.location.origin + "/#payment-return",
        }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        // Store payment_id in sessionStorage so we can verify on return
        if (data.payment_id) sessionStorage.setItem("wss_pending_payment_id", data.payment_id);
        window.location.href = data.checkout_url;
      } else {
        setError(data.error || "Kon geen betaallink aanmaken. Probeer het opnieuw.");
        setLoading(false);
      }
    } catch (e) { setError(e.message); setLoading(false); }
  };

  const handleResetPassword = async () => {
    if (!form.email) { setError("Vul je e-mailadres in"); return; }
    setLoading(true); setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
        redirectTo: "https://www.woosyncshop.com",
      });
      if (error) throw error;
      setStep("reset_sent");
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <Overlay open onClose={onClose} width={step === "plan" ? 700 : 440} title={null}>
      <div style={{ padding: 32 }}>
        {error && (
          <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--rd)", marginBottom: 16, fontSize: 13, color: "#ef4444" }}>
            {error}
          </div>
        )}

        {step === "plan" && <>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Kies je plan</h2>
          <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 20 }}>Je kunt op elk moment upgraden of downgraden.</p>
          {/* Billing toggle */}
          <div style={{ display: "flex", background: "var(--s2)", borderRadius: "var(--rd)", padding: 3, border: "1px solid var(--b1)", width: "fit-content", marginBottom: 20, gap: 3 }}>
            {[["monthly", "Maandelijks"], ["annual", `Jaarlijks (-${ANNUAL_DISCOUNT}%)`]].map(([v, label]) => (
              <button key={v} onClick={() => setForm(f => ({ ...f, billingPeriod: v }))} style={{ padding: "5px 16px", borderRadius: "var(--rd)", border: "none", cursor: "pointer", fontSize: 12, fontWeight: form.billingPeriod === v ? 700 : 400, background: form.billingPeriod === v ? "var(--pr)" : "transparent", color: form.billingPeriod === v ? "#fff" : "var(--mx)", transition: "all 0.15s" }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            {PLAN_LIST.map(plan => {
              const price = form.billingPeriod === "annual" ? plan.annual_mo : plan.monthly;
              const selected = form.plan === plan.id;
              return (
                <div key={plan.id} onClick={() => setForm(f => ({ ...f, plan: plan.id }))}
                  style={{ padding: 16, background: selected ? "var(--pr-l)" : "var(--s2)", border: `2px solid ${selected ? "var(--pr)" : "var(--b1)"}`, borderRadius: "var(--rd-lg)", cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mx)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{plan.name}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "var(--font-h)", marginBottom: 2 }}>€{price.toFixed(2).replace(".", ",")}<span style={{ fontSize: 11, fontWeight: 400, color: "var(--mx)" }}>/mo</span></div>
                  <div style={{ fontSize: 11, color: "var(--dm)", marginBottom: 10 }}>excl. BTW</div>
                  <div style={{ fontSize: 12, color: "var(--mx)" }}>🏪 {plan.sites} shops</div>
                  <div style={{ fontSize: 12, color: "var(--mx)" }}>🔗 {plan.connected_products.toLocaleString("nl-NL")} producten</div>
                  {selected && <div style={{ marginTop: 8, fontSize: 11, color: "var(--pr-h)", fontWeight: 700 }}>✓ Geselecteerd</div>}
                </div>
              );
            })}
          </div>
          <Btn variant="primary" size="lg" onClick={() => { setStep("form"); setError(null); }} style={{ width: "100%" }}>
            Doorgaan met {PLANS[form.plan]?.name} →
          </Btn>
          <div style={{ textAlign: "center", marginTop: 12, fontSize: 12, color: "var(--dm)" }}>
            Al een account? <span onClick={() => { setStep("login"); setError(null); }} style={{ color: "var(--pr-h)", cursor: "pointer" }}>Inloggen</span>
          </div>
        </>}

        {step === "login" && <>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Welkom terug</h2>
          <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 24 }}>Log in op je Woo Sync Shop account</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="E-mailadres"><Inp value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" placeholder="jij@domein.nl" /></Field>
            <Field label="Wachtwoord"><Inp value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} type="password" placeholder="••••••••" onKeyDown={e => e.key === "Enter" && handleLogin()} /></Field>
            <Btn variant="primary" size="lg" onClick={handleLogin} disabled={loading} style={{ width: "100%", marginTop: 8 }}>{loading ? "Bezig..." : "Inloggen"}</Btn>
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--dm)" }}>
              <span onClick={() => { setStep("reset"); setError(null); }} style={{ color: "var(--mx)", cursor: "pointer", textDecoration: "underline" }}>Wachtwoord vergeten?</span>
            </div>
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--dm)" }}>
              Nog geen account? <span onClick={() => { setStep("form"); setError(null); }} style={{ color: "var(--pr-h)", cursor: "pointer" }}>Registreren</span>
            </div>
          </div>
        </>}

        {step === "reset" && <>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Wachtwoord resetten</h2>
          <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 24 }}>Vul je e-mailadres in en we sturen je een resetlink.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="E-mailadres"><Inp value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" placeholder="jij@domein.nl" onKeyDown={e => e.key === "Enter" && handleResetPassword()} /></Field>
            <Btn variant="primary" size="lg" onClick={handleResetPassword} disabled={loading} style={{ width: "100%", marginTop: 8 }}>{loading ? "Versturen..." : "Resetlink versturen"}</Btn>
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--dm)" }}>
              <span onClick={() => { setStep("login"); setError(null); }} style={{ color: "var(--pr-h)", cursor: "pointer" }}>← Terug naar inloggen</span>
            </div>
          </div>
        </>}

        {step === "reset_sent" && <>
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Controleer je inbox</h2>
            <p style={{ fontSize: 13, color: "var(--mx)", lineHeight: 1.6 }}>
              We hebben een resetlink gestuurd naar <strong style={{ color: "var(--tx)" }}>{form.email}</strong>. 
              Klik op de link in de e-mail om je wachtwoord te wijzigen.
            </p>
            <div style={{ marginTop: 20, fontSize: 12, color: "var(--dm)" }}>
              Geen e-mail ontvangen?{" "}
              <span onClick={() => { setStep("reset"); setError(null); }} style={{ color: "var(--pr-h)", cursor: "pointer" }}>Probeer opnieuw</span>
            </div>
          </div>
        </>}

        {step === "form" && <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800 }}>Account aanmaken</h2>
            <div onClick={() => setStep("plan")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--pr-l)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "var(--rd)", cursor: "pointer", fontSize: 12, color: "var(--pr-h)", fontWeight: 600 }}>
              {PLANS[form.plan]?.name} · €{getPlanPrice(form.plan, form.billingPeriod).toFixed(2).replace(".", ",")} <span style={{ fontSize: 10, opacity: 0.7 }}>✎</span>
            </div>
          </div>
          <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 20 }}>Start met het beheren van al jouw webshops</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div className="settings-2col">
              <Field label="Naam *"><Inp value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jouw naam" /></Field>
              <Field label="Bedrijfsnaam"><Inp value={form.business_name} onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} placeholder="Optioneel" /></Field>
            </div>
            <Field label="E-mailadres *"><Inp value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" placeholder="jij@domein.nl" /></Field>
            <Field label="Wachtwoord *"><Inp value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} type="password" placeholder="Min. 8 tekens" /></Field>
            <Field label="Straat + huisnummer"><Inp value={form.address_street} onChange={e => setForm(f => ({ ...f, address_street: e.target.value }))} placeholder="Straatnaam 1" /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10 }}>
              <Field label="Postcode"><Inp value={form.address_zip} onChange={e => setForm(f => ({ ...f, address_zip: e.target.value }))} placeholder="1234 AB" /></Field>
              <Field label="Stad *"><Inp value={form.address_city} onChange={e => setForm(f => ({ ...f, address_city: e.target.value }))} placeholder="Amsterdam" /></Field>
            </div>
            <Field label="Land *">
              <select value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value, vat_number: "", vat_validated: false }))}
                style={{ width: "100%", padding: "9px 12px", background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: "var(--rd)", color: "var(--tx)", fontSize: 13 }}>
                {ALL_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </Field>
            {isEUNonNL && (
              <Field label="BTW-nummer (voor btw-vrijstelling)">
                <div style={{ display: "flex", gap: 8 }}>
                  <Inp value={form.vat_number} onChange={e => setForm(f => ({ ...f, vat_number: e.target.value, vat_validated: false, vat_error: null }))} placeholder={`${form.country}XXXXXXXXXX`} style={{ flex: 1 }} />
                  <Btn variant="secondary" size="sm" onClick={checkVAT} disabled={form.vat_checking}>{form.vat_checking ? "..." : "Verifiëren"}</Btn>
                </div>
                {form.vat_validated && <div style={{ fontSize: 12, color: "var(--gr)", marginTop: 4 }}>✓ BTW-nummer geverifieerd — btw-vrijstelling van toepassing (0%)</div>}
                {form.vat_error && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>⚠ {form.vat_error}</div>}
              </Field>
            )}
            <Field label="Kortingscode">
              <Inp value={form.code} onChange={e => handleCode(e.target.value)} placeholder="Optioneel..." />
              {isFree && <div style={{ padding: "6px 10px", background: "var(--gr-l)", borderRadius: 6, border: "1px solid rgba(34,197,94,0.3)", marginTop: 6 }}>
                <span style={{ fontSize: 12, color: "var(--gr)", fontWeight: 600 }}>🎉 Code geldig — gratis voor altijd!</span>
              </div>}
            </Field>
            <div style={{ padding: 12, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: vatInfo.rate > 0 ? 6 : 0 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Woo Sync Shop Pro</div>
                  <div style={{ fontSize: 12, color: "var(--mx)" }}>Tot 10 WordPress installaties</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {isFree ? <span style={{ fontWeight: 800, color: "var(--gr)", fontSize: 18 }}>Gratis</span> : (
                    <><span style={{ fontWeight: 800, fontSize: 18 }}>€{vatInfo.total}</span><span style={{ fontSize: 11, color: "var(--dm)" }}>/maand</span></>
                  )}
                </div>
              </div>
              {!isFree && vatInfo.rate > 0 && (
                <div style={{ fontSize: 11, color: "var(--dm)", borderTop: "1px solid var(--b1)", paddingTop: 6 }}>
                  Excl. BTW: €{vatInfo.excl} + {vatInfo.rate}% BTW
                </div>
              )}
              {!isFree && vatInfo.reverseCharge && (
                <div style={{ fontSize: 11, color: "var(--gr)", borderTop: "1px solid var(--b1)", paddingTop: 6 }}>
                  ✓ Btw verlegd (reverse charge) — 0% BTW
                </div>
              )}
            </div>
            <Btn variant="primary" size="lg" onClick={handleSignup} disabled={loading} style={{ width: "100%", marginTop: 4 }}>{loading ? "Bezig..." : isFree ? "Account aanmaken →" : "Verder naar betaling →"}</Btn>
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--dm)" }}>
              Al een account? <span onClick={() => { setStep("login"); setError(null); }} style={{ color: "var(--pr-h)", cursor: "pointer" }}>Inloggen</span>
            </div>
          </div>
        </>}

        {step === "payment" && <>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Betaling</h2>
          <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 16 }}>Start je {PLANS[form.plan]?.name || "Growth"} abonnement</p>
          <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, color: "var(--mx)" }}>WooSyncShop {PLANS[form.plan]?.name || "Growth"} · {form.billingPeriod === "annual" ? "jaarabonnement" : "maandabonnement"}</div>
              <div style={{ fontSize: 11, color: "var(--dm)", marginTop: 2 }}>{PLANS[form.plan]?.sites} shops · {(PLANS[form.plan]?.connected_products || 0).toLocaleString("nl-NL")} verbonden producten</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>€{vatInfo.total}</div>
              <div style={{ fontSize: 10, color: "var(--dm)" }}>incl. BTW</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--mx)", marginBottom: 8, fontWeight: 600 }}>Kies betaalmethode</div>
          {methodsLoading ? (
            <div style={{ padding: "16px 0", color: "var(--dm)", fontSize: 13 }}>Betaalmethoden laden...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {paymentMethods.map(m => (
                <div key={m.id} onClick={() => setSelectedMethod(m.id)}
                  style={{ padding: "10px 14px", background: selectedMethod === m.id ? "var(--pr-l)" : "var(--s2)",
                    border: `1px solid ${selectedMethod === m.id ? "var(--pr)" : "var(--b1)"}`,
                    borderRadius: "var(--rd)", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", transition: "all 0.15s" }}>
                  {m.image?.size1x && <img src={m.image.size1x} alt={m.description} style={{ width: 28, height: 20, objectFit: "contain" }} />}
                  <span style={{ fontSize: 13, fontWeight: selectedMethod === m.id ? 600 : 400 }}>{m.description}</span>
                  {m.id === "ideal" && <span style={{ marginLeft: 4, fontSize: 11, color: "var(--dm)" }}>(incl. SEPA-machtiging)</span>}
                  {selectedMethod === m.id && <span style={{ marginLeft: "auto", color: "var(--pr-h)", fontSize: 16 }}>✓</span>}
                </div>
              ))}
            </div>
          )}
          <Btn variant="primary" size="lg" onClick={handlePayment} disabled={loading || !selectedMethod || methodsLoading} style={{ width: "100%", opacity: selectedMethod ? 1 : 0.6 }}>
            {loading ? "Doorsturen naar Mollie..." : "Betalen →"}
          </Btn>
          <div style={{ textAlign: "center", fontSize: 11, color: "var(--dm)", marginTop: 8 }}>🔒 Veilige betaling via Mollie</div>
        </>}

        {step === "success" && <>
          <div style={{ textAlign: "center", padding: "10px 0 20px" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Account actief!</h2>
            <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 24 }}>
              {isFree ? "Je gratis account is aangemaakt." : "Betaling geslaagd. Welkom bij Woo Sync Shop!"}<br />
              Bevestigingsmail gestuurd naar <strong style={{ color: "var(--tx)" }}>{form.email}</strong>.
            </p>
            <Btn variant="primary" size="lg" onClick={() => onSuccess({ name: form.name, email: form.email })} style={{ width: "100%" }}>Naar het dashboard →</Btn>
          </div>
        </>}
      </div>
    </Overlay>
  );
};

// ─── Landing Page ─────────────────────────────────────────────────────────────
// ─── Welcome View (shown after first payment) ─────────────────────────────────
const WelcomeView = ({ user, plan, onContinue }) => {
  const planInfo = PLANS[plan] || PLANS.growth;
  const STEPS = [
    { step: "01", icon: "🏪", title: "Verbind je shops", desc: "Ga naar Instellingen → Mijn shops. Voeg je WooCommerce shops toe met je Consumer Key + Secret. Verbind minimaal 2 shops om te synchroniseren." },
    { step: "02", icon: "🔗", title: "Koppel producten", desc: "Open Verbonden producten. Selecteer een bron- en doelshop. Match via SKU, attribuut of laat ons AI matching doen voor automatische koppeling." },
    { step: "03", icon: "🔄", title: "Synchroniseer", desc: "Kies welke velden je wilt synchroniseren: naam, beschrijving, prijs, voorraad, afbeeldingen. Klik Sync en alle gekoppelde producten worden bijgewerkt." },
    { step: "04", icon: "🤖", title: "AI optioneel inschakelen", desc: "Activeer AI Vertaling voor automatische productvertalingen, of gebruik AI Image Optimalisatie voor automatische beeldcompressie en -verbetering." },
  ];
  const FEATURES = [
    { icon: "🔄", title: "Realtime sync", desc: "Sync productnaam, prijs, voorraad, beschrijving en afbeeldingen tussen al je shops met één klik." },
    { icon: "🤖", title: "AI matching", desc: "Laat Gemini of GPT-4o automatisch producten matchen tussen shops op basis van naam, attributen en beschrijving." },
    { icon: "🌐", title: "Hreflang manager", desc: "Automatische hreflang-tags voor internationale SEO. Geen WordPress plugin nodig — rechtstreeks via de API." },
    { icon: "🗣️", title: "AI Vertaling", desc: "Vertaal productteksten automatisch naar de taal van je doelshop. Behoudt opmaak, bullet points en HTML structuur." },
    { icon: "🖼️", title: "Image pipeline", desc: "Gemini beschrijft je afbeeldingen en TinyPNG comprimeert ze. Max 400KB, maximale kwaliteit, volledig automatisch." },
    { icon: "📊", title: "Voorraad sync", desc: "Houd voorraad realtime gesynchroniseerd. Ideaal voor shops met dezelfde producten in verschillende regio's." },
  ];

  return (
    <div style={{ fontFamily: "var(--font-b)", minHeight: "100vh", background: "var(--bg)", overflowX: "hidden" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, rgba(91,91,214,0.15) 0%, transparent 60%)", borderBottom: "1px solid var(--b1)", padding: "32px 32px 28px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            <img src="/woo-sync-shop-logo.png" alt="WooSyncShop" style={{ height: 28 }} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <Badge color="green" style={{ marginBottom: 12, display: "inline-flex" }}>✓ Abonnement actief</Badge>
              <h1 style={{ fontSize: "clamp(28px,4vw,42px)", fontWeight: 800, letterSpacing: "-0.03em", fontFamily: "var(--font-h)", marginBottom: 8, lineHeight: 1.15 }}>
                Welkom, {user?.name?.split(" ")[0] || "daar"}! 👋
              </h1>
              <p style={{ fontSize: 16, color: "var(--mx)", lineHeight: 1.6, marginBottom: 20, maxWidth: 540 }}>
                Je <strong style={{ color: "var(--pr-h)" }}>{planInfo.name}</strong> abonnement is actief. Je kunt nu tot{" "}
                <strong style={{ color: "var(--tx)" }}>{planInfo.sites} shops</strong> verbinden en{" "}
                <strong style={{ color: "var(--tx)" }}>{planInfo.connected_products.toLocaleString("nl-NL")} producten</strong> synchroniseren.
              </p>
              <Btn variant="primary" size="lg" onClick={onContinue} style={{ fontSize: 15, padding: "13px 28px" }}>
                Naar het dashboard →
              </Btn>
            </div>
            {/* Plan card */}
            <div style={{ background: "var(--s1)", border: "2px solid var(--pr)", borderRadius: "var(--rd-xl)", padding: "20px 24px", minWidth: 200 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mx)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Jouw plan</div>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "var(--font-h)", color: "var(--pr-h)", marginBottom: 8 }}>{planInfo.name}</div>
              {[`🏪 Tot ${planInfo.sites} shops`, `🔗 ${planInfo.connected_products.toLocaleString("nl-NL")} verbonden producten`, "🤖 AI matching inbegrepen", "🌐 Hreflang manager", "📊 Voorraad sync"].map(f => (
                <div key={f} style={{ fontSize: 12, color: "var(--mx)", marginBottom: 4 }}>{f}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick start */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "48px 32px" }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>In 4 stappen live</h2>
        <p style={{ fontSize: 14, color: "var(--mx)", marginBottom: 32 }}>Zo synchroniseer je je eerste producten</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16, marginBottom: 56 }}>
          {STEPS.map((s, i) => (
            <div key={s.step} style={{ padding: 20, background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: "var(--rd-xl)", position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--pr)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{s.step}</div>
                <span style={{ fontSize: 20 }}>{s.icon}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: "var(--mx)", lineHeight: 1.6 }}>{s.desc}</div>
              {i < STEPS.length - 1 && (
                <div style={{ position: "absolute", right: -10, top: "50%", transform: "translateY(-50%)", color: "var(--b3)", fontSize: 18, display: "none" }}>→</div>
              )}
            </div>
          ))}
        </div>

        {/* Feature deep-dive */}
        <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>Wat zit er onder de motorkap?</h2>
        <p style={{ fontSize: 14, color: "var(--mx)", marginBottom: 32 }}>Elke functie gebouwd voor serieuze WooCommerce ondernemers</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 48 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ padding: 20, background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: "var(--rd-xl)", transition: "border-color 0.2s, transform 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--b3)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--b1)"; e.currentTarget.style.transform = "none"; }}>
              <div style={{ fontSize: 26, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: "var(--mx)", lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Support callout */}
        <div style={{ padding: 24, background: "linear-gradient(135deg, rgba(91,91,214,0.1), var(--s1))", border: "1px solid rgba(91,91,214,0.25)", borderRadius: "var(--rd-xl)", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Hulp nodig? We zijn er voor je.</div>
            <div style={{ fontSize: 13, color: "var(--mx)" }}>Stuur een bericht, bel of WhatsApp ons direct — gemiddeld binnen 2 uur reactie.</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="https://wa.me/31640203503" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
              <Btn variant="secondary" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <span style={{ fontSize: 16 }}>💬</span> WhatsApp
              </Btn>
            </a>
            <a href="tel:+31640203503" style={{ textDecoration: "none" }}>
              <Btn variant="secondary" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <span style={{ fontSize: 16 }}>📞</span> Bellen
              </Btn>
            </a>
          </div>
        </div>

        <div style={{ textAlign: "center", paddingTop: 16 }}>
          <Btn variant="primary" size="lg" onClick={onContinue} style={{ fontSize: 15, padding: "13px 32px" }}>
            Aan de slag → Shop toevoegen
          </Btn>
        </div>
      </div>
    </div>
  );
};

// ─── Landing Pricing Component ────────────────────────────────────────────────
const LandingPricing = ({ onSignup }) => {
  const [billing, setBilling] = useState("monthly");

  const FEATURES = [
    ["AI product matching",       [true, true, true]],
    ["AI taxonomy vertaling",     [true, true, true]],
    ["Hreflang manager",          [true, true, true]],
    ["Realtime voorraad sync",    [true, true, true]],
    ["Marketing & coupons",       [true, true, true]],
    ["AI image optimalisatie",    [false, true, true]],
    ["Prioriteit support",        [false, false, true]],
  ];

  return (
    <div style={{ padding: "80px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 12 }}>Eerlijke, schaalbare prijzen</h2>
        <p style={{ fontSize: 16, color: "var(--mx)", marginBottom: 28 }}>Kies het plan dat bij jouw aantal shops past. Geen verborgen kosten.</p>
        {/* Billing toggle */}
        <div style={{ display: "inline-flex", background: "var(--s2)", borderRadius: "var(--rd-lg)", padding: 4, border: "1px solid var(--b1)", gap: 4 }}>
          {[["monthly", "Maandelijks"], ["annual", `Jaarlijks · ${ANNUAL_DISCOUNT}% korting`]].map(([v, label]) => (
            <button key={v} onClick={() => setBilling(v)} style={{ padding: "7px 20px", borderRadius: "var(--rd)", border: "none", cursor: "pointer", fontSize: 13, fontWeight: billing === v ? 700 : 400, background: billing === v ? "var(--pr)" : "transparent", color: billing === v ? "#fff" : "var(--mx)", transition: "all 0.15s" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, alignItems: "start" }}>
        {PLAN_LIST.map((plan, i) => {
          const price   = billing === "annual" ? plan.annual_mo : plan.monthly;
          const popular = plan.id === "growth";
          return (
            <div key={plan.id} style={{ background: "var(--s1)", border: `2px solid ${popular ? "var(--pr)" : "var(--b1)"}`, borderRadius: "var(--rd-xl)", padding: 28, position: "relative", overflow: "hidden", transition: "transform 0.15s, border-color 0.15s" }}
              onMouseEnter={e => { if (!popular) e.currentTarget.style.borderColor = "var(--b3)"; e.currentTarget.style.transform = "translateY(-3px)"; }}
              onMouseLeave={e => { if (!popular) e.currentTarget.style.borderColor = "var(--b1)"; e.currentTarget.style.transform = "none"; }}>
              {popular && (
                <>
                  <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(91,91,214,0.25) 0%, transparent 70%)", pointerEvents: "none" }} />
                  <div style={{ position: "absolute", top: 14, right: 14, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "var(--pr)", color: "#fff" }}>POPULAIR</div>
                </>
              )}
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--mx)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{plan.name}</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 4 }}>
                <span style={{ fontSize: 42, fontWeight: 800, fontFamily: "var(--font-h)", letterSpacing: "-0.03em", lineHeight: 1 }}>€{price.toFixed(2).replace(".", ",")}</span>
                <span style={{ fontSize: 13, color: "var(--mx)", paddingBottom: 6 }}>/mo</span>
              </div>
              {billing === "annual" && (
                <div style={{ fontSize: 12, color: "var(--gr)", marginBottom: 4 }}>✓ Bespaar €{((plan.monthly - plan.annual_mo) * 12).toFixed(2).replace(".", ",")} per jaar</div>
              )}
              <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 20 }}>excl. BTW · {billing === "annual" ? "jaarlijks gefactureerd" : "maandelijks gefactureerd"}</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600, color: "var(--tx)" }}>
                  <span style={{ color: "var(--pr-h)" }}>🏪</span> Tot {plan.sites} shops
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600, color: "var(--tx)" }}>
                  <span style={{ color: "var(--pr-h)" }}>🔗</span> {plan.connected_products.toLocaleString("nl-NL")} verbonden producten
                </div>
                {FEATURES.map(([feat, avail]) => (
                  <div key={feat} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: avail[i] ? "var(--mx)" : "var(--b3)" }}>
                    <span style={{ fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{avail[i] ? "✓" : "–"}</span>
                    {feat}
                  </div>
                ))}
              </div>

              <Btn variant={popular ? "primary" : "secondary"} size="lg" onClick={() => onSignup(plan.id, billing)} style={{ width: "100%", fontSize: 14 }}>
                Aan de slag →
              </Btn>
            </div>
          );
        })}

        {/* Custom plan */}
        <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: "var(--rd-xl)", padding: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--mx)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Custom</div>
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-h)", marginBottom: 4, letterSpacing: "-0.02em" }}>Op maat</div>
          <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 20 }}>Meer dan 10 shops of enterprise wensen?</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {["Onbeperkt shops", "Onbeperkt producten", "SLA + uptime garantie", "Dedicated support", "Custom integraties"].map(f => (
              <div key={f} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--mx)" }}>
                <span style={{ fontWeight: 700, color: "var(--pr-h)" }}>✓</span> {f}
              </div>
            ))}
          </div>
          <a href="https://calendly.com/woosyncshop/demo" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
            <Btn variant="secondary" size="lg" style={{ width: "100%", fontSize: 14 }}>Inplannen →</Btn>
          </a>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 28, fontSize: 12, color: "var(--dm)" }}>
        Heb je een kortingscode? Die voer je in bij registratie. · Alle prijzen excl. BTW.
      </div>
    </div>
  );
};

const LandingPage = ({ onLogin, onSignup, onPage = () => {} }) => {
  const FEATURES = [
    { icon: "🏪", title: "Multi-shop dashboard", desc: "Beheer al jouw WooCommerce shops vanuit één overzichtelijk dashboard. Schakel moeiteloos tussen shops." },
    { icon: "🔄", title: "Slim synchroniseren", desc: "Koppel producten via SKU of identifier-attribuut. Sync specifieke velden, bewaar taalverschillen." },
    { icon: "📦", title: "Volledig productbeheer", desc: "Variabele producten, voorraadbeheer, tiered pricing, WQM quantity settings — alles op één plek." },
    { icon: "🤖", title: "AI Image pipeline", desc: "Automatische beeldoptimalisatie via Gemini en TinyPNG. Max 400KB, maximale kwaliteit." },
    { icon: "🌐", title: "Hreflang manager", desc: "Automatische hreflang-injectie voor je multiregionale webshops. Geen plugin nodig." },
    { icon: "📦", title: "Voorraad synchronisatie", desc: "Sync voorraad realtime tussen shops. Inventory-only modus voor aparte shops zonder hreflang-koppeling." },
  ];

  return (
    <div style={{ fontFamily: "var(--font-b)", minHeight: "100vh", background: "var(--bg)" }}>
      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, padding: "0 32px", height: 64, display: "flex", alignItems: "center", background: "rgba(8,11,18,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--b1)" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <img src="/woo-sync-shop-logo.png" alt="Woo Sync Shop" style={{ height: 28 }} />
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <Btn variant="ghost" onClick={onLogin}>Inloggen</Btn>
          <Btn variant="primary" onClick={onSignup}>Start vandaag</Btn>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ padding: "100px 32px 80px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(91,91,214,0.2) 0%, transparent 70%)", pointerEvents: "none" }} />
        <Badge color="blue" size="md" style={{ marginBottom: 20, display: "inline-flex" }}>Multi-shop WooCommerce beheer</Badge>
        <h1 style={{ fontSize: "clamp(36px, 5vw, 64px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: 20, maxWidth: 720, margin: "16px auto 20px" }}>
          Beheer al jouw webshops<br /><span style={{ color: "var(--pr-h)" }}>vanuit één interface</span>
        </h1>
        <p style={{ fontSize: 18, color: "var(--mx)", maxWidth: 540, margin: "0 auto 40px", lineHeight: 1.6 }}>
          Stop met inloggen op elk afzonderlijk WooCommerce dashboard. Woo Sync Shop synchroniseert producten, voorraad en prijzen tussen al jouw shops.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Btn variant="primary" size="lg" onClick={onSignup} style={{ fontSize: 15, padding: "13px 28px" }}>Start gratis →</Btn>
          <Btn variant="secondary" size="lg" style={{ fontSize: 15, padding: "13px 28px" }}>Bekijk demo</Btn>
        </div>
        <div style={{ marginTop: 60, display: "flex", justifyContent: "center" }}>
          <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: "var(--rd-xl)", overflow: "hidden", maxWidth: 840, width: "100%", boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}>
            <div style={{ background: "var(--s2)", padding: "10px 14px", display: "flex", gap: 6, alignItems: "center", borderBottom: "1px solid var(--b1)" }}>
              {["var(--re)", "var(--ac)", "var(--gr)"].map((c, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
              <div style={{ marginLeft: 8, background: "var(--s3)", borderRadius: 4, padding: "2px 12px", fontSize: 11, color: "var(--dm)" }}>app.woosyncshop.io</div>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {[{flag:"🇳🇱",name:"Webshop NL"},{flag:"🇧🇪",name:"Webshop BE (FR)"},{flag:"🇧🇪",name:"Webshop BE (NL)"}].map((s, i) => (
                  <div key={i} style={{ padding: "6px 12px", background: i === 0 ? "var(--s2)" : "transparent", border: i === 0 ? "1px solid var(--b2)" : "1px solid transparent", borderRadius: "var(--rd)", fontSize: 12, color: i === 0 ? "var(--tx)" : "var(--mx)" }}>{s.flag} {s.name}</div>
                ))}
              </div>
              {[{name:"Fargesia murielae Jumbo 100-125cm",type:"Variabel",stock:"Op voorraad"},{name:"Nitida Bamboe Planten Mix 100cm Triple Pack",type:"Variabel",stock:"Op voorraad"},{name:"Phyllostachys bissetii 150-175cm",type:"Enkelvoudig",stock:"Op voorraad"}].map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < 2 ? "1px solid var(--b1)" : "none" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 5, background: "var(--s3)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🪴</div>
                  <span style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <Badge color={p.type === "Variabel" ? "blue" : "default"} size="sm">{p.type}</Badge>
                  <Badge color="green" size="sm">{p.stock}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div style={{ padding: "80px 32px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 12 }}>Alles wat je nodig hebt</h2>
          <p style={{ fontSize: 16, color: "var(--mx)" }}>Gebouwd voor serieuze WooCommerce ondernemers die meerdere shops beheren</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ padding: 24, background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: "var(--rd-xl)", transition: "border-color 0.2s, transform 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--b3)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--b1)"; e.currentTarget.style.transform = "none"; }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: "var(--mx)", lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <LandingPricing onSignup={onSignup} />

      {/* Footer */}
      <div className="landing-footer">
        <div style={{ display: "flex", alignItems: "center" }}>
          <img src="/woo-sync-shop-logo.png" alt="Woo Sync Shop" style={{ height: 20 }} />
        </div>
        <div>© 2026 Woo Sync Shop · Alle rechten voorbehouden</div>
        <div style={{ display: "flex", gap: 16 }}>
          {[["Privacy", "privacy"], ["Voorwaarden", "voorwaarden"], ["Contact", "contact"]].map(([l, page]) => (
            <span key={l} onClick={() => onPage(page)} style={{ cursor: "pointer", color: "var(--mx)", transition: "color 0.15s" }}
              onMouseEnter={e => e.target.style.color = "var(--pr-h)"} onMouseLeave={e => e.target.style.color = "var(--mx)"}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Cookie Banner ────────────────────────────────────────────────────────────
const CookieBanner = ({ onAccept, onReject }) => (
  <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999, background: "var(--s1)", borderTop: "1px solid var(--b2)", padding: "16px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", boxShadow: "0 -4px 24px rgba(0,0,0,0.4)" }}>
    <div style={{ flex: 1, minWidth: 260 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>🍪 Wij gebruiken cookies</div>
      <div style={{ fontSize: 12, color: "var(--mx)", lineHeight: 1.5 }}>
        We gebruiken cookies voor analyses (Google Analytics) en advertenties (Google Ads). Functionele cookies zijn altijd actief.{" "}
        <span onClick={() => { history.pushState({}, "", "/privacy"); window.dispatchEvent(new PopStateEvent("popstate")); }} style={{ color: "var(--pr-h)", cursor: "pointer", textDecoration: "underline" }}>Lees ons cookiebeleid</span>.
      </div>
    </div>
    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
      <Btn variant="ghost" size="sm" onClick={onReject}>Alleen functioneel</Btn>
      <Btn variant="primary" size="sm" onClick={onAccept}>Alles accepteren</Btn>
    </div>
  </div>
);

// ─── GTM/GA4 Injector ─────────────────────────────────────────────────────────
const TrackingInjector = ({ consent }) => {
  useEffect(() => {
    const inject = async () => {
      if (consent !== "accepted") return;
      try {
        const res = await fetch("/api/platform-settings");
        const settings = await res.json();

        // ── GTM ──
        if (settings.gtm_id && !document.getElementById("wss-gtm")) {
          const s = document.createElement("script");
          s.id = "wss-gtm";
          s.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${settings.gtm_id}');`;
          document.head.appendChild(s);
          window.dataLayer = window.dataLayer || [];
        }

        // ── GA4 (direct, without GTM) ──
        if (settings.ga4_id && !document.getElementById("wss-ga4")) {
          const s = document.createElement("script");
          s.id = "wss-ga4";
          s.async = true;
          s.src = `https://www.googletagmanager.com/gtag/js?id=${settings.ga4_id}`;
          document.head.appendChild(s);
          window.dataLayer = window.dataLayer || [];
          window.gtag = function(){window.dataLayer.push(arguments);};
          window.gtag("js", new Date());
          window.gtag("config", settings.ga4_id);
        }

        // ── Meta Pixel (Facebook + Instagram) ──
        if (settings.fb_pixel_id && !document.getElementById("wss-fbq")) {
          const s = document.createElement("script");
          s.id = "wss-fbq";
          s.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${settings.fb_pixel_id}');fbq('track','PageView');`;
          document.head.appendChild(s);
        }

        // ── TikTok Pixel ──
        if (settings.tt_pixel_id && !document.getElementById("wss-ttq")) {
          const s = document.createElement("script");
          s.id = "wss-ttq";
          s.innerHTML = `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${settings.tt_pixel_id}');ttq.page()}(window,document,'ttq');`;
          document.head.appendChild(s);
        }
      } catch {}
    };
    inject();
  }, [consent]);
  return null;
};

// Helper: fire conversion events on signup (call this after successful registration)
window.wssTrackSignup = (email) => {
  try {
    // Google Ads
    if (window.gtag) {
      fetch("/api/platform-settings").then(r => r.json()).then(s => {
        if (s.gads_conversion_id && s.gads_conversion_label) {
          window.gtag("event", "conversion", { send_to: `${s.gads_conversion_id}/${s.gads_conversion_label}` });
        }
      }).catch(() => {});
    }
    // Meta Pixel
    if (window.fbq) window.fbq("track", "CompleteRegistration", { content_name: "WooSyncShop Signup" });
    // TikTok
    if (window.ttq) window.ttq.track("CompleteRegistration", { email });
    // GA4
    if (window.gtag) window.gtag("event", "signup_complete", { method: "email" });
  } catch {}
};

// ─── Page Layout Wrapper ───────────────────────────────────────────────────────
const PageLayout = ({ title, children, onBack }) => (
  <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-b)" }}>
    <nav style={{ position: "sticky", top: 0, zIndex: 100, padding: "0 32px", height: 64, display: "flex", alignItems: "center", background: "rgba(8,11,18,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--b1)" }}>
      <div onClick={onBack} style={{ cursor: "pointer", display: "flex", alignItems: "center" }}>
        <img src="/woo-sync-shop-logo.png" alt="Woo Sync Shop" style={{ height: 28 }} />
      </div>
      <button onClick={onBack} style={{ marginLeft: "auto", background: "transparent", border: "1px solid var(--b2)", borderRadius: "var(--rd)", padding: "6px 14px", color: "var(--mx)", cursor: "pointer", fontSize: 13 }}>← Terug</button>
    </nav>
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 32px 80px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, fontFamily: "var(--font-h)", letterSpacing: "-0.03em", marginBottom: 32, color: "var(--tx)" }}>{title}</h1>
      <div style={{ color: "var(--mx)", lineHeight: 1.8, fontSize: 15 }}>{children}</div>
    </div>
  </div>
);

const Sec = ({ title, children }) => (
  <div style={{ marginBottom: 32 }}>
    <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--tx)", marginBottom: 12 }}>{title}</h2>
    {children}
  </div>
);

// ─── Privacy Page ──────────────────────────────────────────────────────────────
const PrivacyPage = ({ onBack }) => (
  <PageLayout title="Privacybeleid" onBack={onBack}>
    <p style={{ color: "var(--dm)", fontSize: 13, marginBottom: 32 }}>Laatst bijgewerkt: 7 maart 2026</p>
    <Sec title="1. Wie zijn wij?">
      <p>WooSyncShop is een SaaS-platform voor het beheer van meerdere WooCommerce webshops. De dienst wordt aangeboden door <strong style={{color:"var(--tx)"}}>WooSyncShop</strong>, gevestigd in Nederland. Voor vragen over dit privacybeleid kunt u contact opnemen via <a href="mailto:privacy@woosyncshop.com" style={{color:"var(--pr-h)"}}>privacy@woosyncshop.com</a>.</p>
    </Sec>
    <Sec title="2. Welke gegevens verzamelen wij?">
      <p>Wij verzamelen de volgende persoonsgegevens:</p>
      <ul style={{ paddingLeft: 20, marginTop: 8 }}>
        <li><strong style={{color:"var(--tx)"}}>Accountgegevens:</strong> e-mailadres en naam bij registratie</li>
        <li><strong style={{color:"var(--tx)"}}>Betalingsgegevens:</strong> verwerkt via Mollie (wij slaan geen betaalkaartgegevens op)</li>
        <li><strong style={{color:"var(--tx)"}}>Shopgegevens:</strong> WooCommerce API-sleutels die u invoert om uw shops te verbinden</li>
        <li><strong style={{color:"var(--tx)"}}>Gebruiksgegevens:</strong> logs van API-aanroepen, foutmeldingen (geen persoonlijk surfgedrag)</li>
        <li><strong style={{color:"var(--tx)"}}>Analysegegevens:</strong> geanonimiseerde statistieken via Google Analytics 4 (alleen met uw toestemming)</li>
      </ul>
    </Sec>
    <Sec title="3. Waarvoor gebruiken wij uw gegevens?">
      <ul style={{ paddingLeft: 20 }}>
        <li>Het leveren en verbeteren van onze dienst</li>
        <li>Verzenden van transactionele e-mails (bevestigingen, facturen)</li>
        <li>Ondersteuning bij technische problemen</li>
        <li>Facturering en abonnementsbeheer</li>
      </ul>
    </Sec>
    <Sec title="4. Verwerkers en derden">
      <p>Wij maken gebruik van de volgende verwerkers:</p>
      <ul style={{ paddingLeft: 20, marginTop: 8 }}>
        <li><strong style={{color:"var(--tx)"}}>Supabase</strong> — authenticatie en database (EU-regio)</li>
        <li><strong style={{color:"var(--tx)"}}>Netlify</strong> — hosting en serverless functies</li>
        <li><strong style={{color:"var(--tx)"}}>Mollie</strong> — betalingsverwerking</li>
        <li><strong style={{color:"var(--tx)"}}>Resend</strong> — transactionele e-mail</li>
        <li><strong style={{color:"var(--tx)"}}>Google Analytics 4</strong> — websiteanalyse (alleen met toestemming)</li>
      </ul>
    </Sec>
    <Sec title="5. Bewaartermijnen">
      <p>Accountgegevens worden bewaard zolang uw account actief is. Na opzegging worden uw gegevens binnen 30 dagen verwijderd, tenzij wettelijke bewaarplicht anders vereist (bijv. factuurgegevens: 7 jaar).</p>
    </Sec>
    <Sec title="6. Uw rechten (AVG)">
      <p>U heeft recht op inzage, correctie, verwijdering, beperking van verwerking, dataportabiliteit en bezwaar. Verzoeken kunt u indienen via <a href="mailto:privacy@woosyncshop.com" style={{color:"var(--pr-h)"}}>privacy@woosyncshop.com</a>. Wij reageren binnen 30 dagen.</p>
    </Sec>
    <Sec title="7. Cookies">
      <p>Wij gebruiken:</p>
      <ul style={{ paddingLeft: 20, marginTop: 8 }}>
        <li><strong style={{color:"var(--tx)"}}>Functionele cookies:</strong> voor inlogstatus (altijd actief)</li>
        <li><strong style={{color:"var(--tx)"}}>Analytische cookies:</strong> Google Analytics 4 (alleen met toestemming)</li>
        <li><strong style={{color:"var(--tx)"}}>Marketingcookies:</strong> Google Ads (alleen met toestemming)</li>
      </ul>
      <p style={{marginTop:12}}>U kunt uw voorkeur altijd wijzigen via de cookiebanner onderaan de pagina.</p>
    </Sec>
    <Sec title="8. Contact en klachten">
      <p>Voor privacyvragen: <a href="mailto:privacy@woosyncshop.com" style={{color:"var(--pr-h)"}}>privacy@woosyncshop.com</a>. U heeft ook het recht een klacht in te dienen bij de Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl).</p>
    </Sec>
  </PageLayout>
);

// ─── Voorwaarden Page ──────────────────────────────────────────────────────────
const VoorwaardenPage = ({ onBack }) => (
  <PageLayout title="Algemene Voorwaarden" onBack={onBack}>
    <p style={{ color: "var(--dm)", fontSize: 13, marginBottom: 32 }}>Versie 1.0 — 7 maart 2026</p>
    <Sec title="1. Definities">
      <ul style={{ paddingLeft: 20 }}>
        <li><strong style={{color:"var(--tx)"}}>WooSyncShop:</strong> het platform en de aanbieder, geregistreerd in Nederland</li>
        <li><strong style={{color:"var(--tx)"}}>Gebruiker:</strong> iedere natuurlijke of rechtspersoon met een account</li>
        <li><strong style={{color:"var(--tx)"}}>Dienst:</strong> het SaaS-platform op woosyncshop.com</li>
      </ul>
    </Sec>
    <Sec title="2. Toegang tot de dienst">
      <p>WooSyncShop biedt één abonnementsmodel: <strong style={{color:"var(--tx)"}}>Pro</strong> voor €19,99/maand, waarmee tot 10 WordPress-installaties beheerd kunnen worden. Toegang wordt verleend na succesvolle betaling via Mollie.</p>
    </Sec>
    <Sec title="3. Betaling en opzegging">
      <ul style={{ paddingLeft: 20 }}>
        <li>Abonnementen worden maandelijks automatisch verlengd</li>
        <li>Opzegging kan op elk moment via Instellingen → Abonnement</li>
        <li>Na opzegging blijft toegang actief tot het einde van de betaalde periode</li>
        <li>Geen restitutie voor lopende periodes</li>
        <li>Bij betalingsachterstand wordt toegang tijdelijk opgeschort</li>
      </ul>
    </Sec>
    <Sec title="4. Gebruik van de dienst">
      <ul style={{ paddingLeft: 20 }}>
        <li>U bent verantwoordelijk voor de beveiliging van uw inloggegevens</li>
        <li>Het is verboden de dienst te gebruiken voor illegale activiteiten</li>
        <li>WooCommerce API-sleutels worden versleuteld opgeslagen</li>
        <li>U bent zelf verantwoordelijk voor correcte hreflang-implementatie op uw sites</li>
      </ul>
    </Sec>
    <Sec title="5. Beschikbaarheid">
      <p>WooSyncShop streeft naar 99,5% uptime maar geeft hierop geen garantie. Gepland onderhoud wordt minimaal 24 uur van tevoren aangekondigd. Bij storingen kunt u contact opnemen via support@woosyncshop.com.</p>
    </Sec>
    <Sec title="6. Aansprakelijkheid">
      <p>WooSyncShop is niet aansprakelijk voor indirecte schade, gederfde winst of verlies van data als gevolg van het gebruik van de dienst. De totale aansprakelijkheid is beperkt tot het bedrag dat u in de afgelopen 3 maanden heeft betaald.</p>
    </Sec>
    <Sec title="7. Intellectueel eigendom">
      <p>Alle rechten op het platform, de software en de documentatie berusten bij WooSyncShop. Het is niet toegestaan de software te kopiëren, aan te passen of door te verkopen zonder schriftelijke toestemming.</p>
    </Sec>
    <Sec title="8. Toepasselijk recht">
      <p>Op deze voorwaarden is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter in Nederland.</p>
    </Sec>
    <Sec title="9. Wijzigingen">
      <p>WooSyncShop behoudt het recht deze voorwaarden te wijzigen. Wijzigingen worden minimaal 30 dagen van tevoren per e-mail aangekondigd.</p>
    </Sec>
    <Sec title="10. Contact">
      <p>WooSyncShop · info@woosyncshop.com · woosyncshop.com</p>
    </Sec>
  </PageLayout>
);

// ─── Contact Page ──────────────────────────────────────────────────────────────
const SUPPORT_SUBJECTS = [
  "Technisch probleem",
  "Factuur / Betaling",
  "Plan upgrade of downgrade",
  "Shop verbinding instellen",
  "Producten koppelen / matching",
  "AI functies (vertaling, matching)",
  "Feature verzoek",
  "Account verwijderen",
  "Overig",
];

const SupportForm = ({ prefillEmail = "" }) => {
  const [form, setForm] = useState({ name: "", email: prefillEmail, subject: SUPPORT_SUBJECTS[0], message: "" });
  const [status, setStatus] = useState(null);
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const send = async () => {
    if (!form.name || !form.email || !form.message) return alert("Vul naam, e-mail en bericht in.");
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) { setStatus("ok"); setForm(f => ({ ...f, message: "" })); }
      else setStatus("error");
    } catch { setStatus("error"); }
  };

  if (status === "ok") return (
    <div style={{ padding: "24px 20px", background: "var(--gr-l)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "var(--rd-lg)", textAlign: "center" }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Bericht ontvangen!</div>
      <div style={{ fontSize: 13, color: "var(--mx)" }}>We reageren binnen 1 werkdag via {form.email}.</div>
      <Btn variant="secondary" size="sm" onClick={() => setStatus(null)} style={{ marginTop: 14 }}>Nog een vraag</Btn>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="settings-2col">
        <Field label="Naam *"><Inp value={form.name} onChange={e => upd("name", e.target.value)} placeholder="Jouw naam" /></Field>
        <Field label="E-mailadres *"><Inp value={form.email} onChange={e => upd("email", e.target.value)} type="email" placeholder="jij@domein.nl" /></Field>
      </div>
      <Field label="Onderwerp">
        <Sel value={form.subject} onChange={e => upd("subject", e.target.value)}
          options={SUPPORT_SUBJECTS.map(s => ({ value: s, label: s }))} />
      </Field>
      <Field label="Bericht *">
        <Inp value={form.message} onChange={e => upd("message", e.target.value)} multiline rows={5} placeholder="Beschrijf je vraag zo volledig mogelijk..." />
      </Field>
      {status === "error" && <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--rd)", fontSize: 13, color: "#ef4444" }}>Versturen mislukt. Mail ons op info@woosyncshop.com</div>}
      <Btn variant="primary" onClick={send} disabled={status === "sending"}>{status === "sending" ? "Verzenden..." : "Bericht sturen →"}</Btn>
    </div>
  );
};

const ContactPage = ({ onBack }) => (
  <PageLayout title="Support & Contact" onBack={onBack}>
    <p style={{ marginBottom: 32 }}>Heb je een vraag, technisch probleem of wil je je plan aanpassen? We zijn snel bereikbaar.</p>

    {/* Contact options */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 36 }}>
      {[
        { icon: "💬", title: "WhatsApp", sub: "Direct antwoord", val: "+31 (0)6 4020 3503", href: "https://wa.me/31640203503", cta: "Open WhatsApp", color: "#25D366" },
        { icon: "📞", title: "Bellen", sub: "Ma–Vr 9:00–18:00", val: "+31 (0)6 4020 3503", href: "tel:+31640203503", cta: "Bellen", color: "var(--pr-h)" },
        { icon: "📧", title: "E-mail", sub: "Reactie binnen 1 werkdag", val: "info@woosyncshop.com", href: "mailto:info@woosyncshop.com", cta: "Mailen", color: "var(--ac)" },
      ].map(c => (
        <a key={c.title} href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer"
          style={{ textDecoration: "none", padding: "18px 20px", background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd-xl)", display: "flex", flexDirection: "column", gap: 4, transition: "border-color 0.15s, transform 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--b3)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--b1)"; e.currentTarget.style.transform = "none"; }}>
          <span style={{ fontSize: 26, marginBottom: 4 }}>{c.icon}</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--tx)" }}>{c.title}</span>
          <span style={{ fontSize: 12, color: "var(--dm)" }}>{c.sub}</span>
          <span style={{ fontSize: 13, color: c.color, fontWeight: 600, marginTop: 4 }}>{c.val}</span>
        </a>
      ))}
    </div>

    {/* Form */}
    <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: "var(--rd-xl)", padding: 24 }}>
      <h3 style={{ fontWeight: 700, marginBottom: 4 }}>Stuur een bericht</h3>
      <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 20 }}>Vul het formulier in en we reageren via e-mail.</p>
      <SupportForm />
    </div>
  </PageLayout>
);

// ─── Tracking Admin Tab ────────────────────────────────────────────────────────
// ─── System Logs Panel ────────────────────────────────────────────────────────
const LEVEL_COLORS = {
  error: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", text: "var(--re)", dot: "#ef4444" },
  warn:  { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", text: "var(--am)", dot: "#f59e0b" },
  info:  { bg: "rgba(99,102,241,0.06)", border: "rgba(99,102,241,0.2)", text: "var(--pr-h)", dot: "#6366f1" },
};

// ─── Tracking Settings (superadmin) ───────────────────────────────────────────
const TrackingSettings = () => {
  const [ts, setTs] = useState({
    gtm_id: "", ga4_id: "",
    gads_conversion_id: "", gads_conversion_label: "",
    fb_pixel_id: "", tt_pixel_id: "",
    google_connected: false, google_connected_email: null,
  });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [fetching, setFetching] = useState(false);
  const [googleData, setGoogleData] = useState(null); // { gtm:[], ga4:[], gads:[], gads_note }
  const [fetchError, setFetchError] = useState(null);

  // Load current settings
  const load = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/platform-settings", { headers: { "Authorization": `Bearer ${session?.access_token}` } });
      const d = await res.json();
      setTs({
        gtm_id: d.gtm_id || "",
        ga4_id: d.ga4_id || "",
        gads_conversion_id: d.gads_conversion_id || "",
        gads_conversion_label: d.gads_conversion_label || "",
        fb_pixel_id: d.fb_pixel_id || "",
        tt_pixel_id: d.tt_pixel_id || "",
        google_connected: !!d.google_connected,
        google_connected_email: d.google_connected_email || null,
      });
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    // Handle OAuth redirect back with ?google_oauth=success/error
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get("google_oauth");
    if (oauthResult === "success") {
      window.history.replaceState({}, "", window.location.pathname);
      load(); // reload to get connected email
    } else if (oauthResult === "error") {
      const reason = params.get("reason") || "Onbekende fout";
      setFetchError(`Google koppeling mislukt: ${reason}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // After connecting, fetch GTM/GA4/Ads data from Google APIs
  const fetchGoogleData = async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/google-tracking-fetch", { headers: { "Authorization": `Bearer ${session?.access_token}` } });
      const d = await res.json();
      if (d.error === "not_connected") { setFetchError("Nog niet gekoppeld met Google."); return; }
      if (d.error) throw new Error(d.error);
      setGoogleData(d);
    } catch (e) { setFetchError(e.message); }
    finally { setFetching(false); }
  };

  const disconnect = async () => {
    if (!confirm("Google koppeling verwijderen?")) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch("/api/google-tracking-disconnect", { method: "POST", headers: { "Authorization": `Bearer ${session?.access_token}` } });
      setTs(s => ({ ...s, google_connected: false, google_connected_email: null }));
      setGoogleData(null);
    } catch (e) { alert(e.message); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/platform-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify(ts),
      });
      if (!res.ok) throw new Error("Opslaan mislukt");
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const TrackCard = ({ icon, title, hint, active, children, noBadge }) => (
    <div style={{ border: `1px solid ${active ? "rgba(99,102,241,0.35)" : "var(--b1)"}`, borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}><span>{icon}</span>{title}</div>
        {!noBadge && (active
          ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "rgba(34,197,94,0.15)", color: "#22c55e", fontWeight: 700 }}>● ACTIEF</span>
          : <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "var(--s3)", color: "var(--dm)", fontWeight: 600 }}>NIET INGESTELD</span>
        )}
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {hint && <div style={{ fontSize: 12, color: "var(--mx)", lineHeight: 1.6, padding: "8px 12px", background: "var(--s3)", borderRadius: "var(--rd)" }}>{hint}</div>}
        {children}
      </div>
    </div>
  );

  const DropdownSelect = ({ label, hint, value, onChange, options, placeholder }) => (
    <Field label={label} hint={hint}>
      <Sel
        value={value}
        onChange={onChange}
        options={[
          { value: "", label: placeholder || "— Selecteer —" },
          ...options.map(o => ({ value: o.id, label: o.label })),
        ]}
      />
    </Field>
  );

  if (loading) return <div style={{ padding: 20, color: "var(--mx)", fontSize: 13 }}>Laden...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 700 }}>

      {/* ── Google OAuth Connect ── */}
      <div style={{ padding: 16, borderRadius: "var(--rd-lg)", border: `2px solid ${ts.google_connected ? "rgba(34,197,94,0.4)" : "rgba(99,102,241,0.3)"}`, background: ts.google_connected ? "rgba(34,197,94,0.04)" : "rgba(99,102,241,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {ts.google_connected ? "✓ Gekoppeld met Google" : "Koppel met Google"}
              </div>
              <div style={{ fontSize: 12, color: "var(--mx)", marginTop: 2 }}>
                {ts.google_connected
                  ? <>Account: <strong style={{ color: "var(--tx)" }}>{ts.google_connected_email}</strong> · GTM, GA4 en Google Ads worden opgehaald</>
                  : "Eenmalig inloggen → automatisch GTM containers, GA4 properties en Google Ads accounts ophalen"
                }
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {ts.google_connected ? (
              <>
                <Btn variant="secondary" size="sm" onClick={fetchGoogleData} disabled={fetching}>
                  {fetching ? "↻ Ophalen..." : "↻ Vernieuwen"}
                </Btn>
                <Btn variant="ghost" size="sm" onClick={disconnect} style={{ color: "var(--re)" }}>
                  Ontkoppelen
                </Btn>
              </>
            ) : (
              <a href="/api/google-oauth-init" style={{ textDecoration: "none" }}>
                <Btn variant="primary" size="sm" icon={
                  <svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/></svg>
                }>
                  Koppelen met Google
                </Btn>
              </a>
            )}
          </div>
        </div>
        {fetchError && <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--rd)", fontSize: 12, color: "var(--re)" }}>⚠ {fetchError}</div>}
        {!ts.google_connected && (
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--dm)", lineHeight: 1.6 }}>
            Vereist: <strong>GOOGLE_CLIENT_ID</strong> en <strong>GOOGLE_CLIENT_SECRET</strong> in Netlify environment variables (Settings → Environment variables). Stel de OAuth Redirect URI in op <code style={{ background: "var(--s3)", padding: "1px 5px", borderRadius: 3 }}>https://woosyncshop.com/api/google-oauth-callback</code> in Google Cloud Console → APIs & Services → Credentials.
          </div>
        )}
      </div>

      {/* ── GTM ── */}
      <TrackCard icon="📊" title="Google Tag Manager" active={!!ts.gtm_id}
        hint="GTM is de aanbevolen aanpak. Alle andere Google tags (GA4, Ads) kun je dan via GTM beheren zonder code-aanpassingen.">
        {googleData?.gtm?.length > 0 ? (
          <DropdownSelect
            label="GTM Container" hint="Geselecteerde container wordt automatisch geladen"
            value={ts.gtm_id} onChange={v => setTs(s => ({ ...s, gtm_id: v }))}
            options={googleData.gtm} placeholder="— Selecteer container —"
          />
        ) : (
          <Field label="GTM Container ID" hint="Bijv. GTM-XXXXXXX — of koppel Google hierboven om containers op te halen">
            <Inp value={ts.gtm_id} onChange={e => setTs(s => ({ ...s, gtm_id: e.target.value }))} placeholder="GTM-XXXXXXX" />
          </Field>
        )}
        {googleData?.gtm_error && <div style={{ fontSize: 11, color: "var(--am)" }}>⚠ GTM ophalen mislukt: {googleData.gtm_error}</div>}
      </TrackCard>

      {/* ── GA4 ── */}
      <TrackCard icon="📈" title="Google Analytics 4" active={!!ts.ga4_id}
        hint="Directe GA4 integratie via gtag.js. Gebruik dit als je geen GTM gebruikt.">
        {googleData?.ga4?.length > 0 ? (
          <DropdownSelect
            label="GA4 Property" hint="Measurement ID wordt automatisch ingevuld"
            value={ts.ga4_id} onChange={v => setTs(s => ({ ...s, ga4_id: v }))}
            options={googleData.ga4} placeholder="— Selecteer property —"
          />
        ) : (
          <Field label="GA4 Measurement ID" hint="Bijv. G-XXXXXXXXXX — of koppel Google hierboven om properties op te halen">
            <Inp value={ts.ga4_id} onChange={e => setTs(s => ({ ...s, ga4_id: e.target.value }))} placeholder="G-XXXXXXXXXX" />
          </Field>
        )}
        {googleData?.ga4_error && <div style={{ fontSize: 11, color: "var(--am)" }}>⚠ GA4 ophalen mislukt: {googleData.ga4_error}</div>}
      </TrackCard>

      {/* ── Google Ads ── */}
      <TrackCard icon="🎯" title="Google Ads Conversies" active={!!(ts.gads_conversion_id && ts.gads_conversion_label)}
        hint="Conversie-event wordt gefired bij elke nieuwe registratie. Zorg dat GTM of GA4 ook ingesteld is.">
        {googleData?.gads?.length > 0 ? (
          <DropdownSelect
            label="Conversie actie" hint="Conversion ID en label worden automatisch ingevuld"
            value={ts.gads_conversion_id}
            onChange={v => {
              const match = googleData.gads.find(g => g.conversion_id === v);
              setTs(s => ({ ...s, gads_conversion_id: match?.conversion_id || v, gads_conversion_label: match?.conversion_label || "" }));
            }}
            options={googleData.gads.map(g => ({ id: g.conversion_id, label: g.label }))}
            placeholder="— Selecteer conversie actie —"
          />
        ) : (
          <div className="settings-2col">
            <Field label="Conversion ID" hint="Bijv. AW-123456789">
              <Inp value={ts.gads_conversion_id} onChange={e => setTs(s => ({ ...s, gads_conversion_id: e.target.value }))} placeholder="AW-123456789" />
            </Field>
            <Field label="Conversion Label" hint="Bijv. AbCdEfGhIjKlMnOp">
              <Inp value={ts.gads_conversion_label} onChange={e => setTs(s => ({ ...s, gads_conversion_label: e.target.value }))} placeholder="AbCdEfGhIjKlMnOp" />
            </Field>
          </div>
        )}
        {googleData?.gads_note && (
          <div style={{ fontSize: 12, color: "var(--mx)", padding: "8px 12px", background: "rgba(234,179,8,0.07)", border: "1px solid rgba(234,179,8,0.2)", borderRadius: "var(--rd)" }}>
            ⚠ {googleData.gads_note}
          </div>
        )}
        {googleData?.gads_error && <div style={{ fontSize: 11, color: "var(--am)" }}>⚠ Google Ads ophalen mislukt: {googleData.gads_error}</div>}
        {(ts.gads_conversion_id || ts.gads_conversion_label) && (
          <div style={{ fontSize: 11, color: "var(--dm)", padding: "6px 10px", background: "var(--s3)", borderRadius: "var(--rd)" }}>
            Ingesteld: <code>{ts.gads_conversion_id}/{ts.gads_conversion_label}</code>
          </div>
        )}
      </TrackCard>

      {/* ── Meta Pixel ── */}
      <TrackCard icon="🟦" title="Meta Pixel — Facebook & Instagram" active={!!ts.fb_pixel_id}
        hint="Één pixel dekt Facebook én Instagram Ads. PageView wordt automatisch gefired. CompleteRegistration bij nieuwe aanmeldingen.">
        <Field label="Meta Pixel ID" hint="Events Manager → Pixels in Facebook Business Manager">
          <Inp value={ts.fb_pixel_id} onChange={e => setTs(s => ({ ...s, fb_pixel_id: e.target.value }))} placeholder="1234567890123456" />
        </Field>
      </TrackCard>

      {/* ── TikTok ── */}
      <TrackCard icon="🎵" title="TikTok Pixel" active={!!ts.tt_pixel_id}
        hint="TikTok Ads Manager → Assets → Events → Web Events. PageView + CompleteRegistration worden automatisch gefired.">
        <Field label="TikTok Pixel ID" hint="Bijv. CXXXXXXXXXXXXXXX">
          <Inp value={ts.tt_pixel_id} onChange={e => setTs(s => ({ ...s, tt_pixel_id: e.target.value }))} placeholder="CXXXXXXXXXXXXXXX" />
        </Field>
      </TrackCard>

      {/* ── Search Console ── */}
      <TrackCard icon="🔍" title="Google Search Console" noBadge hint="Verifieer eigenaarschap via DNS-record of HTML-tag. Voeg na verificatie de sitemap toe.">
        <div style={{ fontFamily: "monospace", fontSize: 13, padding: "8px 12px", background: "var(--s3)", borderRadius: "var(--rd)", color: "var(--gr)", userSelect: "all" }}>
          https://woosyncshop.com/sitemap.xml
        </div>
        <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "var(--pr-h)", textDecoration: "none" }}>
          → Openen in Search Console ↗
        </a>
      </TrackCard>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Btn variant="primary" onClick={save} disabled={saving} style={{ minWidth: 180 }}>
          {saving ? "Opslaan..." : "Tracking opslaan"}
        </Btn>
        {saved && <span style={{ fontSize: 13, color: "#22c55e" }}>✓ Opgeslagen</span>}
      </div>

    </div>
  );
};

const SystemLogsPanel = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState("all");
  const [fnFilter, setFnFilter] = useState("all");
  const [clearing, setClearing] = useState(false);

  const loadLogs = async (level, fn) => {
    const lvl = level !== undefined ? level : levelFilter;
    const f = fn !== undefined ? fn : fnFilter;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const params = new URLSearchParams({ limit: "300" });
      if (lvl !== "all") params.set("level", lvl);
      if (f !== "all") params.set("fn", f);
      const res = await fetch(`/api/system-logs?${params}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Laden mislukt");
      const data = await res.json();
      setLogs(data);
    } catch (e) { console.error("Failed to load logs:", e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadLogs("all", "all"); }, []);

  const clearLogs = async () => {
    if (!confirm("Alle logs wissen?")) return;
    setClearing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      await fetch("/api/system-logs", { method: "DELETE", headers: { "Authorization": `Bearer ${token}` } });
      setLogs([]);
    } catch (e) { alert("Wissen mislukt: " + e.message); }
    finally { setClearing(false); }
  };

  const fnNames = ["all", ...new Set(logs.map(l => l.function_name).filter(Boolean))];
  const filteredLogs = logs.filter(l =>
    (levelFilter === "all" || l.level === levelFilter) &&
    (fnFilter === "all" || l.function_name === fnFilter)
  );
  const counts = { error: 0, warn: 0, info: 0 };
  logs.forEach(l => { if (counts[l.level] !== undefined) counts[l.level]++; });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {["error","warn","info"].map(lvl => (
            <div key={lvl} style={{ padding: "4px 10px", background: LEVEL_COLORS[lvl].bg, border: `1px solid ${LEVEL_COLORS[lvl].border}`, borderRadius: 20, fontSize: 11, color: LEVEL_COLORS[lvl].text, fontWeight: 700 }}>
              {lvl.toUpperCase()} · {counts[lvl]}
            </div>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <select value={levelFilter} onChange={e => { setLevelFilter(e.target.value); loadLogs(e.target.value, fnFilter); }}
            style={{ padding: "5px 10px", background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: "var(--rd)", fontSize: 12, color: "var(--tx)", cursor: "pointer" }}>
            <option value="all">Alle niveaus</option>
            <option value="error">Errors</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
          </select>
          <select value={fnFilter} onChange={e => { setFnFilter(e.target.value); loadLogs(levelFilter, e.target.value); }}
            style={{ padding: "5px 10px", background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: "var(--rd)", fontSize: 12, color: "var(--tx)", cursor: "pointer" }}>
            {fnNames.map(f => <option key={f} value={f}>{f === "all" ? "Alle functies" : f}</option>)}
          </select>
          <Btn variant="secondary" size="sm" onClick={() => loadLogs()}>↻ Vernieuwen</Btn>
          <Btn variant="ghost" size="sm" onClick={clearLogs} disabled={clearing} style={{ color: "var(--re)" }}>
            {clearing ? "Wissen..." : "🗑 Alles wissen"}
          </Btn>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--dm)" }}>
        Logs worden automatisch verwijderd na 7 dagen · {filteredLogs.length} van {logs.length} getoond
      </div>
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 0", color: "var(--mx)", fontSize: 13 }}>
          <span style={{ animation: "spin 0.8s linear infinite", display: "inline-block" }}>↻</span> Logs laden...
        </div>
      ) : filteredLogs.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--dm)", fontSize: 13 }}>
          Geen logs gevonden {levelFilter !== "all" || fnFilter !== "all" ? "voor dit filter" : "— systeem is schoon ✓"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 560, overflowY: "auto" }}>
          {filteredLogs.map((log, i) => {
            const c = LEVEL_COLORS[log.level] || LEVEL_COLORS.info;
            const ts = new Date(log.created_at).toLocaleString("nl-NL");
            return (
              <div key={log.id || i} style={{ padding: "10px 14px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: "var(--rd)" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.dot, flexShrink: 0, marginTop: 4 }} />
                  <span style={{ color: c.text, fontWeight: 700, fontSize: 11, textTransform: "uppercase", minWidth: 40, flexShrink: 0 }}>{log.level}</span>
                  <span style={{ color: "var(--pr-h)", fontWeight: 600, fontSize: 11, minWidth: 100, flexShrink: 0 }}>{log.function_name}</span>
                  <span style={{ color: "var(--tx)", flex: 1, fontSize: 12 }}>{log.message}</span>
                  <span style={{ color: "var(--dm)", fontSize: 11, flexShrink: 0 }}>{ts}</span>
                </div>
                {log.meta && (
                  <pre style={{ margin: "6px 0 0 57px", fontSize: 11, color: "var(--mx)", background: "rgba(0,0,0,0.15)", padding: "6px 10px", borderRadius: 4, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {JSON.stringify(log.meta, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Platform Settings Component ──────────────────────────────────────────────
// Use-cases that actually make AI calls (normalization is pure JS, excluded)
const AI_USE_CASES = [
  { id: "matching",    label: "🔍 Product matching",         hint: "AI scan to find equivalent products across shops" },
  { id: "translation", label: "🌐 Taxonomy vertaling",       hint: "Categories & attributes vertalen bij sync" },
  { id: "image",       label: "🖼 Afbeelding optimalisatie", hint: "Gemini resize voor TinyPNG compressie", geminiOnly: true },
];

const GEMINI_MODELS = [
  { value: "gemini-2.0-flash",      label: "gemini-2.0-flash (standaard)" },
  { value: "gemini-2.0-flash-lite", label: "gemini-2.0-flash-lite (snel/goedkoop)" },
  { value: "gemini-1.5-pro",        label: "gemini-1.5-pro (krachtig)" },
  { value: "gemini-1.5-flash",      label: "gemini-1.5-flash" },
];
const OPENAI_MODELS = [
  { value: "gpt-4o-mini",   label: "gpt-4o-mini (standaard)" },
  { value: "gpt-4o",        label: "gpt-4o (krachtig)" },
  { value: "gpt-4-turbo",   label: "gpt-4-turbo" },
  { value: "gpt-3.5-turbo", label: "gpt-3.5-turbo (snel/goedkoop)" },
];

const ProviderToggle = ({ value, onChange, geminiOnly = false }) => (
  <div style={{ display: "flex", borderRadius: "var(--rd)", overflow: "hidden", border: "1px solid var(--b2)", width: "fit-content" }}>
    {["gemini", "openai"].map(opt => {
      const disabled = geminiOnly && opt === "openai";
      return (
        <button key={opt} onClick={() => !disabled && onChange(opt)} style={{ padding: "5px 14px", fontSize: 12, fontWeight: value === opt ? 700 : 400, background: value === opt ? "var(--pr)" : "transparent", color: value === opt ? "#fff" : disabled ? "var(--b3)" : "var(--mx)", border: "none", cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.15s" }} title={disabled ? "Image pipeline gebruikt altijd Gemini" : undefined}>
          {opt === "gemini" ? "✦ Gemini" : "⬡ OpenAI"}
        </button>
      );
    })}
  </div>
);

const ModelSelect = ({ provider, value, onChange, label, hint }) => {
  const models = provider === "openai" ? OPENAI_MODELS : GEMINI_MODELS;
  return (
    <Field label={label} hint={hint}>
      <Sel
        value={value || ""}
        onChange={v => onChange(v)}
        options={[
          { value: "", label: `— Standaard (${provider === "openai" ? "gpt-4o-mini" : "gemini-2.0-flash"}) —` },
          ...models.map(m => ({ value: m.value, label: m.label })),
        ]}
      />
    </Field>
  );
};

const PlatformSettings = () => {
  const [ps, setPs] = useState({
    gemini_api_key: "", tinypng_api_key: "", mollie_api_key: "", contact_notification_email: "",
    openai_api_key: "",
    ai_provider_matching: "gemini", ai_provider_translation: "gemini",
    ai_provider_image: "gemini", ai_provider_normalization: "gemini",
    ai_model_matching: "", ai_model_translation: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [methods, setMethods] = useState([]);
  const [methodsLoading, setMethodsLoading] = useState(false);

  const loadMethods = async () => {
    setMethodsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/mollie-payments?type=methods", { headers: { "Authorization": `Bearer ${session?.access_token}` } });
      const data = await res.json();
      setMethods(data.methods || []);
    } catch {} finally { setMethodsLoading(false); }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/platform-settings", { headers: { "Authorization": `Bearer ${session?.access_token}` } });
        const d = await res.json();
        setPs(p => ({
          ...p,
          gemini_api_key: d.gemini_api_key || "",
          tinypng_api_key: d.tinypng_api_key || "",
          mollie_api_key: d.mollie_api_key || "",
          contact_notification_email: d.contact_notification_email || "",
          openai_api_key: d.openai_api_key || "",
          ai_provider_matching: d.ai_provider_matching || "gemini",
          ai_provider_translation: d.ai_provider_translation || "gemini",
          ai_provider_image: d.ai_provider_image || "gemini",
          ai_provider_normalization: d.ai_provider_normalization || "gemini",
          ai_model_matching: d.ai_model_matching || "",
          ai_model_translation: d.ai_model_translation || "",
        }));
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch("/api/platform-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify(ps),
      });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { alert("Opslaan mislukt: " + e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: 20, color: "var(--mx)", fontSize: 13 }}>Laden...</div>;

  const hasGemini = !!ps.gemini_api_key;
  const hasOpenAI = !!ps.openai_api_key;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── API Keys ── */}
      <div style={{ padding: 16, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🔑 AI API Keys</div>
        <div style={{ fontSize: 12, color: "var(--mx)", marginBottom: 14 }}>Voeg één of beide toe. Je kiest per use-case welke je gebruikt.</div>
        <div className="settings-2col">
          <Field label="Google Gemini API Key" hint={hasGemini ? "✓ Ingesteld" : "Geen key → Gemini use-cases uitgeschakeld"}>
            <Inp value={ps.gemini_api_key} onChange={e => setPs(p => ({ ...p, gemini_api_key: e.target.value }))} type="password" placeholder="AIzaSy..." />
          </Field>
          <Field label="OpenAI API Key" hint={hasOpenAI ? "✓ Ingesteld" : "Geen key → OpenAI use-cases uitgeschakeld"}>
            <Inp value={ps.openai_api_key} onChange={e => setPs(p => ({ ...p, openai_api_key: e.target.value }))} type="password" placeholder="sk-..." />
          </Field>
          <Field label="TinyPNG API Key" hint="Gebruikt voor afbeelding compressie na Gemini resize">
            <Inp value={ps.tinypng_api_key} onChange={e => setPs(p => ({ ...p, tinypng_api_key: e.target.value }))} type="password" placeholder="abcdef..." />
          </Field>
        </div>
      </div>

      {/* ── AI Provider per use-case ── */}
      <div style={{ padding: 16, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🧠 AI Provider per use-case</div>
        <div style={{ fontSize: 12, color: "var(--mx)", marginBottom: 14 }}>Kies per functionaliteit welk model wordt gebruikt. Grijs = betreffende key ontbreekt.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {AI_USE_CASES.map(uc => {
            const provKey = `ai_provider_${uc.id}`;
            const current = ps[provKey] || "gemini";
            return (
              <div key={uc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", background: "var(--s1)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{uc.label}</div>
                  <div style={{ fontSize: 11, color: "var(--dm)" }}>{uc.hint}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {current === "gemini" && !hasGemini && (
                    <span style={{ fontSize: 11, color: "var(--am)", background: "rgba(234,179,8,0.1)", padding: "2px 7px", borderRadius: 10 }}>⚠ key ontbreekt</span>
                  )}
                  {current === "openai" && !hasOpenAI && (
                    <span style={{ fontSize: 11, color: "var(--am)", background: "rgba(234,179,8,0.1)", padding: "2px 7px", borderRadius: 10 }}>⚠ key ontbreekt</span>
                  )}
                  <ProviderToggle value={current} onChange={v => setPs(p => ({ ...p, [provKey]: v }))} geminiOnly={uc.geminiOnly} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Model overrides */}
        <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--s1)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: "var(--mx)" }}>Model selectie <span style={{ fontWeight: 400 }}>(optioneel — standaard = snelste model per provider)</span></div>
          <div className="settings-2col">
            <ModelSelect
              provider={ps.ai_provider_matching}
              value={ps.ai_model_matching}
              onChange={v => setPs(p => ({ ...p, ai_model_matching: v }))}
              label="Matching model"
              hint={`Provider: ${ps.ai_provider_matching}`}
            />
            <ModelSelect
              provider={ps.ai_provider_translation}
              value={ps.ai_model_translation}
              onChange={v => setPs(p => ({ ...p, ai_model_translation: v }))}
              label="Vertaling model"
              hint={`Provider: ${ps.ai_provider_translation}`}
            />
          </div>
        </div>
      </div>



      {/* ── Mollie ── */}
      <div style={{ padding: 16, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>🔌 Mollie configuratie</div>
        <div className="settings-2col">
          <Field label="Mollie API Key (Live)">
            <Inp value={ps.mollie_api_key} onChange={e => setPs(p => ({ ...p, mollie_api_key: e.target.value }))} type="password" placeholder="live_..." />
          </Field>
          <Field label="Webhook URL" hint="Automatisch ingesteld per betaling">
            <Inp value="https://woosyncshop.com/api/mollie-webhook" onChange={() => {}} style={{ opacity: 0.6 }} />
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Actieve betaalmethoden</div>
            <Btn variant="ghost" size="sm" onClick={loadMethods} disabled={methodsLoading}>{methodsLoading ? "Laden..." : "↻ Vernieuwen"}</Btn>
          </div>
          {methods.length === 0 && !methodsLoading && (
            <div style={{ fontSize: 12, color: "var(--dm)" }}>Sla eerst een Mollie API key op, klik daarna op Vernieuwen.</div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {methods.map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "var(--s3)", borderRadius: 20, border: "1px solid var(--b1)", fontSize: 12 }}>
                {m.image && <img src={m.image} alt={m.description} style={{ height: 16 }} />}
                {m.description}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Contact email ── */}
      <div style={{ padding: 16, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>📧 Contactformulier notificaties</div>
        <div style={{ maxWidth: 360 }}>
          <Field label="Notificatie e-mailadres" hint="Leeg = fallback naar leadingvation@gmail.com">
            <Inp value={ps.contact_notification_email} onChange={e => setPs(p => ({ ...p, contact_notification_email: e.target.value }))} type="email" placeholder="info@woosyncshop.com" />
          </Field>
        </div>
      </div>

      <Btn variant="primary" onClick={save} disabled={saving} style={{ alignSelf: "flex-start", minWidth: 160 }}>
        {saved ? "✓ Opgeslagen" : saving ? "Opslaan..." : "Opslaan"}
      </Btn>
    </div>
  );
};


const STATIC_PAGES = ["privacy", "voorwaarden", "contact"];
const getPageFromPath = () => {
  const p = window.location.pathname.replace(/^\//, "");
  return STATIC_PAGES.includes(p) ? p : null;
};

export default function App() {
  const initPage = getPageFromPath();
  const [view, setView] = useState(initPage || "loading"); // loading | landing | app | welcome | privacy | voorwaarden | contact
  const [welcomePlan, setWelcomePlan] = useState(null);
  const [authModal, setAuthModal] = useState(null);
  const [user, setUser] = useState(null);
  const [cookieConsent, setCookieConsent] = useState(() => localStorage.getItem("wss_cookie_consent")); // null | accepted | rejected

  // pushState navigation for static pages
  const goPage = (page) => {
    history.pushState({ page }, "", "/" + page);
    setView(page);
  };
  const goBack = (resolvedUser) => {
    history.pushState({}, "", "/");
    setView(resolvedUser ?? user ? "app" : "landing");
  };

  // Handle browser back/forward button (BEFORE any early returns)
  useEffect(() => {
    const onPop = () => {
      const p = getPageFromPath();
      if (p) { setView(p); }
      else { setView(user ? "app" : "landing"); }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [user]);

  // Check for existing Supabase session on mount
  useEffect(() => {
    // If we landed on a static page directly, skip loading state
    if (initPage) return;
    const init = async () => {
      try {
        const session = await getSession();
        if (session) {
          const u = session.user;
          setUser({ id: u.id, name: u.user_metadata?.full_name || u.email, email: u.email });
          setView("app");
        } else {
          setView("landing");
        }
        supabase.auth.onAuthStateChange((_event, session) => {
          if (session?.user) {
            const u = session.user;
            setUser({ id: u.id, name: u.user_metadata?.full_name || u.email, email: u.email });
            setView("app");
          } else {
            setUser(null);
            setView("landing");
          }
        });
      } catch {
        setView("landing");
      }
    };
    init();
  }, []);

  const [paymentReturn, setPaymentReturn] = useState(() => window.location.hash.startsWith("#payment-return"));
  const [pendingPaymentWall, setPendingPaymentWall] = useState(false);
  const [paymentReturnStatus, setPaymentReturnStatus] = useState("checking"); // checking | paid | pending | failed | cancelled

  useEffect(() => {
    if (!paymentReturn) return;
    history.replaceState({}, "", "/");

    const verify = async () => {
      try {
        const session = await getSession();
        if (!session) {
          // No session = user wasn't logged in, nothing to verify
          setPaymentReturn(false);
          return;
        }
        const res = await fetch("/api/check-payment", {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        const data = await res.json();
        const mollieStatus = data.status; // paid | open | canceled | expired | failed | pending
        if (mollieStatus === "paid" || data.plan === "free_forever" || (data.plan && PLANS[data.plan])) {
          setPaymentReturnStatus("paid");
          sessionStorage.removeItem("wss_pending_payment_id");
          // Auto-dismiss after 5s
          setTimeout(() => setPaymentReturn(false), 5000);
        } else if (mollieStatus === "canceled" || mollieStatus === "expired" || mollieStatus === "failed") {
          setPaymentReturnStatus("failed");
        } else {
          // open / pending — payment processing
          setPaymentReturnStatus("pending");
          setTimeout(() => setPaymentReturn(false), 6000);
        }
      } catch {
        setPaymentReturnStatus("pending");
        setTimeout(() => setPaymentReturn(false), 5000);
      }
    };
    verify();
  }, [paymentReturn]);

  const handleSuccess = (userData) => {
    setUser(userData);
    setAuthModal(null);
    setView("app");
    try {
      if (window.gtag) window.gtag("event", "signup_complete", { event_category: "conversion" });
      if (window.dataLayer) window.dataLayer.push({ event: "signup_complete" });
    } catch {}
  };

  const handleLogout = async () => {
    try { await signOut(); } catch {}
    history.pushState({}, "", "/");
    setUser(null);
    setView("landing");
  };

  const acceptCookies = () => { localStorage.setItem("wss_cookie_consent", "accepted"); setCookieConsent("accepted"); };
  const rejectCookies = () => { localStorage.setItem("wss_cookie_consent", "rejected"); setCookieConsent("rejected"); };

  if (view === "loading") {
    return (
      <>
        <G />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16 }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 800, fontSize: 24, color: "var(--tx)" }}>
            <span style={{ color: "var(--pr-h)" }}>Woo</span> Sync<span style={{ color: "var(--pr-h)" }}>Shop</span>
          </div>
          <div style={{ width: 32, height: 32, border: "3px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
      </>
    );
  }

  if (view === "welcome") return <><G /><WelcomeView user={user} plan={welcomePlan} onContinue={() => setView("app")} /></>;
  if (view === "privacy") return <><G /><PrivacyPage onBack={() => goBack()} /></>;
  if (view === "voorwaarden") return <><G /><VoorwaardenPage onBack={() => goBack()} /></>;
  if (view === "contact") return <><G /><ContactPage onBack={() => goBack()} /></>;

  return (
    <>
      <G />
      <TrackingInjector consent={cookieConsent} />
      {view === "landing" && (
        <LandingPage
          onLogin={() => setAuthModal({ mode: "login" })}
          onSignup={(plan, billingPeriod) => setAuthModal({ mode: "signup", plan: plan || "growth", billingPeriod: billingPeriod || "monthly" })}
          onPage={goPage}
        />
      )}
      {view === "app" && user && (
        user.email === SUPERADMIN_EMAIL
          ? <SuperAdminDashboard user={user} onLogout={handleLogout} />
          : <Dashboard user={user} onLogout={handleLogout} onPaymentWall={setPendingPaymentWall} />
      )}

      {/* Payment wall — shown when user is logged in but hasn't paid yet */}
      {pendingPaymentWall && view === "app" && user && user.email !== SUPERADMIN_EMAIL && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 9990, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: "var(--rd-xl)", padding: 40, maxWidth: 460, textAlign: "center", boxShadow: "0 8px 48px rgba(0,0,0,0.6)" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💳</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-h)", marginBottom: 8 }}>Betaling nog niet voltooid</h2>
            <p style={{ fontSize: 14, color: "var(--mx)", marginBottom: 24, lineHeight: 1.6 }}>
              Je account is aangemaakt maar de betaling is niet afgerond. Voltooi je betaling om toegang te krijgen tot het dashboard.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <Btn variant="secondary" onClick={handleLogout}>Uitloggen</Btn>
              <Btn variant="primary" onClick={() => { setPendingPaymentWall(false); setAuthModal({ mode: "payment" }); }}>Betaling voltooien →</Btn>
            </div>
          </div>
        </div>
      )}
      {authModal && (
        <AuthModal
          mode={typeof authModal === "string" ? authModal : authModal?.mode}
          initialPlan={authModal?.plan}
          initialBillingPeriod={authModal?.billingPeriod}
          onClose={() => setAuthModal(null)}
          onSuccess={handleSuccess}
        />
      )}
      {cookieConsent === null && (
        <CookieBanner onAccept={acceptCookies} onReject={rejectCookies} />
      )}
      {paymentReturn && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--s1)", border: `1px solid ${paymentReturnStatus === "paid" ? "var(--gr)" : paymentReturnStatus === "failed" ? "var(--re)" : "var(--b1)"}`, borderRadius: "var(--rd-xl)", padding: 40, maxWidth: 440, textAlign: "center", boxShadow: "0 8px 48px rgba(0,0,0,0.5)" }}>
            {paymentReturnStatus === "checking" && <>
              <div style={{ fontSize: 44, marginBottom: 16 }}>⏳</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-h)", marginBottom: 8 }}>Betaling controleren...</h2>
              <p style={{ fontSize: 14, color: "var(--mx)", lineHeight: 1.6 }}>Even geduld, we verifiëren je betaling.</p>
            </>}
            {paymentReturnStatus === "paid" && <>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-h)", marginBottom: 8 }}>Betaling geslaagd!</h2>
              <p style={{ fontSize: 14, color: "var(--mx)", marginBottom: 24, lineHeight: 1.6 }}>
                Je account is actief. Factuur is per e-mail verstuurd.
              </p>
              <Btn variant="primary" onClick={async () => {
                setPaymentReturn(false); setPendingPaymentWall(false);
                // Load user profile to get plan, then show welcome page
                const { data: profile } = await supabase.from("user_profiles").select("plan").eq("id", user?.id).single().catch(() => ({ data: null }));
                setWelcomePlan(profile?.plan || "growth");
                setView("welcome");
              }}>Aan de slag →</Btn>
            </>}
            {paymentReturnStatus === "pending" && <>
              <div style={{ fontSize: 44, marginBottom: 16 }}>🕐</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-h)", marginBottom: 8 }}>Betaling wordt verwerkt</h2>
              <p style={{ fontSize: 14, color: "var(--mx)", marginBottom: 24, lineHeight: 1.6 }}>
                Je betaling is ontvangen en wordt verwerkt door Mollie. Je account wordt automatisch geactiveerd.
              </p>
              <Btn variant="primary" onClick={() => { setPaymentReturn(false); setPendingPaymentWall(false); }}>Naar dashboard →</Btn>
            </>}
            {paymentReturnStatus === "failed" && <>
              <div style={{ fontSize: 44, marginBottom: 16 }}>❌</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-h)", marginBottom: 8 }}>Betaling niet voltooid</h2>
              <p style={{ fontSize: 14, color: "var(--mx)", marginBottom: 24, lineHeight: 1.6 }}>
                De betaling is geannuleerd of mislukt. Je account is nog niet actief. Probeer het opnieuw.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <Btn variant="secondary" onClick={() => { setPaymentReturn(false); }}>Sluiten</Btn>
                <Btn variant="primary" onClick={() => { setPaymentReturn(false); setAuthModal({ mode: "payment" }); }}>Opnieuw betalen →</Btn>
              </div>
            </>}
          </div>
        </div>
      )}
    </>
  );
}
