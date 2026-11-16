import type { WorkspaceConfig } from "@shortlist/schemas";
import type { DealProfile, MandateCheck, MandateResult } from "../schema";

type Filters = WorkspaceConfig["filters"];

// §7.2 step 5: the deal profile against the fund's filters. Plain code, no
// model. Rules:
// - Stage, sector and country pass when the value is in the fund's list.
//   Values match ignoring case and surrounding whitespace ("Seed" = "seed").
//   An empty list means the fund doesn't filter on that field: it passes,
//   even when the value is unknown.
// - Round size passes when min <= size <= max (both inclusive).
// - Exclusions fail when the sector is in the fund's excluded sectors. No
//   excluded sectors: it passes, even when the sector is unknown.
// - An unknown value (null) is "unknown", never "fail". "other" (a value
//   outside the fund's vocabulary, schema.ts) is known: it fails a filter.
// Outcome: any fail → outside (OUT_OF_MANDATE); otherwise any unknown →
// undetermined (NEEDS_REVIEW); otherwise inside. A decline therefore always
// rests on a value that is known.
export function checkMandate(
  profile: DealProfile,
  filters: Filters,
): MandateResult {
  const checks: MandateResult["checks"] = [
    inList("stage", "Stage", profile.stage, filters.stages),
    inList("sector", "Sector", profile.sector, filters.sectors),
    inList("country", "Country", profile.country, filters.countries),
    roundSize(profile.roundSizeUsd, filters.roundSizeUsd),
    exclusions(profile.sector, filters.excludedSectors),
  ];
  return { outcome: outcomeOf(checks), checks };
}

function outcomeOf(checks: readonly MandateCheck[]): MandateResult["outcome"] {
  if (checks.some((check) => check.status === "fail")) {
    return "outside";
  }
  if (checks.some((check) => check.status === "unknown")) {
    return "undetermined";
  }
  return "inside";
}

function inList<R extends "stage" | "sector" | "country">(
  rule: R,
  label: string,
  value: string | null,
  allowed: readonly string[],
): MandateCheck<R> {
  const field = label.toLowerCase();
  if (allowed.length === 0) {
    return { rule, status: "pass", reason: `The fund has no ${field} filter` };
  }
  if (value === null) {
    return {
      rule,
      status: "unknown",
      reason: `${label} could not be determined from the form or the deck`,
    };
  }
  if (allowed.some((item) => sameLabel(item, value))) {
    return {
      rule,
      status: "pass",
      reason: `${label} "${value}" is in the fund's ${field} list`,
    };
  }
  return {
    rule,
    status: "fail",
    reason: `${label} "${value}" is not in the fund's ${field} list (${allowed.join(", ")})`,
  };
}

function roundSize(
  value: number | null,
  range: Filters["roundSizeUsd"],
): MandateCheck<"roundSize"> {
  const rule = "roundSize";
  if (value === null) {
    return {
      rule,
      status: "unknown",
      reason: "Round size could not be determined from the form or the deck",
    };
  }
  if (value < range.min) {
    return {
      rule,
      status: "fail",
      reason: `Round size ${usd(value)} is below the fund's minimum of ${usd(range.min)}`,
    };
  }
  if (value > range.max) {
    return {
      rule,
      status: "fail",
      reason: `Round size ${usd(value)} is above the fund's maximum of ${usd(range.max)}`,
    };
  }
  return {
    rule,
    status: "pass",
    reason: `Round size ${usd(value)} is within the fund's range of ${usd(range.min)} to ${usd(range.max)}`,
  };
}

function exclusions(
  sector: string | null,
  excluded: readonly string[],
): MandateCheck<"exclusions"> {
  const rule = "exclusions";
  if (excluded.length === 0) {
    return { rule, status: "pass", reason: "The fund excludes no sectors" };
  }
  if (sector === null) {
    return {
      rule,
      status: "unknown",
      reason:
        "Sector could not be determined, so exclusions could not be checked",
    };
  }
  if (excluded.some((item) => sameLabel(item, sector))) {
    return {
      rule,
      status: "fail",
      reason: `Sector "${sector}" is excluded by the fund`,
    };
  }
  return {
    rule,
    status: "pass",
    reason: `Sector "${sector}" is not excluded by the fund`,
  };
}

function sameLabel(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function usd(amount: number): string {
  return usdFormat.format(amount);
}
