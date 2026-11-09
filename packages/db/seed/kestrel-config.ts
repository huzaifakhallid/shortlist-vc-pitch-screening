import type { WorkspaceConfig } from "@shortlist/schemas";

// Config v1 of the fictional demo fund: the §13 example with CRM and Slack off
// (both null) until sandboxes are connected in milestone 4.
export function kestrelConfig(partners: {
  fintechAndDevtools: string;
  climate: string;
}): WorkspaceConfig {
  return {
    thesis:
      "Pre-seed and seed B2B software in Pakistan and the Gulf: fintech infrastructure, climate, developer tools. Technical founders with early revenue.",
    filters: {
      stages: ["pre-seed", "seed"],
      sectors: ["fintech", "climate", "devtools"],
      countries: ["PK", "AE", "SA"],
      roundSizeUsd: { min: 250000, max: 3000000 },
      excludedSectors: ["crypto-token", "gambling"],
    },
    rubric: [
      {
        key: "team",
        label: "Team",
        weight: 30,
        question: "Can these founders execute this plan?",
        anchors: {
          "1": "No relevant experience shown",
          "3": "Domain or execution experience, not both",
          "5": "Deep domain + proven execution evidenced",
        },
      },
      {
        key: "traction",
        label: "Traction",
        weight: 25,
        question: "Is there evidence that customers want this?",
        anchors: {
          "1": "No users or revenue yet",
          "3": "Pilots or early revenue with a few customers",
          "5": "Recurring revenue growing month over month",
        },
      },
      {
        key: "market",
        label: "Market",
        weight: 20,
        question: "Is the market large and reachable?",
        anchors: {
          "1": "Market size not stated or very small",
          "3": "Credible market with an unclear path to reach it",
          "5": "Large market with a clear, sized wedge",
        },
      },
      {
        key: "product",
        label: "Product & edge",
        weight: 15,
        question: "Is the product differentiated and hard to copy?",
        anchors: {
          "1": "Idea stage with no clear edge",
          "3": "Working product with a modest edge",
          "5": "Shipped product with a defensible edge",
        },
      },
      {
        key: "fit",
        label: "Thesis fit",
        weight: 10,
        question: "How closely does this match our thesis?",
        anchors: {
          "1": "Matches the filters only loosely",
          "3": "Matches the sector and stage",
          "5": "Squarely inside the thesis",
        },
      },
    ],
    agents: {
      intake: { enabled: true, channels: ["form", "email"] },
      screening: { enabled: true },
      research: { enabled: true },
      memo: {
        enabled: true,
        sections: [
          "Summary",
          "Why now",
          "Team",
          "Traction",
          "Risks",
          "Questions for the call",
        ],
      },
      comms: {
        enabled: true,
        autoSendMandateDeclines: false,
        voice: "Warm, brief, no jargon.",
      },
      pipeline: {
        enabled: true,
        crm: null,
        slackChannel: null,
        slackScoreThreshold: 65,
        weeklyDigest: "MON 09:00",
      },
      diligence: {
        enabled: false,
        checklist: [
          "Financial model",
          "Cap table",
          "Customer references",
          "Incorporation docs",
        ],
      },
    },
    routing: {
      fintech: partners.fintechAndDevtools,
      climate: partners.climate,
      devtools: partners.fintechAndDevtools,
    },
    defaultPartnerId: partners.fintechAndDevtools,
  };
}
