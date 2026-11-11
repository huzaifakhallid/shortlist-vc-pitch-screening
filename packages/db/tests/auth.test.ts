import { describe, expect, it } from "vitest";
import {
  authAdapter,
  createMembership,
  createSession,
  getMembership,
  listUserMemberships,
} from "../index";
import { createTestWorkspace } from "./helpers";

describe("listUserMemberships", () => {
  it("lists only the user's own workspaces, with name, slug and role", async () => {
    const a = await createTestWorkspace("alpha");
    const b = await createTestWorkspace("beta");

    expect(await listUserMemberships(a.partner.id)).toEqual([
      {
        workspaceId: a.workspace.id,
        workspaceSlug: "alpha",
        workspaceName: "Fund alpha",
        role: "partner",
      },
    ]);
    expect(await listUserMemberships(b.partner.id)).toEqual([
      {
        workspaceId: b.workspace.id,
        workspaceSlug: "beta",
        workspaceName: "Fund beta",
        role: "partner",
      },
    ]);
  });

  it("lists every membership of a user in more than one workspace, by slug", async () => {
    const b = await createTestWorkspace("beta");
    const a = await createTestWorkspace("alpha");
    await createMembership(b.workspace.id, {
      userId: a.partner.id,
      role: "analyst",
    });

    expect(await listUserMemberships(a.partner.id)).toMatchObject([
      { workspaceSlug: "alpha", role: "partner" },
      { workspaceSlug: "beta", role: "analyst" },
    ]);
  });
});

describe("getMembership", () => {
  it("finds a member in their workspace and no one across workspaces", async () => {
    const a = await createTestWorkspace("alpha");
    const b = await createTestWorkspace("beta");

    expect(await getMembership(a.workspace.id, a.partner.id)).toMatchObject({
      workspaceId: a.workspace.id,
      userId: a.partner.id,
      role: "partner",
    });
    expect(await getMembership(b.workspace.id, a.partner.id)).toBeNull();
  });
});

describe("auth tables", () => {
  it("creates a session the Auth.js adapter reads back with its user", async () => {
    const { partner } = await createTestWorkspace("alpha");
    const expires = new Date(Date.now() + 60_000);

    const created = await createSession(partner.id, expires);
    const found = await authAdapter().getSessionAndUser?.(created.sessionToken);

    expect(created.sessionToken).toMatch(/^[\w-]{43}$/);
    expect(found?.session).toMatchObject({ userId: partner.id, expires });
    expect(found?.user).toMatchObject({
      id: partner.id,
      email: partner.email,
    });
  });

  it("stores and uses a magic-link token once", async () => {
    const adapter = authAdapter();
    const token = {
      identifier: "partner@alpha.test",
      token: "hashed-token",
      expires: new Date(Date.now() + 60_000),
    };

    await adapter.createVerificationToken?.(token);

    expect(await adapter.useVerificationToken?.(token)).toMatchObject(token);
    expect(await adapter.useVerificationToken?.(token)).toBeNull();
  });
});
