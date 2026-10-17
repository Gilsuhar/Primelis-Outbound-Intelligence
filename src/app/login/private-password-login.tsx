"use client";

import React, { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { LoginErrorCode } from "@/lib/private-preview-auth";
import { loginErrorMessages } from "@/lib/auth/login-errors";
import {
  signInWithPassword,
  signOutAction,
  sendPasswordRecovery,
  continueWithGoogle,
} from "@/app/auth/actions";

const initialState = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-ink px-4 py-3 font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Signing in..." : "Sign in"}
    </button>
  );
}

export function PrivatePasswordLogin({
  nextPath = "/sales-agent",
  accessPending = false,
  loginError,
}: {
  nextPath?: string;
  accessPending?: boolean;
  loginError?: LoginErrorCode;
}) {
  const [state, action] = useActionState(signInWithPassword, initialState);
  const [recoveryState, recoveryAction, recoveryPending] = useActionState(
    sendPasswordRecovery,
    initialState,
  );
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-olive">
          Primelis Signal
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Private Sales Copilot</h1>
        <p className="mt-3 text-sm text-gray-600">
          Sign in with your approved account. Use Google or your existing account password.
        </p>
        {loginError && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {loginErrorMessages[loginError]}
          </p>
        )}
        {accessPending ? (
          <form action={signOutAction} className="mt-6 space-y-3">
            <p role="alert" className="text-sm text-amber-800">
              This account is authenticated but is not approved for the workspace.
            </p>
            <button
              type="submit"
              className="w-full rounded-full border border-line px-4 py-3 font-semibold"
            >
              Sign out
            </button>
          </form>
        ) : (
          <>
            <form action={continueWithGoogle} className="mt-6">
              <input type="hidden" name="next" value={nextPath} />
              <button
                type="submit"
                className="w-full rounded-full border border-line bg-white px-4 py-3 font-semibold text-ink hover:bg-gray-50"
              >
                Continue with Google
              </button>
            </form>
            <div className="my-4 text-center text-xs text-gray-500">or sign in with password</div>
            <form action={action} className="space-y-4">
              <input type="hidden" name="next" value={nextPath} />
              <label className="block text-sm font-medium">
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  className="mt-2 w-full rounded-xl border border-line p-3"
                />
              </label>
              <label className="block text-sm font-medium">
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="mt-2 w-full rounded-xl border border-line p-3"
                />
              </label>
              <Submit />
              {state.message && (
                <p role="alert" className="text-sm text-amber-800">
                  {state.message}
                </p>
              )}
            </form>
            <form action={recoveryAction} className="mt-5 space-y-2 border-t pt-4">
              <p className="text-sm font-medium">Forgot your password?</p>
              <input
                name="email"
                type="email"
                required
                placeholder="Your account email"
                className="w-full rounded-xl border p-3"
              />
              <button
                type="submit"
                disabled={recoveryPending}
                className="text-sm font-semibold underline disabled:opacity-60"
              >
                Email me a password reset link
              </button>
              {recoveryState.message && (
                <p role="status" className="text-sm">
                  {recoveryState.message}
                </p>
              )}
            </form>
          </>
        )}
      </section>
    </main>
  );
}
