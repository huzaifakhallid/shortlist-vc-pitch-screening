import * as db from "@shortlist/db";
import { DEMO_MEMBERS } from "@shortlist/db/demo";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startDemoSession } from "@/lib/demo-login";

vi.mock("@shortlist/db", () => ({
  createSession: vi.fn(),
  getMembership: vi.fn(),
  getUserByEmail: vi.fn(),
  getWorkspaceBySlug: vi.fn(),
}));

const WORKSPACE_ID = "00000000-0000-0000-0000-00000000000a";
const USER_ID = "00000000-0000-0000-0000-00000000000b";
const on = { DEMO_LOGINS: true };
const off = { DEMO_LOGINS: false };

describe("startDemoSession", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(db.getWorkspaceBySlug).mockResolvedValue({
      id: WORKSPACE_ID,
      slug: "kestrel",
      name: "Kestrel Ventures",
      intakeAddress: "pitches+kestrel@in.shortlist.dev",
      createdAt: new Date(),
    });
    vi.mocked(db.getUserByEmail).mockResolvedValue({
      id: USER_ID,
      name: DEMO_MEMBERS.sana.name,
      email: DEMO_MEMBERS.sana.email,
      emailVerified: null,
      image: null,
      createdAt: new Date(),
    });
    vi.mocked(db.getMembership).mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      role: "analyst",
      createdAt: new Date(),
    });
    vi.mocked(db.createSession).mockImplementation((userId, expires) =>
      Promise.resolve({ sessionToken: `token-for-${userId}`, expires }),
    );
  });

  it("is rejected when DEMO_LOGINS is off, before touching the database", async () => {
    await expect(startDemoSession("sana", off)).rejects.toThrow(
      "Demo logins are off (DEMO_LOGINS=false)",
    );
    expect(db.getUserByEmail).not.toHaveBeenCalled();
    expect(db.createSession).not.toHaveBeenCalled();
  });

  it("creates a database session for a seeded persona when on", async () => {
    const session = await startDemoSession("sana", on);

    expect(db.getUserByEmail).toHaveBeenCalledWith(DEMO_MEMBERS.sana.email);
    expect(db.getMembership).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID);
    expect(session.sessionToken).toBe(`token-for-${USER_ID}`);
    expect(session.expires.getTime()).toBeGreaterThan(Date.now());
  });

  it("only signs in as the fixed demo personas", async () => {
    await expect(startDemoSession("daniel", on)).rejects.toThrow(
      'Unknown demo persona: "daniel"',
    );
    await expect(startDemoSession("someone@else.example", on)).rejects.toThrow(
      "Unknown demo persona",
    );
    expect(db.createSession).not.toHaveBeenCalled();
  });

  it("fails when the persona's seeded role doesn't match", async () => {
    vi.mocked(db.getMembership).mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      role: "admin",
      createdAt: new Date(),
    });

    await expect(startDemoSession("sana", on)).rejects.toThrow(
      /is not a analyst of "kestrel"/,
    );
    expect(db.createSession).not.toHaveBeenCalled();
  });

  it("fails when the demo workspace hasn't been seeded", async () => {
    vi.mocked(db.getWorkspaceBySlug).mockResolvedValue(null);

    await expect(startDemoSession("sana", on)).rejects.toThrow(
      'Demo workspace "kestrel" not found. Run pnpm db:seed.',
    );
  });
});
