import { describe, expect, it } from "vitest";

import type { DoNotContactRecord } from "@/features/do-not-contact/types";

import {
  pushSequenceToHubSpot,
  type HubSpotPushClient,
  type HubSpotPushPersistence,
} from "./hubspot-push-service";

const baseInput = {
  companyName: "Nike",
  companyWebsite: "https://nike.com",
  overallStrategy: "Use a short paid-brand sequence and review before sending.",
  selectedAngle: "BRANDED_SEARCH_EFFICIENCY",
  persona: "Paid Search leadership",
  safetyNotes: ["Review before sending."],
  sourceTitles: ["Approved Signal source"],
  steps: [
    {
      stepNumber: 1,
      channel: "EMAIL" as const,
      delay: "Day 0",
      purpose: "FIRST_TOUCH_RELEVANCE" as const,
      subjectLine: "Nike paid brand question",
      messageBody: "Hi there,\n\nQuick question on Nike brand search.",
      cta: "Do you already have a way to do that?",
    },
  ],
};

function persistence(records: DoNotContactRecord[] = []): HubSpotPushPersistence {
  return {
    getSuppressionRecords: async () => records,
  };
}

function client() {
  const calls: string[] = [];
  const adapter: HubSpotPushClient = {
    searchCompany: async () => {
      calls.push("searchCompany");
      return null;
    },
    createCompany: async () => {
      calls.push("createCompany");
      return { id: "company-1" };
    },
    createNote: async ({ body }) => {
      calls.push(`createNote:${body}`);
      return { id: "note-1" };
    },
    createTask: async ({ subject }) => {
      calls.push(`createTask:${subject}`);
      return { id: "task-1" };
    },
  };
  return { adapter, calls };
}

describe("HubSpot sequence push", () => {
  it("creates a company note and review task", async () => {
    const { adapter, calls } = client();

    const result = await pushSequenceToHubSpot(baseInput, {
      client: adapter,
      persistence: persistence(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        companyId: "company-1",
        noteId: "note-1",
        taskId: "task-1",
      });
    }
    expect(calls[0]).toBe("searchCompany");
    expect(calls[1]).toBe("createCompany");
    expect(calls.some((call) => call.includes("Nike paid brand question"))).toBe(true);
    expect(calls.some((call) => call.includes("Review Signal sequence - Nike"))).toBe(true);
  });

  it("blocks suppressed accounts before calling HubSpot", async () => {
    const { adapter, calls } = client();

    const result = await pushSequenceToHubSpot(
      { ...baseInput, companyName: "Apollo", companyWebsite: "apollo.io" },
      {
        client: adapter,
        persistence: persistence([
          {
            id: "apollo",
            companyName: "Zenleads Inc. DBA Apollo.io",
            domain: "apollo.io",
            status: "EXISTING_CUSTOMER",
          },
        ]),
      },
    );

    expect(result).toMatchObject({
      ok: false,
      code: "SUPPRESSION_BLOCKED",
    });
    expect(calls).toEqual([]);
  });
});
