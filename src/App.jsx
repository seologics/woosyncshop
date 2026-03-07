import { useState, useRef, useEffect, useCallback } from "react";

// ─── Google Fonts ─────────────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.href = "https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap";
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
        --font-h: 'Syne', sans-serif; --font-b: 'DM Sans', sans-serif;
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

// ─── Mock Data ────────────────────────────────────────────────────────────────
const SITES = [
  { id: 1, name: "HaagDirect NL", domain: "haagdirect.nl", locale: "nl_NL", flag: "🇳🇱", color: "#F59E0B", connected: true },
  { id: 2, name: "BamboeHaag BE (FR)", domain: "bamboehaag.be", locale: "fr_BE", flag: "🇧🇪", color: "#5B5BD6", connected: true },
  { id: 3, name: "BamboeHaag BE (NL)", domain: "bamboehaag.be/nl", locale: "nl_BE", flag: "🇧🇪", color: "#22C55E", connected: true },
];

const GLOBAL_ATTRIBUTES = [
  { id: 1, slug: "pa_hoogte", name: "Hoogte", terms: ["60-80cm","80-100cm","100-125cm","125-150cm","150-175cm","175-200cm","200+ cm"] },
  { id: 2, slug: "pa_pot", name: "Pot", terms: ["2L","5L","5.5L","10L","15L","20L"] },
  { id: 3, slug: "pa_kleur", name: "Kleur", terms: ["Groen","Geel","Rood","Zwart","Paars"] },
  { id: 4, slug: "pa_soort", name: "Soort", terms: ["Fargesia","Phyllostachys","Bambusa","Pleioblastus"] },
  { id: 5, slug: "pa_identifier", name: "Identifier", terms: ["FM-JUMBO","FM-RUFA","PN-BISSET","PN-AUREOSULCATA"] },
];

const CATEGORIES = [
  { id: 10, name: "Bamboe planten", slug: "bamboe-planten", parent: 0 },
  { id: 11, name: "Fargesia", slug: "fargesia", parent: 10 },
  { id: 12, name: "Phyllostachys", slug: "phyllostachys", parent: 10 },
  { id: 13, name: "Bamboehaag", slug: "bamboehaag", parent: 10 },
  { id: 14, name: "Triple Packs", slug: "triple-packs", parent: 10 },
  { id: 15, name: "Aanbiedingen", slug: "aanbiedingen", parent: 0 },
];

const mkVariation = (id, attrs, sku, price, stock) => ({
  id, sku, enabled: true, virtual: false, downloadable: false,
  manage_stock: true, stock_quantity: stock, stock_status: stock > 0 ? "instock" : "outofstock",
  regular_price: price, sale_price: "", gtin: "",
  attributes: attrs,
  wqm_tiers: [
    { qty: 3, price: (parseFloat(price) * 0.95).toFixed(2) },
    { qty: 6, price: (parseFloat(price) * 0.90).toFixed(2) },
    { qty: 9, price: (parseFloat(price) * 0.85).toFixed(2) },
  ],
  wqm_settings: { min_qty: "1", max_qty: "", default_qty: "1", step: "1", tiered_pricing_type: "fixed", qty_design: "full_width_swatches", title: "Selecteer aantal", variant_selector: false,
    dyo_rows: [
      { qty: 3, label: "3 stuks", byline: `€${(parseFloat(price)*3*0.95).toFixed(2)}`, label_right: "1 doos", highlight: `€${(parseFloat(price)*0.95).toFixed(2)} per stuk` },
      { qty: 6, label: "6 stuks", byline: `€${(parseFloat(price)*6*0.90).toFixed(2)}`, label_right: "2 dozen", highlight: `€${(parseFloat(price)*0.90).toFixed(2)} per stuk` },
    ]
  },
  images: [],
  connected_fields: { regular_price: true, stock_quantity: true, wqm_tiers: true, wqm_settings: false },
});

const PRODUCTS = [
  {
    id: 1001, name: "Fargesia murielae 'Jumbo'", slug: "fargesia-murielae-jumbo",
    sku: "FM-JUMBO", type: "variable", status: "publish",
    manage_stock: false, stock_quantity: null, stock_status: "instock",
    regular_price: "", sale_price: "",
    short_description: "Fargesia murielae 'Jumbo' is een niet-woekerende bamboe met een prachtige, weelderige groei. Perfect als privacy haag.",
    description: "<p>Fargesia murielae 'Jumbo' is de meest populaire niet-woekerende bamboe voor tuinen. Met haar elegante, hangende takken en dichte groeiwijze vormt zij een perfecte levende afscheiding.</p><p><strong>Kenmerken:</strong></p><ul><li>Volwassen hoogte: 3-4 meter</li><li>Niet-woekerende soort</li><li>Winterhard tot -25°C</li></ul>",
    categories: [10, 11, 13],
    featured_image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=200&fit=crop",
    gallery_images: [],
    attributes: [
      { id: 1, slug: "pa_hoogte", values: ["100-125cm","125-150cm","150-175cm"], visible: true, variation: true },
      { id: 2, slug: "pa_pot", values: ["5L","5.5L","10L"], visible: true, variation: false },
      { id: 4, slug: "pa_soort", values: ["Fargesia"], visible: true, variation: false },
      { id: 5, slug: "pa_identifier", values: ["FM-JUMBO"], visible: false, variation: false },
    ],
    wqm_tiers: [], wqm_settings: { tiered_pricing_type: "fixed" },
    tax_status: "taxable", tax_class: "reduced-rate",
    afhaalkkorting_active: false, product_korting_active: true, product_korting_pct: "5",
    variations: [
      mkVariation(10011, { pa_hoogte: "100-125cm" }, "FM-JUMBO-100", "24.95", 42),
      mkVariation(10012, { pa_hoogte: "125-150cm" }, "FM-JUMBO-125", "29.95", 28),
      mkVariation(10013, { pa_hoogte: "150-175cm" }, "FM-JUMBO-150", "34.95", 15),
    ],
    connected_sites: [1, 2, 3],
    connected_fields: { name: false, description: true, short_description: false, categories: true, featured_image: true },
    pending_changes: { stock_quantity: true },
  },
  {
    id: 1002, name: "Nitida Bamboe Planten Mix 100cm Triple Pack", slug: "nitida-bamboe-planten-mix-100cm-triple-pack",
    sku: "NM-100CM-TRIPLE-PACK", type: "variable", status: "publish",
    manage_stock: false, stock_quantity: null, stock_status: "instock",
    regular_price: "", sale_price: "",
    short_description: "De Nitida Bamboe Planten Mix 100 cm is een veelzijdige triple pack met drie verschillende niet-woekerende Fargesia nitida soorten: Obelisk, Winter Joy en Volcano.",
    description: "<p>Een unieke combinatie van drie prachtige Fargesia nitida soorten in één voordelige triple pack.</p>",
    categories: [10, 11, 14],
    featured_image: "https://images.unsplash.com/photo-1527435443382-f2e40c29ded3?w=200&h=200&fit=crop",
    gallery_images: [],
    attributes: [
      { id: 1, slug: "pa_hoogte", values: ["100+ cm"], visible: true, variation: true },
      { id: 2, slug: "pa_pot", values: ["5.5L"], visible: true, variation: false },
      { id: 5, slug: "pa_identifier", values: ["NM-TRIPLE-100"], visible: false, variation: false },
    ],
    wqm_tiers: [], wqm_settings: { tiered_pricing_type: "fixed" },
    tax_status: "taxable", tax_class: "reduced-rate",
    afhaalkkorting_active: false, product_korting_active: false, product_korting_pct: "",
    variations: [
      mkVariation(10021, { pa_hoogte: "100+ cm" }, "NM-100CM-TRIPLE-PACK", "24.50", 67),
    ],
    connected_sites: [1, 2],
    connected_fields: { name: false, description: false, short_description: false, categories: true, featured_image: true },
    pending_changes: {},
  },
  {
    id: 1003, name: "Phyllostachys bissetii", slug: "phyllostachys-bissetii",
    sku: "PN-BISSET", type: "simple", status: "publish",
    manage_stock: true, stock_quantity: 12, stock_status: "instock",
    regular_price: "19.95", sale_price: "15.95",
    short_description: "Phyllostachys bissetii is een snelgroeiende bamboe die geschikt is als windkering en privacy scherm.",
    description: "<p>Een robuuste bamboesoort die uitstekend bestand is tegen wind en kou.</p>",
    categories: [10, 12, 13],
    featured_image: "https://images.unsplash.com/photo-1567336273898-ebbf9eb3c3bf?w=200&h=200&fit=crop",
    gallery_images: [],
    attributes: [
      { id: 4, slug: "pa_soort", values: ["Phyllostachys"], visible: true, variation: false },
      { id: 1, slug: "pa_hoogte", values: ["150-175cm"], visible: true, variation: false },
    ],
    wqm_tiers: [
      { qty: 3, price: "18.50" }, { qty: 5, price: "17.95" }, { qty: 10, price: "16.95" },
    ],
    wqm_settings: { tiered_pricing_type: "fixed", min_qty: "1", max_qty: "", default_qty: "1", step: "1", dyo_rows: [] },
    tax_status: "taxable", tax_class: "reduced-rate",
    afhaalkkorting_active: true, product_korting_active: false, product_korting_pct: "",
    variations: [],
    connected_sites: [1],
    connected_fields: {},
    pending_changes: { regular_price: true },
  },
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
const EDIT_TABS = [
  { id: "general", label: "Algemeen", icon: "⚙" },
  { id: "stock", label: "Voorraad", icon: "📦" },
  { id: "variations", label: "Variaties", icon: "🔀" },
  { id: "quantity", label: "Hoeveelheid", icon: "🔢" },
  { id: "attributes", label: "Attributen", icon: "🏷" },
  { id: "description", label: "Beschrijving", icon: "📝" },
  { id: "images", label: "Afbeeldingen", icon: "🖼" },
  { id: "connected", label: "Verbonden", icon: "🔗" },
];

const ProductEditModal = ({ product, open, onClose, onSave, sites, activeSite }) => {
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
        <Btn variant="primary" size="sm">+ Koppeling toevoegen</Btn>
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

// ─── Admin Panel (root only) ──────────────────────────────────────────────────
const MOCK_USERS = [
  { id: 1, name: "Roeland V.", email: "roeland@haagdirect.nl", plan: "free_forever", sites: 3, status: "active", gemini_model: "gemini-2.0-flash", img_max_kb: 400, img_quality: 85, img_max_width: 1200, ai_taxonomy_enabled: true, ai_taxonomy_model: "gemini-2.0-flash", ai_taxonomy_threshold: "80" },
  { id: 2, name: "Jan de Vries", email: "jan@example.nl", plan: "pro", sites: 2, status: "active", gemini_model: "gemini-2.0-flash-lite", img_max_kb: 400, img_quality: 80, img_max_width: 1200, ai_taxonomy_enabled: true, ai_taxonomy_model: "gemini-2.0-flash-lite", ai_taxonomy_threshold: "85" },
  { id: 3, name: "Sophie Martin", email: "sophie@example.be", plan: "pro", sites: 5, status: "active", gemini_model: "gemini-2.0-flash-lite", img_max_kb: 400, img_quality: 85, img_max_width: 1200, ai_taxonomy_enabled: false, ai_taxonomy_model: "gemini-2.0-flash-lite", ai_taxonomy_threshold: "80" },
  { id: 4, name: "Lars Nielsen", email: "lars@example.com", plan: "pro", sites: 1, status: "pending", gemini_model: "gemini-2.0-flash-lite", img_max_kb: 400, img_quality: 85, img_max_width: 1200, ai_taxonomy_enabled: false, ai_taxonomy_model: "gemini-2.0-flash-lite", ai_taxonomy_threshold: "80" },
];

const AdminPanel = () => {
  const [adminTab, setAdminTab] = useState("users");
  const [users, setUsers] = useState(MOCK_USERS);
  const [editUser, setEditUser] = useState(null);

  const updUser = (id, field, val) => setUsers(us => us.map(u => u.id === id ? { ...u, [field]: val } : u));

  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ padding: "4px 10px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 20, fontSize: 11, color: "var(--re)", fontWeight: 700, letterSpacing: "0.05em" }}>ADMIN</div>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Beheerpaneel</h2>
      </div>
      <Tabs tabs={[{ id: "users", label: "👥 Gebruikers" }, { id: "payments", label: "💳 Betalingen" }, { id: "platform", label: "⚙ Platform" }]} active={adminTab} onChange={setAdminTab} />
      <div style={{ marginTop: 20 }}>

        {/* Users */}
        {adminTab === "users" && (
          <div>
            <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px 70px 80px 100px", gap: 0, background: "var(--s2)", padding: "8px 14px", borderBottom: "1px solid var(--b1)" }}>
                {["Gebruiker", "E-mail", "Plan", "Shops", "Status", "Acties"].map((h, i) => (
                  <span key={i} style={{ fontSize: 11, color: "var(--dm)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</span>
                ))}
              </div>
              {users.map(u => (
                <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px 70px 80px 100px", gap: 0, padding: "10px 14px", borderBottom: "1px solid var(--b1)", alignItems: "center" }}>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{u.name}</span>
                  <span style={{ fontSize: 12, color: "var(--mx)" }}>{u.email}</span>
                  <Badge color={u.plan === "free_forever" ? "orange" : "blue"} size="sm">{u.plan === "free_forever" ? "Free ∞" : "Pro"}</Badge>
                  <span style={{ fontSize: 13 }}>{u.sites} / 10</span>
                  <Badge color={u.status === "active" ? "green" : "amber"} size="sm">{u.status === "active" ? "Actief" : "In afwachting"}</Badge>
                  <Btn variant="ghost" size="sm" onClick={() => setEditUser(u)}>Configureren</Btn>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payments */}
        {adminTab === "payments" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {[["Maandelijks MRR", "€39,98", "2 actieve abonnementen"], ["Totaal klanten", "4", "1 gratis, 3 betaald"], ["Openstaand", "€19,99", "1 in afwachting"]].map(([label, val, sub]) => (
                <div key={label} style={{ padding: 16, background: "var(--s2)", borderRadius: "var(--rd-lg)", border: "1px solid var(--b1)" }}>
                  <div style={{ fontSize: 12, color: "var(--mx)", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "var(--font-h)" }}>{val}</div>
                  <div style={{ fontSize: 11, color: "var(--dm)", marginTop: 2 }}>{sub}</div>
                </div>
              ))}
            </div>
            <div style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
              <div style={{ padding: "8px 14px", background: "var(--s2)", borderBottom: "1px solid var(--b1)", fontWeight: 600, fontSize: 13 }}>Recente betalingen (via Mollie)</div>
              {[["1 mrt 2026", "Jan de Vries", "€19,99", "Geslaagd"], ["1 mrt 2026", "Sophie Martin", "€19,99", "Geslaagd"], ["28 feb 2026", "Lars Nielsen", "€19,99", "In afwachting"], ["1 feb 2026", "Jan de Vries", "€19,99", "Geslaagd"]].map(([d, n, a, s], i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px 100px", gap: 0, padding: "9px 14px", borderBottom: "1px solid var(--b1)", fontSize: 13, alignItems: "center" }}>
                  <span style={{ color: "var(--dm)" }}>{d}</span><span>{n}</span><span style={{ fontWeight: 600 }}>{a}</span>
                  <Badge color={s === "Geslaagd" ? "green" : "amber"} size="sm">{s}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Platform */}
        {adminTab === "platform" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>🌐 Platform-brede API keys</div>
              <div style={{ fontSize: 12, color: "var(--mx)", marginBottom: 12 }}>Deze keys gelden als fallback wanneer een gebruiker geen eigen keys heeft ingesteld.</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Platform Gemini API Key"><Inp value="AIza••••••••••••••••••" onChange={() => {}} type="password" /></Field>
                <Field label="Platform TinyPNG API Key"><Inp value="••••••••••••••••••••" onChange={() => {}} type="password" /></Field>
              </div>
            </div>
            <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>🔌 Mollie configuratie</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Mollie API Key (Live)"><Inp value="live_••••••••••••••••••••" onChange={() => {}} type="password" /></Field>
                <Field label="Mollie Webhook URL" hint="Ingesteld op Mollie dashboard"><Inp value="https://woosyncshop.com/api/mollie/webhook" onChange={() => {}} /></Field>
              </div>
            </div>
            <Btn variant="primary">Opslaan</Btn>
          </div>
        )}
      </div>

      {/* Per-user config overlay */}
      {editUser && (
        <Overlay open onClose={() => setEditUser(null)} width={580} title={`Configuratie: ${editUser.name}`}>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ padding: 12, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", display: "flex", gap: 16, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{editUser.email}</div>
                <div style={{ fontSize: 12, color: "var(--dm)" }}>{editUser.sites} shops verbonden</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <Badge color={editUser.plan === "free_forever" ? "orange" : "blue"}>{editUser.plan === "free_forever" ? "Free forever" : "Pro €19,99/mnd"}</Badge>
                <Badge color={editUser.status === "active" ? "green" : "amber"}>{editUser.status}</Badge>
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
                <Sel value={editUser.gemini_model} onChange={e => setEditUser(u => ({ ...u, gemini_model: e.target.value }))} options={[{ value: "gemini-2.0-flash-lite", label: "Flash Lite (zuinig)" }, { value: "gemini-2.0-flash", label: "Flash (gebalanceerd)" }, { value: "gemini-1.5-pro", label: "1.5 Pro (premium)" }]} />
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
                  <Sel value={editUser.ai_taxonomy_model ?? "gemini-2.0-flash-lite"}
                    onChange={e => setEditUser(u => ({ ...u, ai_taxonomy_model: e.target.value }))}
                    options={[
                      { value: "gemini-2.0-flash-lite", label: "Flash Lite – zuinig, geschikt voor eenvoudige vertalingen" },
                      { value: "gemini-2.0-flash",      label: "Flash – gebalanceerd (aanbevolen)" },
                      { value: "gemini-1.5-pro",        label: "1.5 Pro – hoogste kwaliteit, meer tokens" },
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
              <Btn variant="primary" onClick={() => { updUser(editUser.id, "plan", editUser.plan); setEditUser(null); }}>Opslaan</Btn>
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
const SettingsView = ({ sites, isAdmin }) => {
  const [settingsTab, setSettingsTab] = useState("sites");
  const [aiEnabled, setAiEnabled] = useState(false);
  // In production this comes from the authenticated user's DB record.
  // For the demo: Roeland's account has ai_taxonomy_enabled: true
  const aiTaxonomyUnlocked = true;

  if (isAdmin) return <AdminPanel />;

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Instellingen</h2>
      <Tabs tabs={[{ id: "sites", label: "🏪 Mijn shops" }, { id: "ai", label: "🤖 AI Vertaling" }, { id: "billing", label: "💳 Abonnement" }, { id: "profile", label: "👤 Profiel" }]} active={settingsTab} onChange={setSettingsTab} />
      <div style={{ marginTop: 20 }}>
        {settingsTab === "sites" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: 12, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", fontSize: 13, color: "var(--mx)" }}>
              Voeg je WooCommerce shops toe via REST API. Genereer een Consumer Key &amp; Secret in <strong style={{ color: "var(--tx)" }}>WooCommerce → Instellingen → Geavanceerd → REST API</strong> met <em>lees/schrijf</em>-rechten.
            </div>
            {sites.map(site => (
              <div key={site.id} style={{ border: "1px solid var(--b1)", borderRadius: "var(--rd-lg)", overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: "var(--s2)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{site.flag}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{site.name}</div>
                    <div style={{ fontSize: 11, color: "var(--dm)" }}>{site.locale} · {site.domain}</div>
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                    <Badge color="green">✓ Verbonden</Badge>
                    <Btn variant="ghost" size="sm">🗑</Btn>
                  </div>
                </div>
                <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Site URL" required><Inp value={`https://${site.domain}`} onChange={() => {}} /></Field>
                  <Field label="Taal / Locale"><Sel value={site.locale} onChange={() => {}} options={[{ value: "nl_NL", label: "nl_NL – Nederlands (NL)" }, { value: "fr_BE", label: "fr_BE – Français (BE)" }, { value: "nl_BE", label: "nl_BE – Nederlands (BE)" }]} /></Field>
                  <Field label="Consumer Key" required><Inp value="ck_••••••••••••••••••••" onChange={() => {}} type="password" /></Field>
                  <Field label="Consumer Secret" required><Inp value="cs_••••••••••••••••••••" onChange={() => {}} type="password" /></Field>
                  <div style={{ gridColumn: "1/-1", display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--gr)" }} />
                    <span style={{ fontSize: 12, color: "var(--mx)" }}>Verbinding OK · WooCommerce 9.4 · WordPress 6.7</span>
                    <Btn variant="secondary" size="sm" style={{ marginLeft: "auto" }}>Verbinding testen</Btn>
                  </div>
                </div>
              </div>
            ))}
            <Btn variant="primary" icon="+">Shop toevoegen</Btn>
          </div>
        )}
        {settingsTab === "ai" && (
          <AiTranslationSettings enabled={aiEnabled} onToggleEnabled={setAiEnabled} locked={!aiTaxonomyUnlocked} />
        )}
        {settingsTab === "billing" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: 20, background: "linear-gradient(135deg, var(--pr-l), var(--s2))", borderRadius: "var(--rd-lg)", border: "1px solid var(--b2)" }}>
              <div style={{ fontSize: 13, color: "var(--mx)", marginBottom: 4 }}>Huidig abonnement</div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-h)", color: "var(--pr-h)" }}>€19,99 <span style={{ fontSize: 14, fontWeight: 400, color: "var(--mx)" }}>/ maand</span></div>
              <div style={{ fontSize: 13, color: "var(--mx)", marginTop: 4 }}>Tot 10 WordPress installaties · Actief</div>
              <Badge color="green" style={{ marginTop: 8, display: "inline-flex" }}>✓ Betaald via Mollie</Badge>
            </div>
            <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Betalingsgeschiedenis</div>
              {[["1 mrt 2026", "€19,99", "Geslaagd"], ["1 feb 2026", "€19,99", "Geslaagd"], ["1 jan 2026", "€19,99", "Geslaagd"]].map(([d, a, s]) => (
                <div key={d} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--b1)", fontSize: 13 }}>
                  <span style={{ color: "var(--mx)" }}>{d}</span><span>{a}</span><Badge color="green" size="sm">{s}</Badge>
                </div>
              ))}
            </div>
            <Btn variant="danger" size="sm" style={{ alignSelf: "flex-start" }}>Abonnement opzeggen</Btn>
          </div>
        )}
        {settingsTab === "profile" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }}>
            <Field label="Naam"><Inp value="Roeland V." onChange={() => {}} /></Field>
            <Field label="E-mailadres"><Inp value="roeland@haagdirect.nl" onChange={() => {}} type="email" /></Field>
            <Field label="Nieuw wachtwoord" hint="Laat leeg om het huidig wachtwoord te bewaren"><Inp value="" onChange={() => {}} type="password" placeholder="••••••••" /></Field>
            <Btn variant="primary" style={{ alignSelf: "flex-start" }}>Profiel opslaan</Btn>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Top Nav ──────────────────────────────────────────────────────────────────
const TopNav = ({ activeSite, setActiveSite, sites, activeView, setActiveView, pendingCount, onSync, onPush, isAdmin }) => {
  const [siteOpen, setSiteOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pushing, setPushing] = useState(false);

  const handleSync = () => { setSyncing(true); setTimeout(() => { setSyncing(false); onSync?.(); }, 1800); };
  const handlePush = () => { setPushing(true); setTimeout(() => { setPushing(false); onPush?.(); }, 2200); };

  return (
    <div style={{ height: 56, background: "var(--s1)", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", padding: "0 16px", gap: 10, position: "sticky", top: 0, zIndex: 100, flexShrink: 0 }}>
      {/* Logo */}
      <div style={{ fontFamily: "var(--font-h)", fontWeight: 800, fontSize: 17, color: "var(--tx)", marginRight: 8, letterSpacing: "-0.02em" }}>
        <span style={{ color: "var(--pr-h)" }}>Woo</span> Sync<span style={{ color: "var(--pr-h)" }}>Shop</span>
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
              <button style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 10px", background: "transparent", border: "none", cursor: "pointer", color: "var(--pr-h)", fontSize: 12 }}>
                <span>+</span> Shop toevoegen
              </button>
            </div>
          </div>
        )}
      </div>

      {/* View Tabs */}
      <div style={{ display: "flex", gap: 2, marginLeft: 4 }}>
        {[["products", "📦 Producten"], ["connected", "🔗 Verbonden"], ["hreflang", "🌐 Hreflang"], ["settings", "⚙ Instellingen"], ...(isAdmin ? [["admin", "🛡 Admin"]] : [])].map(([id, label]) => (
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
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--pr)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>R</div>
      </div>
    </div>
  );
};

// ─── Dashboard App ────────────────────────────────────────────────────────────
const Dashboard = ({ user, onLogout }) => {
  const isAdmin = user?.email === "roeland@haagdirect.nl" || user?.isAdmin;
  const [activeSite, setActiveSite] = useState(SITES[0]);
  const [activeView, setActiveView] = useState("products");
  const [products, setProducts] = useState(PRODUCTS);
  const [editProduct, setEditProduct] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [notification, setNotification] = useState(null);

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const pendingCount = products.reduce((sum, p) => sum + Object.keys(p.pending_changes || {}).length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)" }}>
      <TopNav activeSite={activeSite} setActiveSite={setActiveSite} sites={SITES} activeView={activeView} setActiveView={setActiveView} pendingCount={pendingCount} isAdmin={isAdmin}
        onSync={() => notify("Alle wijzigingen gesynchroniseerd ✓")}
        onPush={() => { setProducts(products.map(p => ({ ...p, pending_changes: {} }))); notify("Wijzigingen gepushed naar alle shops ✓"); }} />
      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
        {activeView === "products" && <ProductsTable products={products} onEdit={p => { setEditProduct(p); setEditOpen(true); }} onConnect={() => setActiveView("connected")} activeSite={activeSite} />}
        {activeView === "connected" && <ConnectedSitesView products={products} sites={SITES} />}
        {activeView === "hreflang" && <HreflangView sites={SITES} />}
        {activeView === "settings" && <SettingsView sites={SITES} isAdmin={false} />}
        {activeView === "admin" && isAdmin && <SettingsView sites={SITES} isAdmin={true} />}
      </div>

      <ProductEditModal product={editProduct} open={editOpen} onClose={() => setEditOpen(false)}
        onSave={updated => { setProducts(products.map(p => p.id === updated.id ? { ...updated, pending_changes: { ...p.pending_changes, _edited: true } } : p)); notify("Product opgeslagen — gebruik Sync/Push om te publiceren"); }}
        sites={SITES} activeSite={activeSite} />

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
  const [step, setStep] = useState(mode === "signup" ? "form" : "login");
  const [form, setForm] = useState({ name: "", email: "", password: "", code: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isFree, setIsFree] = useState(false);

  const handleCode = (code) => {
    setForm(f => ({ ...f, code }));
    setIsFree(code.toLowerCase() === "freeforever");
  };

  const handleLogin = async () => {
    setLoading(true); setError(null);
    try {
      const { signIn } = await import('./lib/supabase.js');
      const { user } = await signIn(form.email, form.password);
      onSuccess({ id: user.id, name: user.user_metadata?.full_name || form.email, email: user.email });
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const handleSignup = async () => {
    setLoading(true); setError(null);
    try {
      const { signUp } = await import('./lib/supabase.js');
      await signUp(form.email, form.password, { data: { full_name: form.name } });
      if (isFree) { setStep("success"); } else { setStep("payment"); }
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const handlePayment = () => {
    setLoading(true);
    // Mollie payment flow — redirects to Mollie hosted page in production
    // For now simulate success
    setTimeout(() => { setLoading(false); setStep("success"); }, 1500);
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
              Nog geen account? <span onClick={() => { setStep("form"); setError(null); }} style={{ color: "var(--pr-h)", cursor: "pointer" }}>Registreren</span>
            </div>
          </div>
        </>}

        {step === "form" && <>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Account aanmaken</h2>
          <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 24 }}>Start met het beheren van al jouw webshops</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Naam"><Inp value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jouw naam" /></Field>
            <Field label="E-mailadres"><Inp value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" placeholder="jij@domein.nl" /></Field>
            <Field label="Wachtwoord"><Inp value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} type="password" placeholder="Min. 8 tekens" /></Field>
            <Field label="Kortingscode (optioneel)">
              <Inp value={form.code} onChange={e => handleCode(e.target.value)} placeholder="Voer code in..." />
              {isFree && <div style={{ padding: "6px 10px", background: "var(--gr-l)", borderRadius: 6, border: "1px solid rgba(34,197,94,0.3)", marginTop: 6 }}>
                <span style={{ fontSize: 12, color: "var(--gr)", fontWeight: 600 }}>🎉 Code geldig — gratis voor altijd!</span>
              </div>}
            </Field>
            <div style={{ padding: 12, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Woo Sync Shop Pro</div>
                <div style={{ fontSize: 12, color: "var(--mx)" }}>Tot 10 WordPress installaties</div>
              </div>
              <div style={{ textAlign: "right" }}>
                {isFree ? <span style={{ fontWeight: 800, color: "var(--gr)", fontSize: 18 }}>Gratis</span> : <><span style={{ fontWeight: 800, fontSize: 18 }}>€19,99</span><span style={{ fontSize: 11, color: "var(--dm)" }}>/maand</span></>}
              </div>
            </div>
            <Btn variant="primary" size="lg" onClick={handleSignup} disabled={loading} style={{ width: "100%", marginTop: 4 }}>{loading ? "Bezig..." : isFree ? "Account aanmaken →" : "Verder naar betaling →"}</Btn>
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--dm)" }}>
              Al een account? <span onClick={() => { setStep("login"); setError(null); }} style={{ color: "var(--pr-h)", cursor: "pointer" }}>Inloggen</span>
            </div>
          </div>
        </>}

        {step === "payment" && <>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Betaling</h2>
          <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 24 }}>Start je Pro abonnement</p>
          <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", marginBottom: 20, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "var(--mx)" }}>Woo Sync Shop Pro · 1 maand</span>
            <span style={{ fontWeight: 700 }}>€19,99</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {[["iDEAL", "🏦"], ["Creditcard", "💳"], ["SEPA Overboeking", "🔄"], ["Bancontact", "🇧🇪"]].map(([m, icon]) => (
              <div key={m} style={{ padding: "10px 14px", background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd)", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <span>{icon}</span><span style={{ fontSize: 13 }}>{m}</span>
              </div>
            ))}
          </div>
          <Btn variant="primary" size="lg" onClick={handlePayment} disabled={loading} style={{ width: "100%" }}>{loading ? "Verwerken..." : "Betalen →"}</Btn>
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

  const handleCode = (code) => {
    setForm(f => ({ ...f, code }));
    setIsFree(code.toLowerCase() === "freeforever");
  };

  const handleSignup = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); if (isFree) { setStep("success"); } else { setStep("payment"); } }, 900);
  };

  const handlePayment = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); setStep("success"); }, 1500);
  };

  const handleLogin = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); onSuccess({ name: form.name || "Roeland", email: form.email }); }, 800);
  };

  return (
    <Overlay open onClose={onClose} width={440} title={null}>
      <div style={{ padding: 32 }}>
        {/* Login */}
        {step === "login" && <>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Welkom terug</h2>
          <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 24 }}>Log in op je Woo Sync Shop account</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="E-mailadres"><Inp value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" placeholder="jij@domein.nl" /></Field>
            <Field label="Wachtwoord"><Inp value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} type="password" placeholder="••••••••" /></Field>
            <Btn variant="primary" size="lg" onClick={handleLogin} disabled={loading} style={{ width: "100%", marginTop: 8 }}>{loading ? "Bezig..." : "Inloggen"}</Btn>
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--dm)" }}>
              Nog geen account? <span onClick={() => setStep("form")} style={{ color: "var(--pr-h)", cursor: "pointer" }}>Registreren</span>
            </div>
          </div>
        </>}

        {/* Signup Form */}
        {step === "form" && <>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Account aanmaken</h2>
          <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 24 }}>Start met het beheren van al jouw webshops</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Naam"><Inp value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jouw naam" /></Field>
            <Field label="E-mailadres"><Inp value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" placeholder="jij@domein.nl" /></Field>
            <Field label="Wachtwoord"><Inp value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} type="password" placeholder="Min. 8 tekens" /></Field>
            <Field label="Kortingscode (optioneel)">
              <Inp value={form.code} onChange={e => handleCode(e.target.value)} placeholder="Voer code in..." />
              {isFree && <div style={{ padding: "6px 10px", background: "var(--gr-l)", borderRadius: 6, border: "1px solid rgba(34,197,94,0.3)", marginTop: 6 }}>
                <span style={{ fontSize: 12, color: "var(--gr)", fontWeight: 600 }}>🎉 Code geldig — gratis voor altijd!</span>
              </div>}
            </Field>
            <div style={{ padding: 12, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Woo Sync Shop Pro</div>
                <div style={{ fontSize: 12, color: "var(--mx)" }}>Tot 10 WordPress installaties</div>
              </div>
              <div style={{ textAlign: "right" }}>
                {isFree ? <span style={{ fontWeight: 800, color: "var(--gr)", fontSize: 18 }}>Gratis</span> : <><span style={{ fontWeight: 800, fontSize: 18 }}>€19,99</span><span style={{ fontSize: 11, color: "var(--dm)" }}>/maand</span></>}
              </div>
            </div>
            <Btn variant="primary" size="lg" onClick={handleSignup} disabled={loading} style={{ width: "100%", marginTop: 4 }}>{loading ? "Bezig..." : isFree ? "Account aanmaken →" : "Verder naar betaling →"}</Btn>
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--dm)" }}>
              Al een account? <span onClick={() => setStep("login")} style={{ color: "var(--pr-h)", cursor: "pointer" }}>Inloggen</span>
            </div>
          </div>
        </>}

        {/* Payment */}
        {step === "payment" && <>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Betaling</h2>
          <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 24 }}>Veilig betalen via Mollie</p>
          <div style={{ padding: 14, background: "var(--s2)", borderRadius: "var(--rd)", border: "1px solid var(--b1)", marginBottom: 20, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "var(--mx)" }}>Woo Sync Shop Pro · 1 maand</span>
            <span style={{ fontWeight: 700 }}>€19,99</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {[["iDEAL", "🏦"], ["Creditcard", "💳"], ["SEPA Overboeking", "🔄"], ["Bancontact", "🇧🇪"]].map(([m, icon]) => (
              <div key={m} style={{ padding: "10px 14px", background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--rd)", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <span>{icon}</span><span style={{ fontSize: 13 }}>{m}</span>
              </div>
            ))}
          </div>
          <Btn variant="primary" size="lg" onClick={handlePayment} disabled={loading} style={{ width: "100%" }}>{loading ? "Verwerken..." : "Betalen via Mollie →"}</Btn>
        </>}

        {/* Success */}
        {step === "success" && <>
          <div style={{ textAlign: "center", padding: "10px 0 20px" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Account actief!</h2>
            <p style={{ fontSize: 13, color: "var(--mx)", marginBottom: 24 }}>
              {isFree ? "Je gratis account is aangemaakt." : "Betaling geslaagd. Welkom bij Woo Sync Shop!"}<br />
              We hebben een bevestigingsmail gestuurd naar <strong style={{ color: "var(--tx)" }}>{form.email}</strong>.
            </p>
            <Btn variant="primary" size="lg" onClick={() => onSuccess({ name: form.name, email: form.email })} style={{ width: "100%" }}>Naar het dashboard →</Btn>
          </div>
        </>}
      </div>
    </Overlay>
  );
};

// ─── Landing Page ─────────────────────────────────────────────────────────────
const LandingPage = ({ onLogin, onSignup }) => {
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
        <div style={{ fontFamily: "var(--font-h)", fontWeight: 800, fontSize: 20, color: "var(--tx)", letterSpacing: "-0.03em" }}>
          <span style={{ color: "var(--pr-h)" }}>Woo</span> Sync<span style={{ color: "var(--pr-h)" }}>Shop</span>
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
                {SITES.map(s => <div key={s.id} style={{ padding: "6px 12px", background: s.id === 1 ? "var(--s2)" : "transparent", border: s.id === 1 ? "1px solid var(--b2)" : "1px solid transparent", borderRadius: "var(--rd)", fontSize: 12, color: s.id === 1 ? "var(--tx)" : "var(--mx)" }}>{s.flag} {s.name}</div>)}
              </div>
              {PRODUCTS.slice(0, 3).map((p, i) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < 2 ? "1px solid var(--b1)" : "none" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 5, overflow: "hidden", background: "var(--s3)", flexShrink: 0 }}>
                    <img src={p.featured_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <span style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <Badge color={p.type === "variable" ? "blue" : "default"} size="sm">{p.type === "variable" ? "Variabel" : "Enkelvoudig"}</Badge>
                  <Badge color={p.stock_status === "instock" ? "green" : "red"} size="sm">{p.stock_status === "instock" ? "Op voorraad" : "Uit voorraad"}</Badge>
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
        <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, color: "var(--tx)", fontSize: 15 }}><span style={{ color: "var(--pr-h)" }}>Woo</span> Sync<span style={{ color: "var(--pr-h)" }}>Shop</span></div>
        <div>© 2026 Woo Sync Shop · Alle rechten voorbehouden</div>
        <div style={{ display: "flex", gap: 16 }}>
          {["Privacy", "Voorwaarden", "Contact"].map(l => <span key={l} style={{ cursor: "pointer", color: "var(--mx)" }}>{l}</span>)}
        </div>
      </div>
    </div>
  );
};

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("loading"); // loading | landing | app
  const [authModal, setAuthModal] = useState(null);
  const [user, setUser] = useState(null);

  // Check for existing Supabase session on mount
  useState(() => {
    const init = async () => {
      try {
        const { getSession, getUser, supabase } = await import('./lib/supabase.js');
        const session = await getSession();
        if (session) {
          const u = await getUser();
          setUser({ id: u.id, name: u.user_metadata?.full_name || u.email, email: u.email });
          setView("app");
        } else {
          setView("landing");
        }
        // Listen for auth changes
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
        // Supabase not configured yet — show landing
        setView("landing");
      }
    };
    init();
  }, []);

  const handleSuccess = (userData) => {
    setUser(userData);
    setAuthModal(null);
    setView("app");
  };

  const handleLogout = async () => {
    try {
      const { signOut } = await import('./lib/supabase.js');
      await signOut();
    } catch {}
    setUser(null);
    setView("landing");
  };

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

  return (
    <>
      <G />
      {view === "landing" && (
        <LandingPage
          onLogin={() => setAuthModal("login")}
          onSignup={() => setAuthModal("signup")}
        />
      )}
      {view === "app" && user && (
        <Dashboard user={user} onLogout={handleLogout} />
      )}
      {authModal && (
        <AuthModal
          mode={authModal}
          onClose={() => setAuthModal(null)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
}
