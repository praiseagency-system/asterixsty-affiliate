"use client";

import {
  createContext, useContext, useEffect, useState,
  useCallback, type ReactNode,
} from "react";
import en from "../../locales/en.json";
import id from "../../locales/id.json";

export type Lang = "en" | "id";

const LOCALES: Record<Lang, typeof en> = { en, id: id as typeof en };

const STORAGE_KEY = "app-language";

interface LanguageCtx {
  lang:     Lang;
  setLang:  (l: Lang) => void;
  /** Resolve a translation key like "nav.dashboard" */
  t:        (key: string) => string;
}

const LanguageContext = createContext<LanguageCtx>({
  lang:    "en",
  setLang: () => {},
  t:       (key) => key,
});

export function useLanguage() { return useContext(LanguageContext); }

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // Restore from localStorage on mount
  useEffect(() => {
    const stored = typeof window !== "undefined"
      ? localStorage.getItem(STORAGE_KEY) as Lang | null
      : null;
    if (stored === "en" || stored === "id") setLangState(stored);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback((key: string): string => {
    const parts  = key.split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let   result: any = LOCALES[lang];
    for (const part of parts) {
      if (result == null) return key;
      result = result[part];
    }
    return typeof result === "string" ? result : key;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
