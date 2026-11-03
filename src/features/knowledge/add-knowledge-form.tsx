"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";

import {
  approvalStatuses,
  channelTags,
  knowledgeTypes,
  sourceTypes,
  type ChannelTag,
} from "@/features/knowledge/types";
import {
  addKnowledgeSchema,
  createLocalSubmission,
  type AddKnowledgeInput,
} from "@/lib/validation/add-knowledge";
import { createKnowledgeSubmissionAction } from "@/app/add-knowledge/actions";
import { formatEnumLabel, getKnowledgeTypeLabel, getSourceTypeLabel } from "@/lib/status";

type FieldErrors = Partial<Record<keyof AddKnowledgeInput, string>>;

const defaultFormState: AddKnowledgeInput = {
  knowledgeType: "CLAIM",
  title: "",
  summary: "",
  content: "",
  product: "Signal",
  sourceTitle: "",
  sourceType: "INTERNAL_DOCUMENT",
  externalUrl: "",
  fileReference: "",
  sourceDate: "",
  channels: ["EMAIL"],
  personas: "",
  industries: "",
  competitors: "",
  internalNotes: "",
  suggestedApprovalStatus: "NEEDS_REVIEW",
};

function mapZodErrors(error: z.ZodError<AddKnowledgeInput>) {
  return error.issues.reduce<FieldErrors>((errors, issue) => {
    const field = issue.path[0] as keyof AddKnowledgeInput | undefined;

    if (field && !errors[field]) {
      errors[field] = issue.message;
    }

    return errors;
  }, {});
}

export function AddKnowledgeForm() {
  const [form, setForm] = useState<AddKnowledgeInput>(defaultFormState);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submission, setSubmission] = useState<ReturnType<typeof createLocalSubmission> | null>(
    null,
  );

  function updateField<K extends keyof AddKnowledgeInput>(field: K, value: AddKnowledgeInput[K]) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleChannel(channel: ChannelTag) {
    const channels = form.channels.includes(channel)
      ? form.channels.filter((item) => item !== channel)
      : [...form.channels, channel];

    updateField("channels", channels);
  }

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = addKnowledgeSchema.safeParse(form);

    if (!parsed.success) {
      setErrors(mapZodErrors(parsed.error));
      setSubmission(null);
      return;
    }

    const persistedSubmission = await createKnowledgeSubmissionAction(parsed.data);

    if (!persistedSubmission.ok) {
      setErrors({ title: persistedSubmission.message });
      setSubmission(null);
      return;
    }

    setErrors({});
    setSubmission(createLocalSubmission(parsed.data));
    setForm(defaultFormState);
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">Knowledge</p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-ink">Add Knowledge</h1>
            <p className="max-w-2xl text-sm leading-6 text-stone-600">
              Add a product fact, message example, objection response, or proof point for review.
              Approved items can be used by the sales workflows.
            </p>
          </div>
          <span className="w-fit rounded-md border border-[#ead3a1] bg-[#fff7e8] px-3 py-2 text-xs font-semibold text-[#8a5a2b]">
            Needs review before use
          </span>
        </div>
      </section>

      {submission ? (
        <section className="rounded-lg border border-[#b7dcc8] bg-[#edf8f2] p-5 text-sm text-[#276749]">
          <div className="flex items-start gap-3">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Submission created</p>
              <p className="mt-1">
                {submission.title} is now marked {formatEnumLabel(submission.approvalStatus)} for
                review. It was not approved yet.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <form className="rounded-lg border border-line bg-white p-5 shadow-sm" onSubmit={submitForm}>
        <div className="grid gap-5 lg:grid-cols-2">
          <SelectField
            label="Knowledge type"
            required
            value={form.knowledgeType}
            onChange={(value) =>
              updateField("knowledgeType", value as AddKnowledgeInput["knowledgeType"])
            }
            options={knowledgeTypes.map((type) => [type, getKnowledgeTypeLabel(type)])}
          />
          <TextField
            label="Product"
            required
            value={form.product}
            error={errors.product}
            onChange={(value) => updateField("product", value)}
          />
          <TextField
            label="Title"
            required
            value={form.title}
            error={errors.title}
            onChange={(value) => updateField("title", value)}
          />
          <TextField
            label="Summary"
            required
            value={form.summary}
            error={errors.summary}
            onChange={(value) => updateField("summary", value)}
          />
          <TextAreaField
            label="Content"
            required
            value={form.content}
            error={errors.content}
            onChange={(value) => updateField("content", value)}
          />
          <TextAreaField
            label="Internal notes"
            value={form.internalNotes ?? ""}
            error={errors.internalNotes}
            onChange={(value) => updateField("internalNotes", value)}
          />
          <TextField
            label="Source title"
            required
            value={form.sourceTitle}
            error={errors.sourceTitle}
            onChange={(value) => updateField("sourceTitle", value)}
          />
          <SelectField
            label="Source type"
            required
            value={form.sourceType}
            onChange={(value) =>
              updateField("sourceType", value as AddKnowledgeInput["sourceType"])
            }
            options={sourceTypes.map((type) => [type, getSourceTypeLabel(type)])}
          />
          <TextField
            label="External URL"
            value={form.externalUrl ?? ""}
            error={errors.externalUrl}
            onChange={(value) => updateField("externalUrl", value)}
          />
          <TextField
            label="File reference"
            value={form.fileReference ?? ""}
            error={errors.fileReference}
            onChange={(value) => updateField("fileReference", value)}
          />
          <TextField
            label="Source date"
            type="date"
            value={form.sourceDate ?? ""}
            error={errors.sourceDate}
            onChange={(value) => updateField("sourceDate", value)}
          />
          <SelectField
            label="Suggested approval status"
            required
            value={form.suggestedApprovalStatus}
            onChange={(value) =>
              updateField(
                "suggestedApprovalStatus",
                value as AddKnowledgeInput["suggestedApprovalStatus"],
              )
            }
            options={approvalStatuses.map((status) => [status, formatEnumLabel(status)])}
          />
          <TextField
            label="Persona tags"
            value={form.personas ?? ""}
            error={errors.personas}
            onChange={(value) => updateField("personas", value)}
            placeholder="Comma-separated"
          />
          <TextField
            label="Industry tags"
            value={form.industries ?? ""}
            error={errors.industries}
            onChange={(value) => updateField("industries", value)}
            placeholder="Comma-separated"
          />
          <TextField
            label="Competitor tags"
            value={form.competitors ?? ""}
            error={errors.competitors}
            onChange={(value) => updateField("competitors", value)}
            placeholder="Comma-separated"
          />

          <fieldset className="space-y-2 lg:col-span-2">
            <legend className="text-sm font-medium text-stone-700">
              Channel tags <span className="text-[#9b2c2c]">*</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {channelTags.map((channel) => (
                <label
                  className="inline-flex items-center gap-2 rounded-md border border-line bg-[#fbfaf7] px-3 py-2 text-sm text-stone-700"
                  key={channel}
                >
                  <input
                    checked={form.channels.includes(channel)}
                    onChange={() => toggleChannel(channel)}
                    type="checkbox"
                  />
                  {formatEnumLabel(channel)}
                </label>
              ))}
            </div>
            {errors.channels ? <p className="text-sm text-[#9b2c2c]">{errors.channels}</p> : null}
          </fieldset>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1c4b5b]"
            type="submit"
          >
            Submit for review
          </button>
        </div>
      </form>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  error,
  required = false,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-stone-700">
      {label} {required ? <span className="text-[#9b2c2c]">*</span> : null}
      <input
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/20"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
      {error ? <span className="block text-sm text-[#9b2c2c]">{error}</span> : null}
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  error,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-stone-700">
      {label} {required ? <span className="text-[#9b2c2c]">*</span> : null}
      <textarea
        className="min-h-32 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
      {error ? <span className="block text-sm text-[#9b2c2c]">{error}</span> : null}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-stone-700">
      {label} {required ? <span className="text-[#9b2c2c]">*</span> : null}
      <select
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
