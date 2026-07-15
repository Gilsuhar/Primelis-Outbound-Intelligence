"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Globe2 } from "lucide-react";

import {
  defaultOutputLanguage,
  normalizeOutputLanguage,
  type OutputLanguage,
} from "@/lib/output-language";
import { translateUi } from "@/lib/ui-translations";

const storageKey = "primelis-output-language";
const languageOptions: Array<{ value: OutputLanguage; country: string; label: string }> = [
  { value: "ENGLISH", country: "US", label: "English" },
  { value: "FRENCH", country: "FR", label: "Français" },
  { value: "PORTUGUESE", country: "BR", label: "Português (BR)" },
];

export function readStoredOutputLanguage(): OutputLanguage {
  if (typeof window === "undefined") {
    return defaultOutputLanguage;
  }

  return normalizeOutputLanguage(window.localStorage.getItem(storageKey));
}

export function writeStoredOutputLanguage(language: OutputLanguage) {
  window.localStorage.setItem(storageKey, language);
  window.dispatchEvent(new CustomEvent("primelis-output-language-change", { detail: language }));
}

export function useOutputLanguage() {
  const [language, setLanguage] = useState<OutputLanguage>(defaultOutputLanguage);

  useEffect(() => {
    setLanguage(readStoredOutputLanguage());

    function handleStorage(event: StorageEvent) {
      if (event.key === storageKey) {
        setLanguage(normalizeOutputLanguage(event.newValue));
      }
    }

    function handleLocalChange(event: Event) {
      setLanguage(normalizeOutputLanguage((event as CustomEvent).detail));
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener("primelis-output-language-change", handleLocalChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("primelis-output-language-change", handleLocalChange);
    };
  }, []);

  return language;
}

export function LanguageSelector() {
  const [language, setLanguage] = useState<OutputLanguage>(defaultOutputLanguage);
  const [isOpen, setIsOpen] = useState(false);
  const selected =
    languageOptions.find((option) => option.value === language) ?? languageOptions[0];

  useEffect(() => {
    const stored = readStoredOutputLanguage();
    setLanguage(stored);
    document.documentElement.lang =
      stored === "FRENCH" ? "fr" : stored === "PORTUGUESE" ? "pt" : "en";
  }, []);

  function onChange(value: OutputLanguage) {
    setLanguage(value);
    setIsOpen(false);
    document.documentElement.lang =
      value === "FRENCH" ? "fr" : value === "PORTUGUESE" ? "pt" : "en";
    writeStoredOutputLanguage(value);
  }

  return (
    <div className="relative">
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="inline-flex h-9 items-center gap-2.5 rounded-full border border-line bg-white px-3 text-xs font-semibold text-ink shadow-sm transition hover:border-[#cfc7b8] hover:bg-[#fbfaf6] sm:h-10 sm:gap-3 sm:px-4"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <Globe2 aria-hidden="true" className="h-4 w-4 text-olive" />
        <span className="hidden text-[#6f6d5f] sm:inline">
          {translateUi("language.selector", language)}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-olive">
          {selected.country}
        </span>
        <span>{selected.label}</span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 text-[#6f6d5f] transition ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen ? (
        <div
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-white py-2 shadow-xl"
          role="menu"
        >
          {languageOptions.map((option) => {
            const isSelected = option.value === language;

            return (
              <button
                className={[
                  "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition",
                  isSelected ? "bg-lime/70 text-ink" : "text-[#34352e] hover:bg-cream",
                ].join(" ")}
                key={option.value}
                onClick={() => onChange(option.value)}
                role="menuitem"
                type="button"
              >
                <span className="w-7 text-xs font-bold uppercase tracking-[0.08em] text-olive">
                  {option.country}
                </span>
                <span className="flex-1 font-medium">{option.label}</span>
                {isSelected ? <Check aria-hidden="true" className="h-4 w-4 text-olive" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
