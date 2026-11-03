/** Immutable production references; no environment or request override. */
export const PRODUCT_SOURCES = [
  {
    id: "signal-tech-deck",
    file: "C:/Users/USER/Downloads/Primelis Signal Tech-Deck.pdf",
    pagesByStatement: [
      [12, 13, 14, 28],
      [12, 14, 28],
      [13, 14, 25, 27, 28],
    ],
  },
  {
    id: "signal-playbook",
    file: "src/features/playbook/playbook-content.ts",
    sections: ["Signal overview", "Solo Bidder", "CPC Optimization"],
  },
];
export const hashes = [
  "94dfe3858129d0b127ce05feae4cea55deaa4c32b28b3e49d68534378ec4ae3a",
  "acc67f28458cd181f4cd67333a353522dd53e91b1fbc3b4a73644124843ab3f4",
  "7924f29952ec18d44f2c9ddaef0be4bfdc9c72baa3d1cef31d88d86e5b65d44f",
];
export const historicalLedgerHash =
  "1a43139379d28643f2120b87f0333f9d2c7aa4e6a9f605bbec4dfc1321fdb038";
export const continuationFiles = [
  ["commercial-ab/aggregate-spend.jsonl", historicalLedgerHash],
  [
    "nutrafol-writing-demo-v1/aggregate-spend.jsonl",
    "bb63e4d86359559a04a2478b7291bc9683859c538c58f55cbb1257fa9169543b",
  ],
  [
    "nutrafol-writing-demo-v1/corrected-nutrafol-evidence.json",
    "4769a49f841de433e87368fb744bcc3cff6c9bc7a060d30b3abaad1e02d7db75",
  ],
  [
    "nutrafol-writing-demo-v1/internal-writing-results.json",
    "be1baa9f58c7dc24f06915deaa4ee786986be6e91d03a088775b2b45bfa9959a",
  ],
] as const;
export const expectedSources = [
  "feb951e49e0e5a155745681aba3d1583772d56307d94a802fb897793da95538b",
  "ba628d8fbc92bcac089586a63aedd6458c4f2d3bbdb1a32664530f63c0d0746a",
];
