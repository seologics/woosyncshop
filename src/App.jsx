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
const PRICE_INCL_VAT_NL = 19.99;  // €19,99 incl. 21% BTW for NL
const NL_VAT_RATE = 21;
const BASE_PRICE_EXCL = parseFloat((PRICE_INCL_VAT_NL / 1.21).toFixed(4)); // ~16.52 excl.

const getVatInfo = (countryCode, vatValidated) => {
  const euC = EU_COUNTRIES.find(c => c.code === countryCode);
  if (!countryCode || countryCode === "NL") {
    // 19.99 is the incl. price; show excl. as breakdown only
    return { rate: NL_VAT_RATE, excl: BASE_PRICE_EXCL.toFixed(2), total: PRICE_INCL_VAT_NL.toFixed(2) };
  }
  if (euC && vatValidated) {
    return { rate: 0, excl: BASE_PRICE_EXCL.toFixed(2), total: BASE_PRICE_EXCL.toFixed(2), reverseCharge: true };
  }
  if (euC) {
    const total = parseFloat((BASE_PRICE_EXCL * (1 + euC.vat / 100)).toFixed(2));
    return { rate: euC.vat, excl: BASE_PRICE_EXCL.toFixed(2), total: total.toFixed(2) };
  }
  return { rate: 0, excl: BASE_PRICE_EXCL.toFixed(2), total: BASE_PRICE_EXCL.toFixed(2) };
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
  { value: "fr_BE", label: "fr_BE – Français (BE)" },
  { value: "nl_BE", label: "nl_BE – Nederlands (BE)" },
  { value: "de_DE", label: "de_DE – Deutsch (DE)" },
  { value: "en_US", label: "en_US – English (US)" },
  { value: "en_GB", label: "en_GB – English (GB)" },
  { value: "fr_FR", label: "fr_FR – Français (FR)" },
];

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
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="slide-up" style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: "var(--rd-xl)", width: "100%", maxWidth: width, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
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
  <div style={{ display: "flex", gap: 2, background: "var(--s2)", padding: 3, borderRadius: "var(--rd)", flexWrap: "wrap" }}>
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

const ProductEditModal = ({ product, open, onClose, onSave, sites, activeSite }) => {
  const hasWqm = activeSite?.installed_plugins?.includes("woocommerce-quantity-manager") || activeSite?.has_wqm;
  const editTabs = hasWqm
    ? [...BASE_EDIT_TABS.slice(0, 3), { id: "quantity", label: "Hoeveelheid", icon: "🔢" }, ...BASE_EDIT_TABS.slice(3)]
    : BASE_EDIT_TABS;
  const [tab, setTab] = useState("general");
  const [p, setP] = useState(null);
  const [confirmAttr, setConfirmAttr] = useState(null);

  useEffect(() => { if (product) setP(JSON.parse(JSON.stringify(product))); }, [product]);

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
  const filteredTabs = isVariable ? EDIT_TABS : EDIT_TABS.filter(t => t.id !== "variations");

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
            {p.variations.map((v, vi) => (
              <div key={v.id} style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: "var(--s2)", display: "flex", alignItems: "center", gap: 10 }}>
                  <Badge color="default">#{v.id}</Badge>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{Object.entries(v.attributes).map(([k, val]) => `${GLOBAL_ATTRIBUTES.find(a => a.slug === k)?.name || k}: ${val}`).join(" · ")}</span>
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
            {GLOBAL_ATTRIBUTES.map(attr => {
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
                {CATEGORIES.map(cat => (
                  <Chk key={cat.id} checked={(p.categories || []).includes(cat.id)} onChange={c => {
                    const cats = c ? [...(p.categories || []), cat.id] : (p.categories || []).filter(id => id !== cat.id);
                    upd("categories", cats);
                  }} label={cat.name} />
                ))}
              </div>
            </Field>
          </div>
        )}

        {/* ── AFBEELDINGEN ── */}
        {tab === "images" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="fade-in">
            <Field label="Uitgelichte afbeelding">
              <div style={{ width: 140, height: 140, border: "2px dashed var(--b2)", borderRadius: "var(--rd-lg)", overflow: "hidden", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--s2)", position: "relative" }}>
                {p.featured_image ? <img src={p.featured_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ textAlign: "center", color: "var(--dm)", fontSize: 12 }}>📷<br/>Klik om te uploaden</div>}
              </div>
            </Field>
            <Divider />
            <Field label="Galerij afbeeldingen">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(p.gallery_images || []).map((img, i) => (
                  <div key={i} style={{ width: 90, height: 90, border: "1px solid var(--b1)", borderRadius: "var(--rd)", overflow: "hidden", position: "relative" }}>
                    <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                ))}
                <div style={{ width: 90, height: 90, border: "2px dashed var(--b2)", borderRadius: "var(--rd)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--s2)", color: "var(--dm)", fontSize: 24 }}>+</div>
              </div>
            </Field>
            <div style={{ padding: 12, background: "var(--pr-l)", borderRadius: "var(--rd)", border: "1px solid rgba(91,91,214,0.2)" }}>
              <div style={{ fontSize: 12, color: "var(--pr-h)", fontWeight: 600, marginBottom: 4 }}>🤖 AI Image Pipeline actief</div>
              <div style={{ fontSize: 12, color: "var(--mx)" }}>Geüploade afbeeldingen worden automatisch geoptimaliseerd via Gemini (resize) → TinyPNG (compressie) → max 400KB output.</div>
            </div>
          </div>
        )}

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
        <div style={{ fontSize: 12, color: "var(--dm)" }}>Wijzigingen worden lokaal opgeslagen · Gebruik <strong style={{ color: "var(--tx)" }}>Push</strong> om te publiceren</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" onClick={onClose}>Annuleren</Btn>
          <Btn variant="primary" onClick={() => { onSave(p); onClose(); }}>Opslaan</Btn>
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
              <Btn variant="primary" onClick={() => {
                const attr = confirmAttr.attr;
                const pa = p.attributes?.find(a => a.slug === attr.slug) || { id: attr.id, slug: attr.slug, values: [], visible: false, variation: false };
                const idx = p.attributes?.findIndex(a => a.slug === attr.slug) ?? -1;
                const newPa = { ...pa, values: [...pa.values, confirmAttr.term] };
                const attrs = [...(p.attributes || [])];
                if (idx >= 0) attrs[idx] = newPa; else attrs.push(newPa);
                upd("attributes", attrs);
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
        <div style={{ display: "grid", gridTemplateColumns: "28px 44px 1fr 100px 100px 90px 90px 110px", gap: 0, background: "var(--s2)", borderBottom: "1px solid var(--b1)", padding: "8px 12px", alignItems: "center" }}>
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
                      {Object.entries(v.attributes).map(([k, val]) => <Badge key={k} color="default" size="sm">{GLOBAL_ATTRIBUTES.find(a => a.slug === k)?.name}: {val}</Badge>)}
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
const ConnectedSitesView = ({ products, sites }) => {
  const [syncMode, setSyncMode] = useState("sku");
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Verbonden producten beheren</h2>
          <p style={{ fontSize: 13, color: "var(--mx)" }}>Koppel producten van verschillende shops aan elkaar via SKU of 'identifier' attribuut.</p>
        </div>
        <Tabs tabs={[{ id: "sku", label: "Via SKU" }, { id: "identifier", label: "Via Identifier" }]} active={syncMode} onChange={setSyncMode} size="sm" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {products.map(p => (
          <div key={p.id} style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", padding: 14, background: "var(--s1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              {p.featured_image && <img src={p.featured_image} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} />}
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "var(--dm)" }}>SKU: {p.sku}</div>
              </div>
              {(p.connected_sites || []).length > 1 && <Badge color="green" style={{ marginLeft: "auto" }}>🔗 {p.connected_sites.length} shops verbonden</Badge>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {sites.map(s => (
                <div key={s.id} style={{ flex: 1, padding: "8px 10px", borderRadius: "var(--rd)", border: `1px solid ${(p.connected_sites || []).includes(s.id) ? s.color + "60" : "var(--b1)"}`, background: (p.connected_sites || []).includes(s.id) ? s.color + "15" : "var(--s2)", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{s.flag} {s.name}</span>
                    <Tog checked={(p.connected_sites || []).includes(s.id)} onChange={() => {}} />
                  </div>
                  {(p.connected_sites || []).includes(s.id) && <span style={{ fontSize: 10, color: "var(--mx)" }}>SKU: {p.sku}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
  const [mappings, setMappings] = useState([
    { id: 1, source_site: 1, target_site: 2, source_url: "/bamboe-planten/", target_url: "/plantes-bambou/", x_default: true },
    { id: 2, source_site: 1, target_site: 3, source_url: "/bamboe-planten/", target_url: "/bamboe-planten/", x_default: false },
  ]);
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Hreflang Manager</h2>
        <p style={{ fontSize: 13, color: "var(--mx)" }}>Beheer hreflang-koppelingen tussen jouw shops. Elke shop heeft zijn eigen WordPress installatie.</p>
      </div>
      <div style={{ padding: 14, background: "var(--pr-l)", borderRadius: "var(--rd)", border: "1px solid rgba(91,91,214,0.2)", marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "var(--pr-h)", fontWeight: 600, marginBottom: 4 }}>Automatische hreflang-injectie</div>
        <div style={{ fontSize: 12, color: "var(--mx)" }}>Woo Sync Shop genereert automatisch correcte hreflang-tags op basis van verbonden producten en pagina-koppelingen. De tags worden via onze WordPress plugin geïnjecteerd.</div>
      </div>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>URL Koppelingen</div>
        <Btn variant="primary" size="sm" onClick={() => alert("Koppel producten via de 'Verbonden' tab — selecteer een product en klik 🔗 om het te verbinden.")}>+ Koppeling toevoegen</Btn>
      </div>
      <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 90px", gap: 0, background: "var(--s2)", padding: "8px 14px", borderBottom: "1px solid var(--b1)" }}>
          {["Bronshop + URL", "Doelshop + URL", "Hreflang tag", "x-default"].map((h, i) => <span key={i} style={{ fontSize: 11, color: "var(--dm)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</span>)}
        </div>
        {mappings.map(m => {
          const src = sites.find(s => s.id === m.source_site);
          const tgt = sites.find(s => s.id === m.target_site);
          return (
            <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 90px", gap: 0, padding: "10px 14px", borderBottom: "1px solid var(--b1)", alignItems: "center" }}>
              <div><Badge color="default" size="sm">{src?.flag} {src?.name}</Badge><div style={{ fontSize: 11, color: "var(--dm)", marginTop: 3 }}>{m.source_url}</div></div>
              <div><Badge color="default" size="sm">{tgt?.flag} {tgt?.name}</Badge><div style={{ fontSize: 11, color: "var(--dm)", marginTop: 3 }}>{m.target_url}</div></div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--pr-h)" }}>
                hreflang="{tgt?.locale.replace("_", "-").toLowerCase()}"
              </div>
              <Chk checked={m.x_default} onChange={() => {}} label="x-default" />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Admin Panel (superadmin only) ────────────────────────────────────────────
const AdminPanel = () => {
  const [adminTab, setAdminTab] = useState("users");
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
        max_shops: u.max_shops ? parseInt(u.max_shops) : 10,
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
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ padding: "4px 10px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 20, fontSize: 11, color: "var(--re)", fontWeight: 700, letterSpacing: "0.05em" }}>ADMIN</div>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Beheerpaneel</h2>
      </div>
      <Tabs tabs={[{ id: "users", label: "👥 Gebruikers" }, { id: "payments", label: "💳 Betalingen" }, { id: "platform", label: "⚙ Platform" }, { id: "tracking", label: "📊 Tracking" }, { id: "logs", label: "📋 Logs" }]} active={adminTab} onChange={setAdminTab} />
      <div style={{ marginTop: 20 }}>

        {/* Users */}
        {adminTab === "users" && (() => {
          const loadInvoices = async (u) => {
            setInvoiceUser(u); setInvoicesLoading(true);
            try {
              const { data } = await supabase.from("invoices").select("*").eq("user_id", u.id).order("issued_at", { ascending: false });
              setUserInvoices(data || []);
            } catch {} finally { setInvoicesLoading(false); }
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
                      {u.plan === "free_forever" ? "🎁 Free ∞" : u.plan === "suspended" ? "Gesuspendeerd" : "Pro"}
                    </Badge>
                    <span style={{ fontSize: 13 }}>{u.sites || 0} / {u.max_shops || 10}</span>
                    <Badge color={u.plan === "free_forever" ? "green" : u.status === "active" ? "green" : "amber"} size="sm">
                      {u.plan === "free_forever" ? "Free forever" : u.status === "active" ? "Actief" : "In afwachting"}
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
                <Overlay open onClose={() => setInvoiceUser(null)} width={620} title={`Facturen: ${invoiceUser.full_name || invoiceUser.email}`}>
                  <div style={{ padding: 20 }}>
                    {invoicesLoading ? (
                      <div style={{ color: "var(--mx)", fontSize: 13 }}>Laden...</div>
                    ) : userInvoices.length === 0 ? (
                      <div style={{ color: "var(--dm)", fontSize: 13, padding: "20px 0" }}>Geen facturen gevonden voor deze gebruiker.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "130px 1fr 80px 80px 80px", gap: 0, background: "var(--s2)", padding: "7px 12px", borderRadius: "var(--rd)", marginBottom: 4 }}>
                          {["Nummer", "Datum", "Excl.", "BTW", "Totaal"].map(h => (
                            <span key={h} style={{ fontSize: 11, color: "var(--dm)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</span>
                          ))}
                        </div>
                        {userInvoices.map(inv => (
                          <div key={inv.id} style={{ display: "grid", gridTemplateColumns: "130px 1fr 80px 80px 80px", gap: 0, padding: "9px 12px", background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", alignItems: "center" }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: "var(--pr-h)" }}>{inv.invoice_number}</span>
                            <span style={{ fontSize: 12, color: "var(--mx)" }}>{new Date(inv.issued_at).toLocaleDateString("nl-NL")}</span>
                            <span style={{ fontSize: 13 }}>€{parseFloat(inv.amount_excl_vat || 0).toFixed(2).replace(".", ",")}</span>
                            <span style={{ fontSize: 13 }}>€{parseFloat(inv.vat_amount || 0).toFixed(2).replace(".", ",")}</span>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>€{parseFloat(inv.amount || 0).toFixed(2).replace(".", ",")}</span>
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
                <Badge color={editUser.plan === "free_forever" ? "green" : editUser.plan === "suspended" ? "red" : "blue"}>{editUser.plan === "free_forever" ? "🎁 Free forever" : editUser.plan === "suspended" ? "Gesuspendeerd" : "Pro €19,99/mnd"}</Badge>
                <Badge color={editUser.plan === "suspended" ? "red" : editUser.status === "active" ? "green" : "amber"}>{editUser.plan === "suspended" ? "Gesuspendeerd" : editUser.status === "active" ? "Actief" : "In afwachting"}</Badge>
              </div>
            </div>
            <Field label="Plan">
              <Sel value={editUser.plan} onChange={e => setEditUser(u => ({ ...u, plan: e.target.value }))} options={[{ value: "pro", label: "Pro – €19,99 / maand" }, { value: "free_forever", label: "Free forever (code: freeforever)" }, { value: "suspended", label: "Gesuspendeerd" }]} />
            </Field>
            <Field label="Max shops (override)" hint="Standaard: 10">
              <Inp value="10" onChange={() => {}} type="number" />
            </Field>
            <Divider />
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--mx)", textTransform: "uppercase", letterSpacing: "0.04em" }}>🤖 AI image pipeline (per gebruiker)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
const MOCK_AI_CACHE = [
  { source_locale: "nl_NL", target_locale: "fr_BE", field: "category", source_term: "Bamboe planten", target_term: "Plantes de bambou", confidence: 0.97, model: "gemini-2.0-flash", used: 14 },
  { source_locale: "nl_NL", target_locale: "fr_BE", field: "category", source_term: "Fargesia", target_term: "Fargesia", confidence: 1.00, model: "gemini-2.0-flash", used: 9 },
  { source_locale: "nl_NL", target_locale: "fr_BE", field: "category", source_term: "Bamboehaag", target_term: "Haie de bambou", confidence: 0.94, model: "gemini-2.0-flash", used: 7 },
  { source_locale: "nl_NL", target_locale: "fr_BE", field: "attribute", source_term: "Groen", target_term: "Vert", confidence: 1.00, model: "gemini-2.0-flash", used: 22 },
  { source_locale: "nl_NL", target_locale: "fr_BE", field: "attribute", source_term: "100-125cm", target_term: "100-125cm", confidence: 1.00, model: "gemini-2.0-flash", used: 18 },
  { source_locale: "nl_NL", target_locale: "nl_BE", field: "category", source_term: "Bamboe planten", target_term: "Bamboe planten", confidence: 1.00, model: "gemini-2.0-flash-lite", used: 14 },
  { source_locale: "nl_NL", target_locale: "nl_BE", field: "attribute", source_term: "Op voorraad", target_term: "Op voorraad", confidence: 1.00, model: "gemini-2.0-flash-lite", used: 8 },
];

const AiTranslationSettings = ({ enabled, onToggleEnabled, locked = false }) => {
  const [cache, setCache] = useState(MOCK_AI_CACHE);
  const [filterLocale, setFilterLocale] = useState("all");
  const [filterField, setFilterField] = useState("all");
  const [testOpen, setTestOpen] = useState(false);
  const [testSource, setTestSource] = useState("Bamboehaag");
  const [testSrcLocale, setTestSrcLocale] = useState("nl_NL");
  const [testTgtLocale, setTestTgtLocale] = useState("fr_BE");
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);

  const filteredCache = cache.filter(e =>
    (filterLocale === "all" || e.target_locale === filterLocale) &&
    (filterField === "all" || e.field === filterField)
  );

  const runTest = () => {
    setTestLoading(true);
    setTestResult(null);
    setTimeout(() => {
      setTestResult({ term: "Haie de bambou", confidence: 0.94, cached: false, model: "gemini-2.0-flash" });
      setTestLoading(false);
    }, 1400);
  };

  const clearEntry = (idx) => setCache(c => c.filter((_, i) => i !== idx));

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
                <div style={{ gridColumn: "1/-1", padding: 12, background: "var(--s3)", borderRadius: "var(--rd)", border: "1px solid var(--b2)", display: "flex", gap: 16, alignItems: "center" }} className="slide-up">
                  <div>
                    <span style={{ fontSize: 11, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Resultaat</span>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--gr)", marginTop: 2 }}>{testResult.term}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Betrouwbaarheid</span>
                    <div style={{ fontSize: 15, fontWeight: 700, color: testResult.confidence >= 0.9 ? "var(--gr)" : "var(--ac)", marginTop: 2 }}>{Math.round(testResult.confidence * 100)}%</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: "var(--dm)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Model</span>
                    <div style={{ fontSize: 12, color: "var(--mx)", marginTop: 2 }}>{testResult.model}</div>
                  </div>
                  <Badge color={testResult.cached ? "amber" : "blue"} style={{ marginLeft: "auto" }}>{testResult.cached ? "📦 Uit cache" : "✨ Nieuw gegenereerd"}</Badge>
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
              <Btn variant="danger" size="sm" onClick={() => setCache([])}>Cache wissen</Btn>
            </div>
          </div>
          <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd)", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "90px 80px 1fr 1fr 70px 50px 24px", gap: 0, background: "var(--s3)", padding: "6px 12px", borderBottom: "1px solid var(--b1)" }}>
              {["Type", "Richting", "Bronterm", "Doelterm", "Vertrouwen", "Gebruikt", ""].map((h, i) => (
                <span key={i} style={{ fontSize: 10, color: "var(--dm)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
              ))}
            </div>
            {filteredCache.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: "var(--dm)", fontSize: 13 }}>Geen gecachede vertalingen.</div>
            )}
            {filteredCache.map((e, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 80px 1fr 1fr 70px 50px 24px", gap: 0, padding: "8px 12px", borderBottom: "1px solid var(--b1)", alignItems: "center", fontSize: 12 }}>
                <Badge color={e.field === "category" ? "blue" : "default"} size="sm">{e.field === "category" ? "categorie" : "attribuut"}</Badge>
                <span style={{ color: "var(--dm)", fontSize: 11 }}>{e.source_locale.split("_")[1]} → {e.target_locale.split("_")[1]}</span>
                <span style={{ color: "var(--mx)" }}>{e.source_term}</span>
                <span style={{ fontWeight: 500 }}>{e.target_term}</span>
                <span style={{ color: e.confidence >= 0.95 ? "var(--gr)" : e.confidence >= 0.80 ? "var(--ac)" : "var(--re)", fontWeight: 600 }}>{Math.round(e.confidence * 100)}%</span>
                <span style={{ color: "var(--dm)" }}>{e.used}×</span>
                <button onClick={() => clearEntry(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dm)", fontSize: 13, padding: 0 }} title="Verwijder uit cache">×</button>
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
  const isPending = userProfile?.plan === "pro" && !userProfile?.mollie_customer_id;
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

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
        ) : (
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-h)", color: "var(--pr-h)" }}>€{userProfile?.price_total || "19,99"} <span style={{ fontSize: 14, fontWeight: 400, color: "var(--mx)" }}>/ maand</span></div>
        )}
        <div style={{ fontSize: 13, color: "var(--mx)", marginTop: 4 }}>Tot {userProfile?.max_shops || 10} WordPress installaties</div>
        {isFreeForever
          ? <Badge color="green" style={{ marginTop: 8, display: "inline-flex" }}>✓ Free forever account</Badge>
          : isPending
            ? <Badge color="amber" style={{ marginTop: 8, display: "inline-flex" }}>⏳ Betaling in afwachting</Badge>
            : <Badge color="blue" style={{ marginTop: 8, display: "inline-flex" }}>✓ Pro · betaald via Mollie</Badge>
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
      <Tabs tabs={[{ id: "sites", label: "🏪 Mijn shops" }, { id: "ai", label: "🤖 AI Vertaling" }, { id: "billing", label: "💳 Abonnement" }, { id: "profile", label: "👤 Profiel" }]} active={settingsTab} onChange={setSettingsTab} />
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Naam" required><Inp value={newShop.name} onChange={e => setNewShop(s => ({ ...s, name: e.target.value }))} placeholder="bijv. HaagDirect NL" /></Field>
                  <Field label="Site URL" required><Inp value={newShop.site_url} onChange={e => setNewShop(s => ({ ...s, site_url: e.target.value.replace(/\/$/, "") }))} placeholder="https://mijnshop.nl" /></Field>
                  <Field label="Taal / Locale" required><Sel value={newShop.locale} onChange={v => setNewShop(s => ({ ...s, locale: v }))} options={LOCALE_OPTIONS} /></Field>
                  <Field label="Vlag emoji"><Inp value={newShop.flag} onChange={e => setNewShop(s => ({ ...s, flag: e.target.value }))} placeholder="🇳🇱" /></Field>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Naam"><Inp value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} /></Field>
              <Field label="Bedrijfsnaam (optioneel)"><Inp value={profileForm.business_name || ""} onChange={e => setProfileForm(f => ({ ...f, business_name: e.target.value }))} placeholder="Jouw bedrijf B.V." /></Field>
            </div>
            <Field label="E-mailadres"><Inp value={user?.email || ""} onChange={() => {}} type="email" readOnly style={{ opacity: 0.6 }} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
      </div>
    </div>
  );
};

// ─── Top Nav ──────────────────────────────────────────────────────────────────
const TopNav = ({ activeSite, setActiveSite, sites, activeView, setActiveView, pendingCount, onSync, onPush, isAdmin, onLogout, user }) => {
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pushing, setPushing] = useState(false);

  const handleSync = () => { setSyncing(true); setTimeout(() => { setSyncing(false); onSync?.(); }, 1800); };
  const handlePush = () => { setPushing(true); setTimeout(() => { setPushing(false); onPush?.(); }, 2200); };

  return (
    <div style={{ height: 56, background: "var(--s1)", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", padding: "0 16px", gap: 10, position: "sticky", top: 0, zIndex: 100, flexShrink: 0 }}>
      {/* Logo */}
      <div onClick={() => setActiveView("products")} style={{ marginRight: 8, cursor: "pointer", display: "flex", alignItems: "center" }}>
        <img src="/woo-sync-shop-logo.png" alt="Woo Sync Shop" style={{ height: 22 }} />
      </div>

      {/* Site Switcher */}
      <div style={{ position: "relative" }}>
        <button onClick={() => setSiteOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: "var(--rd)", cursor: "pointer", color: "var(--tx)", fontSize: 13, fontWeight: 500, minWidth: 200 }}>
          <span>{activeSite?.flag}</span>
          <span style={{ flex: 1, textAlign: "left" }}>{activeSite?.name}</span>
          <span style={{ color: "var(--dm)", fontSize: 11 }}>{siteOpen ? "▲" : "▼"}</span>
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

      {/* View Tabs */}
      <div style={{ display: "flex", gap: 2, marginLeft: 4 }}>
        {[["products", "📦 Producten"], ["connected", "🔗 Verbonden"], ["hreflang", "🌐 Hreflang"], ["marketing", "📣 Marketing"], ["settings", "⚙ Instellingen"], ...(isAdmin ? [["admin", "🛡 Admin"]] : [])].map(([id, label]) => (
          <button key={id} onClick={() => setActiveView(id)} style={{ padding: "5px 12px", background: activeView === id ? (id === "admin" ? "rgba(239,68,68,0.15)" : "var(--s2)") : "transparent", border: activeView === id ? (id === "admin" ? "1px solid rgba(239,68,68,0.3)" : "1px solid var(--b2)") : "1px solid transparent", borderRadius: "var(--rd)", cursor: "pointer", color: activeView === id ? (id === "admin" ? "var(--re)" : "var(--tx)") : id === "admin" ? "rgba(239,68,68,0.7)" : "var(--mx)", fontSize: 12, fontWeight: activeView === id ? 600 : 400, transition: "all 0.15s" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        {pendingCount > 0 && <Badge color="amber">{pendingCount} wijzigingen</Badge>}
        <Btn variant="secondary" size="sm" onClick={handleSync} disabled={syncing} icon={syncing ? <span className="spin">↻</span> : "↔"}>
          {syncing ? "Bezig..." : "Sync"}
        </Btn>
        <Btn variant="accent" size="sm" onClick={handlePush} disabled={pushing} icon={pushing ? <span className="spin">↻</span> : "↑"}>
          {pushing ? "Pushen..." : "Push naar shops"}
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
  );
};

// ─── SuperAdmin Dashboard ──────────────────────────────────────────────────────
const SuperAdminDashboard = ({ user, onLogout }) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)" }}>
      {/* Superadmin nav */}
      <nav style={{ height: 56, padding: "0 24px", display: "flex", alignItems: "center", gap: 16, background: "var(--s1)", borderBottom: "1px solid var(--b1)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/woo-sync-shop-logo.png" alt="Woo Sync Shop" style={{ height: 24 }} />
          <span style={{ fontSize: 11, padding: "2px 6px", background: "var(--pr-l)", color: "var(--pr-h)", borderRadius: 4, fontFamily: "var(--font-b)", fontWeight: 600 }}>SUPERADMIN</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "var(--mx)" }}>{user.email}</span>
          <Btn variant="ghost" size="sm" onClick={onLogout}>Uitloggen</Btn>
        </div>
      </nav>
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        <AdminPanel />
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

  // Load products from WooCommerce when active shop changes
  useEffect(() => {
    if (!activeSite) return;
    const loadProducts = async () => {
      setProductsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Niet ingelogd");
        const res = await fetch("/api/woo", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ shop_id: activeSite.id, endpoint: "products?per_page=50&orderby=date&order=desc", method: "GET" })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setProducts(data.map(p => ({ ...p, pending_changes: {} })));
        } else {
          console.error("WooCommerce error:", data);
          setProducts([]);
        }
      } catch (e) {
        console.error("Failed to load products:", e);
        notify("Producten laden mislukt: " + e.message, "error");
        setProducts([]);
      } finally {
        setProductsLoading(false);
      }
    };
    loadProducts();
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
        onSync={() => notify("Synchronisatie gestart ✓")}
        onPush={() => notify("Wijzigingen gepushed ✓")} />
      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
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
            {activeView === "connected" && <ConnectedSitesView products={products} sites={shops} />}
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
        onSave={updated => {
          setProducts(products.map(p => p.id === updated.id ? { ...updated, pending_changes: { ...p.pending_changes, _edited: true } } : p));
          notify("Product opgeslagen — gebruik Sync/Push om te publiceren");
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
const AuthModal = ({ mode, onClose, onSuccess }) => {
  const [step, setStep] = useState(mode === "signup" ? "form" : mode === "reset" ? "reset" : mode === "payment" ? "payment" : "login");
  const [form, setForm] = useState({
    name: "", email: "", password: "", code: "",
    business_name: "", country: "NL",
    vat_number: "", vat_validated: false, vat_checking: false, vat_error: null,
    address_street: "", address_zip: "", address_city: "",
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
  const vatInfo = getVatInfo(form.country, form.vat_validated);
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

      const vi = getVatInfo(form.country, form.vat_validated);

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
            plan: isFree ? "free_forever" : "pro",
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
      const vi = getVatInfo(form.country, form.vat_validated);
      const res = await fetch("/api/mollie-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({
          email: form.email,
          name: form.name,
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
    <Overlay open onClose={onClose} width={440} title={null}>
      <div style={{ padding: 32 }}>
        {error && (
          <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--rd)", marginBottom: 16, fontSize: 13, color: "#ef4444" }}>
            {error}
          </div>
        )}

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
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Account aanmaken</h2>
          <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 20 }}>Start met het beheren van al jouw webshops</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
          <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 16 }}>Start je Pro abonnement</p>
          <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--mx)" }}>Woo Sync Shop Pro · 1 maand</span>
            <span style={{ fontWeight: 700 }}>€{getVatInfo(form.country, form.vat_validated).total}</span>
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
          <Btn variant="primary" onClick={onSignup}>Gratis proberen</Btn>
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
      <div style={{ padding: "80px 32px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 12 }}>Simpele, eerlijke prijs</h2>
        <p style={{ fontSize: 16, color: "var(--mx)", marginBottom: 40 }}>Één plan, geen verborgen kosten</p>
        <div style={{ background: "var(--s1)", border: "1px solid var(--b2)", borderRadius: "var(--rd-xl)", padding: 36, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -60, right: -60, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(91,91,214,0.25) 0%, transparent 70%)" }} />
          <Badge color="blue" style={{ marginBottom: 20, display: "inline-flex" }}>Meest populair</Badge>
          <div style={{ fontSize: 48, fontWeight: 800, fontFamily: "var(--font-h)", letterSpacing: "-0.03em" }}>€19,99 <span style={{ fontSize: 18, fontWeight: 400, color: "var(--mx)" }}>/ maand</span></div>
          <div style={{ margin: "20px 0", display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
            {["Tot 10 WordPress installaties", "Onbeperkte producten", "AI image optimalisatie", "Hreflang manager inbegrepen", "Realtime voorraadsynchronisatie", "Transactionele e-mails"].map(f => (
              <div key={f} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
                <span style={{ color: "var(--gr)", fontWeight: 700, fontSize: 15 }}>✓</span>
                <span style={{ color: "var(--mx)" }}>{f}</span>
              </div>
            ))}
          </div>
          <Btn variant="primary" size="lg" onClick={onSignup} style={{ width: "100%", marginTop: 8, fontSize: 15 }}>Nu starten →</Btn>
          <div style={{ marginTop: 14, fontSize: 12, color: "var(--dm)" }}>Heb je een kortingscode? Die voer je in bij registratie.</div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--b1)", padding: "24px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--dm)", fontSize: 12 }}>
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
        if (settings.gtm_id && !document.getElementById("wss-gtm")) {
          const s = document.createElement("script");
          s.id = "wss-gtm";
          s.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${settings.gtm_id}');`;
          document.head.appendChild(s);
          window.dataLayer = window.dataLayer || [];
        }
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
      } catch {}
    };
    inject();
  }, []);
  return null;
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
const ContactPage = ({ onBack }) => {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [status, setStatus] = useState(null); // null | "sending" | "ok" | "error"
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
      if (data.ok) { setStatus("ok"); setForm({ name: "", email: "", subject: "", message: "" }); }
      else { setStatus("error"); }
    } catch { setStatus("error"); }
  };

  return (
    <PageLayout title="Contact" onBack={onBack}>
      <p style={{ marginBottom: 32 }}>Heb je een vraag, een technisch probleem of wil je samenwerken? Stuur ons een bericht en we reageren binnen 1 werkdag.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Naam"><Inp value={form.name} onChange={e => upd("name", e.target.value)} placeholder="Jouw naam" /></Field>
            <Field label="E-mailadres"><Inp value={form.email} onChange={e => upd("email", e.target.value)} type="email" placeholder="jij@domein.nl" /></Field>
            <Field label="Onderwerp"><Inp value={form.subject} onChange={e => upd("subject", e.target.value)} placeholder="Bijv. Technisch probleem" /></Field>
            <Field label="Bericht"><Inp value={form.message} onChange={e => upd("message", e.target.value)} multiline rows={5} placeholder="Beschrijf je vraag of probleem..." /></Field>
            {status === "ok" && <div style={{ padding: "12px 16px", background: "var(--gr-l)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "var(--rd)", fontSize: 13, color: "var(--gr)" }}>✓ Bericht verzonden! We reageren binnen 1 werkdag.</div>}
            {status === "error" && <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--rd)", fontSize: 13, color: "#ef4444" }}>Versturen mislukt. Probeer het opnieuw of mail ons direct.</div>}
            <Btn variant="primary" onClick={send} disabled={status === "sending"}>{status === "sending" ? "Verzenden..." : "Bericht sturen →"}</Btn>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {[
            { icon: "📧", title: "E-mail", val: "info@woosyncshop.com", href: "mailto:info@woosyncshop.com" },
            { icon: "🌐", title: "Website", val: "woosyncshop.com", href: "https://woosyncshop.com" },
            { icon: "🕐", title: "Reactietijd", val: "Binnen 1 werkdag" },
            { icon: "📍", title: "Locatie", val: "Nederland" },
          ].map(({ icon, title, val, href }) => (
            <div key={title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 40, height: 40, background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icon}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--tx)", marginBottom: 2 }}>{title}</div>
                {href ? <a href={href} style={{ color: "var(--pr-h)", fontSize: 14, textDecoration: "none" }}>{val}</a> : <div style={{ color: "var(--mx)", fontSize: 14 }}>{val}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageLayout>
  );
};

// ─── Tracking Admin Tab ────────────────────────────────────────────────────────
// ─── System Logs Panel ────────────────────────────────────────────────────────
const LEVEL_COLORS = {
  error: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", text: "var(--re)", dot: "#ef4444" },
  warn:  { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", text: "var(--am)", dot: "#f59e0b" },
  info:  { bg: "rgba(99,102,241,0.06)", border: "rgba(99,102,241,0.2)", text: "var(--pr-h)", dot: "#6366f1" },
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
const PlatformSettings = () => {
  const [ps, setPs] = useState({ gemini_api_key: "", tinypng_api_key: "", mollie_api_key: "", contact_notification_email: "" });
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
        const res = await fetch("/api/platform-settings", {
          headers: { "Authorization": `Bearer ${session?.access_token}` }
        });
        const d = await res.json();
        setPs(p => ({ ...p, gemini_api_key: d.gemini_api_key || "", tinypng_api_key: d.tinypng_api_key || "", mollie_api_key: d.mollie_api_key || "", contact_notification_email: d.contact_notification_email || "" }));
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>🌐 Platform-brede API keys</div>
        <div style={{ fontSize: 12, color: "var(--mx)", marginBottom: 12 }}>Deze keys gelden als fallback wanneer een gebruiker geen eigen keys heeft ingesteld.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Platform Gemini API Key">
            <Inp value={ps.gemini_api_key} onChange={e => setPs(p => ({ ...p, gemini_api_key: e.target.value }))} type="password" placeholder="AIzaSy..." />
          </Field>
          <Field label="Platform TinyPNG API Key">
            <Inp value={ps.tinypng_api_key} onChange={e => setPs(p => ({ ...p, tinypng_api_key: e.target.value }))} type="password" placeholder="abcdef..." />
          </Field>
        </div>
      </div>
      <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>🔌 Mollie configuratie</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Mollie API Key (Live)">
            <Inp value={ps.mollie_api_key} onChange={e => setPs(p => ({ ...p, mollie_api_key: e.target.value }))} type="password" placeholder="live_..." />
          </Field>
          <Field label="Webhook URL" hint="Automatisch ingesteld per betaling — geen dashboard-actie nodig">
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
      <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>📧 Contactformulier notificaties</div>
        <div style={{ fontSize: 12, color: "var(--mx)", marginBottom: 12 }}>
          E-mailadres dat een melding ontvangt bij elke nieuwe contactformulier inzending.
          Leeg = fallback naar <code style={{ color: "var(--pr-h)" }}>leadingvation@gmail.com</code>
        </div>
        <div style={{ maxWidth: 360 }}>
          <Field label="Notificatie e-mailadres">
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

const TrackingSettings = () => {
  const [settings, setSettings] = useState({ gtm_id: "", ga4_id: "", gads_conversion_id: "", gads_conversion_label: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/platform-settings").then(r => r.json()).then(d => { setSettings(s => ({ ...s, ...d })); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch("/api/platform-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify(settings),
      });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { alert("Opslaan mislukt: " + e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: 20, color: "var(--mx)", fontSize: 13 }}>Laden...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 640 }}>
      {/* GTM */}
      <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span>📊</span> Google Tag Manager
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="GTM Container ID" hint="Bijv. GTM-XXXXXXX">
            <Inp value={settings.gtm_id || ""} onChange={e => setSettings(s => ({ ...s, gtm_id: e.target.value }))} placeholder="GTM-XXXXXXX" />
          </Field>
          <div style={{ padding: "10px 14px", background: "var(--s3)", borderRadius: "var(--rd)", fontSize: 12, color: "var(--mx)", lineHeight: 1.6 }}>
            <strong style={{ color: "var(--tx)" }}>GTM configuratie:</strong> Na opslaan wordt GTM automatisch geladen voor bezoekers die cookies accepteren. Maak in GTM een tag aan voor GA4 + een trigger op <code>signup_complete</code> voor Google Ads conversies.
          </div>
        </div>
      </div>

      {/* GA4 */}
      <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span>📈</span> Google Analytics 4
        </div>
        <div style={{ padding: 16 }}>
          <Field label="GA4 Measurement ID" hint="Bijv. G-XXXXXXXXXX">
            <Inp value={settings.ga4_id || ""} onChange={e => setSettings(s => ({ ...s, ga4_id: e.target.value }))} placeholder="G-XXXXXXXXXX" />
          </Field>
        </div>
      </div>

      {/* Google Ads */}
      <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span>🎯</span> Google Ads Conversies
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Conversion ID" hint="Bijv. AW-XXXXXXXXX">
            <Inp value={settings.gads_conversion_id || ""} onChange={e => setSettings(s => ({ ...s, gads_conversion_id: e.target.value }))} placeholder="AW-XXXXXXXXX" />
          </Field>
          <Field label="Conversion Label" hint="Bijv. AbCdEfGhIjKlMnOp">
            <Inp value={settings.gads_conversion_label || ""} onChange={e => setSettings(s => ({ ...s, gads_conversion_label: e.target.value }))} placeholder="AbCdEfGhIjKlMnOp" />
          </Field>
          <div style={{ padding: "10px 14px", background: "var(--s3)", borderRadius: "var(--rd)", fontSize: 12, color: "var(--mx)", lineHeight: 1.6 }}>
            Conversies worden gefired bij <strong style={{ color: "var(--tx)" }}>nieuwe registraties</strong> (event: <code>signup_complete</code>). Zorg dat GTM-ID ook ingevuld is.
          </div>
        </div>
      </div>

      {/* Search Console / Sitemap */}
      <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span>🔍</span> Google Search Console
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, color: "var(--mx)", lineHeight: 1.6 }}>
            Verifieer eigenaarschap via DNS-record of HTML-tag in Search Console. Voeg de sitemap toe na verificatie:
          </div>
          <div style={{ padding: "10px 14px", background: "var(--s3)", borderRadius: "var(--rd)", fontFamily: "monospace", fontSize: 13, color: "var(--gr)" }}>
            https://woosyncshop.com/sitemap.xml
          </div>
          <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "var(--pr-h)", textDecoration: "none" }}>
            → Openen in Search Console ↗
          </a>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Btn variant="primary" onClick={save} disabled={saving}>{saving ? "Opslaan..." : "Instellingen opslaan"}</Btn>
        {saved && <span style={{ fontSize: 13, color: "var(--gr)" }}>✓ Opgeslagen</span>}
      </div>
    </div>
  );
};

// ─── Root App ─────────────────────────────────────────────────────────────────
const STATIC_PAGES = ["privacy", "voorwaarden", "contact"];
const getPageFromPath = () => {
  const p = window.location.pathname.replace(/^\//, "");
  return STATIC_PAGES.includes(p) ? p : null;
};

export default function App() {
  const initPage = getPageFromPath();
  const [view, setView] = useState(initPage || "loading"); // loading | landing | app | privacy | voorwaarden | contact
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

  const [paymentReturn, setPaymentReturn] = useState(() => window.location.hash === "#payment-return");
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
        if (mollieStatus === "paid" || data.plan === "pro" || data.plan === "free_forever") {
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

  if (view === "privacy") return <><G /><PrivacyPage onBack={() => goBack()} /></>;
  if (view === "voorwaarden") return <><G /><VoorwaardenPage onBack={() => goBack()} /></>;
  if (view === "contact") return <><G /><ContactPage onBack={() => goBack()} /></>;

  return (
    <>
      <G />
      <TrackingInjector consent={cookieConsent} />
      {view === "landing" && (
        <LandingPage
          onLogin={() => setAuthModal("login")}
          onSignup={() => setAuthModal("signup")}
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
              <Btn variant="primary" onClick={() => { setPendingPaymentWall(false); setAuthModal("payment"); }}>Betaling voltooien →</Btn>
            </div>
          </div>
        </div>
      )}
      {authModal && (
        <AuthModal
          mode={authModal}
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
              <Btn variant="primary" onClick={() => { setPaymentReturn(false); setPendingPaymentWall(false); }}>Naar dashboard →</Btn>
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
                <Btn variant="primary" onClick={() => { setPaymentReturn(false); setAuthModal("payment"); }}>Opnieuw betalen →</Btn>
              </div>
            </>}
          </div>
        </div>
      )}
    </>
  );
}
