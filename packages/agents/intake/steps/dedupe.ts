import type { FundEmails } from "@shortlist/schemas";
import type {
  CompanyDomain,
  DedupeDecision,
  DuplicateCandidates,
} from "../schema";

// §7.1 "Duplicates", as plain code, read conservatively so unrelated pitches
// are never merged. Errors name the field, never its value (founder content,
// llm-call skill).

const EMAIL_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

// Hosts where many companies share one domain (profile, document and link
// pages). A website on one of them, or on a subdomain of one, says nothing
// about the company's own domain.
export const SHARED_HOSTS: ReadonlySet<string> = new Set([
  "linktr.ee",
  "linkedin.com",
  "github.com",
  "notion.so",
  "sites.google.com",
  "docs.google.com",
  "drive.google.com",
  "docsend.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "medium.com",
  "substack.com",
  "wellfound.com",
  "angel.co",
  "producthunt.com",
  "canva.site",
  "pitch.com",
  "bit.ly",
  "youtube.com",
  "dropbox.com",
]);

// Mailbox providers anyone can sign up to. A member on one of them says
// nothing about who else uses it, so these never count as the fund's own
// domains (isFundEmail); the member's exact address still does.
export const PUBLIC_MAILBOX_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "zoho.com",
  "fastmail.com",
  "hey.com",
  // Common country variants and regional providers.
  "hotmail.co.uk",
  "hotmail.fr",
  "hotmail.de",
  "outlook.de",
  "outlook.fr",
  "live.co.uk",
  "yahoo.co.uk",
  "yahoo.fr",
  "yahoo.de",
  "yahoo.co.in",
  "yahoo.co.jp",
  "ymail.com",
  "pm.me",
  "gmx.de",
  "gmx.net",
  "web.de",
  "mail.com",
  "yandex.ru",
  "yandex.com",
  "mail.ru",
  "qq.com",
  "163.com",
  "126.com",
  "naver.com",
]);

// A founder email (normalized) that belongs to the fund: one of its members'
// exact addresses, or on its intake domain or a member's email domain (or a
// subdomain of one), public mailbox domains excepted. A pitch from one is a
// forwarding or setup mistake, never a founder.
export function isFundEmail(founderEmail: string, fund: FundEmails): boolean {
  if (fund.addresses.has(founderEmail)) {
    return true;
  }
  const own = new Set(
    [...fund.domains].filter((d) => !PUBLIC_MAILBOX_DOMAINS.has(d)),
  );
  return isWithin(founderEmail.slice(founderEmail.lastIndexOf("@") + 1), own);
}

// The company's website as stated ("https://www.Acme.com/about", "acme.com")
// → its host: lowercase (IDN in punycode), no scheme, port, path, query,
// trailing dot or one leading "www.". Subdomains are kept: "app.acme.com" and
// "acme.com" are different domains, since merging them needs a public-suffix
// list. Throws when the website isn't an http(s) address with a dotted host
// name, or carries credentials ("mailto:ana@acme.com" would otherwise parse
// as one). A normalized host is not a safe host to fetch: it may resolve to a
// private address.
export function normalizeDomain(website: string): string {
  const trimmed = website.trim();
  if (trimmed === "" || /\s/.test(trimmed)) {
    throw new Error("Website is not a valid http(s) address");
  }
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  if (!URL.canParse(withScheme)) {
    throw new Error("Website is not a valid http(s) address");
  }
  const url = new URL(withScheme);
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("Website is not a valid http(s) address");
  }
  const host = url.hostname.replace(/\.$/, "");
  if (host.startsWith("[") || /^[\d.]+$/.test(host)) {
    throw new Error("Website host is an IP address, not a domain");
  }
  const domain =
    host.startsWith("www.") && host.slice(4).includes(".")
      ? host.slice(4)
      : host;
  if (!domain.includes(".") || domain.split(".").some((label) => !label)) {
    throw new Error("Website host is not a domain name");
  }
  return domain;
}

// The pitch's company domain, or why it has none: no website stated, or a
// website on a shared host. Throws for an invalid website (normalizeDomain).
export function companyDomain(website: string | null): CompanyDomain {
  if (website === null) {
    return { kind: "none", reason: "no_website" };
  }
  const domain = normalizeDomain(website);
  if (isWithin(domain, SHARED_HOSTS)) {
    return { kind: "none", reason: "shared_host" };
  }
  return { kind: "domain", domain };
}

// RFC 5322 dot-atom: atext runs separated by single dots. ASCII only, so
// quotes, commas, angle brackets, parentheses, spaces and zero-width or other
// non-ASCII characters are rejected.
const ATEXT = "[a-z0-9!#$%&'*+/=?^_`{|}~-]+";
const LOCAL_PART = new RegExp(`^${ATEXT}(?:\\.${ATEXT})*$`);
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

// The founder's email as stated → trimmed and lowercased. Plus tags and dots
// are kept: "ana+fund@x.com" and "ana@x.com" stay different addresses.
// Throws unless it is one dot-atom local part, "@", and a domain of two or
// more letter-digit-hyphen labels.
export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.indexOf("@");
  const labels = normalized.slice(at + 1).split(".");
  if (
    at < 1 ||
    at !== normalized.lastIndexOf("@") ||
    !LOCAL_PART.test(normalized.slice(0, at)) ||
    labels.length < 2 ||
    !labels.every((label) => DOMAIN_LABEL.test(label))
  ) {
    throw new Error("Founder email is not a valid address");
  }
  return normalized;
}

export type DedupeInput = {
  companyDomain: CompanyDomain;
  // Normalized (normalizeEmail).
  founderEmail: string;
  // The fund's own email identity (getFundEmails), passed in by the caller.
  fundEmails: FundEmails;
  candidates: DuplicateCandidates;
  // The database's clock (the time the candidates were read), never the
  // worker's: submission timestamps are the database's.
  now: Date;
};

export const FUND_EMAIL_ERROR = "Founder email belongs to the fund";

// The decision from what the dedupe query found:
// - A founder email that belongs to the fund (isFundEmail) fails, visibly.
// - The pitch states a company domain: a domain match links to that
//   company's latest deal when the founder email is on the company domain or
//   on an earlier submission of that deal. Otherwise it is a possible
//   duplicate for a partner to confirm (someone else could be claiming the
//   company), unless this founder email already has an open possible
//   duplicate of that deal: the pitch joins that held deal. No domain match
//   is a new deal: the email rule never overrides a stated domain.
// - No usable company domain: an email match counts when its submission is
//   at most 90 days before `now` (inclusive; a timestamp after `now` counts).
// A resubmission says whether its deal is held (a possible duplicate waiting
// for a partner), which decides its events (steps/receive.ts).
export function decideDuplicate(input: DedupeInput): DedupeDecision {
  const { candidates, companyDomain: domain, founderEmail, now } = input;
  if (isFundEmail(founderEmail, input.fundEmails)) {
    throw new Error(FUND_EMAIL_ERROR);
  }
  const emailDomain = founderEmail.slice(founderEmail.lastIndexOf("@") + 1);

  if (domain.kind === "domain") {
    const byDomain = candidates.byDomain;
    if (byDomain === null) {
      return { companyDomain: domain, match: { kind: "new" } };
    }
    if (emailDomain === domain.domain || byDomain.founderEmailOnDeal) {
      return {
        companyDomain: domain,
        match: {
          kind: "resubmission",
          dealId: byDomain.dealId,
          matchedBy: "domain",
          held: byDomain.held,
        },
      };
    }
    if (byDomain.openClaimDealId !== null) {
      return {
        companyDomain: domain,
        match: {
          kind: "resubmission",
          dealId: byDomain.openClaimDealId,
          matchedBy: "open_claim",
          held: true,
        },
      };
    }
    return {
      companyDomain: domain,
      match: { kind: "possible_duplicate", dealId: byDomain.dealId },
    };
  }

  if (candidates.byDomain !== null) {
    throw new Error("Dedupe candidates have a domain match without a domain");
  }
  const byEmail = candidates.byEmail;
  if (
    byEmail !== null &&
    now.getTime() - byEmail.submittedAt.getTime() <= EMAIL_WINDOW_MS
  ) {
    return {
      companyDomain: domain,
      match: {
        kind: "resubmission",
        dealId: byEmail.dealId,
        matchedBy: "email",
        held: byEmail.held,
      },
    };
  }
  return { companyDomain: domain, match: { kind: "new" } };
}

// The domain is one of `domains` or a subdomain of one.
function isWithin(domain: string, domains: ReadonlySet<string>): boolean {
  for (let d = domain; d.includes("."); d = d.slice(d.indexOf(".") + 1)) {
    if (domains.has(d)) {
      return true;
    }
  }
  return false;
}
