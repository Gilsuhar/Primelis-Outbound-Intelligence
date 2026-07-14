"use client";

import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";

import {
  defaultOutputLanguage,
  normalizeOutputLanguage,
  outputLanguageLabels,
  outputLanguages,
  type OutputLanguage,
} from "@/lib/output-language";

const storageKey = "primelis-output-language";

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

  useEffect(() => {
    const stored = readStoredOutputLanguage();
    setLanguage(stored);
    document.documentElement.lang =
      stored === "FRENCH" ? "fr" : stored === "PORTUGUESE" ? "pt" : "en";
  }, []);

  function onChange(value: OutputLanguage) {
    setLanguage(value);
    document.documentElement.lang =
      value === "FRENCH" ? "fr" : value === "PORTUGUESE" ? "pt" : "en";
    writeStoredOutputLanguage(value);
  }

  return (
    <label className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-sm">
      <Globe2 aria-hidden="true" className="h-4 w-4 text-olive" />
      <span className="hidden sm:inline">Output language</span>
      <select
        aria-label="Output language"
        className="bg-transparent text-xs font-semibold outline-none"
        onChange={(event) => onChange(event.target.value as OutputLanguage)}
        value={language}
      >
        {outputLanguages.map((option) => (
          <option key={option} value={option}>
            {outputLanguageLabels[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
