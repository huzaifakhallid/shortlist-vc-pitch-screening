import { z } from "zod";

// The public pitch form's fields (§7.1, §18). One fixed set for every fund:
// §13 has no form-field settings. Intake reads them from the form.submitted
// payload; it normalises the website and founder email itself (§7.1).

// Characters no founder field may hold: C0 and C1 controls (newline aside,
// where a field allows it), bidirectional overrides and isolates, and
// zero-width characters. They can hide or reorder text a person reads.
const INVISIBLE =
  /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/;
const NEWLINE = 0x0a;

function isControl(code: number, newlines: boolean): boolean {
  if (code === NEWLINE) {
    return !newlines;
  }
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

function hasHiddenCharacters(value: string, newlines: boolean): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (isControl(value.charCodeAt(i), newlines)) {
      return true;
    }
  }
  return INVISIBLE.test(value);
}

const plain = (label: string, newlines = false) => ({
  error: `${label} contains characters that aren't allowed`,
  check: (value: string) => !hasHiddenCharacters(value, newlines),
});

const text = (label: string, max: number, newlines = false) => {
  const rule = plain(label, newlines);
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${String(max)} characters`)
    .refine(rule.check, rule.error);
};

export const pitchFormSchema = z.strictObject({
  companyName: text("Company name", 200),
  // Null when the founder leaves it empty (§7.1 "no company domain, no website").
  website: z
    .url({
      protocol: /^https?$/,
      error: "Website must be a full address, like https://acme.com",
    })
    .max(2048, "Website must be at most 2048 characters")
    .refine(plain("Website").check, plain("Website").error)
    .nullable(),
  // A textarea: the one field that may hold a line break.
  oneLiner: text("One-line description", 280, true),
  // The stated round size in US dollars; null when the founder leaves it empty.
  roundSizeUsd: z
    .int("Round size must be a whole number of dollars")
    .min(1, "Round size must be more than $0")
    .max(10_000_000_000, "Round size must be at most $10B")
    .nullable(),
  founderName: text("Your name", 200),
  founderEmail: z
    .email("Enter a valid email address")
    .max(320, "Email must be at most 320 characters")
    .refine(plain("Email").check, plain("Email").error),
});
export type PitchForm = z.infer<typeof pitchFormSchema>;

// The deck a form submission carries: the verified upload (§15.3). Intake
// stores the ETag with the submission so the worker reads exactly this object.
export const submittedDeckSchema = z.strictObject({
  objectKey: z.string().min(1),
  etag: z.string().min(1),
  sizeBytes: z.int().positive(),
});
export type SubmittedDeck = z.infer<typeof submittedDeckSchema>;
