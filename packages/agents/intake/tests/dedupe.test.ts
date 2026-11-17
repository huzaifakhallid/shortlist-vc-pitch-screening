import { describe, expect, it } from "vitest";
import {
  dedupeDecisionSchema,
  type CompanyDomain,
  type DuplicateCandidates,
} from "../schema";
import {
  companyDomain,
  decideDuplicate,
  normalizeDomain,
  normalizeEmail,
  SHARED_HOSTS,
  type DedupeInput,
} from "../steps/dedupe";

describe("normalizeDomain", () => {
  it.each([
    ["acme.com", "acme.com"],
    ["  Acme.COM  ", "acme.com"],
    ["https://www.acme.com/about?ref=x#team", "acme.com"],
    ["http://acme.com:8080/", "acme.com"],
    ["HTTPS://WWW.Acme.io", "acme.io"],
    ["www.acme.co.uk", "acme.co.uk"],
    ["acme.com.", "acme.com"],
    ["bücher.example", "xn--bcher-kva.example"],
  ])("normalizes %j to %j", (website, domain) => {
    expect(normalizeDomain(website)).toBe(domain);
  });

  it("keeps subdomains other than one leading www", () => {
    expect(normalizeDomain("app.acme.com")).toBe("app.acme.com");
    expect(normalizeDomain("acme.notion.site")).toBe("acme.notion.site");
    expect(normalizeDomain("www.www.acme.com")).toBe("www.acme.com");
  });

  it("keeps www when it is the name itself", () => {
    expect(normalizeDomain("www.io")).toBe("www.io");
  });

  it.each([
    "",
    "   ",
    "acme .com",
    "ftp://acme.com",
    "mailto:ana@acme.com",
    "https://user:pw@acme.com",
  ])("rejects %j as not an http(s) address", (website) => {
    expect(() => normalizeDomain(website)).toThrow(
      "Website is not a valid http(s) address",
    );
  });

  it.each(["http://192.168.0.1", "https://[::1]/", "10.0.0.1"])(
    "rejects the IP address %j",
    (website) => {
      expect(() => normalizeDomain(website)).toThrow(
        "Website host is an IP address, not a domain",
      );
    },
  );

  it.each(["localhost", "https://acme", "acme..com"])(
    "rejects %j as not a domain name",
    (website) => {
      expect(() => normalizeDomain(website)).toThrow(
        "Website host is not a domain name",
      );
    },
  );

  it("never puts the website in the error", () => {
    expect(() => normalizeDomain("ftp://secret-co.com")).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("secret-co") as unknown,
      }),
    );
  });
});

describe("companyDomain", () => {
  it("is the normalized domain for a company website", () => {
    expect(companyDomain("https://www.acme.com/team")).toEqual({
      kind: "domain",
      domain: "acme.com",
    });
  });

  it("says there is no website", () => {
    expect(companyDomain(null)).toEqual({ kind: "none", reason: "no_website" });
  });

  it.each([...SHARED_HOSTS])(
    "treats %s (and www.) as a shared host",
    (host) => {
      const shared = { kind: "none", reason: "shared_host" };
      expect(companyDomain(`https://${host}/acme`)).toEqual(shared);
      expect(companyDomain(`https://www.${host}/acme`)).toEqual(shared);
    },
  );

  it("treats subdomains of a shared host as shared", () => {
    expect(companyDomain("acme.substack.com")).toEqual({
      kind: "none",
      reason: "shared_host",
    });
    expect(companyDomain("m.facebook.com/acme")).toEqual({
      kind: "none",
      reason: "shared_host",
    });
  });

  it("doesn't treat a domain that merely ends the same way as shared", () => {
    expect(companyDomain("mygithub.com")).toEqual({
      kind: "domain",
      domain: "mygithub.com",
    });
    expect(companyDomain("google.com")).toEqual({
      kind: "domain",
      domain: "google.com",
    });
  });

  it("throws for an invalid website", () => {
    expect(() => companyDomain("ftp://acme.com")).toThrow(
      "Website is not a valid http(s) address",
    );
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ana.Founder@Acme.COM ")).toBe(
      "ana.founder@acme.com",
    );
  });

  it("keeps plus tags, dots and other dot-atom characters", () => {
    expect(normalizeEmail("ana+deck@acme.com")).toBe("ana+deck@acme.com");
    expect(normalizeEmail("a.n.a@gmail.com")).toBe("a.n.a@gmail.com");
    expect(normalizeEmail("o'neil_{x}@mail.acme-labs.io")).toBe(
      "o'neil_{x}@mail.acme-labs.io",
    );
  });

  it.each([
    "",
    "ana",
    "ana.acme.com",
    "ana@",
    "@acme.com",
    "ana@acme",
    "a@b@acme.com",
    "a na@acme.com",
    "ana,bo@acme.com",
    "<ana@acme.com>",
    "Ana <ana@acme.com>",
    '"ana"@acme.com',
    "ana(x)@acme.com",
    "ana​@acme.com",
    "ana@acme​.com",
    "anä@acme.com",
    "ana@bücher.example",
    ".ana@acme.com",
    "ana.@acme.com",
    "a..na@acme.com",
    "ana@-acme.com",
    "ana@acme..com",
  ])("rejects %j without naming it", (email) => {
    expect(() => normalizeEmail(email)).toThrow(
      /^Founder email is not a valid address$/,
    );
  });
});

describe("decideDuplicate", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  const domainDeal = "11111111-1111-4111-8111-111111111111";
  const emailDeal = "22222222-2222-4222-8222-222222222222";
  const company = "33333333-3333-4333-8333-333333333333";
  const acme: CompanyDomain = { kind: "domain", domain: "acme.com" };
  const noWebsite: CompanyDomain = { kind: "none", reason: "no_website" };
  const sharedHost: CompanyDomain = { kind: "none", reason: "shared_host" };

  function daysAgo(days: number): Date {
    return new Date(now.getTime() - days * day);
  }

  function domainMatch(founderEmailOnDeal: boolean) {
    return { companyId: company, dealId: domainDeal, founderEmailOnDeal };
  }

  function emailMatch(submittedAt: Date) {
    return { dealId: emailDeal, submittedAt };
  }

  function decide(
    domain: CompanyDomain,
    candidates: DuplicateCandidates,
    overrides: Partial<DedupeInput> = {},
  ) {
    const decision = decideDuplicate({
      companyDomain: domain,
      founderEmail: "ana@acme.com",
      excludedEmailDomains: new Set(["kestrel.vc", "in.shortlist.dev"]),
      candidates,
      now,
      ...overrides,
    });
    // Every decision is a valid step output, and shows the company domain.
    expect(dedupeDecisionSchema.parse(decision)).toEqual(decision);
    expect(decision.companyDomain).toEqual(domain);
    return decision.match;
  }

  it("is new when nothing matches", () => {
    expect(decide(acme, { byDomain: null, byEmail: null })).toEqual({
      kind: "new",
    });
    expect(decide(noWebsite, { byDomain: null, byEmail: null })).toEqual({
      kind: "new",
    });
  });

  describe("with a company domain", () => {
    it("links a domain match when the email is on the company domain", () => {
      expect(
        decide(acme, { byDomain: domainMatch(false), byEmail: null }),
      ).toEqual({
        kind: "resubmission",
        dealId: domainDeal,
        matchedBy: "domain",
      });
    });

    it("links a domain match when the email is on an earlier submission", () => {
      expect(
        decide(
          acme,
          { byDomain: domainMatch(true), byEmail: null },
          { founderEmail: "ana@gmail.com" },
        ),
      ).toEqual({
        kind: "resubmission",
        dealId: domainDeal,
        matchedBy: "domain",
      });
    });

    it("makes a domain match from an unknown outside email a possible duplicate", () => {
      expect(
        decide(
          acme,
          { byDomain: domainMatch(false), byEmail: null },
          { founderEmail: "mallory@gmail.com" },
        ),
      ).toEqual({ kind: "possible_duplicate", dealId: domainDeal });
    });

    it("treats a subdomain email as outside the company domain", () => {
      expect(
        decide(
          acme,
          { byDomain: domainMatch(false), byEmail: null },
          { founderEmail: "ana@mail.acme.com" },
        ),
      ).toEqual({ kind: "possible_duplicate", dealId: domainDeal });
    });

    it("prefers the domain match over an email match", () => {
      expect(
        decide(acme, {
          byDomain: domainMatch(false),
          byEmail: emailMatch(daysAgo(1)),
        }),
      ).toEqual({
        kind: "resubmission",
        dealId: domainDeal,
        matchedBy: "domain",
      });
    });

    it("is new when only a recent email match points at another company's deal", () => {
      expect(
        decide(acme, { byDomain: null, byEmail: emailMatch(daysAgo(1)) }),
      ).toEqual({ kind: "new" });
    });
  });

  describe("without a usable company domain", () => {
    it.each([
      [noWebsite, 0],
      [noWebsite, 1],
      [noWebsite, 89],
      [noWebsite, 90],
      [sharedHost, 30],
    ])("links an email match (%j, %i days ago)", (domain, days) => {
      expect(
        decide(domain, { byDomain: null, byEmail: emailMatch(daysAgo(days)) }),
      ).toEqual({
        kind: "resubmission",
        dealId: emailDeal,
        matchedBy: "email",
      });
    });

    it("is new when the email match is older than 90 days", () => {
      expect(
        decide(noWebsite, {
          byDomain: null,
          byEmail: emailMatch(new Date(daysAgo(90).getTime() - 1)),
        }),
      ).toEqual({ kind: "new" });
    });

    it("links an email match timestamped after now (clock skew)", () => {
      expect(
        decide(noWebsite, {
          byDomain: null,
          byEmail: emailMatch(new Date(now.getTime() + 5)),
        }),
      ).toEqual({
        kind: "resubmission",
        dealId: emailDeal,
        matchedBy: "email",
      });
    });

    it("fails when the candidates have a domain match anyway", () => {
      expect(() =>
        decideDuplicate({
          companyDomain: sharedHost,
          founderEmail: "ana@acme.com",
          excludedEmailDomains: new Set(),
          candidates: { byDomain: domainMatch(true), byEmail: null },
          now,
        }),
      ).toThrow("Dedupe candidates have a domain match without a domain");
    });
  });

  it.each([
    "partner@kestrel.vc",
    "pitches+kestrel@in.shortlist.dev",
    "a@eu.kestrel.vc",
  ])(
    "fails for a founder email on the fund's own domains (%s)",
    (founderEmail) => {
      expect(() =>
        decideDuplicate({
          companyDomain: acme,
          founderEmail,
          excludedEmailDomains: new Set(["kestrel.vc", "in.shortlist.dev"]),
          candidates: { byDomain: null, byEmail: null },
          now,
        }),
      ).toThrow(/^Founder email is on one of the fund's own domains$/);
    },
  );
});
