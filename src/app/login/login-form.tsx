"use client";

import { useActionState } from "react";
import Image from "next/image";

import { requestLoginLink, signOutAction } from "@/app/auth/actions";

const initialState = {
  ok: false,
  message: "",
};

export function LoginForm({ accessPending = false }: { accessPending?: boolean }) {
  const [state, formAction, pending] = useActionState(requestLoginLink, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Image
            alt="Signal"
            className="h-12 w-12 rounded-xl object-cover"
            height={48}
            priority
            src="/brand/logo signal.jpg"
            width={48}
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-olive">
              Primelis Signal
            </p>
            <h1 className="text-2xl font-semibold text-ink">Private preview</h1>
          </div>
        </div>

        <p className="mt-5 text-sm leading-6 text-[#5f6156]">
          {accessPending
            ? "Your email is authenticated, but your application access is still pending a trusted workspace profile."
            : "Sign in with an invited work email to use the Signal workspace. Access is limited to approved preview users."}
        </p>

        {accessPending ? (
          <>
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              Ask a Knowledge Admin to add your email to the application `User` table and assign
              either the Sales or Knowledge Admin role. Sign out and try again after access is
              assigned.
            </div>
            <form action={signOutAction} className="mt-4">
              <button
                className="w-full rounded-full border border-line bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:bg-cream"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </>
        ) : (
          <form action={formAction} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-ink" htmlFor="email">
              Work email
            </label>
            <input
              autoComplete="email"
              className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-olive focus:ring-2 focus:ring-lime/40"
              id="email"
              name="email"
              placeholder="name@company.com"
              required
              type="email"
            />
            <button
              className="w-full rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2c2d27] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending}
              type="submit"
            >
              {pending ? "Sending link..." : "Send private login link"}
            </button>
          </form>
        )}

        {state.message ? (
          <p
            className={[
              "mt-4 rounded-xl border px-4 py-3 text-sm",
              state.ok
                ? "border-lime bg-lime/20 text-ink"
                : "border-amber-200 bg-amber-50 text-amber-900",
            ].join(" ")}
          >
            {state.message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
