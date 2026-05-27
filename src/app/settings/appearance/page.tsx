"use client";

import { useTheme } from "next-themes";
import { useLanguage, type Lang } from "@/contexts/LanguageContext";
import { useState, useEffect } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";

type ThemeOption = "light" | "dark";

const THEMES: { value: ThemeOption; icon: string; labelKey: string }[] = [
  { value: "light",  icon: "☀️",  labelKey: "settings.themeLight"  },
  { value: "dark",   icon: "🌙",  labelKey: "settings.themeDark"   },
];

const LANGS: { value: Lang; flag: string; labelKey: string }[] = [
  { value: "en", flag: "🇺🇸", labelKey: "settings.languageEn" },
  { value: "id", flag: "🇮🇩", labelKey: "settings.languageId" },
];

export default function AppearancePage() {
  const { theme, setTheme }  = useTheme();
  const { lang, setLang, t } = useLanguage();
  const { current }          = useWorkspace();
  const [mounted, setMounted] = useState(false);
  const [saved,   setSaved]   = useState(false);

  useEffect(() => { setMounted(true); }, []);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("settings.title")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {current ? `${current.name} · ` : ""}{t("settings.appearance")}
        </p>
      </div>

      {/* Theme card */}
      <div className="bg-white dark:bg-[#151821] rounded-2xl border border-gray-100 dark:border-[#2a2f3d] shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
            <span className="text-base">🎨</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t("settings.theme")}</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500">Choose how the interface looks</p>
          </div>
        </div>

        {mounted && (
          <div className="grid grid-cols-2 gap-3">
            {THEMES.map(({ value, icon, labelKey }) => {
              const active = theme === value;
              return (
                <button key={value} onClick={() => setTheme(value)}
                  className={`flex flex-col items-center gap-2 px-4 py-5 rounded-xl border-2 transition-all ${
                    active
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30"
                      : "border-gray-100 dark:border-[#2a2f3d] hover:border-gray-200 dark:hover:border-[#374151] hover:bg-gray-50 dark:hover:bg-[#1d212c]"
                  }`}>
                  <span className="text-3xl">{icon}</span>
                  <span className={`text-xs font-semibold ${active ? "text-indigo-700 dark:text-indigo-300" : "text-gray-600 dark:text-gray-400"}`}>
                    {t(labelKey)}
                  </span>
                  {active && (
                    <div className="w-4 h-4 rounded-full bg-indigo-600 flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M20 6L9 17l-5-5"/>
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Language card */}
      <div className="bg-white dark:bg-[#151821] rounded-2xl border border-gray-100 dark:border-[#2a2f3d] shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <span className="text-base">🌐</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t("settings.language")}</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500">Interface language</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {LANGS.map(({ value, flag, labelKey }) => {
            const active = lang === value;
            return (
              <button key={value} onClick={() => setLang(value)}
                className={`flex items-center gap-3 px-4 py-4 rounded-xl border-2 transition-all ${
                  active
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                    : "border-gray-100 dark:border-[#2a2f3d] hover:border-gray-200 dark:hover:border-[#374151] hover:bg-gray-50 dark:hover:bg-[#1d212c]"
                }`}>
                <span className="text-2xl">{flag}</span>
                <span className={`text-sm font-semibold ${active ? "text-emerald-700 dark:text-emerald-300" : "text-gray-700 dark:text-gray-300"}`}>
                  {t(labelKey)}
                </span>
                {active && (
                  <div className="ml-auto w-4 h-4 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave}
          className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
          {t("common.save")}
        </button>
        {saved && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
            ✓ {t("settings.saved")}
          </span>
        )}
      </div>

      {/* Dark mode preview */}
      <div className="bg-white dark:bg-[#151821] rounded-2xl border border-gray-100 dark:border-[#2a2f3d] shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Preview</h2>
        <div className="space-y-3">
          {/* Sample card */}
          <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-[#1d212c] rounded-xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-gray-200 dark:bg-[#2a2f3d] rounded-full w-3/4" />
              <div className="h-2.5 bg-gray-100 dark:bg-[#374151] rounded-full w-1/2" />
            </div>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 shrink-0">ADMIN</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["#4f46e5", "#0ea5e9", "#10b981"].map((color, i) => (
              <div key={i} className="h-16 rounded-xl flex items-end p-2" style={{ background: color + "22" }}>
                <div className="w-full h-1 rounded-full" style={{ background: color + "88" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
