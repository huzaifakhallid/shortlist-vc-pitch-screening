---
name: add-integration
description: How to add or change a Shortlist integration - CRM adapter interface, inbound webhook verification, encrypted credentials, error states, tests. Use for Postmark, Slack, HubSpot, Airtable, Google Sheets, Affinity, Attio or outbound webhooks.
---

# Integrations

Source: `docs/design.md` §16, §15.1.

## Layout

```
packages/integrations/<provider>/
  client.ts       thin HTTP client; base URL, auth header, error mapping
  adapter.ts      implements the shared interface
  verify.ts       inbound signature verification (if the provider sends webhooks)
  schema.ts       Zod schemas for provider payloads we read
  tests/          fixtures + unit tests
```

## Interfaces

```ts
interface CrmAdapter {
  upsertCompany(c: CompanyRecord): Promise<ExternalId>;
  upsertDeal(d: DealRecord, companyId: ExternalId): Promise<ExternalId>;
}

interface ChatAdapter {
  postDealCard(card: DealCard): Promise<MessageRef>;
  postDigest(digest: Digest): Promise<MessageRef>;
}

interface EmailSender {
  send(msg: ApprovedMessage): Promise<ProviderMessageId>;   // only ApprovedMessage is accepted
}
```

`ApprovedMessage` is a branded type created only by the approval state machine, so unapproved drafts can't be sent (compile-time guarantee).

## Rules

- Read the provider's current docs for every endpoint and the signature scheme; cite the URL in a comment.
- Inbound: verify signature → parse with Zod → act. Invalid → 401 + log reason.
- Credentials encrypted with AES-256-GCM using `INTEGRATION_KEY` from env; decrypted only inside the adapter.
- Errors map to `IntegrationError { provider, status, message }`. The caller marks `integration.status = "ERROR"` with `last_error`, and pg-boss retries with backoff. No fallback provider.
- Store external IDs in `external_link` so syncs are updates, not duplicates.

## Tests

- Signature: valid / invalid / missing / stale timestamp.
- Adapter: recorded fixtures for create, update, provider error.
- Sandbox script `pnpm test:integrations` runs live only when sandbox credentials exist, otherwise prints which ones are missing.
