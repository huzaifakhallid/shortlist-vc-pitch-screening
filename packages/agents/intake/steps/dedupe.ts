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
  // The fund's own email domains (its intake address's domain, its members'
  // domains), passed in by the caller. A pitch from one is a forwarding or
  // configuration mistake, never a founder.
  excludedEmailDomains: ReadonlySet<string>;
  candidates: DuplicateCandidates;
  // The database's clock (the time the candidates were read), never the
  // worker's: submission timestamps are the database's.
  now: Date;
};

// The decision from what the dedupe query found:
// - A founder email on one of the fund's own domains fails, visibly.
// - The pitch states a company domain: a domain match links to that
//   company's latest deal when the founder email is on the company domain or
//   on an earlier submission of that deal; otherwise it is a possible
//   duplicate for a partner to confirm (someone else could be claiming the
//   company). No domain match is a new deal: the email rule never overrides
//   a stated domain.
// - No usable company domain: an email match counts when its submission is
//   at most 90 days before `now` (inclusive; a timestamp after `now` counts).
export function decideDuplicate(input: DedupeInput): DedupeDecision {
  const { candidates, companyDomain: domain, founderEmail, now } = input;
  const emailDomain = founderEmail.slice(founderEmail.lastIndexOf("@") + 1);
  if (isWithin(emailDomain, input.excludedEmailDomains)) {
    throw new Error("Founder email is on one of the fund's own domains");
  }

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
