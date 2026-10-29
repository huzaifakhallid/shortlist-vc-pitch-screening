# Shortlist: AI Agents That Screen Startup Pitches for VC Firms

**System Design & Design Document**

| | |
|---|---|
| Version | 2.1 (Gemini as AI provider; native local stack; Phase 1 data-model gaps settled) |
| Date | 7 Nov 2026 |
| Purpose | Portfolio and reference build for an AI services agency (Upwork, GitHub, client pitches) |
| Readers | Prospective clients (VC funds, accelerators, angel networks), our engineering team |

---

## Table of Contents

0. [Shortlist in Plain Words](#0-shortlist-in-plain-words)
1. [Summary](#1-summary)
2. [The Problem and the Market](#2-the-problem-and-the-market)
3. [Competitive Landscape and Positioning](#3-competitive-landscape-and-positioning)
4. [Product Principles](#4-product-principles)
5. [Goals, Non-Goals, Success Metrics](#5-goals-non-goals-success-metrics)
6. [Users and Roles](#6-users-and-roles)
7. [The Agents](#7-the-agents)
8. [How the Agents Work Together](#8-how-the-agents-work-together)
9. [Ways to Use Shortlist](#9-ways-to-use-shortlist)
10. [System Architecture](#10-system-architecture)
11. [Agent Runtime](#11-agent-runtime)
12. [Data Model](#12-data-model)
13. [Workspace Configuration](#13-workspace-configuration)
14. [LLM Design and Bias Controls](#14-llm-design-and-bias-controls)
15. [Security, Privacy and Adversarial Inputs](#15-security-privacy-and-adversarial-inputs)
16. [Integrations](#16-integrations)
17. [Public API](#17-public-api)
18. [Screens](#18-screens)
19. [Observability, Cost and Usage](#19-observability-cost-and-usage)
20. [Evaluation Plan](#20-evaluation-plan)
21. [Deployment](#21-deployment)
22. [Repository Structure](#22-repository-structure)
23. [Portfolio Packaging (Upwork and GitHub)](#23-portfolio-packaging-upwork-and-github)
24. [Delivery Plan](#24-delivery-plan)
25. [Risks and Mitigations](#25-risks-and-mitigations)
26. [Offering It to Clients](#26-offering-it-to-clients)
27. [Sources](#27-sources)

---

## 0. Shortlist in Plain Words

Venture capital firms get far more startup pitches than their team can read. Most are turned down for simple reasons (wrong industry, wrong country, too early or too late), but someone still has to open each one, read it and file it.

**Shortlist is a team of AI assistants that does that first pass for them.** Each assistant has one job: collecting pitches, reading and scoring them, researching the company, writing a one-page summary, replying to founders, updating the firm's CRM and Slack, and preparing due-diligence questions. A firm switches on only the assistants it wants, and they work inside the tools the firm already uses.

**A week with Shortlist:** pitches arrive by email and web form all week. On Monday the partners open Slack and see a ranked shortlist of the best ten out of 150, each with a one-page summary that points to the exact slide behind every claim. Pitches outside the firm's focus have already received a polite reply. One click moves a startup forward, books the call and prepares the diligence checklist. People make every investment decision; Shortlist does the reading, sorting, writing and follow-up.

```mermaid
flowchart TB
  P["Pitches arrive<br/>email · web form · referrals"] --> I[Intake Agent]
  I --> S[Screening Agent]
  S --> R[Research Agent]
  S --> M[Memo Agent]
  R --> M
  M --> PL[Pipeline Agent]
  PL --> T["Your team<br/>Slack · CRM · Dashboard"]
  S --> C[Founder Comms Agent]
  T -->|decision| C
  T -->|move to diligence| D[Diligence Agent]
```

---

## 1. Summary

Shortlist is a set of seven AI agents for venture deal flow, offered as a service:

| Agent | One-line job |
|---|---|
| **Intake** | Collects pitches from email, web form and imports; removes duplicates |
| **Screening** | Reads the deck (charts included), checks the fund's mandate, scores it against the fund's rubric with slide citations |
| **Research** | Looks up the company, founders' professional background, market and competitors, with source links |
| **Memo** | Writes a one-page investment memo in the fund's format |
| **Founder Comms** | Drafts acknowledgements, passes and information requests; sends after approval |
| **Pipeline** | Syncs deals to the CRM, posts Slack cards and weekly digests, routes deals to partners |
| **Diligence** | Reviews data-room files once a deal advances; produces question lists and red flags |

Each agent can be **used alone, in any combination, or all together**. They share one deal record and react to events (a new pitch, a finished screen, a stage change). They don't chat freely with each other, which keeps every step predictable, auditable and separately sellable.

**Why this is the right portfolio piece:** it shows multi-agent design, document AI (reading slides as images), web research with citations, human approval gates, third-party integrations (email, Slack, CRM), and measured evaluation. That is the bundle companies ask agencies for, and the same engine re-skins to accelerators, grant programs, procurement and hiring (§26).

---

## 2. The Problem and the Market

### 2.1 Too many pitches, too little time

- A mid-size generalist VC firm receives roughly **200–500 pitch decks a year** [1]; other sources cite investors seeing **1,000+ decks per year** [2].
- Very few get funded: one Carta example showed **4,500 decks → 11 investments (≈0.2%)** [3].
- Human review is fast and shallow: DocSend data puts average seed-deck review at about **3 min 44 s** [4].
- Vendors estimate associates spend **15–30 minutes per inbound pitch** just organizing information, and that funds take **2–4 weeks** to acknowledge a cold pitch, if they reply at all [5] (vendor figures; directional).

The work to automate is **triage, structuring and follow-up**, not the investment judgment itself.

### 2.2 Firms want AI but mostly haven't put it into production

- Affinity's 2026 survey of ~300 private-capital dealmakers: **85%** use AI for daily tasks; **82%** use AI for deal-sourcing research [6].
- One analysis estimates **fewer than 12%** of institutional VC funds have **working AI-assisted triage in production** [1].

The gap between ad-hoc ChatGPT use and a governed, integrated workflow is the service opportunity.

### 2.3 Findings that shape the design

| Finding | Design consequence |
|---|---|
| Deck financials are usually **charts, not text**; text-only tools miss them [1] | Screening reads each slide as an image (§7.2) |
| **~1% of ~200K real resumes** carried hidden prompt injections, mostly hidden data rather than commands [7] | Pitch decks are treated as hostile input; hidden text is detected and flagged (§15.2) |
| AI graders show **position, verbosity and self-preference bias** [8][9] | Anchored rubrics, facts-based scoring, required citations (§14) |
| A fund's durable edge is its **own data** (deal flow, decisions, outcomes) [10] | Every run, override and outcome is stored for calibration (§12, §26) |

---

## 3. Competitive Landscape and Positioning

| Category | Examples | What they do | Gap Shortlist fills |
|---|---|---|---|
| VC CRMs | Affinity (from ~$2,000/user/yr), Attio (Pro ~$828/seat/yr), DealCloud (five–six figures/yr), 4Degrees [11][12] | Relationship tracking, pipeline | Not built around thesis-specific inbound screening with cited scores |
| Sourcing data | Harmonic, Dealroom, Crunchbase [10] | Find companies outbound | Inbound triage is a different job |
| Horizontal AI agents | V7 screening agents, Tars intake agents [13][5] | Generic extraction or chat intake | Fund-specific rubric, approvals and memo format left to the buyer |
| Indie tools | Venture Intake and similar [14] | Inbox scoring | Thin governance, no modular adoption |

**Positioning:** Shortlist doesn't replace the CRM. It is a layer of agents that works in front of, and feeds into, whatever the fund already uses. A fund can start with one agent and add more later.

---

## 4. Product Principles

1. **Use one or use all.** Every agent works alone. No agent is mandatory.
2. **Work where the team already works.** Slack, email and the CRM first; the dashboard is optional.
3. **People decide.** Agents rank, draft and prepare. Nothing that judges a startup's quality is acted on without a person.
4. **Show the source.** Every claim points to a slide, a document or a web page.
5. **The fund's thesis is settings, not code.** Filters, rubric, memo format and routing are editable configuration.
6. **Fail loudly.** A missing deck, an invalid model answer or a broken integration stops that step with a visible reason. Nothing is silently skipped.

---

## 5. Goals, Non-Goals, Success Metrics

### 5.1 Goals

- G1. A pitch becomes a screened, scored, cited deal in **< 90 s p95** (≤ 20-page deck).
- G2. Any agent can be switched on or off per workspace without code changes.
- G3. Every AI output is traceable to its inputs, configuration version, prompt version and model.
- G4. No AI judgment reaches a founder without human approval.
- G5. A prospect understands the demo in **under 2 minutes**.

G1 is measured on a paid Gemini key. On the free tier a deck's calls are spaced by `LLM_RPM` (§14.4), so the same deck takes longer.

### 5.2 Non-goals (v1)

- Outbound sourcing (finding startups that haven't pitched).
- Replacing the CRM (contacts graph, email sync).
- Investment recommendations, valuation or term-sheet drafting.
- Billing and self-serve signup (the agency onboards each client).

### 5.3 Success metrics (measured on the evaluation set, §20)

| Metric | Target |
|---|---|
| Mandate-check accuracy (complete profiles) | 100% |
| Recall of human "advance" decks in AI top 20% | ≥ 80% |
| Rank correlation with human scores (Spearman ρ) | ≥ 0.6 |
| Score stability over 3 identical runs | ≤ 0.5 std-dev per criterion (1–5 scale) |
| Citation validity (screening, research, memo) | 100% (enforced by validators) |
| Seeded injection decks flagged | 100% |
| Founder messages sent without approval (except opted-in mandate declines) | 0 |

Targets are hypotheses; the case study reports measured values.

---

## 6. Users and Roles

| Role | Can |
|---|---|
| **Founder** (no login) | Submit a pitch; upload requested documents via a private link |
| **Analyst** | View deals, add notes, re-run agents, approve founder messages, move deals up to First Call |
| **Partner** | Everything an Analyst can, plus score overrides and moves to Diligence / IC / Invested / Passed |
| **Admin** | Everything, plus workspace settings, agents on/off, integrations, users, audit log |

A **workspace** is one fund. All data, settings and integrations belong to a workspace.

---

## 7. The Agents

Every agent is defined by the same contract:

| Field | Meaning |
|---|---|
| Trigger | The event that starts it |
| Needs | Data that must exist on the deal |
| Produces | What it writes to the deal record |
| Side effects | Anything outside Shortlist it changes (emails, CRM, Slack) |
| Approval | Whether a person must approve the side effect |
| Depends on | Agents that must be enabled for it to work |

### 7.1 Intake Agent

| | |
|---|---|
| Trigger | `form.submitted` (hosted form), `email.received` (intake address) |
| Needs | Nothing |
| Produces | Company, deal, submission (form fields, deck file, founder email, source channel) |
| Side effects | None |
| Approval | n/a |
| Depends on | None |

- **Channels:** a hosted submission form; a forwarding address (`pitches+{workspace}@in.shortlist.dev`) the fund auto-forwards its deal inbox to; CSV or API import.
- **Email handling:** the agent extracts company name, website, founder contact and stated round from the email body (structured output) and takes the PDF attachment as the deck. A link-only deck (e.g., an access-gated hosted deck) is not guessed at: the deal stays in `RECEIVED` with no deck on its submission, and the dashboard shows "Needs deck", derived from that missing deck.
- **Duplicates:** same normalized company domain, or same founder email within 90 days, links the pitch to the existing deal as a resubmission.
- **When Intake is off:** deals enter through manual upload or the API.

### 7.2 Screening Agent

| | |
|---|---|
| Trigger | `deal.received` with a deck |
| Needs | Deck PDF |
| Produces | Page extractions, deal profile, facts, mandate result, rubric scores with citations, integrity flag |
| Side effects | None |
| Approval | n/a |
| Depends on | None (works on API/manual uploads) |

```mermaid
flowchart TD
  A[Validate + render PDF pages to images] --> B[Read each page visually]
  B --> C[Hidden-text check]
  C --> D[Consolidate facts + build deal profile]
  D --> E{Mandate check}
  E -- outside mandate --> X[OUT_OF_MANDATE + reasons]
  E -- missing field --> N[NEEDS_REVIEW]
  E -- inside mandate --> F[Rubric scoring with citations]
  F --> G{Citations valid?}
  G -- no, first time --> F
  G -- no, second time --> Z[FAILED: shown to team]
  G -- yes --> H[Weighted score + SCREENED]
```

`OUT_OF_MANDATE`, `NEEDS_REVIEW` and `SCREENED` are deal stages. `FAILED` is a run status: the deal stays in `RECEIVED` and the failed run is shown to the team (§12.1).

1. **Render:** `pdftoppm` at ~110 dpi; reject encrypted files or decks over 30 pages.
2. **Read visually:** each page image goes to a vision model that returns slide type, visible text, metrics (with the exact source snippet) and chart descriptions. Charts with traction numbers are captured.
3. **Hidden-text check:** compare the PDF's text layer with what is visibly on the page. Large invisible spans set an integrity flag shown to the team. The scorer never sees the text layer.
4. **Facts and profile:** one call merges page extractions into `DealFacts` (problem, solution, market, traction, team, ask), each with page numbers. The **deal profile** (stage, sector, country, round size) uses form values where the founder gave them and deck values otherwise. Mismatches over 25% are flagged ("Form says $40k MRR; deck p.7 says $12k").
5. **Mandate check (deterministic, no AI):** stage, sector, country, round size and exclusions against the fund's filters. A field that can't be determined gives `NEEDS_REVIEW`, never a decline.
6. **Rubric scoring:** per criterion, reasoning first, then a 1–5 score, a confidence level and at least one citation `{page, snippet}`.
7. **Citation validation (deterministic):** each snippet must appear on the cited page. One retry with the errors; a second failure fails the run visibly.
8. **Score:** `total = Σ (score_i / 5) × weight_i`, weights summing to 100.

### 7.3 Research Agent

| | |
|---|---|
| Trigger | `deal.screened` (or `deal.received` if Screening is off) |
| Needs | Company name and website |
| Produces | Company snapshot, founder professional background, market notes, competitor list, recent news; every item with a source URL |
| Side effects | None |
| Approval | n/a |
| Depends on | None |

- **Tools:** Gemini's Google Search grounding and a fetcher for the company's own website. No other tools. Search grounding is the one way this agent researches; there is no no-search mode. It isn't on the free tier, so live runs need billing enabled on the key, and tests use recorded fixtures.
- **Scope rule:** professional, public information only. No personal life, no social-media scraping, no demographic attributes. LinkedIn URLs the founder submitted are shown as links, not scraped.
- **Citation rule:** an item without a resolvable source URL is dropped and logged.
- **Caching:** results cached per company for 30 days to control cost.

### 7.4 Memo Agent

| | |
|---|---|
| Trigger | `deal.screened` (waits for Research when Research is enabled) |
| Needs | Facts and scores |
| Produces | Memo JSON in the fund's section list; PDF and Markdown exports |
| Side effects | None (Pipeline distributes it) |
| Approval | n/a (labelled "AI draft") |
| Depends on | Screening |

- The fund defines memo sections (e.g., *Summary, Why now, Team, Traction, Risks, Questions for the founder call*).
- The model fills each section **only from facts, scores and research**, carrying their citations. A memo sentence with a number must cite a source.
- The memo is rendered from JSON by a template, so every memo looks the same.

### 7.5 Founder Comms Agent

| | |
|---|---|
| Trigger | `deal.received`, `deal.out_of_mandate`, stage changes, missing deck sections |
| Needs | Founder email |
| Produces | Message drafts |
| Side effects | Sends email from the fund's verified domain |
| Approval | Required by default; see below |
| Depends on | None (Screening needed for decline and info-request messages) |

| Message | Written by | Default sending |
|---|---|---|
| "We received your pitch" | Template (no AI) | Automatic |
| Out-of-mandate decline | AI draft in fund's voice | **Approval**; fund may opt in to automatic |
| Pass after review | AI draft | **Approval, always** |
| Request for missing info / data room | AI draft | Approval |
| Advance + meeting link | AI draft | Approval |

A pass based on rubric scores is never sent automatically. That rule is in code, not settings. The acknowledgement is the only message sent without a draft step: it's a fixed template with no AI content and no judgment of the startup (§11.4).

### 7.6 Pipeline Agent

| | |
|---|---|
| Trigger | Any deal event |
| Needs | Deal record |
| Produces | External IDs, sync status |
| Side effects | Writes to CRM; posts to Slack |
| Approval | Not required (internal tools only) |
| Depends on | None |

- **CRM sync:** create or update the company and deal with stage, score, memo link and source. v1 adapters: HubSpot, Airtable, Google Sheets. Affinity and Attio are built per client.
- **Slack:** a card for each deal above the fund's score threshold, with **Advance / Pass / Open** buttons that write the stage change back to Shortlist; a weekly digest every Monday.
- **Routing:** assigns a partner by sector and mentions them in Slack.

### 7.7 Diligence Agent

| | |
|---|---|
| Trigger | Deal moved to `DILIGENCE`; new data-room file uploaded |
| Needs | Data-room files (PDF, XLSX) |
| Produces | Diligence checklist status, claim-vs-document checks, red flags, founder question list |
| Side effects | None (Comms sends any requests) |
| Approval | n/a |
| Depends on | Screening (to compare deck claims) |

- Founders upload files through a private link that Comms sends.
- Spreadsheets are parsed in code; the model only labels which sheet is revenue, burn or cap table.
- **Claim checks are deterministic:** deck MRR vs model MRR, stated runway vs burn and cash, stated ownership vs cap table. Differences above a threshold become red flags with both sources cited.
- The checklist is the fund's own (configurable), each item marked *found / missing / needs review*.

---

## 8. How the Agents Work Together

### 8.1 Coordination model

Agents never message each other. They communicate through **events** and the **shared deal record**:

1. Something happens (a pitch arrives, a screen finishes, a partner clicks Advance).
2. Shortlist writes an event (`deal.received`, `deal.screened`, `deal.stage_changed`, …) in the same database transaction as the change.
3. A coordinator looks up which **enabled** agents listen to that event and queues one job per agent.
4. Each agent reads what it needs from the deal, writes its output, and may emit a new event.

This is deliberately simpler than free-form "agents talking to agents": the order is fixed, each step is logged, and switching an agent off simply means no job is queued for it.

### 8.2 Event table

| Event | Emitted by | Agents that listen |
|---|---|---|
| `email.received` | Postmark webhook | Intake |
| `form.submitted` | Public pitch form | Intake |
| `deal.received` | Intake, API, manual upload | Screening, Research (if Screening off), Comms (ack), Pipeline |
| `deal.screened` | Screening | Research, Memo, Pipeline |
| `deal.out_of_mandate` | Screening | Comms (decline draft), Pipeline |
| `deal.needs_review` | Screening | Pipeline |
| `research.completed` | Research | Memo |
| `memo.completed` | Memo | Pipeline |
| `deal.stage_changed` | People (dashboard or Slack) | Comms, Pipeline, Diligence (when → Diligence) |
| `document.uploaded` | Founder upload link | Diligence |

`email.received` and `form.submitted` happen before a deal exists, so their `deal_id` is null. Intake creates or links the deal, then emits `deal.received`.

### 8.3 Dependency rules (checked when settings are saved)

| If enabled… | …then this must also be enabled |
|---|---|
| Memo | Screening |
| Diligence | Screening |
| Comms (decline, info-request messages) | Screening |

Saving an invalid combination is rejected with a clear message. There is no partial behaviour to reason about at runtime.

### 8.4 Waiting for optional inputs

Memo waits for Research only when Research is enabled. The coordinator tracks this per deal: Memo is queued on `research.completed` if Research is on, otherwise on `deal.screened`. One rule, decided from the workspace configuration.

---

## 9. Ways to Use Shortlist

| Mode | What the fund sees | Typical agents |
|---|---|---|
| **Slack-only** | Slack cards and digests; never opens the dashboard | Intake, Screening, Memo, Pipeline |
| **CRM-first** | Scores and memos appear in their existing CRM | Screening, Memo, Pipeline |
| **Dashboard** | Full deals list, deck viewer with citations, approvals | Any |
| **API-only** | Their own tools call one agent (e.g., `POST /v1/agents/screening/runs`) | Usually Screening or Research alone |

**Packages for clients:**

| Package | Agents | For |
|---|---|---|
| Screening only | Screening | Funds that just want ranked, cited scores |
| Inbox on autopilot | Intake, Screening, Comms, Pipeline | Funds drowning in cold email |
| Full deal desk | All seven | Funds that want the whole first-pass workflow handled |

---

## 10. System Architecture

### 10.1 Principles

- **One web app, one worker, one database.** No microservices.
- **Postgres is the queue and the event log.** Jobs and events live in the same database as the data they describe.
- **Rules before AI.** Anything expressible as a rule (mandate, citations, claim checks, dependencies) is code.
- **Schemas are the contract.** One Zod schema per data shape, used by the database, API and model outputs.

### 10.2 System diagram

```mermaid
%% wide
flowchart LR
  subgraph Sources["Pitch sources"]
    FORM[Web form]
    MAIL["Fund inbox<br/>auto-forward"]
    API[Client API]
  end

  subgraph Web["Next.js app"]
    UI[Dashboard + settings]
    RH["API routes<br/>/v1, /hooks"]
    AUTH[Auth + roles]
  end

  subgraph Worker["Agent worker"]
    CO[Coordinator]
    AG["Agents<br/>Intake · Screening · Research<br/>Memo · Comms · Pipeline · Diligence"]
  end

  DB[(PostgreSQL<br/>data · events · jobs)]
  OBJ[(Object storage<br/>decks · documents)]
  LLM[Google Gemini API]
  PM[Postmark<br/>inbound + outbound email]
  SL[Slack]
  CRM["CRM<br/>HubSpot · Airtable · Sheets"]

  FORM --> RH
  API --> RH
  MAIL --> PM -->|inbound webhook| RH
  UI --> DB
  RH --> DB
  RH --> OBJ
  SL -->|button clicks| RH
  CO -->|reads events, queues jobs| DB
  CO --> AG
  AG --> DB
  AG --> OBJ
  AG --> LLM
  AG -->|approved messages| PM
  AG --> SL
  AG --> CRM
```

### 10.3 Technology choices

| Concern | Choice | Why |
|---|---|---|
| Web + API | **Next.js (App Router) + TypeScript** | One codebase for UI and API |
| UI | **Tailwind CSS + shadcn/ui** | Fast, consistent, accessible |
| Database | **PostgreSQL 16** | Relational core + JSONB for configs and agent outputs |
| ORM | **Drizzle** | Typed, SQL-first migrations |
| Jobs | **pg-boss** | Postgres-backed queue with retries; no extra infrastructure |
| Auth | **Auth.js** | Email magic links; one-click demo users |
| Files | **Cloudflare R2** | Private buckets, presigned URLs, no egress fees |
| PDF | **poppler** (render), **pdfjs-dist** (text layer) | Faithful rendering; hidden-text check |
| Spreadsheets | **SheetJS** | Parse data-room XLSX in code |
| AI | **Google Gemini API** through the Google Gen AI JavaScript SDK: vision, JSON-schema responses, Google Search grounding | One provider for reading, scoring and research; free tier for the synthetic demo (§14.4) |
| Email | **Postmark** | Inbound parsing webhook and outbound sending from one provider |
| Chat | **Slack Web API + interactivity** | Cards, buttons, digests |
| Errors | **Sentry** | Web and worker |
| Hosting | **Railway** (web, worker, Postgres) + R2 | Long-running worker container with poppler |

### 10.4 Flow: a pitch arrives by email

```mermaid
sequenceDiagram
  participant F as Founder
  participant FI as Fund inbox
  participant PM as Postmark
  participant W as Web app
  participant DB as Postgres
  participant K as Worker
  participant SL as Slack

  F->>FI: Email with deck PDF
  FI->>PM: Auto-forward
  PM->>W: Inbound webhook (signed)
  W->>DB: Store raw email + attachment, emit email.received
  K->>DB: Intake agent: extract fields, dedupe, create deal
  K->>DB: emit deal.received
  K->>PM: Template acknowledgement to founder
  K->>DB: Screening agent: read slides, check mandate, score
  K->>DB: Research + Memo agents
  K->>SL: Pipeline agent: deal card with Advance / Pass
```

---

## 11. Agent Runtime

### 11.1 Agent definition

```ts
type AgentDefinition<In, Out> = {
  key: AgentKey;                       // "screening", "memo", ...
  listensTo: EventType[];
  needs: (deal: DealSnapshot) => In;   // throws MissingInputError if absent
  run: (input: In, ctx: AgentContext) => Promise<Out>;
  outputSchema: z.ZodType<Out>;
  emits: (output: Out) => EventType[];
  sideEffect?: SideEffectPolicy;       // e.g. { kind: "email", approval: "required" }
};
```

Each agent is one module with one responsibility. The coordinator knows nothing about what agents do; it only maps events to enabled agents.

### 11.2 Runs and steps

- Every execution is an **agent run** row: agent, deal, trigger event, configuration version, prompt version, model, input hash, output, tokens, cost, latency, status, error.
- Multi-step agents (Screening, Diligence) save each step's output before the next. A retry resumes from the first unfinished step.
- Provider errors (rate limits, 5xx, timeouts) retry the same step through pg-boss with exponential backoff, at most 3 times. The rate limiter in `llm.ts` (§14.4) is there to avoid 429s; it does not retry. Invalid model output gets one corrective retry (§7.2 step 7), then the run fails visibly.
- Runs are idempotent per `(agent, trigger event)`: a duplicate event does not create a duplicate run. An event belongs to at most one deal, so the deal isn't part of the key. A manual re-run writes a new `agent.run_requested` event, which is why it is a new run.

### 11.3 Tools per agent

| Agent | Tools it may use |
|---|---|
| Intake | Email parser, dedupe query |
| Screening | Page renderer, vision model |
| Research | Google Search grounding, company-website fetch |
| Memo | None (reads deal record only) |
| Comms | Draft only; sending happens in a separate approved step |
| Pipeline | CRM adapter, Slack client |
| Diligence | Spreadsheet parser, vision model |

An agent can't call a tool outside its list. This limits what a manipulated input could cause.

### 11.4 Approval gates

```mermaid
stateDiagram-v2
  [*] --> DRAFTED
  [*] --> APPROVED: fixed template (acknowledgement only)
  DRAFTED --> APPROVED: team approves
  DRAFTED --> EDITED: team edits
  EDITED --> APPROVED: team approves
  DRAFTED --> DISCARDED: team discards
  DRAFTED --> APPROVED: auto policy (mandate declines, opt-in only)
  APPROVED --> SENT
  SENT --> [*]
  DISCARDED --> [*]
```

Approvals can be given in the dashboard or directly from the Slack card. Only the fixed-template acknowledgement enters at `APPROVED`. Any message with AI-written content starts at `DRAFTED`, and a pass after review always needs a person.

---

## 12. Data Model

```mermaid
erDiagram
  WORKSPACE ||--o{ CONFIG_VERSION : has
  WORKSPACE ||--o{ MEMBERSHIP : has
  USER ||--o{ MEMBERSHIP : has
  WORKSPACE ||--o{ INTEGRATION : connects
  WORKSPACE ||--o{ API_KEY : issues
  WORKSPACE ||--o{ COMPANY : tracks
  COMPANY ||--o{ DEAL : has
  DEAL ||--o{ SUBMISSION : receives
  DEAL ||--o{ DOCUMENT : holds
  DEAL ||--o{ EVENT : emits
  DEAL ||--o{ AGENT_RUN : processed_by
  CONFIG_VERSION ||--o{ AGENT_RUN : used_by
  AGENT_RUN ||--o{ RUN_STEP : has
  AGENT_RUN ||--o{ OUTBOUND_MESSAGE : drafts
  DEAL ||--o{ SCORE_OVERRIDE : has
  DEAL ||--o{ STAGE_TRANSITION : moves
  DEAL ||--o{ NOTE : has
  DEAL ||--o{ EXTERNAL_LINK : synced_as
  WORKSPACE ||--o{ AUDIT_EVENT : logs
```

| Table | Key columns |
|---|---|
| `workspace` | id, slug, name, intake_address |
| `user`, `membership` | user email; membership(user_id, workspace_id, role) |
| `account`, `session`, `verification_token` | The tables Auth.js requires for magic links; shape set by its Drizzle adapter |
| `api_key` | workspace_id, name, key_hash, scopes, created_by, last_used_at, revoked_at |
| `config_version` | workspace_id, version, config (jsonb, Zod-validated), is_active, created_by |
| `integration` | workspace_id, kind (`slack`/`hubspot`/`airtable`/`sheets`/`postmark_domain`), credentials (encrypted), status, last_error |
| `company` | workspace_id, name, domain_normalized (unique per workspace) |
| `deal` | workspace_id, company_id, stage, profile (jsonb), total_score, integrity_flag, assigned_partner_id |
| `submission` | deal_id, channel, form_data, founder_email, deck_object_key, deck_sha256, raw_email_key |
| `document` | deal_id, kind (`deck`/`financials`/`cap_table`/`other`), object_key, uploaded_by |
| `event` | workspace_id, deal_id (nullable: §8.2), type, payload, created_at, processed_at |
| `agent_run` | workspace_id, deal_id (nullable: an Intake run starts before its deal exists), agent, trigger_event_id, config_version_id, prompt_version, model, input_hash, status, output (jsonb), tokens_in, tokens_out, cost_micros, latency_ms, error; unique (agent, trigger_event_id) |
| `run_step` | run_id, step, output (jsonb), status |
| `outbound_message` | run_id, deal_id, kind, draft, final_text, status, decided_by, sent_at |
| `note` | deal_id, user_id, body, created_at |
| `score_override` | deal_id, criterion_key, ai_score, new_score, reason, user_id |
| `stage_transition` | deal_id, from, to, user_id, source (`dashboard`/`slack`), reason |
| `external_link` | deal_id, provider, external_id, last_synced_at |
| `audit_event` | workspace_id, actor (user or agent), action, entity, before, after |

**Append-only history:** agent runs, steps, overrides and transitions are never edited. A re-run is a new run. That is what makes the audit trail credible to a fund's partners and LPs.

**Money:** all costs are integer micro-dollars (`cost_micros`), never floats.

### 12.1 Deal stages and run status

These are two separate lists. A stage says where a deal is in the fund's process; a run status says what happened to one agent run.

| List | Values |
|---|---|
| Deal stage | `RECEIVED`, `NEEDS_REVIEW`, `OUT_OF_MANDATE`, `SCREENED`, `FIRST_CALL`, `DILIGENCE`, `IC`, `INVESTED`, `PASSED` |
| Run status | `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED` |

A failed run never changes the deal's stage. There is no "needs deck" stage: a deal without a deck stays in `RECEIVED` (§7.1).

---

## 13. Workspace Configuration

One versioned JSON document per workspace, validated by one schema at save time:

```json
{
  "thesis": "Pre-seed and seed B2B software in Pakistan and the Gulf: fintech infrastructure, climate, developer tools. Technical founders with early revenue.",
  "filters": {
    "stages": ["pre-seed", "seed"],
    "sectors": ["fintech", "climate", "devtools"],
    "countries": ["PK", "AE", "SA"],
    "roundSizeUsd": { "min": 250000, "max": 3000000 },
    "excludedSectors": ["crypto-token", "gambling"]
  },
  "rubric": [
    { "key": "team", "label": "Team", "weight": 30,
      "question": "Can these founders execute this plan?",
      "anchors": { "1": "No relevant experience shown", "3": "Domain or execution experience, not both", "5": "Deep domain + proven execution evidenced" } },
    { "key": "traction", "label": "Traction", "weight": 25, "question": "...", "anchors": { "1": "...", "3": "...", "5": "..." } },
    { "key": "market", "label": "Market", "weight": 20, "question": "...", "anchors": { "1": "...", "3": "...", "5": "..." } },
    { "key": "product", "label": "Product & edge", "weight": 15, "question": "...", "anchors": { "1": "...", "3": "...", "5": "..." } },
    { "key": "fit", "label": "Thesis fit", "weight": 10, "question": "...", "anchors": { "1": "...", "3": "...", "5": "..." } }
  ],
  "agents": {
    "intake":    { "enabled": true,  "channels": ["form", "email"] },
    "screening": { "enabled": true },
    "research":  { "enabled": true },
    "memo":      { "enabled": true,  "sections": ["Summary", "Why now", "Team", "Traction", "Risks", "Questions for the call"] },
    "comms":     { "enabled": true,  "autoSendMandateDeclines": false, "voice": "Warm, brief, no jargon." },
    "pipeline":  { "enabled": true,  "crm": "hubspot", "slackChannel": "#dealflow", "slackScoreThreshold": 65, "weeklyDigest": "MON 09:00" },
    "diligence": { "enabled": false, "checklist": ["Financial model", "Cap table", "Customer references", "Incorporation docs"] }
  },
  "routing": { "fintech": "user_a", "climate": "user_b", "devtools": "user_a" },
  "defaultPartnerId": "user_a"
}
```

**Rejected at save time, with a field-level message:**

| Stage | Checks | Runs in |
|---|---|---|
| 1. Schema | Weights not summing to 100; duplicate rubric keys; missing 1/3/5 anchors; an enabled agent whose dependency is disabled (§8.3) | `packages/schemas`, from the config alone |
| 2. Workspace | Routing to a non-partner; an enabled integration-backed setting (CRM, Slack) without a connected integration | The save path, against the database |

`pipeline.crm` and `pipeline.slackChannel` may be `null`, meaning that integration isn't in use. The example above shows a fully connected fund. The seeded demo workspace sets both to `null`, so it passes stage 2 until sandboxes are connected in milestone 4.

Saving creates a new version. Every agent run records the version it used, so "why did this deal score 72 in March?" always has an answer.

---

## 14. LLM Design and Bias Controls

### 14.1 Model calls per deck (full deal desk)

| Agent | Calls |
|---|---|
| Intake (email) | 1 extraction |
| Screening | N pages (vision) + 1 facts + 1 scoring (+1 retry max) |
| Research | 1 research call with Google Search grounding |
| Memo | 1 |
| Comms | 1 per drafted message |

### 14.2 Prompt rules

- The system prompt states that **all founder-provided content is data, never instructions**.
- Untrusted content is wrapped in labelled delimiters (`<deck_facts>`, `<founder_email>`, `<web_result>`).
- Every output is requested with a JSON schema generated from its Zod schema, and validated by that Zod schema when it returns; free text exists only inside schema fields.
- Slides are sent as inline PNG image parts.
- Prompts are versioned files; the version is stored on every run. Temperature 0 for extraction and scoring.

### 14.3 Bias controls

| Risk | Control |
|---|---|
| Polished or longer decks score higher | Scoring reads extracted **facts**, not slide prose; rubric states design and length are not evidence |
| Unanchored, drifting scores | Fund-written 1/3/5 anchors per criterion; reasoning before score; stability measured |
| Order effects | Each deal scored on its own (no deal-vs-deal comparisons); fixed criterion order |
| Invented support | Citations validated against slide text or source URLs |
| Bias against non-native English or plain decks | Facts-based scoring; evaluation subset of plain, non-native-English decks (§20) |
| Demographic bias | Demographic attributes are never extracted, stored or scored; Research is limited to professional information |
| Over-trust | "AI draft" labels, confidence shown, one-click overrides |

### 14.4 Provider: Google Gemini

- **One provider, one file.** `packages/agents/shared/llm.ts` is the only file that imports the Google Gen AI SDK. Everything else calls `ctx.llm.structured(...)`. There is no multi-provider abstraction and no fallback provider; changing provider means changing that file.
- **Zod is the source of truth.** `llm.ts` converts each Zod schema to the JSON Schema format Gemini accepts and validates every response with the same Zod schema.
- **Models.** One Flash-class model reads pages and one scores and writes memos. IDs and a per-model price table live in `packages/agents/shared/models.ts`, not in workspace settings, because they aren't a fund's choice. Every run records its model. IDs are chosen from Google's model docs in milestone 2.
- **Rate limit.** Free-tier limits are low, so `llm.ts` holds one rate limiter set by env `LLM_RPM`. A 15-page deck queues its calls instead of hitting 429s. Any 429 or 5xx that still occurs goes through pg-boss retry with backoff (§11.2).
- **Free-tier data.** Google may use free-tier inputs to improve its products, so only synthetic data ever goes through a free-tier key (§15.4). Client deployments use a paid key.
- **Search grounding** isn't on the free tier. Live Research runs need billing enabled on the key (§7.3).
- **Speed on the free tier.** Calls are spaced by `LLM_RPM`, so a deck can take longer than the G1 target (§5.1).

---

## 15. Security, Privacy and Adversarial Inputs

### 15.1 Access and tenancy

- One authorization function, `authorize(user, action, resource)`, backed by a static role table, is called first in every route and server action.
- One data-access layer takes `workspaceId` from the session or API key, never from the request body.
- Slack button clicks and Postmark webhooks are verified by signature before anything is read.
- Integration credentials are encrypted (AES-256-GCM) with a key held outside the database.

### 15.2 Hostile pitch decks

Hidden prompt injections already appear in about 1% of real-world resumes [7]; pitch decks face the same incentive. Defences, most important first:

1. **The model reads slide images:** text a human can't see (white-on-white, 2pt font, off-page) isn't in what the model reads.
2. **Hidden-text detection:** invisible text is flagged to the team with the extracted snippet.
3. **Citation validation:** a claim the deck doesn't visibly make can't be cited, so it can't support a score.
4. **Tool allowlists:** a manipulated input can't make Screening send email or write to the CRM; those tools belong to other agents.
5. **People decide:** the worst case is a reordered queue that a person still reads, never an automatic decision.

### 15.3 Files

- Upload URLs are limited to PDF/XLSX, size-capped and expire in 5 minutes; files are checked by magic bytes.
- Rendering runs in the worker container with CPU and memory limits and a 60-second timeout.
- No file has a public URL; viewing uses 60-second presigned links after authorization.

### 15.4 Privacy

- Decks are confidential: private storage, encryption at rest, TLS everywhere.
- The submission form shows a privacy notice; founders can request deletion through the fund.
- Per-workspace retention (e.g., delete files of passed deals after N days; keep the structured record).
- The public demo runs on the Gemini free tier, where Google may use inputs to improve its products. Only synthetic data ever goes through a free-tier key.
- Client deployments always use a paid Gemini key. AI provider data-retention terms are confirmed at contract time; zero-data-retention options are used where the client requires them.

### 15.5 Abuse and spend

- Rate limits per IP and per workspace on the form and API; a honeypot field on the form.
- Daily AI spend cap per workspace: when reached, the coordinator pauses that workspace's queue and alerts admins.

---

## 16. Integrations

| Integration | Direction | Used by | v1 scope |
|---|---|---|---|
| Postmark inbound | In | Intake | Forwarded pitch emails with attachments |
| Postmark outbound | Out | Comms | Sending approved messages from the fund's verified domain |
| Slack | Both | Pipeline, Comms approvals | Deal cards, buttons, weekly digest |
| HubSpot | Out | Pipeline | Companies + deals with score, stage, memo link |
| Airtable | Out | Pipeline | One base, one table |
| Google Sheets | Out | Pipeline | Append and update rows |
| Webhooks | Out | Any | `deal.screened`, `memo.completed`, `deal.stage_changed`, HMAC-signed |
| Affinity / Attio | Out | Pipeline | Built per client through the same adapter interface |

```ts
interface CrmAdapter {
  upsertCompany(c: CompanyRecord): Promise<ExternalId>;
  upsertDeal(d: DealRecord, companyId: ExternalId): Promise<ExternalId>;
}
```

A sync failure marks the integration `ERROR` with the provider's message, shows a banner to admins and retries with backoff. Nothing is dropped silently.

---

## 17. Public API

Authenticated with workspace API keys (hashed at rest, scoped, revocable).

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/deals` | Create a deal (form fields + deck upload id) |
| POST | `/v1/uploads` | Get a presigned upload URL |
| GET | `/v1/deals/{id}` | Deal with latest agent outputs |
| POST | `/v1/agents/{agent}/runs` | Run one agent on a deal, or on a file directly (Screening, Research) |
| GET | `/v1/runs/{id}` | Run status and output |
| POST | `/v1/deals/{id}/stage` | Move a deal (emits `deal.stage_changed`) |
| POST | `/hooks/postmark` | Inbound email (signature-verified) |
| POST | `/hooks/slack` | Slack interactivity (signature-verified) |

Running an agent "on a file directly" is what makes single-agent use possible: a fund can use only Screening without ever opening our dashboard. The file creates a normal deal with `channel = "api"`, because it's a real pitch that came in through the API. It uses the same tables and history as any other deal.

---

## 18. Screens

| Screen | Purpose |
|---|---|
| **Public pitch form** | One page, drag-and-drop deck, privacy notice |
| **Founder upload page** | Private link for data-room files |
| **Deals list** | Directory-style list; filters by stage, sector, score, flags |
| **Deal page** | Memo and scores on the left; deck viewer on the right, jumping to the cited slide; tabs for Research, Diligence, Messages, History |
| **Approvals inbox** | All founder message drafts awaiting approval; edit, approve, discard |
| **Agents** | One card per agent: on/off, its settings, last runs, errors |
| **Integrations** | Connect Slack, CRM, email domain; status and last error |
| **Run inspector** | Steps, inputs, outputs, tokens, cost, versions for any run |
| **Audit log** | Every action by people and agents |

The **Agents** page is the visual proof of "use one or use all": each agent is a card with a switch.

---

## 19. Observability, Cost and Usage

- **Per run:** tokens, cost in `cost_micros` (from the Gemini price table in `packages/agents/shared/models.ts`), latency per step, model, prompt version, errors. Cost is calculated at paid list price on every key, including the free tier, so the figures show what a client would pay.
- **Workspace usage page:** pitches received, decks screened, runs per agent, cost per deck, approvals pending, integration health. This doubles as the basis for client billing.
- **Cost per deck:** `N_pages × page_read + facts + scoring (+ research + memo + drafts)`. Measured on the evaluation set and published in the case study. Levers: lower render resolution, skip title/closing slides, smaller model for page reading.
- **Alerts:** run failure rate > 5% per hour, queue depth > 50, integration in `ERROR`, spend cap reached.
- **Logs:** structured JSON with `workspaceId`, `dealId`, `agent`, `runId`, `step`; Sentry for exceptions.

---

## 20. Evaluation Plan

The measured results are the strongest sales asset; they turn a demo into evidence.

### 20.1 Dataset (all synthetic; no real startups' confidential decks)

- **30 decks** for fictional companies: 8 strong, 12 average, 6 weak, 4 out of mandate.
  - 3 with hidden-text injections; 3 with form-vs-deck mismatches; 5 where traction exists **only in charts**; 5 plain, non-native-English decks.
- **5 data rooms** (financial model + cap table) with seeded inconsistencies against their decks.
- **10 pitch emails** in varied formats, including link-only decks and duplicates.
- **Human labels:** two reviewers score every deck on the rubric independently; agreement is recorded.

### 20.2 Per-agent metrics

| Agent | Metric |
|---|---|
| Intake | Field extraction accuracy; duplicate detection precision/recall |
| Screening | Spearman ρ vs humans; top-20% recall; stability; chart-only metric extraction; injection flags; mismatch flags |
| Research | Citation validity; factual accuracy on a 20-claim manual sample |
| Memo | Every number cited; no claim absent from facts or research (checked by a separate grader model + manual sample) |
| Comms | Zero unapproved sends in tests; tone review of 20 drafts |
| Pipeline | Integration tests against HubSpot, Airtable, Sheets sandboxes; Slack button round-trip |
| Diligence | Detection rate of seeded inconsistencies |

### 20.3 Regression harness

`pnpm eval` runs the full set and writes a report to `eval/reports/`. Any prompt or model change requires a run, and the report is committed with the change.

---

## 21. Deployment

| Environment | Purpose | Data |
|---|---|---|
| `local` | Development on Windows; PostgreSQL 16 and MinIO run natively (no Docker) | Seed script |
| `demo` | Public portfolio demo | Fictional fund, 30 synthetic deals; nightly reset |
| `client` | Per-client deployment | Client data |

**Client deployment options:**

| Option | When |
|---|---|
| Hosted workspace on our instance | Small funds, fastest start |
| Dedicated deployment in the client's cloud account | Funds with data-residency or security requirements |

Both run the same code; only environment configuration differs.

**Worker image:** `apps/worker/Dockerfile` installs poppler and exists only for the Railway build. Local development doesn't use it.

**CI (GitHub Actions):** a Postgres 16 service container provides the database. Steps: typecheck → lint → unit tests (mandate, citation validator, claim checks, dependency rules, scoring math) → migrations check → eval smoke test (5 decks) → build → deploy on `main`. Environment variables are validated at boot; a missing one stops the process with a clear message.

---

## 22. Repository Structure

```
shortlist-vc-pitch-screening/
├─ apps/
│  ├─ web/                  # Next.js: dashboard, API routes, webhooks
│  └─ worker/               # coordinator + agent runner (Dockerfile with poppler)
├─ packages/
│  ├─ agents/
│  │  ├─ shared/             # runtime types, llm.ts (only Gemini SDK importer), models.ts
│  │  ├─ intake/
│  │  ├─ screening/
│  │  ├─ research/
│  │  ├─ memo/
│  │  ├─ comms/
│  │  ├─ pipeline/
│  │  └─ diligence/          # each: definition.ts, steps/, prompts/, schema.ts, tests/
│  ├─ coordinator/           # event → enabled agents → jobs
│  ├─ integrations/          # postmark, slack, hubspot, airtable, sheets
│  ├─ db/                    # Drizzle schema, migrations, data-access layer
│  └─ schemas/               # Zod: config, deal, events, env
├─ eval/                     # synthetic decks, data rooms, emails, labels, reports
└─ docs/                     # this document, architecture decisions
```

One folder per agent mirrors how the product is sold: a client buying "Screening only" maps to one folder.

---

## 23. Portfolio Packaging (Upwork and GitHub)

### 23.1 What to publish

1. **Live demo:** one-click logins (Partner, Analyst, Admin) on a fictional fund with 30 screened deals. The highlight: upload a sample deck and watch it become a cited, scored memo in under a minute. Then switch an agent off on the Agents page and show the workflow adapt.
2. **90-second video:** pitch arrives → Slack card → memo with slide citations → one-click Advance → diligence checklist.
3. **Case study page:** the problem (§2 figures), the agent map (§0 diagram), measured evaluation results (§20), the hostile-deck defence (a strong talking point), screenshots.
4. **GitHub repository** with a plain-language README.

### 23.2 README outline (plain language first)

1. One sentence: *"Shortlist is a team of AI assistants that reads every pitch a VC firm receives, ranks the best ones and drafts the memos, so the team only reviews deals worth their time."*
2. GIF of the demo.
3. "The seven assistants" table (one line each).
4. "Use one or all": the Agents page screenshot.
5. Results from the evaluation.
6. Then technical sections: architecture, running locally, tests, evaluation.
7. Data note: the demo runs on the Gemini free tier, where Google may use inputs to improve its products, so it only ever processes synthetic data. Client deployments use a paid key.

### 23.3 Upwork entry

- **Title:** Shortlist: AI Agents That Screen Startup Pitches for VC Firms
- **First line:** "A set of AI assistants that read every pitch a VC firm receives, rank the best ones and draft the memos, so the team only reviews deals worth their time. Use one assistant or all of them."
- **Skills tags:** AI Agent Development, LLM, Google Gemini API, Next.js, PostgreSQL, Workflow Automation, Slack API, HubSpot, Document AI.

---

## 24. Delivery Plan

| Week | Milestone | Done when |
|---|---|---|
| 1 | Foundations | Monorepo, schema + migrations, auth + roles, workspace config with validation, coordinator + agent runtime, seed data |
| 2 | Intake + Screening | Form and email intake, dedupe, page reading, hidden-text check, mandate, scoring, citation validator |
| 3 | Research + Memo + dashboard | Web research with sources, memo template + exports, deals list, deal page with deck viewer |
| 4 | Comms + Pipeline | Approval inbox, Postmark sending, Slack cards + buttons + digest, HubSpot/Airtable/Sheets adapters |
| 5 | Diligence + API + Agents page | Founder upload link, spreadsheet parsing, claim checks, public API, agent on/off cards, run inspector, audit log |
| 6 | Evaluation + launch | Synthetic dataset, labels, eval report, demo deploy with nightly reset, video, case study, README, Upwork entry |

With two engineers in parallel (agents/backend and UI/integrations), about 4 weeks.

---

## 25. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vision model misreads a chart | Medium | Wrong traction figure | Source snippet required; chart-only eval metric; team sees the cited slide |
| Scores feel arbitrary to partners | Medium | No trust | Fund-written anchors, citations, overrides, published stability metric |
| Hostile decks manipulate scores | Medium | Wrong ranking | Image-only reading, detection, validation, tool allowlists, people decide |
| Research returns wrong or outdated facts | Medium | Misleading memo | Source URL required; dated sources; manual accuracy sample in eval |
| Founder receives an inappropriate AI message | Low | Fund reputation | Approval by default; rubric-based passes never auto-sent (enforced in code) |
| Integration breaks (token expiry, API change) | Medium | Silent data gaps | Integration status + error banner; retries; alerts |
| Bias against plain or non-native-English decks | Medium | Missed good founders | Facts-based scoring; dedicated eval subset; no demographic data |
| Model or provider change shifts scores | Medium | Inconsistent history | Model + prompt version on every run; eval required before switching |
| Cost spike | Low | Budget | Page cap, cache, spend cap, cost visible per run |

---

## 26. Offering It to Clients

### 26.1 Who buys

| Segment | Why |
|---|---|
| Emerging managers and small funds (1–5 investors) | High inbound per person, no analyst bench |
| Accelerators and incubators | Hundreds of applications per cohort; rubric already exists |
| Angel networks | Volunteer reviewers, inconsistent screening |
| Corporate VC / innovation units | Need audit trails and governance |
| Grant programs and startup competitions | Same engine with "program" settings |

### 26.2 How to engage

1. **Pilot (2–3 weeks):** run the client's last 100 pitches through Screening and report agreement with their actual decisions.
2. **Deployment:** configure their thesis, rubric and memo format; connect their inbox, Slack and CRM; switch on the agents they choose.
3. **Ongoing support:** monthly calibration from overrides and outcomes, new integrations, evaluation reports.

### 26.3 One engine, many industries

| Shortlist concept | VC | Accelerator | Grants | Procurement | Hiring |
|---|---|---|---|---|---|
| Submission | Pitch deck | Application | Proposal | Bid | CV |
| Mandate check | Stage, sector, country | Eligibility | Eligibility | Compliance | Must-haves |
| Rubric | Team, market, traction | Program criteria | Scoring rubric | Evaluation matrix | Competencies |
| Memo | Investment memo | Selection brief | Executive brief | Bid summary | Candidate brief |
| Diligence | Data room | References | Budget review | Vendor checks | Reference checks |

### 26.4 The client's long-term advantage

Every override and outcome (passed, invested, raised a later round) is stored. After a few cycles the fund can tune its rubric against its own decisions, using data no off-the-shelf tool has [10].

---

## 27. Sources

1. V7 Labs, *AI for Pitch Deck Analysis: A Practical Guide for VC Teams* (cites Capitaly on AI triage adoption). https://www.v7labs.com/blog/ai-pitch-deck-analysis
2. *Startup Pitch Deck Statistics (2026)*, citing Preuve.ai and DocSend. https://blog.mean.ceo/?p=11233
3. Carta, Peter Walker, *Only 0.2 Percent of Pitch Decks Lead to Funding* (Jun 2026). https://carta.com/data/linkedin-pitch-deck-to-funding-rate-vc/
4. Presentations.AI, *Pitch Deck Statistics*, citing DocSend and Papermark. https://www.presentations.ai/blog/pitch-deck-statistics
5. Tars, *VC Fund Engagement and Deal Intake Agent* (vendor estimates). https://hellotars.com/ai-agents/ai-agent-for-vc-fund-business
6. Affinity, *10 AI tools transforming venture capital in 2026* (2026 dealmaker survey). https://www.affinity.co/guides/vc-ai-tools
7. *Measuring Real-World Prompt Injection Attacks in LLM-based Resume Screening* (arXiv 2605.28999, USENIX Security 2026). https://www.emergentmind.com/papers/2605.28999
8. Datadog, *What Is LLM-as-a-Judge?* https://www.datadoghq.com/knowledge-center/llm-as-a-judge/
9. Taskade, *LLM as a Judge* (bias mitigations). https://www.taskade.com/wiki/ai/llm-as-a-judge
10. Spine, *What VCs are actually using AI for in 2026*. https://www.getspine.ai/blog/what-vcs-are-actually-using-ai-for-in-2026
11. Attio, *Best CRMs for VCs 2026: Ranked by data model*. https://attio.com/f/best-crm-for-venture-capital
12. Craftt, *Affinity vs Attio* (pricing comparison). https://www.craftt.io/affinity-vs-attio
13. V7 Labs, *AI Deal Screening and Triage Agent*. https://www.v7labs.com/agents/ai-deal-screening-and-triage-agent
14. Venture Intake on Product Hunt (via hunted.space). https://www.hunted.space/product/venture-intake-venture-capital-crm

*Market figures come from vendors and secondary compilations. They are directional and should be re-verified before quoting in client proposals.*
