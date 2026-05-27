"use client";

import { useState, useEffect } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useLanguage } from "@/contexts/LanguageContext";

const ACCENT_PRESETS = [
  { hex: "#4f46e5", name: "Indigo"   },
  { hex: "#7c3aed", name: "Violet"   },
  { hex: "#ec4899", name: "Pink"     },
  { hex: "#f43f5e", name: "Rose"     },
  { hex: "#f59e0b", name: "Amber"    },
  { hex: "#10b981", name: "Emerald"  },
  { hex: "#0891b2", name: "Cyan"     },
  { hex: "#111827", name: "Black"    },
];

export default function WorkspaceSettingsPage() {
  const { current, refresh } = useWorkspace();
  const { t } = useLanguage();

  const [selected, setSelected] = useState<string>("#4f46e5");
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState("");

  // Load current accent color from workspace
  useEffect(() => {
    if (current?.accentColor) setSelected(current.accentColor);
  }, [current?.accentColor]);

  async function handleSave() {
    if (!current?.id) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await fetch("/api/workspace", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ accentColor: selected, workspaceId: current.id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setError(d.error || "Failed to save");
      } else {
        await refresh();
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        // Immediately apply the new accent color
        document.documentElement.style.setProperty("--accent", selected);
        document.documentElement.style.setProperty("--accent-hover", selected);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!current) {
    return (
      <div className="text-center py-20 text-muted">
        <p className="text-lg font-medium">{t("common.noWorkspace")}</p>
      </div>
    );
  }

  // Only OWNER/ADMIN can edit
  const canEdit = current.role === "OWNER" || current.role === "ADMIN";

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("workspace.settings")}</h1>
        <p className="text-sm text-muted mt-1">{current.name}</p>
      </div>

      {/* Accent color card */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: selected }}
          >
            <span className="text-white text-sm">A</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("workspace.accentColor")}</h2>
            <p className="text-xs text-muted">{t("workspace.accentColorHint")}</p>
          </div>
        </div>

        {/* Color presets */}
        <div className="flex flex-wrap gap-2.5 mb-5">
          {ACCENT_PRESETS.map(({ hex, name }) => (
            <button
              key={hex}
              onClick={() => canEdit && setSelected(hex)}
              disabled={!canEdit}
              title={name}
              className={`w-9 h-9 rounded-xl transition-transform hover:scale-110 disabled:cursor-not-allowed ${
                selected === hex ? "ring-2 ring-offset-2 ring-foreground/40 scale-110" : ""
              }`}
              style={{ background: hex }}
            />
          ))}

          {/* Custom color picker */}
          {canEdit && (
            <label
              title="Custom color"
              className="relative w-9 h-9 rounded-xl border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-muted transition-colors overflow-hidden"
            >
              <input
                type="color"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <span className="text-muted text-xs font-bold">+</span>
            </label>
          )}
        </div>

        {/* Preview */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-subtle mb-5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: selected }}
          >
            {current.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Preview</p>
            <p className="text-xs text-muted">Accent color applied to buttons, badges, and highlights</p>
          </div>
          <button
            className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
            style={{ background: selected }}
          >
            Action
          </button>
        </div>

        {!canEdit && (
          <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 px-3 py-2 rounded-lg mb-4">
            Only OWNER or ADMIN can change workspace accent color.
          </p>
        )}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 px-3 py-2 rounded-lg mb-4">
            {error}
          </p>
        )}

        {canEdit && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              style={{ background: selected }}
            >
              {saving ? t("common.loading") : t("workspace.saveColor")}
            </button>
            {saved && (
              <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                {t("workspace.colorSaved")}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
