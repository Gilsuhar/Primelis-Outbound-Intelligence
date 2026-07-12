import type { ApprovalStatus } from "@/features/knowledge/types";
import { getApprovalStatusClassName, getApprovalStatusLabel } from "@/lib/status";

export function StatusBadge({ status }: { status: ApprovalStatus }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        getApprovalStatusClassName(status),
      ].join(" ")}
    >
      {getApprovalStatusLabel(status)}
    </span>
  );
}
