import type { EvidenceObservation, IntakeContact } from "./evidence";
import type { DraftResearch } from "./draft-engine";
import { SIGNAL_HUBSPOT_OWNER_ID } from "./qualification";

/** Entirely fictional, isolated from collection/persistence. Never imported by the live intake. */
export const DEMO_TIME = "2026-10-15T12:00:00.000Z";
export const DEMO_LABEL = "FICTIONAL TEST DATA — not HubSpot records or approved customer claims";
export function createDemoFixtures() {
  return ["qualified", "irrelevant", "missing", "recent", "suppressed"].map((scenario, index) => {
    const id = `test-fixture-${scenario}`;
    const domain = `fictional-${scenario}.example`;
    const contact: IntakeContact = {
      hubspotRecordId: id,
      ownerId: SIGNAL_HUBSPOT_OWNER_ID,
      fullName: `Fictional Prospect ${index + 1}`,
      companyName: `Fictional Company ${index + 1}`,
      companyDomain: domain,
      email: `prospect@${domain}`,
      observedAt: DEMO_TIME,
      emailModifiedAt: "2026-10-14T08:00:00.000Z",
      observations: [],
      warnings: [],
    };
    const obs = (
      field: EvidenceObservation["field"],
      value: unknown,
      provider: EvidenceObservation["provider"] = "ZOOMINFO",
    ): EvidenceObservation => ({
      hubspotRecordId: id,
      field,
      value,
      provider,
      sourceRecordId: `FICTIONAL:${id}:${field}`,
      observedAt: DEMO_TIME,
      verifiedAt: "2026-10-15T08:00:00.000Z",
      independent: true,
      supportingEvidence: [DEMO_LABEL],
      subjectEmail: contact.email,
      subjectCompanyDomain: domain,
    });
    let observations = [
      obs("employeeCount", 120),
      obs("annualRevenueUsd", 50_000_000),
      obs("role", scenario === "irrelevant" ? "Office Administrator" : "Head of Paid Search"),
      obs("currentEmploymentVerified", true),
      obs("emailVerification", {
        status: "VALID",
        independentlyVerified: true,
        emailMatchesCurrentRecord: true,
        businessEmailVerified: true,
      }),
      obs("unsubscribed", scenario === "suppressed", "OUTREACH"),
      obs("hardBounced", false, "OUTREACH"),
      obs("complained", false, "OUTREACH"),
      obs("activeSequence", false, "OUTREACH"),
      obs("outreachHistoryComplete", true, "OUTREACH"),
      obs("lastOutboundAt", scenario === "recent" ? "2026-10-10T08:00:00.000Z" : null, "OUTREACH"),
      obs("conflictingActiveOpportunity", false, "HUBSPOT"),
    ];
    if (scenario === "missing")
      observations = observations.filter(
        (item) => !["annualRevenueUsd", "emailVerification"].includes(item.field),
      );
    const fact = (kind: DraftResearch["kind"], text: string): DraftResearch => ({
      id: `${id}:${kind}`,
      contactId: id,
      companyDomain: domain,
      kind,
      text,
      sourceUrl: `https://${domain}/fictional-evidence/${kind.toLowerCase()}`,
      observedAt: "2026-10-15T08:00:00.000Z",
      verifiedAt: DEMO_TIME,
      manuallyVerified: true,
      approvedForOutbound: kind === "CASE_STUDY",
      ...(kind === "CASE_STUDY" ? { caseStudyId: "fictional-approved-case-study" } : {}),
      ...(kind === "SERP"
        ? {
            keyword: "Fictional Company 1",
            market: "United Kingdom",
            device: "desktop" as const,
            screenshotUrl: `https://${domain}/fictional-google-screenshot.png`,
            searchEngine: "GOOGLE" as const,
          }
        : {}),
    });
    const research =
      scenario === "qualified"
        ? [
            fact(
              "COMPANY_FACT",
              "Fictional Company 1 sells outdoor equipment through its online store.",
            ),
            fact(
              "PERSON_FACT",
              "Your published remit includes managing paid search for that store.",
            ),
            fact(
              "SERP",
              "The fictional snapshot shows the company's own ad above its organic listing; no competitor activity is asserted.",
            ),
            fact(
              "CASE_STUDY",
              "In this fictional example, the search team used competitive monitoring to inform branded bidding reviews. No measured result is claimed.",
            ),
          ]
        : [];
    return {
      scenario,
      snapshot: {
        version: 1 as const,
        contact,
        observations,
        provenanceAtCollection: [],
        blockers: [],
        providers: [],
        collectedAt: DEMO_TIME,
        research,
      },
    };
  });
}
