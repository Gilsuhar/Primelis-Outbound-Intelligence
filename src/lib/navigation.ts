import {
  Ban,
  BookOpen,
  Brain,
  Building2,
  FilePlus2,
  Home,
  Inbox,
  Layers3,
  Library,
  ListChecks,
  MessageSquareReply,
  PieChart,
  SearchCheck,
  Send,
  Upload,
} from "lucide-react";

import type { UserRole } from "@/features/knowledge/types";

export const salesNavigation = [
  {
    label: "Home",
    href: "/",
    icon: Home,
  },
  {
    label: "Signal Playbook",
    href: "/playbook",
    icon: BookOpen,
  },
  {
    label: "Account Research",
    href: "/account-research",
    icon: Building2,
  },
  {
    label: "ICP Insights",
    href: "/icp-insights",
    icon: PieChart,
  },
  {
    label: "Create Outreach",
    href: "/create-outreach",
    icon: Send,
  },
  {
    label: "Build Sequence",
    href: "/build-sequence",
    icon: Layers3,
  },
  {
    label: "Reply to Prospect",
    href: "/reply-to-prospect",
    icon: MessageSquareReply,
  },
  {
    label: "Ask Signal Brain",
    href: "/ask-signal-brain",
    icon: Brain,
  },
  {
    label: "Do Not Contact",
    href: "/do-not-contact",
    icon: Ban,
  },
] as const;

export const adminNavigation = [
  {
    label: "Knowledge Library",
    href: "/knowledge-library",
    icon: Library,
  },
  {
    label: "Add Knowledge",
    href: "/add-knowledge",
    icon: FilePlus2,
  },
  {
    label: "Review Queue",
    href: "/review-queue",
    icon: Inbox,
  },
  {
    label: "Imported Signal Review",
    href: "/imported-signal-review",
    icon: ListChecks,
  },
  {
    label: "Account Import",
    href: "/account-research/import",
    icon: Upload,
  },
  {
    label: "Claim Details",
    href: "/claims/development-fixture",
    icon: SearchCheck,
  },
] as const;

export function getNavigationForRole(role: UserRole) {
  return {
    sales: salesNavigation,
    admin: role === "KNOWLEDGE_ADMIN" ? adminNavigation : [],
  };
}
