import { signIn, signUp, signOut, getSession, getUser, supabase, getToken, setCachedToken } from "./lib/supabase.js";
import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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
  starter:      { id: "starter",      name: "Starter",      sites: 2,  connected_products: 500,   monthly: 7.99,  annual_mo: 7.19,  img_max_kb: 300,  img_quality: 80, img_max_width: 1200, gemini_model: "gemini-2.5-flash" },
  growth:       { id: "growth",       name: "Growth",       sites: 5,  connected_products: 2000,  monthly: 11.99, annual_mo: 10.79, img_max_kb: 400,  img_quality: 85, img_max_width: 1600, gemini_model: "gemini-2.5-flash"      },
  pro:          { id: "pro",          name: "Pro",          sites: 10, connected_products: 10000, monthly: 19.99, annual_mo: 17.99, img_max_kb: 600,  img_quality: 90, img_max_width: 2400, gemini_model: "gemini-2.5-flash-image" },
  free_forever: { id: "free_forever", name: "Free Forever", sites: 2,  connected_products: 500,   monthly: 0,     annual_mo: 0,     img_max_kb: 200,  img_quality: 75, img_max_width: 1000, gemini_model: "gemini-2.5-flash" },
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

// Maps WooCommerce locale prefix → { lang, code } for auto-detecting createConfig language
const LOCALE_TO_LANG = {
  nl: { lang: "Dutch",      code: "NL" },
  de: { lang: "German",     code: "DE" },
  fr: { lang: "French",     code: "FR" },
  en: { lang: "English",    code: "EN" },
  es: { lang: "Spanish",    code: "ES" },
  it: { lang: "Italian",    code: "IT" },
  pl: { lang: "Polish",     code: "PL" },
  pt: { lang: "Portuguese", code: "PT" },
  sv: { lang: "Swedish",    code: "SE" },
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
  const [showPw, setShowPw] = useState(false);
  const resolvedType = type === "password" ? (showPw ? "text" : "password") : type;
  const base = { background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd)", color: "var(--tx)", fontSize: 13, padding: "7px 10px", width: "100%", transition: "border 0.15s", ...extStyle };
  if (multiline) return <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} style={{ ...base, resize: "vertical", lineHeight: 1.6 }} {...p} />;
  if (type === "password") return (
    <div style={{ display: "flex", alignItems: "center", background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd)", overflow: "hidden" }}>
      <input value={value ?? ""} onChange={onChange} placeholder={placeholder} type={resolvedType}
        autoComplete="new-password" data-form-type="other"
        style={{ ...base, border: "none", borderRadius: 0, flex: 1 }} {...p} />
      <button type="button" onClick={() => setShowPw(v => !v)}
        style={{ padding: "0 10px", background: "var(--s3)", border: "none", borderLeft: "1px solid var(--b1)", cursor: "pointer", color: "var(--dm)", fontSize: 12, height: "100%", minHeight: 32, flexShrink: 0 }}>
        {showPw ? "🙈" : "👁"}
      </button>
    </div>
  );
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
  const colors = { default: { bg: "var(--s3)", c: "var(--mx)" }, green: { bg: "var(--gr-l)", c: "var(--gr)" }, red: { bg: "var(--re-l)", c: "var(--re)" }, amber: { bg: "var(--ac-l)", c: "var(--ac)" }, blue: { bg: "var(--pr-l)", c: "var(--pr-h)" }, orange: { bg: "var(--or-l)", c: "var(--or)" }, purple: { bg: "rgba(139,92,246,0.15)", c: "rgb(167,139,250)" } }[color] || { bg: "var(--s3)", c: "var(--mx)" };
  return <span style={{ display: "inline-flex", alignItems: "center", padding: size === "sm" ? "2px 8px" : "3px 10px", borderRadius: 100, fontSize: size === "sm" ? 11 : 12, fontWeight: 500, background: colors.bg, color: colors.c, whiteSpace: "nowrap" }}>{children}</span>;
};

const Divider = ({ my = 12 }) => <div style={{ height: 1, background: "var(--b1)", margin: `${my}px 0` }} />;

const Overlay = ({ open, onClose, children, width = 860, title, noClose = false }) => {
  useEffect(() => { if (open) document.body.style.overflow = "hidden"; else document.body.style.overflow = ""; return () => { document.body.style.overflow = ""; }; }, [open]);
  if (!open) return null;
  const backdropRef = useRef(null);
  const downTargetRef = useRef(null);
  return (
    <div
      ref={backdropRef}
      onMouseDown={e => { downTargetRef.current = e.target; }}
      onMouseUp={e => { if (!noClose && e.target === backdropRef.current && downTargetRef.current === backdropRef.current) onClose?.(); }}
      className="overlay-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onMouseDown={e => e.stopPropagation()} className="slide-up overlay-panel" style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: "var(--rd-xl)", width: "100%", maxWidth: width, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
        {title && <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{title}</h3>
          {!noClose && <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--mx)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 6px", borderRadius: 4 }}>×</button>}
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
  const safeTiers = Array.isArray(tiers) ? tiers : [];
  const add = () => onChange([...safeTiers, { qty: "", price: "" }]);
  const rm = i => onChange(safeTiers.filter((_, j) => j !== i));
  const upd = (i, f, v) => onChange(safeTiers.map((t, j) => j === i ? { ...t, [f]: v } : t));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Field label="Tiered pricing type">
        <Sel value={type || "fixed"} onChange={e => onTypeChange(e.target.value)} options={[{ value: "fixed", label: "Fixed price" }, { value: "percent", label: "Percentage discount" }]} />
      </Field>
      <Field label="Tiers">
        {safeTiers.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <Inp value={t.qty} onChange={e => upd(i, "qty", e.target.value)} placeholder="Starting quantity" type="number" style={{ flex: 1 }} />
            <Inp value={t.price} onChange={e => upd(i, "price", e.target.value)} placeholder={type === "percentage" ? "Discount %" : "Product price"} type="number" style={{ flex: 1 }} />
            <button onClick={() => rm(i)} style={{ background: "none", border: "none", color: "var(--re)", cursor: "pointer", fontSize: 16, padding: "4px 6px" }}>⊗</button>
          </div>
        ))}
        <Btn variant="secondary" size="sm" onClick={add}>+ Tier toevoegen</Btn>
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


// ─── Rich Text Editor (WYSIWYG ↔ HTML toggle) ────────────────────────────────
const RichEditor = ({ value, onChange, rows = 6, label, hint }) => {
  const [mode, setMode] = useState("wysiwyg");
  const editorRef = useRef(null);
  const lastHtml = useRef(value || "");

  // Sync contenteditable → state on each input
  const onInput = () => {
    if (editorRef.current) {
      lastHtml.current = editorRef.current.innerHTML;
      onChange(lastHtml.current);
    }
  };

  // When switching to wysiwyg, set innerHTML from current value
  useLayoutEffect(() => {
    if (mode === "wysiwyg" && editorRef.current) {
      if (editorRef.current.innerHTML !== (value || "")) {
        editorRef.current.innerHTML = value || "";
      }
    }
  }, [mode]);

  // Initial mount: set content
  useEffect(() => {
    if (editorRef.current && mode === "wysiwyg") {
      editorRef.current.innerHTML = value || "";
    }
  }, []);

  const execCmd = (cmd, val = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    onInput();
  };

  const toggle = [
    { cmd: "bold",        icon: "B",  style: { fontWeight: 700 } },
    { cmd: "italic",      icon: "I",  style: { fontStyle: "italic" } },
    { cmd: "underline",   icon: "U",  style: { textDecoration: "underline" } },
    { cmd: "insertUnorderedList", icon: "•≡" },
    { cmd: "insertOrderedList",   icon: "1≡" },
  ];

  return (
    <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd)", overflow: "hidden" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "4px 8px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", flexWrap: "wrap" }}>
        {mode === "wysiwyg" && toggle.map(t => (
          <button key={t.cmd} onMouseDown={e => { e.preventDefault(); execCmd(t.cmd); }}
            style={{ padding: "2px 7px", border: "1px solid var(--b2)", borderRadius: 4, background: "var(--bg)", cursor: "pointer", fontSize: 12, color: "var(--tx)", ...t.style }}>
            {t.icon}
          </button>
        ))}
        {mode === "wysiwyg" && (
          <>
            <button onMouseDown={e => { e.preventDefault(); const url = prompt("URL:"); if (url) execCmd("createLink", url); }}
              style={{ padding: "2px 7px", border: "1px solid var(--b2)", borderRadius: 4, background: "var(--bg)", cursor: "pointer", fontSize: 12, color: "var(--tx)" }}>🔗</button>
            <select onMouseDown={e => e.stopPropagation()} onChange={e => { execCmd("formatBlock", e.target.value); e.target.value = ""; }}
              style={{ padding: "2px 4px", border: "1px solid var(--b2)", borderRadius: 4, background: "var(--bg)", fontSize: 11, color: "var(--tx)", cursor: "pointer" }}>
              <option value="">Opmaak</option>
              <option value="p">Alinea</option>
              <option value="h2">Kop 2</option>
              <option value="h3">Kop 3</option>
              <option value="h4">Kop 4</option>
            </select>
          </>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setMode(m => m === "wysiwyg" ? "html" : "wysiwyg")}
          style={{ padding: "2px 10px", border: "1px solid var(--pr)", borderRadius: 4, background: mode === "html" ? "var(--pr)" : "transparent", cursor: "pointer", fontSize: 11, fontWeight: 600, color: mode === "html" ? "#fff" : "var(--pr)", transition: "all 0.15s" }}>
          {mode === "wysiwyg" ? "</> HTML" : "✦ WYSIWYG"}
        </button>
      </div>
      {/* Editor area */}
      {mode === "wysiwyg" ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={onInput}
          onBlur={onInput}
          style={{
            minHeight: rows * 22,
            padding: "10px 12px",
            outline: "none",
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--tx)",
            background: "var(--bg)",
            overflowY: "auto",
          }}
        />
      ) : (
        <textarea
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          rows={rows}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "none",
            outline: "none",
            resize: "vertical",
            fontFamily: "monospace",
            fontSize: 12,
            lineHeight: 1.5,
            background: "var(--bg)",
            color: "var(--tx)",
            boxSizing: "border-box",
          }}
        />
      )}
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
  // Also show WQM tab if product itself has WQM tiers (shop flag may not be set yet)
  const productHasWqm = !!(product?.wqm_tiers?.length > 0 || product?.meta_data?.some?.(m => m.key === '_wqm_tiers'));
  const editTabs = (hasWqm || productHasWqm)
    ? [...BASE_EDIT_TABS.slice(0, 3), { id: "quantity", label: "Hoeveelheid", icon: "🔢" }, ...BASE_EDIT_TABS.slice(3)]
    : BASE_EDIT_TABS;
  const [tab, setTab] = useState("general");
  const [p, setP] = useState(null);
  const [confirmAttr, setConfirmAttr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [variationsLoading, setVariationsLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);

  // Use live attributes/categories from shopCache, fallback to empty
  const liveAttributes = shopCache?.attributes || [];
  const liveCategories = shopCache?.categories || [];
  // Primary category term (Yoast + RankMath)
  const getPrimaryMeta = (prod) => {
    const meta = prod?.meta_data || [];
    return meta.find(m => m.key === "_yoast_wpseo_primary_product_cat")?.value
        || meta.find(m => m.key === "rank_math_primary_product_cat")?.value
        || null;
  };
  const [primaryCatId, setPrimaryCatId] = useState(() => getPrimaryMeta(product));

  // ── Helper: apply WQM normalization to a product object ──────────────────────
  const applyWqmMeta = (fresh) => {
    const metaArr = Array.isArray(fresh.meta_data) ? fresh.meta_data : [];

    // Helper: parse value - handles object, JSON string, or PHP serialized (best-effort)
    const parseMetaValue = (raw) => {
      if (!raw) return null;
      if (typeof raw === 'object') return raw;
      if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch {}
        // PHP serialized: a:2:{s:4:"type";s:5:"fixed";s:5:"tiers";a:1:{...}}
        // We can't easily parse PHP serialized in JS, so return null
      }
      return null;
    };

    const getMeta = (key) => parseMetaValue(metaArr.find(m => m.key === key)?.value);
    let wqmTiersRaw    = getMeta('_wqm_tiers');
    let wqmSettingsRaw = getMeta('_wqm_settings');


    // tiers may be a real array OR a PHP-indexed object {0:{…},1:{…}} — normalise both
    const tiersArr = wqmTiersRaw?.tiers
      ? (Array.isArray(wqmTiersRaw.tiers) ? wqmTiersRaw.tiers : Object.values(wqmTiersRaw.tiers))
      : [];

    if (wqmTiersRaw && typeof wqmTiersRaw === 'object' && tiersArr.length > 0) {
      fresh.wqm_tiers     = tiersArr.map(t => ({ qty: String(t.qty || ''), price: String(t.amt || '') }));
      fresh.wqm_tier_type = wqmTiersRaw.type || 'fixed';
    } else {
      // Do NOT overwrite if already populated (e.g. from a prior applyWqmMeta call)
      if (!Array.isArray(fresh.wqm_tiers) || fresh.wqm_tiers.length === 0) {
        fresh.wqm_tiers = [];
      }
      fresh.wqm_tier_type = fresh.wqm_tier_type || 'fixed';
    }

    if (wqmSettingsRaw && typeof wqmSettingsRaw === 'object') {
      fresh.wqm_settings = {
        ...wqmSettingsRaw,
        step:     String(wqmSettingsRaw.step_interval || ''),
        dyo_rows: Array.isArray(wqmSettingsRaw.qty_design_tiers) ? wqmSettingsRaw.qty_design_tiers : [],
        tiered_pricing_type: wqmTiersRaw?.type || fresh.wqm_tier_type || 'fixed',
      };
    } else {
      fresh.wqm_settings = {
        ...(fresh.wqm_settings || {}),
        step: fresh.wqm_settings?.step || '',
        dyo_rows: fresh.wqm_settings?.dyo_rows || [],
        tiered_pricing_type: fresh.wqm_tier_type || 'fixed',
      };
    }
    return fresh;
  };

  useEffect(() => {
    if (!product || !open) return;
    const fresh = JSON.parse(JSON.stringify(product));
    setSaveError(null);
    setTab("general");

    // ── Always fetch the full single product to guarantee meta_data is present ──
    // The products list endpoint omits meta_data for performance; the single
    // product endpoint always includes it (needed for _wqm_tiers, _wqm_settings).
    // Show modal immediately with list data, then silently update with full data.
    setP(applyWqmMeta(fresh));  // Show modal immediately
    setPrimaryCatId(getPrimaryMeta(fresh));

    if (activeSite?.id && product.id) {
      setMetaLoading(true);
      getToken().then(async (tok) => {
        try {
          const res = await fetch("/api/woo", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tok}` },
            body: JSON.stringify({ shop_id: activeSite.id, endpoint: `products/${product.id}`, method: "GET" }),
          });
          let full; try { full = await res.json(); } catch { full = null; }
          if (full && full.id) {
            const merged = { ...fresh, ...full, pending_changes: fresh.pending_changes || {} };
            setP(prev => prev ? applyWqmMeta({ ...prev, ...merged }) : applyWqmMeta(merged));
            setPrimaryCatId(getPrimaryMeta(full));
          }
        } catch (e) {
          console.error("Full product fetch failed:", e);
        } finally {
          setMetaLoading(false);
        }
      });
    }

    // Fetch full variation details if variable product (products list only has variation IDs)
    if (product.type === "variable" && product.id && activeSite?.id) {
      const hasFullVariations = Array.isArray(product.variations) && product.variations.length > 0 && typeof product.variations[0] === "object" && product.variations[0].regular_price !== undefined;
      if (!hasFullVariations) {
        setVariationsLoading(true);
        getToken().then((tok) => {
          fetch("/api/woo", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tok}` },
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
              {metaLoading
                ? <div style={{ fontSize: 12, color: "var(--mx)", padding: "8px 0" }}>⏳ Tiers laden…</div>
                : <TieredPricing tiers={p.wqm_tiers} onChange={v => upd("wqm_tiers", v)} type={p.wqm_settings?.tiered_pricing_type || p.wqm_tier_type || "fixed"} onTypeChange={v => { upd("wqm_settings.tiered_pricing_type", v); upd("wqm_tier_type", v); }} />
              }
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
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{Object.entries(v.attributes || {}).map(([k, val]) => `${liveAttributes.find(a => a.slug === k)?.name || k}: ${val}`).join(" · ")}</span>
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
            {metaLoading && (
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--s2)", borderRadius: "var(--rd)", fontSize: 12, color: "var(--mx)" }}>
                <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span> Hoeveelheidsopties laden…
              </div>
            )}
            <Field label="Quantity selector type">
              <Sel value={p.wqm_settings?.qty_design || ""} onChange={e => upd("wqm_settings.qty_design", e.target.value)} options={[
                { value: "", label: "WooCommerce default" },
                { value: "select", label: "Dropdown (Basic)" },
                { value: "buttons", label: "Buttons (Basic)" },
                { value: "dyo_select", label: "DYO: Dropdown" },
                { value: "dyo_swatches", label: "DYO: Swatches" },
                { value: "dyo_wide_swatches", label: "DYO: Full width swatches" },
                { value: "dyo_imgswatches", label: "DYO: Image swatches" },
              ]} />
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
              <Inp value={p.wqm_settings?.step || ""} onChange={e => upd("wqm_settings.step", e.target.value)} type="text" placeholder="1" />
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
              const paRaw = p.attributes?.find(a => a.slug === attr.slug || a.id === attr.id);
              // WooCommerce may return options[] or values[] — normalise to safeVals
              const pa = paRaw ? { ...paRaw } : { id: attr.id, slug: attr.slug, name: attr.name, options: [], visible: false, variation: false };
              const safeVals = Array.isArray(pa.values) ? pa.values : Array.isArray(pa.options) ? pa.options : [];
              const idx = p.attributes?.findIndex(a => a.slug === attr.slug || a.id === attr.id) ?? -1;
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
                    {(attr.terms || []).map(term => (
                      <button key={term} onClick={() => {
                        const newVals = safeVals.includes(term) ? safeVals.filter(v => v !== term) : [...safeVals, term];
                        setAttr({ ...pa, options: newVals, values: newVals });
                      }} style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: safeVals.includes(term) ? "1.5px solid var(--pr)" : "1px solid var(--b2)", background: safeVals.includes(term) ? "var(--pr-l)" : "transparent", color: safeVals.includes(term) ? "var(--pr-h)" : "var(--mx)", transition: "all 0.15s" }}>
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
              <RichEditor value={p.short_description || ""} onChange={v => upd("short_description", v)} rows={4} />
            </Field>
            <Field label="Productbeschrijving">
              <RichEditor value={p.description || ""} onChange={v => upd("description", v)} rows={10} />
            </Field>
            <Field label="Categorieën">
              <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 10, background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd)" }}>
                {liveCategories.map(cat => {
                  const catIds = (p.categories || []).map(c => typeof c === "object" ? c.id : c);
                  const isChecked = catIds.includes(cat.id);
                  const isPrimary = String(primaryCatId) === String(cat.id);
                  const indent = cat.parent > 0 ? 16 : 0;
                  return (
                    <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: indent }}>
                      <Chk checked={isChecked} onChange={checked => {
                        const current = (p.categories || []).map(x => typeof x === "object" ? x : { id: x });
                        const updated = checked ? [...current, { id: cat.id, name: cat.name }] : current.filter(x => x.id !== cat.id);
                        upd("categories", updated);
                        if (!checked && isPrimary) setPrimaryCatId(null);
                      }} label={cat.name} />
                      {isChecked && (
                        <button
                          onClick={() => setPrimaryCatId(isPrimary ? null : String(cat.id))}
                          title={isPrimary ? "Primaire categorie — klik om te verwijderen" : "Instellen als primaire categorie"}
                          style={{ fontSize: 10, padding: "1px 7px", borderRadius: 10, border: isPrimary ? "1px solid var(--pr)" : "1px solid var(--b2)",
                            background: isPrimary ? "var(--pr)" : "var(--s3)", color: isPrimary ? "#fff" : "var(--dm)",
                            cursor: "pointer", fontWeight: isPrimary ? 700 : 400, flexShrink: 0, lineHeight: 1.6 }}>
                          {isPrimary ? "★ Primair" : "☆ Primair"}
                        </button>
                      )}
                    </div>
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
              const session = { access_token: await getToken() };
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
              await onSaveDirect({ ...p, _primaryCatId: primaryCatId });
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
const ProductsTable = ({ products, onEdit, onConnect, activeSite, onDuplicate, onPublish, onRefresh, onPromptSettings, shopCategories = [], liveCategories = [], onCategoryChange }) => {
  const [expanded, setExpanded] = useState([]);
  const [expandedVars, setExpandedVars] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [catChanging, setCatChanging] = useState({});

  const handleCatChange = async (product, catId) => {
    setCatChanging(p => ({ ...p, [product.id]: true }));
    try { await onCategoryChange?.(product, Number(catId)); }
    finally { setCatChanging(p => ({ ...p, [product.id]: false })); }
  };

  // Resolve the primary category cheaply (no full liveCategories scan per row):
  // 1. Yoast/RankMath primary term meta  2. Sub-cat (parent > 0)  3. First cat
  const getPrimaryCategory = (product) => {
    const cats = product.categories || [];
    if (cats.length === 0) return null;
    const meta = product.meta_data || [];
    const primaryId = meta.find(m => m.key === "_yoast_wpseo_primary_product_cat")?.value
                   || meta.find(m => m.key === "rank_math_primary_product_cat")?.value;
    if (primaryId) {
      const found = cats.find(c => String(c.id) === String(primaryId));
      if (found) return found;
    }
    // Use liveCategories only to identify which cats are sub-cats (parent > 0)
    const catIds = new Set(cats.map(c => c.id));
    const subCat = liveCategories.find(lc => lc.parent > 0 && catIds.has(lc.id));
    if (subCat) return cats.find(c => c.id === subCat.id) || subCat;
    return cats[0];
  };

  const toggle = id => setExpanded(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleVar = id => setExpandedVars(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const filtered = products.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "instock" && p.stock_status !== "instock") return false;
    if (filter === "variable" && p.type !== "variable") return false;
    if (categoryFilter !== "all" && !(p.categories || []).some(cat => String(cat.id) === categoryFilter)) return false;
    return true;
  });

  const hasPending = p => Object.keys(p.pending_changes || {}).length > 0;

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍  Zoek op naam of SKU..." style={{ maxWidth: 280 }} />
        <Sel value={filter} onChange={e => setFilter(e.target.value)} options={[{ value: "all", label: "Alle producten" }, { value: "variable", label: "Variabel" }, { value: "instock", label: "Op voorraad" }]} style={{ maxWidth: 160 }} />
        {shopCategories.length > 0 && (
          <Sel
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            options={[
              { value: "all", label: "Alle categorieën" },
              ...shopCategories
                .filter(cat => cat.parent === 0)
                .sort((a, b) => a.name.localeCompare(b.name))
                .flatMap(parent => [
                  { value: String(parent.id), label: parent.name },
                  ...shopCategories
                    .filter(sub => sub.parent === parent.id)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(sub => ({ value: String(sub.id), label: "  ↳ " + sub.name }))
                ])
            ]}
            style={{ maxWidth: 200 }}
          />
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={onRefresh} title="Productenlijst vernieuwen">🔄 Vernieuwen</Btn>
          <Btn variant="ghost" size="sm" onClick={onPromptSettings} title="AI prompt instellingen">⚙️ AI prompts</Btn>
          <Btn variant="secondary" size="sm" icon="↑">Importeer CSV</Btn>
          <Btn variant="primary" size="sm" icon="+">Nieuw product</Btn>
        </div>
      </div>

      {/* Table */}
      <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
        {/* Header */}
        <div className="product-table-header-row" style={{ display: "grid", gridTemplateColumns: "28px 44px 1fr 90px 90px 80px 130px 100px 170px", gap: 0, background: "var(--s2)", borderBottom: "1px solid var(--b1)", padding: "8px 12px", alignItems: "center" }}>
          {["", "", "Product", "SKU", "Prijs", "Voorraad", "Primaire cat.", "Status", "Acties"].map((h, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 600, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
          ))}
        </div>

        {filtered.map((product, pi) => (
          <div key={product.id}>
            {/* Product Row */}
            <div style={{ display: "grid", gridTemplateColumns: "28px 44px 1fr 90px 90px 80px 130px 100px 170px", gap: 0, padding: "10px 12px", alignItems: "center", borderBottom: "1px solid var(--b1)", background: pi % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)", transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--s2)"}
              onMouseLeave={e => e.currentTarget.style.background = pi % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)"}>
              <button onClick={() => product.type === "variable" && toggle(product.id)} style={{ background: "none", border: "none", cursor: product.type === "variable" ? "pointer" : "default", color: "var(--mx)", fontSize: 12, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 3, transition: "transform 0.15s", transform: expanded.includes(product.id) ? "rotate(90deg)" : "none" }}>
                {product.type === "variable" ? "▶" : ""}
              </button>
              <div style={{ width: 36, height: 36, borderRadius: 6, overflow: "hidden", background: "var(--s3)" }}>
                {(product.images?.[0]?.src || product.featured_image) && <img src={product.images?.[0]?.src || product.featured_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
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
              {/* Category inline dropdown */}
              <div style={{ minWidth: 0 }}>
                {catChanging[product.id]
                  ? <span style={{ fontSize: 11, color: "var(--dm)" }}>⏳</span>
                  : (() => {
                      const primaryCat = getPrimaryCategory(product);
                      return <select
                        value={primaryCat?.id || "none"}
                        onChange={e => handleCatChange(product, e.target.value)}
                        style={{ fontSize: 11, background: "var(--s3)", border: "1px solid var(--b2)", borderRadius: 4, color: "var(--tx)", padding: "2px 4px", maxWidth: "100%", cursor: "pointer" }}>
                        <option value="none" disabled>{primaryCat?.name || "— geen —"}</option>
                        {(liveCategories || []).map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>;
                    })()
                }
              </div>
              <Badge color={product.status === "publish" ? "green" : "amber"}>{product.status === "publish" ? "Actief" : "Concept"}</Badge>
              <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                <Btn variant="secondary" size="sm" onClick={() => onConnect(product)} title="Verbind met andere shops">🔗</Btn>
                {product.sku && product.manage_stock && (
                  <Btn variant="ghost" size="sm" title={`Voorraad (${product.stock_quantity ?? 0}) synchroniseren naar andere shops`} onClick={() => onStockSync?.(product)}>🔄</Btn>
                )}
                <Btn variant="ghost" size="sm" onClick={() => onDuplicate?.(product)} title="Dupliceren met AI">⧉</Btn>
                <Btn variant="ghost" size="sm" title={product.status === "publish" ? "Al gepubliceerd" : "Publiceren"} disabled={product.status === "publish"} onClick={() => onPublish?.(product.id)} style={{ opacity: product.status === "publish" ? 0.35 : 1 }}>🌐</Btn>
                <Btn variant="primary" size="sm" onClick={() => onEdit(product)}>Bewerken</Btn>
              </div>
            </div>

            {/* Variations */}
            {expanded.includes(product.id) && product.variations.map((v, vi) => (
              <div key={v.id}>
                <div style={{ display: "grid", gridTemplateColumns: "28px 44px 1fr 90px 90px 80px 130px 100px 170px", gap: 0, padding: "8px 12px 8px 28px", alignItems: "center", borderBottom: "1px solid var(--b1)", background: "var(--s1)" }}>
                  <button onClick={() => toggleVar(v.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dm)", fontSize: 11, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.15s", transform: expandedVars.includes(v.id) ? "rotate(90deg)" : "none" }}>▶</button>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: v.enabled ? "var(--gr)" : "var(--dm)" }} />
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--mx)" }}>
                      {Object.entries(v.attributes || {}).map(([k, val]) => <Badge key={k} color="default" size="sm">{liveAttributes.find(a => a.slug === k)?.name || k}: {val}</Badge>)}
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
                  <div key={i} style={{ border: `1px solid ${dec === "accept" ? "rgba(34,197,94,0.4)" : dec === "reject" ? "rgba(239,68,68,0.2)" : "var(--b1)"}`, borderRadius: "var(--rd)", background: dec === "accept" ? "rgba(34,197,94,0.04)" : dec === "reject" ? "rgba(239,68,68,0.03)" : "var(--s2)", opacity: dec === "reject" ? 0.6 : 1 }}>
                    {/* Main row — grid layout so names never get squashed */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr 68px", alignItems: "center", gap: 8, padding: "9px 12px" }}>
                      {/* Source product */}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{m.source_product.name}</div>
                        <div style={{ fontSize: 10, color: "var(--dm)", marginTop: 1 }}>SKU: {m.source_product.sku || "—"} · €{m.source_product.price || "—"}</div>
                      </div>
                      {/* Confidence + arrow */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <span style={{ fontSize: 11, color: "var(--mx)" }}>→</span>
                        <ConfidenceBar value={m.confidence} />
                        <span style={{ fontSize: 9, fontWeight: 700, color: Math.round(m.confidence*100) >= 85 ? "var(--gr)" : Math.round(m.confidence*100) >= 70 ? "var(--ac)" : "rgba(239,68,68,1)" }}>{Math.round(m.confidence * 100)}%</span>
                      </div>
                      {/* Target product */}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{m.target_product.name}</div>
                        <div style={{ fontSize: 10, color: "var(--dm)", marginTop: 1 }}>SKU: {m.target_product.sku || "—"} · €{m.target_product.price || "—"}</div>
                      </div>
                      {/* Accept/Reject buttons */}
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
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

// ─── EAN pool helper ──────────────────────────────────────────────────────────
const fetchEanFromPool = async (sku, productId = null) => {
  const session = { access_token: await getToken() };
  const res = await fetch("/api/ean-assign", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
    body: JSON.stringify({ sku, product_id: productId }),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || "EAN pool fout");
  return json.ean;
};

// ─── Duplicate Product Modal ──────────────────────────────────────────────────

// ─── PromptSettingsModal ──────────────────────────────────────────────────────
const PromptSettingsModal = ({ open, onClose, promptSettings, onSave }) => {
  const [local, setLocal] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setLocal(promptSettings || {}); }, [open]);
  if (!open) return null;

  const upd = (field, key, val) => setLocal(p => ({
    ...p, default: { ...(p.default || {}), [field]: { ...(p.default?.[field] || {}), [key]: val } }
  }));
  const get = (field, key, def = "") => local.default?.[field]?.[key] ?? def;

  const FIELDS = [
    { key: "short_description", label: "Korte beschrijving", wc: true, wc_def: "30" },
    { key: "description",       label: "Productbeschrijving", wc: true, wc_def: "150" },
    { key: "meta_title",        label: "SEO meta titel", wc: false },
    { key: "meta_description",  label: "SEO meta beschrijving", wc: false },
  ];

  return (
    <Overlay open onClose={onClose} width={600} title="⚙️ AI Prompt Instellingen">
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 13, color: "var(--mx)", lineHeight: 1.6 }}>
          Stel in hoe de AI content genereert bij het dupliceren van producten. Per veld kun je een aanvullende instructie, woordtelling en focuszoekwoorden opgeven.
        </div>
        {FIELDS.map(f => (
          <div key={f.key} style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd)", overflow: "hidden" }}>
            <div style={{ padding: "9px 14px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", fontWeight: 600, fontSize: 13 }}>{f.label}</div>
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <Field label="Aanvullende instructie" hint="Extra schrijfinstructie voor de AI">
                <Inp multiline rows={2} value={get(f.key, "custom_prompt")} onChange={e => upd(f.key, "custom_prompt", e.target.value)} placeholder={'Bijv. "Schrijf in een vriendelijke, informatieve toon"'} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: f.wc ? "1fr 1fr" : "1fr", gap: 10 }}>
                {f.wc && (
                  <Field label="Max. woordtelling">
                    <Inp type="number" value={get(f.key, "word_count", f.wc_def)} onChange={e => upd(f.key, "word_count", e.target.value)} />
                  </Field>
                )}
                <Field label="Focuszoekwoorden" hint="Kommagescheiden">
                  <Inp value={get(f.key, "keywords")} onChange={e => upd(f.key, "keywords", e.target.value)} placeholder="bamboe, haag, tuin" />
                </Field>
              </div>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={onClose}>Annuleren</Btn>
          <Btn variant="primary" disabled={saving} onClick={async () => { setSaving(true); await onSave(local); setSaving(false); onClose(); }}>
            {saving ? "Opslaan..." : "💾 Opslaan"}
          </Btn>
        </div>
      </div>
    </Overlay>
  );
};

const DuplicateProductModal = ({ product, open, onClose, wooCall, onCreated, activeSite, promptSettings }) => {
  const [newTitle, setNewTitle]     = useState("");
  const [step, setStep]             = useState("input");
  const [preview, setPreview]       = useState(null);
  const [errMsg, setErrMsg]         = useState("");
  const [progress, setProgress]     = useState("");
  const [attrChecks, setAttrChecks] = useState({});
  const [editField, setEditField]   = useState(null);
  const [editValues, setEditValues] = useState({});
  const [seoPlugin, setSeoPlugin]   = useState(null); // null=unchecked, false=none, "yoast"|"rankmath"
  const [galleryMode, setGalleryMode] = useState("rename"); // "rename" | "same" | "none"

  // Detect SEO plugin once per shop when modal opens (skip if no activeSite)
  useEffect(() => {
    if (!open || !activeSite || seoPlugin !== null) return;
    const check = async () => {
      try {
        const res = await wooCall(null, "system_status");
        const plugins = res?.active_plugins || [];
        const hasYoast    = plugins.some(p => (p.plugin || p.name || "").toLowerCase().includes("wordpress-seo"));
        const hasRankMath = plugins.some(p => (p.plugin || p.name || "").toLowerCase().includes("seo-by-rank-math"));
        setSeoPlugin(hasYoast ? "yoast" : hasRankMath ? "rankmath" : false);
      } catch { setSeoPlugin(false); }
    };
    check();
  }, [open, activeSite?.id]);

  useEffect(() => {
    if (open && product) {
      setNewTitle(product.name + " (kopie)");
      setStep("input"); setPreview(null); setErrMsg("");
      setAttrChecks({}); setEditField(null); setEditValues({}); setGalleryMode("rename");
    }
  }, [open, product?.id]);

  if (!open || !product) return null;

  const existingSkus = [product.sku, ...(product.variations || []).map(v => v.sku)].filter(Boolean);
  const extractEan   = (p) => { if (p.global_unique_id) return p.global_unique_id; const m = (p.meta_data || []).find(x => x.key === "_alg_ean"); return m?.value || ""; };
  const sourceEan    = extractEan(product);
  const productAttributes = (product.attributes || []).map(a => ({ name: a.name || a.slug || "", value: (a.values || a.options || []).join(", ") })).filter(a => a.name && a.value);

  const runAI = async () => {
    setStep("generating");
    setProgress("AI analyseert product en genereert content...");
    try {
      const ps = promptSettings?.default || {};
      const shortWc  = ps.short_description?.word_count  || 30;
      const descWc   = ps.description?.word_count        || 150;
      const shortInstr  = ps.short_description?.custom_prompt  || "";
      const descInstr   = ps.description?.custom_prompt        || "";
      const metaTInstr  = ps.meta_title?.custom_prompt         || "";
      const metaDInstr  = ps.meta_description?.custom_prompt   || "";
      const shortKw  = ps.short_description?.keywords || "";
      const metaTKw  = ps.meta_title?.keywords        || "";
      const metaDKw  = ps.meta_description?.keywords  || "";

      const attrCtx = productAttributes.length > 0
        ? "\nProduct attributes:\n" + productAttributes.map(a => `- ${a.name}: ${a.value}`).join("\n")
        : "";
      const hasSeo = seoPlugin && seoPlugin !== false;
      const seoFields = hasSeo ? `\n  "meta_title": "...",\n  "meta_description": "...",` : "";
      const seoRules  = hasSeo ? `\n- meta_title: SEO title max 60 chars, same language as original.${metaTInstr ? " " + metaTInstr : ""}${metaTKw ? " Include keywords: " + metaTKw + "." : ""}
- meta_description: SEO meta description max 155 chars, same language.${metaDInstr ? " " + metaDInstr : ""}${metaDKw ? " Include keywords: " + metaDKw + "." : ""}` : "";

      const prompt = `You are a WooCommerce product data assistant. Generate content for a new product duplication.

Original product:
- Title: "${product.name}"
- Short description: "${product.short_description || "(none)"}"
- Description: "${(product.description || "").replace(/<[^>]+>/g, "").substring(0, 400) || "(none)"}"
- SKU(s): ${existingSkus.join(", ") || "(none)"}${attrCtx}

New product title: "${newTitle}"

Respond ONLY with valid JSON, no markdown fences:
{
  "short_description": "...",
  "description": "...",
  "sku": "...",
  "image_alt": "...",
  "attribute_suggestions": []${seoFields}
}

Rules:
- short_description: max ${shortWc} words, same language as original. No HTML.${shortInstr ? " " + shortInstr : ""}${shortKw ? " Include keywords: " + shortKw + "." : ""}
- description: max ${descWc} words, plain text (no HTML tags), well-structured.${descInstr ? " " + descInstr : ""}
- sku: follow exact same format/pattern as existing SKUs, derived logically from the new title.
- attribute_suggestions: array of {"name","original","suggested","reason"} where the new title clearly implies a different attribute value. Scan ALL attributes vs the new title. If a pot size, plant height, length etc is explicitly stated in the new title and differs from the original attribute, include it. If unclear, return [].${seoRules}`;

      const { data: { session } } = await supabase.auth.getSession();
      const aiAbort = new AbortController();
      const aiTimeout = setTimeout(() => aiAbort.abort(), 25000);
      let resp;
      try {
        resp = await fetch("/api/duplicate-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
          body: JSON.stringify({ prompt }),
          signal: aiAbort.signal,
        });
      } catch (fetchErr) {
        clearTimeout(aiTimeout);
        if (fetchErr.name === "AbortError") throw new Error("AI generatie duurde te lang (timeout). Probeer opnieuw.");
        throw fetchErr;
      }
      clearTimeout(aiTimeout);
      const data = await resp.json();
      const raw   = data.content?.[0]?.text || "";
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      setProgress("EAN ophalen uit pool...");
      const newEan = await fetchEanFromPool(parsed.sku);

      const suggestions = Array.isArray(parsed.attribute_suggestions) ? parsed.attribute_suggestions : [];
      const initChecks = {};
      suggestions.forEach(s => { initChecks[s.name] = true; });
      setAttrChecks(initChecks);

      const pv = {
        short_description:    parsed.short_description || "",
        description:          parsed.description       || "",
        sku:                  parsed.sku,
        ean:                  newEan,
        attribute_suggestions: suggestions,
        meta_title:           parsed.meta_title        || "",
        meta_description:     parsed.meta_description  || "",
      };
      setPreview(pv);
      setEditValues({
        short_description: pv.short_description,
        description:       pv.description,
        meta_title:        pv.meta_title,
        meta_description:  pv.meta_description,
      });
      setStep("preview");
    } catch (e) {
      setErrMsg("AI generatie mislukt: " + e.message);
      setStep("error");
    }
  };

  const createProduct = async () => {
    setStep("creating");
    setProgress("Product aanmaken in WooCommerce...");
    try {
      const isVariable = product.type === "variable";
      const { ean, sku } = preview;
      const short_description = editValues.short_description ?? preview.short_description;
      const description       = editValues.description       ?? preview.description;

      const getMeta = key => { const m = (product.meta_data || []).find(x => x.key === key); return m?.value ?? null; };
      const wqmTiersRaw    = product.wqm_tiers?.length > 0 ? null : getMeta('_wqm_tiers');
      const wqmSettingsRaw = product.wqm_settings ? null : getMeta('_wqm_settings');
      const resolvedTiers  = product.wqm_tiers?.length > 0
        ? product.wqm_tiers
        : (wqmTiersRaw?.tiers ? (Array.isArray(wqmTiersRaw.tiers) ? wqmTiersRaw.tiers : Object.values(wqmTiersRaw.tiers)).map(t => ({ qty: String(t.qty || ''), price: String(t.amt || '') })) : []);
      const resolvedTierType  = product.wqm_tier_type || product.wqm_settings?.tiered_pricing_type || wqmTiersRaw?.type || 'fixed';
      const resolvedSettings  = product.wqm_settings || wqmSettingsRaw || null;
      const resolvedLowStock  = product.low_stock_amount ?? getMeta('_low_stock_amount');

      // Apply checked attribute suggestions
      const checkedSuggestions = (preview.attribute_suggestions || []).filter(s => attrChecks[s.name]);
      const baseAttributes = (product.attributes || []).map(a => ({
        id: a.id || 0, name: a.name || a.slug || "",
        visible: !!a.visible, variation: !!a.variation,
        options: a.values || a.options || [],
      }));
      const finalAttributes = baseAttributes.map(a => {
        const sug = checkedSuggestions.find(s => s.name.toLowerCase() === (a.name || "").toLowerCase());
        return sug ? { ...a, options: [sug.suggested] } : a;
      });

      const titleSlug = newTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      // Upload images with new filenames via server-side proxy
      let uploadedImages = undefined;
      const allSourceImages = product.images || (product.featured_image ? [{ src: product.featured_image, alt: product.featured_image_alt || "" }] : []);
      // galleryMode controls which images to include: featured always included
      // "rename" = all images renamed+reuploaded, "same" = all images copied as-is, "none" = featured only (no gallery)
      const sourceImages = galleryMode === "none"
        ? allSourceImages.slice(0, 1)   // featured only
        : allSourceImages;

      if (sourceImages.length > 0 && galleryMode === "rename") {
        try {
          setProgress("Afbeeldingen uploaden met nieuwe bestandsnamen...");
          const tok = await getToken();
          const imgRes = await fetch("/api/duplicate-images", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tok}` },
            body: JSON.stringify({
              shopId: activeSite?.id,
              images: sourceImages.map((img, i) => ({ src: img.src, alt: img.alt || "", isFeatured: i === 0 })),
              titleSlug,
              newTitle,
            }),
          });
          if (imgRes.ok) {
            const imgData = await imgRes.json();
            uploadedImages = imgData.images;
          }
        } catch {} // non-fatal — fall through to inline src copy below
      }

      // SEO meta keys (write both Yoast + RankMath — harmless if plugin not present)
      const seoMeta = [];
      const mt = editValues.meta_title ?? preview.meta_title;
      const md = editValues.meta_description ?? preview.meta_description;
      if (mt) { seoMeta.push({ key: "_yoast_wpseo_title", value: mt }); seoMeta.push({ key: "rank_math_title", value: mt }); }
      if (md) { seoMeta.push({ key: "_yoast_wpseo_metadesc", value: md }); seoMeta.push({ key: "rank_math_description", value: md }); }

      const payload = {
        name: newTitle, type: product.type, status: "draft",
        short_description, description, sku,
        global_unique_id: ean,
        regular_price:  product.regular_price  || "",
        sale_price:     product.sale_price     || "",
        manage_stock:   product.manage_stock   || false,
        stock_quantity: product.stock_quantity ?? null,
        stock_status:   product.stock_status   || "instock",
        low_stock_amount: resolvedLowStock ?? "",
        categories:  (product.categories || []).map(c => ({ id: c.id })),
        attributes:  finalAttributes,
        images: (() => {
          if (uploadedImages?.length > 0) {
            // Use freshly uploaded media (renamed files, proper alt text)
            return uploadedImages.map(img => img.id
              ? { id: img.id, alt: img.alt }
              : { src: img.src, alt: img.alt, name: titleSlug }
            );
          }
          // Fallback: sideload from src (WooCommerce copies from URL)
          const aiAlt = preview?.image_alt || newTitle;
          const allImgs = sourceImages;
          if (allImgs.length === 0) return undefined;
          return allImgs.map((img, i) => i === 0
            ? { src: img.src, alt: aiAlt, name: titleSlug, description: aiAlt }
            : { src: img.src, alt: img.alt || newTitle }
          );
        })(),
        meta_data: [
          { key: "_alg_ean", value: ean },
          ...(resolvedTiers.length > 0 ? [{
            key: "_wqm_tiers",
            value: { type: resolvedTierType, tiers: resolvedTiers.map(t => ({ qty: parseFloat(t.qty) || 0, amt: parseFloat(t.price) || 0 })).sort((a, b) => b.qty - a.qty) },
          }] : [{ key: "_wqm_tiers", value: null }]),
          ...(resolvedSettings ? [{ key: "_wqm_settings", value: resolvedSettings }] : []),
          ...seoMeta,
        ],
      };

      setProgress("Product aanmaken...");
      const created = await wooCall(null, "products", "POST", payload);
      if (!created?.id) throw new Error("Geen product ID ontvangen van WooCommerce");

      if (isVariable && product.variations?.length > 0) {
        setProgress(`Variaties aanmaken (${product.variations.length})...`);
        const isSingleVar = product.variations.length === 1;
        for (const v of product.variations) {
          const varEan = isSingleVar ? ean : await fetchEanFromPool(sku + "-V" + (product.variations.indexOf(v) + 1), created.id);
          await wooCall(null, `products/${created.id}/variations`, "POST", {
            sku: v.sku ? sku + "-V" + (product.variations.indexOf(v) + 1) : "",
            regular_price: v.regular_price || "", sale_price: v.sale_price || "",
            manage_stock: v.manage_stock || false, stock_quantity: v.stock_quantity ?? null,
            stock_status: v.stock_status || "instock",
            attributes: Object.entries(v.attributes || {}).map(([slug, option]) => ({ id: 0, name: slug, option })),
            global_unique_id: varEan, meta_data: [{ key: "_alg_ean", value: varEan }],
          });
        }
      }
      setPreview(prev => ({ ...prev, createdId: created.id }));
      setStep("done");
    } catch (e) { setErrMsg("Aanmaken mislukt: " + e.message); setStep("error"); }
  };

  const iconFor = s => ({ input: "📋", generating: "🤖", preview: "✨", creating: "⚙️", done: "✅", error: "❌" })[s] || "📋";

  const renderEditableField = (field, label, multiline = false) => {
    const val = editValues[field] ?? preview?.[field] ?? "";
    const isEditing = editField === field;
    return (
      <div key={field} style={{ padding: "10px 12px", background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 10, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setEditField(isEditing ? null : field)} style={{ background: "none", border: "1px solid var(--b2)", borderRadius: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer", color: "var(--mx)" }}>{isEditing ? "✓ Klaar" : "✏ Bewerken"}</button>
            <button onClick={runAI} style={{ background: "none", border: "1px solid var(--b2)", borderRadius: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer", color: "var(--mx)" }} title="Alles opnieuw genereren">🔄</button>
          </div>
        </div>
        {isEditing
          ? <textarea value={val} onChange={e => setEditValues(v => ({ ...v, [field]: e.target.value }))} autoFocus
              style={{ width: "100%", minHeight: multiline ? 110 : 58, fontSize: 13, padding: 8, background: "var(--s3)", border: "1px solid var(--b2)", borderRadius: 4, color: "var(--tx)", resize: "vertical", boxSizing: "border-box" }} />
          : <div style={{ fontSize: 13, color: "var(--tx)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{val}</div>
        }
      </div>
    );
  };

  const hasSeoResult = seoPlugin && seoPlugin !== false && (preview?.meta_title || preview?.meta_description);

  return (
    <Overlay open onClose={step === "creating" ? undefined : onClose} width={560} title={`${iconFor(step)} Product dupliceren`}>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Source product */}
        <div style={{ display: "flex", gap: 12, padding: 12, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
          {product.featured_image && <img src={product.featured_image} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />}
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{product.name}</div>
            <div style={{ fontSize: 11, color: "var(--dm)", marginTop: 2 }}>SKU: {product.sku || "—"} · EAN: {sourceEan || "—"} · {product.type === "variable" ? `${product.variations?.length || 0} variaties` : "Enkelvoudig"}</div>
          </div>
        </div>

        {/* Input */}
        {step === "input" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Nieuwe producttitel" hint="AI gebruikt deze titel voor alle content en SKU">
              <Inp value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Bijv. Bamboehaag Premium 180cm" autoFocus
                onKeyDown={e => e.key === "Enter" && newTitle.trim() && runAI()} />
            </Field>
            {/* Gallery image mode */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>🖼 Afbeeldingen</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { value: "rename", label: "↑ Hernoemen & uploaden",   hint: "Alle afbeeldingen opnieuw uploaden met nieuwe bestandsnamen" },
                  { value: "same",   label: "= Zelfde als origineel",    hint: "Afbeeldingen overnemen zonder te hernoemen" },
                  { value: "none",   label: "✕ Alleen uitgelichte afb.", hint: "Geen galerijafbeeldingen — alleen de uitgelichte afbeelding" },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setGalleryMode(opt.value)}
                    title={opt.hint}
                    style={{ flex: 1, padding: "8px 10px", borderRadius: "var(--rd)", border: galleryMode === opt.value ? "2px solid var(--pr)" : "1px solid var(--b2)",
                      background: galleryMode === opt.value ? "rgba(99,102,241,0.12)" : "var(--s2)",
                      color: galleryMode === opt.value ? "var(--pr-h)" : "var(--mx)",
                      fontSize: 11, fontWeight: galleryMode === opt.value ? 700 : 400, cursor: "pointer", textAlign: "center", lineHeight: 1.4 }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: "10px 12px", background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "var(--rd)", fontSize: 12, color: "var(--mx)", lineHeight: 1.7 }}>
              🤖 AI genereert automatisch: <strong>Korte beschrijving</strong> · <strong>Productbeschrijving</strong> · <strong>SKU</strong> (patroon: <code style={{ background: "var(--s3)", padding: "1px 4px", borderRadius: 3 }}>{existingSkus[0] || "bestaand"}</code>) · <strong>EAN-13</strong>
              {seoPlugin && seoPlugin !== false && <> · <strong>SEO meta ({seoPlugin})</strong></>}
              {productAttributes.length > 0 && <> · <strong>Attribuut suggesties</strong></>}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={onClose}>Annuleren</Btn>
              <Btn variant="primary" onClick={runAI} disabled={!newTitle.trim()}>🤖 Genereren met AI →</Btn>
            </div>
          </div>
        )}

        {/* Generating */}
        {step === "generating" && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ width: 40, height: 40, border: "3px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <div style={{ fontWeight: 600, marginBottom: 6 }}>AI genereert productdata...</div>
            <div style={{ fontSize: 13, color: "var(--dm)" }}>{progress}</div>
          </div>
        )}

        {/* Preview */}
        {step === "preview" && preview && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--gr)" }}>✨ AI heeft het volgende gegenereerd:</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[{ label: "SKU", value: preview.sku }, { label: "EAN-13", value: preview.ean }].map(({ label, value }) => (
                <div key={label} style={{ padding: "10px 12px", background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd)" }}>
                  <div style={{ fontSize: 10, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, fontFamily: "monospace", color: "var(--pr-h)" }}>{value}</div>
                </div>
              ))}
            </div>

            {renderEditableField("short_description", "Korte beschrijving")}
            {renderEditableField("description", "Productbeschrijving", true)}

            {hasSeoResult && (
              <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd)", overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", background: "rgba(16,185,129,0.07)", borderBottom: "1px solid var(--b1)", fontSize: 11, fontWeight: 600, color: "var(--gr)", textTransform: "uppercase", letterSpacing: "0.05em" }}>🔍 SEO Meta ({seoPlugin})</div>
                <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {preview.meta_title        && renderEditableField("meta_title", "Meta titel")}
                  {preview.meta_description  && renderEditableField("meta_description", "Meta beschrijving")}
                </div>
              </div>
            )}

            {(preview.attribute_suggestions || []).length > 0 && (
              <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd)", overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", background: "rgba(245,158,11,0.07)", borderBottom: "1px solid var(--b1)", fontSize: 11, fontWeight: 600, color: "var(--ac)", textTransform: "uppercase", letterSpacing: "0.05em" }}>🏷 Attribuut suggesties</div>
                <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {preview.attribute_suggestions.map(s => (
                    <label key={s.name} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", padding: "8px 10px", background: attrChecks[s.name] ? "rgba(99,102,241,0.05)" : "var(--s2)", border: `1px solid ${attrChecks[s.name] ? "rgba(99,102,241,0.3)" : "var(--b1)"}`, borderRadius: "var(--rd)" }}>
                      <input type="checkbox" checked={!!attrChecks[s.name]} onChange={e => setAttrChecks(ch => ({ ...ch, [s.name]: e.target.checked }))} style={{ marginTop: 2, flexShrink: 0 }} />
                      <div style={{ fontSize: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>{s.name}: <span style={{ color: "var(--dm)", textDecoration: "line-through" }}>{s.original}</span> → <span style={{ color: "var(--pr-h)" }}>{s.suggested}</span></div>
                        <div style={{ color: "var(--mx)", fontSize: 11 }}>{s.reason}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div style={{ padding: "8px 12px", background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "var(--rd)", fontSize: 12, color: "var(--mx)" }}>
              💡 Wordt aangemaakt als <strong>Concept</strong>. Afbeelding gekopieerd met nieuwe titel als alt-tekst.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setStep("input")}>← Terug</Btn>
              <Btn variant="secondary" onClick={() => { setPreview(null); runAI(); }}>🔄 Alles opnieuw</Btn>
              <Btn variant="primary" onClick={createProduct}>✅ Product aanmaken</Btn>
            </div>
          </div>
        )}

        {/* Creating */}
        {step === "creating" && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ width: 40, height: 40, border: "3px solid var(--b2)", borderTopColor: "var(--gr)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Aanmaken in WooCommerce...</div>
            <div style={{ fontSize: 13, color: "var(--dm)" }}>{progress}</div>
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Product aangemaakt!</div>
              <div style={{ fontSize: 13, color: "var(--dm)" }}><strong>{newTitle}</strong> is aangemaakt als concept in WooCommerce.</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[{ label: "SKU", value: preview.sku }, { label: "EAN-13", value: preview.ean }].map(({ label, value }) => (
                <div key={label} style={{ padding: "8px 12px", background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd)", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "var(--dm)", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, fontFamily: "monospace", color: "var(--pr-h)" }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={onClose}>Sluiten</Btn>
              <Btn variant="primary" onClick={() => { onCreated?.(); onClose(); }}>🔄 Productenlijst vernieuwen</Btn>
            </div>
          </div>
        )}

        {/* Error */}
        {step === "error" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: 16, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--rd)", color: "var(--re)", fontSize: 13 }}>❌ {errMsg}</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={onClose}>Sluiten</Btn>
              <Btn variant="primary" onClick={() => { setStep("input"); setErrMsg(""); }}>← Opnieuw proberen</Btn>
            </div>
          </div>
        )}

      </div>
    </Overlay>
  );
};

// ─── ConnectCTA — used by ConnectedSitesView and AnalyticsView ───────────────
const ConnectCTA = ({ service, icon, title, description }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "28px 20px", textAlign: "center", gap: 10 }}>
    <div style={{ fontSize: 32 }}>{icon}</div>
    <div style={{ fontFamily: "var(--font-h)", fontSize: 14, fontWeight: 700, color: "var(--tx)" }}>{title}</div>
    <div style={{ fontSize: 12, color: "var(--mx)", lineHeight: 1.6, maxWidth: 240 }}>{description}</div>
    <a href="/#settings" onClick={() => window.location.hash = "settings"} style={{ textDecoration: "none" }}>
      <button style={{ marginTop: 4, padding: "7px 16px", borderRadius: 99, border: "1px solid var(--pr)", background: "var(--pr-l)", color: "var(--pr-h)", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
        Koppelen in Instellingen →
      </button>
    </a>
  </div>
);

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

  // getToken imported from supabase.js — no local wrapper

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

  // ConnectCTA is defined at module level below

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

const CouponManager = ({ activeSite, user, couponCache, onCouponCacheUpdate }) => {
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
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Load from WooCommerce + Supabase, with session cache to avoid re-fetching on tab switch
  const loadHistory = async (siteId, force = false) => {
    if (!siteId) return;
    // Return cached data if available and not forced
    const cached = couponCache?.[siteId];
    if (cached && !force) {
      setHistory(cached.rows);
      return;
    }
    setHistoryLoading(true);
    try {
      const token = await getToken();
      // 1. WooCommerce coupon list
      const wooRes = await fetch('/api/woo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ shop_id: siteId, endpoint: 'coupons?per_page=20&orderby=date&order=desc', method: 'GET' }),
      });
      const wooCoupons = wooRes.ok ? (await wooRes.json()) : [];

      // 2. Supabase expires_at keyed by woo_coupon_id
      const { data: dbRows } = await supabase
        .from('coupons')
        .select('woo_coupon_id, expires_at, id')
        .eq('shop_id', siteId);
      const expiryMap = {};
      const dbIdMap = {};
      (dbRows || []).forEach(r => {
        if (r.woo_coupon_id) {
          expiryMap[r.woo_coupon_id] = r.expires_at;
          dbIdMap[r.woo_coupon_id] = r.id;
        }
      });

      // 3. Merge
      const merged = Array.isArray(wooCoupons) ? wooCoupons.map(cc => ({
        ...cc,
        expires_at: expiryMap[cc.id] || (cc.date_expires ? new Date(cc.date_expires + 'Z').toISOString() : null),
        db_id: dbIdMap[cc.id] || null,
      })) : [];

      setHistory(merged);
      // Store in session cache
      onCouponCacheUpdate?.(prev => ({ ...prev, [siteId]: { rows: merged, loadedAt: Date.now() } }));
    } catch (e) { console.error('Load coupon history failed:', e); }
    finally { setHistoryLoading(false); }
  };

  const deleteCoupon = async (wooId, dbId) => {
    if (!window.confirm('Kortingscode verwijderen?')) return;
    setDeletingId(wooId);
    try {
      const token = await getToken();
      const res = await fetch('/api/coupon-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ coupon_db_id: dbId, woo_coupon_id: wooId, shop_id: activeSite.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Verwijderen mislukt');
      const updated = history.filter(cc => cc.id !== wooId);
      setHistory(updated);
      onCouponCacheUpdate?.(prev => ({ ...prev, [activeSite.id]: { rows: updated, loadedAt: Date.now() } }));
    } catch (e) { console.error('Delete coupon failed:', e); alert('Verwijderen mislukt: ' + e.message); }
    finally { setDeletingId(null); }
  };

  const copyCode = (code, id) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Check if Advanced Coupons is installed on the active shop
  useEffect(() => {
    if (!activeSite) return;
    setHasAdvCoupons(null);
    setCheckingPlugin(true);
    // Restore from cache immediately (no spinner), fetch in background only if not cached
    const cached = couponCache?.[activeSite.id];
    if (cached) setHistory(cached.rows);
    else setHistory([]);
    loadHistory(activeSite.id); // reads cache, skips network if already loaded
    const checkPlugin = async () => {
      try {
        const token = await getToken();
        // Try system_status first; fall back to plugins endpoint on 400/403
        let plugins = null;
        const res = await fetch("/api/woo", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ shop_id: activeSite.id, endpoint: "system_status", method: "GET" }),
        });
        if (res.ok) {
          const d = await res.json();
          plugins = d.active_plugins || [];
        } else {
          // system_status requires manage_woocommerce; try plugins endpoint instead
          const res2 = await fetch("/api/woo", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ shop_id: activeSite.id, endpoint: "plugins?per_page=100&status=active", method: "GET" }),
          });
          if (res2.ok) {
            const plugins2 = await res2.json();
            plugins = Array.isArray(plugins2) ? plugins2.map(p => ({ plugin: p.plugin || p.textdomain || "" })) : [];
          }
        }
        if (plugins !== null) {
          const hasIt = plugins.some(p =>
            (p.plugin || p.name || "").toLowerCase().includes("advanced-coupons") ||
            (p.plugin || p.name || "").toLowerCase().includes("advanced_coupons") ||
            (p.textdomain || "").toLowerCase().includes("advanced-coupons")
          );
          setHasAdvCoupons(hasIt);
        } else {
          setHasAdvCoupons(false);
        }
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
      const token = await getToken();
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
      loadHistory(activeSite.id, true); // force refresh after new coupon
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

      {/* ── Coupon history (from Supabase — has correct expires_at) ── */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>📋 Recente kortingscodes</div>
          <Btn variant="ghost" size="sm" onClick={() => loadHistory(activeSite?.id, true)} disabled={historyLoading}>
            {historyLoading ? "↻ Laden..." : "🔄 Vernieuwen"}
          </Btn>
        </div>

        {historyLoading && history.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "var(--dm)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ animation: "spin 0.8s linear infinite", display: "inline-block" }}>↻</span> Laden...
          </div>
        ) : history.length === 0 ? (
          <div style={{ padding: "20px 0", textAlign: "center", color: "var(--dm)", fontSize: 12, border: "1px dashed var(--b2)", borderRadius: "var(--rd)" }}>
            Nog geen kortingscodes aangemaakt voor deze shop.
          </div>
        ) : (
          <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 70px 90px 70px 150px 36px", background: "var(--s2)", padding: "7px 12px", borderBottom: "1px solid var(--b1)" }}>
              {["Code", "Type", "Korting", "Gebruik", "Limiet", "Vervalt", ""].map((h, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 600, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
              ))}
            </div>
            {history.map((coupon, idx) => {
              const typeLabel = coupon.discount_type === "percent" ? "%" : coupon.discount_type === "fixed_cart" ? "€ Cart" : "€ Product";
              const amount = coupon.discount_type === "percent"
                ? `${parseFloat(coupon.amount || 0).toFixed(0)}%`
                : `€${parseFloat(coupon.amount || 0).toFixed(2)}`;

              // expires_at is stored as ISO string in Supabase
              const expiryDate = coupon.expires_at ? new Date(coupon.expires_at) : null;
              const isExpired = expiryDate && expiryDate < new Date();
              const expires = expiryDate
                ? expiryDate.toLocaleString("nl-NL", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })
                : "—";

              return (
                <div key={coupon.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 70px 90px 70px 150px 36px", padding: "8px 12px", borderBottom: idx < history.length - 1 ? "1px solid var(--b1)" : "none", alignItems: "center", background: isExpired ? "rgba(239,68,68,0.03)" : "transparent" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <code style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: isExpired ? "var(--dm)" : "var(--gr)", background: "var(--s3)", padding: "2px 7px", borderRadius: 4, border: "1px solid var(--b1)" }}>
                      {coupon.code?.toUpperCase()}
                    </code>
                    <button onClick={() => copyCode(coupon.code?.toUpperCase(), coupon.id)}
                      title="Kopieer code"
                      style={{ background: "none", border: "none", cursor: "pointer", color: copiedId === coupon.id ? "var(--gr)" : "var(--dm)", fontSize: 13, padding: "0 2px", lineHeight: 1 }}>
                      {copiedId === coupon.id ? "✓" : "📋"}
                    </button>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--mx)" }}>{typeLabel}</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{amount}</span>
                  <span style={{ fontSize: 11, color: "var(--mx)" }}>{(coupon.usage_count ?? 0)}×</span>
                  <span style={{ fontSize: 11, color: "var(--mx)" }}>{coupon.usage_limit ? coupon.usage_limit : "∞"}</span>
                  <span style={{ fontSize: 11, color: isExpired ? "var(--re)" : "var(--mx)" }}>
                    {isExpired ? "⚠ " : ""}{expires}
                  </span>
                  <button onClick={() => deleteCoupon(coupon.id, coupon.db_id)} disabled={deletingId === coupon.id}
                    title="Verwijderen"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dm)", fontSize: 13, padding: "2px 4px", borderRadius: 4, opacity: deletingId === coupon.id ? 0.5 : 1 }}>
                    {deletingId === coupon.id ? "↻" : "🗑"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};

const MarketingView = ({ activeSite, shops, user, couponCache, onCouponCacheUpdate }) => {
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
      {marketingTab === "coupons" && <CouponManager activeSite={activeSite} user={user} couponCache={couponCache} onCouponCacheUpdate={onCouponCacheUpdate} />}
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
        const session = { access_token: await getToken() };
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
  const [planHistory, setPlanHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [createUser, setCreateUser] = useState(null);
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [createUserError, setCreateUserError] = useState(null);
  const [paymentsData, setPaymentsData] = useState(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");
  const [adminPlanFilter, setAdminPlanFilter] = useState("all");
  const [invoiceUser, setInvoiceUser] = useState(null);
  const [userInvoices, setUserInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  const loadPayments = async () => {
    setPaymentsLoading(true);
    try {
      const session = { access_token: await getToken() };
      const res = await fetch("/api/mollie-payments", { headers: { "Authorization": `Bearer ${session?.access_token}` } });
      const data = await res.json();
      if (!data.error) setPaymentsData(data);
      else setPaymentsData({ error: data.error });
    } catch (e) { setPaymentsData({ error: e.message }); }
    finally { setPaymentsLoading(false); }
  };

  useEffect(() => { if (adminTab === "payments") loadPayments(); }, [adminTab]);

  // Load plan history whenever a user is opened for editing
  useEffect(() => {
    if (!editUser?.id) { setPlanHistory(null); setHistoryError(""); return; }
    let cancelled = false;
    const load = async () => {
      setHistoryLoading(true);
      setPlanHistory(null);
      setHistoryError("");
      try {
        const session = { access_token: await getToken() };
        const res = await fetch(`/api/admin-users?history=${editUser.id}`, { headers: { "Authorization": `Bearer ${session?.access_token}` } });
        const data = await res.json();
        if (!cancelled) setPlanHistory(data.history || []);
      } catch (e) { if (!cancelled) setHistoryError(e.message); }
      finally { if (!cancelled) setHistoryLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [editUser?.id]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        // Ensure we have a fresh session
        const token = await getToken(); const sessErr = token ? null : new Error("No session"); const session = { access_token: token };
        if (sessErr || !session) {
          console.error("No session for admin-users:", sessErr);
          setUsersLoading(false);
          return;
        }
        const res = await fetch("/api/admin-users", {
          headers: { "Authorization": `Bearer ${session.access_token}` }
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("admin-users GET failed:", res.status, body);
          throw new Error(`${res.status}: ${body.error || "Laden mislukt"}`);
        }
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
      const token = await getToken();
      const planLimits = PLANS[u.plan] || PLANS.growth;
      // Soft ceiling: cap values at 2× plan limit (allows custom overrides but prevents runaway costs)
      const capKb    = planLimits.img_max_kb * 2;
      const capQual  = 100;
      const capWidth = planLimits.img_max_width * 2;
      const payload = {
        id: u.id,
        plan: u.plan,
        max_shops: u.max_shops ? parseInt(u.max_shops) : (planLimits.sites || 10),
        max_connected_products: u.max_connected_products ? parseInt(u.max_connected_products) : (planLimits.connected_products || 500),
        is_admin: u.is_admin ?? false,
        ai_taxonomy_enabled: u.ai_taxonomy_enabled ?? false,
        ai_taxonomy_model: u.ai_taxonomy_model || "gemini-2.5-flash-image",
        ai_taxonomy_threshold: u.ai_taxonomy_threshold ? parseFloat(u.ai_taxonomy_threshold) : 0.85,
        gemini_model: u.gemini_model || planLimits.gemini_model,
        img_max_kb:    Math.min(u.img_max_kb    ? parseInt(u.img_max_kb)    : planLimits.img_max_kb,    capKb),
        img_quality:   Math.min(u.img_quality   ? parseInt(u.img_quality)   : planLimits.img_quality,   capQual),
        img_max_width: Math.min(u.img_max_width ? parseInt(u.img_max_width) : planLimits.img_max_width, capWidth),
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

  const reactivateUser = async (u) => {
    if (!window.confirm(`Abonnement van ${u.email} heractiveren?`)) return;
    try {
      const token = await getToken();
      const res = await fetch("/api/reactivate-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ user_id: u.id }),
      });
      const result = await res.json();
      if (!res.ok || result.error) { alert("Heractiveren mislukt: " + (result.error || res.statusText)); return; }
      setUsers(us => us.map(usr => usr.id === u.id ? { ...usr, plan: result.plan, pending_downgrade_plan: null, pending_downgrade_billing_period: null } : usr));
      setEditUser(prev => prev ? { ...prev, plan: result.plan, pending_downgrade_plan: null, pending_downgrade_billing_period: null } : null);
      alert(`✅ Abonnement heractiveerd. E-mail verstuurd naar ${u.email}.`);
    } catch (e) { alert("Heractiveren mislukt: " + e.message); }
  };

  const handleCreateUser = async () => {
    const u = createUser;
    if (!u.email?.trim()) { setCreateUserError("E-mail is verplicht."); return; }
    if (!u.password || u.password.length < 8) { setCreateUserError("Wachtwoord moet minimaal 8 tekens zijn."); return; }
    setCreateUserLoading(true); setCreateUserError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin-users", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(u),
      });
      const result = await res.json();
      if (!res.ok || result.error) { setCreateUserError(result.error || "Aanmaken mislukt."); return; }
      setCreateUser(null);
      // Reload full user list from server to ensure clean state
      const res2 = await fetch("/api/admin-users", { headers: { "Authorization": `Bearer ${token}` } });
      if (res2.ok) { const data = await res2.json(); setUsers(data || []); }
    } catch (e) { setCreateUserError(e.message); }
    finally { setCreateUserLoading(false); }
  };

  const archiveUser = async (u) => {
    const isArchived = u.archived;
    const label = isArchived ? "Dearchiveren" : "Archiveren";
    if (!window.confirm(`${label}: ${u.email}? ${isArchived ? "Account wordt hersteld." : "Account wordt gesuspendeerd en verborgen."}`)) return;
    try {
      const session = { access_token: await getToken() };
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
      const token = await getToken();
      if (!token) { alert("Sessie verlopen — log opnieuw in."); return; }
      const session = { access_token: token };
      const res = await fetch("/api/admin-users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ id: u.id }),
      });
      const result = await res.json();
      if (!res.ok) { alert(`Fout ${res.status}: ${result.error}`); return; }
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
              const session = { access_token: await getToken() };
              // Use API endpoint (service role key, bypasses RLS) instead of direct client query
              const res = await fetch(`/api/get-invoice?user_id=${u.id}`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
              if (res.ok) {
                const d = await res.json();
                if (d.invoices?.length) { setUserInvoices(d.invoices); setInvoicesLoading(false); return; }
              }
              // If no DB records but user has a paid mollie_payment_id, try get-invoice which creates on-demand
              if (u.mollie_payment_id && PLANS[u.plan]) {
                const res2 = await fetch(`/api/get-invoice?payment_id=${u.mollie_payment_id}`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
                if (res2.ok) {
                  // After on-demand creation, re-fetch list
                  const res3 = await fetch(`/api/get-invoice?user_id=${u.id}`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
                  if (res3.ok) { const d3 = await res3.json(); setUserInvoices(d3.invoices || []); }
                  else { setUserInvoices([]); }
                } else { setUserInvoices([]); }
              } else { setUserInvoices([]); }
            } catch { setUserInvoices([]); } finally { setInvoicesLoading(false); }
          };

          const archivedCount = users.filter(u => u.archived).length;
          const visibleUsers = users.filter(u => {
            if (showArchived ? !u.archived : u.archived) return false;
            if (adminPlanFilter !== "all" && u.plan !== adminPlanFilter) return false;
            if (adminSearch.trim()) {
              const q = adminSearch.toLowerCase();
              return (u.email || "").toLowerCase().includes(q) ||
                (u.full_name || u.name || "").toLowerCase().includes(q) ||
                (u.business_name || "").toLowerCase().includes(q);
            }
            return true;
          });

          return (
            <div>
              {/* Toolbar */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                <input
                  value={adminSearch}
                  onChange={e => setAdminSearch(e.target.value)}
                  placeholder="Zoek op naam, e-mail of bedrijf…"
                  style={{ flex: "1 1 200px", minWidth: 180, padding: "6px 10px", borderRadius: "var(--rd)", border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--tx)", fontSize: 13 }}
                />
                <select
                  value={adminPlanFilter}
                  onChange={e => setAdminPlanFilter(e.target.value)}
                  style={{ padding: "6px 10px", borderRadius: "var(--rd)", border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--tx)", fontSize: 13, cursor: "pointer" }}
                >
                  <option value="all">Alle plannen</option>
                  <option value="starter">Starter</option>
                  <option value="growth">Growth</option>
                  <option value="pro">Pro</option>
                  <option value="free_forever">Free forever</option>
                  <option value="pending_payment">In afwachting</option>
                  <option value="suspended">Gesuspendeerd</option>
                </select>
                <span style={{ fontSize: 12, color: "var(--dm)", whiteSpace: "nowrap" }}>{visibleUsers.length} van {users.filter(u => showArchived ? u.archived : !u.archived).length}</span>
                <Btn variant="ghost" size="sm" onClick={() => setShowArchived(a => !a)}>
                  {showArchived ? "← Actief" : `📦 Gearchiveerd (${archivedCount})`}
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => {
                  const rows = [
                    ["Naam", "E-mail", "Bedrijf", "Land", "Plan", "Facturering", "Status", "Shops", "Ingeschreven", "Laatst gezien", "Volgende betaling"].join(","),
                    ...visibleUsers.map(u => {
                      let nextRen = "";
                      if (u.billing_cycle_start && ["starter","growth","pro"].includes(u.plan)) {
                        const d = new Date(u.billing_cycle_start);
                        u.billing_period === "annual" ? d.setFullYear(d.getFullYear()+1) : d.setMonth(d.getMonth()+1);
                        nextRen = d.toLocaleDateString("nl-NL");
                      }
                      return [
                        (u.full_name||u.name||"").replace(/,/g," "),
                        u.email||"",
                        (u.business_name||"").replace(/,/g," "),
                        u.country||"",
                        u.plan||"",
                        u.billing_period||"",
                        u.plan==="suspended"?"Gesuspendeerd":["starter","growth","pro"].includes(u.plan)?"Actief":u.plan,
                        u.sites||0,
                        u.registered_at?new Date(u.registered_at).toLocaleDateString("nl-NL"):"",
                        u.last_seen_at?new Date(u.last_seen_at).toLocaleDateString("nl-NL"):"",
                        nextRen,
                      ].join(",");
                    })
                  ].join("\n");
                  const blob = new Blob([rows], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = `woosyncshop-gebruikers-${new Date().toISOString().slice(0,10)}.csv`; a.click();
                  URL.revokeObjectURL(url);
                }}>⬇ CSV</Btn>
                <Btn variant="primary" size="sm" onClick={() => setCreateUser({ plan: "growth", billingPeriod: "monthly", country: "NL" })}>+ Gebruiker</Btn>
              </div>
              <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "130px 150px 100px 90px 100px 50px 80px 110px 1fr", gap: 0, background: "var(--s2)", padding: "8px 14px", borderBottom: "1px solid var(--b1)" }}>
                  {["Naam", "E-mail", "Bedrijf", "Plan", "Volgende betaling", "Shops", "Status", "Aangemeld / Gezien", "Acties"].map((h, i) => (
                    <span key={i} style={{ fontSize: 11, color: "var(--dm)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</span>
                  ))}
                </div>
                {visibleUsers.length === 0 && (
                  <div style={{ padding: "20px 14px", fontSize: 13, color: "var(--dm)" }}>Geen gebruikers gevonden.</div>
                )}
                {visibleUsers.map(u => {
                  // Compute next renewal date
                  let nextRenewal = null;
                  if (u.billing_cycle_start && ["starter","growth","pro"].includes(u.plan)) {
                    const d = new Date(u.billing_cycle_start);
                    u.billing_period === "annual" ? d.setFullYear(d.getFullYear() + 1) : d.setMonth(d.getMonth() + 1);
                    nextRenewal = d;
                  }
                  const renewalStr = nextRenewal ? nextRenewal.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—";
                  const renewalPast = nextRenewal && nextRenewal < new Date();

                  return (
                  <div key={u.id} style={{ display: "grid", gridTemplateColumns: "130px 150px 100px 90px 100px 50px 80px 110px 1fr", gap: 0, padding: "10px 14px", borderBottom: "1px solid var(--b1)", alignItems: "center", opacity: u.archived ? 0.6 : 1, background: u.archived ? "rgba(239,68,68,0.03)" : "transparent" }}>
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
                    <Badge color={u.plan === "free_forever" ? "green" : u.plan === "suspended" ? "red" : "blue"} size="sm">
                      {u.email === SUPERADMIN_EMAIL ? "⚡ Superadmin" : u.plan === "free_forever" ? "🎁 Free ∞" : u.plan === "suspended" ? "Gesuspendeerd" : u.plan === "pending_payment" ? "⏳ Pending" : PLANS[u.plan]?.name || u.plan || "–"}
                    </Badge>
                    <div>
                      <div style={{ fontSize: 11, color: renewalPast ? "var(--re)" : "var(--mx)" }}>{renewalStr}</div>
                      {u.pending_downgrade_plan && <div style={{ fontSize: 10, color: "var(--ac)" }}>↓ {u.pending_downgrade_plan === "cancelled" ? "Opgezegd" : PLANS[u.pending_downgrade_plan]?.name}</div>}
                    </div>
                    <span style={{ fontSize: 13 }}>{u.sites || 0} / {u.max_shops || 10}</span>
                    <Badge color={u.email === SUPERADMIN_EMAIL ? "purple" : u.plan === "free_forever" ? "green" : u.plan === "suspended" ? "red" : ["starter","growth","pro"].includes(u.plan) ? "green" : "amber"} size="sm">
                      {u.email === SUPERADMIN_EMAIL ? "Superadmin" : u.plan === "free_forever" ? "Free forever" : u.plan === "suspended" ? "Gesuspendeerd" : u.plan === "pending_payment" ? "In afwachting" : ["starter","growth","pro"].includes(u.plan) ? "Actief" : "In afwachting"}
                    </Badge>
                    <div style={{ fontSize: 11, color: "var(--dm)" }}>
                      <div>{u.registered_at ? new Date(u.registered_at).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—"}</div>
                      {u.last_seen_at && <div style={{ color: "var(--pr-h)", marginTop: 2 }}>👁 {new Date(u.last_seen_at).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <Btn variant="ghost" size="sm" onClick={() => setEditUser(u)}>✏</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => loadInvoices(u)} title="Facturen">🧾</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => archiveUser(u)} title={u.archived ? "Dearchiveren" : "Archiveren"} style={{ color: u.archived ? "var(--gr)" : "var(--ac)" }}>{u.archived ? "↩" : "📦"}</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => deleteUser(u)} title="Permanent verwijderen" style={{ color: "var(--re)" }}>🗑</Btn>
                    </div>
                  </div>
                  );
                })}
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
                                const session = { access_token: await getToken() };
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
                              const session = { access_token: await getToken() };
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
      {createUser && (() => {
        const isFree = createUser.discountCode?.toLowerCase() === "freeforever";
        const planLimits = PLANS[createUser.plan] || PLANS.growth;
        return (
          <Overlay open onClose={() => { setCreateUser(null); setCreateUserError(null); }} width={580} title="Gebruiker aanmaken">
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Basic info */}
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--mx)", textTransform: "uppercase", letterSpacing: "0.04em" }}>👤 Account gegevens</div>
              <div className="settings-2col">
                <Field label="Naam">
                  <Inp value={createUser.full_name || ""} onChange={e => setCreateUser(u => ({ ...u, full_name: e.target.value }))} placeholder="Jan de Vries" />
                </Field>
                <Field label="Bedrijfsnaam">
                  <Inp value={createUser.business_name || ""} onChange={e => setCreateUser(u => ({ ...u, business_name: e.target.value }))} placeholder="Optioneel" />
                </Field>
                <Field label="E-mailadres">
                  <Inp value={createUser.email || ""} onChange={e => setCreateUser(u => ({ ...u, email: e.target.value }))} placeholder="jan@bedrijf.nl" />
                </Field>
                <Field label="Wachtwoord" hint="Min. 8 tekens">
                  <Inp value={createUser.password || ""} onChange={e => setCreateUser(u => ({ ...u, password: e.target.value }))} type="password" placeholder="Tijdelijk wachtwoord" />
                </Field>
                <Field label="Land">
                  <Sel value={createUser.country || "NL"} onChange={e => setCreateUser(u => ({ ...u, country: e.target.value }))}
                    options={[{ value: "NL", label: "Nederland" }, ...EU_COUNTRIES.filter(c => c.code !== "NL").map(c => ({ value: c.code, label: c.label || c.code })), { value: "OTHER", label: "Buiten EU" }]} />
                </Field>
                <Field label="Kortingscode" hint="Gebruik FREEFOREVER voor gratis account">
                  <Inp value={createUser.discountCode || ""} onChange={e => setCreateUser(u => ({ ...u, discountCode: e.target.value }))} placeholder="Optioneel" />
                </Field>
              </div>

              {/* Plan section */}
              <Divider />
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--mx)", textTransform: "uppercase", letterSpacing: "0.04em" }}>📦 Plan</div>
              {isFree ? (
                <div style={{ padding: "10px 14px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "var(--rd)", fontSize: 13, color: "var(--gr)" }}>
                  🎁 Free Forever — welkomstmail met login-link wordt verstuurd, geen betaallink.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="settings-2col">
                    <Field label="Plan">
                      <Sel value={createUser.plan} onChange={e => setCreateUser(u => ({ ...u, plan: e.target.value }))} options={[
                        { value: "starter", label: "Starter – €7,99/mnd" },
                        { value: "growth",  label: "Growth – €11,99/mnd" },
                        { value: "pro",     label: "Pro – €19,99/mnd" },
                      ]} />
                    </Field>
                    <Field label="Facturering">
                      <Sel value={createUser.billingPeriod || "monthly"} onChange={e => setCreateUser(u => ({ ...u, billingPeriod: e.target.value }))} options={[
                        { value: "monthly", label: "Maandelijks" },
                        { value: "annual",  label: "Jaarlijks (−10%)" },
                      ]} />
                    </Field>
                  </div>
                  <div style={{ padding: "8px 12px", background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "var(--rd)", fontSize: 12, color: "var(--mx)" }}>
                    📧 Betaalherinnering wordt verstuurd naar het opgegeven e-mailadres.
                  </div>
                </div>
              )}

              {/* Overrides */}
              <Divider />
              <div className="settings-2col">
                <Field label="Max shops (override)" hint={`Standaard plan: ${isFree ? PLANS.starter.sites : (planLimits.sites ?? "—")}`}>
                  <Inp value={createUser.max_shops ?? (isFree ? PLANS.starter.sites : planLimits.sites)} onChange={e => setCreateUser(u => ({ ...u, max_shops: e.target.value }))} type="number" />
                </Field>
                <Field label="Max verbonden producten (override)" hint={`Standaard plan: ${isFree ? PLANS.starter.connected_products : (planLimits.connected_products ?? "—")}`}>
                  <Inp value={createUser.max_connected_products ?? (isFree ? PLANS.starter.connected_products : planLimits.connected_products)} onChange={e => setCreateUser(u => ({ ...u, max_connected_products: e.target.value }))} type="number" />
                </Field>
              </div>

              {/* AI Image pipeline */}
              <Divider />
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--mx)", textTransform: "uppercase", letterSpacing: "0.04em" }}>🤖 AI image pipeline (per gebruiker)</div>
              {(() => {
                const limits = isFree ? PLANS.starter : planLimits;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ padding: "8px 12px", background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "var(--rd)", fontSize: 12, color: "var(--mx)" }}>
                      Standaard limieten: model <strong>{limits.gemini_model}</strong> · max <strong>{limits.img_max_kb} KB</strong> · kwaliteit <strong>{limits.img_quality}%</strong> · max breedte <strong>{limits.img_max_width}px</strong>
                    </div>
                    <div className="settings-2col">
                      <Field label="Gemini model" hint="Hogere modellen = meer Gemini kosten">
                        <Sel value={createUser.gemini_model || limits.gemini_model} onChange={e => setCreateUser(u => ({ ...u, gemini_model: e.target.value }))} options={[
                          { value: "gemini-2.5-flash",       label: "Flash — gebalanceerd (Starter/Growth)" },
                          { value: "gemini-2.5-flash-image", label: "Flash Image — hoge kwaliteit (Pro)" },
                          { value: "gemini-2.5-pro",         label: "Pro — max kwaliteit (custom)" },
                        ]} />
                      </Field>
                      <Field label="Max bestandsgrootte" hint={`Plan max: ${limits.img_max_kb} KB`}>
                        <Inp value={createUser.img_max_kb ?? limits.img_max_kb} onChange={e => setCreateUser(u => ({ ...u, img_max_kb: e.target.value }))} type="number" suffix="KB" />
                      </Field>
                      <Field label="Compressiekwaliteit" hint={`Plan max: ${limits.img_quality}%`}>
                        <Inp value={createUser.img_quality ?? limits.img_quality} onChange={e => setCreateUser(u => ({ ...u, img_quality: e.target.value }))} type="number" suffix="%" />
                      </Field>
                      <Field label="Max breedte" hint={`Plan max: ${limits.img_max_width}px`}>
                        <Inp value={createUser.img_max_width ?? limits.img_max_width} onChange={e => setCreateUser(u => ({ ...u, img_max_width: e.target.value }))} type="number" suffix="px" />
                      </Field>
                    </div>
                  </div>
                );
              })()}

              {/* AI Taxonomy */}
              <Divider />
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--mx)", textTransform: "uppercase", letterSpacing: "0.04em" }}>🧠 AI Taxonomie Vertaling</div>
              <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>Functie inschakelen</div>
                  <div style={{ fontSize: 12, color: "var(--dm)", marginTop: 2 }}>Staat de gebruiker toe AI-taxonomievertaling te activeren.</div>
                </div>
                <Tog checked={createUser.ai_taxonomy_enabled ?? false} onChange={v => setCreateUser(u => ({ ...u, ai_taxonomy_enabled: v }))} />
              </div>

              {createUserError && (
                <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--rd)", fontSize: 13, color: "var(--re)" }}>
                  {createUserError}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8 }}>
                <Btn variant="secondary" onClick={() => { setCreateUser(null); setCreateUserError(null); }}>Annuleren</Btn>
                <Btn variant="primary" onClick={handleCreateUser} disabled={createUserLoading}>
                  {createUserLoading ? "Aanmaken..." : (isFree ? "Aanmaken + welkomstmail →" : "Aanmaken + betaalmail →")}
                </Btn>
              </div>
            </div>
          </Overlay>
        );
      })()}

      {editUser && (() => {
          const eventLabel = { registered: "Geregistreerd", activated: "Geactiveerd", upgraded: "Upgrade", downgraded: "Downgrade", pending_upgrade: "Upgrade gestart", pending_downgrade: "Downgrade gepland", downgrade_applied: "Downgrade doorgevoerd", cancelled: "Betaling mislukt", renewal: "Automatische verlenging", suspended: "Gesuspendeerd", admin_change: "Admin wijziging", pending_cancellation: "Opzegging gepland" };
          const eventColor = { registered: "blue", activated: "green", upgraded: "green", downgraded: "amber", pending_upgrade: "blue", pending_downgrade: "amber", downgrade_applied: "amber", cancelled: "red", renewal: "green", suspended: "red", admin_change: "blue", pending_cancellation: "amber" };
          return (
            <Overlay open onClose={() => setEditUser(null)} width={620} title={`Configuratie: ${editUser.name || editUser.email || "gebruiker"}`}>
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                {/* User header card */}
                <div style={{ padding: 12, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{editUser.email}</div>
                    <div style={{ fontSize: 12, color: "var(--dm)" }}>{editUser.sites} shops verbonden</div>
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Badge color={editUser.email === SUPERADMIN_EMAIL ? "purple" : editUser.plan === "free_forever" ? "green" : editUser.plan === "suspended" ? "red" : "blue"}>
                      {editUser.email === SUPERADMIN_EMAIL ? "⚡ Superadmin"
                        : editUser.plan === "free_forever" ? "🎁 Free forever"
                        : editUser.plan === "suspended" ? "Gesuspendeerd"
                        : editUser.plan === "pending_payment" ? `⏳ Kiest ${PLANS[editUser.chosen_plan]?.name || "?"} €${PLANS[editUser.chosen_plan]?.monthly?.toFixed(2).replace(".", ",") || "—"}/mnd`
                        : `${PLANS[editUser.plan]?.name || editUser.plan} €${PLANS[editUser.plan]?.monthly?.toFixed(2).replace(".", ",") || "—"}/mnd`}
                    </Badge>
                    <Badge color={editUser.email === SUPERADMIN_EMAIL ? "purple" : editUser.plan === "suspended" ? "red" : ["starter","growth","pro","free_forever"].includes(editUser.plan) ? "green" : "amber"}>
                      {editUser.email === SUPERADMIN_EMAIL ? "Superadmin" : editUser.plan === "suspended" ? "Gesuspendeerd" : ["starter","growth","pro"].includes(editUser.plan) ? "Actief" : "In afwachting"}
                    </Badge>
                    {editUser.pending_downgrade_plan === "cancelled" ? (
                      <Badge color="red">↓ Opgezegd</Badge>
                    ) : editUser.pending_downgrade_plan ? (
                      <Badge color="amber">↓ Downgrade → {PLANS[editUser.pending_downgrade_plan]?.name}</Badge>
                    ) : null}
                  </div>
                </div>

                {/* Billing cycle info */}
                {editUser.billing_cycle_start && (
                  <div style={{ padding: "8px 12px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: "var(--rd)", fontSize: 12, color: "var(--mx)", display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span>🔄 Cyclus gestart: <strong style={{ color: "var(--tx)" }}>{new Date(editUser.billing_cycle_start).toLocaleDateString("nl-NL")}</strong></span>
                    {editUser.chosen_plan && editUser.plan !== editUser.chosen_plan && (
                      <span>📦 Gekozen plan: <strong style={{ color: "var(--pr-h)" }}>{PLANS[editUser.chosen_plan]?.name || editUser.chosen_plan}</strong></span>
                    )}
                    {editUser.pending_downgrade_plan && (
                      <span>⏱ Downgrade gepland: <strong style={{ color: "var(--ac)" }}>{PLANS[editUser.pending_downgrade_plan]?.name}</strong></span>
                    )}
                  </div>
                )}

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
                {(() => {
                  const planLimits = PLANS[editUser.plan] || PLANS.growth;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ padding: "8px 12px", background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "var(--rd)", fontSize: 12, color: "var(--mx)" }}>
                        Plan <strong style={{ color: "var(--pr-h)" }}>{planLimits.name}</strong> — standaard limieten:
                        model <strong>{planLimits.gemini_model}</strong> · max <strong>{planLimits.img_max_kb} KB</strong> · kwaliteit <strong>{planLimits.img_quality}%</strong> · max breedte <strong>{planLimits.img_max_width}px</strong>
                      </div>
                      <div className="settings-2col">
                        <Field label="Gemini model" hint="Hogere modellen = meer Gemini kosten">
                          <Sel value={editUser.gemini_model || planLimits.gemini_model} onChange={e => setEditUser(u => ({ ...u, gemini_model: e.target.value }))} options={[
                            { value: "gemini-2.5-flash",       label: "Flash — gebalanceerd (Starter/Growth)" },
                            { value: "gemini-2.5-flash-image", label: "Flash Image — hoge kwaliteit (Pro)" },
                            { value: "gemini-2.5-pro",         label: "Pro — max kwaliteit (custom)" },
                          ]} />
                        </Field>
                        <Field label="Max bestandsgrootte" hint={`Plan max: ${planLimits.img_max_kb} KB`}>
                          <Inp value={editUser.img_max_kb ?? planLimits.img_max_kb} onChange={e => setEditUser(u => ({ ...u, img_max_kb: e.target.value }))} type="number" suffix="KB" />
                        </Field>
                        <Field label="Compressiekwaliteit" hint={`Plan max: ${planLimits.img_quality}%`}>
                          <Inp value={editUser.img_quality ?? planLimits.img_quality} onChange={e => setEditUser(u => ({ ...u, img_quality: e.target.value }))} type="number" suffix="%" />
                        </Field>
                        <Field label="Max breedte" hint={`Plan max: ${planLimits.img_max_width}px`}>
                          <Inp value={editUser.img_max_width ?? planLimits.img_max_width} onChange={e => setEditUser(u => ({ ...u, img_max_width: e.target.value }))} type="number" suffix="px" />
                        </Field>
                      </div>
                      <Btn variant="ghost" size="sm" style={{ alignSelf: "flex-start", fontSize: 11 }}
                        onClick={() => setEditUser(u => ({ ...u, gemini_model: planLimits.gemini_model, img_max_kb: planLimits.img_max_kb, img_quality: planLimits.img_quality, img_max_width: planLimits.img_max_width }))}>
                        ↺ Reset naar plan standaard
                      </Btn>
                    </div>
                  );
                })()}
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
                      <Sel value={editUser.ai_taxonomy_model ?? "gemini-2.5-flash"}
                        onChange={e => setEditUser(u => ({ ...u, ai_taxonomy_model: e.target.value }))}
                        options={[
                          { value: "gemini-2.5-flash", label: "Flash – gebalanceerd (aanbevolen)" },
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

                {/* Plan history */}
                <Divider />
                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--mx)", textTransform: "uppercase", letterSpacing: "0.04em" }}>📋 Plan geschiedenis</div>
                <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
                  {historyLoading ? (
                    <div style={{ fontSize: 13, color: "var(--dm)", display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 12, height: 12, border: "2px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                      Laden...
                    </div>
                  ) : historyError ? (
                    <div style={{ fontSize: 13, color: "var(--re)" }}>⚠ {historyError}</div>
                  ) : !planHistory || planHistory.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--dm)" }}>Geen plan-wijzigingen gevonden.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                      {planHistory.map((h, i) => (
                        <div key={h.id || i} style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingBottom: i < planHistory.length - 1 ? 10 : 0, marginBottom: i < planHistory.length - 1 ? 10 : 0, borderBottom: i < planHistory.length - 1 ? "1px solid var(--b1)" : "none" }}>
                          {/* Timeline dot */}
                          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 3 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: eventColor[h.event_type] === "green" ? "var(--gr)" : eventColor[h.event_type] === "red" ? "var(--re)" : eventColor[h.event_type] === "amber" ? "var(--ac)" : "var(--pr-h)" }} />
                            {i < planHistory.length - 1 && <div style={{ width: 1, background: "var(--b1)", flex: 1, minHeight: 20, marginTop: 4 }} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <Badge color={eventColor[h.event_type] || "blue"} size="sm">{eventLabel[h.event_type] || h.event_type}</Badge>
                              {h.from_plan && <span style={{ fontSize: 11, color: "var(--dm)" }}>{PLANS[h.from_plan]?.name || h.from_plan} →</span>}
                              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tx)" }}>{PLANS[h.to_plan]?.name || h.to_plan}</span>
                              {h.amount_paid > 0 && <span style={{ fontSize: 11, color: "var(--gr)", fontWeight: 600 }}>€{parseFloat(h.amount_paid).toFixed(2).replace(".", ",")}</span>}
                              {h.proration_days && <span style={{ fontSize: 10, color: "var(--dm)" }}>({h.proration_days}d pro-rata)</span>}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--dm)", marginTop: 3 }}>
                              {new Date(h.created_at).toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              {h.notes && <span style={{ marginLeft: 8, fontStyle: "italic" }}>{h.notes}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8 }}>
                  <Btn variant="secondary" onClick={() => setEditUser(null)}>Annuleren</Btn>
                  {editUser.pending_downgrade_plan === "cancelled" && (
                    <Btn variant="success" onClick={() => reactivateUser(editUser)}>✅ Heractiveer abonnement</Btn>
                  )}
                  <Btn variant="primary" onClick={() => saveUser(editUser)}>Opslaan</Btn>
                </div>
              </div>
            </Overlay>
          );
      })()}
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
      const session = { access_token: await getToken() };
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
                  const session = { access_token: await getToken() };
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
const PLAN_ORDER_BILLING = { starter: 1, growth: 2, pro: 3 };

const BillingTab = ({ userProfile }) => {
  const isFreeForever = userProfile?.plan === "free_forever";
  const isPendingPayment = userProfile?.plan === "pending_payment";
  const isTrialActive = userProfile?.plan === "trial";
  const isTrialExpired = userProfile?.plan === "trial_expired";
  // For billing display, trial maps to starter limits; trial_expired has no plan
  const planKey = userProfile?.plan && PLANS[userProfile.plan] && !["trial","trial_expired"].includes(userProfile.plan)
    ? userProfile.plan : null;
  const currentPlan = planKey ? PLANS[planKey] : null;
  const billingPeriod = userProfile?.billing_period || "monthly";

  // payments history
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [invoices, setInvoices] = useState({});

  // plan change UI
  const [changeOpen, setChangeOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedBilling, setSelectedBilling] = useState(billingPeriod);
  const [prorationInfo, setProrationInfo] = useState(null);
  const [prorationLoading, setProrationLoading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeError, setChangeError] = useState("");
  const [changeSuccess, setChangeSuccess] = useState("");

  // pending downgrade notice
  const hasPendingDowngrade = !!userProfile?.pending_downgrade_plan;

  useEffect(() => {
    if (isFreeForever || !userProfile?.id) return;
    supabase.from("invoices").select("id, invoice_number, payment_id, issued_at").eq("user_id", userProfile.id).order("issued_at", { ascending: false })
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(inv => {
          if (inv.payment_id) map[inv.payment_id] = inv;
          map[`inv_${inv.id}`] = inv;
        });
        map.__all = data || [];
        setInvoices(map);
      });
  }, [userProfile?.id]);

  useEffect(() => {
    if (isFreeForever || !userProfile?.id) return;
    const load = async () => {
      setPaymentsLoading(true);
      try {
        const session = { access_token: await getToken() };
        const res = await fetch("/api/mollie-payments", { headers: { "Authorization": `Bearer ${session?.access_token}` } });
        const data = await res.json();
        setPayments(data.payments || []);
      } catch {} finally { setPaymentsLoading(false); }
    };
    load();
  }, [userProfile?.id, isFreeForever]);

  // Load payment methods when change panel opens
  useEffect(() => {
    if (!changeOpen) return;
    fetch("/api/mollie-payments?type=methods")
      .then(r => r.json())
      .then(d => setPaymentMethods(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [changeOpen]);

  // Fetch proration when plan/billing selection changes
  useEffect(() => {
    if (!selectedPlan || !changeOpen) { setProrationInfo(null); setProrationLoading(false); return; }
    if (selectedPlan === planKey && selectedBilling === billingPeriod) { setProrationInfo(null); setProrationLoading(false); return; }
    let cancelled = false;
    const fetch_ = async () => {
      setProrationLoading(true);
      setProrationInfo(null);
      try {
        const session = { access_token: await getToken() };
        const res = await fetch(`/api/plan-change?plan=${selectedPlan}&billing_period=${selectedBilling}`, {
          headers: { "Authorization": `Bearer ${session?.access_token}` }
        });
        const data = await res.json();
        if (!cancelled) setProrationInfo(data);
      } catch (e) { if (!cancelled) setProrationInfo({ error: e.message }); }
      finally { if (!cancelled) setProrationLoading(false); }
    };
    fetch_();
    return () => { cancelled = true; setProrationLoading(false); };
  }, [selectedPlan, selectedBilling, changeOpen]);

  const handlePlanChange = async () => {
    if (!selectedPlan || changeLoading) return;
    setChangeLoading(true);
    setChangeError("");
    setChangeSuccess("");
    try {
      const session = { access_token: await getToken() };
      const isUpgrade = (PLAN_ORDER_BILLING[selectedPlan] || 0) > (PLAN_ORDER_BILLING[planKey] || 0);
      const res = await fetch("/api/plan-change", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          action: isUpgrade ? "upgrade" : "downgrade",
          new_plan: selectedPlan,
          billing_period: selectedBilling,
          payment_method: selectedMethod || undefined,
          return_url: "https://woosyncshop.com/#payment-return",
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Mislukt");
      if (data.checkout_url) {
        window.open(data.checkout_url, "_blank", "noopener,noreferrer");
      } else if (data.action === "downgrade_scheduled") {
        setChangeSuccess(`Je ${PLANS[selectedPlan]?.name} abonnement gaat in na afloop van de huidige betaalperiode. Je houdt toegang tot je huidige plan tot die tijd.`);
        setChangeOpen(false);
      }
    } catch (e) {
      setChangeError(e.message);
    } finally {
      setChangeLoading(false);
    }
  };

  const currentOrder = PLAN_ORDER_BILLING[planKey] || 0;
  const selectedOrder = PLAN_ORDER_BILLING[selectedPlan] || 0;
  const isUpgrade = selectedOrder > currentOrder;
  const isDowngrade = selectedOrder < currentOrder;
  const isSamePlan = selectedPlan === planKey && selectedBilling === billingPeriod;

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelDone, setCancelDone] = useState(null); // end_date string

  const handleCancelSubscription = async () => {
    setCancelLoading(true);
    setCancelError("");
    try {
      const session = { access_token: await getToken() };
      const res = await fetch("/api/cancel-subscription", {
        method: "POST",
        headers: { "Authorization": `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Mislukt");
      setCancelDone(data.end_date);
      setCancelModalOpen(false);
    } catch (e) {
      setCancelError(e.message);
    } finally {
      setCancelLoading(false);
    }
  };

  const [pmLoading, setPmLoading] = useState(false);
  const [pmError, setPmError] = useState("");
  const handleUpdatePaymentMethod = async () => {
    setPmLoading(true); setPmError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/update-payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Aanmaken mislukt");
      // Open in new tab — prevents session loss when Mollie redirects back
      window.open(data.checkout_url, "_blank", "noopener,noreferrer");
    } catch (e) { setPmError(e.message); }
    finally { setPmLoading(false); }
  };

  const isCancelledPending = userProfile?.pending_downgrade_plan === "cancelled";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Current plan card */}
      <div style={{ padding: 20, background: isFreeForever ? "linear-gradient(135deg,rgba(34,197,94,0.08),var(--s2))" : isTrialActive ? "linear-gradient(135deg,rgba(99,102,241,0.1),var(--s2))" : isTrialExpired ? "linear-gradient(135deg,rgba(239,68,68,0.07),var(--s2))" : "linear-gradient(135deg, var(--pr-l), var(--s2))", borderRadius: "var(--rd-lg)", border: isFreeForever ? "1px solid rgba(34,197,94,0.3)" : isTrialActive ? "1px solid rgba(99,102,241,0.3)" : isTrialExpired ? "1px solid rgba(239,68,68,0.3)" : "1px solid var(--b2)" }}>
        <div style={{ fontSize: 13, color: "var(--mx)", marginBottom: 4 }}>Huidig abonnement</div>
        {isFreeForever ? (
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-h)", color: "var(--gr)" }}>Gratis <span style={{ fontSize: 14, fontWeight: 400, color: "var(--mx)" }}>voor altijd</span></div>
        ) : isTrialActive ? (() => {
          const endsAt = userProfile?.trial_ends_at ? new Date(userProfile.trial_ends_at) : null;
          const daysLeft = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 86400000)) : 7;
          return (
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "var(--font-h)", color: "var(--pr-h)" }}>
                Starter <span style={{ fontSize: 14, fontWeight: 400, color: "var(--mx)", marginLeft: 8 }}>Proefperiode</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--mx)", marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span>⏳ Nog {daysLeft} dag{daysLeft !== 1 ? "en" : ""} gratis</span>
                {endsAt && <span>📅 Verloopt: {endsAt.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}</span>}
                <span>🏪 Tot 2 shops · 500 verbonden producten</span>
              </div>
            </div>
          );
        })() : isTrialExpired ? (
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "var(--font-h)", color: "var(--re)" }}>Proefperiode verlopen</div>
            <div style={{ fontSize: 12, color: "var(--mx)", marginTop: 4 }}>Kies een abonnement hieronder om door te gaan.</div>
          </div>
        ) : currentPlan ? (
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-h)", color: "var(--pr-h)" }}>
            {currentPlan.name}
            <span style={{ fontSize: 16, fontWeight: 400, color: "var(--mx)", marginLeft: 10 }}>€{getPlanPrice(planKey, billingPeriod).toFixed(2).replace(".", ",")} / maand</span>
          </div>
        ) : (
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-h)", color: "var(--pr-h)" }}>€{userProfile?.price_total || "19,99"} <span style={{ fontSize: 14, fontWeight: 400, color: "var(--mx)" }}>/ maand</span></div>
        )}
        {currentPlan && (
          <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12, color: "var(--mx)", flexWrap: "wrap" }}>
            <span>🏪 Tot {userProfile?.max_shops || currentPlan.sites} shops</span>
            <span>🔗 {(userProfile?.max_connected_products || currentPlan.connected_products).toLocaleString("nl-NL")} verbonden producten</span>
            <span>📅 {billingPeriod === "annual" ? "Jaarlijks (-10%)" : "Maandelijks"}</span>
            {userProfile?.billing_cycle_start && (
              <span>🔄 Cyclus gestart: {new Date(userProfile.billing_cycle_start).toLocaleDateString("nl-NL")}</span>
            )}
            {userProfile?.billing_cycle_start && ["starter","growth","pro"].includes(planKey) && (() => {
              const d = new Date(userProfile.billing_cycle_start);
              billingPeriod === "annual" ? d.setFullYear(d.getFullYear() + 1) : d.setMonth(d.getMonth() + 1);
              return <span>📅 Volgende betaling: {d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}</span>;
            })()}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {isFreeForever
            ? <Badge color="green">✓ Free forever account</Badge>
            : isTrialActive
              ? <Badge color="blue">🚀 Proefperiode actief · starter limieten</Badge>
              : isTrialExpired
                ? <Badge color="red">🔒 Proefperiode verlopen</Badge>
                : isPendingPayment
                  ? <Badge color="amber">⏳ Betaling in afwachting</Badge>
                  : currentPlan
                    ? <Badge color="blue">✓ {currentPlan.name} · actief via Mollie</Badge>
                    : <Badge color="amber">⚠ Onbekend plan</Badge>}
          {hasPendingDowngrade && (
            <Badge color="amber">↓ Downgrade naar {PLANS[userProfile.pending_downgrade_plan]?.name} gepland</Badge>
          )}
        </div>
      </div>

      {/* Pending downgrade notice */}
      {hasPendingDowngrade && (
        <div style={{ padding: 12, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "var(--rd)", fontSize: 13 }}>
          <strong style={{ color: "var(--ac)" }}>📅 Downgrade gepland:</strong> je abonnement wordt aan het einde van de huidige betaalperiode gewijzigd naar <strong>{PLANS[userProfile.pending_downgrade_plan]?.name}</strong>. Je houdt tot die tijd toegang tot je huidige plan.
        </div>
      )}

      {/* Success message */}
      {changeSuccess && (
        <div style={{ padding: 12, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "var(--rd)", fontSize: 13, color: "var(--gr)" }}>
          ✓ {changeSuccess}
        </div>
      )}

      {/* Plan wijzigen section — only for active paid plans */}
      {!isFreeForever && !isPendingPayment && currentPlan && (
        <div style={{ padding: 16, background: "var(--s2)", borderRadius: "var(--rd-lg)", border: "1px solid var(--b1)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: changeOpen ? 16 : 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>📦 Plan wijzigen</div>
            <Btn variant="ghost" size="sm" onClick={() => { setChangeOpen(v => !v); setSelectedPlan(null); setProrationInfo(null); setChangeError(""); }}>
              {changeOpen ? "Inklappen ▲" : "Wijzigen ▼"}
            </Btn>
          </div>

          {changeOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }} className="fade-in">
              {/* Plan tiles */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Pakket kiezen</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                  {PLAN_LIST.map(p => {
                    const isCurrent = p.id === planKey;
                    const isSelected = p.id === selectedPlan;
                    return (
                      <button key={p.id} onClick={() => setSelectedPlan(p.id)}
                        style={{ padding: "12px 8px", borderRadius: "var(--rd)", border: `2px solid ${isSelected ? "var(--pr)" : isCurrent ? "var(--b2)" : "var(--b1)"}`, background: isSelected ? "var(--pr-l)" : isCurrent ? "rgba(255,255,255,0.03)" : "transparent", cursor: "pointer", textAlign: "center", position: "relative" }}>
                        {isCurrent && <div style={{ position: "absolute", top: 4, right: 6, fontSize: 9, color: "var(--pr-h)", fontWeight: 700, textTransform: "uppercase" }}>huidig</div>}
                        <div style={{ fontWeight: 700, fontSize: 13, color: isSelected ? "var(--pr-h)" : "var(--tx)" }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: "var(--mx)", marginTop: 2 }}>€{(selectedBilling === "annual" ? p.annual_mo : p.monthly).toFixed(2).replace(".", ",")}/mo</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Billing period toggle */}
              <div style={{ display: "flex", gap: 8 }}>
                {["monthly", "annual"].map(bp => (
                  <button key={bp} onClick={() => setSelectedBilling(bp)}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: "var(--rd)", border: `2px solid ${selectedBilling === bp ? "var(--pr)" : "var(--b1)"}`, background: selectedBilling === bp ? "var(--pr-l)" : "transparent", cursor: "pointer", fontSize: 12, fontWeight: selectedBilling === bp ? 700 : 400, color: selectedBilling === bp ? "var(--pr-h)" : "var(--mx)" }}>
                    {bp === "monthly" ? "Maandelijks" : "Jaarlijks (10% korting)"}
                  </button>
                ))}
              </div>

              {/* Proration info */}
              {selectedPlan && !isSamePlan && (
                <div style={{ padding: 14, background: isUpgrade ? "rgba(99,102,241,0.06)" : "rgba(245,158,11,0.06)", borderRadius: "var(--rd)", border: `1px solid ${isUpgrade ? "rgba(99,102,241,0.2)" : "rgba(245,158,11,0.2)"}` }}>
                  {prorationLoading ? (
                    <div style={{ fontSize: 13, color: "var(--dm)", display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 12, height: 12, border: "2px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                      Berekenen...
                    </div>
                  ) : prorationInfo?.error ? (
                    <div style={{ fontSize: 13, color: "var(--re)" }}>⚠ {prorationInfo.error}</div>
                  ) : prorationInfo?.same ? (
                    <div style={{ fontSize: 13, color: "var(--mx)" }}>Dit is al je huidige plan en factureringsperiode.</div>
                  ) : prorationInfo?.action === "upgrade" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--pr-h)" }}>⬆ Upgrade naar {PLANS[selectedPlan]?.name}</div>
                      <div style={{ fontSize: 13, color: "var(--tx)" }}>
                        {prorationInfo.days
                          ? <>Je betaalt het verschil voor de resterende <strong>{prorationInfo.days} van {prorationInfo.daysInMonth} dagen</strong> van je huidige betaalperiode:</>
                          : <>Eerste betaling:</>}
                        <span style={{ marginLeft: 8, fontWeight: 800, fontSize: 15, color: "var(--pr-h)" }}>€{parseFloat(prorationInfo.amount).toFixed(2).replace(".", ",")}</span>
                      </div>
                      {prorationInfo.days && (
                        <div style={{ fontSize: 11, color: "var(--dm)" }}>
                          Dag {prorationInfo.daysElapsed} van {prorationInfo.daysInMonth} — dagprijs verschil: €{((parseFloat(prorationInfo.amount)) / prorationInfo.days).toFixed(4)} · Volgende volledige betaling {PLANS[selectedPlan]?.name}: €{getPlanPrice(selectedPlan, selectedBilling).toFixed(2).replace(".", ",")}
                        </div>
                      )}
                    </div>
                  ) : prorationInfo?.action === "downgrade" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ac)" }}>⬇ Downgrade naar {PLANS[selectedPlan]?.name}</div>
                      <div style={{ fontSize: 13, color: "var(--tx)" }}>{prorationInfo.message}</div>
                      <div style={{ fontSize: 11, color: "var(--dm)" }}>Er is geen restitutie voor de resterende dagen van de huidige betaalperiode. Je houdt toegang tot je huidige plan tot {prorationInfo.effectiveDate}.</div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Payment method — only for upgrades */}
              {selectedPlan && isUpgrade && !isSamePlan && !prorationLoading && prorationInfo && !prorationInfo.error && !prorationInfo.same && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Betaalmethode</div>
                  {paymentMethods.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {paymentMethods.map(m => (
                        <button key={m.id} onClick={() => setSelectedMethod(m.id)}
                          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: "var(--rd)", border: `2px solid ${selectedMethod === m.id ? "var(--pr)" : "var(--b1)"}`, background: selectedMethod === m.id ? "var(--pr-l)" : "var(--s3)", cursor: "pointer", fontSize: 12, fontWeight: selectedMethod === m.id ? 700 : 400, color: selectedMethod === m.id ? "var(--pr-h)" : "var(--tx)" }}>
                          {m.image?.size1x && <img src={m.image.size1x} alt={m.description} style={{ width: 24, height: 16, objectFit: "contain" }} />}
                          {m.description}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--dm)" }}>Betaalmethoden laden…</div>
                  )}
                </div>
              )}

              {changeError && <div style={{ fontSize: 13, color: "var(--re)" }}>⚠ {changeError}</div>}

              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="secondary" onClick={() => { setChangeOpen(false); setSelectedPlan(null); setProrationInfo(null); setChangeError(""); }}>Annuleren</Btn>
                <Btn variant="primary" disabled={!selectedPlan || isSamePlan || prorationLoading || changeLoading || (isUpgrade && !selectedMethod && paymentMethods.length > 0)}
                  onClick={handlePlanChange}>
                  {changeLoading ? "Verwerken…" : isUpgrade ? `⬆ Upgrade bevestigen — €${prorationInfo?.amount ? parseFloat(prorationInfo.amount).toFixed(2).replace(".", ",") : "…"}` : "⬇ Downgrade inplannen"}
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payment history */}
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
              <div key={p.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: i < payments.length - 1 ? "1px solid var(--b1)" : "none", flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--dm)" }}>{p.date}</span>
                <span style={{ fontSize: 12, color: "var(--mx)", flex: 1, marginLeft: 12, minWidth: 120 }}>{p.description}</span>
                <span style={{ fontWeight: 600, fontSize: 13, marginRight: 12 }}>{p.amount}</span>
                <Badge color={statusColor} size="sm">{statusLabel}</Badge>
                {p.status === "paid" && (
                  <button
                    onClick={async () => {
                      const session = { access_token: await getToken() };
                      const win = window.open("about:blank", "_blank");
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
      {/* Update payment method */}
      {!isFreeForever && !isPendingPayment && currentPlan && (
        <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Betaalmethode wijzigen</div>
          <div style={{ fontSize: 13, color: "var(--dm)", marginBottom: 10, lineHeight: 1.6 }}>
            Verlopen kaart of wil je overstappen op iDEAL, creditcard of een andere methode? Klik hieronder om een nieuwe betaalmethode in te stellen. Je betaalt hiervoor de reguliere maandprijs — je abonnement en cyclus blijven ongewijzigd.
          </div>
          {pmError && <div style={{ fontSize: 13, color: "var(--re)", marginBottom: 8 }}>⚠ {pmError}</div>}
          <Btn variant="secondary" size="sm" disabled={pmLoading} onClick={handleUpdatePaymentMethod}>
            {pmLoading ? "Doorsturen…" : "💳 Betaalmethode wijzigen"}
          </Btn>
        </div>
      )}

      {/* Cancel subscription section */}
      {!isFreeForever && !isPendingPayment && currentPlan && (
        <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Abonnement opzeggen</div>
          {isCancelledPending ? (
            <div style={{ fontSize: 13, color: "var(--ac)" }}>
              ✓ Je abonnement is opgezegd. Je houdt toegang tot het einde van je huidige betaalperiode.
            </div>
          ) : cancelDone ? (
            <div style={{ fontSize: 13, color: "var(--gr)" }}>
              ✓ Opzegging geregistreerd. Je houdt toegang tot en met {new Date(cancelDone).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "var(--dm)", marginBottom: 10, lineHeight: 1.6 }}>
                Na opzegging houd je toegang tot het einde van je huidige betaalperiode. Automatische verlenging stopt direct.
              </div>
              <Btn variant="danger" size="sm" onClick={() => { setCancelModalOpen(true); setCancelError(""); }}>Abonnement opzeggen</Btn>
            </>
          )}
        </div>
      )}

      {/* Cancel confirmation modal */}
      {cancelModalOpen && (
        <Overlay open onClose={() => setCancelModalOpen(false)} width={440} title="Abonnement opzeggen">
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--mx)" }}>
              Weet je zeker dat je je <strong style={{ color: "var(--tx)" }}>{currentPlan?.name}</strong> abonnement wilt opzeggen?
            </div>
            <div style={{ padding: 14, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "var(--rd)", fontSize: 13, color: "var(--mx)", lineHeight: 1.6 }}>
              ⚠ Je houdt toegang tot WooSyncShop tot het einde van je huidige betaalperiode. Daarna wordt je account opgeschort.
            </div>
            {cancelError && <div style={{ fontSize: 13, color: "var(--re)" }}>⚠ {cancelError}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setCancelModalOpen(false)}>Annuleren</Btn>
              <Btn variant="danger" disabled={cancelLoading} onClick={handleCancelSubscription}>
                {cancelLoading ? "Verwerken…" : "Ja, opzeggen"}
              </Btn>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
};

const SettingsView = ({ user, shops = [], onShopAdded, onShopUpdated, onShopDeleted, profileRefreshKey = 0 }) => {
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
  const [newlyAddedToken, setNewlyAddedToken] = useState(null); // show token after shop creation
  const [pluginWizardShop, setPluginWizardShop] = useState(null); // shop waiting for plugin wizard
  const [expandedShop, setExpandedShop] = useState(null);
  const [shopGoogle, setShopGoogle] = useState({});

  const fetchShopGoogleData = async (shopId) => {
    setShopGoogle(s => ({ ...s, [shopId]: { ...(s[shopId] || {}), loading: true, error: null } }));
    try {
      const token = await getToken();
      const res = await fetch(`/api/shop-google-data?shop_id=${shopId}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Ophalen mislukt");
      setShopGoogle(s => ({ ...s, [shopId]: { ...d, loading: false, error: null } }));
    } catch (e) {
      setShopGoogle(s => ({ ...s, [shopId]: { ...(s[shopId] || {}), loading: false, error: e.message } }));
    }
  };

  const saveShopGoogleProperty = async (shopId, field, value) => {
    try {
      const token = await getToken();
      await fetch("/api/shop-google-save", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ shop_id: shopId, [field]: value }),
      });
      setShopGoogle(s => ({ ...s, [shopId]: { ...(s[shopId] || {}), [field]: value } }));
      const updatedShop = shops.find(sh => sh.id === shopId);
      if (updatedShop) onShopUpdated?.({ ...updatedShop, [field]: value });
    } catch (e) { alert(e.message); }
  };

  const disconnectShopGoogle = async (shopId, service) => {
    const label = service === "ads" ? "Ads" : service === "ga4" ? "Analytics 4" : "Search Console";
    if (!confirm("Google " + label + " ontkoppelen van deze shop?")) return;
    try {
      const token = await getToken();
      await fetch("/api/shop-google-disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ shop_id: shopId, service }),
      });
      const fieldMap = { ads: "google_ads_connected", ga4: "ga4_connected", sc: "sc_connected" };
      setShopGoogle(s => ({ ...s, [shopId]: { ...(s[shopId] || {}), [fieldMap[service]]: false } }));
      const updatedShop = shops.find(sh => sh.id === shopId);
      if (updatedShop) onShopUpdated?.({ ...updatedShop, [fieldMap[service]]: false });
    } catch (e) { alert(e.message); }
  };

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
          // Notify App if payment not completed — but NOT during a Mollie payment return
          // (the verify() effect in App handles the paywall state there)
          const isPaymentReturn = window.location.hash.startsWith("#payment-return");
          if (data.plan === "pending_payment" && onPaymentWall && !isPaymentReturn) {
            onPaymentWall(true, { chosenPlan: data.chosen_plan || "growth", billingPeriod: data.billing_period || "monthly", country: data.country || "NL", vatValidated: data.vat_validated || false });
          }
        }
      });
  }, [user?.id, profileRefreshKey]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get("google_oauth");
    const shopId = params.get("shop_id");
    if (oauthResult === "success" && shopId) {
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
      setExpandedShop(shopId);
      setSettingsTab("sites");
      fetchShopGoogleData(shopId);
    } else if (oauthResult === "error" && shopId) {
      const reason = params.get("reason") || "Onbekende fout";
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
      setShopGoogle(s => ({ ...s, [shopId]: { ...(s[shopId] || {}), error: "Koppeling mislukt: " + reason } }));
      setExpandedShop(shopId);
      setSettingsTab("sites");
    }
    shops.forEach(sh => {
      if (sh.google_ads_connected || sh.ga4_connected || sh.sc_connected) {
        fetchShopGoogleData(sh.id);
      }
    });
  }, []);

  const testConnection = async (shop) => {
    setTestingShop(shop.id);
    try {
      const token = await getToken();
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
    if (!newShop.name || !newShop.site_url) return alert("Vul naam en site URL in");
    if (newShop.connectMode !== "plugin" && (!newShop.consumer_key || !newShop.consumer_secret)) return alert("Vul Consumer Key en Consumer Secret in");
    setSavingShop(true);
    try {
      const apiToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, "0")).join("");
      const { connectMode, flagShape, ...shopData } = newShop;
      const safeData = {
        name: String(shopData.name || ""),
        site_url: String(shopData.site_url || ""),
        locale: String(shopData.locale || "nl_NL"),
        flag: String(shopData.flag || "🌐"),
        consumer_key: String(shopData.consumer_key || ""),
        consumer_secret: String(shopData.consumer_secret || ""),
        user_id: user.id,
        api_token: apiToken,
      };
      const { error: insertError } = await supabase.from("shops").insert([safeData]);
      if (insertError) throw insertError;
      const { data: inserted, error: fetchError } = await supabase
        .from("shops").select("*").eq("api_token", apiToken).eq("user_id", user.id).single();
      if (fetchError) throw fetchError;
      onShopAdded?.(inserted);
      setNewShop({ name: "", site_url: "", locale: "nl_NL", flag: "🌐", consumer_key: "", consumer_secret: "" });
      if (inserted.api_token) setNewlyAddedToken(inserted.api_token);
      setAddShopOpen(false);
      setPluginWizardShop(inserted);
    } catch (e) {
      console.error("handleAddShop error:", e);
      alert("Shop toevoegen mislukt: " + e.message);
    }
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
      // Password change via backend (admin API) — avoids OTP confirmation and session disruption
      if (profileForm.password) {
        const session = { access_token: await getToken() };
        const res = await fetch("/api/update-password", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
          body: JSON.stringify({ password: profileForm.password }),
        });
        const result = await res.json();
        if (!res.ok || result.error) throw new Error(result.error || "Wachtwoord wijzigen mislukt");
        setProfileForm(f => ({ ...f, password: "" })); // clear field on success
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
        {pluginWizardShop && (
        <PluginWizardModal
          shop={pluginWizardShop}
          onSave={(updatedShop) => {
            onShopUpdated?.(updatedShop);
            setPluginWizardShop(null);
          }}
          onSkip={() => setPluginWizardShop(null)}
        />
      )}

      {settingsTab === "sites" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {newlyAddedToken && (
              <div style={{ padding: 16, background: "rgba(34,197,94,0.08)", border: "1px solid var(--gr)", borderRadius: "var(--rd-lg)" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--gr)", marginBottom: 10 }}>✅ Shop toegevoegd! Kopieer je plugin token en plak het in de companion plugin.</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Inp value={newlyAddedToken} onChange={() => {}} readOnly style={{ fontFamily: "monospace", fontSize: 12, flex: 1 }} />
                  <Btn variant="primary" size="sm" onClick={() => { navigator.clipboard.writeText(newlyAddedToken); }}>📋 Kopiëren</Btn>
                </div>
                <div style={{ fontSize: 11, color: "var(--mx)", marginTop: 8 }}>
                  Ga naar je WordPress site → <strong style={{ color: "var(--tx)" }}>WooSyncShop Companion → Verbinding instellen</strong> en plak dit token. De plugin verbindt automatisch.
                </div>
                <Btn variant="ghost" size="sm" style={{ marginTop: 8 }} onClick={() => setNewlyAddedToken(null)}>Sluiten</Btn>
              </div>
            )}
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
                    <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{shop.flag || "🌐"}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{shop.name}</div>
                      <div style={{ fontSize: 11, color: "var(--dm)" }}>{shop.locale} · {shop.site_url?.replace("https://","").replace("http://","")}</div>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                      {shop.last_connected && <Badge color="green">✓ Verbonden</Badge>}
                      {shop.has_wqm && <Badge color="blue">WQM</Badge>}
                      {Array.isArray(shop.active_plugins) && shop.active_plugins.map(pid => {
                        const plug = KNOWN_PLUGINS.find(p => p.id === pid);
                        return plug ? <Badge key={pid} color="purple">{plug.icon} {plug.name.split(" ")[0]}</Badge> : null;
                      })}
                      <Btn variant="ghost" size="sm" title="Plugins bewerken" onClick={() => setPluginWizardShop(shop)}>🔌</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => handleDeleteShop(shop.id)}>🗑</Btn>
                    </div>
                  </div>
                  <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Field label="Site URL"><Inp value={shop.site_url || ""} onChange={() => {}} readOnly /></Field>
                    <Field label="Taal / Locale"><Inp value={shop.locale || ""} onChange={() => {}} readOnly /></Field>
                    {shop.plugin_connected && (
                      <div style={{ gridColumn: "1/-1" }}>
                        <Badge color="green">{"🔌 Verbonden via companion plugin" + (shop.plugin_connected_at ? " · " + new Date(shop.plugin_connected_at).toLocaleDateString("nl-NL") : "")}</Badge>
                      </div>
                    )}
                    {!shop.plugin_connected && (
                      <Field label="Consumer Key"><Inp value="ck_••••••••••••••••" onChange={() => {}} type="password" readOnly /></Field>
                    )}
                    {!shop.plugin_connected && (
                      <Field label="Consumer Secret"><Inp value="cs_••••••••••••••••" onChange={() => {}} type="password" readOnly /></Field>
                    )}
                    <div style={{ gridColumn: "1/-1" }}>
                      <Field label="🔑 Companion Plugin Token">
                        {shop.api_token ? (
                          <div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <Inp value={shop.api_token} onChange={() => {}} readOnly style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.03em", flex: 1 }} />
                              <Btn variant="secondary" size="sm" onClick={() => navigator.clipboard.writeText(shop.api_token)}>Kopiëren</Btn>
                            </div>
                            <div style={{ fontSize: 11, color: "var(--mx)", marginTop: 4 }}>Plak dit token in de WooSyncShop Companion plugin op jouw WordPress site onder <em>Instellingen → Verbinding instellen</em>.</div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 12, color: "var(--mx)" }}>Nog geen token gegenereerd.</span>
                            <Btn variant="secondary" size="sm" onClick={async () => {
                              const token = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2,"0")).join("");
                              await supabase.from("shops").update({ api_token: token }).eq("id", shop.id);
                              onShopAdded?.({ ...shop, api_token: token }); // trigger refresh
                            }}>Token genereren</Btn>
                          </div>
                        )}
                      </Field>
                    </div>
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

                  {/* ── Google Services per shop ── */}
                  <div style={{ borderTop: "1px solid var(--b1)" }}>
                    <button
                      onClick={() => {
                        const next = expandedShop === shop.id ? null : shop.id;
                        setExpandedShop(next);
                        if (next && !shopGoogle[shop.id]) fetchShopGoogleData(shop.id);
                      }}
                      style={{ width: "100%", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: "var(--mx)", fontSize: 12 }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" style={{flexShrink:0}}><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                      <span style={{ fontWeight: 600 }}>Google Services</span>
                      {(shop.google_ads_connected || shopGoogle[shop.id]?.ads_connected) && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "rgba(34,197,94,0.12)", color: "#22c55e", fontWeight: 700 }}>Ads</span>}
                      {(shop.ga4_connected || shopGoogle[shop.id]?.ga4_connected) && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "rgba(99,102,241,0.12)", color: "var(--pr-h)", fontWeight: 700 }}>GA4</span>}
                      {(shop.sc_connected || shopGoogle[shop.id]?.sc_connected) && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "rgba(96,165,250,0.12)", color: "#60A5FA", fontWeight: 700 }}>SC</span>}
                      <span style={{ marginLeft: "auto", fontSize: 11 }}>{expandedShop === shop.id ? "▲" : "▼"}</span>
                    </button>

                    {expandedShop === shop.id && (() => {
                      const sg = shopGoogle[shop.id] || {};
                      const adsOk = sg.ads_connected  || shop.google_ads_connected;
                      const ga4Ok = sg.ga4_connected  || shop.ga4_connected;
                      const scOk  = sg.sc_connected   || shop.sc_connected;

                      const ServiceCard = ({ id, icon, title, description, connected, oauthParam, accountLabel, accountValue, accountOptions, accountField }) => (
                        <div style={{ border: "1.5px solid " + (connected ? "rgba(34,197,94,0.3)" : "var(--b1)"), borderRadius: "var(--rd-lg)", overflow: "hidden", background: connected ? "rgba(34,197,94,0.03)" : "var(--bg)" }}>
                          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ fontSize: 16 }}>{icon}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 12 }}>{title}</div>
                              <div style={{ fontSize: 10, color: connected ? "#22c55e" : "var(--dm)", fontWeight: 600 }}>{connected ? "● Gekoppeld" : "Niet gekoppeld"}</div>
                            </div>
                            {connected && (
                              <button onClick={() => disconnectShopGoogle(shop.id, id)} style={{ fontSize: 10, color: "var(--re)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 4 }}>Ontkoppelen</button>
                            )}
                          </div>
                          <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--mx)", lineHeight: 1.5 }}>{description}</div>
                          <div style={{ padding: "0 12px 10px" }}>
                            {connected ? (
                              accountOptions && accountOptions.length > 0 ? (
                                <div>
                                  <div style={{ fontSize: 11, color: "var(--mx)", marginBottom: 4, fontWeight: 600 }}>{accountLabel}</div>
                                  <select
                                    value={accountValue || ""}
                                    onChange={e => saveShopGoogleProperty(shop.id, accountField, e.target.value)}
                                    style={{ width: "100%", padding: "5px 8px", background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: "var(--rd)", color: "var(--tx)", fontSize: 12 }}
                                  >
                                    <option value="">{"— Selecteer " + accountLabel + " —"}</option>
                                    {accountOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                                  </select>
                                  {accountValue && <div style={{ marginTop: 4, fontSize: 10, color: "#22c55e" }}>{"\u2713 " + (accountOptions.find(o => o.id === accountValue)?.label || accountValue)}</div>}
                                </div>
                              ) : (
                                <div style={{ fontSize: 11, color: "var(--mx)" }}>
                                  {sg.loading ? "Accounts ophalen..." : "Klik Vernieuwen om beschikbare accounts op te halen"}
                                  <button onClick={() => fetchShopGoogleData(shop.id)} style={{ marginLeft: 8, fontSize: 11, color: "var(--pr-h)", background: "none", border: "none", cursor: "pointer" }}>↻ Vernieuwen</button>
                                </div>
                              )
                            ) : (
                              <a href={"/api/google-oauth-init?service=" + oauthParam + "&shop_id=" + shop.id} style={{ textDecoration: "none", display: "block" }}>
                                <button style={{ width: "100%", padding: "6px 0", borderRadius: "var(--rd)", border: "1px solid var(--pr)", background: "var(--pr)", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 11 }}>
                                  Koppelen →
                                </button>
                              </a>
                            )}
                          </div>
                        </div>
                      );

                      return (
                        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10, background: "var(--s3)" }}>
                          {sg.error && <div style={{ padding: "6px 10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--rd)", fontSize: 11, color: "var(--re)" }}>⚠ {sg.error}</div>}
                          {sg.loading && <div style={{ fontSize: 12, color: "var(--mx)", padding: "4px 0" }}>↻ Google data ophalen...</div>}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                            <ServiceCard id="ads" icon="🎯" title="Google Ads" oauthParam="ads"
                              description="Campagne ROAS, spend en conversiedata per bestelling."
                              connected={adsOk}
                              accountLabel="Ads account"
                              accountValue={sg.ads_account_id || shop.google_ads_account_id}
                              accountOptions={sg.ads_accounts || []}
                              accountField="google_ads_account_id"
                            />
                            <ServiceCard id="ga4" icon="📈" title="Google Analytics 4" oauthParam="ga4"
                              description="Sessies, conversiepaden en klant LTV per kanaal."
                              connected={ga4Ok}
                              accountLabel="GA4 property"
                              accountValue={sg.ga4_property_id || shop.ga4_property_id}
                              accountOptions={sg.ga4_properties || []}
                              accountField="ga4_property_id"
                            />
                            <ServiceCard id="sc" icon="🔍" title="Search Console" oauthParam="sc"
                              description="Zoekwoorden, impressies en CTR per landingspagina."
                              connected={scOk}
                              accountLabel="SC site"
                              accountValue={sg.sc_site || shop.sc_site}
                              accountOptions={sg.sc_sites || []}
                              accountField="sc_site"
                            />
                          </div>
                          <div style={{ fontSize: 11, color: "var(--dm)", lineHeight: 1.5 }}>
                            💡 Na het koppelen kies je welk account bij <strong style={{ color: "var(--mx)" }}>{shop.name}</strong> hoort.
                          </div>
                        </div>
                      );
                    })()}
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
                  <Field label="Site URL" required><Inp value={newShop.site_url} onChange={e => setNewShop(s => ({ ...s, site_url: e.target.value }))} onBlur={e => setNewShop(s => ({ ...s, site_url: e.target.value.replace(/\/$/, "") }))} placeholder="https://mijnshop.nl" /></Field>
                  <Field label="Taal / Locale" required>
                    <Sel value={newShop.locale} onChange={e => {
                      const v = e.target.value;
                      const autoFlag = LOCALE_FLAG_MAP[v] || "🌐";
                      setNewShop(s => ({ ...s, locale: v, flag: autoFlag, flagShape: s.flagShape || "emoji" }));
                    }} options={LOCALE_OPTIONS} />
                  </Field>
                  <Field label="Vlag">
                    {(() => {
                      const flagToCode = (emoji) => {
                        if (!emoji || emoji === "🌐") return null;
                        try {
                          const pts = [...emoji].map(c => c.codePointAt(0) - 0x1F1E6);
                          if (pts.length === 2 && pts[0] >= 0 && pts[1] >= 0)
                            return (String.fromCharCode(65 + pts[0]) + String.fromCharCode(65 + pts[1])).toLowerCase();
                        } catch {}
                        return null;
                      };
                      const allFlags = [...new Set(Object.values(LOCALE_FLAG_MAP))];
                      const selectedFlag = newShop.flag || LOCALE_FLAG_MAP[newShop.locale] || "🌐";
                      const selectedCode = flagToCode(selectedFlag);
                      return (
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                          {/* Preview */}
                          <div style={{ width: 52, height: 36, borderRadius: 5, overflow: "hidden", border: "2px solid var(--pr)", flexShrink: 0, background: "var(--s3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {selectedCode
                              ? <img src={`https://flagcdn.com/w80/${selectedCode}.png`} alt={selectedCode.toUpperCase()} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : <span style={{ fontSize: 24 }}>🌐</span>
                            }
                          </div>
                          {/* Flag grid */}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {allFlags.map(f => {
                              const code = flagToCode(f);
                              const isSelected = selectedFlag === f;
                              return code ? (
                                <button key={f} onClick={() => setNewShop(s => ({ ...s, flag: f }))}
                                  title={code.toUpperCase()}
                                  style={{ width: 34, height: 24, padding: 0, borderRadius: 3, border: `2px solid ${isSelected ? "var(--pr)" : "var(--b1)"}`, overflow: "hidden", cursor: "pointer", background: "transparent", flexShrink: 0, transition: "border-color 0.1s" }}>
                                  <img src={`https://flagcdn.com/w40/${code}.png`} alt={code.toUpperCase()} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                                </button>
                              ) : null;
                            })}
                            <button onClick={() => setNewShop(s => ({ ...s, flag: "🌐" }))}
                              title="Globaal"
                              style={{ width: 34, height: 24, borderRadius: 3, border: `2px solid ${selectedFlag === "🌐" ? "var(--pr)" : "var(--b1)"}`, cursor: "pointer", background: "var(--s3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                              🌐
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                    <div style={{ fontSize: 11, color: "var(--mx)", marginTop: 6 }}>Automatisch ingesteld op basis van taal. Klik om te wijzigen.</div>
                  </Field>
                </div>

                {/* Connection mode toggle */}
                <div style={{ margin: "14px 0", display: "flex", gap: 0, border: "1px solid var(--b1)", borderRadius: "var(--rd)", overflow: "hidden", width: "fit-content" }}>
                  {[
                    { id: "manual", label: "🔑 Handmatig (CK/CS)" },
                    { id: "plugin", label: "🔌 Via companion plugin" },
                  ].map(m => (
                    <button key={m.id} onClick={() => setNewShop(s => ({ ...s, connectMode: m.id }))}
                      style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                        background: (newShop.connectMode || "manual") === m.id ? "var(--pr)" : "var(--s2)",
                        color: (newShop.connectMode || "manual") === m.id ? "#fff" : "var(--mx)" }}>
                      {m.label}
                    </button>
                  ))}
                </div>

                {(newShop.connectMode || "manual") === "manual" ? (
                  <div className="settings-2col" style={{ marginBottom: 14 }}>
                    <Field label="Consumer Key" required><Inp value={newShop.consumer_key} onChange={e => setNewShop(s => ({ ...s, consumer_key: e.target.value }))} placeholder="ck_..." type="password" /></Field>
                    <Field label="Consumer Secret" required><Inp value={newShop.consumer_secret} onChange={e => setNewShop(s => ({ ...s, consumer_secret: e.target.value }))} placeholder="cs_..." type="password" /></Field>
                  </div>
                ) : (
                  <div style={{ padding: 12, background: "var(--s3)", borderRadius: "var(--rd)", fontSize: 12, color: "var(--mx)", marginBottom: 14, lineHeight: 1.6 }}>
                    📋 Sla de shop op → je krijgt een <strong style={{ color: "var(--tx)" }}>plugin token</strong>.<br />
                    Plak dit token in de WooSyncShop Companion plugin op je WordPress site.<br />
                    De plugin regelt de rest automatisch.
                  </div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="primary" onClick={handleAddShop} disabled={savingShop}>{savingShop ? "Opslaan..." : "Shop opslaan"}</Btn>
                  <Btn variant="ghost" onClick={() => setAddShopOpen(false)}>Annuleren</Btn>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Btn variant="primary" icon="+" onClick={() => { setNewlyAddedToken(null); setAddShopOpen(true); }}>Shop toevoegen</Btn>
              </div>
            )}
          </div>
        )}
        {settingsTab === "ai" && (
          <AiTranslationSettings
            enabled={aiEnabled}
            onToggleEnabled={async (val) => {
              // Only allow turning OFF (superadmin controls turning ON via admin panel)
              if (val && !aiTaxonomyUnlocked) return; // can't turn on if not unlocked
              setAiEnabled(val);
              try {
                await supabase.from("user_profiles").update({ ai_taxonomy_enabled: val }).eq("id", user.id);
              } catch (e) { console.error("Save ai_taxonomy_enabled failed:", e); }
            }}
            locked={!aiTaxonomyUnlocked}
          />
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

            {/* Image pipeline config (read-only, set by admin) */}
            {userProfile && (() => {
              const planLimits = PLANS[userProfile.plan] || PLANS.growth;
              const model     = userProfile.gemini_model   || planLimits.gemini_model;
              const maxKb     = userProfile.img_max_kb     ?? planLimits.img_max_kb;
              const quality   = userProfile.img_quality    ?? planLimits.img_quality;
              const maxWidth  = userProfile.img_max_width  ?? planLimits.img_max_width;
              const modelLabel = {
                "gemini-2.5-flash":       "Flash",
                "gemini-2.5-flash-image": "Flash Image",
                "gemini-2.5-pro":         "Pro",
              }[model] || model;
              return (
                <div style={{ marginTop: 8, padding: 16, background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    🖼️ Image pipeline configuratie
                    <span style={{ fontSize: 11, fontWeight: 400, color: "var(--dm)" }}>— ingesteld door beheerder</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
                    {[
                      { label: "Gemini model", value: modelLabel },
                      { label: "Max bestandsgrootte", value: `${maxKb} KB` },
                      { label: "Compressiekwaliteit", value: `${quality}%` },
                      { label: "Max breedte", value: `${maxWidth}px` },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ padding: "10px 12px", background: "var(--s3)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
                        <div style={{ fontSize: 10, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--pr-h)" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
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
const TopNav = ({ activeSite, setActiveSite, sites, activeView, setActiveView, pendingCount, onSync, onPush, isAdmin, onLogout, user, onGoToSettings, onHowItWorks }) => {
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [noShopModal, setNoShopModal] = useState(null); // "sync"|"push"|null

  // Close all dropdowns when user alt-tabs away and returns.
  // avatarOpen creates a fixed inset:0 invisible backdrop — if left open on alt-tab,
  // it silently blocks all clicks when the user comes back (no console errors).
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) { setAvatarOpen(false); setSiteOpen(false); }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);
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

  const tabDefs = [["products", "📦", "Producten"], ["connected", "🔗", "Verbonden"], ["voorraad", "🔄", "Voorraad Sync"], ["hreflang", "🌐", "Hreflang"], ["marketing", "📣", "Marketing"], ["analytics", "📊", "Analytics"], ["settings", "⚙", "Instellingen"], ...(isAdmin ? [["admin", "🛡", "Admin"]] : [])];

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
          <Btn variant="ghost" size="sm" onClick={onHowItWorks} title="Hoe werkt het?" style={{ gap: 4 }}>
            <span>💡</span><span className="topnav-sync-label">Help</span>
          </Btn>
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

// ─── AnalyticsView ────────────────────────────────────────────────────────────
function AnalyticsView({ shops, user, analyticsCache, onAnalyticsCacheUpdate }) {
  const [selectedShopForConnections, setSelectedShopForConnections] = useState("all");

  const googleConnections = useMemo(() => {
    if (selectedShopForConnections === "all") {
      return {
        ads: (shops || []).some(s => s.google_ads_connected),
        ga4: (shops || []).some(s => s.ga4_connected),
        sc:  (shops || []).some(s => s.sc_connected),
      };
    }
    const shop = (shops || []).find(s => s.id === selectedShopForConnections);
    return {
      ads: !!shop?.google_ads_connected,
      ga4: !!shop?.ga4_connected,
      sc:  !!shop?.sc_connected,
    };
  }, [selectedShopForConnections, shops]);
  const RANGES = [
    { key: "7d",   label: "7 dagen" },
    { key: "30d",  label: "30 dagen" },
    { key: "90d",  label: "90 dagen" },
    { key: "year", label: "Dit jaar" },
  ];

  const SOURCE_GROUPS = {
    organic:  { label: "Organisch",      color: "#34D399", icon: "🌿" },
    paid:     { label: "Betaald",         color: "#6E6EF7", icon: "📢" },
    direct:   { label: "Direct",          color: "#60A5FA", icon: "🔗" },
    referral: { label: "Doorverwijzing",  color: "#F59E0B", icon: "↗️" },
    ai:       { label: "AI zoekmachines", color: "#F472B6", icon: "🤖" },
    email:    { label: "E-mail",          color: "#A78BFA", icon: "📧" },
    admin:    { label: "Intern / Admin",  color: "#CBD5E1", icon: "🖥️" },
    other:    { label: "Overig",          color: "#94A3B8", icon: "❓" },
  };

  const SHOP_COLORS = ["#6E6EF7", "#34D399", "#60A5FA", "#F59E0B", "#F472B6", "#A78BFA"];

  const [selectedShop, setSelectedShop]       = useState("all");

  const selectShop = (id) => {
    setSelectedShop(id);
    setSelectedShopForConnections(id);
  };
  const [range, setRange]                     = useState("30d");
  const [excludeCancelled, setExcludeCancelled] = useState(false);
  const [excludeRefunded,  setExcludeRefunded]  = useState(false);
  const [activeMetric, setActiveMetric]       = useState("revenue");
  const [activeSourceTab, setActiveSourceTab] = useState("overview");
  const [loading, setLoading]                 = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsUnavailable, setInsightsUnavailable] = useState(false);
  const [error, setError]                     = useState(null);
  const [data, setData]                       = useState(null);
  const [insights, setInsights]               = useState(null);
  const [selectedSourceGroup, setSelectedSourceGroup] = useState(null);

  // ── Search Console state ─────────────────────────────────────────────────
  const [scData,    setScData]    = useState(null);
  const [scLoading, setScLoading] = useState(false);
  const [scError,   setScError]   = useState(null);
  const [scShopId,  setScShopId]  = useState(null); // which shop's SC data is loaded

  const fmt = (n) => "€" + (n || 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtShort = (n) => n >= 1000 ? "€" + (n / 1000).toFixed(1) + "k" : fmt(n);

  // Cache key — same params = same data, no re-fetch needed
  const cacheKey = `${range}|${selectedShop}|${excludeCancelled ? 1 : 0}|${excludeRefunded ? 1 : 0}`;

  const fetchData = useCallback(async (force = false) => {
    // Restore from cache immediately if params match
    if (!force && analyticsCache && analyticsCache.key === cacheKey) {
      setData(analyticsCache.data);
      if (analyticsCache.insights) setInsights(analyticsCache.insights);
      return;
    }
    setLoading(true);
    setError(null);
    setInsights(null);
    setInsightsUnavailable(false);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ range });
      if (selectedShop !== "all") params.set("shop_id", selectedShop);
      if (excludeCancelled) params.set("exclude_cancelled", "1");
      if (excludeRefunded)  params.set("exclude_refunded", "1");
      const res = await fetch(`/api/analytics-orders?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      let json;
      try { json = await res.json(); }
      catch { throw new Error(`Server timeout of netwerkfout (HTTP ${res.status}). Probeer een kortere periode.`); }
      if (!res.ok) throw new Error(json?.error || `Fout bij ophalen data (HTTP ${res.status})`);
      setData(json);
      onAnalyticsCacheUpdate?.({ key: cacheKey, data: json, insights: null, loadedAt: Date.now() });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [range, selectedShop, excludeCancelled, excludeRefunded, cacheKey]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchInsights = useCallback(async (force = false) => {
    if (!data) return;
    // Don't fetch if no orders at all
    if (!data.merged?.totalOrders && !data.merged?.orders) return;
    // Use cached insights if available for same params
    if (!force && analyticsCache?.key === cacheKey && analyticsCache?.insights) {
      setInsights(analyticsCache.insights);
      return;
    }
    setInsightsLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/analytics-insights", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ merged: data.merged, shops: data.shops, range }),
      });
      let json;
      try { json = await res.json(); }
      catch { throw new Error("Insights server timeout"); }
      if (!res.ok) throw new Error(json?.error || `Insights fout (HTTP ${res.status})`);
      setInsights(json.insights);
      onAnalyticsCacheUpdate?.(prev => prev ? { ...prev, insights: json.insights } : null);
    } catch (e) {
      console.error("Insights error:", e);
      if (e.message?.includes("not valid") || e.message?.includes("API_KEY_INVALID") || e.message?.includes("niet geconfigureerd")) {
        setInsightsUnavailable(true);
      }
    } finally {
      setInsightsLoading(false);
    }
  }, [data, range, cacheKey]);

  useEffect(() => { if (data && !insights && !insightsUnavailable) fetchInsights(); }, [data]);

  // ── Search Console fetch ─────────────────────────────────────────────────
  const fetchScData = useCallback(async (shopId, forceRange) => {
    const effectiveRange = forceRange || range;
    // Find first SC-connected shop if "all" is selected
    const targetShopId = shopId && shopId !== "all"
      ? shopId
      : (shops || []).find(s => s.sc_connected)?.id;
    if (!targetShopId) return;

    setScLoading(true);
    setScError(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ shop_id: targetShopId, range: effectiveRange });
      const res = await fetch(`/api/search-console-fetch?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      let json;
      try { json = await res.json(); } catch { throw new Error("Server timeout bij SC ophalen."); }
      if (!res.ok) throw new Error(json?.error || `SC fout (HTTP ${res.status})`);
      setScData(json);
      setScShopId(targetShopId);
    } catch (e) {
      setScError(e.message);
    } finally {
      setScLoading(false);
    }
  }, [shops, range]);

  // Auto-load SC data when a SC-connected shop is in view
  useEffect(() => {
    if (!googleConnections.sc) return;
    if (scData && scShopId === (selectedShop !== "all" ? selectedShop : (shops || []).find(s => s.sc_connected)?.id) && scData.range === range) return;
    fetchScData(selectedShop, range);
  }, [googleConnections.sc, selectedShop, range]);

  const displayData = useMemo(() => {
    if (!data) return null;
    if (selectedShop === "all") return data.merged;
    return data.shops?.find(s => s.shopId === selectedShop) || data.merged;
  }, [data, selectedShop]);

  const chartData = useMemo(() => {
    if (!displayData?.byDate) return [];
    return displayData.byDate.map(d => ({
      label: new Date(d.date).toLocaleDateString("nl-NL", { day: "numeric", month: "short" }),
      revenue: Math.round(d.revenue * 100) / 100,
      orders: d.orders,
    }));
  }, [displayData]);

  const sourceDonutData = useMemo(() => {
    if (!displayData?.bySource) return [];
    const grouped = {};
    for (const s of displayData.bySource) {
      const g = s.group || "other";
      if (!grouped[g]) grouped[g] = { group: g, revenue: 0, orders: 0 };
      grouped[g].revenue += s.revenue;
      grouped[g].orders  += s.orders;
    }
    return Object.values(grouped)
      .sort((a, b) => b.revenue - a.revenue)
      .map(g => ({ ...g, ...(SOURCE_GROUPS[g.group] || SOURCE_GROUPS.other) }));
  }, [displayData]);

  const filteredSources = useMemo(() => {
    if (!displayData?.bySource) return [];
    if (!selectedSourceGroup) return displayData.bySource;
    return displayData.bySource.filter(s => s.group === selectedSourceGroup);
  }, [displayData, selectedSourceGroup]);

  const shopColor = selectedShop === "all"
    ? "var(--pr-h)"
    : SHOP_COLORS[(shops?.findIndex(s => s.id === selectedShop) || 0) + 1] || "var(--pr-h)";

  const S = {
    wrap:      { padding: "24px 28px", color: "var(--tx)", minHeight: "100vh" },
    card:      { background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: "var(--rd-xl)", padding: "20px 22px" },
    cardTitle: { fontFamily: "var(--font-h)", fontSize: 14, fontWeight: 700, color: "var(--tx)", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" },
    pill: (active, color) => ({
      padding: "5px 13px", borderRadius: 99,
      border: `1.5px solid ${active ? (color || "var(--pr)") : "var(--b2)"}`,
      background: active ? (color || "var(--pr-l)") : "transparent",
      color: active ? (color === "var(--pr)" ? "var(--pr-h)" : "#fff") : "var(--mx)",
      fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all .15s", whiteSpace: "nowrap",
    }),
    rangeBtn: (active) => ({
      padding: "5px 11px", borderRadius: "var(--rd)",
      border: `1px solid ${active ? "var(--pr)" : "var(--b1)"}`,
      background: active ? "var(--pr-l)" : "transparent",
      color: active ? "var(--pr-h)" : "var(--mx)",
      fontSize: 12, fontWeight: 500, cursor: "pointer",
    }),
    metricBtn: (active) => ({
      fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "none",
      background: active ? "var(--pr-l)" : "transparent",
      color: active ? "var(--pr-h)" : "var(--mx)",
      cursor: "pointer", fontWeight: 600,
    }),
    tabBtn: (active) => ({
      padding: "5px 12px", borderRadius: "var(--rd)", border: "none",
      background: active ? "var(--pr)" : "transparent",
      color: active ? "#fff" : "var(--mx)",
      fontSize: 12, fontWeight: 600, cursor: "pointer",
    }),
    badge: (color) => ({
      display: "inline-flex", alignItems: "center", padding: "2px 7px",
      borderRadius: 99, fontSize: 10, fontWeight: 700,
      background: color + "22", color: color,
    }),
  };

  const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
        <div style={{ color: "var(--mx)", marginBottom: 3 }}>{label}</div>
        {payload.map(p => (
          <div key={p.dataKey} style={{ color: "var(--pr-h)", fontWeight: 600 }}>
            {p.dataKey === "revenue" ? fmt(p.value) : `${p.value} orders`}
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div style={{ ...S.wrap, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 32, height: 32, border: "3px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <div style={{ color: "var(--mx)", fontSize: 14 }}>Data ophalen van je shops…</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ ...S.wrap, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: "var(--re)", marginBottom: 16, fontSize: 14 }}>{error}</div>
        <button onClick={() => fetchData(true)} style={{ padding: "8px 20px", borderRadius: 99, border: "1px solid var(--pr)", background: "var(--pr-l)", color: "var(--pr-h)", cursor: "pointer", fontWeight: 600 }}>Opnieuw proberen</button>
      </div>
    </div>
  );

  const d = displayData;
  if (!d) return null;

  const kpis = [
    { label: "Omzet (excl. btw)",     value: fmt(d.summary.totalRevenue),   icon: "💶", color: "#34D399" },
    { label: "Bestellingen",          value: d.summary.totalOrders,         icon: "📦", color: "#60A5FA" },
    { label: "Gem. orderwaarde",      value: fmt(d.summary.avgOrderValue),  icon: "🎯", color: "var(--pr-h)" },
    { label: "Terugboekingen",        value: d.summary.totalRefunds,        icon: "↩️", color: d.summary.totalRefunds > 0 ? "var(--re)" : "#34D399" },
    { label: "Kortingen toegepast",   value: fmt(d.summary.totalDiscount || 0), icon: "🏷️", color: "#F59E0B" },
    { label: "Totaal btw",            value: fmt(d.summary.totalTax      || 0), icon: "🧾", color: "#A78BFA" },
    { label: "Verzendkosten",         value: fmt(d.summary.totalShipping || 0), icon: "🚚", color: "#60A5FA" },
  ];

  const insightTypeStyle = {
    opportunity: { color: "#34D399", label: "Kans" },
    warning:     { color: "var(--re)", label: "Aandacht" },
    win:         { color: "#60A5FA", label: "Win" },
    action:      { color: "var(--ac)", label: "Actie" },
  };

  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-h)", fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>📊 Analytics</h2>
          <div style={{ fontSize: 12, color: "var(--mx)", marginTop: 3 }}>
            Verkoopstatistieken · {RANGES.find(r => r.key === range)?.label}
            {data?.after && ` · ${new Date(data.after).toLocaleDateString("nl-NL")} – ${new Date(data.before).toLocaleDateString("nl-NL")}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {RANGES.map(r => <button key={r.key} style={S.rangeBtn(r.key === range)} onClick={() => setRange(r.key)}>{r.label}</button>)}
          <button onClick={() => fetchData(true)} style={{ ...S.rangeBtn(false), padding: "5px 9px" }} title="Vernieuwen">🔄</button>
        </div>
      </div>

      {/* Shop selector */}
      <div style={{ display: "flex", gap: 7, marginBottom: 20, flexWrap: "wrap" }}>
        <button style={S.pill(selectedShop === "all", "var(--pr)")} onClick={() => selectShop("all")}>Alle shops</button>
        {(shops || []).map((shop, i) => {
          const c = SHOP_COLORS[i + 1] || SHOP_COLORS[0];
          return (
            <button key={shop.id} style={{ padding: "5px 13px", borderRadius: 99, border: `1.5px solid ${selectedShop === shop.id ? c : "var(--b2)"}`, background: selectedShop === shop.id ? c + "22" : "transparent", color: selectedShop === shop.id ? c : "var(--mx)", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all .15s", whiteSpace: "nowrap" }} onClick={() => selectShop(shop.id)}>
              <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: c, marginRight: 5, verticalAlign: "middle" }} />{shop.name}
            </button>
          );
        })}
        {data?.failed?.length > 0 && <span style={{ fontSize: 12, color: "var(--ac)", alignSelf: "center" }}>⚠️ {data.failed.length} shop{data.failed.length > 1 ? "s" : ""} niet bereikbaar</span>}
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 8 }}>
        {kpis.slice(0, 4).map((k, i) => (
          <div key={i} style={{ ...S.card, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -8, right: -8, fontSize: 44, opacity: .05 }}>{k.icon}</div>
            <div style={{ fontSize: 11, color: "var(--mx)", textTransform: "uppercase", letterSpacing: .5, fontWeight: 600, marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "var(--font-h)", letterSpacing: -1, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      {/* Secondary KPI row: discount / tax / shipping + filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        {kpis.slice(4).map((k, i) => (
          <div key={i} style={{ ...S.card, flex: "1 1 150px", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
            <span style={{ fontSize: 18 }}>{k.icon}</span>
            <div>
              <div style={{ fontSize: 10, color: "var(--mx)", textTransform: "uppercase", letterSpacing: .5, fontWeight: 600 }}>{k.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--font-h)", color: k.color }}>{k.value}</div>
            </div>
          </div>
        ))}
        {/* Order filters */}
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--mx)", whiteSpace: "nowrap" }}>Toon:</span>
          {[
            { label: "Geannuleerd", state: excludeCancelled, toggle: () => setExcludeCancelled(v => !v) },
            { label: "Terugbetaald", state: excludeRefunded,  toggle: () => setExcludeRefunded(v => !v) },
          ].map(f => (
            <button key={f.label} onClick={f.toggle} style={{ padding: "4px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1px solid ${f.state ? "var(--re)" : "var(--b2)"}`, background: f.state ? "rgba(239,68,68,.1)" : "transparent", color: f.state ? "var(--re)" : "var(--mx)", transition: "all .15s", textDecoration: f.state ? "line-through" : "none" }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Revenue chart + Source donut */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 14 }}>
        <div style={S.card}>
          <div style={S.cardTitle}>
            <span>Omzet over tijd</span>
            <div style={{ display: "flex", gap: 3 }}>
              {["revenue", "orders"].map(m => <button key={m} style={S.metricBtn(activeMetric === m)} onClick={() => setActiveMetric(m)}>{m === "revenue" ? "Omzet" : "Orders"}</button>)}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--pr)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--pr)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--b1)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--dm)", fontSize: 11 }} axisLine={false} tickLine={false} interval={chartData.length > 14 ? Math.floor(chartData.length / 7) : 0} />
              <YAxis tick={{ fill: "var(--dm)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => activeMetric === "revenue" ? fmtShort(v) : v} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey={activeMetric} stroke="var(--pr-h)" strokeWidth={2.5} fill="url(#aGrad)" dot={false} activeDot={{ r: 5, fill: "var(--pr-h)" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={S.card}>
          <div style={S.cardTitle}>Kanaalverdeling</div>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={sourceDonutData} cx="50%" cy="50%" innerRadius={40} outerRadius={62} paddingAngle={3} dataKey="revenue" strokeWidth={0}>
                {sourceDonutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sourceDonutData.map(s => (
              <button key={s.group} onClick={() => setSelectedSourceGroup(selectedSourceGroup === s.group ? null : s.group)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: selectedSourceGroup === s.group ? s.color + "18" : "none", border: "none", borderRadius: 6, padding: "3px 5px", cursor: "pointer", width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "var(--mx)" }}>{s.icon} {s.label}</span>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: "var(--tx)", fontWeight: 700 }}>{fmt(s.revenue)}</span>
                  <span style={{ fontSize: 11, color: "var(--mx)", marginLeft: 5 }}>{s.orders}x</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Source breakdown + Top products */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div style={S.card}>
          <div style={S.cardTitle}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Herkomst bestellingen
              {selectedSourceGroup && (
                <span style={S.badge(SOURCE_GROUPS[selectedSourceGroup]?.color || "var(--pr)")}>
                  {SOURCE_GROUPS[selectedSourceGroup]?.icon} {SOURCE_GROUPS[selectedSourceGroup]?.label}
                  <button onClick={() => setSelectedSourceGroup(null)} style={{ background: "none", border: "none", cursor: "pointer", marginLeft: 3, color: "inherit", lineHeight: 1 }}>×</button>
                </span>
              )}
            </span>
            <div style={{ display: "flex", gap: 3 }}>
              {["overview", "products"].map(t => <button key={t} style={S.tabBtn(activeSourceTab === t)} onClick={() => setActiveSourceTab(t)}>{t === "overview" ? "Bronnen" : "× Product"}</button>)}
            </div>
          </div>
          {activeSourceTab === "overview" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: 290, overflowY: "auto" }}>
              {filteredSources.slice(0, 15).map((s, i) => {
                const color = SOURCE_GROUPS[s.group]?.color || "#94A3B8";
                const maxRev = filteredSources[0]?.revenue || 1;
                return (
                  <div key={i} style={{ padding: "7px 0", borderBottom: i < filteredSources.length - 1 ? "1px solid var(--b1)" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={S.badge(color)}>{SOURCE_GROUPS[s.group]?.icon || "?"}</span>
                        <span style={{ fontSize: 13, color: "var(--tx)", fontWeight: 500, maxWidth: 175, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)" }}>{fmt(s.revenue)}</span>
                        <span style={{ fontSize: 11, color: "var(--mx)", marginLeft: 5 }}>{s.orders}x</span>
                      </div>
                    </div>
                    <div style={{ height: 3, borderRadius: 99, background: "var(--b1)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(s.revenue / maxRev) * 100}%`, background: color, borderRadius: 99 }} />
                    </div>
                  </div>
                );
              })}
              {!filteredSources.length && <div style={{ color: "var(--mx)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>Geen data voor dit kanaal</div>}
            </div>
          ) : (
            <div style={{ maxHeight: 290, overflowY: "auto" }}>
              {(d.byProduct || []).slice(0, 10).map((p, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: i < 9 ? "1px solid var(--b1)" : "none" }}>
                  <div style={{ fontSize: 13, color: "var(--tx)", fontWeight: 600, marginBottom: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {Object.entries(p.sources || {}).sort((a, b) => b[1] - a[1]).map(([grp, cnt]) => (
                      <span key={grp} style={S.badge(SOURCE_GROUPS[grp]?.color || "#94A3B8")}>{SOURCE_GROUPS[grp]?.icon} {cnt}x</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={S.card}>
          <div style={S.cardTitle}>Top producten</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: 300, overflowY: "auto" }}>
            {(d.byProduct || []).slice(0, 10).map((p, i) => {
              const maxRev = d.byProduct[0]?.revenue || 1;
              return (
                <div key={i} style={{ padding: "7px 0", borderBottom: i < 9 ? "1px solid var(--b1)" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 20, height: 20, borderRadius: 5, background: "var(--b1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--mx)", fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: 13, color: "var(--tx)", fontWeight: 500, maxWidth: 155, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{fmt(p.revenue)}</div>
                      <div style={{ fontSize: 11, color: "var(--mx)" }}>{p.orders}x verkocht</div>
                    </div>
                  </div>
                  <div style={{ height: 3, borderRadius: 99, background: "var(--b1)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(p.revenue / maxRev) * 100}%`, background: "var(--pr)", borderRadius: 99 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Campaigns + Hourly + Search Console — always visible, CTA when not connected */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>

        {/* Google Ads campaigns */}
        <div style={S.card}>
          <div style={S.cardTitle}>
            🎯 Google Ads campagnes
            {googleConnections.ads && d.byCampaign?.length > 0 && (
              <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 99, background: "rgba(34,197,94,0.12)", color: "#22c55e", fontWeight: 600 }}>● Live</span>
            )}
          </div>
          {!googleConnections.ads ? (
            <ConnectCTA service="ads" icon="🎯" title="Koppel Google Ads" description="Bekijk campagne ROAS, spend vs. omzet en zoekwoorden per bestelling." />
          ) : d.byCampaign?.length > 0 ? (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, padding: "0 0 7px", borderBottom: "1px solid var(--b1)", fontSize: 10, color: "var(--mx)", fontWeight: 600, textTransform: "uppercase", letterSpacing: .3 }}>
                <span>Campagne</span><span>Orders</span><span>Omzet</span>
              </div>
              {d.byCampaign.slice(0, 8).map((c, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, padding: "7px 0", borderBottom: i < d.byCampaign.length - 1 ? "1px solid var(--b1)" : "none", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--tx)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.campaign}</div>
                    {c.term && <div style={{ fontSize: 11, color: "var(--mx)" }}>🔑 {c.term}</div>}
                  </div>
                  <span style={{ fontSize: 12, color: "var(--mx)", textAlign: "right" }}>{c.orders}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, textAlign: "right" }}>{fmt(c.revenue)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 12, color: "var(--mx)" }}>Geen campagnedata in WooCommerce order meta gevonden.<br/>Zorg dat UTM-parameters in je Ads-links staan.</div>
          )}
        </div>

        {/* Orders by hour */}
        <div style={S.card}>
          <div style={S.cardTitle}>
            ⏰ Orders per uur
            {googleConnections.ads && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 99, background: "rgba(99,102,241,0.12)", color: "var(--pr-h)", fontWeight: 600 }}>+ Ads spend overlay →</span>}
          </div>
          {d.byHour?.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={d.byHour.map(h => ({ label: `${h.hour}u`, orders: h.orders }))} margin={{ top: 5, right: 0, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--b1)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "var(--dm)", fontSize: 10 }} axisLine={false} tickLine={false} interval={3} />
                  <YAxis tick={{ fill: "var(--dm)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="orders" fill="var(--pr)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              {(() => {
                const peak = d.byHour.reduce((a, b) => b.orders > a.orders ? b : a, { hour: 0, orders: 0 });
                return peak.orders > 0 ? <div style={{ fontSize: 12, color: "var(--mx)", marginTop: 6, textAlign: "center" }}>Piekuur: <strong style={{ color: "var(--tx)" }}>{peak.hour}:00–{peak.hour + 1}:00</strong> · {peak.orders} orders</div> : null;
              })()}
              {!googleConnections.ads && (
                <div style={{ marginTop: 10, padding: "7px 10px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: "var(--rd)", fontSize: 11, color: "var(--mx)" }}>
                  🎯 <a href="/#settings" onClick={() => window.location.hash="settings"} style={{ color: "var(--pr-h)", textDecoration: "none", fontWeight: 600 }}>Koppel Google Ads</a> om spend per uur te vergelijken met orders
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 12, color: "var(--mx)" }}>Geen orderdata beschikbaar voor dit bereik.</div>
          )}
        </div>

        {/* Search Console */}
        <div style={S.card}>
          <div style={S.cardTitle}>
            🔍 Organische zoekwoorden
            {googleConnections.sc && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 99, background: "rgba(34,197,94,0.12)", color: "#22c55e", fontWeight: 600 }}>● Live</span>}
            {googleConnections.sc && scData && !scLoading && (
              <button onClick={() => fetchScData(selectedShop, range)} style={{ marginLeft: "auto", fontSize: 11, padding: "3px 8px", borderRadius: 99, border: "1px solid var(--b1)", background: "var(--s2)", color: "var(--mx)", cursor: "pointer" }}>🔄</button>
            )}
          </div>
          {!googleConnections.sc ? (
            <ConnectCTA service="sc" icon="🔍" title="Koppel Search Console" description="Bekijk welke zoekwoorden organische bestellingen genereren, inclusief impressies, CTR en positie." />
          ) : scLoading ? (
            <div style={{ padding: "32px 0", textAlign: "center" }}>
              <div style={{ width: 22, height: 22, border: "3px solid var(--b1)", borderTopColor: "#22c55e", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 8px" }} />
              <div style={{ fontSize: 12, color: "var(--mx)" }}>Search Console data ophalen…</div>
            </div>
          ) : scError ? (
            <div style={{ padding: "18px 0" }}>
              <div style={{ fontSize: 12, color: "var(--er)", marginBottom: 10 }}>⚠️ {scError}</div>
              <button onClick={() => fetchScData(selectedShop, range)} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 99, border: "1px solid var(--er)", background: "transparent", color: "var(--er)", cursor: "pointer" }}>Opnieuw proberen</button>
            </div>
          ) : scData ? (() => {
            const { summary, queries, pages, trend, opportunities } = scData;
            return (
              <>
                {/* SC KPI row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
                  {[
                    ["Klikken", summary.total_clicks.toLocaleString("nl-NL"), "#22c55e"],
                    ["Impressies", summary.total_impressions.toLocaleString("nl-NL"), "#60A5FA"],
                    ["Gem. CTR", summary.avg_ctr + "%", "#F59E0B"],
                    ["Gem. positie", summary.avg_position, "#A78BFA"],
                  ].map(([label, val, color]) => (
                    <div key={label} style={{ padding: "10px 12px", borderRadius: "var(--rd)", background: "var(--bg)", border: "1px solid var(--b1)", textAlign: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--font-h)", color, letterSpacing: -0.5 }}>{val}</div>
                      <div style={{ fontSize: 10, color: "var(--mx)", marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Click trend mini-chart */}
                {trend.length > 1 && (() => {
                  const maxClicks = Math.max(...trend.map(t => t.clicks), 1);
                  return (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: "var(--mx)", marginBottom: 6, fontWeight: 600 }}>Klikken over tijd</div>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 48 }}>
                        {trend.map((t, i) => (
                          <div key={i} title={`${t.date}: ${t.clicks} klikken`}
                            style={{ flex: 1, minWidth: 2, height: `${Math.max((t.clicks / maxClicks) * 100, 4)}%`, background: "#22c55e", borderRadius: "2px 2px 0 0", opacity: 0.8 }} />
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--mx)", marginTop: 3 }}>
                        <span>{trend[0]?.date?.slice(5)}</span>
                        <span>{trend[trend.length - 1]?.date?.slice(5)}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Opportunity highlights */}
                {opportunities.length > 0 && (
                  <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: "var(--rd)", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", marginBottom: 8 }}>🎯 Kansen — hoge impressies, lage CTR (positie 4–20)</div>
                    {opportunities.map((opp, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center", padding: "5px 0", borderBottom: i < opportunities.length - 1 ? "1px solid rgba(245,158,11,0.15)" : "none" }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx)" }}>{opp.query}</div>
                          <div style={{ fontSize: 10, color: "var(--mx)" }}>pos. {opp.position} · {opp.impressions.toLocaleString("nl-NL")} impressies · {opp.ctr}% CTR</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          {opp.estimated_extra_clicks > 0 && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e" }}>+{opp.estimated_extra_clicks} klikken/mnd</div>
                          )}
                          <div style={{ fontSize: 10, color: "var(--mx)" }}>bij top-3</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Top queries table */}
                {queries.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx)", marginBottom: 8 }}>Top zoekwoorden</div>
                    <div style={{ borderRadius: "var(--rd)", overflow: "hidden", border: "1px solid var(--b1)" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: "var(--s2)" }}>
                            {["Zoekwoord", "Klikken", "Impressies", "CTR", "Positie"].map(h => (
                              <th key={h} style={{ padding: "6px 10px", textAlign: h === "Zoekwoord" ? "left" : "right", fontWeight: 600, color: "var(--mx)", fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queries.map((q, i) => {
                            const posColor = q.position <= 3 ? "#22c55e" : q.position <= 10 ? "#F59E0B" : "var(--mx)";
                            return (
                              <tr key={i} style={{ borderTop: "1px solid var(--b1)", background: i % 2 === 0 ? "transparent" : "var(--s2)" }}>
                                <td style={{ padding: "6px 10px", color: "var(--tx)", fontWeight: 500, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.query}</td>
                                <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, color: "#22c55e" }}>{q.clicks.toLocaleString("nl-NL")}</td>
                                <td style={{ padding: "6px 10px", textAlign: "right", color: "#60A5FA" }}>{q.impressions.toLocaleString("nl-NL")}</td>
                                <td style={{ padding: "6px 10px", textAlign: "right", color: "#F59E0B" }}>{q.ctr}%</td>
                                <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, color: posColor }}>#{q.position}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Top landing pages */}
                {pages.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx)", marginBottom: 8 }}>Top landingspagina's</div>
                    <div style={{ borderRadius: "var(--rd)", overflow: "hidden", border: "1px solid var(--b1)" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: "var(--s2)" }}>
                            {["Pagina", "Klikken", "Positie"].map(h => (
                              <th key={h} style={{ padding: "6px 10px", textAlign: h === "Pagina" ? "left" : "right", fontWeight: 600, color: "var(--mx)", fontSize: 10 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {pages.map((p, i) => (
                            <tr key={i} style={{ borderTop: "1px solid var(--b1)", background: i % 2 === 0 ? "transparent" : "var(--s2)" }}>
                              <td style={{ padding: "6px 10px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                <a href={p.full_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--pr-h)", textDecoration: "none", fontSize: 12, fontWeight: 500 }}>{p.page}</a>
                              </td>
                              <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, color: "#22c55e" }}>{p.clicks.toLocaleString("nl-NL")}</td>
                              <td style={{ padding: "6px 10px", textAlign: "right", color: q => q.position <= 3 ? "#22c55e" : "var(--mx)" }}>
                                <span style={{ color: p.position <= 3 ? "#22c55e" : p.position <= 10 ? "#F59E0B" : "var(--mx)", fontWeight: 600 }}>#{p.position}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* SC site label */}
                <div style={{ fontSize: 10, color: "var(--mx)", marginTop: 10 }}>
                  Bron: {scData.sc_site} · {scData.date_range?.start} – {scData.date_range?.end}
                </div>
              </>
            );
          })() : (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 12, color: "var(--mx)" }}>Geen Search Console data beschikbaar voor dit bereik.</div>
          )}
        </div>

      </div>

      {/* Per-shop comparison */}
      {selectedShop === "all" && data?.shops?.length > 1 && (
        <div style={{ ...S.card, marginBottom: 14 }}>
          <div style={S.cardTitle}>Vergelijking per shop</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(data.shops.length, 4)}, 1fr)`, gap: 12 }}>
            {data.shops.map((shop, i) => {
              const c = SHOP_COLORS[i + 1] || SHOP_COLORS[0];
              const maxRev = Math.max(...data.shops.map(s => s.summary.totalRevenue));
              return (
                <div key={shop.shopId} style={{ padding: "14px 16px", borderRadius: "var(--rd-lg)", background: "var(--bg)", border: "1px solid var(--b1)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: c, flexShrink: 0, display: "inline-block" }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shop.shopName}</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-h)", color: c, letterSpacing: -0.5, marginBottom: 2 }}>{fmt(shop.summary.totalRevenue)}</div>
                  <div style={{ fontSize: 11, color: "var(--mx)", marginBottom: 8 }}>{shop.summary.totalOrders} orders · gem. {fmt(shop.summary.avgOrderValue)}</div>
                  <div style={{ height: 4, borderRadius: 99, background: "var(--b1)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(shop.summary.totalRevenue / maxRev) * 100}%`, background: c, borderRadius: 99 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* GA4 panel */}
      {!googleConnections.ga4 && (
        <div style={{ ...S.card, marginBottom: 14 }}>
          <div style={S.cardTitle}>📈 Google Analytics 4 — Klantpaden & Sessies</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[
              { icon: "🛤️", title: "Conversiepaden", desc: "Welk kanaalpad (bijv. Organisch → Direct) leidt tot de meeste conversies?" },
              { icon: "👤", title: "Klant LTV per kanaal", desc: "Welke acquisitiekanalen leveren klanten met de hoogste lifetime value?" },
              { icon: "📱", title: "Sessies per apparaat", desc: "Vergelijk mobiel vs. desktop sessieduur, bouncerates en conversieratio." },
            ].map((item, i) => (
              <div key={i} style={{ padding: "14px 16px", borderRadius: "var(--rd-lg)", background: "var(--bg)", border: "1px solid var(--b1)", opacity: .7 }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>{item.icon}</div>
                <div style={{ fontFamily: "var(--font-h)", fontSize: 13, fontWeight: 700, color: "var(--tx)", marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 11, color: "var(--mx)", lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: "var(--rd)" }}>
            <span style={{ fontSize: 16 }}>📈</span>
            <span style={{ fontSize: 12, color: "var(--mx)" }}>
              <a href="/#settings" onClick={() => window.location.hash="settings"} style={{ color: "var(--pr-h)", textDecoration: "none", fontWeight: 600 }}>Koppel Google Analytics 4</a> om klantpaden, sessiedata en LTV per acquisitiekanaal te bekijken
            </span>
          </div>
        </div>
      )}

      {/* AI Insights */}
      <div style={S.card}>
        <div style={{ ...S.cardTitle, marginBottom: 14 }}>
          <span>🤖 AI Inzichten</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {insightsLoading && <span style={{ fontSize: 12, color: "var(--mx)" }}>Analyseren…</span>}
            <button onClick={() => fetchInsights(true)} style={S.rangeBtn(false)} disabled={insightsLoading}>{insightsLoading ? "⏳" : "🔄 Vernieuwen"}</button>
          </div>
        </div>
        {insightsLoading && !insights && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ borderRadius: "var(--rd-lg)", background: "var(--bg)", border: "1px solid var(--b1)", padding: 16, minHeight: 100 }}>
                <div style={{ width: "55%", height: 11, background: "var(--b1)", borderRadius: 5, marginBottom: 10 }} />
                <div style={{ width: "90%", height: 8, background: "var(--b1)", borderRadius: 5, marginBottom: 6 }} />
                <div style={{ width: "70%", height: 8, background: "var(--b1)", borderRadius: 5 }} />
              </div>
            ))}
          </div>
        )}
        {insights && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {insights.map((ins, i) => {
              const ts = insightTypeStyle[ins.type] || insightTypeStyle.action;
              return (
                <div key={i} style={{ borderRadius: "var(--rd-lg)", background: "var(--bg)", border: `1px solid ${ts.color}33`, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, right: 0, width: 55, height: 55, borderRadius: "0 12px 0 55px", background: ts.color + "0a" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                    <span style={{ fontSize: 20 }}>{ins.icon}</span>
                    <span style={S.badge(ts.color)}>{ts.label}</span>
                    <span style={{ fontSize: 10, color: "var(--mx)", marginLeft: "auto" }}>#{i + 1}</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-h)", fontSize: 13, fontWeight: 700, color: "var(--tx)", marginBottom: 5, lineHeight: 1.3 }}>{ins.title}</div>
                  <div style={{ fontSize: 12, color: "var(--mx)", lineHeight: 1.6, marginBottom: 9 }}>{ins.insight}</div>
                  <div style={{ fontSize: 12, color: ts.color, fontWeight: 600, lineHeight: 1.5, borderTop: `1px solid ${ts.color}22`, paddingTop: 9 }}>→ {ins.action}</div>
                </div>
              );
            })}
          </div>
        )}
        {!insightsLoading && !insights && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 13, color: "var(--mx)", marginBottom: 10 }}>Nog geen inzichten gegenereerd</div>
            <button onClick={fetchInsights} style={{ padding: "8px 18px", borderRadius: 99, border: "1px solid var(--pr)", background: "var(--pr-l)", color: "var(--pr-h)", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>🤖 Analyseer nu</button>
          </div>
        )}
      </div>
    </div>
  );
}



// ─── Plugin Wizard Modal ──────────────────────────────────────────────────────
const KNOWN_PLUGINS = [
  { id: "wqm", name: "WooCommerce Quantity Manager", desc: "Minimum/maximum bestelhoeveelheden, stapsgrootte en hoeveelheidsopties per product.", icon: "🔢" },
  { id: "wpc_pbq", name: "WPC Price by Quantity", desc: "Kortingsprijzen per hoeveelheid. Toont automatisch een prijzentabel op productpagina.", icon: "💶" },
  { id: "tiered-pricing-table", name: "Tiered Pricing Table", desc: "Kortingstabel op basis van besteld aantal. Toont automatisch prijzentabel op productpagina.", icon: "📊" },
  { id: "wholesale-prices", name: "Wholesale Prices for WooCommerce", desc: "Groothandelsprijzen per gebruikersrol. Aparte prijzen voor B2B-klanten.", icon: "🏭" },
  { id: "wpml", name: "WPML", desc: "Meertalige WooCommerce-winkel. Inhoud vertaling per taal via admin.", icon: "🌍" },
];

const PluginWizardModal = ({ shop, onSave, onSkip }) => {
  const [selected, setSelected] = useState(
    Array.isArray(shop?.active_plugins) ? shop.active_plugins : []
  );
  const [saving, setSaving] = useState(false);

  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await supabase.from("shops").update({ active_plugins: selected }).eq("id", shop.id);
      onSave({ ...shop, active_plugins: selected });
    } catch (e) { alert("Opslaan mislukt: " + e.message); }
    finally { setSaving(false); }
  };

  return (
    <Overlay open onClose={onSkip} width={500} title="🔌 Welke plugins gebruik je?">
      <div style={{ padding: 24 }}>
        <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 20, lineHeight: 1.6 }}>
          Selecteer de actieve plugins op <strong style={{ color: "var(--tx)" }}>{shop?.name}</strong>. WooSyncShop past de interface aan op basis van je installatie.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {KNOWN_PLUGINS.map(p => {
            const active = selected.includes(p.id);
            return (
              <div key={p.id}
                onClick={() => toggle(p.id)}
                style={{ padding: "12px 14px", background: active ? "linear-gradient(135deg,rgba(99,102,241,0.1),var(--s2))" : "var(--s2)", border: `1px solid ${active ? "rgba(99,102,241,0.4)" : "var(--b1)"}`, borderRadius: "var(--rd)", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12, transition: "all 0.15s" }}>
                <div style={{ marginTop: 1, flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, border: `2px solid ${active ? "var(--pr)" : "var(--b2)"}`, borderRadius: 4, background: active ? "var(--pr)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                    {active && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{p.icon} {p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--mx)", lineHeight: 1.5 }}>{p.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: "var(--dm)", marginBottom: 16 }}>
          Meer plugins worden binnenkort ondersteund. Je kunt dit altijd wijzigen via Instellingen → Mijn shops.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>{saving ? "Opslaan..." : "Opslaan en doorgaan →"}</Btn>
          <Btn variant="ghost" onClick={onSkip}>Overslaan</Btn>
        </div>
      </div>
    </Overlay>
  );
};


// ─── Stock Sync View ──────────────────────────────────────────────────────────
// Full 5-step wizard: Shop pair → Field scan → Field select → Match strategy → Sync run → Create unmatched

const SYNC_LANGUAGES = [
  { code: "NL", label: "Nederlands", lang: "Dutch" },
  { code: "FR", label: "Frans",      lang: "French" },
  { code: "DE", label: "Duits",      lang: "German" },
  { code: "EN", label: "Engels",     lang: "English" },
  { code: "ES", label: "Spaans",     lang: "Spanish" },
  { code: "IT", label: "Italiaans",  lang: "Italian" },
  { code: "PL", label: "Pools",      lang: "Polish" },
  { code: "PT", label: "Portugees",  lang: "Portuguese" },
  { code: "SE", label: "Zweeds",     lang: "Swedish" },
];

const StockSyncView = ({ shops, user, activeSite, wooCall }) => {
  const [step, setStep] = useState(1); // 1=shops, 2=scan+fields, 3=strategy, 4=sync-result, 5=create

  // Step 1 — shop pair
  const [sourceShopId, setSourceShopId] = useState(activeSite?.id || shops[0]?.id || null);
  const [targetShopId, setTargetShopId] = useState(null);

  // Step 2 — scan + field selection
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null); // { fields, has_wqm, sample_products }
  const [selectedFields, setSelectedFields] = useState(["stock_quantity"]);

  // Step 3 — match strategy
  const [matchStrategy, setMatchStrategy] = useState("sku"); // sku | identifier | mapping | ai_name

  // Step 4 — sync run
  const [sourceProducts, setSourceProducts] = useState([]);
  const [targetProducts, setTargetProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null); // { synced, failed, unmatched }
  const [priceMarkup, setPriceMarkup] = useState(0); // percentage markup applied to all prices, e.g. 10 = +10%
  // AI pre-match state
  const [aiMatchLoading, setAiMatchLoading] = useState(false);
  const [aiMatchResult, setAiMatchResult] = useState(null); // { matches: [...] } from ai-match-products
  const [userOverrides, setUserOverrides] = useState({}); // source_id → target_id (user-corrected)
  // Stored mapping preload
  const [storedMappings, setStoredMappings] = useState([]); // [{ source_woo_id, target_woo_id, source_sku, target_sku }]

  // Step 5 — create unmatched
  const [createConfig, setCreateConfig] = useState({
    language: "Dutch",
    lang_code: "NL",
    translate_fields: ["name", "description", "short_description", "attributes"],
    translate_meta: true,
    rewrite_seo: true,
    tone: "formal",
    sku_mode: "lang_prefix",
    image_mode: "translate", // 'translate' | 'ai_vision' | 'generate'
    image_generate_size: "woosyncshop", // 'woosyncshop' | 'target_shop'
    // Text generation
    text_mode: "translate_rewrite", // 'literal' | 'translate_rewrite' | 'seo_write'
    seo_use_headers: true,
    seo_word_count: 600,
    seo_add_lists: true,
    seo_custom_params: [], // up to 5 strings
    price_markup_pct: 0, // percentage markup on price, e.g. 10 = +10%
  });
  const [selectedToCreate, setSelectedToCreate] = useState(new Set());
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState(null);
  const [createProgress, setCreateProgress] = useState({ done: 0, total: 0, current: "" });

  const sourceShop = shops.find(s => s.id === sourceShopId);
  const targetShop = shops.find(s => s.id === targetShopId);

  // Auto-detect createConfig language from the target shop's locale
  // e.g. de_DE → German/DE, fr_FR → French/FR — saves the user from having to set it manually
  useEffect(() => {
    if (!targetShop?.locale) return;
    const prefix = targetShop.locale.split("_")[0].toLowerCase();
    const detected = LOCALE_TO_LANG[prefix];
    if (detected) {
      setCreateConfig(c => ({ ...c, language: detected.lang, lang_code: detected.code }));
    }
  }, [targetShopId]);
  const runScan = async () => {
    if (!sourceShopId) return;
    setScanning(true); setScanResult(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/sync-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ source_shop_id: sourceShopId, target_shop_id: targetShopId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setScanResult(data);
      // Pre-select all detected fields
      setSelectedFields(data.fields.filter(f => f.detected).map(f => f.key));
    } catch (e) { alert("Scan mislukt: " + e.message); }
    finally { setScanning(false); }
  };

  // ── Step 4: Load source products ───────────────────────────────────────────
  // Paginate all products from a shop via woo-proxy (100/page)
  const fetchAllProducts = async (shopId, token) => {
    const FIELD_LIST = "id,name,sku,type,regular_price,sale_price,price,stock_quantity,manage_stock,stock_status,description,short_description,categories,images,attributes,meta_data";
    let page = 1, all = [];
    while (true) {
      const res = await fetch("/api/woo", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ shop_id: shopId, endpoint: `products?per_page=100&page=${page}&orderby=title&order=asc&_fields=${FIELD_LIST}`, method: "GET" }),
      });
      const batch = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      all = all.concat(batch);
      if (batch.length < 100) break; // last page
      page++;
      if (all.length >= 5000) break; // safety cap
    }
    return all;
  };

  const loadSourceProducts = async () => {
    if (!sourceShopId) return;
    setLoadingProducts(true); setSourceProducts([]); setTargetProducts([]); setSyncResult(null);
    setAiMatchResult(null); setUserOverrides({}); setStoredMappings([]);
    try {
      const token = await getToken();
      // Fetch both shops in parallel, fully paginated
      const [srcData, tgtData] = await Promise.all([
        fetchAllProducts(sourceShopId, token),
        targetShopId ? fetchAllProducts(targetShopId, token) : Promise.resolve([]),
      ]);
      if (srcData.length > 0) {
        setSourceProducts(srcData);
        setSelectedProducts(new Set(srcData.map(p => p.id)));
      }
      setTargetProducts(tgtData);

      // Preload stored mappings for "mapping" strategy
      if (matchStrategy === "mapping" && sourceShopId && targetShopId) {
        const { data: maps } = await supabase
          .from("shop_product_mappings")
          .select("source_woo_id, target_woo_id, source_sku, target_sku")
          .eq("source_shop_id", sourceShopId)
          .eq("target_shop_id", targetShopId);
        setStoredMappings(maps || []);
      }
    } catch (e) { alert("Laden mislukt: " + e.message); }
    finally { setLoadingProducts(false); }
  };

  // Run AI product matching (ai_name strategy)
  const runAiMatch = async () => {
    if (!sourceShopId || !targetShopId) return;
    setAiMatchLoading(true); setAiMatchResult(null); setUserOverrides({});
    try {
      const token = await getToken();
      const res = await fetch("/api/ai-match-products", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ source_shop_id: sourceShopId, target_shop_id: targetShopId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAiMatchResult(data);
    } catch (e) { alert("AI matching mislukt: " + e.message); }
    finally { setAiMatchLoading(false); }
  };

  // ── Step 4: Run sync ───────────────────────────────────────────────────────
  const handleSync = async () => {
    if (selectedProducts.size === 0) return alert("Selecteer minimaal één product.");
    if (!targetShopId) return alert("Selecteer een doelshop.");
    if (!confirm(`${selectedProducts.size} product(en) synchroniseren van ${sourceShop?.name} naar ${targetShop?.name}?`)) return;

    setSyncing(true); setSyncResult(null);
    try {
      const toSync = sourceProducts.filter(p => selectedProducts.has(p.id));
      const token = await getToken();

      // Build confirmed mappings for AI strategy
      let confirmedMappings = null;
      if (matchStrategy === "ai_name") {
        confirmedMappings = toSync.map(src => {
          const override = userOverrides[src.id];
          if (override) return { source_id: src.id, target_id: override };
          const m = (aiMatchResult?.matches || []).find(x => x.source_product.id === src.id);
          if (m) return { source_id: src.id, target_id: m.target_product.id };
          return null;
        }).filter(Boolean);
      }

      // Chunk large syncs: stock-sync handles matching server-side so we only need
      // to send product IDs + selected fields per chunk, not full product data.
      // For now send in one call — stock-sync fetches target products itself.
      // Strip heavy fields (description, meta_data) from the request body to keep it lean.
      const leanProducts = toSync.map(p => ({
        id: p.id, name: p.name, sku: p.sku, type: p.type,
        regular_price: p.regular_price, sale_price: p.sale_price,
        stock_quantity: p.stock_quantity, manage_stock: p.manage_stock,
        stock_status: p.stock_status, categories: p.categories,
        images: p.images, attributes: p.attributes,
        // Include meta_data only if WQM fields are selected
        meta_data: selectedFields.some(f => f.startsWith("wqm")) ? p.meta_data : undefined,
        description: selectedFields.includes("description") ? p.description : undefined,
        short_description: selectedFields.includes("short_description") ? p.short_description : undefined,
      }));

      const CHUNK_SIZE = 200; // products per stock-sync call
      const chunks = [];
      for (let i = 0; i < leanProducts.length; i += CHUNK_SIZE) chunks.push(leanProducts.slice(i, i + CHUNK_SIZE));

      let merged = { synced: [], failed: [], unmatched: [] };
      for (const chunk of chunks) {
        const res = await fetch("/api/stock-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({
            source_shop_id: sourceShopId,
            target_shop_id: targetShopId,
            products: chunk,
            fields: selectedFields,
            match_strategy: matchStrategy === "ai_name" ? "confirmed_mapping" : matchStrategy,
            confirmed_mappings: confirmedMappings,
            price_markup_pct: priceMarkup,
            source_plugin_id: (scanResult?.source_plugins || []).find(p => p.id === "wqm" || p.id === "wpc_pbq")?.id || null,
            target_plugin_id: (scanResult?.target_plugins || []).find(p => p.id === "wqm" || p.id === "wpc_pbq")?.id || null,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        merged.synced.push(...(data.synced || []));
        merged.failed.push(...(data.failed || []));
        merged.unmatched.push(...(data.unmatched || []));
      }

      setSyncResult(merged);
      setSelectedToCreate(new Set((merged.unmatched || []).map(p => p.id)));
      setStep(4);
    } catch (e) { alert("Sync mislukt: " + e.message); }
    finally { setSyncing(false); }
  };

  // ── Step 5: Create unmatched — background function + polling ────────────────
  const handleCreate = async () => {
    if (selectedToCreate.size === 0) return alert("Selecteer minimaal één product om aan te maken.");
    if (!targetShopId) return alert("Selecteer een doelshop.");

    const toCreate = (syncResult?.unmatched || [])
      .filter(p => selectedToCreate.has(p.id))
      .map(sp => sourceProducts.find(fp => fp.id === sp.id))
      .filter(Boolean);

    if (toCreate.length === 0) return alert("Producten niet gevonden in brondata.");

    setCreating(true);
    setCreateResult(null);
    setCreateProgress({ done: 0, total: toCreate.length, current: "Starten..." });

    try {
      const token = await getToken();

      // Create a job row in Supabase first
      const { data: jobRow, error: jobErr } = await supabase
        .from("sync_jobs")
        .insert({ user_id: user.id, status: "pending", total: toCreate.length, done: 0, current_product: null, result: null, error: null })
        .select("id").single();
      if (jobErr || !jobRow) throw new Error("Kon geen job aanmaken: " + (jobErr?.message || "unknown"));
      const jobId = jobRow.id;

      // Fire background function (returns 202 immediately)
      const res = await fetch("/api/sync-create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          source_shop_id: sourceShopId,
          target_shop_id: targetShopId,
          products: toCreate,
          config: createConfig,
          job_id: jobId,
        }),
      });
      if (!res.ok && res.status !== 202) {
        let err; try { err = (await res.json()).error; } catch { err = `HTTP ${res.status}`; }
        throw new Error(err);
      }

      // Poll /api/sync-job-status every 2 seconds
      const poll = async () => {
        const statusRes = await fetch(`/api/sync-job-status?id=${jobId}`, {
          headers: { "Authorization": `Bearer ${token}` },
        });
        return statusRes.ok ? statusRes.json() : null;
      };

      await new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const job = await poll();
            if (!job) return;
            setCreateProgress({ done: job.done || 0, total: job.total || toCreate.length, current: job.current_product || "" });
            if (job.status === "done") {
              clearInterval(interval);
              setCreateResult(job.result || { created: [], failed: [], skipped: [] });
              resolve();
            } else if (job.status === "failed") {
              clearInterval(interval);
              reject(new Error(job.error || "Aanmaken mislukt"));
            }
          } catch (pollErr) { /* keep polling on transient errors */ }
        }, 2000);
        // Safety timeout: stop polling after 12 min
        setTimeout(() => { clearInterval(interval); reject(new Error("Timeout: job duurde te lang")); }, 720000);
      });

    } catch (e) { alert("Aanmaken mislukt: " + e.message); }
    finally { setCreating(false); setCreateProgress({ done: 0, total: 0, current: "" }); }
  };

  const toggleField = (key) => setSelectedFields(f => f.includes(key) ? f.filter(x => x !== key) : [...f, key]);
  const toggleProduct = (id) => setSelectedProducts(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleCreate = (id) => setSelectedToCreate(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const filteredProducts = sourceProducts.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase())
  );

  const stepLabels = ["Shops", "Velden", "Strategie", "Sync", "Aanmaken"];

  const StepBar = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 20 }}>
      {stepLabels.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <div key={n} style={{ display: "flex", alignItems: "center", flex: n < stepLabels.length ? 1 : undefined }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: done ? "pointer" : "default" }}
              onClick={() => done && setStep(n)}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
                background: done ? "var(--gr)" : active ? "var(--pr)" : "var(--s3)",
                color: done || active ? "#fff" : "var(--mx)",
                border: `2px solid ${done ? "var(--gr)" : active ? "var(--pr)" : "var(--b2)"}` }}>
                {done ? "✓" : n}
              </div>
              <span style={{ fontSize: 10, color: active ? "var(--pr)" : "var(--mx)", fontWeight: active ? 600 : 400 }}>{label}</span>
            </div>
            {n < stepLabels.length && (
              <div style={{ flex: 1, height: 2, background: done ? "var(--gr)" : "var(--b2)", margin: "0 6px", marginBottom: 18 }} />
            )}
          </div>
        );
      })}
    </div>
  );

  if (shops.length < 2) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--mx)" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔗</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Minimaal 2 shops vereist</div>
        <div style={{ fontSize: 13 }}>Voeg een tweede shop toe om te synchroniseren.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 860 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>🔄 Multi-Shop Sync</div>
        <div style={{ fontSize: 12, color: "var(--mx)" }}>Synchroniseer voorraad, prijzen en andere velden tussen shops. Maak ontbrekende producten aan met AI-vertaling.</div>
      </div>

      <StepBar />

      {/* ── STEP 1: Shop pair ─────────────────────────────────────────────────── */}
      {step === 1 && (
        <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", fontWeight: 600, fontSize: 13 }}>
            Stap 1 — Kies bronshop en doelshop
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mx)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Bronshop (van)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {shops.map(s => (
                  <button key={s.id} onClick={() => { setSourceShopId(s.id); if (s.id === targetShopId) setTargetShopId(null); }}
                    style={{ padding: "8px 16px", borderRadius: "var(--rd)", border: `2px solid ${sourceShopId === s.id ? "var(--pr)" : "var(--b1)"}`, background: sourceShopId === s.id ? "rgba(99,102,241,0.1)" : "var(--s3)", color: "var(--tx)", fontSize: 13, fontWeight: sourceShopId === s.id ? 700 : 400, cursor: "pointer" }}>
                    {s.flag || "🌐"} {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mx)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Doelshop (naar)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {shops.filter(s => s.id !== sourceShopId).map(s => (
                  <button key={s.id} onClick={() => setTargetShopId(s.id)}
                    style={{ padding: "8px 16px", borderRadius: "var(--rd)", border: `2px solid ${targetShopId === s.id ? "var(--gr)" : "var(--b1)"}`, background: targetShopId === s.id ? "rgba(34,197,94,0.1)" : "var(--s3)", color: "var(--tx)", fontSize: 13, fontWeight: targetShopId === s.id ? 700 : 400, cursor: "pointer" }}>
                    {s.flag || "🌐"} {s.name}
                  </button>
                ))}
              </div>
            </div>
            {sourceShopId && targetShopId && (
              <div style={{ padding: "10px 14px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "var(--rd)", fontSize: 13 }}>
                <strong>{sourceShop?.name}</strong> → <strong>{targetShop?.name}</strong>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Btn variant="primary" disabled={!sourceShopId || !targetShopId} onClick={() => { setStep(2); runScan(); }}>
                Volgende: Velden scannen →
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: Field scan + selection ────────────────────────────────────── */}
      {step === 2 && (
        <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Stap 2 — Kies te synchroniseren velden</span>
            <Btn variant="secondary" size="sm" onClick={runScan} disabled={scanning} style={{ marginLeft: "auto" }}>↻ Opnieuw scannen</Btn>
          </div>
          <div style={{ padding: 20 }}>
            {scanning ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 0", color: "var(--mx)", fontSize: 13 }}>
                <div style={{ width: 18, height: 18, border: "2px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                Velden en plugins scannen in {sourceShop?.name} en {targetShop?.name}...
              </div>
            ) : scanResult ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

                {/* ── Scan context ── */}
                <div style={{ fontSize: 12, color: "var(--mx)" }}>
                  Gebaseerd op de eerste 5 producten van <strong>{sourceShop?.name}</strong>. Aangevinkte velden zijn gedetecteerd met data.
                </div>

                {/* ── Plugin compatibility panel ── */}
                {(() => {
                  const compat = scanResult.compat_groups || [];
                  const srcPlugins = scanResult.source_plugins || [];
                  const tgtPlugins = scanResult.target_plugins || [];
                  const hasIssues = compat.some(g => g.status !== "compatible");
                  if (srcPlugins.length === 0 && tgtPlugins.length === 0) return null;

                  const statusMeta = {
                    compatible:  { icon: "✅", color: "var(--gr)",                         bg: "rgba(34,197,94,0.06)",   border: "rgba(34,197,94,0.2)",   label: "Compatibel" },
                    convertible: { icon: "🔄", color: "var(--pr)",                         bg: "rgba(99,102,241,0.06)",  border: "rgba(99,102,241,0.2)",  label: "Automatisch omgezet" },
                    global_only: { icon: "⚠️", color: "var(--ac)",                         bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.3)",  label: "Globaal — niet per product" },
                    missing:     { icon: "❌", color: "rgba(239,68,68,1)",                  bg: "rgba(239,68,68,0.05)",  border: "rgba(239,68,68,0.2)",   label: "Plugin ontbreekt" },
                  };

                  return (
                    <div style={{ borderRadius: "var(--rd)", border: `1px solid ${hasIssues ? "rgba(245,158,11,0.3)" : "rgba(34,197,94,0.2)"}`, overflow: "hidden" }}>
                      {/* Header */}
                      <div style={{ padding: "8px 12px", background: hasIssues ? "rgba(245,158,11,0.06)" : "rgba(34,197,94,0.06)", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${hasIssues ? "rgba(245,158,11,0.2)" : "rgba(34,197,94,0.15)"}` }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: hasIssues ? "var(--ac)" : "var(--gr)" }}>
                          🔌 Plugin compatibiliteit
                        </span>
                        <span style={{ fontSize: 11, color: "var(--mx)", marginLeft: "auto" }}>
                          {sourceShop?.name} → {targetShop?.name}
                        </span>
                      </div>
                      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                        {/* Plugin comparison row */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr", gap: 8, alignItems: "center", marginBottom: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--mx)", textTransform: "uppercase" }}>Bron</div>
                          <div />
                          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--mx)", textTransform: "uppercase" }}>Doel</div>
                        </div>
                        {compat.map((g, i) => {
                          const sm = statusMeta[g.status] || statusMeta.missing;
                          return (
                            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", background: sm.bg, border: `1px solid ${sm.border}`, borderRadius: "var(--rd)" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr", gap: 8, alignItems: "center" }}>
                                {/* Source plugin */}
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, background: "var(--s3)", padding: "2px 5px", borderRadius: 3, color: "var(--mx)", letterSpacing: "0.03em" }}>{g.source_plugin?.icon}</span>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tx)" }}>{g.source_plugin?.name}</span>
                                </div>
                                {/* Arrow */}
                                <div style={{ fontSize: 14, color: "var(--mx)", textAlign: "center" }}>→</div>
                                {/* Target plugin */}
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  {g.target_plugin ? (
                                    <>
                                      <span style={{ fontSize: 10, fontWeight: 700, background: "var(--s3)", padding: "2px 5px", borderRadius: 3, color: "var(--mx)", letterSpacing: "0.03em" }}>{g.target_plugin?.icon}</span>
                                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tx)" }}>{g.target_plugin?.name}</span>
                                    </>
                                  ) : (
                                    <span style={{ fontSize: 12, color: "rgba(239,68,68,0.9)", fontStyle: "italic" }}>Niet gedetecteerd</span>
                                  )}
                                </div>
                              </div>
                              {/* Status badge + message */}
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: sm.border, color: sm.color, whiteSpace: "nowrap", flexShrink: 0 }}>
                                  {sm.icon} {sm.label}
                                </span>
                                <span style={{ fontSize: 11, color: "var(--mx)", lineHeight: 1.5 }}>{g.message}</span>
                              </div>
                              {/* Suggestion */}
                              {g.suggestion && (
                                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 2 }}>
                                  <span style={{ fontSize: 11, color: "var(--ac)" }}>💡 {g.suggestion}</span>
                                  {g.suggestion_url && (
                                    <a href={g.suggestion_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--pr)", textDecoration: "underline", flexShrink: 0 }}>Plugin →</a>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {/* Also show detected plugins on target that aren't on source */}
                        {tgtPlugins.filter(t => !compat.some(g => g.target_plugin?.id === t.id)).map(t => (
                          <div key={t.id} style={{ padding: "6px 10px", background: "var(--s3)", borderRadius: "var(--rd)", fontSize: 11, color: "var(--mx)" }}>
                            🔌 <strong>{t.name}</strong> actief op doelshop — geen corresponderend bronveld geselecteerd.
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Standard fields ── */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mx)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Standaard velden</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {scanResult.fields.filter(f => !f.group).map(f => (
                      <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 12px", borderRadius: "var(--rd)", background: selectedFields.includes(f.key) ? "rgba(99,102,241,0.06)" : "transparent", border: `1px solid ${selectedFields.includes(f.key) ? "rgba(99,102,241,0.2)" : "var(--b1)"}` }}>
                        <input type="checkbox" checked={selectedFields.includes(f.key)} onChange={() => toggleField(f.key)} style={{ width: 15, height: 15, accentColor: "var(--pr)", cursor: "pointer" }} />
                        <span style={{ fontSize: 13, flex: 1 }}>{f.label}</span>
                        {!f.detected && <span style={{ fontSize: 10, color: "var(--dm)", background: "var(--s3)", padding: "2px 6px", borderRadius: 4 }}>leeg</span>}
                      </label>
                    ))}
                  </div>
                </div>

                {/* ── Plugin-specific field groups ── */}
                {(() => {
                  // Group fields by their group key, render each group with plugin header
                  const groups = [...new Set(scanResult.fields.filter(f => f.group).map(f => f.group))];
                  return groups.map(grp => {
                    const compat = (scanResult.compat_groups || []).find(g => g.field_group === grp);
                    const statusMeta = {
                      compatible:  { color: "var(--gr)",            label: "✅ Compatibel",             accent: "rgba(34,197,94,0.2)" },
                      convertible: { color: "var(--pr)",            label: "🔄 Automatisch omgezet",    accent: "rgba(99,102,241,0.2)" },
                      global_only: { color: "var(--ac)",            label: "⚠️ Globaal — niet syncbaar", accent: "rgba(245,158,11,0.3)" },
                      missing:     { color: "rgba(239,68,68,1)",    label: "❌ Plugin ontbreekt",        accent: "rgba(239,68,68,0.2)" },
                    };
                    const sm = compat ? statusMeta[compat.status] : { color: "var(--ac)", label: "", accent: "rgba(245,158,11,0.3)" };
                    const isBlocked = compat?.status === "global_only" || compat?.status === "missing";

                    // Get plugin name for group header
                    const srcPlugin = compat?.source_plugin?.name || grp.toUpperCase();

                    return (
                      <div key={grp}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ac)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{srcPlugin}</div>
                          {compat && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: sm.color, padding: "1px 6px", borderRadius: 3, background: sm.accent }}>
                              {sm.label}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: isBlocked ? 0.5 : 1 }}>
                          {scanResult.fields.filter(f => f.group === grp).map(f => (
                            <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 10, cursor: isBlocked ? "not-allowed" : "pointer", padding: "8px 12px", borderRadius: "var(--rd)", background: selectedFields.includes(f.key) ? "rgba(245,158,11,0.06)" : "transparent", border: `1px solid ${selectedFields.includes(f.key) ? "rgba(245,158,11,0.3)" : "var(--b1)"}` }}>
                              <input type="checkbox" disabled={isBlocked} checked={selectedFields.includes(f.key)} onChange={() => !isBlocked && toggleField(f.key)} style={{ width: 15, height: 15, accentColor: "var(--ac)", cursor: isBlocked ? "not-allowed" : "pointer" }} />
                              <span style={{ fontSize: 13, flex: 1 }}>{f.label}</span>
                              {!f.detected && <span style={{ fontSize: 10, color: "var(--dm)", background: "var(--s3)", padding: "2px 6px", borderRadius: 4 }}>leeg</span>}
                              {isBlocked && <span style={{ fontSize: 10, color: "rgba(239,68,68,0.8)", background: "rgba(239,68,68,0.08)", padding: "2px 6px", borderRadius: 4 }}>niet syncbaar</span>}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}

                <div style={{ fontSize: 12, color: "var(--mx)" }}>{selectedFields.length} veld(en) geselecteerd</div>
              </div>
            ) : (
              <div style={{ padding: "20px 0", color: "var(--mx)", fontSize: 13 }}>Klik op "Opnieuw scannen" om te starten.</div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <Btn variant="secondary" onClick={() => setStep(1)}>← Terug</Btn>
              <Btn variant="primary" disabled={selectedFields.length === 0 || !scanResult} onClick={() => setStep(3)}>
                Volgende: Koppelstrategie →
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3: Match strategy ─────────────────────────────────────────────── */}
      {step === 3 && (
        <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", fontWeight: 600, fontSize: 13 }}>
            Stap 3 — Koppelstrategie kiezen
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--mx)" }}>Hoe moeten producten tussen shops worden gekoppeld?</div>
            {[
              { val: "sku", icon: "🔑", title: "SKU exact", desc: "Koppelt producten met identieke SKU-codes. Snel, geen AI nodig. Werkt wanneer beide shops consistente SKUs hebben." },
              { val: "identifier", icon: "🏷️", title: "Identifier attribuut", desc: "Koppelt via het _wss_identifier meta-veld dat door WooSyncShop wordt toegevoegd. Betrouwbaarder bij verschillende SKUs maar zelfde product." },
              { val: "mapping", icon: "💾", title: "Opgeslagen koppeling", desc: "Gebruikt eerder opgeslagen koppelingen uit eerdere AI-matching of handmatige koppeling. Snelste optie na eerste setup." },
              { val: "ai_name", icon: "🤖", title: "AI — op naam & SKU", desc: "AI analyseert productnamen en SKUs van beide shops en stelt koppelingen voor. Ideaal als SKUs niet overeenkomen. Je bevestigt elke koppeling vóór de sync." },
            ].map(opt => (
              <label key={opt.val} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 16px", borderRadius: "var(--rd)", border: `2px solid ${matchStrategy === opt.val ? "var(--pr)" : "var(--b1)"}`, background: matchStrategy === opt.val ? "rgba(99,102,241,0.06)" : "var(--s3)", cursor: "pointer" }}>
                <input type="radio" name="strategy" value={opt.val} checked={matchStrategy === opt.val} onChange={() => setMatchStrategy(opt.val)} style={{ marginTop: 2, accentColor: "var(--pr)" }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{opt.icon} {opt.title}</div>
                  <div style={{ fontSize: 12, color: "var(--mx)", marginTop: 3 }}>{opt.desc}</div>
                </div>
              </label>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <Btn variant="secondary" onClick={() => setStep(2)}>← Terug</Btn>
              <Btn variant="primary" onClick={() => {
                setStep(4);
                loadSourceProducts().then(() => {
                  if (matchStrategy === "ai_name") runAiMatch();
                });
              }}>
                {matchStrategy === "ai_name" ? "Volgende: AI matching starten →" : "Volgende: Producten laden →"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 4: Product selection + sync run + result ─────────────────────── */}
      {step === 4 && (() => {
        // Build lookup maps for all strategies
        const tgtSkuMap   = {};
        const tgtIdMap    = {};
        targetProducts.forEach(tp => {
          if (tp.sku) tgtSkuMap[tp.sku] = tp;
          tgtIdMap[tp.id] = tp;
        });

        // Stored mapping lookup: source_woo_id → target product
        const storedMap = {};
        storedMappings.forEach(m => {
          const tp = tgtIdMap[m.target_woo_id];
          if (tp) storedMap[m.source_woo_id] = tp;
        });

        // AI match lookup: source_id → { target_product, confidence, reasoning, match_basis }
        const aiMap = {};
        (aiMatchResult?.matches || []).forEach(m => {
          const override = userOverrides[m.source_product.id];
          const tp = override ? tgtIdMap[override] : tgtIdMap[m.target_product.id];
          if (tp) aiMap[m.source_product.id] = {
            product: tp,
            confidence: override ? 1.0 : m.confidence,
            reasoning: override ? "Handmatig gecorrigeerd" : m.reasoning,
            match_basis: override ? "manual" : m.match_basis,
            overridden: !!override,
          };
        });
        // Also apply manual overrides for products with no AI match
        Object.entries(userOverrides).forEach(([srcId, tgtId]) => {
          if (!aiMap[parseInt(srcId)]) {
            const tp = tgtIdMap[tgtId];
            if (tp) aiMap[parseInt(srcId)] = { product: tp, confidence: 1.0, reasoning: "Handmatig geselecteerd", match_basis: "manual", overridden: true };
          }
        });

        const previewMatch = (src) => {
          if (matchStrategy === "sku")     return tgtSkuMap[src.sku] || null;
          if (matchStrategy === "mapping") return storedMap[src.id] || null;
          if (matchStrategy === "ai_name") {
            const m = aiMap[src.id];
            return m ? m.product : (aiMatchResult ? null : undefined);
          }
          return undefined; // identifier: resolved server-side
        };
        const getAiMeta = (src) => matchStrategy === "ai_name" ? aiMap[src.id] : null;

        // Build post-sync result maps
        const syncedMap   = {};
        const failedMap   = {};
        const unmatchedSet = new Set();
        (syncResult?.synced   || []).forEach(s => { syncedMap[s.source_id]  = s; });
        (syncResult?.failed   || []).forEach(f => { failedMap[f.id]         = f; });
        (syncResult?.unmatched|| []).forEach(u => { unmatchedSet.add(u.id); });
        const hasSyncResult = !!syncResult;

        // toCreatePreview = products that will go to step 5:
        //   a) products with a confirmed null match (no counterpart in target)
        //   b) products the user manually deselected from the sync run
        // Both scenarios mean: "create this product fresh in the target shop"
        const knownStrategies = matchStrategy === "sku" || matchStrategy === "mapping" || matchStrategy === "ai_name";
        const toCreatePreview = !hasSyncResult && knownStrategies
          ? sourceProducts.filter(p => {
              const match = previewMatch(p);
              const isDeselected = !selectedProducts.has(p.id);
              return match === null || isDeselected;
            })
          : [];
        // Keep backward-compat alias
        const unmatchedPreview = toCreatePreview;

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Config summary bar */}
            <div style={{ padding: "10px 16px", background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, alignItems: "center" }}>
              <span>📤 <strong>{sourceShop?.name}</strong> → <strong>{targetShop?.name}</strong></span>
              <span>🔑 {matchStrategy === "sku" ? "SKU exact" : matchStrategy === "identifier" ? "Identifier attribuut" : "Opgeslagen koppeling"}</span>
              <span>📋 {selectedFields.length} veld(en)</span>
              {/* Price markup control */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                <span style={{ fontSize: 11, color: "var(--mx)", whiteSpace: "nowrap" }}>💶 Prijsopslag:</span>
                <button onClick={() => setPriceMarkup(m => Math.max(-50, m - 5))} style={{ width: 24, height: 24, borderRadius: "var(--rd)", border: "1px solid var(--b1)", background: "var(--s3)", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mx)", flexShrink: 0 }}>−</button>
                <div style={{ minWidth: 52, textAlign: "center", fontWeight: 700, color: priceMarkup > 0 ? "var(--gr)" : priceMarkup < 0 ? "rgba(239,68,68,1)" : "var(--mx)", fontSize: 13 }}>
                  {priceMarkup > 0 ? "+" : ""}{priceMarkup}%
                </div>
                <button onClick={() => setPriceMarkup(m => Math.min(200, m + 5))} style={{ width: 24, height: 24, borderRadius: "var(--rd)", border: "1px solid var(--b1)", background: "var(--s3)", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mx)", flexShrink: 0 }}>+</button>
                {priceMarkup !== 0 && <button onClick={() => setPriceMarkup(0)} style={{ fontSize: 10, background: "none", border: "none", color: "var(--dm)", cursor: "pointer", padding: "0 2px" }}>reset</button>}
              </div>
              <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: "var(--pr)", fontSize: 12, cursor: "pointer" }}>✏ Wijzigen</button>
            </div>

            {/* Product table */}
            <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
              {/* AI matching status banner */}
              {matchStrategy === "ai_name" && !hasSyncResult && (
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--b1)", background: aiMatchLoading ? "rgba(99,102,241,0.06)" : aiMatchResult ? "rgba(34,197,94,0.05)" : "rgba(245,158,11,0.05)", display: "flex", alignItems: "center", gap: 10 }}>
                  {aiMatchLoading ? (
                    <>
                      <div style={{ width: 14, height: 14, border: "2px solid var(--b2)", borderTopColor: "var(--pr)", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "var(--mx)" }}>AI analyseert productnamen en SKUs van beide shops...</span>
                    </>
                  ) : aiMatchResult ? (
                    <>
                      <span style={{ fontSize: 13 }}>🤖</span>
                      <span style={{ fontSize: 12, color: "var(--gr)", fontWeight: 600 }}>
                        {Object.values(aiMap).length} van {sourceProducts.length} producten gematcht
                      </span>
                      <span style={{ fontSize: 11, color: "var(--mx)" }}>
                        — {sourceProducts.length - Object.values(aiMap).length} zonder match (worden niet gesynchroniseerd, tenzij je handmatig koppelt)
                      </span>
                      <Btn variant="secondary" size="sm" onClick={runAiMatch} style={{ marginLeft: "auto" }}>↻ Opnieuw</Btn>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 11, color: "var(--ac)" }}>AI matching nog niet gestart.</span>
                      <Btn variant="secondary" size="sm" onClick={runAiMatch} style={{ marginLeft: "auto" }}>🤖 Start AI matching</Btn>
                    </>
                  )}
                </div>
              )}
              {/* Stored mapping banner */}
              {matchStrategy === "mapping" && !hasSyncResult && (
                <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--b1)", background: storedMappings.length > 0 ? "rgba(34,197,94,0.05)" : "rgba(245,158,11,0.05)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: storedMappings.length > 0 ? "var(--gr)" : "var(--ac)" }}>
                    {storedMappings.length > 0 ? `💾 ${storedMappings.length} opgeslagen koppelingen gevonden` : "⚠️ Geen opgeslagen koppelingen gevonden — gebruik eerst AI matching."}
                  </span>
                </div>
              )}
            {/* Toolbar */}
              <div style={{ padding: "10px 14px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Producten selecteren</span>
                <Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoeken..." style={{ fontSize: 12, maxWidth: 180 }} />
                <Btn variant="secondary" size="sm" onClick={loadSourceProducts} disabled={loadingProducts}>↻ Herladen</Btn>
                <button onClick={() => setSelectedProducts(new Set(filteredProducts.map(p => p.id)))} style={{ padding: "5px 10px", background: "var(--s3)", border: "1px solid var(--b1)", borderRadius: "var(--rd)", fontSize: 11, cursor: "pointer" }}>Alles ✓</button>
                <button onClick={() => setSelectedProducts(new Set())} style={{ padding: "5px 10px", background: "var(--s3)", border: "1px solid var(--b1)", borderRadius: "var(--rd)", fontSize: 11, cursor: "pointer" }}>Alles ✗</button>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                  {loadingProducts && <span style={{ fontSize: 11, color: "var(--mx)" }}>Doelshop laden...</span>}
                  <Btn variant="primary" onClick={handleSync} disabled={syncing || loadingProducts || selectedProducts.size === 0 || (matchStrategy === "ai_name" && aiMatchLoading)}>
                    {syncing ? "Bezig..." : `🔄 Sync ${selectedProducts.size} product${selectedProducts.size !== 1 ? "en" : ""}`}
                  </Btn>
                </div>
              </div>

              {/* Column headers — two-sided */}
              <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 110px 18px 1fr 110px 72px", padding: "7px 14px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", fontSize: 10, fontWeight: 700, color: "var(--mx)", textTransform: "uppercase", letterSpacing: "0.04em", gap: 6, alignItems: "center" }}>
                <div onClick={() => {
                  const allIds = new Set(filteredProducts.map(p => p.id));
                  const allSelected = filteredProducts.every(p => selectedProducts.has(p.id));
                  setSelectedProducts(allSelected ? new Set() : allIds);
                }} style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 14, height: 14, border: `2px solid ${filteredProducts.length > 0 && filteredProducts.every(p => selectedProducts.has(p.id)) ? "var(--pr)" : "var(--b2)"}`, borderRadius: 3, background: filteredProducts.length > 0 && filteredProducts.every(p => selectedProducts.has(p.id)) ? "var(--pr)" : filteredProducts.some(p => selectedProducts.has(p.id)) ? "rgba(99,102,241,0.3)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {filteredProducts.length > 0 && filteredProducts.every(p => selectedProducts.has(p.id)) && <span style={{ color: "#fff", fontSize: 8, fontWeight: 700 }}>✓</span>}
                  </div>
                </div>
                <div>Bron — {sourceShop?.name}</div>
                <div style={{ fontSize: 9 }}>SKU / PRIJS</div>
                <div />
                <div>Doel — {targetShop?.name}</div>
                <div style={{ fontSize: 9 }}>SKU / VOORRAAD</div>
                <div style={{ textAlign: "right" }}>Status</div>
              </div>

              {loadingProducts ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "24px 16px", color: "var(--mx)", fontSize: 13 }}>
                  <div style={{ width: 16, height: 16, border: "2px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  Producten laden van beide shops...
                </div>
              ) : filteredProducts.length === 0 ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: "var(--mx)", fontSize: 13 }}>
                  {sourceProducts.length === 0 ? "Geen producten gevonden." : "Geen resultaten."}
                </div>
              ) : filteredProducts.map((p, i) => {
                const isSelected = selectedProducts.has(p.id);
                const preview    = previewMatch(p); // null = no match, undefined = unknown
                // Post-sync state
                const syncedItem   = syncedMap[p.id];
                const failedItem   = failedMap[p.id];
                const isUnmatched  = unmatchedSet.has(p.id);
                // Determine target to show: post-sync trumps preview
                const targetToShow = syncedItem
                  ? { name: syncedItem.target_name || "—", sku: syncedItem.target_sku || "" }
                  : preview;

                // Row status
                let rowStatus = null;
                if (hasSyncResult) {
                  if (syncedItem)  rowStatus = { icon: "✅", color: "var(--gr)",             label: "Gesync" };
                  else if (failedItem) rowStatus = { icon: "❌", color: "rgba(239,68,68,1)", label: "Fout" };
                  else if (isUnmatched) rowStatus = { icon: "—",  color: "var(--ac)",         label: "Geen match" };
                } else if (!isSelected && preview !== undefined) {
                  // Deselected by user → will be created in step 5
                  rowStatus = { icon: "✨", color: "var(--pr)", label: "Aanmaken" };
                } else if (preview === null) {
                  rowStatus = { icon: "?", color: "var(--ac)", label: "Geen match" };
                }

                const rowBg = syncedItem ? "rgba(34,197,94,0.04)"
                  : failedItem ? "rgba(239,68,68,0.04)"
                  : isUnmatched ? "rgba(245,158,11,0.04)"
                  : isSelected ? "rgba(99,102,241,0.03)" : "transparent";

                const aiMeta = getAiMeta(p);
                const confidencePct = aiMeta ? Math.round(aiMeta.confidence * 100) : null;
                const confidenceColor = confidencePct >= 90 ? "var(--gr)" : confidencePct >= 70 ? "var(--ac)" : "rgba(239,68,68,1)";
                const showOverrideDropdown = matchStrategy === "ai_name" && !hasSyncResult && !aiMatchLoading && (aiMatchResult !== null) && (!targetToShow || (aiMeta && aiMeta.confidence < 0.85 && !aiMeta.overridden));

                return (
                  <div key={p.id} style={{ borderBottom: i < filteredProducts.length - 1 ? "1px solid var(--b1)" : "none", background: rowBg }}>
                    <div onClick={() => toggleProduct(p.id)}
                      style={{ display: "grid", gridTemplateColumns: "32px 1fr 110px 18px 1fr 110px 72px", padding: "9px 14px", cursor: "pointer", alignItems: "center", gap: 6 }}>
                      {/* Checkbox */}
                      <div>
                        <div style={{ width: 15, height: 15, border: `2px solid ${isSelected ? "var(--pr)" : "var(--b2)"}`, borderRadius: 3, background: isSelected ? "var(--pr)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {isSelected && <span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>✓</span>}
                        </div>
                      </div>
                      {/* Source product */}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{p.name}</div>
                        {p.type === "variable" && <div style={{ fontSize: 10, color: "var(--mx)" }}>Variabel</div>}
                      </div>
                      {/* Source SKU + price */}
                      <div>
                        <div style={{ fontSize: 10, fontFamily: "monospace", color: "var(--dm)" }}>{p.sku || "—"}</div>
                        <div style={{ fontSize: 10, color: "var(--mx)" }}>€{p.regular_price || p.price || "—"}</div>
                      </div>
                      {/* Arrow */}
                      <div style={{ fontSize: 12, color: "var(--mx)", textAlign: "center" }}>→</div>
                      {/* Target product */}
                      <div>
                        {targetToShow ? (
                          <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3, color: syncedItem ? "var(--gr)" : "var(--tx)" }}>{targetToShow.name}</div>
                        ) : targetToShow === undefined ? (
                          <div style={{ fontSize: 11, color: "var(--mx)", fontStyle: "italic" }}>
                            {matchStrategy === "ai_name" && aiMatchLoading ? "⏳ AI analyseert..." :
                             matchStrategy === "ai_name" ? "Geen match gevonden" :
                             "Identifier — bepaald tijdens sync"}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: "var(--ac)", fontStyle: "italic" }}>Geen match gevonden</div>
                        )}
                        {/* AI reasoning tooltip */}
                        {aiMeta && !hasSyncResult && (
                          <div style={{ fontSize: 10, color: "var(--mx)", marginTop: 2 }}>{aiMeta.reasoning}</div>
                        )}
                      </div>
                      {/* Target SKU + confidence */}
                      <div>
                        {targetToShow ? (
                          <>
                            <div style={{ fontSize: 10, fontFamily: "monospace", color: "var(--dm)" }}>{targetToShow.sku || "—"}</div>
                            {confidencePct !== null && !hasSyncResult && (
                              <div style={{ fontSize: 10, fontWeight: 700, color: confidenceColor }}>{confidencePct}% match</div>
                            )}
                            {syncedItem && <div style={{ fontSize: 10, color: "var(--gr)" }}>✓ gesync</div>}
                          </>
                        ) : null}
                      </div>
                      {/* Row status badge */}
                      <div style={{ textAlign: "right" }}>
                        {rowStatus && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, color: rowStatus.color, background: `${rowStatus.color}18`, whiteSpace: "nowrap" }}>
                            {rowStatus.icon} {rowStatus.label}
                          </span>
                        )}
                        {!hasSyncResult && aiMeta?.overridden && (
                          <span style={{ fontSize: 10, color: "var(--pr)", display: "block", marginTop: 2 }}>✏ Handmatig</span>
                        )}
                      </div>
                    </div>
                    {/* Override dropdown for low-confidence or no AI match */}
                    {showOverrideDropdown && (
                      <div onClick={e => e.stopPropagation()} style={{ padding: "6px 14px 10px 56px", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, color: confidencePct !== null && confidencePct < 85 ? "var(--ac)" : "var(--mx)", flexShrink: 0 }}>
                          {confidencePct !== null && confidencePct < 85 ? "⚠️ Lage zekerheid — corrigeer:" : "➕ Handmatig koppelen:"}
                        </span>
                        <select
                          value={userOverrides[p.id] || ""}
                          onChange={e => {
                            const v = e.target.value;
                            setUserOverrides(o => v ? { ...o, [p.id]: parseInt(v) } : (({ [p.id]: _, ...rest }) => rest)(o));
                          }}
                          style={{ fontSize: 11, padding: "3px 6px", borderRadius: "var(--rd)", border: "1px solid var(--b1)", background: "var(--s3)", color: "var(--tx)", flex: 1, maxWidth: 320 }}>
                          <option value="">{targetToShow ? `Huidig: ${targetToShow.name}` : "— Selecteer doelproduct —"}</option>
                          {targetProducts.map(tp => (
                            <option key={tp.id} value={tp.id}>{tp.name} {tp.sku ? `[${tp.sku}]` : ""}</option>
                          ))}
                        </select>
                        {userOverrides[p.id] && (
                          <button onClick={() => setUserOverrides(o => (({ [p.id]: _, ...rest }) => rest)(o))}
                            style={{ fontSize: 11, background: "none", border: "none", color: "var(--mx)", cursor: "pointer", padding: "2px 4px" }}>✕</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Sync result summary */}
            {syncResult && (
              <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", fontWeight: 600, fontSize: 13 }}>📊 Synchronisatie resultaat</div>
                <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    {[
                      { label: "Gesynchroniseerd", val: syncResult.synced?.length ?? 0, color: "var(--gr)" },
                      { label: "Mislukt",           val: syncResult.failed?.length ?? 0, color: "rgba(239,68,68,1)" },
                      { label: "Geen match",        val: syncResult.unmatched?.length ?? 0, color: "var(--ac)" },
                    ].map(s => (
                      <div key={s.label} style={{ flex: 1, padding: "12px 14px", background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", textAlign: "center" }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
                        <div style={{ fontSize: 11, color: "var(--mx)", marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {syncResult.failed?.length > 0 && (
                    <div style={{ fontSize: 12, color: "rgba(239,68,68,1)" }}>
                      {syncResult.failed.map(f => <div key={f.id}>⚠ {f.name}: {f.error}</div>)}
                    </div>
                  )}
                  {syncResult.unmatched?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, color: "var(--ac)", fontWeight: 600, marginBottom: 6 }}>
                        {syncResult.unmatched.length} product(en) niet gevonden in doelshop.
                      </div>
                      <Btn variant="primary" size="sm" onClick={() => setStep(5)}>
                        ✨ Aanmaken in {targetShop?.name} →
                      </Btn>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Create-preview banner: no-match products + manually deselected products */}
            {toCreatePreview.length > 0 && !hasSyncResult && (() => {
              const knownNullCount  = sourceProducts.filter(p => !selectedProducts.has(p.id) ? false : previewMatch(p) === null).length;
              const deselectedCount = sourceProducts.filter(p => !selectedProducts.has(p.id)).length;
              const noMatchCount    = toCreatePreview.filter(p => previewMatch(p) === null && selectedProducts.has(p.id)).length;
              return (
                <div style={{ padding: "12px 16px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "var(--rd)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ac)" }}>
                      {toCreatePreview.length} product{toCreatePreview.length !== 1 ? "en" : ""} aanmaken in {targetShop?.name}
                    </span>
                    <div style={{ fontSize: 11, color: "var(--mx)", marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {noMatchCount > 0 && <span>• {noMatchCount} zonder match in doelshop</span>}
                      {deselectedCount > 0 && <span>• {deselectedCount} handmatig uitgevinkt</span>}
                    </div>
                  </div>
                  <Btn variant="primary" onClick={() => {
                    setSyncResult(sr => ({
                      ...(sr || {}),
                      synced: sr?.synced || [],
                      failed: sr?.failed || [],
                      unmatched: toCreatePreview.map(p => ({ id: p.id, name: p.name, sku: p.sku || "" })),
                    }));
                    setSelectedToCreate(new Set(toCreatePreview.map(p => p.id)));
                    setStep(5);
                  }}>
                    ✨ Aanmaken in {targetShop?.name} →
                  </Btn>
                </div>
              );
            })()}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Btn variant="secondary" onClick={() => setStep(3)}>← Terug naar strategie</Btn>
              <div style={{ display: "flex", gap: 8 }}>
                {syncResult && (
                  <Btn variant="secondary" onClick={() => { setSyncResult(null); loadSourceProducts(); }}>↻ Opnieuw synchen</Btn>
                )}
                {syncResult?.unmatched?.length > 0 ? (
                  <Btn variant="primary" onClick={() => setStep(5)}>✨ Aanmaken in {targetShop?.name} →</Btn>
                ) : syncResult ? (
                  <Btn variant="primary" onClick={() => setStep(1)}>✓ Klaar — nieuwe sync starten</Btn>
                ) : null}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── STEP 5: Create unmatched ───────────────────────────────────────────── */}
      {step === 5 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Language + translation config */}
          <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", fontWeight: 600, fontSize: 13 }}>
              ✨ Stap 5 — Producten aanmaken in {targetShop?.name}
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Language */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mx)", marginBottom: 6 }}>Doeltaal</div>
                  <select value={createConfig.lang_code}
                    onChange={e => {
                      const lang = SYNC_LANGUAGES.find(l => l.code === e.target.value);
                      setCreateConfig(c => ({ ...c, lang_code: e.target.value, language: lang?.lang || "Dutch" }));
                    }}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--rd)", border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--tx)", fontSize: 13 }}>
                    {SYNC_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mx)", marginBottom: 6 }}>Toon</div>
                  <select value={createConfig.tone} onChange={e => setCreateConfig(c => ({ ...c, tone: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--rd)", border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--tx)", fontSize: 13 }}>
                    <option value="formal">Formeel</option>
                    <option value="casual">Informeel</option>
                  </select>
                </div>
              </div>

              {/* Price markup */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mx)", marginBottom: 6 }}>Prijsopslag</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => setCreateConfig(c => ({ ...c, price_markup_pct: Math.max(-50, (c.price_markup_pct || 0) - 5) }))} style={{ width: 28, height: 28, borderRadius: "var(--rd)", border: "1px solid var(--b1)", background: "var(--s3)", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                  <div style={{ minWidth: 56, textAlign: "center", fontWeight: 700, fontSize: 15, color: (createConfig.price_markup_pct || 0) > 0 ? "var(--gr)" : (createConfig.price_markup_pct || 0) < 0 ? "rgba(239,68,68,1)" : "var(--mx)" }}>
                    {(createConfig.price_markup_pct || 0) > 0 ? "+" : ""}{createConfig.price_markup_pct || 0}%
                  </div>
                  <button onClick={() => setCreateConfig(c => ({ ...c, price_markup_pct: Math.min(200, (c.price_markup_pct || 0) + 5) }))} style={{ width: 28, height: 28, borderRadius: "var(--rd)", border: "1px solid var(--b1)", background: "var(--s3)", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                  {(createConfig.price_markup_pct || 0) !== 0 && <button onClick={() => setCreateConfig(c => ({ ...c, price_markup_pct: 0 }))} style={{ fontSize: 11, background: "none", border: "none", color: "var(--dm)", cursor: "pointer" }}>reset</button>}
                  <span style={{ fontSize: 11, color: "var(--mx)", marginLeft: 4 }}>wordt toegepast op reguliere prijs, actieprijs en alle WQM-prijstrappen</span>
                </div>
              </div>

              {/* Text generation mode */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mx)", marginBottom: 8 }}>Tekstgeneratie</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    { val: "literal",           icon: "🔤", label: "Letterlijk vertalen",         desc: "Exacte vertaling van naam, beschrijving en korte beschrijving. Geen herschrijving." },
                    { val: "translate_rewrite",  icon: "✏️", label: "Vertalen & herschrijven",     desc: "Vertaalt de inhoud en past de tekst natuurlijk aan voor de doelmarkt." },
                    { val: "seo_write",          icon: "🚀", label: "SEO-geoptimaliseerde tekst schrijven", desc: "AI schrijft een volledige, unieke productbeschrijving op basis van productnaam en attributen." },
                  ].map(opt => (
                    <div key={opt.val}>
                      <label style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", borderRadius: createConfig.text_mode === opt.val && opt.val === "seo_write" ? "var(--rd) var(--rd) 0 0" : "var(--rd)", border: `1px solid ${createConfig.text_mode === opt.val ? "var(--pr)" : "var(--b1)"}`, background: createConfig.text_mode === opt.val ? "rgba(99,102,241,0.06)" : "var(--s3)", cursor: "pointer", borderBottom: createConfig.text_mode === opt.val && opt.val === "seo_write" ? "none" : undefined }}>
                        <input type="radio" name="text_mode" value={opt.val} checked={createConfig.text_mode === opt.val} onChange={() => setCreateConfig(c => ({ ...c, text_mode: opt.val }))} style={{ marginTop: 3, accentColor: "var(--pr)", flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{opt.icon} {opt.label}</div>
                          <div style={{ fontSize: 11, color: "var(--mx)", marginTop: 2 }}>{opt.desc}</div>
                        </div>
                      </label>
                      {/* SEO write sub-options */}
                      {opt.val === "seo_write" && createConfig.text_mode === "seo_write" && (
                        <div style={{ padding: "12px 14px 14px", background: "rgba(99,102,241,0.04)", border: "1px solid var(--pr)", borderTop: "none", borderRadius: "0 0 var(--rd) var(--rd)", display: "flex", flexDirection: "column", gap: 10 }}>
                          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                              <input type="checkbox" checked={createConfig.seo_use_headers} onChange={e => setCreateConfig(c => ({ ...c, seo_use_headers: e.target.checked }))} style={{ accentColor: "var(--pr)" }} />
                              Gebruik headers (H2, H3, H4)
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                              <input type="checkbox" checked={createConfig.seo_add_lists} onChange={e => setCreateConfig(c => ({ ...c, seo_add_lists: e.target.checked }))} style={{ accentColor: "var(--pr)" }} />
                              Voeg lijsten toe
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                              <span style={{ color: "var(--mx)" }}>Aantal woorden:</span>
                              <input type="number" min={100} max={4500} step={100} value={createConfig.seo_word_count}
                                onChange={e => setCreateConfig(c => ({ ...c, seo_word_count: Math.min(4500, Math.max(100, parseInt(e.target.value) || 600)) }))}
                                style={{ width: 80, padding: "3px 6px", borderRadius: "var(--rd)", border: "1px solid var(--b1)", background: "var(--s2)", color: "var(--tx)", fontSize: 12 }} />
                              <span style={{ fontSize: 11, color: "var(--dm)" }}>/ 4500</span>
                            </label>
                          </div>
                          {/* Custom parameters */}
                          <div>
                            <div style={{ fontSize: 11, color: "var(--mx)", marginBottom: 6 }}>Aangepaste instructies (max. 5):</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              {(createConfig.seo_custom_params || []).map((param, i) => (
                                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <input value={param} onChange={e => setCreateConfig(c => { const p = [...c.seo_custom_params]; p[i] = e.target.value; return { ...c, seo_custom_params: p }; })}
                                    placeholder={`Instructie ${i + 1}...`}
                                    style={{ flex: 1, padding: "5px 8px", borderRadius: "var(--rd)", border: "1px solid var(--b1)", background: "var(--s2)", color: "var(--tx)", fontSize: 12 }} />
                                  <button onClick={() => setCreateConfig(c => ({ ...c, seo_custom_params: c.seo_custom_params.filter((_, j) => j !== i) }))}
                                    style={{ padding: "4px 8px", borderRadius: "var(--rd)", border: "1px solid var(--b2)", background: "none", cursor: "pointer", color: "var(--dm)", fontSize: 12 }}>✕</button>
                                </div>
                              ))}
                              {(createConfig.seo_custom_params || []).length < 5 && (
                                <button onClick={() => setCreateConfig(c => ({ ...c, seo_custom_params: [...(c.seo_custom_params || []), ""] }))}
                                  style={{ alignSelf: "flex-start", padding: "5px 12px", borderRadius: "var(--rd)", border: "1px dashed var(--pr)", background: "none", color: "var(--pr)", fontSize: 12, cursor: "pointer" }}>
                                  + Instructie toevoegen
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Meta + SEO options */}
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={createConfig.translate_meta} onChange={e => setCreateConfig(c => ({ ...c, translate_meta: e.target.checked }))} style={{ accentColor: "var(--pr)" }} />
                  Meta titel &amp; beschrijving genereren
                </label>
              </div>

              {/* Image mode */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mx)", marginBottom: 8 }}>Afbeeldingen</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    {
                      val: "translate",
                      label: "Kopiëren — SEO-bestandsnaam op basis van productnaam",
                      desc: "Afbeeldingen worden via WooCommerce sideloaded met een SEO-bestandsnaam. Snel, geen AI nodig.",
                      icon: "🔤",
                    },
                    {
                      val: "ai_vision",
                      label: "AI Vision — bestandsnaam + alt-tekst via beeldanalyse",
                      desc: "Gemini scant elke afbeelding en genereert een beschrijvende SEO-bestandsnaam, alt-tekst en titel in de doeltaal.",
                      icon: "👁️",
                    },
                    {
                      val: "generate",
                      label: "AI Genereren — aanpassen aan afmetingen doelshop",
                      desc: "Gemini hergenereerd de afbeelding in het exacte formaat en de afmetingen van de doelshop. Ideaal wanneer de shops verschillende beeldverhoudingen gebruiken.",
                      icon: "✨",
                    },
                  ].map(opt => (
                    <div key={opt.val}>
                      <label style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", borderRadius: createConfig.image_mode === opt.val && opt.val === "generate" ? "var(--rd) var(--rd) 0 0" : "var(--rd)", border: `1px solid ${createConfig.image_mode === opt.val ? "var(--pr)" : "var(--b1)"}`, background: createConfig.image_mode === opt.val ? "rgba(99,102,241,0.06)" : "var(--s3)", cursor: "pointer", borderBottom: createConfig.image_mode === opt.val && opt.val === "generate" ? "none" : undefined }}>
                        <input type="radio" name="image_mode" value={opt.val} checked={createConfig.image_mode === opt.val} onChange={() => setCreateConfig(c => ({ ...c, image_mode: opt.val }))} style={{ marginTop: 3, accentColor: "var(--pr)", flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{opt.icon} {opt.label}</div>
                          <div style={{ fontSize: 11, color: "var(--mx)", marginTop: 3 }}>{opt.desc}</div>
                        </div>
                      </label>
                      {/* Sub-options for generate mode */}
                      {opt.val === "generate" && createConfig.image_mode === "generate" && (
                        <div style={{ padding: "10px 14px 12px", background: "rgba(99,102,241,0.04)", border: "1px solid var(--pr)", borderTop: "none", borderRadius: "0 0 var(--rd) var(--rd)", display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ fontSize: 11, color: "var(--mx)", marginBottom: 4 }}>Welke afmetingen gebruiken?</div>
                          {[
                            { val: "woosyncshop", label: "WooSyncShop standaard", desc: "800×800px vierkant, ideaal voor de meeste shops." },
                            { val: "target_shop", label: `Detecteer van ${targetShop?.name || "doelshop"}`, desc: "Haal de exacte afmetingen op van een bestaand product in de doelshop en gebruik die als doel." },
                          ].map(sz => (
                            <label key={sz.val} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", padding: "7px 10px", borderRadius: "var(--rd)", background: createConfig.image_generate_size === sz.val ? "rgba(99,102,241,0.1)" : "transparent", border: `1px solid ${createConfig.image_generate_size === sz.val ? "rgba(99,102,241,0.4)" : "var(--b1)"}` }}>
                              <input type="radio" name="image_generate_size" value={sz.val} checked={createConfig.image_generate_size === sz.val} onChange={() => setCreateConfig(c => ({ ...c, image_generate_size: sz.val }))} style={{ marginTop: 2, accentColor: "var(--pr)", flexShrink: 0 }} />
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600 }}>{sz.label}</div>
                                <div style={{ fontSize: 11, color: "var(--mx)" }}>{sz.desc}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* SKU mode */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mx)", marginBottom: 8 }}>SKU generatie methode</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { val: "lang_prefix", label: "Taalcode + originele SKU", example: `${createConfig.lang_code}-NBP-10L-100CM` },
                    { val: "lang_random", label: "Taalcode + 7-cijferig willekeurig", example: `${createConfig.lang_code}-3847291` },
                    { val: "category_initials", label: "Initialen primaire categorie + teller", example: "FA-1001, FNBP-2001, FA-1002" },
                    { val: "identifier", label: "Zelfde waarde als identifier attribuut (verborgen)", example: "Originele SKU als hidden attribuut" },
                  ].map(opt => (
                    <label key={opt.val} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: "var(--rd)", border: `1px solid ${createConfig.sku_mode === opt.val ? "var(--pr)" : "var(--b1)"}`, background: createConfig.sku_mode === opt.val ? "rgba(99,102,241,0.06)" : "var(--s3)", cursor: "pointer" }}>
                      <input type="radio" name="sku_mode" value={opt.val} checked={createConfig.sku_mode === opt.val} onChange={() => setCreateConfig(c => ({ ...c, sku_mode: opt.val }))} style={{ accentColor: "var(--pr)" }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{opt.label}</div>
                        <div style={{ fontSize: 11, color: "var(--dm)", fontFamily: "monospace" }}>{opt.example}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Product selection for create */}
          <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Ontbrekende producten — selecteer om aan te maken</span>
              <button onClick={() => setSelectedToCreate(new Set((syncResult?.unmatched || []).map(p => p.id)))} style={{ marginLeft: "auto", padding: "5px 10px", background: "var(--s3)", border: "1px solid var(--b1)", borderRadius: "var(--rd)", fontSize: 11, cursor: "pointer" }}>Alles ✓</button>
              <button onClick={() => setSelectedToCreate(new Set())} style={{ padding: "5px 10px", background: "var(--s3)", border: "1px solid var(--b1)", borderRadius: "var(--rd)", fontSize: 11, cursor: "pointer" }}>Alles ✗</button>
            </div>
            <div>
              {(syncResult?.unmatched || []).map((p, i) => {
                const on = selectedToCreate.has(p.id);
                return (
                  <div key={p.id} onClick={() => toggleCreate(p.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: i < (syncResult.unmatched.length - 1) ? "1px solid var(--b1)" : "none", background: on ? "rgba(99,102,241,0.03)" : "transparent", cursor: "pointer" }}>
                    <div style={{ width: 15, height: 15, border: `2px solid ${on ? "var(--pr)" : "var(--b2)"}`, borderRadius: 3, background: on ? "var(--pr)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {on && <span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--dm)" }}>{p.sku || "geen SKU"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Create result */}
          {createResult && (
            <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", fontWeight: 600, fontSize: 13 }}>📊 Resultaat aanmaken</div>
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 14 }}>
                  <div style={{ flex: 1, padding: "12px 14px", background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "var(--gr)" }}>{createResult.created?.length ?? 0}</div>
                    <div style={{ fontSize: 11, color: "var(--mx)", marginTop: 2 }}>Aangemaakt</div>
                  </div>
                  <div style={{ flex: 1, padding: "12px 14px", background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "var(--re)" }}>{createResult.failed?.length ?? 0}</div>
                    <div style={{ fontSize: 11, color: "var(--mx)", marginTop: 2 }}>Mislukt</div>
                  </div>
                </div>
                {createResult.created?.length > 0 && (
                  <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                    {createResult.created.map(c => (
                      <div key={c.target_id} style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--gr)" }}>
                        ✓ <span style={{ color: "var(--tx)" }}>{c.target_name}</span>
                        <span style={{ fontFamily: "monospace", color: "var(--dm)" }}>SKU: {c.target_sku}</span>
                        {c.ean && <span style={{ fontFamily: "monospace", color: "var(--ac)" }}>EAN: {c.ean}</span>}
                        <span style={{ fontSize: 10, background: "var(--s3)", padding: "2px 6px", borderRadius: 4, color: "var(--mx)" }}>concept</span>
                      </div>
                    ))}
                  </div>
                )}
                {createResult.failed?.length > 0 && (
                  <div style={{ fontSize: 12, color: "var(--re)" }}>
                    {createResult.failed.map(f => <div key={f.source_id}>⚠ {f.name}: {f.error}</div>)}
                  </div>
                )}
                {createResult.seo_plugin && (
                  <div style={{ fontSize: 11, color: "var(--mx)" }}>SEO plugin gedetecteerd: {createResult.seo_plugin === "rankmath" ? "Rank Math" : "Yoast"}</div>
                )}
              </div>
            </div>
          )}

          {/* Progress bar shown while creating */}
          {creating && (
            <div style={{ padding: "14px 16px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "var(--rd)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)" }}>
                    {createProgress.total === 0 ? "🚀 Job starten..." :
                     createProgress.done === 0 ? "⏳ Voorbereiden (attributen, SEO plugin detectie)..." :
                     createProgress.current ? `🔄 Bezig: ${createProgress.current}` :
                     "✅ Afronden..."}
                  </div>
                  {createProgress.done > 0 && createProgress.total > 0 && (
                    <div style={{ fontSize: 11, color: "var(--mx)", marginTop: 2 }}>
                      {createProgress.done} van {createProgress.total} producten aangemaakt
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--pr)", flexShrink: 0 }}>
                  {createProgress.total > 0 ? `${createProgress.done}/${createProgress.total}` : "..."}
                </span>
              </div>
              {createProgress.total > 0 && (
                <div style={{ height: 8, background: "var(--b2)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: `linear-gradient(90deg, var(--pr), var(--pr-h))`, borderRadius: 4, transition: "width 0.5s ease", width: `${Math.round((createProgress.done / createProgress.total) * 100)}%` }} />
                </div>
              )}
              <div style={{ fontSize: 10, color: "var(--dm)", marginTop: 6 }}>
                Verwerking verloopt op de server — dit venster open houden tot voltooiing.
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Btn variant="secondary" onClick={() => setStep(4)} disabled={creating}>← Terug naar sync resultaat</Btn>
            <Btn variant="primary" onClick={handleCreate} disabled={creating || selectedToCreate.size === 0}>
              {creating
                ? `⏳ ${createProgress.done}/${createProgress.total} aangemaakt...`
                : `✨ ${selectedToCreate.size} product${selectedToCreate.size !== 1 ? "en" : ""} aanmaken in ${targetShop?.name}`}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Trial Banner ─────────────────────────────────────────────────────────────
const TrialBanner = ({ userProfile, onUpgrade }) => {
  if (!userProfile) return null;
  const plan = userProfile.plan;

  if (plan === "trial") {
    const endsAt = userProfile.trial_ends_at ? new Date(userProfile.trial_ends_at) : null;
    const daysLeft = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / (1000 * 60 * 60 * 24))) : 7;
    const isUrgent = daysLeft <= 2;
    return (
      <div style={{ background: isUrgent ? "linear-gradient(90deg,rgba(239,68,68,0.1),rgba(239,68,68,0.05))" : "linear-gradient(90deg,rgba(99,102,241,0.1),rgba(99,102,241,0.05))", borderBottom: `1px solid ${isUrgent ? "rgba(239,68,68,0.3)" : "rgba(99,102,241,0.25)"}`, padding: "8px 20px", display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: isUrgent ? "var(--re)" : "var(--pr-h)" }}>
          {isUrgent ? "⚠" : "⏳"} Proefperiode: nog {daysLeft} dag{daysLeft !== 1 ? "en" : ""} gratis
        </span>
        <span style={{ color: "var(--mx)" }}>Je wordt na je proefperiode automatisch gefactureerd tenzij je annuleert.</span>
        <Btn variant="primary" size="sm" onClick={onUpgrade} style={{ marginLeft: "auto", padding: "4px 14px", fontSize: 11 }}>
          Abonneer nu — €7,99/m →
        </Btn>
      </div>
    );
  }

  if (plan === "trial_expired") {
    return (
      <div style={{ background: "linear-gradient(90deg,rgba(239,68,68,0.15),rgba(239,68,68,0.05))", borderBottom: "1px solid rgba(239,68,68,0.4)", padding: "10px 20px", display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: "var(--re)" }}>🔒 Proefperiode verlopen</span>
        <span style={{ color: "var(--mx)" }}>Kies een abonnement om weer volledig toegang te krijgen tot je shops.</span>
        <Btn variant="primary" size="sm" onClick={onUpgrade} style={{ marginLeft: "auto", padding: "4px 14px", fontSize: 11, background: "var(--re)", boxShadow: "none" }}>
          Abonnement kiezen →
        </Btn>
      </div>
    );
  }

  return null;
};

// ─── User Dashboard ────────────────────────────────────────────────────────────
const VALID_VIEWS = ["products", "connected", "voorraad", "hreflang", "marketing", "analytics", "settings"];

const Dashboard = ({ user, onLogout, onPaymentWall, onHowItWorks, profileRefreshKey = 0 }) => {
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
  const [dupProduct, setDupProduct] = useState(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [notification, setNotification] = useState(null);
  const [promptSettings, setPromptSettings] = useState({});
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const productsCacheRef = useRef({});

  // Per-shop cache: attributes (with terms) + categories
  const [shopCache, setShopCache] = useState({}); // { [shopId]: { attributes: [], categories: [], loaded: false } }
  const liveCategories = shopCache[activeSite?.id]?.categories || [];

  // ── Session-level caches (survive tab switches, cleared on logout) ──
  const [couponCache, setCouponCache] = useState({}); // { [shopId]: { rows, loadedAt } }
  const [analyticsCache, setAnalyticsCache] = useState(null); // { data, insights, range, shopId, loadedAt }

  // getToken imported from supabase.js — no local wrapper

  const wooCall = async (shopId, endpoint, method = "GET", data = null) => {
    const token = await getToken();
    const res = await fetch("/api/woo", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ shop_id: shopId, endpoint, method, data }),
    });
    if (!res.ok) {
      let errMsg = `WooCommerce ${method} ${endpoint} mislukt: HTTP ${res.status}`;
      try { const e = await res.json(); errMsg = e?.message || e?.error || errMsg; } catch {}
      throw new Error(errMsg);
    }
    try { return await res.json(); } catch { return {}; }
  };

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const [userProfile, setUserProfile] = useState(null);
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("user_profiles").select("plan, trial_ends_at, full_name, max_shops, max_connected_products").eq("id", user.id).single()
      .then(({ data, error }) => {
        if (data) setUserProfile(data);
        // 400 can occur if trial_ends_at column doesn't exist yet — fall back gracefully
        if (error) supabase.from("user_profiles").select("plan, full_name, max_shops, max_connected_products").eq("id", user.id).single()
          .then(({ data: d2 }) => { if (d2) setUserProfile(d2); });
      });
  }, [user?.id, profileRefreshKey]);

  // Load shops from Supabase on mount
  useEffect(() => {
    if (!user?.id) { setShopsLoading(false); return; }
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
  }, [user?.id]);

  // Load products + shop metadata (attributes, categories) when active shop changes
  const refreshProducts = async () => {
    if (!activeSite) return;
    const shopId = activeSite.id;
    delete productsCacheRef.current[shopId];
    setProductsLoading(true);
    try {
      const data = await wooCall(shopId, "products?per_page=100&orderby=date&order=desc");
      if (Array.isArray(data)) {
        const mapped = data.map(p => ({ ...p, pending_changes: {}, featured_image: p.images?.[0]?.src || null }));
        productsCacheRef.current[shopId] = mapped;
        setProducts(mapped);
      } else { setProducts([]); }
    } catch (e) { notify("Producten laden mislukt: " + e.message, "error"); setProducts([]); }
    finally { setProductsLoading(false); }
  };

  useEffect(() => {
    if (!activeSite) return;
    // Skip API calls for plugin-mode shops that haven't been connected yet (no credentials)
    if (!activeSite.consumer_key || !activeSite.consumer_secret) {
      setProducts([]);
      setProductsLoading(false);
      return;
    }
    const shopId = activeSite.id;

    const loadProducts = async () => {
      // Serve from cache if available
      if (productsCacheRef.current[shopId]) {
        setProducts(productsCacheRef.current[shopId]);
        return;
      }
      setProductsLoading(true);
      try {
        const data = await wooCall(shopId, "products?per_page=100&orderby=date&order=desc");
        if (Array.isArray(data)) {
          const mapped = data.map(p => ({ ...p, pending_changes: {}, featured_image: p.images?.[0]?.src || null }));
          productsCacheRef.current[shopId] = mapped;
          setProducts(mapped);
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
        // Fetch attributes + categories in parallel
        const [rawAttrs, rawCats] = await Promise.all([
          wooCall(shopId, "products/attributes?per_page=100"),
          wooCall(shopId, "products/categories?per_page=100&hide_empty=false"),
        ]);

        const attrs = Array.isArray(rawAttrs) ? rawAttrs : [];
        const cats  = Array.isArray(rawCats)  ? rawCats  : [];

        // ✅ Set categories immediately — don't wait for attribute terms
        setShopCache(prev => ({
          ...prev,
          [shopId]: { attributes: attrs, categories: cats, loaded: true },
        }));

        // Fetch attribute terms in background (sequential to avoid WC overload)
        const attrsWithTerms = [];
        for (const attr of attrs) {
          try {
            const terms = await wooCall(shopId, `products/attributes/${attr.id}/terms?per_page=100`);
            attrsWithTerms.push({ ...attr, terms: Array.isArray(terms) ? terms.map(t => t.name) : [] });
          } catch {
            attrsWithTerms.push({ ...attr, terms: [] });
          }
        }

        // Update cache again with full attribute terms (categories already visible)
        setShopCache(prev => ({
          ...prev,
          [shopId]: { ...prev[shopId], attributes: attrsWithTerms },
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
    // Only switch active site if the shop already has credentials.
    // Plugin-mode shops start without CK/CS — switching to them triggers 401s.
    if (newShop.consumer_key && newShop.consumer_secret) {
      setActiveSite(newShop);
    }
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

  // Publish a product instantly (update local state, no reload needed)
  const handleCategoryChange = async (product, catId) => {
    try {
      const cat = liveCategories.find(c => c.id === catId);
      if (!cat) return;
      await wooCall(activeSite?.id, `products/${product.id}`, "PUT", { categories: [{ id: catId }] });
      // Update local state + cache
      setProducts(prev => {
        const updated = prev.map(p => p.id === product.id ? { ...p, categories: [{ id: catId, name: cat.name, slug: cat.slug }] } : p);
        if (activeSite?.id) productsCacheRef.current[activeSite.id] = updated;
        return updated;
      });
    } catch (e) { notify("Categorie wijzigen mislukt: " + e.message, "error"); }
  };

  const handlePublish = async (productId) => {
    try {
      await wooCall(activeSite?.id, `products/${productId}`, "PUT", { status: "publish" });
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, status: "publish" } : p));
      // Update cache too
      if (activeSite?.id && productsCacheRef.current[activeSite.id]) {
        productsCacheRef.current[activeSite.id] = productsCacheRef.current[activeSite.id].map(p =>
          p.id === productId ? { ...p, status: "publish" } : p
        );
      }
      notify("Product gepubliceerd ✓");
    } catch (e) { notify("Publiceren mislukt: " + e.message, "error"); }
  };

  // Load + save prompt settings from user_profiles
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("user_profiles").select("prompt_settings").eq("id", user.id).single()
      .then(({ data }) => { if (data?.prompt_settings) setPromptSettings(data.prompt_settings); });
  }, [user?.id]);

  const savePromptSettings = async (settings) => {
    setPromptSettings(settings);
    await supabase.from("user_profiles").update({ prompt_settings: settings }).eq("id", user.id);
    notify("AI prompt instellingen opgeslagen ✓");
  };

  const pendingCount = products.reduce((sum, p) => sum + Object.keys(p.pending_changes || {}).length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)" }}>
      <TopNav
        activeSite={activeSite} setActiveSite={setActiveSite}
        sites={shops} activeView={activeView} setActiveView={setActiveView}
        pendingCount={pendingCount} isAdmin={false}
        onLogout={onLogout} user={user}
        onHowItWorks={onHowItWorks}
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
      <TrialBanner
        userProfile={userProfile}
        onUpgrade={() => setActiveView("settings")}
      />
      <div className="dashboard-content">
        {shopsLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 16 }}>
            <div style={{ width: 32, height: 32, border: "3px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <span style={{ color: "var(--mx)", fontSize: 13 }}>Shops laden...</span>
          </div>
        ) : shops.length === 0 && activeView !== "settings" ? (
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
                <ProductsTable products={products} onEdit={p => { setEditProduct(p); setEditOpen(true); }} onConnect={() => setActiveView("connected")} activeSite={activeSite}
                  onDuplicate={p => { setDupProduct(p); setDupOpen(true); }}
                  onPublish={handlePublish}
                  onRefresh={refreshProducts}
                  onPromptSettings={() => setPromptModalOpen(true)}
                  liveCategories={liveCategories}
                  shopCategories={liveCategories}
                  onCategoryChange={handleCategoryChange}
                  onStockSync={async (product) => {
                    if (!product.sku) return alert("Product heeft geen SKU — sync niet mogelijk.");
                    if (!confirm(`Voorraad van "${product.name}" (${product.stock_quantity ?? 0} stuks) synchroniseren naar alle andere shops?`)) return;
                    const token = await getToken();
                    const res = await fetch("/api/stock-sync", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                      body: JSON.stringify({ source_shop_id: activeSite.id, products: [{ sku: product.sku, stock_quantity: product.stock_quantity, manage_stock: product.manage_stock }] }),
                    });
                    const data = await res.json();
                    if (data.synced > 0) notify(`✓ Voorraad gesynchroniseerd naar ${data.shops_updated?.map(s => s.name).join(", ")}`);
                    else notify("Geen shops gevonden met dit SKU", "error");
                  }} />
              )
            )}
            {activeView === "connected" && <ConnectedSitesView products={products} sites={shops} activeSite={activeSite} wooCall={wooCall} />}
            {activeView === "voorraad" && <StockSyncView shops={shops} user={user} activeSite={activeSite} wooCall={wooCall} />}
            {activeView === "hreflang" && <HreflangView sites={shops} />}
            {activeView === "marketing" && <MarketingView activeSite={activeSite} shops={shops} user={user} couponCache={couponCache} onCouponCacheUpdate={setCouponCache} />}
            {activeView === "analytics" && <AnalyticsView shops={shops} user={user} analyticsCache={analyticsCache} onAnalyticsCacheUpdate={setAnalyticsCache} />}
          </>
        )}
        {activeView === "settings" && (
          <SettingsView
            user={user} shops={shops}
            onShopAdded={handleShopAdded}
            onShopUpdated={handleShopUpdated}
            onShopDeleted={handleShopDeleted}
            profileRefreshKey={profileRefreshKey} />
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

          // WQM meta_data (save if shop has WQM)
          if (updated.wqm_tiers !== undefined || updated.wqm_settings !== undefined) {
            const tierType = updated.wqm_settings?.tiered_pricing_type || updated.wqm_tier_type || 'fixed';
            // Normalise price: accept both "16,89" (Dutch) and "16.89" before converting to Number
            const parseWqmPrice = (v) => parseFloat(String(v ?? '').replace(',', '.')) || 0;
            const tiersToSave = (updated.wqm_tiers || [])
              .filter(t => t.qty)
              // amt must be a float NUMBER (not string) — WQM's frontend JS does arithmetic on it.
              // Sort descending by qty: WQM JS walks top-to-bottom and takes first entry where
              // qty <= currentQty. Ascending order would always match the first (lowest) tier.
              .map(t => ({ qty: Number(t.qty), amt: parseFloat(parseWqmPrice(t.price).toFixed(2)) }))
              .sort((a, b) => b.qty - a.qty);

            // Preserve ALL original _wqm_settings fields — only override the ones we explicitly manage.
            // Writing only a fixed subset would silently delete any WQM field we don't know about,
            // and converting absent values to '' can corrupt max_qty / min_qty enforcement.
            const origSettings = updated.wqm_settings || {};
            const settingsToSave = {
              ...origSettings,                           // keep every original key intact
              step_interval: updated.wqm_settings?.step || origSettings.step_interval || '',
              qty_design_tiers: updated.wqm_settings?.dyo_rows ?? origSettings.qty_design_tiers ?? [],
            };
            // Remove UI-only aliases that must NOT be written to WooCommerce meta
            delete settingsToSave.step;
            delete settingsToSave.dyo_rows;
            delete settingsToSave.tiered_pricing_type;

            // Step 1: write tiers + settings only — do NOT include _price here.
            // Step 2 (dummy touch below) calls WC_Product::save() which resets _price = regular_price.
            // Step 3 (after dummy touch) writes _price = firstTierPrice so it wins last.
            const firstTierPrice = tiersToSave.length > 0
              ? [...tiersToSave].sort((a, b) => a.qty - b.qty)[0].amt
              : null;

            payload.meta_data = [
              { key: '_wqm_tiers',    value: tiersToSave.length > 0 ? { type: tierType, tiers: tiersToSave } : null },
              { key: '_wqm_settings', value: settingsToSave },
              // _price intentionally omitted here — written in step 3 after dummy touch
            ];

          }

          // Primary category term (Yoast + RankMath)
          if (updated._primaryCatId !== undefined) {
            const pid = updated._primaryCatId ? String(updated._primaryCatId) : "";
            const primMeta = [
              { key: "_yoast_wpseo_primary_product_cat", value: pid },
              { key: "rank_math_primary_product_cat",    value: pid },
            ];
            payload.meta_data = [...(payload.meta_data || []), ...primMeta];
          }

          // PUT the main product (step 1: writes _wqm_tiers + _wqm_settings)
          await wooCall(shopId, `products/${updated.id}`, "PUT", payload);

          // Step 2: dummy touch — triggers WC_Product::save() → clears transients, but also
          // resets _price = regular_price (which is wrong for WQM dynamic pricing).
          // Step 3: immediately overwrite _price with first tier amount so it wins.
          if (updated.wqm_tiers !== undefined || updated.wqm_settings !== undefined) {
            const tierType2 = updated.wqm_settings?.tiered_pricing_type || updated.wqm_tier_type || 'fixed';
            const parseP = (v) => parseFloat(String(v ?? '').replace(',', '.')) || 0;
            const tiersForPrice = (updated.wqm_tiers || []).filter(t => t.qty)
              .map(t => ({ qty: Number(t.qty), amt: parseFloat(parseP(t.price).toFixed(2)) }))
              .sort((a, b) => b.qty - a.qty);
            const firstTierAmt = tiersForPrice.length > 0
              ? [...tiersForPrice].sort((a, b) => a.qty - b.qty)[0].amt
              : null;
            // Step 2: dummy touch (clears transients + WC save pipeline)
            await wooCall(shopId, `products/${updated.id}`, "PUT", { status: updated.status || "publish" });
            // Step 3: force _price = first tier amt (WQM JS uses _price as base for qty-based updates)
            if (firstTierAmt !== null && tierType2 === 'fixed') {
              await wooCall(shopId, `products/${updated.id}`, "PUT", {
                meta_data: [{ key: '_price', value: firstTierAmt }],
              });
            }
          }

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
              // WQM variation meta — 3-step save: tiers → dummy touch → _price
              // Same pattern as simple product: dummy touch (step 2) resets _price = regular_price,
              // so _price must be written as a separate final PUT (step 3) to win.
              if (v.wqm_tiers !== undefined || v.wqm_settings !== undefined) {
                const vTierType = v.wqm_settings?.tiered_pricing_type || v.wqm_tier_type || 'fixed';
                const parseWqmPrice = (val) => parseFloat(String(val ?? '').replace(',', '.')) || 0;
                const vTiers = (v.wqm_tiers || []).filter(t => t.qty).map(t => ({ qty: Number(t.qty), amt: parseFloat(parseWqmPrice(t.price).toFixed(2)) })).sort((a, b) => b.qty - a.qty);
                const vOrigSettings = v.wqm_settings || {};
                const vSettings = { ...vOrigSettings, step_interval: v.wqm_settings?.step || vOrigSettings.step_interval || '', qty_design_tiers: v.wqm_settings?.dyo_rows ?? vOrigSettings.qty_design_tiers ?? [] };
                delete vSettings.step; delete vSettings.dyo_rows; delete vSettings.tiered_pricing_type;
                // _price intentionally omitted — written in step 3
                varPayload.meta_data = [
                  { key: '_wqm_tiers', value: vTiers.length > 0 ? { type: vTierType, tiers: vTiers } : null },
                  { key: '_wqm_settings', value: vSettings },
                ];
                const vFirstAmt = vTiers.length > 0 ? [...vTiers].sort((a,b) => a.qty - b.qty)[0].amt : null;
                const vStatus = v.enabled === false ? "private" : "publish";
                return (
                  // Step 1: write tiers + settings
                  wooCall(shopId, `products/${updated.id}/variations/${v.id}`, "PUT", varPayload)
                  // Step 2: dummy touch — clears transients, WC resets _price = regular_price
                  .then(() => wooCall(shopId, `products/${updated.id}/variations/${v.id}`, "PUT", { status: vStatus }))
                  // Step 3: force _price = first tier amt (overrides WC's reset)
                  .then(() => vFirstAmt !== null && vTierType === 'fixed'
                    ? wooCall(shopId, `products/${updated.id}/variations/${v.id}`, "PUT", { meta_data: [{ key: '_price', value: vFirstAmt }] })
                    : Promise.resolve()
                  )
                );
              }
              return wooCall(shopId, `products/${updated.id}/variations/${v.id}`, "PUT", varPayload);
            });
            await Promise.all(varPromises);
          }

          // Merge primary cat into meta_data for immediate reflection in product list
          const pid = updated._primaryCatId ? String(updated._primaryCatId) : "";
          const mergedMeta = [
            ...(updated.meta_data || []).filter(m => m.key !== "_yoast_wpseo_primary_product_cat" && m.key !== "rank_math_primary_product_cat"),
            { key: "_yoast_wpseo_primary_product_cat", value: pid },
            { key: "rank_math_primary_product_cat",    value: pid },
          ];
          const { _primaryCatId: _removed, ...updatedClean } = updated;
          const updatedFinal = { ...updatedClean, meta_data: mergedMeta, pending_changes: {} };

          // Update local state
          setProducts(prev => prev.map(p => p.id === updated.id ? updatedFinal : p));
          // Keep cache in sync
          if (activeSite?.id && productsCacheRef.current[activeSite.id]) {
            productsCacheRef.current[activeSite.id] = productsCacheRef.current[activeSite.id].map(p =>
              p.id === updated.id ? updatedFinal : p
            );
          }
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

      <PromptSettingsModal
        open={promptModalOpen}
        onClose={() => setPromptModalOpen(false)}
        promptSettings={promptSettings}
        onSave={savePromptSettings}
      />
      <DuplicateProductModal
        product={dupProduct}
        open={dupOpen}
        onClose={() => { setDupOpen(false); setDupProduct(null); }}
        wooCall={(_, endpoint, method, data) => wooCall(activeSite?.id, endpoint, method, data)}
        activeSite={activeSite}
        promptSettings={promptSettings}
        onCreated={() => refreshProducts()}
      />

      {notification && (
        <div style={{ position: "fixed", bottom: 24, right: 24, padding: "12px 20px", background: notification.type === "success" ? "var(--gr)" : "var(--re)", color: "#fff", borderRadius: "var(--rd-lg)", fontSize: 13, fontWeight: 500, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 2000 }} className="slide-up">
          {notification.msg}
        </div>
      )}
    </div>
  );
};

// ─── Auth Modal ───────────────────────────────────────────────────────────────
const AuthModal = ({ mode, onClose, onSuccess, initialPlan, initialBillingPeriod, initialCountry, initialVatValidated, initialTrial = false }) => {
  const [step, setStep] = useState(
    mode === "signup" ? (initialPlan ? "form" : "plan") :
    mode === "reset" ? "reset" :
    mode === "payment" ? "payment" : "login"
  );
  const [form, setForm] = useState({
    name: "", email: "", password: "", code: "",
    business_name: "", country: initialCountry || "NL",
    vat_number: "", vat_validated: initialVatValidated || false, vat_checking: false, vat_error: null,
    address_street: "", address_zip: "", address_city: "",
    plan: initialPlan || "growth",
    billingPeriod: initialBillingPeriod || "monthly",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [emailError, setEmailError] = useState(null);
  const [accountCreated, setAccountCreated] = useState(false);

  const validateEmail = (email) => {
    if (!email?.trim()) return "Vul je e-mailadres in.";
    // Check for double dots, leading/trailing dots in local part, spaces
    if (/\.{2,}/.test(email)) return "E-mailadres bevat dubbele punten.";
    if (/\s/.test(email)) return "E-mailadres mag geen spaties bevatten.";
    // RFC-ish regex: must have exactly one @, domain must have at least one dot
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "Ongeldig e-mailadres formaat.";
    // Local part can't start or end with a dot
    const local = email.split("@")[0];
    if (local.startsWith(".") || local.endsWith(".")) return "E-mailadres mag niet beginnen of eindigen met een punt.";
    return null;
  }; // true once /api/register succeeded — skip re-registration on back+resubmit
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
    getToken().then((tok) => { const session = { access_token: tok };
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
  const isTrial = initialTrial || form.code.toLowerCase() === "trial";
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
    } catch (e) {
      // Check if this email has a pending_payment account — give a helpful nudge instead of a generic error
      try {
        const checkRes = await fetch("/api/check-pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email }),
        });
        if (checkRes.ok) {
          const { pending } = await checkRes.json();
          if (pending) {
            setError("__PENDING__");
            setLoading(false);
            return;
          }
        }
      } catch {}
      setError(e.message);
    } finally { setLoading(false); }
  };

  const handleSignup = async () => {
    setLoading(true); setError(null);
    try {
      if (!form.name?.trim()) { setError("Vul je naam in."); return; }
      const emailErr = validateEmail(form.email);
      if (emailErr) { setError(emailErr); setEmailError(emailErr); return; }
      if (!form.password || form.password.length < 8) { setError("Wachtwoord moet minimaal 8 tekens zijn."); return; }
      if (!form.address_city?.trim()) { setError("Vul je stad in."); return; }
      if (!form.country) { setError("Selecteer je land."); return; }

      const vi = getVatInfo(form.country, form.vat_validated, getPlanPrice(form.plan, form.billingPeriod));

      if (!accountCreated) {
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
        // 409 = account already exists (user went back and resubmitted) — just sign in and proceed
        if (!res.ok && res.status !== 409) { setError(result.error || "Registratie mislukt."); return; }
        setAccountCreated(true);
      }

      // Sign in to get session — skip if already authenticated (e.g. user went back and changed plan)
      const existingToken = await getToken();
      if (!existingToken) {
        await signIn(form.email, form.password);
      }

      // If user went back and chose a different plan, patch the profile now (session is fresh)
      if (accountCreated && !isFree) {
        try {
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          if (currentUser?.id) {
            await supabase.from("user_profiles").update({
              chosen_plan: form.plan,
              billing_period: form.billingPeriod,
              price_total: parseFloat(vi.total),
              vat_rate: parseFloat(vi.rate),
            }).eq("id", currentUser.id);
          }
        } catch {}
      }

      if (isFree) {
        setStep("success");
      } else {
        setStep("payment"); // trial goes through payment for mandate capture (€0.01)
      }
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const handlePayment = async () => {
    setLoading(true); setError(null);
    try {
      // Ensure we have a fresh session
      let sessionToken = await getToken();
      if (!sessionToken) {
        const { data } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
        sessionToken = data?.session?.access_token;
      }
      let session = { access_token: sessionToken };
      if (!session?.access_token) { setError("Sessie verlopen. Probeer opnieuw in te loggen."); setLoading(false); return; }
      const vi = getVatInfo(form.country, form.vat_validated, getPlanPrice(form.plan, form.billingPeriod));
      const res = await fetch("/api/mollie-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({
          email: form.email,
          name: form.name,
          plan: isTrial ? "starter" : form.plan,
          billing_period: form.billingPeriod,
          price_total: isTrial ? "0.01" : vi.total, // €0.01 mandate capture for trial
          method: selectedMethod,
          is_trial: isTrial,
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
    <Overlay open onClose={onClose} width={step === "plan" ? 700 : 440} title={null} noClose={step === "payment"}>
      <div style={{ padding: 32 }}>
        {error && (
          error === "__PENDING__" ? (
            <div style={{ padding: "12px 16px", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "var(--rd)", marginBottom: 16, fontSize: 13, color: "var(--pr-h)", lineHeight: 1.6 }}>
              💳 <strong>Betaling nog niet afgerond.</strong> Check je e-mail voor de betaallink, of{" "}
              <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={() => { setError(null); setStep("login"); }}>
                log opnieuw in
              </span>{" "}om direct naar betaling te gaan.
            </div>
          ) : (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--rd)", marginBottom: 16, fontSize: 13, color: "#ef4444" }}>
              {error}
            </div>
          )
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
          {isTrial ? (
            <div style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.12),var(--s2))", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "var(--rd)", padding: "12px 16px", marginBottom: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>🚀 7 dagen gratis proberen</div>
              <div style={{ fontSize: 12, color: "var(--mx)" }}>Verificatiebetaling van €0,01. Na 7 dagen automatisch €7,99/maand — annuleer elk moment vóór dag 7.</div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800 }}>Account aanmaken</h2>
                <div onClick={() => setStep("plan")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--pr-l)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "var(--rd)", cursor: "pointer", fontSize: 12, color: "var(--pr-h)", fontWeight: 600 }}>
                  {PLANS[form.plan]?.name} · €{getPlanPrice(form.plan, form.billingPeriod).toFixed(2).replace(".", ",")} <span style={{ fontSize: 10, opacity: 0.7 }}>✎</span>
                </div>
              </div>
              <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 20 }}>Start met het beheren van al jouw webshops</p>
            </>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div className="settings-2col">
              <Field label="Naam *"><Inp value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jouw naam" /></Field>
              <Field label="Bedrijfsnaam"><Inp value={form.business_name} onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} placeholder="Optioneel" /></Field>
            </div>
            <div>
              <Field label="E-mailadres *">
                <Inp
                  value={form.email}
                  onChange={e => {
                    setForm(f => ({ ...f, email: e.target.value }));
                    setEmailError(null); // clear on change
                  }}
                  onBlur={e => {
                    const err = validateEmail(e.target.value);
                    setEmailError(err);
                  }}
                  type="email"
                  placeholder="jij@domein.nl"
                  style={emailError ? { borderColor: "var(--re)", background: "rgba(239,68,68,0.05)" } : {}}
                />
              </Field>
              {emailError && (
                <div style={{ marginTop: 4, fontSize: 11, color: "var(--re)", display: "flex", alignItems: "center", gap: 5 }}>
                  <span>⚠</span> {emailError}
                </div>
              )}
            </div>
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
                  <div style={{ fontWeight: 600, fontSize: 14 }}>WooSyncShop {PLANS[form.plan]?.name || "Growth"}</div>
                  <div style={{ fontSize: 12, color: "var(--mx)" }}>{PLANS[form.plan]?.sites} shops · {(PLANS[form.plan]?.connected_products || 0).toLocaleString("nl-NL")} producten</div>
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
            <Btn variant="primary" size="lg" onClick={handleSignup} disabled={loading} style={{ width: "100%", marginTop: 4 }}>{loading ? "Bezig..." : isTrial ? "Gratis starten →" : isFree ? "Account aanmaken →" : "Verder naar betaling →"}</Btn>
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--dm)" }}>
              Al een account? <span onClick={() => { setStep("login"); setError(null); }} style={{ color: "var(--pr-h)", cursor: "pointer" }}>Inloggen</span>
            </div>
          </div>
        </>}

        {step === "payment" && <>
          {/* Back button — only shown during signup flow, not from paywall */}
          {mode !== "payment" && (
            <div style={{ marginBottom: 12 }}>
              <span onClick={() => setStep("form")} style={{ fontSize: 12, color: "var(--pr-h)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>← Terug</span>
            </div>
          )}
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{isTrial ? "Verifieer je betaalmethode" : "Betaling"}</h2>
          <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 16 }}>{isTrial ? "Eenmalige verificatie van €0,01 — je proefperiode start direct." : `Start je ${PLANS[form.plan]?.name || "Growth"} abonnement`}</p>

          {/* Plan switcher — shown from paywall (mode=payment) so user can change their mind */}
          {mode === "payment" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--dm)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Pakket wijzigen</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {["starter","growth","pro"].map(p => (
                  <div key={p} onClick={() => setForm(f => ({ ...f, plan: p }))}
                    style={{ flex: 1, padding: "8px 4px", borderRadius: "var(--rd)", border: `1px solid ${form.plan === p ? "var(--pr)" : "var(--b1)"}`, background: form.plan === p ? "var(--pr-l)" : "var(--s2)", cursor: "pointer", textAlign: "center", transition: "all 0.15s" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: form.plan === p ? "var(--pr-h)" : "var(--tx)" }}>{PLANS[p]?.name}</div>
                    <div style={{ fontSize: 10, color: "var(--dm)", marginTop: 1 }}>€{getPlanPrice(p, form.billingPeriod).toFixed(2).replace(".",",")}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {[["monthly","Maandelijks"],["annual","Jaarlijks (−10%)"]].map(([val, label]) => (
                  <div key={val} onClick={() => setForm(f => ({ ...f, billingPeriod: val }))}
                    style={{ flex: 1, padding: "7px 6px", borderRadius: "var(--rd)", border: `1px solid ${form.billingPeriod === val ? "var(--pr)" : "var(--b1)"}`, background: form.billingPeriod === val ? "var(--pr-l)" : "var(--s2)", cursor: "pointer", textAlign: "center", fontSize: 11, fontWeight: form.billingPeriod === val ? 700 : 400, color: form.billingPeriod === val ? "var(--pr-h)" : "var(--mx)", transition: "all 0.15s" }}>
                    {label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {isTrial ? (
            <div style={{ padding: 14, background: "linear-gradient(135deg,rgba(99,102,241,0.08),var(--s2))", borderRadius: "var(--rd)", border: "1px solid rgba(99,102,241,0.3)", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>🚀 7 dagen gratis proefperiode</div>
              <div style={{ fontSize: 12, color: "var(--mx)", lineHeight: 1.7, marginBottom: 8 }}>
                Verificatiebetaling: <strong style={{ color: "var(--tx)" }}>€0,01</strong> (eenmalig, wordt direct teruggestort)<br />
                Na 7 dagen: automatisch <strong style={{ color: "var(--tx)" }}>€7,99/maand</strong> Starter — tenzij je annuleert.
              </div>
              <div style={{ fontSize: 11, color: "var(--dm)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span>🏪 2 shops · 500 verbonden producten</span>
                <span>✓ Annuleer op elk moment vóór dag 7</span>
              </div>
            </div>
          ) : (
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
          )}
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
            {loading ? "Doorsturen naar Mollie..." : isTrial ? "Verificatie starten — €0,01 →" : "Betalen →"}
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

        {step === "trial_success" && <>
          <div style={{ textAlign: "center", padding: "10px 0 20px" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🚀</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Proefperiode gestart!</h2>
            <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 6 }}>
              Je hebt <strong style={{ color: "var(--tx)" }}>7 dagen gratis</strong> toegang tot WooSyncShop Starter.
            </p>
            <p style={{ fontSize: 12, color: "var(--mx)", marginBottom: 24 }}>
              Daarna kun je eenvoudig een abonnement kiezen via Instellingen → Abonnement. Geen automatische afschrijving.
            </p>
            <div style={{ background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd)", padding: "14px 16px", marginBottom: 20, fontSize: 12, color: "var(--mx)", textAlign: "left", lineHeight: 1.8 }}>
              ✓ 2 shops · 500 verbonden producten<br />
              ✓ Volledig productbeheer + voorraadbeheer<br />
              ✓ AI Image pipeline + Hreflang manager<br />
              ✓ Multi-shop voorraad synchronisatie
            </div>
            <Btn variant="primary" size="lg" onClick={() => onSuccess({ name: form.name, email: form.email })} style={{ width: "100%" }}>Naar mijn dashboard →</Btn>
          </div>
        </>}
      </div>
    </Overlay>
  );
};

// ─── Landing Page ─────────────────────────────────────────────────────────────
// ─── Welcome View (shown after first payment) ─────────────────────────────────

// ─── How It Works / Intro View ────────────────────────────────────────────────
const HowItWorksView = ({ onBack, onAddShop }) => {
  const [activeSection, setActiveSection] = useState("overview");

  const SECTIONS = [
    { id: "overview", icon: "🗺️", label: "Overzicht" },
    { id: "sync", icon: "🔄", label: "Sync & Push" },
    { id: "matching", icon: "🔗", label: "Producten koppelen" },
    { id: "ai", icon: "🤖", label: "AI functies" },
    { id: "hreflang", icon: "🌐", label: "Hreflang" },
    { id: "images", icon: "🖼️", label: "Image pipeline" },
  ];

  const SECTION_CONTENT = {
    overview: {
      title: "Wat is WooSyncShop?",
      subtitle: "De centrale hub voor al je WooCommerce webshops",
      hero: "🗺️",
      blocks: [
        { icon: "🎯", title: "Eén dashboard, meerdere shops", body: "Beheer al je WooCommerce installaties vanuit één plek. Of je nu 2 shops hebt of 10 — je ziet alles overzichtelijk naast elkaar. Wissel direct van actieve shop via de dropdown bovenin." },
        { icon: "🔌", title: "Verbinding via REST API", body: "WooSyncShop verbindt met je WooCommerce shop via de officiële REST API. Je genereert een Consumer Key + Consumer Secret in je WordPress backend (WooCommerce → Instellingen → Geavanceerd → REST API) en voert die in bij het toevoegen van een shop." },
        { icon: "⚡", title: "Sync vs Push", body: "Sync haalt de nieuwste productdata op vanuit je WooCommerce shop naar WooSyncShop. Push stuurt wijzigingen die je hebt gekoppeld naar alle verbonden shops. Twee aparte acties zodat je altijd controle houdt." },
        { icon: "🔐", title: "Veiligheid & toegang", body: "Alle API-sleutels worden versleuteld opgeslagen. WooSyncShop leest en schrijft alleen via lees/schrijf-rechten die jij hebt ingesteld. We slaan nooit wachtwoorden op." },
      ],
    },
    sync: {
      title: "Synchronisatie & Push",
      subtitle: "Houd productdata consistent over al je shops",
      hero: "🔄",
      blocks: [
        { icon: "⬇️", title: "Sync: van WooCommerce naar WooSyncShop", body: "Met de Sync-knop haal je de actuele productenlijst op van je actieve shop. WooSyncShop vergelijkt dit met de eerder opgeslagen staat en toont je welke producten er zijn en hoe ze zijn gelinkt. Dit is altijd een leesactie — er wordt niets aangepast in je shop." },
        { icon: "⬆️", title: "Push: van WooSyncShop naar verbonden shops", body: "Push stuurt de productdata van je bronshop naar alle gekoppelde doelshops. Je kiest per koppeling welke velden worden gesynchroniseerd: naam, beschrijving, prijs, voorraad, afbeeldingen, categorieën, attributen. Velden die je niet aanvinkt worden nooit overschreven." },
        { icon: "🎛️", title: "Selectieve veldsync", body: "Per verbonden product kun je exact instellen welke velden worden gesynchroniseerd. Wil je prijs en voorraad wel synchroniseren maar de omschrijving lokaal houden? Geen probleem. Elke koppeling heeft zijn eigen set gesynchroniseerde velden." },
        { icon: "📦", title: "Variabele producten", body: "WooSyncShop ondersteunt ook variabele producten met attributen (maat, kleur etc.) en varianten. Voorraad per variant kan worden gesynchroniseerd zodat je nooit meer een mismatch hebt tussen locaties." },
      ],
    },
    matching: {
      title: "Producten koppelen",
      subtitle: "Drie manieren om bronproducten te linken aan doelproducten",
      hero: "🔗",
      blocks: [
        { icon: "🔢", title: "Koppelen via SKU", body: "De eenvoudigste koppelstrategie: als je bronshop en doelshop dezelfde SKU-codes gebruiken, kan WooSyncShop automatisch alle producten matchen. Eén klik en alle overeenkomende SKU's zijn gekoppeld." },
        { icon: "🏷️", title: "Koppelen via attribuut", body: "Als je shops een gedeeld product-ID of kenmerk gebruiken (bijv. een EAN, artikel-ID of merk), kies dan koppelen via attribuut. Je kiest het attribuut en WooSyncShop zoekt de overeenkomsten." },
        { icon: "✋", title: "Handmatig koppelen", body: "Wil je volledige controle? In de verbonden producten-view kun je voor elk bronproduct handmatig het bijbehorende doelproduct selecteren uit de lijst. Zoek op naam of SKU en sla de koppeling op." },
        { icon: "🤖", title: "AI automatisch matchen", body: "De krachtigste optie: laat Gemini of GPT-4o de producten van je bron- en doelshop vergelijken op basis van naam, omschrijving en attributen. De AI geeft elk voorstel een confidence score zodat je twijfelachtige koppelingen kunt reviewen." },
      ],
    },
    ai: {
      title: "AI functies",
      subtitle: "Van matching tot vertaling tot beeldoptimalisatie",
      hero: "🤖",
      blocks: [
        { icon: "🧠", title: "AI matching — hoe het werkt", body: "WooSyncShop stuurt batches van maximaal 30 bronproducten tegelijk naar het AI-model met een gestructureerde prompt. Het model vergelijkt elk bronproduct met de kandidaten uit de doelshop en geeft per match een confidence score van 0-100%. Alles boven een drempel (standaard 85%) wordt automatisch goedgekeurd, de rest vlag je als 'review needed'." },
        { icon: "🌍", title: "AI Vertaling", body: "Activeer vertaling vanuit Instellingen → AI Vertaling. WooSyncShop vertaalt productnaam, beschrijving en korte beschrijving naar de taal van je doelshop. De AI behoudt HTML-opmaak, bullet points en speciale tekens. Taxonomieën (categorieën, tags) kunnen optioneel ook worden vertaald." },
        { icon: "⚙️", title: "Kies je AI-provider", body: "Als superadmin kun je via Platform-instellingen kiezen welke AI-provider wordt gebruikt: Google Gemini of OpenAI GPT-4o. Gemini is standaard voor beelden (via multimodal vision), GPT-4o voor teksttaken. Per gebruiker kunnen standaarden worden overschreven." },
        { icon: "📊", title: "Transparantie & logs", body: "Elke AI-actie wordt gelogd in het systeem: welk model werd gebruikt, hoeveel producten verwerkt, en of er fouten optraden. Superadmins zien alle logs via het Admin-dashboard onder Logs." },
      ],
    },
    hreflang: {
      title: "Hreflang manager",
      subtitle: "Internationale SEO zonder gedoe",
      hero: "🌐",
      blocks: [
        { icon: "🔍", title: "Wat is hreflang?", body: "Hreflang-tags vertellen zoekmachines welke pagina's vertalingen van elkaar zijn. Zonder hreflang kan Google de verkeerde versie van je shop indexeren voor een bepaald land of taal, wat je internationale SEO beschadigt." },
        { icon: "🗂️", title: "Hoe WooSyncShop het regelt", body: "Koppel producten via de Hreflang-tab. WooSyncShop genereert automatisch de juiste hreflang link tags voor elk gekoppeld product. Je hoeft geen WordPress plugin te installeren — de tags worden rechtstreeks via de WooCommerce REST API geïnjecteerd." },
        { icon: "🏁", title: "Locale & taalcodes", body: "WooSyncShop ondersteunt alle standaard hreflang-codes (nl-NL, fr-BE, de-DE, en-US etc.). Elke shop heeft een locale die je instelt bij het verbinden. Zorg dat de locale overeenkomt met de taal en het land van die shop voor de beste resultaten." },
        { icon: "✅", title: "Validatie & preview", body: "In de Hreflang-tab zie je voor elk product welke tags worden gegenereerd en of er eventuele ontbrekende koppelingen zijn. Groene vinkjes = alles in orde. Oranje = product niet gekoppeld in alle talen." },
      ],
    },
    images: {
      title: "Image pipeline",
      subtitle: "Automatische beeldoptimalisatie via AI",
      hero: "🖼️",
      blocks: [
        { icon: "👁️", title: "Stap 1 — Gemini analyseert", body: "Wanneer je de image pipeline activeert op een product, stuurt WooSyncShop de productafbeelding naar Google Gemini Vision. Gemini analyseert de afbeelding, genereert een beschrijvende alt-tekst in de taal van je shop, en controleert of de afbeelding voldoet aan kwaliteitseisen." },
        { icon: "🗜️", title: "Stap 2 — TinyPNG comprimeert", body: "Na de analyse gaat de afbeelding door TinyPNG voor verliesloze compressie. WooSyncShop respecteert je ingestelde limiet (standaard 400KB) en maximale breedte (standaard 1200px). Grote productfoto's worden automatisch verkleind zonder zichtbaar kwaliteitsverlies." },
        { icon: "⬆️", title: "Stap 3 — Terug naar WooCommerce", body: "De geoptimaliseerde afbeelding met bijgewerkte alt-tekst wordt via de API teruggestuurd naar je WooCommerce shop. Het origineel wordt vervangen. Alle stappen zijn gelogd zodat je precies ziet hoeveel KB er is bespaard per product." },
        { icon: "🎛️", title: "Configuratie per gebruiker", body: "Superadmins kunnen per gebruiker de Gemini model-variant instellen (Nano Banana voor snelheid, Pro voor kwaliteit), de maximale bestandsgrootte, compressiekwaliteit en maximale breedte. Gebruikers zien hun instellingen in het profiel." },
      ],
    },
  };

  const section = SECTION_CONTENT[activeSection];

  return (
    <div style={{ fontFamily: "var(--font-b)", minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ background: "var(--s1)", borderBottom: "1px solid var(--b1)", padding: "14px 24px", display: "flex", alignItems: "center", gap: 16, position: "sticky", top: 0, zIndex: 100 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--mx)", padding: "4px 8px", borderRadius: "var(--rd)", display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500 }}>
          ← Terug
        </button>
        <div style={{ width: 1, height: 20, background: "var(--b1)" }} />
        <img src="/woo-sync-shop-logo.png" alt="WooSyncShop" style={{ height: 20 }} />
        <div style={{ marginLeft: "auto" }}>
          <Btn variant="primary" size="sm" onClick={onAddShop}>
            🏪 Shop toevoegen →
          </Btn>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, maxWidth: 1100, margin: "0 auto", width: "100%", padding: "0 16px" }}>
        {/* Sidebar nav */}
        <div style={{ width: 220, flexShrink: 0, padding: "32px 0 32px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, paddingLeft: 8 }}>Documentatie</div>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: activeSection === s.id ? "var(--s2)" : "transparent", border: activeSection === s.id ? "1px solid var(--b2)" : "1px solid transparent", borderRadius: "var(--rd)", cursor: "pointer", color: activeSection === s.id ? "var(--tx)" : "var(--mx)", fontSize: 13, fontWeight: activeSection === s.id ? 600 : 400, textAlign: "left", transition: "all 0.15s", width: "100%" }}>
              <span style={{ fontSize: 16 }}>{s.icon}</span>
              <span>{s.label}</span>
              {activeSection === s.id && <span style={{ marginLeft: "auto", color: "var(--pr-h)", fontSize: 10 }}>▶</span>}
            </button>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: "40px 0 60px 40px", minWidth: 0 }}>
          {/* Hero */}
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>{section.hero}</div>
            <h1 style={{ fontSize: "clamp(24px,3vw,36px)", fontWeight: 800, letterSpacing: "-0.03em", fontFamily: "var(--font-h)", marginBottom: 8, lineHeight: 1.2 }}>{section.title}</h1>
            <p style={{ fontSize: 16, color: "var(--mx)", lineHeight: 1.6, maxWidth: 600 }}>{section.subtitle}</p>
          </div>

          {/* Content blocks */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
            {section.blocks.map((b, i) => (
              <div key={i} style={{ padding: "24px", background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: "var(--rd-xl)", transition: "border-color 0.2s, transform 0.2s", cursor: "default" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(91,91,214,0.4)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--b1)"; e.currentTarget.style.transform = "none"; }}>
                <div style={{ fontSize: 28, marginBottom: 14 }}>{b.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, fontFamily: "var(--font-h)" }}>{b.title}</div>
                <div style={{ fontSize: 13, color: "var(--mx)", lineHeight: 1.75 }}>{b.body}</div>
              </div>
            ))}
          </div>

          {/* Section navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--b1)" }}>
            {SECTIONS.findIndex(s => s.id === activeSection) > 0 ? (
              <Btn variant="secondary" onClick={() => setActiveSection(SECTIONS[SECTIONS.findIndex(s => s.id === activeSection) - 1].id)}>
                ← {SECTIONS[SECTIONS.findIndex(s => s.id === activeSection) - 1].label}
              </Btn>
            ) : <span />}
            {SECTIONS.findIndex(s => s.id === activeSection) < SECTIONS.length - 1 ? (
              <Btn variant="secondary" onClick={() => setActiveSection(SECTIONS[SECTIONS.findIndex(s => s.id === activeSection) + 1].id)}>
                {SECTIONS[SECTIONS.findIndex(s => s.id === activeSection) + 1].label} →
              </Btn>
            ) : (
              <Btn variant="primary" onClick={onAddShop}>
                🏪 Klaar! Eerste shop toevoegen →
              </Btn>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const WelcomeView = ({ user, plan, onContinue, onAddShop, onHowItWorks }) => {
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
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Btn variant="primary" size="lg" onClick={() => { onAddShop?.(); onContinue?.(); }} style={{ fontSize: 15, padding: "13px 28px" }}>
                  🏪 Eerste shop toevoegen →
                </Btn>
                <Btn variant="secondary" size="lg" onClick={onHowItWorks} style={{ fontSize: 15, padding: "13px 24px" }}>
                  💡 Hoe werkt het?
                </Btn>
              </div>
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
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Btn variant="primary" size="lg" onClick={() => { onAddShop?.(); onContinue?.(); }} style={{ fontSize: 15, padding: "13px 28px" }}>
              🏪 Eerste shop toevoegen →
            </Btn>
            <Btn variant="secondary" size="lg" onClick={onHowItWorks} style={{ fontSize: 15, padding: "13px 24px" }}>
              💡 Hoe werkt het?
            </Btn>
          </div>
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
          <Btn variant="primary" onClick={() => onSignup("starter", "monthly", true)}>Start gratis</Btn>
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
          <Btn variant="primary" size="lg" onClick={() => onSignup("starter", "monthly", true)} style={{ fontSize: 15, padding: "13px 28px" }}>7 dagen gratis proberen →</Btn>
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
  const [gtmSetup, setGtmSetup] = useState({ running: false, result: null, error: null });

  // Load current settings
  const load = async () => {
    try {
      const session = { access_token: await getToken() };
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
      const session = { access_token: await getToken() };
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
      const session = { access_token: await getToken() };
      await fetch("/api/google-tracking-disconnect", { method: "POST", headers: { "Authorization": `Bearer ${session?.access_token}` } });
      setTs(s => ({ ...s, google_connected: false, google_connected_email: null }));
      setGoogleData(null);
    } catch (e) { alert(e.message); }
  };

  const runGtmSetup = async () => {
    const containerObj = googleData?.gtm?.find(g => g.id === ts.gtm_id);
    if (!containerObj?.path) { alert("Selecteer eerst een GTM container via Google koppeling."); return; }
    if (!confirm("WooSyncShop maakt automatisch GA4 en Google Ads tags aan in jouw GTM container en publiceert de container. Doorgaan?")) return;
    setGtmSetup({ running: true, result: null, error: null });
    try {
      const session = { access_token: await getToken() };
      const res = await fetch("/api/google-gtm-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          container_path:      containerObj.path,
          ga4_measurement_id:  ts.ga4_id || null,
          gads_conversion_id:  ts.gads_conversion_id || null,
          gads_conversion_label: ts.gads_conversion_label || null,
        }),
      });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error || "Setup mislukt");
      setGtmSetup({ running: false, result: d, error: null });
    } catch (e) {
      setGtmSetup({ running: false, result: null, error: e.message });
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const session = { access_token: await getToken() };
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

      {/* ── Google Services — 3 separate connections ── */}
      {/* ── Google Services — per-shop in Settings ── */}
      <div style={{ padding: "12px 16px", borderRadius: "var(--rd-lg)", background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>💡</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Google Ads, GA4 &amp; Search Console worden per shop gekoppeld</div>
          <div style={{ fontSize: 12, color: "var(--mx)", lineHeight: 1.6 }}>
            Ga naar <strong style={{ color: "var(--tx)" }}>Instellingen → Shops</strong> en klik op een shop om Google-services te koppelen.
            Elke shop krijgt zijn eigen Google Ads-account, GA4-property en Search Console-site.
            Vereist: <strong>GOOGLE_CLIENT_ID</strong> + <strong>GOOGLE_CLIENT_SECRET</strong> in Netlify env.
          </div>
        </div>
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

      {/* ── GA4 tag ID ── */}
      <TrackCard icon="📈" title="Google Analytics 4 — Tag ID" active={!!ts.ga4_id}
        hint="Measurement ID voor gtag.js integratie. Gebruik dit als je geen GTM gebruikt.">
        {googleData?.ga4?.length > 0 ? (
          <DropdownSelect
            label="GA4 Property" hint="Measurement ID wordt automatisch ingevuld"
            value={ts.ga4_id} onChange={v => setTs(s => ({ ...s, ga4_id: v }))}
            options={googleData.ga4} placeholder="— Selecteer property —"
          />
        ) : (
          <Field label="GA4 Measurement ID" hint="Bijv. G-XXXXXXXXXX — of koppel GA4 hierboven om properties op te halen">
            <Inp value={ts.ga4_id} onChange={e => setTs(s => ({ ...s, ga4_id: e.target.value }))} placeholder="G-XXXXXXXXXX" />
          </Field>
        )}
        {googleData?.ga4_error && <div style={{ fontSize: 11, color: "var(--am)" }}>⚠ GA4 ophalen mislukt: {googleData.ga4_error}</div>}
      </TrackCard>

      {/* ── Google Ads Conversies ── */}
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

      {/* ── Zero-knowledge GTM Auto-setup ── */}
      {ts.google_connected && ts.gtm_id && googleData?.gtm?.find(g => g.id === ts.gtm_id)?.path && (ts.ga4_id || ts.gads_conversion_id) && (
        <div style={{ border: "1px solid rgba(99,102,241,0.35)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)", borderBottom: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🚀</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Zero-knowledge GTM inrichten</div>
              <div style={{ fontSize: 12, color: "var(--mx)", marginTop: 1 }}>WooSyncShop maakt automatisch de juiste tags aan in jouw GTM container</div>
            </div>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {!gtmSetup.result && (
              <div style={{ fontSize: 12, color: "var(--mx)", lineHeight: 1.8 }}>
                <div style={{ fontWeight: 600, color: "var(--tx)", marginBottom: 6 }}>Dit wordt automatisch aangemaakt in GTM container <strong style={{ color: "var(--pr-h)" }}>{ts.gtm_id}</strong>:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 4 }}>
                  <div>✓ <strong>GTM Workspace</strong> — "WooSyncShop Auto-setup"</div>
                  <div>✓ <strong>Trigger</strong> — All Pages (pageview)</div>
                  {ts.ga4_id && <div>✓ <strong>GA4 Configuration tag</strong> — Measurement ID: <code style={{ background: "var(--s3)", padding: "0 4px", borderRadius: 3 }}>{ts.ga4_id}</code></div>}
                  {ts.gads_conversion_id && (
                    <>
                      <div>✓ <strong>Conversion Linker tag</strong> — Google Ads koppeling</div>
                      <div>✓ <strong>Trigger</strong> — <code style={{ background: "var(--s3)", padding: "0 4px", borderRadius: 3 }}>registration_complete</code></div>
                      <div>✓ <strong>Google Ads Conversie tag</strong> — <code style={{ background: "var(--s3)", padding: "0 4px", borderRadius: 3 }}>{ts.gads_conversion_id}/{ts.gads_conversion_label}</code></div>
                    </>
                  )}
                  <div>✓ <strong>Container versie aanmaken + publiceren</strong></div>
                </div>
              </div>
            )}
            {gtmSetup.running && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "rgba(99,102,241,0.06)", borderRadius: "var(--rd)", fontSize: 13, color: "var(--mx)" }}>
                <span style={{ animation: "spin 0.8s linear infinite", display: "inline-block" }}>↻</span>
                GTM instellen... tags aanmaken en publiceren
              </div>
            )}
            {gtmSetup.result && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ padding: "10px 14px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "var(--rd)" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#22c55e", marginBottom: 6 }}>
                    {gtmSetup.result.published ? "✓ GTM ingericht en gepubliceerd!" : "✓ GTM ingericht (handmatig publiceren vereist)"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--mx)", display: "flex", flexDirection: "column", gap: 2 }}>
                    {gtmSetup.result.created.map((item, i) => <div key={i}>✓ {item}</div>)}
                  </div>
                </div>
                {!gtmSetup.result.published && gtmSetup.result.publish_error && (
                  <div style={{ fontSize: 12, color: "var(--mx)" }}>
                    Ga naar <a href="https://tagmanager.google.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--pr-h)" }}>tagmanager.google.com ↗</a> om de workspace handmatig te publiceren.
                  </div>
                )}
                <Btn variant="ghost" size="sm" onClick={() => setGtmSetup({ running: false, result: null, error: null })} style={{ alignSelf: "flex-start", fontSize: 11 }}>↺ Opnieuw instellen</Btn>
              </div>
            )}
            {gtmSetup.error && (
              <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--rd)", fontSize: 12, color: "var(--re)" }}>
                ⚠ {gtmSetup.error}
                <button onClick={() => setGtmSetup({ running: false, result: null, error: null })} style={{ marginLeft: 12, fontSize: 11, color: "var(--mx)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Opnieuw proberen</button>
              </div>
            )}
            {!gtmSetup.result && (
              <Btn variant="primary" onClick={runGtmSetup} disabled={gtmSetup.running} style={{ alignSelf: "flex-start" }}>
                {gtmSetup.running ? "↻ Bezig met instellen..." : "🚀 Automatisch instellen in GTM"}
              </Btn>
            )}
          </div>
        </div>
      )}

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

  const [logsError, setLogsError] = useState("");

  const loadLogs = async (level, fn) => {
    const lvl = level !== undefined ? level : levelFilter;
    const f = fn !== undefined ? fn : fnFilter;
    setLoading(true);
    setLogsError("");
    try {
      const token = await getToken();
      const params = new URLSearchParams({ limit: "300" });
      if (lvl !== "all") params.set("level", lvl);
      if (f !== "all") params.set("fn", f);
      const res = await fetch(`/api/system-logs?${params}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const errorHint = res.headers.get("X-Logs-Error");
      if (errorHint) setLogsError(`Tabel fout: ${errorHint} — voer system_logs_migration.sql uit in Supabase.`);
      const data = await res.json();
      setLogs(data);
    } catch (e) {
      setLogsError(e.message);
      console.error("Failed to load logs:", e);
    }
    finally { setLoading(false); }
  };

  useEffect(() => { loadLogs("all", "all"); }, []);

  const clearLogs = async () => {
    if (!confirm("Alle logs wissen?")) return;
    setClearing(true);
    try {
      const token = await getToken();
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
      {logsError && (
        <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--rd)", fontSize: 13, color: "var(--re)", marginBottom: 8 }}>
          ⚠ {logsError}
        </div>
      )}
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
// Note: Content generatie uses content_provider (claude/gemini/openai) separately below

const CLAUDE_MODELS = [
  { value: "claude-sonnet-4-6",         label: "claude-sonnet-4-6 (aanbevolen)" },
  { value: "claude-sonnet-4-5",         label: "claude-sonnet-4-5" },
  { value: "claude-haiku-4-5-20251001", label: "claude-haiku-4-5 (snel/goedkoop)" },
];

const GEMINI_MODELS = [
  { value: "gemini-2.5-pro",        label: "gemini-2.5-pro (krachtigst)" },
  { value: "gemini-2.5-flash",      label: "gemini-2.5-flash (aanbevolen)" },
  { value: "gemini-2.5-flash-lite", label: "gemini-2.5-flash-lite (snel/goedkoop)" },
];
const OPENAI_MODELS = [
  { value: "gpt-5.4",         label: "gpt-5.4 (nieuwste flagship)",      group: "GPT-5.4" },
  { value: "gpt-5.4-pro",     label: "gpt-5.4-pro (dieper redeneren)",   group: "GPT-5.4" },
  { value: "gpt-5.2",         label: "gpt-5.2",                          group: "GPT-5.2" },
  { value: "gpt-5.2-pro",     label: "gpt-5.2-pro",                      group: "GPT-5.2" },
  { value: "gpt-5-mini",      label: "gpt-5-mini (snel, goedkoop)",       group: "GPT-5" },
  { value: "gpt-5-nano",      label: "gpt-5-nano (ultrasnelle taken)",    group: "GPT-5" },
  { value: "gpt-4o",          label: "gpt-4o",                           group: "GPT-4o" },
  { value: "gpt-4o-mini",     label: "gpt-4o mini",                      group: "GPT-4o" },
];

const ProviderToggle = ({ value, onChange, geminiOnly = false, providers = null }) => {
  // Default providers: gemini + openai. Pass providers=[] to add claude etc.
  const opts = providers || (geminiOnly
    ? [{ id: "gemini", label: "✦ Gemini" }]
    : [{ id: "gemini", label: "✦ Gemini" }, { id: "openai", label: "⬡ OpenAI" }]
  );
  return (
    <div style={{ display: "flex", borderRadius: "var(--rd)", overflow: "hidden", border: "1px solid var(--b2)", width: "fit-content" }}>
      {opts.map(opt => (
        <button key={opt.id} onClick={() => onChange(opt.id)}
          style={{ padding: "5px 14px", fontSize: 12, fontWeight: value === opt.id ? 700 : 400, background: value === opt.id ? "var(--pr)" : "transparent", color: value === opt.id ? "#fff" : "var(--mx)", border: "none", cursor: "pointer", transition: "all 0.15s" }}>
          {opt.label}
        </button>
      ))}
    </div>
  );
};

const ModelSelect = ({ provider, value, onChange, compact = false }) => {
  const models = provider === "openai" ? OPENAI_MODELS : GEMINI_MODELS;
  const defaultLabel = provider === "openai" ? "gpt-5.4 (standaard)" : "gemini-2.5-flash (standaard)";
  // Group openai models
  const groups = provider === "openai"
    ? [...new Set(models.map(m => m.group))]
    : null;
  return (
    <select
      value={value || ""}
      onChange={e => onChange(e.target.value)}
      style={{ padding: compact ? "3px 6px" : "5px 8px", background: "var(--s3)", border: "1px solid var(--b2)", borderRadius: "var(--rd)", color: "var(--tx)", fontSize: 11, minWidth: compact ? 160 : 200 }}
    >
      <option value="">— {defaultLabel} —</option>
      {groups ? groups.map(grp => (
        <optgroup key={grp} label={grp}>
          {models.filter(m => m.group === grp).map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </optgroup>
      )) : models.map(m => (
        <option key={m.value} value={m.value}>{m.label}</option>
      ))}
    </select>
  );
};

const PlatformSettings = () => {
  const [ps, setPs] = useState({
    gemini_api_key: "", tinypng_api_key: "", mollie_api_key: "", contact_notification_email: "",
    openai_api_key: "",
    ai_provider_matching: "gemini", ai_provider_translation: "gemini",
    ai_provider_image: "gemini", ai_provider_normalization: "gemini",
    ai_model_matching: "", ai_model_translation: "", ai_model_image: "",
    claude_model_content: "",
    content_provider: "claude",
    openai_model_content: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [methods, setMethods] = useState([]);
  const [methodsLoading, setMethodsLoading] = useState(false);
  const [eanPool, setEanPool]           = useState(null);
  const [eanPoolLoading, setEanPoolLoading] = useState(false);
  const [eanPoolError, setEanPoolError] = useState(null);
  const [eanImporting, setEanImporting] = useState(false);
  const [eanImportResult, setEanImportResult] = useState(null); // {imported,skipped} | {error}
  const [eanExporting, setEanExporting] = useState(false);
  const [eanThreshold, setEanThreshold] = useState(200);
  const [eanAlertEmail, setEanAlertEmail] = useState("");
  const [eanThresholdSaving, setEanThresholdSaving] = useState(false);
  const [eanTab, setEanTab]             = useState("status"); // status | import | export

  const loadEanPool = async () => {
    setEanPoolLoading(true);
    setEanPoolError(null);
    try {
      const session = { access_token: await getToken() };
      const res = await fetch("/api/ean-assign", { headers: { "Authorization": `Bearer ${session?.access_token}` } });
      const d = await res.json();
      if (!res.ok) { setEanPoolError(d.error || `HTTP ${res.status}`); return; }
      setEanPool(d);
      if (d.alert_threshold !== undefined) setEanThreshold(d.alert_threshold);
      if (d.alert_email !== undefined) setEanAlertEmail(d.alert_email || "");
    } catch (e) {
      setEanPoolError(e.message);
    } finally {
      setEanPoolLoading(false);
    }
  };

  const loadMethods = async () => {
    setMethodsLoading(true);
    try {
      const session = { access_token: await getToken() };
      const res = await fetch("/api/mollie-payments?type=methods", { headers: { "Authorization": `Bearer ${session?.access_token}` } });
      const data = await res.json();
      setMethods(data.methods || []);
    } catch {} finally { setMethodsLoading(false); }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const session = { access_token: await getToken() };
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
          ai_model_image: d.ai_model_image || "",
          claude_model_content: d.claude_model_content || "",
          content_provider: d.content_provider || "claude",
          openai_model_content: d.openai_model_content || "",
        }));
      } catch {}
      setLoading(false);
    };
    load();
    loadEanPool();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const session = { access_token: await getToken() };
      const savePayload = { ...ps };
      const saveRes = await fetch("/api/platform-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify(savePayload),
      });
      if (!saveRes.ok) { const e = await saveRes.json().catch(() => ({})); throw new Error(e.error || `HTTP ${saveRes.status}`); }
      // After save: mark keys as set and clear the input fields
      // Keep fields as-is after save (values are already trimmed on server)
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { alert("Opslaan mislukt: " + e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: 20, color: "var(--mx)", fontSize: 13 }}>Laden...</div>;

  const handleEanImport = async (file) => {
    if (!file) return;
    setEanImporting(true);
    setEanImportResult(null);
    try {
      const buf = await file.arrayBuffer();
      let eans = [];
      if (!window.XLSX) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      const wb = window.XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1 });
      eans = rows.flat().map(v => String(v || "").trim().replace(/\D/g, "")).filter(v => v.length === 13);
      if (eans.length === 0) { setEanImportResult({ error: "Geen geldige EAN-13 codes gevonden in dit bestand." }); return; }
      const session = { access_token: await getToken() };
      const res = await fetch("/api/ean-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: "import", eans, filename: file.name }),
      });
      const result = await res.json();
      if (!res.ok || result.error) { setEanImportResult({ error: result.error }); return; }
      setEanImportResult(result);
      await loadEanPool();
    } catch (e) {
      setEanImportResult({ error: e.message });
    } finally {
      setEanImporting(false);
    }
  };

  const handleEanExport = async () => {
    setEanExporting(true);
    try {
      const session = { access_token: await getToken() };
      const res = await fetch("/api/ean-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: "export" }),
      });
      const { rows } = await res.json();
      const header = "EAN,SKU,Toegewezen op,Product ID";
      const lines = (rows || []).filter(r => r.assigned_sku).map(r =>
        `${r.ean},${r.assigned_sku || ""},${r.assigned_at ? new Date(r.assigned_at).toLocaleDateString("nl-NL") : ""},${r.product_id || ""}`
      );
      const csv = [header, ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `ean-gebruikt-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { alert("Export mislukt: " + e.message); }
    finally { setEanExporting(false); }
  };

  const saveEanThreshold = async () => {
    setEanThresholdSaving(true);
    try {
      const session = { access_token: await getToken() };
      await fetch("/api/ean-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: "set_threshold", threshold: parseInt(eanThreshold) || 200, alert_email: eanAlertEmail }),
      });
    } finally { setEanThresholdSaving(false); }
  };

  const hasGemini = !!ps.gemini_api_key;
  const hasOpenAI = !!ps.openai_api_key;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── API Keys ── */}
      <div style={{ padding: 16, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🔑 AI API Keys</div>
        <div style={{ fontSize: 12, color: "var(--mx)", marginBottom: 14 }}>Voeg één of beide toe. Je kiest per use-case welke je gebruikt.</div>
        <div className="settings-2col">
          <Field label="Google Gemini API Key" hint={hasGemini ? "✓ Ingesteld" : "Geen key → Gemini uitgeschakeld"}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Inp value={ps.gemini_api_key} onChange={e => setPs(p => ({ ...p, gemini_api_key: e.target.value }))} type="text" autoComplete="off" spellCheck={false} placeholder="AIzaSy..." style={{ fontFamily: "monospace", fontSize: 12 }} />
              <Btn variant="ghost" size="sm" onClick={async () => {
                if (!ps.gemini_api_key) return alert("Voer eerst een API key in");
                const token = await getToken();
                const r = await fetch("/api/test-api-key", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ provider: "gemini", key: ps.gemini_api_key.trim() }) });
                const d = await r.json();
                alert(d.ok ? "✅ " + d.message : "❌ " + d.error);
              }}>🔌 Test</Btn>
            </div>
          </Field>
          <Field label="OpenAI API Key" hint={hasOpenAI ? "✓ Ingesteld" : "Geen key → OpenAI use-cases uitgeschakeld"}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Inp value={ps.openai_api_key} onChange={e => setPs(p => ({ ...p, openai_api_key: e.target.value }))} type="text" autoComplete="off" spellCheck={false} placeholder="sk-..." style={{ fontFamily: "monospace", fontSize: 12 }} />
              <Btn variant="ghost" size="sm" onClick={async () => {
                if (!ps.openai_api_key) return alert("Voer eerst een API key in");
                const token = await getToken();
                const r = await fetch("/api/test-api-key", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ provider: "openai", key: ps.openai_api_key.trim() }) });
                const d = await r.json();
                alert(d.ok ? "✅ " + d.message : "❌ " + d.error);
              }}>🔌 Test</Btn>
            </div>
          </Field>
          <Field label="TinyPNG API Key" hint={ps.tinypng_api_key ? "✓ Ingesteld" : "Gebruikt voor afbeelding compressie na Gemini resize"}>
            <Inp value={ps.tinypng_api_key} onChange={e => setPs(p => ({ ...p, tinypng_api_key: e.target.value }))} type="text" autoComplete="off" spellCheck={false} placeholder="abcdef..." style={{ fontFamily: "monospace", fontSize: 12 }} />
          </Field>
        </div>
      </div>

      {/* ── AI Provider per use-case ── */}
      <div style={{ padding: 16, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🧠 AI Provider per use-case</div>
        <div style={{ fontSize: 12, color: "var(--mx)", marginBottom: 14 }}>Kies per functionaliteit welk model wordt gebruikt. Grijs = betreffende key ontbreekt.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {AI_USE_CASES.map(uc => {
            const provKey  = "ai_provider_" + uc.id;
            const modelKey = "ai_model_"    + uc.id;
            const current  = ps[provKey]  || "gemini";
            const model    = ps[modelKey] || "";
            const missingKey = (current === "gemini" && !hasGemini) || (current === "openai" && !hasOpenAI);
            return (
              <div key={uc.id} style={{ padding: "10px 12px", background: "var(--s1)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
                {/* Row 1: label + provider toggle */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{uc.label}</div>
                    <div style={{ fontSize: 11, color: "var(--dm)" }}>{uc.hint}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {missingKey && (
                      <span style={{ fontSize: 11, color: "var(--am)", background: "rgba(234,179,8,0.1)", padding: "2px 7px", borderRadius: 10 }}>⚠ key ontbreekt</span>
                    )}
                    <ProviderToggle value={current} onChange={v => setPs(p => ({ ...p, [provKey]: v, [modelKey]: "" }))} geminiOnly={uc.geminiOnly} />
                  </div>
                </div>
                {/* Row 2: model dropdown */}
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--dm)", flexShrink: 0 }}>Model:</span>
                  <ModelSelect
                    provider={current}
                    value={model}
                    onChange={v => setPs(p => ({ ...p, [modelKey]: v }))}
                    compact
                  />
                  {model && (
                    <button onClick={() => setPs(p => ({ ...p, [modelKey]: "" }))} style={{ fontSize: 10, color: "var(--dm)", background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }} title="Reset naar standaard">✕ reset</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Content generatie (Claude / Gemini / OpenAI) ── */}
        {(() => {
          const contentProv = ps.content_provider || "claude";
          const modelKey = contentProv === "claude" ? "claude_model_content"
                         : contentProv === "openai"  ? "openai_model_content"
                         : "ai_model_normalization"; // gemini uses normalization model slot
          const currentModel = ps[modelKey] || "";
          const modelOptions = contentProv === "claude"  ? CLAUDE_MODELS
                             : contentProv === "openai"  ? OPENAI_MODELS
                             : GEMINI_MODELS;
          const defaultLabel = contentProv === "claude"  ? "claude-sonnet-4-6 (standaard)"
                             : contentProv === "openai"  ? "gpt-5.4 (standaard)"
                             : "gemini-2.5-flash (standaard)";
          return (
            <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--s1)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>✨ Content generatie</div>
                  <div style={{ fontSize: 11, color: "var(--dm)" }}>Productbeschrijvingen, SEO meta & attribuut suggesties bij dupliceren & sync aanmaken</div>
                </div>
                <ProviderToggle
                  value={contentProv}
                  onChange={v => setPs(p => ({ ...p, content_provider: v, claude_model_content: "", openai_model_content: "" }))}
                  providers={[
                    { id: "claude",  label: "◆ Claude"  },
                    { id: "gemini",  label: "✦ Gemini"  },
                    { id: "openai",  label: "⬡ OpenAI"  },
                  ]}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--dm)", flexShrink: 0 }}>Model:</span>
                <select
                  value={currentModel}
                  onChange={e => setPs(p => ({ ...p, [modelKey]: e.target.value }))}
                  style={{ flex: 1, fontSize: 12, padding: "4px 8px", borderRadius: "var(--rd)", border: "1px solid var(--b1)", background: "var(--s2)", color: "var(--tx)" }}>
                  <option value="">{defaultLabel}</option>
                  {modelOptions.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                {currentModel && (
                  <button onClick={() => setPs(p => ({ ...p, [modelKey]: "" }))} style={{ fontSize: 10, color: "var(--dm)", background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}>✕ reset</button>
                )}
              </div>
            </div>
          );
        })()}
      </div>



      {/* ── Mollie ── */}
      <div style={{ padding: 16, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>🔌 Mollie configuratie</div>
        <div className="settings-2col">
          <Field label="Mollie API Key (Live)" hint={ps.mollie_api_key ? "✓ Ingesteld" : ""}>
            <Inp value={ps.mollie_api_key} onChange={e => setPs(p => ({ ...p, mollie_api_key: e.target.value }))} type="text" autoComplete="off" spellCheck={false} placeholder="live_..." style={{ fontFamily: "monospace", fontSize: 12 }} />
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

      {/* ── EAN Pool Management ── */}
      {(() => {
        const pct = eanPool ? ((eanPool.used / Math.max(eanPool.total, 1)) * 100) : 0;
        const low = eanPool && eanPool.available <= eanThreshold;
        return (
          <div style={{ border: `2px solid ${low ? "rgba(239,68,68,0.4)" : "var(--b1)"}`, borderRadius: "var(--rd-xl)", overflow: "hidden", background: "var(--s2)" }}>
            {/* Header */}
            <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, borderBottom: "1px solid var(--b1)", flexWrap: "wrap" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  🏷 EAN Pool
                  {low && <Badge color="red">⚠ Bijna leeg</Badge>}
                </div>
                <div style={{ fontSize: 12, color: "var(--dm)", marginTop: 2 }}>
                  {eanPoolLoading ? "Laden..." : eanPool ? `${eanPool.available.toLocaleString("nl-NL")} beschikbaar van ${eanPool.total.toLocaleString("nl-NL")} totaal` : eanPoolError ? "Fout bij laden" : "—"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {["status","import","export"].map(t => (
                  <Btn key={t} variant={eanTab === t ? "primary" : "ghost"} size="sm" onClick={() => setEanTab(t)}>
                    {{ status: "📊 Status", import: "📥 Importeer", export: "📤 Exporteer" }[t]}
                  </Btn>
                ))}
                <Btn variant="ghost" size="sm" onClick={loadEanPool} disabled={eanPoolLoading} title="Vernieuwen"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30 }}>
                  <span style={{ display: "inline-block", animation: eanPoolLoading ? "spin 0.8s linear infinite" : "none" }}>↻</span>
                </Btn>
              </div>
            </div>

            {eanPoolError && (
              <div style={{ margin: "0 20px 14px", padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "var(--rd)", fontSize: 12, color: "var(--re)" }}>
                ❌ Fout bij ophalen EAN pool: {eanPoolError}
              </div>
            )}

            <div style={{ padding: 20 }}>

              {/* ── TAB: Status ── */}
              {eanTab === "status" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Stat tiles */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                    {[
                      { label: "Totaal", value: eanPool?.total, color: "var(--tx)" },
                      { label: "Gebruikt", value: eanPool?.used, color: "var(--ac)" },
                      { label: "Beschikbaar", value: eanPool?.available, color: low ? "var(--re)" : "var(--gr)" },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ padding: "12px 14px", background: "var(--s3)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                        <div style={{ fontWeight: 800, fontSize: 22, color }}>{value != null ? value.toLocaleString("nl-NL") : "—"}</div>
                      </div>
                    ))}
                  </div>
                  {/* Progress bar */}
                  {eanPool && <>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--dm)", marginBottom: 4 }}>
                        <span>Gebruik</span><span>{pct.toFixed(1)}%</span>
                      </div>
                      <div style={{ height: 8, background: "var(--s3)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: low ? "var(--re)" : pct > 70 ? "var(--ac)" : "var(--gr)", borderRadius: 99, transition: "width 0.4s" }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--dm)", lineHeight: 1.6 }}>
                      EAN codes worden automatisch toegewezen bij het dupliceren van producten via de <strong>⧉ knop</strong> in de productenlijst.
                      {low && <span style={{ color: "var(--re)", fontWeight: 600, display: "block", marginTop: 4 }}>
                        ⚠ Minder dan {eanThreshold} codes over — importeer nieuwe codes via het <strong>Importeer</strong> tabblad.
                        Bestel nieuwe codes op <a href="https://www.eankoning.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--pr-h)" }}>eankoning.com</a>.
                      </span>}
                    </div>
                  </>}
                  {/* Alert config */}
                  <div style={{ padding: 14, background: "var(--s3)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: "var(--mx)" }}>🔔 E-mailmelding bij lage voorraad</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <Field label="Drempelwaarde" hint="Stuur melding als beschikbaar ≤ dit getal">
                        <Inp value={eanThreshold} onChange={e => setEanThreshold(e.target.value)} type="number" suffix="codes" />
                      </Field>
                      <Field label="E-mailadres melding">
                        <Inp value={eanAlertEmail} onChange={e => setEanAlertEmail(e.target.value)} type="email" placeholder="info@jouwbedrijf.com" />
                      </Field>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Btn variant="secondary" size="sm" onClick={saveEanThreshold} disabled={eanThresholdSaving}>
                        {eanThresholdSaving ? "Opslaan..." : "Instellingen opslaan"}
                      </Btn>
                      <span style={{ fontSize: 11, color: "var(--dm)" }}>Gebruikt <code style={{ background: "var(--s2)", padding: "1px 4px", borderRadius: 3 }}>AWS_SES_ACCESS_KEY_ID</code> + <code style={{ background: "var(--s2)", padding: "1px 4px", borderRadius: 3 }}>AWS_SES_SMTP_PASSWORD</code></span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB: Import ── */}
              {eanTab === "import" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ padding: "12px 14px", background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "var(--rd)", fontSize: 13, lineHeight: 1.7 }}>
                    <strong>Hoe te importeren:</strong><br />
                    1. Bestel nieuwe EAN-codes op <a href="https://www.eankoning.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--pr-h)" }}>eankoning.com</a><br />
                    2. Download het meegeleverde <strong>.xlsx bestand</strong><br />
                    3. Upload het hieronder — duplicaten worden automatisch overgeslagen
                  </div>

                  {/* Drop zone */}
                  <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "32px 20px", border: `2px dashed ${eanImporting ? "var(--pr)" : "var(--b2)"}`, borderRadius: "var(--rd-lg)", cursor: eanImporting ? "wait" : "pointer", background: "var(--s3)", transition: "border-color 0.2s, background 0.2s" }}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--pr)"; e.currentTarget.style.background = "rgba(99,102,241,0.05)"; }}
                    onDragLeave={e => { e.currentTarget.style.borderColor = "var(--b2)"; e.currentTarget.style.background = "var(--s3)"; }}
                    onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--b2)"; e.currentTarget.style.background = "var(--s3)"; const f = e.dataTransfer.files[0]; if (f) handleEanImport(f); }}>
                    <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) { handleEanImport(f); e.target.value = ""; }}} />
                    {eanImporting ? (
                      <>
                        <div style={{ width: 32, height: 32, border: "3px solid var(--b2)", borderTopColor: "var(--pr-h)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                        <div style={{ fontWeight: 600, fontSize: 14 }}>Importeren...</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 36 }}>📥</div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>Klik om .xlsx te selecteren, of sleep hier naartoe</div>
                        <div style={{ fontSize: 12, color: "var(--dm)" }}>Accepteert: .xlsx, .xls, .csv · Verwacht kolom A = EAN-13 codes</div>
                      </>
                    )}
                  </label>

                  {/* Import result */}
                  {eanImportResult && (
                    eanImportResult.error ? (
                      <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "var(--rd)", color: "var(--re)", fontSize: 13 }}>
                        ❌ {eanImportResult.error}
                      </div>
                    ) : (
                      <div style={{ padding: "12px 14px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "var(--rd)", fontSize: 13 }}>
                        ✅ <strong>{eanImportResult.imported?.toLocaleString("nl-NL")} nieuwe EAN-codes</strong> toegevoegd aan de pool
                        {eanImportResult.skipped > 0 && <span style={{ color: "var(--dm)" }}> · {eanImportResult.skipped} duplicaten overgeslagen</span>}
                      </div>
                    )
                  )}
                </div>
              )}

              {/* ── TAB: Export ── */}
              {eanTab === "export" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ padding: "12px 14px", background: "var(--s3)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", fontSize: 13, lineHeight: 1.7 }}>
                    Exporteer een CSV met alle <strong>gebruikte EAN-codes</strong> inclusief de gekoppelde SKU en datum.<br />
                    Handig voor je GS1-administratie of als backup.
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <Btn variant="primary" onClick={handleEanExport} disabled={eanExporting} icon="📤">
                      {eanExporting ? "Exporteren..." : `Download CSV (${eanPool?.used?.toLocaleString("nl-NL") || "?"} regels)`}
                    </Btn>
                    <span style={{ fontSize: 12, color: "var(--dm)" }}>Kolommen: EAN · SKU · Datum · Product ID</span>
                  </div>
                  <div style={{ padding: "10px 12px", background: "var(--s3)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", fontSize: 12, color: "var(--dm)", fontFamily: "monospace" }}>
                    EAN,SKU,Toegewezen op,Product ID<br />
                    8785364874703,FA-5L-100-CM,07/03/2026,13099<br />
                    8785364874710,FA-3L-050-CM,07/03/2026,13100<br />
                    <span style={{ color: "var(--b3)" }}>...</span>
                  </div>
                </div>
              )}

            </div>
          </div>
        );
      })()}

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
  const [view, setView] = useState(initPage || "loading"); // loading | landing | app | welcome | how-it-works | privacy | voorwaarden | contact
  const [welcomePlan, setWelcomePlan] = useState(null);
  const [authModal, setAuthModal] = useState(null);
  const authModalOpenRef = useRef(false); // true while AuthModal is open in payment mode — prevents paywall overlay from firing
  const openAuthModal = (config) => {
    // Any signup or payment modal can lead to a pending_payment login — block paywall during this flow
    if (config && (config.mode === "signup" || config.mode === "payment")) {
      authModalOpenRef.current = true;
    }
    setAuthModal(config);
  };
  const closeAuthModal = () => {
    authModalOpenRef.current = false;
    setAuthModal(null);
  };
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
    const payDeepLink = new URLSearchParams(window.location.search).get("pay") === "1";
    if (payDeepLink) history.replaceState({}, "", "/"); // clean URL immediately
    // If we're on a payment return URL, the verify effect handles everything —
    // don't show the paywall here even if profile says pending_payment
    const isPaymentReturn = window.location.hash.startsWith("#payment-return");
    const init = async () => {
      try {
        const session = await getSession();
        if (session) {
          setCachedToken(session.access_token || null); // seed cache before any handlers run
          const u = session.user;
          setUser({ id: u.id, name: u.user_metadata?.full_name || u.email, email: u.email });
          // Track last activity — fire and forget
          supabase.from("user_profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", u.id).then(() => {});
          // Check plan before deciding view — pending users must see paywall
          // EXCEPT when returning from Mollie: let the verify effect handle the plan state
          if (!isPaymentReturn) {
            const { data: profile } = await supabase.from("user_profiles").select("plan,chosen_plan,billing_period,country,vat_validated").eq("id", u.id).single();
            if (profile?.plan === "pending_payment") {
              setView("app");
              setPendingPaymentData({ chosenPlan: profile.chosen_plan || "growth", billingPeriod: profile.billing_period || "monthly", country: profile.country || "NL", vatValidated: profile.vat_validated || false });
              setPendingPaymentWall(true);
            } else {
              setView("app");
            }
          } else {
            setView("app"); // let verify() handle plan state
          }
        } else {
          // ?pay=1 but not logged in → open login modal, paywall triggers after login via Dashboard useEffect
          if (payDeepLink) {
            setView("landing");
            setTimeout(() => openAuthModal({ mode: "login" }), 300);
          } else {
            setView("landing");
          }
        }
        let signOutTimer = null;
        supabase.auth.onAuthStateChange(async (_event, session) => {
          if (session?.user) {
            // Real session — update token cache and cancel any pending sign-out
            // (tab switch fires SIGNED_OUT then TOKEN_REFRESHED within ~200ms)
            setCachedToken(session.access_token || null);
            if (signOutTimer) { clearTimeout(signOutTimer); signOutTimer = null; }
            const u = session.user;
            setUser({ id: u.id, name: u.user_metadata?.full_name || u.email, email: u.email });
            // Track last activity on every sign-in event
            if (_event === "SIGNED_IN") {
              supabase.from("user_profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", u.id).then(() => {});
            }
            // Always check plan on login — pending_payment users must see paywall
            // BUT: skip if AuthModal is open in payment mode, or if returning from Mollie
            try {
              if (!authModalOpenRef.current && !isPaymentReturn) {
                const { data: profile } = await supabase.from("user_profiles").select("plan,chosen_plan,billing_period,country,vat_validated").eq("id", u.id).single();
                if (profile?.plan === "pending_payment") {
                  setPendingPaymentData({ chosenPlan: profile.chosen_plan || "growth", billingPeriod: profile.billing_period || "monthly", country: profile.country || "NL", vatValidated: profile.vat_validated || false });
                  setPendingPaymentWall(true);
                }
              }
            } catch {}
            setView("app");
          } else {
            // SIGNED_OUT — do NOT clear the token cache yet. Supabase fires SIGNED_OUT during
            // tab switch and token refresh; TOKEN_REFRESHED will arrive within ~1s and cancel this.
            // Clearing the cache immediately causes getToken() to hang on the lock and freeze buttons.
            signOutTimer = setTimeout(() => {
              signOutTimer = null;
              setCachedToken(null); // only clear cache once we're sure it's a real sign-out
              setUser(null);
              setView("landing");
            }, 1000);
          }
        });
      } catch {
        setView("landing");
      }
    };
    init();
  }, []);

  const [paymentReturn, setPaymentReturn] = useState(() => window.location.hash.startsWith("#payment-return"));
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [pendingPaymentWall, setPendingPaymentWall] = useState(false);
  const [pendingPaymentData, setPendingPaymentData] = useState(null);
  const handlePaymentWall = (show, data) => {
    // Never show the paywall overlay while AuthModal is open and handling the payment flow
    if (show && authModalOpenRef.current) return;
    setPendingPaymentWall(show);
    if (data) setPendingPaymentData(data);
  };
  const [paymentReturnStatus, setPaymentReturnStatus] = useState("checking"); // checking | paid | pending | failed | cancelled

  useEffect(() => {
    if (!paymentReturn) return;
    history.replaceState({}, "", "/");

    const verify = async () => {
      try {
        // Wait up to 4s for the session to be available (fresh page load after Mollie redirect)
        let token = await getToken();
        if (!token) {
          await new Promise(r => setTimeout(r, 1500));
          token = await getToken();
        }
        if (!token) {
          // Still no session — nothing to verify, dismiss silently
          setPaymentReturn(false);
          return;
        }
        const res = await fetch("/api/check-payment", {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const mollieStatus = data.status; // paid | open | canceled | expired | failed | pending
        if (mollieStatus === "paid" || data.plan === "free_forever" || (data.plan && PLANS[data.plan])) {
          setPaymentReturnStatus("paid");
          setPendingPaymentWall(false);
          sessionStorage.removeItem("wss_pending_payment_id");
          setProfileRefreshKey(k => k + 1);
          // No auto-dismiss — user must click a button to continue
        } else if (mollieStatus === "canceled" || mollieStatus === "expired" || mollieStatus === "failed") {
          setPaymentReturnStatus("failed");
          // Restore paywall so user can retry payment
          if (user?.id) {
            supabase.from("user_profiles").select("plan,chosen_plan,billing_period,country,vat_validated").eq("id", user.id).single()
              .then(({ data: p }) => {
                if (p?.plan === "pending_payment") {
                  setPendingPaymentData({ chosenPlan: p.chosen_plan || "growth", billingPeriod: p.billing_period || "monthly", country: p.country || "NL", vatValidated: p.vat_validated || false });
                }
              }).catch(() => {});
          }
        } else {
          // open / pending — payment still processing (unusual for credit card but possible)
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
    closeAuthModal();
    // Show welcome page — load plan from profile
    supabase.from("user_profiles").select("plan").eq("id", userData.id).single()
      .then(({ data }) => { setWelcomePlan(data?.plan || "free_forever"); }, () => { setWelcomePlan("free_forever"); });
    setView("welcome");
    try {
      if (window.gtag) window.gtag("event", "signup_complete", { event_category: "conversion" });
      if (window.dataLayer) window.dataLayer.push({ event: "signup_complete" });
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "registration_complete" });
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

  if (view === "welcome") return <><G /><WelcomeView user={user} plan={welcomePlan}
    onContinue={() => setView("app")}
    onAddShop={() => { window.location.hash = "settings"; setView("app"); }}
    onHowItWorks={() => setView("how-it-works")} /></>;
  if (view === "how-it-works") return <><G /><HowItWorksView
    onBack={() => setView(user ? "app" : "welcome")}
    onAddShop={() => { window.location.hash = "settings"; setView("app"); }} /></>;
  if (view === "privacy") return <><G /><PrivacyPage onBack={() => goBack()} /></>;
  if (view === "voorwaarden") return <><G /><VoorwaardenPage onBack={() => goBack()} /></>;
  if (view === "contact") return <><G /><ContactPage onBack={() => goBack()} /></>;

  return (
    <>
      <G />
      <TrackingInjector consent={cookieConsent} />
      {view === "landing" && (
        <LandingPage
          onLogin={() => openAuthModal({ mode: "login" })}
          onSignup={(plan, billingPeriod, trial) => openAuthModal({ mode: "signup", plan: plan || "growth", billingPeriod: billingPeriod || "monthly", trial: !!trial })}
          onPage={goPage}
        />
      )}
      {view === "app" && user && (
        user.email === SUPERADMIN_EMAIL
          ? <SuperAdminDashboard user={user} onLogout={handleLogout} />
          : <Dashboard user={user} onLogout={handleLogout} onPaymentWall={handlePaymentWall} onHowItWorks={() => setView("how-it-works")} profileRefreshKey={profileRefreshKey} />
      )}

      {/* Payment wall — shown when user is logged in but hasn't paid yet */}
      {pendingPaymentWall && view === "app" && user && user.email !== SUPERADMIN_EMAIL && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 9990, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: "var(--rd-xl)", padding: "36px 40px", maxWidth: 520, width: "100%", boxShadow: "0 8px 48px rgba(0,0,0,0.6)" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>💳</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-h)", marginBottom: 6 }}>Betaling nog niet voltooid</h2>
              <p style={{ fontSize: 13, color: "var(--mx)", lineHeight: 1.6 }}>
                Je account is aangemaakt maar de betaling is nog niet afgerond.<br/>
                Kies je pakket en voltooi de betaling om toegang te krijgen.
              </p>
            </div>
            {/* Plan switcher */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--dm)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Pakket</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {["starter","growth","pro"].map(p => (
                  <div key={p} onClick={() => setPendingPaymentData(d => ({ ...d, chosenPlan: p }))}
                    style={{ flex: 1, padding: "10px 6px", borderRadius: "var(--rd)", border: `1px solid ${(pendingPaymentData?.chosenPlan || "growth") === p ? "var(--pr)" : "var(--b1)"}`, background: (pendingPaymentData?.chosenPlan || "growth") === p ? "var(--pr-l)" : "var(--s2)", cursor: "pointer", textAlign: "center", transition: "all 0.15s" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: (pendingPaymentData?.chosenPlan || "growth") === p ? "var(--pr-h)" : "var(--tx)" }}>{PLANS[p]?.name}</div>
                    <div style={{ fontSize: 11, color: "var(--dm)", marginTop: 2 }}>€{getPlanPrice(p, pendingPaymentData?.billingPeriod || "monthly").toFixed(2).replace(".",",")}/mo</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[["monthly","Maandelijks"],["annual","Jaarlijks (10% korting)"]].map(([val, label]) => (
                  <div key={val} onClick={() => setPendingPaymentData(d => ({ ...d, billingPeriod: val }))}
                    style={{ flex: 1, padding: "8px 10px", borderRadius: "var(--rd)", border: `1px solid ${(pendingPaymentData?.billingPeriod || "monthly") === val ? "var(--pr)" : "var(--b1)"}`, background: (pendingPaymentData?.billingPeriod || "monthly") === val ? "var(--pr-l)" : "var(--s2)", cursor: "pointer", textAlign: "center", fontSize: 12, fontWeight: (pendingPaymentData?.billingPeriod || "monthly") === val ? 700 : 400, color: (pendingPaymentData?.billingPeriod || "monthly") === val ? "var(--pr-h)" : "var(--mx)", transition: "all 0.15s" }}>
                    {label}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="secondary" onClick={handleLogout} style={{ flex: "0 0 auto" }}>Uitloggen</Btn>
              <Btn variant="primary" style={{ flex: 1 }} onClick={() => {
                const plan = pendingPaymentData?.chosenPlan || "growth";
                const billing = pendingPaymentData?.billingPeriod || "monthly";
                setPendingPaymentWall(false);
                openAuthModal({ mode: "payment", plan, billingPeriod: billing, country: pendingPaymentData?.country, vatValidated: pendingPaymentData?.vatValidated });
              }}>Betaling voltooien →</Btn>
            </div>
          </div>
        </div>
      )}
      {authModal && (
        <AuthModal
          mode={typeof authModal === "string" ? authModal : authModal?.mode}
          initialPlan={authModal?.plan}
          initialBillingPeriod={authModal?.billingPeriod}
          initialCountry={authModal?.country}
          initialVatValidated={authModal?.vatValidated}
          initialTrial={authModal?.trial ?? false}
          onClose={() => {
            const wasPayment = authModal?.mode === "payment";
            closeAuthModal();
            // If this was a payment modal triggered from the paywall, put the paywall back
            if (wasPayment && user) {
              setPendingPaymentWall(true);
            }
          }}
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
            {paymentReturnStatus === "paid" && (() => {
              const isTrialReturn = profileRefreshKey > 0; // profile was refreshed = we have fresh data
              return <>
                <div style={{ fontSize: 56, marginBottom: 16 }}>🚀</div>
                <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-h)", marginBottom: 8 }}>Welkom bij WooSyncShop!</h2>
                <p style={{ fontSize: 14, color: "var(--mx)", marginBottom: 8, lineHeight: 1.6 }}>
                  Je account is actief. Bevestigingsmail is verstuurd.
                </p>
                <p style={{ fontSize: 13, color: "var(--dm)", marginBottom: 24, lineHeight: 1.6 }}>
                  Voeg je eerste WooCommerce shop toe om te beginnen.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Btn variant="primary" size="lg" style={{ width: "100%" }} onClick={async () => {
                    setPaymentReturn(false); setPendingPaymentWall(false);
                    try { window.dataLayer = window.dataLayer || []; window.dataLayer.push({ event: "registration_complete" }); } catch {}
                    try { const { data: profile } = await supabase.from("user_profiles").select("plan").eq("id", user?.id).single(); setWelcomePlan(profile?.plan || "starter"); } catch { setWelcomePlan("starter"); }
                    setView("welcome");
                  }}>🏪 Aan de slag →</Btn>
                  <Btn variant="ghost" size="sm" style={{ width: "100%", color: "var(--dm)" }} onClick={() => {
                    setPaymentReturn(false); setPendingPaymentWall(false);
                    setView("app");
                  }}>Ga direct naar dashboard</Btn>
                </div>
              </>;
            })()}
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
                <Btn variant="primary" onClick={() => { setPaymentReturn(false); openAuthModal({ mode: "payment" }); }}>Opnieuw betalen →</Btn>
              </div>
            </>}
          </div>
        </div>
      )}
    </>
  );
}
