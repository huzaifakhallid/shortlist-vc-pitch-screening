import { eq } from "drizzle-orm";
import { db, single } from "../client";
import { workspace } from "../schema";

export type Workspace = typeof workspace.$inferSelect;

// Creating a workspace has no workspaceId to scope by yet.
export async function createWorkspace(input: {
  slug: string;
  name: string;
  intakeAddress: string;
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
