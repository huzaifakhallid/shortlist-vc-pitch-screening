import { describe, expect, it } from "vitest";
import { eventSchema } from "../src/events";
import { pitchFormSchema } from "../src/pitch";
import { validPitchForm } from "./pitch.fixture";

describe("pitchFormSchema", () => {
  it("accepts a full pitch and one without website or round size", () => {
    expect(pitchFormSchema.parse(validPitchForm())).toEqual(validPitchForm());
    const minimal = { ...validPitchForm(), website: null, roundSizeUsd: null };
    expect(pitchFormSchema.parse(minimal)).toEqual(minimal);
  });

  it("trims text fields and refuses empty ones", () => {
    expect(
      pitchFormSchema.parse({ ...validPitchForm(), companyName: "  Acme " })
        .companyName,
    ).toBe("Acme");
    const result = pitchFormSchema.safeParse({
      ...validPitchForm(),
      oneLiner: "   ",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "One-line description is required",
    );
  });

  it("takes only an http(s) website and a valid email", () => {
    for (const website of [
      "acme.com",
      "ftp://acme.com",
      "javascript:alert(1)",
    ]) {
      expect(
        pitchFormSchema.safeParse({ ...validPitchForm(), website }).success,
      ).toBe(false);
    }
    expect(
      pitchFormSchema.safeParse({ ...validPitchForm(), founderEmail: "omar@" })
        .success,
    ).toBe(false);
  });

  it("refuses unknown fields and a fractional round size", () => {
    expect(
      pitchFormSchema.safeParse({ ...validPitchForm(), extra: "x" }).success,
    ).toBe(false);
    expect(
      pitchFormSchema.safeParse({ ...validPitchForm(), roundSizeUsd: 1.5 })
        .success,
    ).toBe(false);
  });

  it("refuses control, bidi and zero-width characters", () => {
    // NUL, BEL, tab, CR, NEL, RLO, LRI, ZWSP, RLM, BOM.
    const hidden = [
      0x00, 0x07, 0x09, 0x0d, 0x85, 0x202e, 0x2066, 0x200b, 0x200f, 0xfeff,
    ].map((code) => String.fromCharCode(code));
    for (const ch of hidden) {
      for (const field of ["companyName", "oneLiner", "founderName"]) {
        const result = pitchFormSchema.safeParse({
          ...validPitchForm(),
          [field]: `Ledger${ch}line`,
        });
        expect(
          result.success,
          `${field} with U+${ch.charCodeAt(0).toString(16)}`,
        ).toBe(false);
      }
    }
    expect(
      pitchFormSchema.safeParse({
        ...validPitchForm(),
        founderEmail: `omar${String.fromCharCode(0x200b)}@ledgerline.example`,
      }).success,
    ).toBe(false);
    expect(
      pitchFormSchema.safeParse({
        ...validPitchForm(),
        website: `https://ledger${String.fromCharCode(0x202e)}line.example`,
      }).success,
    ).toBe(false);
  });

  it("allows a line break in the one-liner only", () => {
    expect(
      pitchFormSchema.safeParse({
        ...validPitchForm(),
        oneLiner: "Reconciliation for\nGulf processors.",
      }).success,
    ).toBe(true);
    const result = pitchFormSchema.safeParse({
      ...validPitchForm(),
      companyName: "Ledger\nline",
    });
    expect(result.error?.issues[0]?.message).toBe(
      "Company name contains characters that aren't allowed",
    );
  });
});

describe("form.submitted", () => {
  it("carries the form and the verified deck", () => {
    const event = {
      type: "form.submitted",
      payload: {
        form: validPitchForm(),
        deck: {
          objectKey: "workspaces/w/decks/d.pdf",
          etag: '"abc"',
          sizeBytes: 1024,
        },
      },
    };
    expect(eventSchema.parse(event)).toEqual(event);
    expect(
      eventSchema.safeParse({ type: "form.submitted", payload: {} }).success,
    ).toBe(false);
  });
});
