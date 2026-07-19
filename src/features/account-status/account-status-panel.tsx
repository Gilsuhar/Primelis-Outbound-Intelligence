"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Ban, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";

import { checkAccountStatusAction } from "@/app/account-status/actions";
import type { AccountStatusResult } from "./types";

type AccountStatusPanelProps = {
  companyName: string;
  companyDomain?: string;
  refreshKey?: number;
  overrideActive: boolean;
  onOverrideChange: (value: boolean) => void;
};

function statusClasses(status: AccountStatusResult) {
  if (status.severity === "BLOCKED") {
    return {
      icon: <Ban aria-hidden="true" className="h-5 w-5 text-[#9a3f24]" />,
      box: "border-[#e2a48e] bg-[#fff4ef]",
      pill: "bg-[#f8d8cb] text-[#7e2d17]",
    };
  }
  if (status.severity === "WARNING") {
    return {
      icon: <ShieldAlert aria-hidden="true" className="h-5 w-5 text-[#8a5a2b]" />,
      box: "border-[#e6c47c] bg-[#fff9eb]",
      pill: "bg-[#ffe8af] text-[#765012]",
    };
  }
  if (status.severity === "CLEAR") {
    return {
      icon: <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-[#32795d]" />,
      box: "border-[#dce8c1] bg-[#fbfff1]",
      pill: "bg-[#eaf7d7] text-[#32795d]",
    };
  }
  return {
    icon: <AlertTriangle aria-hidden="true" className="h-5 w-5 text-[#8a5a2b]" />,
    box: "border-line bg-cream",
    pill: "bg-white text-stone-600",
  };
}

export function AccountStatusPanel({
  companyName,
  companyDomain,
  refreshKey = 0,
  overrideActive,
  onOverrideChange,
}: AccountStatusPanelProps) {
  const [status, setStatus] = useState<AccountStatusResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestIdRef = useRef(0);
  const queryReady = companyName.trim().length >= 2 || (companyDomain?.trim().length ?? 0) >= 4;

  useEffect(() => {
    setStatus(null);
    setMessage(null);
    if (!queryReady) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const timeout = window.setTimeout(() => {
      startTransition(async () => {
        const response = await checkAccountStatusAction({
          companyName,
          companyDomain,
        });
        if (requestIdRef.current !== requestId) return;
        if (!response.ok) {
          setMessage(response.message);
          return;
        }
        setStatus(response.data);
      });
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [companyName, companyDomain, queryReady, refreshKey]);

  if (!queryReady) {
    return (
      <div className="rounded-xl border border-line bg-cream px-3 py-2 text-sm text-stone-600">
        Account status will check as soon as a company or domain is entered.
      </div>
    );
  }

  if (isPending && !status) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-line bg-cream px-3 py-2 text-sm text-stone-700">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        Checking account status...
      </div>
    );
  }

  if (message) {
    return (
      <div className="rounded-xl border border-[#e6c47c] bg-[#fff9eb] px-3 py-2 text-sm text-[#765012]">
        Status could not be fully verified. {message}
      </div>
    );
  }

  if (!status) return null;
  const classes = statusClasses(status);

  return (
    <section className={`rounded-xl border px-3 py-3 ${classes.box}`} aria-live="polite">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{classes.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">{status.title}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${classes.pill}`}>
              {status.verified ? "Verified internal match" : "Available data only"}
            </span>
          </div>
          <p className="mt-1 text-sm leading-5 text-stone-700">{status.message}</p>
          <div className="mt-2 grid gap-1 text-xs text-stone-600 sm:grid-cols-2">
            {status.companyName ? <span>Company: {status.companyName}</span> : null}
            {status.domain ? <span>Domain: {status.domain}</span> : null}
            {status.owner ? <span>Owner: {status.owner}</span> : null}
            {status.stage ? <span>Status: {status.stage}</span> : null}
            {status.lastActivity ? <span>Last activity: {status.lastActivity.slice(0, 10)}</span> : null}
            {status.reason ? <span>Reason: {status.reason}</span> : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {status.nextActions.map((action) =>
              action.action === "OVERRIDE" ? (
                <button
                  className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[#f8f5ef]"
                  key={action.label}
                  onClick={() => onOverrideChange(true)}
                  type="button"
                >
                  {overrideActive ? "Override enabled" : action.label}
                </button>
              ) : action.href ? (
                <a
                  className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[#f8f5ef]"
                  href={action.href}
                  key={action.label}
                >
                  {action.label}
                </a>
              ) : null,
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
