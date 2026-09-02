import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import {
  Search, Moon, Sun, User, Plus, Trash2, Upload, Download, X, Check,
  Sheet, Loader2, LayoutGrid, List, Settings, Lock, Unlock, FileText,
} from "lucide-react";

const FONT_LINK = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Work+Sans:wght@400;500;600&display=swap');
html, body, #root { margin: 0; padding: 0; width: 100%; }
* { box-sizing: border-box; }
body { overflow-x: hidden; }
`;

const DEFAULT_PASSWORD = "admin123";
const DOC_REF = doc(db, "pricelist", "main");
const THEME_KEY = "pricelist-theme";

const uid = () => Math.random().toString(36).slice(2, 10);

const emptyItem = (category) => ({ id: uid(), category, name: "New item", description: "", price: 0, unit: "", terms: "" });

const DEFAULT_ITEMS = [
  { id: uid(), category: "Streaming Apps", name: "Netflix 1 hari", description: "1 Profil, 1 User", price: 6000, unit: "hari", terms: "Akun sharing, dilarang ganti password. Garansi selama masa aktif." },
  { id: uid(), category: "Streaming Apps", name: "Netflix 1 bulan", description: "1 Profil, 1 User", price: 45000, unit: "bulan", terms: "Akun sharing, dilarang ganti password. Garansi selama masa aktif." },
  { id: uid(), category: "Education Apps", name: "Canva Pro 1 bulan", description: "Akun pribadi", price: 15000, unit: "bulan", terms: "Login hanya di 1 perangkat. Tidak untuk dibagikan." },
];

const DEFAULT_STATE = { title: "GinzaCo", subtitle: "Aplikasi Premium", password: DEFAULT_PASSWORD, items: DEFAULT_ITEMS };

function formatIDR(n) {
  const num = Number(n);
  const safe = Number.isNaN(num) ? 0 : num;
  const formatted = safe.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `Rp ${formatted}`;
}

function parseCSV(text) {
  const delim = text.includes("\t") ? "\t" : ",";
  const lines = text.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const splitLine = (line) => {
    if (delim === "\t") return line.split("\t");
    const out = []; let cur = ""; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQuotes = !inQuotes;
      else if (c === "," && !inQuotes) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };
  const header = splitLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((l) => splitLine(l));
  return rows.map((r) => { const obj = {}; header.forEach((h, i) => (obj[h] = (r[i] || "").trim())); return obj; });
}

function rowsToItems(rows) {
  return rows.map((row) => {
    const category = row.category || row.section || "Uncategorized";
    const name = row.name || row.item || row.product;
    if (!name) return null;
    return {
      id: uid(),
      category,
      name,
      description: row.description || row.notes || "",
      price: parseFloat(row.price || row.cost || 0) || 0,
      unit: row.unit || "",
      terms: row.terms || row.tnc || row["tnc/terms"] || row.syarat || "",
    };
  }).filter(Boolean);
}

// ---- theme tokens ----
const THEMES = {
  light: {
    bg: "#EAF3FB", bgElevated: "#FFFFFF", card: "#F2F8FD", cardBorder: "#D6E6F3",
    ink: "#132B42", inkMuted: "#4E7189", inkFaint: "#93AEC3", accent: "#1F6FA8",
    accentSoft: "#DCEBF7", price: "#B9762A", danger: "#C24A3D", dangerSoft: "#FBEAE7",
    chipBg: "#DCEBF7", chipActiveBg: "#1F6FA8", chipActiveText: "#F4FAFF",
    navBg: "#FFFFFF", navBorder: "#D6E6F3", overlay: "rgba(19,43,66,0.4)",
    isDark: false,
  },
  dark: {
    bg: "#0A1220", bgElevated: "#101B2D", card: "#101B2D", cardBorder: "#1E3049",
    ink: "#E7EEF7", inkMuted: "#93ADC5", inkFaint: "#57708A", accent: "#4098C7",
    accentSoft: "#152840", price: "#DDA85C", danger: "#E2695C", dangerSoft: "#2A1A18",
    chipBg: "#152840", chipActiveBg: "#4098C7", chipActiveText: "#08131F",
    navBg: "#0D1826", navBorder: "#1E3049", overlay: "rgba(0,0,0,0.6)",
    isDark: true,
  },
};

export default function App() {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) === "dark"; } catch (e) { return false; }
  });
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [viewMode, setViewMode] = useState("list");
  const [showLogin, setShowLogin] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [importError, setImportError] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [showPwChange, setShowPwChange] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [showAdminSheet, setShowAdminSheet] = useState(false);
  const [termsItem, setTermsItem] = useState(null); // item being viewed (public) or edited (admin) for terms
  const [editingTerms, setEditingTerms] = useState(false);
  const [termsDraft, setTermsDraft] = useState("");
  const fileInputRef = useRef(null);
  const editingRef = useRef(false);

  const T = dark ? THEMES.dark : THEMES.light;

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, dark ? "dark" : "light"); } catch (e) {}
    document.body.style.background = T.bg;
    document.documentElement.style.background = T.bg;
  }, [dark, T.bg]);

  const flashToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  useEffect(() => {
    const unsub = onSnapshot(DOC_REF, (snap) => {
      if (!snap.exists()) {
        setDoc(DOC_REF, DEFAULT_STATE).catch(() => setConnectionError(true));
        setState(DEFAULT_STATE);
      } else if (!editingRef.current) {
        setState(snap.data());
      }
      setLoaded(true);
    }, (err) => {
      console.error(err);
      setConnectionError(true);
      setState(DEFAULT_STATE);
      setLoaded(true);
    });
    return () => unsub();
  }, []);

  const persist = useCallback(async (next) => {
    setState(next);
    try { await setDoc(DOC_REF, next); } catch (e) { flashToast("Couldn't save — check your connection"); }
  }, []);

  const items = state?.items || [];
  const categories = useMemo(() => {
    const set = [];
    items.forEach((it) => { if (!set.includes(it.category)) set.push(it.category); });
    return ["All", ...set];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const matchesCat = activeCategory === "All" || it.category === activeCategory;
      const matchesQuery = !query.trim() || (it.name + " " + it.description).toLowerCase().includes(query.toLowerCase());
      return matchesCat && matchesQuery;
    });
  }, [items, activeCategory, query]);

  if (!loaded || !state) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg }}>
        <Loader2 className="animate-spin" color={T.accent} size={28} />
      </div>
    );
  }

  const handleLogin = () => {
    if (pwInput === (state.password || DEFAULT_PASSWORD)) {
      setIsAdmin(true); setShowLogin(false); setPwInput(""); setLoginError(""); setShowAdminSheet(true);
    } else setLoginError("That password doesn't match.");
  };

  const handleAvatarClick = () => {
    if (isAdmin) setShowAdminSheet(true);
    else setShowLogin(true);
  };

  const updateItem = (id, patch) => persist({ ...state, items: items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  const deleteItem = (id) => persist({ ...state, items: items.filter((it) => it.id !== id) });
  const addItem = (category) => persist({ ...state, items: [...items, emptyItem(category === "All" ? "General" : category)] });
  const renameCategory = (oldName, newName) => {
    if (!newName.trim() || newName === oldName) return;
    persist({ ...state, items: items.map((it) => (it.category === oldName ? { ...it, category: newName } : it)) });
  };
  const deleteCategory = (name) => persist({ ...state, items: items.filter((it) => it.category !== name) });
  const addCategory = () => persist({ ...state, items: [...items, emptyItem("New category")] });

  const exportExcel = () => {
    const rows = items.map((it) => ({ Category: it.category, Name: it.name, Description: it.description, Price: it.price, Unit: it.unit, Terms: it.terms || "" }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 16 }, { wch: 22 }, { wch: 32 }, { wch: 10 }, { wch: 10 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Price list");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${(state.title || "pricelist").replace(/\s+/g, "-").toLowerCase()}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    flashToast("Exported");
  };

  const handleExcelFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportBusy(true); setImportError("");
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        const normalized = rows.map((r) => { const lower = {}; Object.keys(r).forEach((k) => (lower[k.toLowerCase()] = r[k])); return lower; });
        const newItems = rowsToItems(normalized);
        if (newItems.length === 0) setImportError("No rows recognized. Expect columns: Category, Name, Description, Price, Unit, Terms.");
        else { persist({ ...state, items: newItems }); setShowImport(false); flashToast(`Imported ${newItems.length} items`); }
      } catch (err) { setImportError("Couldn't read that file. Make sure it's a valid .xlsx or .csv."); }
      finally { setImportBusy(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
    };
    reader.readAsArrayBuffer(file);
  };

  const importFromUrl = async () => {
    if (!sheetUrl.trim()) return;
    setImportBusy(true); setImportError("");
    try {
      const res = await fetch(sheetUrl.trim());
      if (!res.ok) throw new Error("bad response");
      const text = await res.text();
      const newItems = rowsToItems(parseCSV(text));
      if (newItems.length === 0) setImportError("Fetched the sheet but couldn't find recognizable columns.");
      else { persist({ ...state, items: newItems }); setShowImport(false); flashToast(`Imported ${newItems.length} items from Google Sheets`); }
    } catch (err) { setImportError("Couldn't fetch that link directly. Try pasting the sheet's cells below instead."); }
    finally { setImportBusy(false); }
  };

  const importFromPaste = () => {
    if (!pasteText.trim()) return;
    setImportError("");
    const newItems = rowsToItems(parseCSV(pasteText.trim()));
    if (newItems.length === 0) setImportError("Couldn't find recognizable columns. First row should have headers like Category, Name, Price, Terms.");
    else { persist({ ...state, items: newItems }); setShowImport(false); setPasteText(""); flashToast(`Imported ${newItems.length} items`); }
  };

  const openTerms = (item) => { setTermsItem(item); setTermsDraft(item.terms || ""); setEditingTerms(false); };
  const saveTerms = () => {
    if (termsItem) {
      updateItem(termsItem.id, { terms: termsDraft });
      setTermsItem({ ...termsItem, terms: termsDraft });
      setEditingTerms(false);
      flashToast("Terms updated");
    }
  };

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: T.bg, fontFamily: "'Work Sans', sans-serif", color: T.ink, transition: "background 0.2s, color 0.2s" }}>
      <style>{FONT_LINK}</style>

      {connectionError && (
        <div style={{ background: T.dangerSoft, color: T.danger, fontSize: 12.5, padding: "8px 20px", textAlign: "center" }}>
          Couldn't connect to Firebase. Check your .env values and Firestore rules.
        </div>
      )}

      <div style={{ maxWidth: 480, margin: "0 auto", paddingBottom: 90, width: "100%" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 14px" }}>
          <button
            onClick={handleAvatarClick}
            title={isAdmin ? "Admin tools" : "Admin login"}
            style={{ width: 38, height: 38, borderRadius: "50%", background: T.card, border: `1px solid ${T.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center", color: isAdmin ? T.accent : T.inkMuted, cursor: "pointer", flexShrink: 0 }}
          >
            <User size={18} />
          </button>

          {editingTitle && isAdmin ? (
            <input
              autoFocus
              value={state.title}
              onChange={(e) => setState({ ...state, title: e.target.value })}
              onBlur={() => { persist(state); setEditingTitle(false); }}
              onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
              style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, border: "none", borderBottom: `2px solid ${T.accent}`, background: "transparent", color: T.ink, textAlign: "center", outline: "none", maxWidth: 220 }}
            />
          ) : (
            <h1
              onClick={() => isAdmin && setEditingTitle(true)}
              style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, margin: 0, cursor: isAdmin ? "text" : "default", textAlign: "center" }}
            >
              {state.title}
            </h1>
          )}

          <button onClick={() => setDark(!dark)} style={{ width: 38, height: 38, borderRadius: "50%", background: T.card, border: `1px solid ${T.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center", color: T.ink, cursor: "pointer", flexShrink: 0 }} title="Toggle dark mode">
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>

        {/* search */}
        <div style={{ padding: "0 20px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.bgElevated, border: `1px solid ${T.cardBorder}`, borderRadius: 999, padding: "10px 16px" }}>
            <Search size={16} color={T.inkFaint} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the menu"
              style={{ border: "none", outline: "none", background: "transparent", flex: 1, fontSize: 14, color: T.ink, fontFamily: "'Work Sans', sans-serif" }}
            />
          </div>
        </div>

        {/* category chips */}
        <div style={{ display: "flex", gap: 8, padding: "0 20px 18px", overflowX: "auto" }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                flexShrink: 0, padding: "7px 16px", borderRadius: 999, fontSize: 13, border: "none", cursor: "pointer",
                fontFamily: "'Work Sans', sans-serif", fontWeight: 500,
                background: activeCategory === cat ? T.chipActiveBg : T.chipBg,
                color: activeCategory === cat ? T.chipActiveText : T.inkMuted,
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* subtitle + view toggle */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px 12px" }}>
          <span style={{ fontSize: 12.5, color: T.inkFaint }}>{state.subtitle}</span>
          <div style={{ display: "flex", gap: 4, background: T.card, borderRadius: 8, padding: 3 }}>
            <button onClick={() => setViewMode("list")} style={miniToggleStyle(viewMode === "list", T)}><List size={14} /></button>
            <button onClick={() => setViewMode("grid")} style={miniToggleStyle(viewMode === "grid", T)}><LayoutGrid size={14} /></button>
          </div>
        </div>

        {/* items */}
        <div style={{ padding: "0 20px", display: viewMode === "grid" ? "grid" : "flex", gridTemplateColumns: viewMode === "grid" ? "1fr 1fr" : undefined, gap: 10, flexDirection: viewMode === "list" ? "column" : undefined }}>
          {filteredItems.length === 0 && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", color: T.inkFaint, fontSize: 13.5, padding: "30px 0" }}>No items match.</div>
          )}
          {filteredItems.map((it) =>
            viewMode === "grid" ? (
              <GridCard key={it.id} item={it} T={T} isAdmin={isAdmin} onChange={(p) => updateItem(it.id, p)} onDelete={() => deleteItem(it.id)} onOpenTerms={() => openTerms(it)} onFocusStart={() => (editingRef.current = true)} onFocusEnd={() => (editingRef.current = false)} />
            ) : (
              <ListCard key={it.id} item={it} T={T} isAdmin={isAdmin} onChange={(p) => updateItem(it.id, p)} onDelete={() => deleteItem(it.id)} onOpenTerms={() => openTerms(it)} onFocusStart={() => (editingRef.current = true)} onFocusEnd={() => (editingRef.current = false)} />
            )
          )}
        </div>

        {isAdmin && (
          <div style={{ padding: "16px 20px 0" }}>
            <button onClick={() => addItem(activeCategory)} style={{ ...ghostBtnStyle(T), width: "100%", justifyContent: "center" }}>
              <Plus size={13} /> Add item to {activeCategory === "All" ? "General" : activeCategory}
            </button>
          </div>
        )}

        <div style={{ marginTop: 30, padding: "0 20px", fontSize: 11.5, color: T.inkFaint, textAlign: "center" }}>
          Tap any item to view its terms & conditions before ordering.
        </div>
      </div>

      {/* bottom nav — just the view toggle now */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: T.navBg, borderTop: `1px solid ${T.navBorder}`, display: "flex", justifyContent: "center", padding: "12px 20px calc(12px + env(safe-area-inset-bottom))", zIndex: 20 }}>
        <button onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")} style={navBtnStyle(T, true)}>
          {viewMode === "list" ? <LayoutGrid size={19} /> : <List size={19} />}
        </button>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 74, left: "50%", transform: "translateX(-50%)", background: T.accent, color: T.isDark ? "#08131F" : "#F4FAFF", padding: "10px 18px", borderRadius: 6, fontSize: 13.5, display: "flex", alignItems: "center", gap: 6, zIndex: 30 }}>
          <Check size={14} /> {toast}
        </div>
      )}

      {showLogin && (
        <Modal T={T} onClose={() => { setShowLogin(false); setPwInput(""); setLoginError(""); }} title="Admin login">
          <p style={{ fontSize: 13.5, color: T.inkMuted, marginTop: -6, marginBottom: 14 }}>Enter the admin password to edit prices.</p>
          <input type="password" autoFocus value={pwInput} onChange={(e) => setPwInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} placeholder="Password" style={inputStyle(T)} />
          {loginError && <p style={{ color: T.danger, fontSize: 12.5, marginTop: 6 }}>{loginError}</p>}
          <button onClick={handleLogin} style={{ ...primaryBtnStyle(T), marginTop: 14 }}>Unlock</button>
          <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 14 }}>
            Default password is <code>admin123</code> until changed. Client-side lock only — see README for real access control.
          </p>
        </Modal>
      )}

      {showAdminSheet && isAdmin && (
        <Modal T={T} onClose={() => setShowAdminSheet(false)} title="Admin tools">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={() => { setShowAdminSheet(false); setShowImport(true); }} style={ghostBtnStyle(T)}><Upload size={14} /> Import prices</button>
            <button onClick={exportExcel} style={ghostBtnStyle(T)}><Download size={14} /> Export Excel</button>
            <button onClick={addCategory} style={ghostBtnStyle(T)}><Plus size={14} /> Add category</button>
            <button onClick={() => setShowPwChange(true)} style={ghostBtnStyle(T)}><Settings size={14} /> Change password</button>
            <button onClick={() => { setIsAdmin(false); setShowAdminSheet(false); }} style={{ ...ghostBtnStyle(T), color: T.danger, borderColor: T.danger }}>
              <Lock size={14} /> Exit admin mode
            </button>
          </div>

          <div style={{ marginTop: 18, borderTop: `1px solid ${T.cardBorder}`, paddingTop: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 8, color: T.inkMuted }}>Categories</div>
            {categories.filter((c) => c !== "All").map((cat) => (
              <div key={cat} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <input defaultValue={cat} onFocus={() => (editingRef.current = true)} onBlur={(e) => { editingRef.current = false; renameCategory(cat, e.target.value); }} onKeyDown={(e) => e.key === "Enter" && e.target.blur()} style={{ ...inputStyle(T), flex: 1, fontSize: 13 }} />
                <button onClick={() => deleteCategory(cat)} style={{ ...iconBtnStyle(T), color: T.danger }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {showPwChange && (
        <Modal T={T} onClose={() => { setShowPwChange(false); setNewPw(""); }} title="Change admin password">
          <input type="text" autoFocus value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password" style={inputStyle(T)} />
          <button onClick={() => { if (newPw.trim()) { persist({ ...state, password: newPw.trim() }); flashToast("Password updated"); setShowPwChange(false); setNewPw(""); } }} style={{ ...primaryBtnStyle(T), marginTop: 14 }}>Save password</button>
        </Modal>
      )}

      {showImport && (
        <Modal T={T} onClose={() => { setShowImport(false); setImportError(""); }} title="Import prices">
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>From Excel or CSV file</div>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelFile} style={{ fontSize: 13, color: T.ink }} />
            </div>
            <div style={{ borderTop: `1px solid ${T.cardBorder}`, paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><Sheet size={14} /> From a public Google Sheet</div>
              <p style={{ fontSize: 12, color: T.inkMuted, marginBottom: 8 }}>File → Share → Publish to web → CSV, then paste the link here.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/.../pub?output=csv" style={{ ...inputStyle(T), flex: 1 }} />
                <button onClick={importFromUrl} disabled={importBusy} style={primaryBtnStyle(T)}>{importBusy ? <Loader2 size={14} className="animate-spin" /> : "Fetch"}</button>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${T.cardBorder}`, paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Or paste cells directly</div>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"Category\tName\tDescription\tPrice\tUnit\tTerms"} rows={5} style={{ ...inputStyle(T), fontFamily: "monospace", fontSize: 12, resize: "vertical" }} />
              <button onClick={importFromPaste} style={{ ...primaryBtnStyle(T), marginTop: 8 }}>Import pasted data</button>
            </div>
            {importError && <p style={{ color: T.danger, fontSize: 12.5, background: T.dangerSoft, padding: "8px 10px", borderRadius: 4 }}>{importError}</p>}
            <p style={{ fontSize: 11, color: T.inkFaint }}>Columns (any order): Category, Name, Description, Price, Unit, Terms. Importing replaces the current list.</p>
          </div>
        </Modal>
      )}

      {termsItem && (
        <Modal T={T} onClose={() => { setTermsItem(null); setEditingTerms(false); }} title={termsItem.name}>
          <div style={{ marginBottom: 12 }}>
            {termsItem.description && <p style={{ fontSize: 13, color: T.inkMuted, marginBottom: 6 }}>{termsItem.description}</p>}
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: T.price, margin: 0 }}>
              {formatIDR(termsItem.price)}{termsItem.unit && <span style={{ fontSize: 13, color: T.inkFaint }}> /{termsItem.unit}</span>}
            </p>
          </div>
          <div style={{ borderTop: `1px solid ${T.cardBorder}`, paddingTop: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 8, color: T.inkMuted, display: "flex", alignItems: "center", gap: 6 }}>
              <FileText size={13} /> Terms & Conditions
            </div>
            {isAdmin && editingTerms ? (
              <>
                <textarea
                  autoFocus
                  value={termsDraft}
                  onChange={(e) => setTermsDraft(e.target.value)}
                  rows={6}
                  placeholder="e.g. Garansi 7 hari, tidak untuk digunakan bersamaan di lebih dari 1 perangkat..."
                  style={{ ...inputStyle(T), width: "100%", fontSize: 13, resize: "vertical" }}
                />
                <button onClick={saveTerms} style={{ ...primaryBtnStyle(T), marginTop: 10 }}>Save terms</button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13.5, color: T.ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {termsItem.terms || "No terms have been set for this item yet."}
                </p>
                {isAdmin && (
                  <button onClick={() => setEditingTerms(true)} style={ghostBtnStyle(T)}>
                    <FileText size={13} /> Edit terms
                  </button>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function ListCard({ item, T, isAdmin, onChange, onDelete, onOpenTerms, onFocusStart, onFocusEnd }) {
  if (!isAdmin) {
    return (
      <div
        onClick={onOpenTerms}
        style={{ background: T.bgElevated, border: `1px solid ${T.cardBorder}`, borderRadius: 14, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer" }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{item.name}</div>
          {item.description && <div style={{ fontSize: 12.5, color: T.inkMuted, marginTop: 2 }}>{item.description}</div>}
        </div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, color: T.price, whiteSpace: "nowrap", textAlign: "right" }}>
          {formatIDR(item.price)}{item.unit && <div style={{ fontSize: 11, color: T.inkFaint, fontFamily: "'Work Sans', sans-serif" }}>/{item.unit}</div>}
        </div>
      </div>
    );
  }
  return (
    <div style={{ background: T.bgElevated, border: `1px solid ${T.cardBorder}`, borderRadius: 14, padding: 10, display: "flex", gap: 6, alignItems: "center" }}>
      <input defaultValue={item.name} onFocus={onFocusStart} onBlur={(e) => { onFocusEnd(); onChange({ name: e.target.value }); }} style={{ ...inputStyle(T), flex: "1 1 24%", fontSize: 13 }} placeholder="Name" />
      <input defaultValue={item.description} onFocus={onFocusStart} onBlur={(e) => { onFocusEnd(); onChange({ description: e.target.value }); }} style={{ ...inputStyle(T), flex: "1 1 24%", fontSize: 12 }} placeholder="Description" />
      <input defaultValue={item.price} type="number" step="1" onFocus={onFocusStart} onBlur={(e) => { onFocusEnd(); onChange({ price: parseFloat(e.target.value) || 0 }); }} style={{ ...inputStyle(T), width: 78, fontSize: 12 }} placeholder="Price" />
      <button onClick={onOpenTerms} style={iconBtnStyle(T)} title="Edit terms"><FileText size={14} /></button>
      <button onClick={onDelete} style={{ ...iconBtnStyle(T), color: T.danger }} title="Delete item"><Trash2 size={14} /></button>
    </div>
  );
}

function GridCard({ item, T, isAdmin, onChange, onDelete, onOpenTerms, onFocusStart, onFocusEnd }) {
  if (!isAdmin) {
    return (
      <div
        onClick={onOpenTerms}
        style={{ background: T.bgElevated, border: `1px solid ${T.cardBorder}`, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 6, minHeight: 100, cursor: "pointer" }}
      >
        <div style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</div>
        {item.description && <div style={{ fontSize: 11.5, color: T.inkMuted, flex: 1 }}>{item.description}</div>}
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, color: T.price }}>
          {formatIDR(item.price)}{item.unit && <span style={{ fontSize: 11, color: T.inkFaint, fontFamily: "'Work Sans', sans-serif" }}> /{item.unit}</span>}
        </div>
      </div>
    );
  }
  return (
    <div style={{ background: T.bgElevated, border: `1px solid ${T.cardBorder}`, borderRadius: 14, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      <input defaultValue={item.name} onFocus={onFocusStart} onBlur={(e) => { onFocusEnd(); onChange({ name: e.target.value }); }} style={{ ...inputStyle(T), fontSize: 12 }} placeholder="Name" />
      <input defaultValue={item.price} type="number" step="1" onFocus={onFocusStart} onBlur={(e) => { onFocusEnd(); onChange({ price: parseFloat(e.target.value) || 0 }); }} style={{ ...inputStyle(T), fontSize: 12 }} placeholder="Price" />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button onClick={onOpenTerms} style={iconBtnStyle(T)} title="Edit terms"><FileText size={13} /></button>
        <button onClick={onDelete} style={{ ...iconBtnStyle(T), color: T.danger }} title="Delete item"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

function Modal({ children, onClose, title, T }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: T.overlay, display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.bg, borderRadius: "16px 16px 0 0", padding: 24, width: "100%", maxWidth: 480, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 -12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, margin: 0, fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={iconBtnStyle(T)}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function miniToggleStyle(active, T) {
  return { padding: "5px 8px", borderRadius: 6, border: "none", cursor: "pointer", background: active ? T.bgElevated : "transparent", color: active ? T.ink : T.inkFaint, display: "flex" };
}
function navBtnStyle(T, active) {
  return { border: "none", background: "transparent", cursor: "pointer", color: active ? T.accent : T.inkMuted, display: "flex", alignItems: "center", justifyContent: "center", padding: 6 };
}
function ghostBtnStyle(T) {
  return { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, padding: "10px 14px", borderRadius: 8, border: `1px dashed ${T.cardBorder}`, background: "transparent", color: T.inkMuted, cursor: "pointer", fontFamily: "'Work Sans', sans-serif" };
}
function iconBtnStyle(T) {
  return { display: "flex", alignItems: "center", justifyContent: "center", padding: 5, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", color: T.inkMuted };
}
function primaryBtnStyle(T) {
  return { background: T.accent, color: T.isDark ? "#08131F" : "#F4FAFF", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 13.5, cursor: "pointer", fontFamily: "'Work Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 };
}
function inputStyle(T) {
  return { border: `1px solid ${T.cardBorder}`, borderRadius: 5, padding: "8px 10px", background: T.bgElevated, color: T.ink, outline: "none", fontFamily: "'Work Sans', sans-serif" };
}
