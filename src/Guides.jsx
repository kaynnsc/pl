import React, { useState, useEffect, useCallback, useRef } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { ChevronDown, ChevronRight, Plus, Trash2, Loader2, Image as ImageIcon, ArrowLeft, Pencil } from "lucide-react";

const GUIDES_DOC_REF = doc(db, "pricelist", "guides");
const uid = () => Math.random().toString(36).slice(2, 10);

const emptyEntry = () => ({ id: uid(), title: "New entry", body: "", imageUrl: "" });
const emptySection = () => ({ id: uid(), title: "New section", entries: [emptyEntry()] });
const emptyApp = () => ({ id: uid(), name: "New app", sections: [emptySection()] });

const DEFAULT_GUIDES = {
  apps: [
    {
      id: uid(),
      name: "Netflix",
      sections: [
        {
          id: uid(),
          title: "Penjelasan & Problem Netflix",
          entries: [
            { id: uid(), title: "Penjelasan Netflix", body: "Akun sharing 1 profil per user. Jangan ganti nama profil, foto profil, atau bahasa.", imageUrl: "" },
            { id: uid(), title: "Cara send kode household", body: "Buka Netflix > Kelola Profil > Rumah > Dapatkan Kode. Kirim kode 4 digit ke admin.", imageUrl: "" },
            { id: uid(), title: "Cara logout Netflix TV", body: "Masuk ke Settings > Akun > Sign Out di perangkat TV sebelum mengembalikan slot.", imageUrl: "" },
          ],
        },
        {
          id: uid(),
          title: "Contoh Problem",
          entries: [
            { id: uid(), title: "Problem household", body: "Jika muncul layar 'Perangkat Ini Bukan Bagian dari Rumah Anda', hubungi admin untuk kirim ulang kode.", imageUrl: "" },
            { id: uid(), title: "Problem wiped", body: "Jika akun tiba-tiba logout total, tunggu info dari admin sebelum login ulang.", imageUrl: "" },
          ],
        },
        {
          id: uid(),
          title: "Tips",
          entries: [
            { id: uid(), title: "Tips household", body: "Selalu gunakan WiFi rumah yang sama minimal 1x per bulan agar tidak perlu verifikasi ulang.", imageUrl: "" },
          ],
        },
      ],
    },
  ],
};

function Modal({ children, onClose, title, T }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: T.overlay, display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.bg, borderRadius: "16px 16px 0 0", padding: 24, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 -12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, margin: 0, fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={iconBtnStyle(T)}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function inputStyle(T) {
  return { border: `1px solid ${T.cardBorder}`, borderRadius: 5, padding: "8px 10px", background: T.bgElevated, color: T.ink, outline: "none", fontFamily: "'Work Sans', sans-serif", width: "100%" };
}
function ghostBtnStyle(T) {
  return { display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "9px 12px", borderRadius: 8, border: `1px dashed ${T.cardBorder}`, background: "transparent", color: T.inkMuted, cursor: "pointer", fontFamily: "'Work Sans', sans-serif" };
}
function iconBtnStyle(T) {
  return { display: "flex", alignItems: "center", justifyContent: "center", padding: 5, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", color: T.inkMuted };
}
function primaryBtnStyle(T) {
  return { background: T.accent, color: T.isDark ? "#08131F" : "#F4FAFF", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 13.5, cursor: "pointer", fontFamily: "'Work Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 };
}

export default function Guides({ T, isAdmin, flashToast }) {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [activeAppId, setActiveAppId] = useState(null);
  const [expandedEntry, setExpandedEntry] = useState(null);
  const [editEntry, setEditEntry] = useState(null); // {sectionId, entryId} being edited
  const editingRef = useRef(false);

  useEffect(() => {
    const unsub = onSnapshot(
      GUIDES_DOC_REF,
      (snap) => {
        if (!snap.exists()) {
          setDoc(GUIDES_DOC_REF, DEFAULT_GUIDES).catch(() => {});
          setData(DEFAULT_GUIDES);
        } else if (!editingRef.current) {
          setData(snap.data());
        }
        setLoaded(true);
      },
      () => {
        setData(DEFAULT_GUIDES);
        setLoaded(true);
      }
    );
    return () => unsub();
  }, []);

  const persist = useCallback(
    async (next) => {
      setData(next);
      try {
        await setDoc(GUIDES_DOC_REF, next);
      } catch (e) {
        flashToast && flashToast("Couldn't save — check your connection");
      }
    },
    [flashToast]
  );

  if (!loaded || !data) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <Loader2 className="animate-spin" color={T.accent} size={24} />
      </div>
    );
  }

  const apps = data.apps || [];
  const activeApp = apps.find((a) => a.id === activeAppId);

  const addApp = () => persist({ ...data, apps: [...apps, emptyApp()] });
  const renameApp = (id, name) => persist({ ...data, apps: apps.map((a) => (a.id === id ? { ...a, name } : a)) });
  const deleteApp = (id) => {
    persist({ ...data, apps: apps.filter((a) => a.id !== id) });
    if (activeAppId === id) setActiveAppId(null);
  };

  const updateApp = (appId, updater) => {
    persist({ ...data, apps: apps.map((a) => (a.id === appId ? updater(a) : a)) });
  };

  const addSection = (appId) => updateApp(appId, (a) => ({ ...a, sections: [...a.sections, emptySection()] }));
  const renameSection = (appId, sectionId, title) =>
    updateApp(appId, (a) => ({ ...a, sections: a.sections.map((s) => (s.id === sectionId ? { ...s, title } : s)) }));
  const deleteSection = (appId, sectionId) =>
    updateApp(appId, (a) => ({ ...a, sections: a.sections.filter((s) => s.id !== sectionId) }));

  const addEntry = (appId, sectionId) =>
    updateApp(appId, (a) => ({
      ...a,
      sections: a.sections.map((s) => (s.id === sectionId ? { ...s, entries: [...s.entries, emptyEntry()] } : s)),
    }));
  const updateEntry = (appId, sectionId, entryId, patch) =>
    updateApp(appId, (a) => ({
      ...a,
      sections: a.sections.map((s) =>
        s.id === sectionId ? { ...s, entries: s.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)) } : s
      ),
    }));
  const deleteEntry = (appId, sectionId, entryId) =>
    updateApp(appId, (a) => ({
      ...a,
      sections: a.sections.map((s) => (s.id === sectionId ? { ...s, entries: s.entries.filter((e) => e.id !== entryId) } : s)),
    }));

  // ---- App list view ----
  if (!activeApp) {
    return (
      <div style={{ padding: "0 20px" }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, margin: "4px 0 14px" }}>Guides & FAQ</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {apps.length === 0 && <div style={{ color: T.inkFaint, fontSize: 13.5, padding: "20px 0" }}>No guides yet.</div>}
          {apps.map((app) => (
            <div
              key={app.id}
              style={{ background: T.bgElevated, border: `1px solid ${T.cardBorder}`, borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
              onClick={() => setActiveAppId(app.id)}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{app.name}</div>
                <div style={{ fontSize: 12, color: T.inkFaint, marginTop: 2 }}>
                  {app.sections.length} section{app.sections.length !== 1 ? "s" : ""} ·{" "}
                  {app.sections.reduce((n, s) => n + s.entries.length, 0)} entries
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {isAdmin && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteApp(app.id);
                    }}
                    style={{ ...iconBtnStyle(T), color: T.danger }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <ChevronRight size={16} color={T.inkFaint} />
              </div>
            </div>
          ))}
        </div>
        {isAdmin && (
          <button onClick={addApp} style={{ ...ghostBtnStyle(T), width: "100%", justifyContent: "center", marginTop: 12 }}>
            <Plus size={13} /> Add app
          </button>
        )}
      </div>
    );
  }

  // ---- App detail view ----
  return (
    <div style={{ padding: "0 20px" }}>
      <button onClick={() => setActiveAppId(null)} style={{ ...ghostBtnStyle(T), border: "none", padding: "6px 0", marginBottom: 10 }}>
        <ArrowLeft size={14} /> All guides
      </button>

      {isAdmin ? (
        <input
          defaultValue={activeApp.name}
          onFocus={() => (editingRef.current = true)}
          onBlur={(e) => {
            editingRef.current = false;
            renameApp(activeApp.id, e.target.value);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
          style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, border: "none", borderBottom: `2px solid ${T.accent}`, background: "transparent", color: T.ink, outline: "none", marginBottom: 14, width: "100%" }}
        />
      ) : (
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, margin: "0 0 14px" }}>{activeApp.name}</h2>
      )}

      {activeApp.sections.map((section) => (
        <div key={section.id} style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            {isAdmin ? (
              <input
                defaultValue={section.title}
                onFocus={() => (editingRef.current = true)}
                onBlur={(e) => {
                  editingRef.current = false;
                  renameSection(activeApp.id, section.id, e.target.value);
                }}
                onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                style={{ fontSize: 13.5, fontWeight: 600, color: T.accent, border: "none", borderBottom: `1px solid ${T.cardBorder}`, background: "transparent", outline: "none", flex: 1 }}
              />
            ) : (
              <div style={{ fontSize: 13.5, fontWeight: 600, color: T.accent, textTransform: "uppercase", letterSpacing: 0.3 }}>{section.title}</div>
            )}
            {isAdmin && (
              <button onClick={() => deleteSection(activeApp.id, section.id)} style={{ ...iconBtnStyle(T), color: T.danger }}>
                <Trash2 size={13} />
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {section.entries.map((entry) => {
              const key = `${section.id}:${entry.id}`;
              const isOpen = expandedEntry === key;
              const isEditing = editEntry && editEntry.sectionId === section.id && editEntry.entryId === entry.id;
              return (
                <div key={entry.id} style={{ background: T.bgElevated, border: `1px solid ${T.cardBorder}`, borderRadius: 10, overflow: "hidden" }}>
                  <div
                    onClick={() => !isEditing && setExpandedEntry(isOpen ? null : key)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 14, color: T.ink }}>{entry.title}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedEntry(key);
                            setEditEntry(isEditing ? null : { sectionId: section.id, entryId: entry.id });
                          }}
                          style={iconBtnStyle(T)}
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteEntry(activeApp.id, section.id, entry.id);
                          }}
                          style={{ ...iconBtnStyle(T), color: T.danger }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                      {isOpen ? <ChevronDown size={15} color={T.inkFaint} /> : <ChevronRight size={15} color={T.inkFaint} />}
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${T.cardBorder}` }}>
                      {isEditing ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                          <input
                            defaultValue={entry.title}
                            placeholder="Entry title"
                            onBlur={(e) => updateEntry(activeApp.id, section.id, entry.id, { title: e.target.value })}
                            style={inputStyle(T)}
                          />
                          <textarea
                            defaultValue={entry.body}
                            placeholder="Explanation / FAQ answer..."
                            rows={5}
                            onBlur={(e) => updateEntry(activeApp.id, section.id, entry.id, { body: e.target.value })}
                            style={{ ...inputStyle(T), resize: "vertical" }}
                          />
                          <div>
                            <label style={{ fontSize: 11.5, color: T.inkFaint, display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                              <ImageIcon size={12} /> Image URL (optional)
                            </label>
                            <input
                              defaultValue={entry.imageUrl}
                              placeholder="https://..."
                              onBlur={(e) => updateEntry(activeApp.id, section.id, entry.id, { imageUrl: e.target.value })}
                              style={inputStyle(T)}
                            />
                          </div>
                          <button onClick={() => setEditEntry(null)} style={{ ...primaryBtnStyle(T), alignSelf: "flex-start" }}>
                            Done
                          </button>
                        </div>
                      ) : (
                        <div style={{ marginTop: 12 }}>
                          {entry.body ? (
                            <p style={{ fontSize: 13.5, color: T.inkMuted, whiteSpace: "pre-wrap", lineHeight: 1.55, margin: 0 }}>{entry.body}</p>
                          ) : (
                            <p style={{ fontSize: 13, color: T.inkFaint, fontStyle: "italic", margin: 0 }}>Nothing written yet.</p>
                          )}
                          {entry.imageUrl && (
                            <img
                              src={entry.imageUrl}
                              alt={entry.title}
                              style={{ maxWidth: "100%", borderRadius: 8, marginTop: 10, border: `1px solid ${T.cardBorder}` }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {isAdmin && (
            <button onClick={() => addEntry(activeApp.id, section.id)} style={{ ...ghostBtnStyle(T), marginTop: 8, width: "100%", justifyContent: "center" }}>
              <Plus size={12} /> Add entry
            </button>
          )}
        </div>
      ))}

      {isAdmin && (
        <button onClick={() => addSection(activeApp.id)} style={{ ...ghostBtnStyle(T), width: "100%", justifyContent: "center", borderStyle: "solid" }}>
          <Plus size={13} /> Add section
        </button>
      )}
    </div>
  );
}
