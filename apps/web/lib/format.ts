// Display formats for numbers, times and labels (ui-design-system: numbers
// with units, "$12.4k", "2d ago").

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function trimmed(value: number): string {
  return String(Math.round(value * 10) / 10);
}

// "$1.5M", "$600k", "$900".
export function formatUsd(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${trimmed(amount / 1_000_000)}M`;
  }
  if (amount >= 1_000) {
    return `$${trimmed(amount / 1_000)}k`;
  }
  return `$${String(amount)}`;
}

// "just now", "12 min ago", "5h ago", "2d ago".
export function timeAgo(date: Date, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - date.getTime());
  if (elapsed < 60_000) {
    return "just now";
  }
  if (elapsed < HOUR_MS) {
    return `${String(Math.floor(elapsed / 60_000))} min ago`;
  }
  if (elapsed < DAY_MS) {
    return `${String(Math.floor(elapsed / HOUR_MS))}h ago`;
  }
  return `${String(Math.floor(elapsed / DAY_MS))}d ago`;
}

const regions = new Intl.DisplayNames(["en"], { type: "region" });

// "PK" → "Pakistan". Profile countries are ISO 3166-1 alpha-2 codes
// (dealProfileSchema), so a code Intl can't name is a bug.
export function countryName(code: string): string {
  const name = regions.of(code);
  if (name === undefined) {
    throw new Error(`No country name for code "${code}"`);
  }
  return name;
}

// A fund's own vocabulary value ("pre-seed", "devtools") in sentence case.
export function labelOf(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// The first letter of a company name, for its avatar.
export function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}
