import {
  Brain,
  FilePlus2,
  Home,
  Inbox,
  Layers3,
  Library,
  ListChecks,
  MessageSquareReply,
  SearchCheck,
  Send,
} from "lucide-react";

export const primaryNavigation = [
  {
    label: "Home",
    href: "/",
    icon: Home,
  },
  {
    label: "Create Outreach",
    href: "/create-outreach",
    icon: Send,
  },
  {
    label: "Reply to Prospect",
    href: "/reply-to-prospect",
    icon: MessageSquareReply,
  },
  {
    label: "Build Sequence",
    href: "/build-sequence",
    icon: Layers3,
  },
  {
    label: "Ask Signal Brain",
    href: "/ask-signal-brain",
    icon: Brain,
  },
] as const;

export const secondaryNavigation = [
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
    label: "Claim Details",
    href: "/claims/development-fixture",
    icon: SearchCheck,
  },
] as const;
