import type { FundEmails } from "@shortlist/schemas";
import { eq } from "drizzle-orm";
import { db, single, type Executor } from "../client";
import { membership, user, workspace } from "../schema";

export type Workspace = typeof workspace.$inferSelect;

// Creating a workspace has no workspaceId to scope by yet.
export async function createWorkspace(input: {
  slug: string;
  name: string;
  intakeAddress: string;
  // Stated on every create: a free-tier key runs synthetic workspaces only.
  synthetic: boolean;
}): Promise<Workspace> {
  const rows = await db().insert(workspace).values(input).returning();
  return single(rows, `workspace "${input.slug}"`);
}

// Resolves a public slug (pitch form, intake address) to its workspace.
export async function getWorkspaceBySlug(
  slug: string,
): Promise<Workspace | null> {
  const [row] = await db()
    .select()
    .from(workspace)
    .where(eq(workspace.slug, slug));
  return row ?? null;
}

export async function getWorkspace(workspaceId: string): Promise<Workspace> {
  const [row] = await db()
    .select()
    .from(workspace)
    .where(eq(workspace.id, workspaceId));
  if (row === undefined) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  return row;
}

// The fund's own email identity (§7.1): the domains of its intake address
// and of its members' emails, and its members' exact addresses, lowercased.
// Intake's rule (isFundEmail) decides which of these a founder email may not
// be; public mailbox domains are its call, not this query's.
export function getFundEmails(workspaceId: string): Promise<FundEmails> {
  return selectFundEmails(db(), workspaceId);
}

// Not exported from the package: Intake's narrow path (receivePitch) reads
// it in its transaction.
export async function selectFundEmails(
  q: Executor,
  workspaceId: string,
): Promise<FundEmails> {
  const [fund] = await q
    .select({ intakeAddress: workspace.intakeAddress })
    .from(workspace)
    .where(eq(workspace.id, workspaceId));
  if (fund === undefined) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  const members = await q
    .select({ email: user.email })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(membership.workspaceId, workspaceId));
  const addresses = members.map((m) => m.email.trim().toLowerCase());
  return {
    domains: new Set(
      [fund.intakeAddress.trim().toLowerCase(), ...addresses].map(emailDomain),
    ),
    addresses: new Set(addresses),
  };
}

function emailDomain(address: string): string {
  const at = address.lastIndexOf("@");
  if (at < 1 || at === address.length - 1) {
    throw new Error("Stored email address has no domain");
  }
  return address.slice(at + 1);
}
