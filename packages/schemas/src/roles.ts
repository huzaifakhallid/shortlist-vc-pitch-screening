import { z } from "zod";

// Workspace member roles (§6). Founders have no login, so they are not a role.
export const roleSchema = z.enum(["admin", "partner", "analyst"]);
export type Role = z.infer<typeof roleSchema>;
