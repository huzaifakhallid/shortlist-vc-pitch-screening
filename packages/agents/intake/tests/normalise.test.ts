import { describe, expect, it } from "vitest";
import { normalisedPitchSchema } from "../schema";
import { normaliseFormPitch } from "../steps/normalise";
import { formPayload } from "./fixtures";

describe("normaliseFormPitch", () => {
  it("normalises the website to a company domain and the founder email", () => {
    const payload = formPayload();
    const pitch = normaliseFormPitch(payload);
    expect(pitch).toEqual({
      channel: "form",
      companyDomain: { kind: "domain", domain: "larkspur.example" },
      founderEmail: "ana@larkspur.example",
      form: payload.form,
      deck: payload.deck,
    });
    expect(normalisedPitchSchema.parse(pitch)).toEqual(pitch);
  });

  it("records why a pitch has no company domain", () => {
    expect(
      normaliseFormPitch(formPayload({ website: null })).companyDomain,
    ).toEqual({ kind: "none", reason: "no_website" });
    expect(
      normaliseFormPitch(formPayload({ website: "https://notion.so/larkspur" }))
        .companyDomain,
    ).toEqual({ kind: "none", reason: "shared_host" });
  });

  it("fails, naming the field, for a website Intake's rules reject", () => {
    expect(() =>
      normaliseFormPitch(formPayload({ website: "https://10.0.0.1" })),
    ).toThrow("Website host is an IP address, not a domain");
  });

  it("fails, naming the field, for an email Intake's rules reject", () => {
    expect(() =>
      normaliseFormPitch(
        formPayload({ founderEmail: '"ana"@larkspur.example' }),
      ),
    ).toThrow("Founder email is not a valid address");
  });
});
