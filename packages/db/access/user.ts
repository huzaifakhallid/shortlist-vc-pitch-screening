import { eq } from "drizzle-orm";
import { db, single } from "../client";
import { user } from "../schema";

export type User = typeof user.$inferSelect;

// Users are global; a membership ties them to a workspace.
export async function createUser(input: {
  email: string;
  name: string | null;
}): Promise<User> {
  const rows = await db().insert(user).values(input).returning();
  return single(rows, `user "${input.email}"`);
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [row] = await db().select().from(user).where(eq(user.email, email));
  return row ?? null;
}
