import type { PitchForm } from "../src/pitch";

// A valid public-form pitch (synthetic).
export function validPitchForm(): PitchForm {
  return {
    companyName: "Ledgerline",
    website: "https://ledgerline.example",
    oneLiner: "Reconciliation infrastructure for Gulf payment processors.",
    roundSizeUsd: 1_500_000,
    founderName: "Omar Haddad",
    founderEmail: "omar@ledgerline.example",
  };
}
