import type { Role } from "@shortlist/schemas";

// The fictional Kestrel Ventures demo fund. The seed creates these people and
// the web app's one-click demo logins sign in as them (§23.1), so both read
// this one list. Exported as "@shortlist/db/demo".
export const DEMO_SLUG = "kestrel";

// One per §6 role, plus a second partner so routing splits.
export const DEMO_MEMBERS = {
  amara: {
    email: "amara.qureshi@kestrel.example",
    name: "Amara Qureshi",
    role: "partner",
  },
  daniel: {
    email: "daniel.okafor@kestrel.example",
    name: "Daniel Okafor",
    role: "partner",
  },
  sana: {
    email: "sana.mirza@kestrel.example",
    name: "Sana Mirza",
    role: "analyst",
  },
  leo: {
    email: "leo.varga@kestrel.example",
    name: "Leo Varga",
    role: "admin",
  },
} as const satisfies Record<
  string,
  { email: string; name: string; role: Role }
>;

export type DemoMemberKey = keyof typeof DEMO_MEMBERS;
