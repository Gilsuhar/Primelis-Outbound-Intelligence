"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signInWithPassword, signOutAction } from "@/app/auth/actions";

const initialState = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="w-full rounded-full bg-ink px-4 py-3 font-semibold text-white disabled:opacity-60">
      {pending ? "Signing in..." : "Sign in"}
    </button>
  );
}

export function PrivatePasswordLogin({ nextPath = "/sales-agent", accessPending = false }: { nextPath?: string; accessPending?: boolean }) {
  const [state, action] = useActionState(signInWithPassword, initialState);
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-olive">Primelis Signal</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Private Sales Copilot</h1>
        <p className="mt-3 text-sm text-gray-600">Sign in with your approved account. Google sign-in is not required.</p>
        {accessPending ? (
          <form action={signOutAction} className="mt-6 space-y-3">
            <p role="alert" className="text-sm text-amber-800">This account is authenticated but is not approved for the workspace.</p>
            <button type="submit" className="w-full rounded-full border border-line px-4 py-3 font-semibold">Sign out</button>
          </form>
        ) : (
          <form action={action} className="mt-6 space-y-4">
            <input type="hidden" name="next" value={nextPath} />
            <label className="block text-sm font-medium">Email
              <input name="email" type="email" autoComplete="username" required className="mt-2 w-full rounded-xl border border-line p-3" />
            </label>
            <label className="block text-sm font-medium">Password
              <input name="password" type="password" autoComplete="current-password" required className="mt-2 w-full rounded-xl border border-line p-3" />
            </label>
            <Submit />
            {state.message && <p role="alert" className="text-sm text-amber-800">{state.message}</p>}
          </form>
        )}
      </section>
    </main>
  );
}
