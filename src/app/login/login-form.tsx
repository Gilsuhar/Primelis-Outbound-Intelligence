"use client";

import { useActionState } from "react";
import Image from "next/image";

import { continueWithGoogle, requestLoginLink, signOutAction } from "@/app/auth/actions";
import type { LoginErrorCode } from "@/lib/private-preview-auth";

const initialState = {
  ok: false,
  message: "",
};

const loginErrorMessages: Record<LoginErrorCode, string> = {
  access_denied: "This Google account is not approved for the private preview.",
  configuration_error: "Private preview authentication is not configured correctly.",
  oauth_failed: "We could not finish Google sign-in. Please try again.",
  oauth_start_failed: "We could not start Google sign-in. Please try again.",
};

export function LoginForm({
  accessPending = false,
  loginError,
  nextPath = "/",
}: {
  accessPending?: boolean;
  loginError?: LoginErrorCode;
  nextPath?: string;
}) {
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
          <div className="mt-6 space-y-5">
            <form action={continueWithGoogle}>
              <input name="next" type="hidden" value={nextPath} />
              <button
                className="w-full rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2c2d27]"
                type="submit"
              >
                Continue with Google
              </button>
              <p className="mt-2 text-xs leading-5 text-[#707267]">
                Recommended for private preview access.
              </p>
            </form>

            <div className="border-t border-line pt-5">
              <form action={formAction} className="space-y-4">
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
                  className="w-full rounded-full border border-line bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:bg-cream disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={pending}
                  type="submit"
                >
                  {pending ? "Sending link..." : "Send private login link"}
                </button>
                <p className="text-xs leading-5 text-[#707267]">
                  Secondary option for invited accounts.
                </p>
              </form>
            </div>
          </div>
        )}

        {loginError ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {loginErrorMessages[loginError]}
          </p>
        ) : null}

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
