import { z } from "zod";

import {
  approvalStatuses,
  channelTags,
  knowledgeTypes,
  sourceTypes,
} from "@/features/knowledge/types";

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || z.string().url().safeParse(value).success, {
    message: "Enter a valid URL, or leave this blank.",
  });

export const addKnowledgeSchema = z
  .object({
    knowledgeType: z.enum(knowledgeTypes),
    title: z.string().trim().min(3, "Title is required."),
    summary: z.string().trim().min(5, "Summary is required."),
    content: z.string().trim(),
    product: z.string().trim().min(1, "Product is required."),
    sourceTitle: z.string().trim().min(3, "Source title is required."),
    sourceType: z.enum(sourceTypes),
    externalUrl: optionalUrl,
    fileReference: z.string().trim().optional(),
    sourceDate: z.string().trim().optional(),
    channels: z.array(z.enum(channelTags)).min(1, "Select at least one channel."),
    personas: z.string().trim().optional(),
    industries: z.string().trim().optional(),
    competitors: z.string().trim().optional(),
    internalNotes: z.string().trim().optional(),
    suggestedApprovalStatus: z.enum(approvalStatuses),
    creatorId: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.content.trim().length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: "Factual submissions require content.",
      });
    }

    if (!value.externalUrl && !value.fileReference) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fileReference"],
        message: "Add an external URL or a file reference.",
      });
    }
  });

export type AddKnowledgeInput = z.infer<typeof addKnowledgeSchema>;

export function parseTagList(value?: string) {
  return (value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function createLocalSubmission(input: AddKnowledgeInput) {
  return {
    id: `local-submission-${Date.now()}`,
    title: input.title,
    knowledgeType: input.knowledgeType,
    approvalStatus: "NEEDS_REVIEW" as const,
    sourceTitle: input.sourceTitle,
    submittedAt: new Date().toISOString(),
  };
}
