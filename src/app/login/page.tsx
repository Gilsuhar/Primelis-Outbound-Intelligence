import { redirect } from "next/navigation";

import { getCurrentUser, getSupabaseAuthUser } from "@/lib/auth/server";
import {
  getSafeInternalPath,
  type LoginErrorCode,
  resolveLoginScreenState,
} from "@/lib/private-preview-auth";

import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getLoginError(value: string | string[] | undefined): LoginErrorCode | undefined {
  const error = getSingleParam(value);
  if (
    error === "access_denied" ||
    error === "configuration_error" ||
    error === "oauth_failed" ||
    error === "oauth_start_failed"
  ) {
    return error;
  }
  return undefined;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const [applicationUser, supabaseUser] = await Promise.all([
    getCurrentUser(),
    getSupabaseAuthUser(),
  ]);
  const state = resolveLoginScreenState({
    hasSupabaseAuthUser: Boolean(supabaseUser),
    hasApplicationUser: Boolean(applicationUser),
  });

  if (state === "SIGNED_IN") redirect("/");

  return (
    <LoginForm
      accessPending={state === "ACCESS_PENDING"}
      loginError={getLoginError(params.error)}
      nextPath={getSafeInternalPath(getSingleParam(params.next))}
    />
  );
}
