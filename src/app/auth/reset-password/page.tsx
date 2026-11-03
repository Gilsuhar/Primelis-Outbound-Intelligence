"use client";

import { useActionState } from "react";
import { updateRecoveredPassword } from "@/app/auth/actions";

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(updateRecoveredPassword, { ok: false, message: "" });
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={action} className="w-full max-w-md space-y-4 rounded-2xl border p-6">
        <h1 className="text-2xl font-semibold">Set a new password</h1>
        <p className="text-sm text-gray-600">Use a unique password with at least 12 characters.</p>
        <label className="block text-sm">New password
          <input className="mt-2 w-full rounded-xl border p-3" type="password" name="password" minLength={12} autoComplete="new-password" required />
        </label>
        <button type="submit" disabled={pending} className="w-full rounded-xl bg-black p-3 text-white disabled:opacity-60">{pending ? "Saving..." : "Save password"}</button>
        {state.message && <p role="alert" className="text-sm">{state.message}</p>}
      </form>
    </main>
  );
}
