# Completion Plan

How Shortlist gets from where it is today (21 Nov 2026) to the finished portfolio piece described in `docs/design.md` §23. This file sets the order of work. `docs/design.md` still decides *what* each piece does, and `docs/progress.md` still records what's done.

---

## 1. Where it stands

| Area | State |
|---|---|
| Foundations (M1) | Done: monorepo, schema, auth + roles, config validation, coordinator, worker, seed, CI |
| Intake (M2) | Form channel done (dedupe, spend cap, synthetic gate). **Postmark email channel not built** |
| Screening (M2) | Rule-based slice done (schemas, mandate, citation validator). **No prompts, model calls, `definition.ts` or registry entry**, so nothing is actually screened end to end |
| Dashboard (M3) | Deals list + Deal page with deck viewer built but **uncommitted** (26 modified + ~30 new files). Memo/Research/Diligence/Messages/History tabs say "Coming soon"; no stage moves |
| Research, Memo, Comms, Pipeline, Diligence | Not started |
| Integrations | Only R2 storage. No Postmark, Slack, HubSpot, Airtable, Sheets, outbound webhooks |
| Screens | Built: pitch form, sign-in, Deals, Deal. Missing: Approvals, Agents, Integrations, Settings, Run inspector, Audit log, founder upload page, public landing / case study |
| API | Only the public form routes. No `/v1`, no API keys, no `/hooks/*` |
| Eval, deploy, packaging (M6) | Not started. Playwright not installed yet |

Roughly M1 is complete, M2 is about 60% done, M3 about 25%, and M4 to M6 haven't started.

---

## 2. How the work is ordered

1. **Land what's open first.** The uncommitted dashboard slice is committed before anything else, so the redesign starts from a clean tree.
2. **Redesign before building more screens.** Six screens are still to be built. Changing the visual language now means rebuilding 4 screens. Changing it later would mean rebuilding 10.
3. **Make the core loop real before going wide.** A pitch that turns into a screened, scored, cited deal through a real Gemini call is the demo's highlight (§23.1). That loop comes before Comms, Pipeline or Diligence.
4. **Keys-ready integrations.** Every integration is fully built and tested against recorded fixtures and signature test vectors, so you only paste credentials later (§5). Without credentials an integration shows the explicit state **Not connected** in the UI. Fakes exist only in tests, never as a runtime fallback (principle 3).
5. **One vertical slice per commit**, with tests, `pnpm typecheck && pnpm lint && pnpm test` green, a `code-reviewer` pass, and `security-reviewer` for anything touching auth, hooks, files or integrations.

---

## 3. New visual direction (inspired by swisk-ai.vercel.app)

The current look ("YC-inspired": white, Inter, one orange accent) works but feels generic. The reference site has a stronger, warmer identity. If Swisk is your agency's own site, matching it also ties Shortlist to the agency as its flagship case study.

### 3.1 What the reference actually uses (from its stylesheet)

| Token | Value | Role on the site |
|---|---|---|
| Charcoal | `#171512` | Dark hero, nav bar, ink |
| Oat | `#e2d6c0` | Light "sheet" surfaces |
| Sand | `#faf3e0` | Lighter paper, cards |
| Mint | `#eaf1ed` | Soft green surface |
| Vermilion | `#da3a10` | Primary CTA, logo dot |
| Teal | `#0f7a5c` | Positive accent, panels |
| Amber | `#fdb913` | Highlight accent |
| Coral line | `#f58a78` | Thin accent lines |

- **Type:** Schibsted Grotesk (display headings), Plus Jakarta Sans (body), JetBrains Mono (labels, numbering, status).
- **Motifs:** zero-padded numbering (`01 VOICE AGENTS`), pill-shaped nav and buttons, **hard offset "brutalist" shadows** (`3px/5px/8px` solid, sometimes tinted teal, amber or vermilion), a dotted-grid canvas inside a product frame with **corner-bracket marks**, a dark hero with a warm radial glow, and a light sheet with a 44px top radius rising over the dark section.
- **Motion:** words animate in (`word-in`), sections rise (`rise`, expo ease), a `live` pulse, and a subtle `nudge` on the scroll cue.

### 3.2 How it translates to Shortlist

A dashboard isn't a landing page, so the bold parts go on public pages and the app stays calm and dense.

| Surface | Treatment |
|---|---|
| **Public** (new landing / case study page, sign-in, pitch form header) | Charcoal hero with warm glow, display headline with word-in, oat sheet rising over it, numbered `01–07` agent cards, a product frame with corner brackets showing a live deal page, a vermilion pill CTA with an offset shadow |
| **App shell** | Charcoal top bar with the logo dot, a pill nav segment in the centre (Deals · Approvals · Agents · Integrations · Settings) and workspace + avatar on the right. The page background is warm paper (sand tint), and content sits on white sheets with 1px oat borders |
| **Lists** (Deals, Approvals, Runs, Audit) | Keep rows-not-cards and the density. Mono for metadata: scores, `p.6` citations, counts, timestamps, stage codes |
| **Scores and states** | ≥70 teal on mint, 50–69 ink on amber-soft, <50 vermilion on a pale red tint. Amber is never used for text (contrast) |
| **Agents page** (the "use one or all" proof, §18) | Seven numbered cards `01 INTAKE` … `07 DILIGENCE`, each with a short description, three tag chips, a switch, last-run status with a `live` pulse while running, and a teal offset shadow when the agent is on |
| **Deck viewer** | A dotted-grid canvas inside a frame with corner brackets (the reference's product frame), and the cited snippet in a sand callout |
| **Primary action** | One vermilion pill per screen header with a small charcoal offset shadow. Secondary buttons are outlined pills |
| **Motion** | `rise` on page load and `live` for running agents only. Everything off under `prefers-reduced-motion` |

Contrast (measured): vermilion `#da3a10` is 4.57:1 on white but **4.13:1 on sand, which fails AA**. So vermilion stays a mark colour (logo dot, CTA fill, underline), and text/link uses a darker step, `#c2330c` (5.57:1 on white). Teal on mint is 4.62:1 (passes, just). Charcoal on oat is 12.68:1. Amber on white is 1.73:1, so amber is never used for text. All pairings go into `tokens.css` with their ratios, as today.

### 3.3 Rules that change

- `.claude/skills/ui-design-system/SKILL.md` and `tokens.css` are rewritten (principles 3 "One accent" and 4 "Flat" change: a small accent family and offset shadows are allowed in defined places).
- `docs/ui/mockup.html` and `docs/ui/screens/*.png` are redone in the new style **before** any screen is rebuilt, and you approve them.
- The `ui-builder` subagent description ("YC-inspired") is updated.
- The open radius-scale task in `progress.md` M1 is settled by the new tokens (pills for controls, `rounded-xl` for sheets).
- Fonts load with `next/font/google` (no new dependency). Inter is removed.

---

## 4. Phases

Estimates are focused working days for one engineer working with Claude Code. They are rough.

### Phase 0: Land and tidy (½ day)

- [ ] Run checks on the open dashboard slice, `code-reviewer` + `security-reviewer` (deck route, presigned GET), commit `feat: add deals list and deal page with deck viewer`
- [ ] Recreate the local DB (`progress.md` M2 note on migration `0004`), then `pnpm db:migrate && pnpm db:seed`
- [ ] Add a favicon (dashboard follow-up (f))

**Done when:** the working tree is clean and `pnpm dev` shows the seeded deals.

### Phase 1: Design system v2 (3–4 days) · `ui-builder`

1. [ ] New `tokens.css` + skill rewrite (§3), with contrast ratios measured
2. [ ] Static `docs/ui/mockup.html` v2: app shell, Deals, Deal, Agents, Approvals, landing. **Checkpoint: you approve it**
3. [ ] `globals.css`, fonts, shadcn component restyle (button, input, checkbox, sheet), shared pieces (`tag`, `score-pill`, `banner`, `company-avatar`, `wordmark`, `top-nav`)
4. [ ] Rebuild Deals list, Deal page, sign-in and pitch form in the new style. Refresh `docs/ui/screens/built/*` at 1280 and 390
5. [ ] Install Playwright (`pnpm test:e2e`). First specs: sign in as demo partner → Deals → open deal → click citation → page jump. Screenshot capture becomes a script instead of manual

**Done when:** all existing screens match the approved mockup at both widths, and the e2e passes.

### Phase 2: Screening end to end (4–5 days) · `agent-builder`

The heart of the demo. Read §7.2, §11, §14 and the `llm-call` skill first.

1. [ ] `storage` in `AgentContext` + §11.3 tool allowlist enforcement (first agent that needs a tool)
2. [ ] PDF hardening + render step: `pdfinfo` page cap, `pdftoppm` with timeout, fixed DPI, page-size cap, no network (storage follow-up (e))
3. [ ] Page reading + hidden-text check
4. [ ] Facts/profile call (per-page text blocks, `citationIssues` refine, form-vs-deck mismatch >25%)
5. [ ] Mandate (exists) → scoring call (reads facts only, cites their citations, rubric coverage refine) → score math
6. [ ] `definition.ts` with `screeningOutputSchema` (dashboard follow-up (h)), versioned prompts, registry entry. Screening pins to its trigger submission's deck (Intake follow-up (f))
7. [ ] Map retryable `IntegrationError`s to `ProviderError` in the worker
8. [ ] Hidden-text / prompt-injection decks in tests; `security-reviewer`

**Done when:** submitting a synthetic deck through the form produces a screened deal on the Deal page with real citations, using the free key on the synthetic workspace.

### Phase 3: Research, Memo and a complete Deal page (5–6 days)

1. [ ] SSRF guard before any fetch: resolve the host, block private/loopback/link-local/metadata ranges, re-check after redirects
2. [ ] Research agent: Gemini Google Search grounding, source URLs, 30-day cache, grounding fees in `models.ts`. Tests use **recorded fixtures**, so the slice is complete without a paid key
3. [ ] Memo agent: template rendering, Markdown + PDF export
4. [ ] Deal page tabs: Memo, Research, History (runs + stage transitions). Messages and Diligence come with their agents
5. [ ] Stage moves (Advance, Pass) and notes. `deal.stage_changed` in the same transaction
6. [ ] Possible-duplicate confirm/reject action (Intake follow-ups (b), (d), (i), (j), (k))
7. [ ] Manual re-run trigger (`agent.run_requested`) from the Deal page

**Done when:** a deal shows a cited memo, research with sources, its full history, and can be advanced or passed.

### Phase 4: Comms, Pipeline and integrations (6–8 days) · `integration-builder`, `agent-builder`

1. [ ] **Comms blockers first** (`progress.md` M2): ack template without founder free text, 1 message per address per 24h, no auto-ack for `possible_duplicate` or failed Intake. Rubric-based passes are never auto-sent (code, not setting)
2. [ ] Founder Comms agent → drafts → approval state machine (§11.4)
3. [ ] Approvals inbox screen (edit, approve, discard)
4. [ ] Postmark outbound (verified domain) + inbound `/hooks/postmark` (signature first) → Intake email channel, with the synthetic refusal before any model step (Intake (h))
5. [ ] Magic-link email outside dev + per-IP rate limit on sign-in and demo login
6. [ ] Pipeline agent: Slack cards + signed interactive buttons (`/hooks/slack`) + weekly digest
7. [ ] CRM adapters behind `CrmAdapter`: HubSpot, Airtable, Google Sheets. Sync failure → integration `ERROR` + admin banner + backoff
8. [ ] HMAC-signed outbound webhooks
9. [ ] Integrations screen: connect, status, last error, encrypted credentials
10. [ ] Spend-cap alert to admins via Slack/email (M4 follow-up)

Every adapter is tested against recorded provider responses and official signature test vectors, so it is finished before you have the keys.

**Done when:** with keys pasted, an approved message sends, a Slack card's Advance button moves the deal, and the deal appears in HubSpot. Without keys, each integration shows "Not connected".

### Phase 5: Diligence, public API and the control screens (6–7 days)

1. [ ] Diligence agent: founder upload page (private link), XLSX parsing, claim checks (plain code), checklist. Coordinator condition `to = DILIGENCE`
2. [ ] Workspace API keys (hashed, scoped, revocable) + `/v1` routes (§17), including `POST /v1/agents/{agent}/runs` on a file directly
3. [ ] Synthetic-workspace refusal on every remaining deal-creating path (upload, `/v1`), with a test per path
4. [ ] **Agents page**: the seven numbered cards with switches, settings and last runs. Dependency rules (§8.3) validated on save
5. [ ] Settings (workspace config §13, members), Run inspector (steps, inputs, outputs, tokens, cost, versions), Audit log
6. [ ] `users.manage`: removing a membership deletes sessions in the same transaction. Workspace switcher for multi-membership users

**Done when:** turning Research off on the Agents page visibly changes what happens to the next pitch, and an external script can screen a deck through `/v1` alone.

### Phase 6: Evaluation, hardening, launch (6–8 days)

1. [ ] Synthetic dataset: 30 decks (incl. hostile ones), 5 data rooms, 10 emails, labels (§20.1)
2. [ ] Eval harness (`pnpm eval`) + first report in `eval/reports/`; eval smoke in CI
3. [ ] Sentry with scrubbing (SQL, prompts, presigned signatures)
4. [ ] Sweeper for expired pending uploads / rate-limit rows (decide: R2 lifecycle rule vs web route)
5. [ ] Deploy (§21): arm64 images, Docker Compose (Postgres, Caddy with `X-Forwarded-For` + body limit), R2, GitHub Actions deploy over SSH, nightly reset cron
6. [ ] Demo mode: form + uploads off, re-runs only on bundled decks, recorded Research, config-save guard, demo denied `integrations.manage` / `users.manage`
7. [ ] Public landing / case study page in the new style (§23.1 item 3): problem figures, the agent map, eval results, the hostile-deck defence, screenshots
8. [ ] README (§23.2), 90-second video, Upwork entry (§23.3)

**Done when:** the live demo URL works with one-click logins, 30 screened deals exist, and the README, video and case study are published.

**Total: about 31–39 working days** (6–8 weeks solo). The design doc's 4-week figure assumed two engineers in parallel.

---

## 5. Accounts and keys you'll need to provide

The code for each is finished first. These are only needed to run it live.

| Service | What to create | Needed for | Phase |
|---|---|---|---|
| Google Gemini | Free-tier key (synthetic demo); **paid** key for Research grounding and client data | Screening, Research, Memo | 2 (free), 3 (paid for live grounding) |
| Cloudflare R2 | Dev bucket + prod bucket, CORS per `.env.example`, read-only worker token | Decks, data rooms | already partly set, 2 |
| Postmark | Server token, verified sender domain (DKIM/Return-Path), inbound stream + webhook URL | Comms, email intake, magic links | 4 |
| Slack | App with bot token, signing secret, interactivity URL, a test workspace | Pipeline cards, approvals, digest | 4 |
| HubSpot | Private app token on a free developer/test account | CRM sync | 4 |
| Airtable | Personal access token + a test base | CRM sync | 4 |
| Google Sheets | Service account JSON + a shared test sheet | CRM sync | 4 |
| Sentry | Project DSN | Error tracking | 6 |
| Oracle Cloud | Always Free arm64 VM + SSH key for GitHub Actions | Demo deploy | 6 |
| Domain | Demo domain + DNS (Caddy HTTPS, Postmark records) | Deploy, email | 6 |

New env names are added to `packages/schemas/env.ts` and `.env.example` as each slice lands.

---

## 6. Decisions needed from you

1. **Visual direction** (§3): approve the mockup at the Phase 1 checkpoint. Main question: is the app shell's top bar dark charcoal (closest to the reference) or light (calmer for long sessions)?
2. **Where the case study lives**: inside Shortlist's public landing page, on the Swisk site, or both.
3. **Pending-upload sweeper**: an R2 lifecycle rule (simplest) or a web-side scheduled route.
4. **Form "belongs to the fund" 400**: keep the distinct message or use the generic refusal (Intake (m)).

---

## 7. Finished means

- Every §24 "Done when" row is true, and every `[ ]` in `progress.md` is either done or moved to a "post-v1" list with a reason.
- The §23.1 demo script runs on the live URL: upload a sample deck, get a cited and scored memo in under a minute, then switch an agent off and watch the flow adapt.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm eval` all pass in CI.
