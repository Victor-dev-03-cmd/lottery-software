import { useEffect } from "react";
import type { View } from "../types";

export interface ShortcutMap {
  onNavigate: (view: View) => void;
  onFocusSearch: () => void;
  onToggleHelp: () => void;
}

export const SHORTCUTS = [
  { key: "F2", desc: "New Invoice" },
  { key: "F4", desc: "Focus Search" },
  { key: "Alt+D", desc: "Dashboard" },
  { key: "Alt+I", desc: "Invoices" },
  { key: "Alt+R", desc: "Returns" },
  { key: "Alt+C", desc: "Daily Collections" },
  { key: "Alt+P", desc: "Reports" },
  { key: "Alt+A", desc: "Alerts" },
  { key: "?", desc: "Toggle Shortcut Help" },
  { key: "Esc", desc: "Close overlays" },
];

export function useKeyboardShortcuts({ onNavigate, onFocusSearch, onToggleHelp }: ShortcutMap) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const inInput = tag === "input" || tag === "textarea" || tag === "select";

      if (e.key === "F2") { e.preventDefault(); onNavigate("new-invoice"); return; }
      if (e.key === "F4") { e.preventDefault(); onFocusSearch(); return; }

      if (inInput) return; // below shortcuts only fire outside inputs

      if (e.altKey) {
        switch (e.key.toLowerCase()) {
          case "d": e.preventDefault(); onNavigate("dashboard"); break;
          case "i": e.preventDefault(); onNavigate("invoices"); break;
          case "r": e.preventDefault(); onNavigate("returns"); break;
          case "c": e.preventDefault(); onNavigate("collections"); break;
          case "p": e.preventDefault(); onNavigate("reports"); break;
          case "a": e.preventDefault(); onNavigate("alerts"); break;
        }
        return;
      }

      if (e.key === "?" && !e.shiftKey) { onToggleHelp(); return; }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNavigate, onFocusSearch, onToggleHelp]);
}
