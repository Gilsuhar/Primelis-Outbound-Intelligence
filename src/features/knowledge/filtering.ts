import type {
  KnowledgeItemFixture,
  KnowledgeLibraryFilters,
  KnowledgeSubmissionFixture,
  ReviewQueueFilters,
} from "./types";

export function getEmptyKnowledgeLibraryFilters(): KnowledgeLibraryFilters {
  return {
    knowledgeType: "ALL",
    approvalStatus: "ALL",
    channel: "ALL",
    persona: "ALL",
    industry: "ALL",
    competitor: "ALL",
    search: "",
  };
}

export function filterKnowledgeItems(
  items: KnowledgeItemFixture[],
  filters: KnowledgeLibraryFilters,
) {
  const search = filters.search.trim().toLowerCase();

  return items.filter((item) => {
    const matchesType =
      filters.knowledgeType === "ALL" || item.knowledgeType === filters.knowledgeType;
    const matchesStatus =
      filters.approvalStatus === "ALL" || item.approvalStatus === filters.approvalStatus;
    const matchesChannel = filters.channel === "ALL" || item.channels.includes(filters.channel);
    const matchesPersona = filters.persona === "ALL" || item.personas.includes(filters.persona);
    const matchesIndustry =
      filters.industry === "ALL" || item.industries.includes(filters.industry);
    const matchesCompetitor =
      filters.competitor === "ALL" || item.competitors.includes(filters.competitor);
    const matchesSearch =
      search.length === 0 ||
      item.title.toLowerCase().includes(search) ||
      item.summary.toLowerCase().includes(search) ||
      item.fixtureLabel.toLowerCase().includes(search);

    return (
      matchesType &&
      matchesStatus &&
      matchesChannel &&
      matchesPersona &&
      matchesIndustry &&
      matchesCompetitor &&
      matchesSearch
    );
  });
}

export function filterReviewSubmissions(
  submissions: KnowledgeSubmissionFixture[],
  filters: ReviewQueueFilters,
) {
  return submissions.filter((submission) => {
    const matchesStatus =
      filters.approvalStatus === "ALL" || submission.approvalStatus === filters.approvalStatus;
    const matchesType =
      filters.knowledgeType === "ALL" || submission.knowledgeType === filters.knowledgeType;
    const matchesSource =
      filters.sourcePresence === "ALL" ||
      (filters.sourcePresence === "WITH_SOURCE" && submission.sourceIds.length > 0) ||
      (filters.sourcePresence === "MISSING_SOURCE" && submission.sourceIds.length === 0);

    return matchesStatus && matchesType && matchesSource;
  });
}

export function getUniqueTagValues(
  items: KnowledgeItemFixture[],
  key: "personas" | "industries" | "competitors",
) {
  return Array.from(new Set(items.flatMap((item) => item[key]))).sort();
}
