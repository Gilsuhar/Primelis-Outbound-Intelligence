import type { ApprovalStatus, KnowledgeType, SourceType } from "@/features/knowledge/types";

export function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getApprovalStatusLabel(status: ApprovalStatus) {
  return formatEnumLabel(status);
}

export function getKnowledgeTypeLabel(type: KnowledgeType) {
  return formatEnumLabel(type);
}

export function getSourceTypeLabel(type: SourceType) {
  return formatEnumLabel(type);
}

export function getApprovalStatusClassName(status: ApprovalStatus) {
  const classes: Record<ApprovalStatus, string> = {
    DRAFT: "border-stone-200 bg-stone-50 text-stone-600",
    NEEDS_REVIEW: "border-[#ead3a1] bg-[#fff7e8] text-[#8a5a2b]",
    APPROVED: "border-[#b7dcc8] bg-[#edf8f2] text-[#276749]",
    RESTRICTED: "border-[#f0bd9d] bg-[#fff0e8] text-[#9a4b22]",
    ARCHIVED: "border-slate-200 bg-slate-50 text-slate-600",
    REJECTED: "border-[#efb4b4] bg-[#fff1f1] text-[#9b2c2c]",
  };

  return classes[status];
}
