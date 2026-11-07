---
name: ui-design-system
description: Shortlist's YC-inspired visual design system - principles, tokens, typography, components with Tailwind recipes, screen layouts, states and copy rules. Use before building or changing any screen or component in apps/web.
paths: ["apps/web/**"]
---

# Shortlist UI: YC-inspired, quiet, list-first

The look is inspired by the Y Combinator website and startup directory: white space, plain type, rows instead of cards, small grey metadata, pill tags, one orange accent. It's a *style reference*, not a copy: never use YC's logo, name, wordmark or exact brand assets.

Reference files (open them before building a screen):
- `docs/ui/mockup.html`: static reference for Deals, Deal page, Agents, Approvals.
- `docs/ui/screens/*.png`: screenshots of those references at 1280px.
- `tokens.css` (this folder): the only colours, radii and fonts allowed.

## Principles

1. **Content first.** Company names, one-liners and scores carry the page. Chrome is minimal.
2. **Lists, not cards.** Deals, agents, approvals and runs are rows separated by hairlines. Cards only for the memo panel and the deck viewer.
3. **One accent.** Orange appears for the single primary action (one per screen header, or one per row in action lists like Approvals), the active nav/tab underline, switches that are on, and focus rings. Everything else is ink and grey.
4. **Flat.** 1px borders, no gradients, no shadows except menus/dialogs (`shadow-sm`).
5. **Plain words.** "Pitches", "Shortlisted", "Needs review". No jargon in the UI.
6. **Dense but calm.** 14px base text, generous row padding, wide margins.

## Tokens (Tailwind classes)

| Use | Class |
|---|---|
| Page background | `bg-background` |
| Sidebar, table header, section band | `bg-subtle` |
| Hover / selected row | `hover:bg-accent`, selected `bg-brand-soft` |
| Main text | `text-foreground` |
| Secondary text (one-liners) | `text-muted-foreground` |
| Meta (time, counts) | `text-faint-foreground` |
| Borders | `border-border` (all hairlines are `border` = 1px) |
| Primary button | `bg-primary text-primary-foreground hover:bg-primary-hover` |
| Brand mark / active underline / switch on | `bg-brand` / `border-brand` |
| Score ≥ 70 | `bg-success-soft text-success` |
| Score 50–69 | `bg-warning-soft text-warning` |
| Score < 50 | `bg-danger-soft text-danger` |

No raw hex values and no arbitrary values (`text-[13px]`, `p-[7px]`) in components.

## Typography (Inter)

| Element | Classes |
|---|---|
| Page title | `text-2xl font-semibold tracking-tight` |
| Page subtitle | `text-sm text-muted-foreground` |
| Section heading | `text-base font-semibold` |
| Body | `text-sm` |
| Row title (company) | `text-base font-semibold` |
| Meta | `text-xs text-faint-foreground` |
| Tag | `text-xs font-medium uppercase tracking-wide` |
| Numbers (scores, counts, money) | add `tabular` |

## Layout

- Top nav: full width, `h-14 border-b`, content `max-w-6xl mx-auto px-6`.
- Page content: `max-w-6xl mx-auto px-6 py-8`.
- Deals: left filter sidebar `w-60 shrink-0` + list `flex-1`. Sidebar is plain (no box), headings `text-xs font-semibold uppercase tracking-wide text-faint-foreground`.
- Deal page: two columns `grid grid-cols-12 gap-8`: memo `col-span-7`, deck viewer `col-span-5 sticky top-20`.
- Settings / forms: single column `max-w-2xl`.
- Mobile (< 768px): sidebar becomes a "Filters" sheet; deal page stacks deck viewer under the memo.
- Spacing on the 4px grid only (Tailwind default scale).

## Components

**TopNav**: wordmark "Shortlist" (`font-semibold`) with a small `bg-brand` dot; links Deals, Approvals (count badge), Agents, Settings. Active link: `text-foreground` + 2px `border-brand` underline; others `text-muted-foreground`. Right: workspace name + avatar initials.

**Button**: shadcn Button. Variants used: `default` (primary orange, one per screen), `outline` (secondary), `ghost` (row actions). Size `sm` in rows, `default` in headers.

**Tag**: `inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground bg-subtle`.

**ScorePill**: `inline-flex min-w-11 justify-center rounded-md px-2 py-1 text-base font-semibold tabular` + score colour classes. Label "score" underneath in meta style.

**DealRow** (the core pattern, like a directory listing):
```
[Avatar 44px]  Company name   Karachi, PK                 [86]
               One-line description in muted text         score
               [SEED] [FINTECH] [$1.5M ROUND]   Memo ready · 2d
```
Row: `flex gap-4 py-5 border-b hover:bg-accent px-3 -mx-3 rounded-md cursor-pointer`. Avatar: `size-11 rounded-md bg-subtle border grid place-items-center font-semibold text-muted-foreground` (company initial). Flags (hidden text, mismatch) as a `text-danger` icon + short label next to tags.

**CitationChip**: `inline-flex rounded border px-1.5 text-xs font-medium tabular text-primary hover:bg-brand-soft` with text "p.7". Clicking scrolls the deck viewer to that page and highlights the snippet with `bg-brand-soft`.

**Tabs**: underline style. `border-b`; active tab `text-foreground border-b-2 border-brand -mb-px`; others `text-muted-foreground`.

**AgentRow**: name (`font-semibold`), one-line job, meta line ("Last run 4 min ago · 148 runs this week"), dependency note in meta ("Needs Screening"), shadcn `Switch` on the right (`data-[state=checked]:bg-brand`).

**ApprovalRow**: recipient + company, message type tag, first two lines of the draft, actions `Edit` (ghost), `Discard` (ghost), `Approve & send` (default).

**Banner** (integrity flag, integration error): `rounded-md border px-4 py-3` with `bg-danger-soft text-danger border-danger/20`, one sentence and one action.

**EmptyState**: centred in the list area, one sentence + one action. E.g., "No pitches yet. Share your pitch form or forward your deal inbox." + "Copy form link".

## States (every screen)

- Loading: skeleton rows matching the row layout (`bg-muted animate-pulse`), never spinners in lists.
- Empty: EmptyState as above.
- Error: Banner with what failed and what to do ("Couldn't load deals. Retry").
- AI content: label "AI draft" + versions in meta ("config v4 · prompt v2").

## Copy

- Sentence case everywhere. Buttons are verbs: "Advance to first call", "Pass", "Approve & send".
- Numbers with units: "$12.4k MRR", "2d ago", "86 / 100".
- Never "AI decided"; say "Shortlist suggests" or "AI draft".

## Don't

- Don't add cards with shadows, gradients, coloured section backgrounds or icons in every row.
- Don't use the brand orange for text or large fills.
- Don't introduce a new colour, radius or font size; extend `tokens.css` and this file first if truly needed.
