/**
 * Language context and translation hook.
 *
 * Usage:
 *   const { lang, setLang, t } = useLanguage();
 *   <span>{t("nav_dashboard")}</span>           → "Dashboard" or "ප්‍රධාන"
 *   <span className={lang === "si" ? "si" : ""}> — Sinhala font class
 *
 * Language preference is persisted in localStorage immediately and
 * written to app_settings (SQLite) asynchronously for cross-session storage.
 *
 * Note: app_settings write is optional — localStorage alone is sufficient
 * for a single-device desktop application.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { EN, SI_TRANS, type Lang, type TranslationKey } from "./translations";

// ── Storage key ───────────────────────────────────────────────────────────────
const LS_KEY = "app_language";

function readLang(): Lang {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === "en" || v === "si") return v;
  } catch { /* ignore */ }
  return "en";
}

function writeLang(l: Lang) {
  try { localStorage.setItem(LS_KEY, l); } catch { /* ignore */ }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface LanguageCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate a key to the current language. Falls back to English. */
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageCtx>({
  lang: "en",
  setLang: () => {},
  t: (k) => EN[k] as string,
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    writeLang(l);
    // Async persist to app_settings (non-blocking; ignore errors)
    import("../services/database")
      .then(({ saveSetting }) => saveSetting("app_language", l))
      .catch(() => {});
  }, []);

  // On mount, sync from app_settings if it differs from localStorage
  useEffect(() => {
    import("../services/database")
      .then(({ getAppSettings }) => getAppSettings())
      .then((settings) => {
        const stored = settings["app_language"];
        if ((stored === "en" || stored === "si") && stored !== lang) {
          setLangState(stored);
          writeLang(stored);
        }
      })
      .catch(() => {});
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      if (lang === "si") {
        return SI_TRANS[key] ?? (EN[key] as string);
      }
      return EN[key] as string;
    },
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLanguage(): LanguageCtx {
  return useContext(LanguageContext);
}

// ── T component — inline translation with correct font class ──────────────────

interface TProps {
  k: TranslationKey;
  className?: string;
}

export function T({ k, className }: TProps) {
  const { lang, t } = useLanguage();
  return (
    <span className={`${lang === "si" ? "si" : ""} ${className ?? ""}`.trim()}>
      {t(k)}
    </span>
  );
}
