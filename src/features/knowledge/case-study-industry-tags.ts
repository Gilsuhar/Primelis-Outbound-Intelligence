const companyIndustryTags = [
  { terms: ["appsflyer"], industries: ["B2B SaaS and Technology"] },
  { terms: ["apollo", "zenleads"], industries: ["B2B SaaS and Technology"] },
  { terms: ["airbyte"], industries: ["B2B SaaS and Technology"] },
  { terms: ["databricks"], industries: ["B2B SaaS and Technology"] },
  { terms: ["dynatrace"], industries: ["B2B SaaS and Technology"] },
  { terms: ["hibob", "zoominfo", "semrush"], industries: ["B2B SaaS and Technology"] },
  { terms: ["crocs", "chewy", "stitch fix"], industries: ["Retail and E-commerce"] },
  { terms: ["dior", "chloe", "chloé", "polene", "polène", "polene paris", "tag heuer", "sandro", "the north face"], industries: ["Fashion and Luxury"] },
  { terms: ["copa", "copa airlines", "american airlines", "priceline"], industries: ["Travel and Airlines"] },
  { terms: ["nayax"], industries: ["Fintech and Financial Services"] },
  { terms: ["mgm", "mgm resorts"], industries: ["Hospitality"] },
  { terms: ["the knot"], industries: ["Marketplaces"] },
  { terms: ["taboola", "outbrain"], industries: ["Media"] },
  { terms: ["ancestry"], industries: ["Consumer Services"] },
] as const;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function inferCaseStudyIndustries(...values: Array<string | null | undefined>) {
  const text = normalize(values.filter(Boolean).join(" "));
  const industries = new Set<string>();

  for (const entry of companyIndustryTags) {
    if (entry.terms.some((term) => text.includes(normalize(term)))) {
      entry.industries.forEach((industry) => industries.add(industry));
    }
  }

  return Array.from(industries);
}

export function withInferredCaseStudyIndustries<T extends { industries?: string[]; title?: string; companyName?: string }>(
  record: T,
) {
  const existingIndustries = record.industries ?? [];

  if (existingIndustries.length > 0) {
    return record;
  }

  return {
    ...record,
    industries: inferCaseStudyIndustries(record.title, record.companyName),
  };
}
