"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-white px-4 py-10">
      <section className="w-full max-w-xl rounded-2xl border border-line bg-cream p-6 shadow-soft">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-lime text-ink">
            <AlertTriangle aria-hidden="true" className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-olive">
              Primelis Signal
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-ink">Something needs a refresh.</h1>
            <p className="mt-3 text-sm leading-6 text-[#5f6156]">
              The workspace hit a temporary issue. Try again, and if it repeats, share the error
              digest with an admin.
            </p>
            {error.digest ? (
              <p className="mt-3 rounded-xl border border-line bg-white px-3 py-2 text-xs text-[#6f6d5f]">
                Digest: {error.digest}
              </p>
            ) : null}
            <button
              className="signal-button-primary mt-5"
              onClick={reset}
              type="button"
            >
              <RefreshCcw aria-hidden="true" className="h-4 w-4" />
              Try again
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
