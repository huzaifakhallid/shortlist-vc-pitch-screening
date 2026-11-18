import * as db from "@shortlist/db";
import {
  InvalidUploadError,
  IntegrationError,
  type DeckStorage,
} from "@shortlist/integrations/storage";
import type { WorkspaceConfig } from "@shortlist/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as submit } from "@/app/api/pitch/[slug]/submissions/route";
import { POST as presign } from "@/app/api/pitch/[slug]/uploads/route";
import { deckStorage } from "@/lib/deck-storage";
import { validConfig } from "../../../packages/schemas/tests/config.fixture";
import { validPitchForm } from "../../../packages/schemas/tests/pitch.fixture";

vi.mock("@shortlist/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shortlist/db")>()),
  getWorkspaceBySlug: vi.fn(),
  getActiveConfig: vi.fn(),
  consumeRateLimit: vi.fn(),
  createPendingUpload: vi.fn(),
  getPendingUpload: vi.fn(),
  deletePendingUpload: vi.fn(),
  submitPitchForm: vi.fn(),
}));
vi.mock("@/lib/deck-storage", () => ({ deckStorage: vi.fn() }));
vi.mock("@/lib/env", () => ({
  webEnv: () => ({ APP_URL: "http://localhost:3000" }),
}));

const WORKSPACE_ID = "00000000-0000-4000-8000-00000000000a";
const KEY = `workspaces/${WORKSPACE_ID}/decks/00000000-0000-4000-8000-00000000000d.pdf`;
const IP = "203.0.113.7";

const storage = {
  presignDeckUpload: vi.fn<DeckStorage["presignDeckUpload"]>(),
  verifyDeckUpload: vi.fn<DeckStorage["verifyDeckUpload"]>(),
  readDeck: vi.fn<DeckStorage["readDeck"]>(),
  deleteDeck: vi.fn<DeckStorage["deleteDeck"]>(),
};

function workspace(synthetic: boolean): db.Workspace {
  return {
    id: WORKSPACE_ID,
    slug: "harbor",
    name: "Harbor Capital",
    intakeAddress: "pitches+harbor@in.shortlist.dev",
    synthetic,
    createdAt: new Date(),
  };
}

function withConfig(change: (config: WorkspaceConfig) => void): void {
  const config = validConfig();
  change(config);
  vi.mocked(db.getActiveConfig).mockResolvedValue({
    id: "c1",
    version: 1,
    config,
  });
}

// A same-origin JSON POST with its Content-Length, as the form's fetch
// sends it. `headers` overrides or (with null) removes a header.
function post(
  body: unknown,
  headers: Record<string, string | null> = {},
): Request {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const all: Record<string, string | null> = {
    "content-type": "application/json",
    "content-length": String(new TextEncoder().encode(text).byteLength),
    origin: "http://localhost:3000",
    "x-forwarded-for": `198.51.100.1, ${IP}`,
    ...headers,
  };
  const sent = new Headers();
  for (const [name, value] of Object.entries(all)) {
    if (value !== null) {
      sent.set(name, value);
    }
  }
  return new Request("http://localhost:3000/api/pitch/harbor/x", {
    method: "POST",
    headers: sent,
    body: text,
  });
}

const ctx = (slug = "harbor") => ({ params: Promise.resolve({ slug }) });

const submitBody = (overrides: Record<string, unknown> = {}) => ({
  deckKey: KEY,
  form: validPitchForm(),
  fax: "",
  ...overrides,
});

async function json(response: Response): Promise<unknown> {
  return response.json();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(deckStorage).mockReturnValue(storage);
  vi.mocked(db.getWorkspaceBySlug).mockResolvedValue(workspace(false));
  withConfig(() => undefined);
  vi.mocked(db.consumeRateLimit).mockResolvedValue(true);
  storage.presignDeckUpload.mockImplementation((_ws, sizeBytes) =>
    Promise.resolve({
      key: KEY,
      url: "https://r2.example/upload?X-Amz-Signature=s",
      headers: { "Content-Type": "application/pdf", "If-None-Match": "*" },
      sizeBytes,
    }),
  );
  vi.mocked(db.getPendingUpload).mockResolvedValue({
    objectKey: KEY,
    sizeBytes: 4096,
    confirmed: false,
    expired: false,
  });
  storage.verifyDeckUpload.mockResolvedValue('"etag-1"');
});

describe("POST /api/pitch/[slug]/uploads", () => {
  it("presigns the declared size and records the pending upload", async () => {
    const response = await presign(post({ sizeBytes: 4096 }), ctx());

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      key: KEY,
      url: "https://r2.example/upload?X-Amz-Signature=s",
      headers: { "Content-Type": "application/pdf", "If-None-Match": "*" },
    });
    expect(storage.presignDeckUpload).toHaveBeenCalledWith(WORKSPACE_ID, 4096);
    expect(db.createPendingUpload).toHaveBeenCalledWith(WORKSPACE_ID, {
      objectKey: KEY,
      sizeBytes: 4096,
      expiresInSeconds: 3600,
    });
  });

  it("refuses a missing, zero, fractional or oversized size", async () => {
    for (const body of [
      {},
      { sizeBytes: 0 },
      { sizeBytes: 1.5 },
      { sizeBytes: 25 * 1024 * 1024 + 1 },
      { sizeBytes: "4096" },
      { sizeBytes: 4096, workspaceId: "other" },
    ]) {
      const response = await presign(post(body), ctx());
      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({
        error: "Your deck must be a PDF of at most 25 MB.",
        reupload: false,
      });
    }
    expect(storage.presignDeckUpload).not.toHaveBeenCalled();
    expect(db.createPendingUpload).not.toHaveBeenCalled();
  });

  it("refuses a body that isn't JSON", async () => {
    expect((await presign(post("{"), ctx())).status).toBe(400);
  });

  it("takes the workspace from the slug", async () => {
    vi.mocked(db.getWorkspaceBySlug).mockResolvedValue(null);

    const response = await presign(post({ sizeBytes: 4096 }), ctx("nope"));

    expect(response.status).toBe(404);
    expect(db.getWorkspaceBySlug).toHaveBeenCalledWith("nope");
    expect(storage.presignDeckUpload).not.toHaveBeenCalled();
  });
});

describe("a closed form", () => {
  it("refuses a synthetic workspace before anything is written", async () => {
    vi.mocked(db.getWorkspaceBySlug).mockResolvedValue(workspace(true));

    for (const response of [
      await presign(post({ sizeBytes: 4096 }), ctx()),
      await submit(post(submitBody()), ctx()),
    ]) {
      expect(response.status).toBe(403);
      expect(await json(response)).toEqual({
        error: "Harbor Capital isn't taking pitches through this form.",
        reupload: false,
      });
    }
    expect(db.consumeRateLimit).not.toHaveBeenCalled();
    expect(storage.presignDeckUpload).not.toHaveBeenCalled();
    expect(db.createPendingUpload).not.toHaveBeenCalled();
    expect(storage.verifyDeckUpload).not.toHaveBeenCalled();
    expect(db.submitPitchForm).not.toHaveBeenCalled();
  });

  it("refuses when Intake is off or doesn't take the form channel", async () => {
    for (const change of [
      (c: WorkspaceConfig) => {
        c.agents.intake.enabled = false;
      },
      (c: WorkspaceConfig) => {
        c.agents.intake.channels = ["email"];
      },
    ]) {
      withConfig(change);
      expect((await presign(post({ sizeBytes: 4096 }), ctx())).status).toBe(
        403,
      );
      expect((await submit(post(submitBody()), ctx())).status).toBe(403);
    }
    expect(storage.presignDeckUpload).not.toHaveBeenCalled();
    expect(db.submitPitchForm).not.toHaveBeenCalled();
  });
});

describe("rate limits", () => {
  it("counts presigns and submits per IP, then per workspace", async () => {
    await presign(post({ sizeBytes: 4096 }), ctx());
    await submit(post(submitBody()), ctx());

    expect(vi.mocked(db.consumeRateLimit).mock.calls).toEqual([
      [WORKSPACE_ID, `presign:ip:${IP}`, { limit: 20, windowSeconds: 3600 }],
      [WORKSPACE_ID, "presign", { limit: 300, windowSeconds: 3600 }],
      [WORKSPACE_ID, `submit:ip:${IP}`, { limit: 5, windowSeconds: 3600 }],
      [WORKSPACE_ID, "submit", { limit: 100, windowSeconds: 3600 }],
    ]);
  });

  it("refuses over the per-IP limit without counting the workspace", async () => {
    vi.mocked(db.consumeRateLimit).mockResolvedValueOnce(false);

    const response = await submit(post(submitBody()), ctx());

    expect(response.status).toBe(429);
    expect(db.consumeRateLimit).toHaveBeenCalledTimes(1);
    expect(db.getPendingUpload).not.toHaveBeenCalled();
  });

  it("refuses over the per-workspace limit", async () => {
    vi.mocked(db.consumeRateLimit)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const response = await presign(post({ sizeBytes: 4096 }), ctx());

    expect(response.status).toBe(429);
    expect(storage.presignDeckUpload).not.toHaveBeenCalled();
  });

  it("fails without a client IP", async () => {
    await expect(
      presign(post({ sizeBytes: 4096 }, { "x-forwarded-for": null }), ctx()),
    ).rejects.toThrow("Request has no X-Forwarded-For header");
  });

  it("refuses a forwarded value that isn't an IP, before counting it", async () => {
    for (const value of ["unknown", "203.0.113", "fe80::1%eth0"]) {
      const response = await presign(
        post(
          { sizeBytes: 4096 },
          { "x-forwarded-for": `198.51.100.1,${value}` },
        ),
        ctx(),
      );
      expect(response.status, value).toBe(400);
    }
    expect(db.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("counts IPv6 visitors per /64 and mapped IPv4 as IPv4", async () => {
    await presign(
      post({ sizeBytes: 4096 }, { "x-forwarded-for": "2001:DB8:1:2:aaaa::1" }),
      ctx(),
    );
    await presign(
      post({ sizeBytes: 4096 }, { "x-forwarded-for": "::ffff:203.0.113.7" }),
      ctx(),
    );
    const buckets = vi
      .mocked(db.consumeRateLimit)
      .mock.calls.map(([, bucket]) => bucket)
      .filter((bucket) => bucket.includes(":ip:"));
    expect(buckets).toEqual([
      "presign:ip:2001:db8:1:2::/64",
      `presign:ip:${IP}`,
    ]);
  });
});

describe("request checks", () => {
  it("refuses a cross-site request", async () => {
    const cases: Record<string, string | null>[] = [
      { origin: "https://evil.example" },
      { origin: "http://localhost:3001" },
      { origin: null, "sec-fetch-site": "cross-site" },
      { origin: null },
    ];
    for (const headers of cases) {
      const response = await submit(post(submitBody(), headers), ctx());
      expect(response.status, JSON.stringify(headers)).toBe(403);
    }
    expect(db.getWorkspaceBySlug).not.toHaveBeenCalled();
  });

  it("accepts a same-origin request that sends only Sec-Fetch-Site", async () => {
    const response = await submit(
      post(submitBody(), { origin: null, "sec-fetch-site": "same-origin" }),
      ctx(),
    );
    expect(response.status).toBe(200);
  });

  it("refuses a body that isn't JSON by content type", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded"]) {
      const response = await presign(
        post({ sizeBytes: 4096 }, { "content-type": type }),
        ctx(),
      );
      expect(response.status).toBe(415);
    }
    expect(
      (
        await presign(
          post(
            { sizeBytes: 4096 },
            {
              "content-type": "application/json; charset=utf-8",
            },
          ),
          ctx(),
        )
      ).status,
    ).toBe(200);
  });

  it("refuses a missing or oversized Content-Length before any lookup", async () => {
    const missing = await presign(
      post({ sizeBytes: 4096 }, { "content-length": null }),
      ctx(),
    );
    expect(missing.status).toBe(411);
    const large = await presign(
      post({ sizeBytes: 4096 }, { "content-length": String(16 * 1024 + 1) }),
      ctx(),
    );
    expect(large.status).toBe(413);
    expect(db.getWorkspaceBySlug).not.toHaveBeenCalled();
  });

  it("stops reading a body larger than its Content-Length claims", async () => {
    const response = await presign(
      post(
        { sizeBytes: 4096, pad: "x".repeat(17 * 1024) },
        { "content-length": "20" },
      ),
      ctx(),
    );
    expect(response.status).toBe(413);
    expect(storage.presignDeckUpload).not.toHaveBeenCalled();
  });
});

describe("POST /api/pitch/[slug]/submissions", () => {
  it("verifies the deck at its stored size and submits with the ETag", async () => {
    const response = await submit(post(submitBody()), ctx());

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ submitted: true });
    expect(db.getPendingUpload).toHaveBeenCalledWith(WORKSPACE_ID, KEY);
    expect(storage.verifyDeckUpload).toHaveBeenCalledWith(
      WORKSPACE_ID,
      KEY,
      4096,
    );
    expect(db.submitPitchForm).toHaveBeenCalledWith(WORKSPACE_ID, {
      objectKey: KEY,
      etag: '"etag-1"',
      form: validPitchForm(),
    });
  });

  it("never takes a size from the request", async () => {
    const response = await submit(post(submitBody({ sizeBytes: 10 })), ctx());
    expect(response.status).toBe(400);
    expect(storage.verifyDeckUpload).not.toHaveBeenCalled();
  });

  it("refuses an unknown, confirmed or expired upload", async () => {
    vi.mocked(db.getPendingUpload).mockResolvedValueOnce(null);
    const unknown = await submit(post(submitBody()), ctx());
    expect(unknown.status).toBe(400);
    expect(await json(unknown)).toEqual({
      error: "Upload your deck before submitting.",
      reupload: true,
    });

    vi.mocked(db.getPendingUpload).mockResolvedValueOnce({
      objectKey: KEY,
      sizeBytes: 4096,
      confirmed: true,
      expired: false,
    });
    expect((await submit(post(submitBody()), ctx())).status).toBe(409);

    vi.mocked(db.getPendingUpload).mockResolvedValueOnce({
      objectKey: KEY,
      sizeBytes: 4096,
      confirmed: false,
      expired: true,
    });
    const expired = await submit(post(submitBody()), ctx());
    expect(expired.status).toBe(400);
    expect(await json(expired)).toEqual({
      error: "Your deck upload expired. Upload it again.",
      reupload: true,
    });

    expect(storage.verifyDeckUpload).not.toHaveBeenCalled();
    expect(db.submitPitchForm).not.toHaveBeenCalled();
  });

  it("deletes a rejected upload, object first, and submits nothing", async () => {
    storage.verifyDeckUpload.mockRejectedValue(
      new InvalidUploadError("type", "The uploaded deck isn't a PDF"),
    );
    const order: string[] = [];
    storage.deleteDeck.mockImplementation(() => {
      order.push("object");
      return Promise.resolve();
    });
    vi.mocked(db.deletePendingUpload).mockImplementation(() => {
      order.push("row");
      return Promise.resolve();
    });

    const response = await submit(post(submitBody()), ctx());

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({
      error: "The uploaded deck isn't a PDF. Upload it again.",
      reupload: true,
    });
    expect(storage.deleteDeck).toHaveBeenCalledWith(WORKSPACE_ID, KEY);
    expect(db.deletePendingUpload).toHaveBeenCalledWith(WORKSPACE_ID, KEY);
    expect(order).toEqual(["object", "row"]);
    expect(db.submitPitchForm).not.toHaveBeenCalled();
  });

  it("keeps the row and the key when nothing has been uploaded yet", async () => {
    storage.verifyDeckUpload.mockRejectedValue(
      new InvalidUploadError("not_uploaded", "No deck was uploaded"),
    );

    const response = await submit(post(submitBody()), ctx());

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({
      error:
        "Your deck hasn't finished uploading. Wait a moment and submit again.",
      reupload: false,
    });
    expect(storage.deleteDeck).not.toHaveBeenCalled();
    expect(db.deletePendingUpload).not.toHaveBeenCalled();
    expect(db.submitPitchForm).not.toHaveBeenCalled();
  });

  it("deletes an upload of the wrong size", async () => {
    storage.verifyDeckUpload.mockRejectedValue(
      new InvalidUploadError(
        "size",
        "The uploaded deck's size doesn't match the declared size",
      ),
    );

    const response = await submit(post(submitBody()), ctx());

    expect(response.status).toBe(400);
    expect(storage.deleteDeck).toHaveBeenCalledWith(WORKSPACE_ID, KEY);
    expect(db.deletePendingUpload).toHaveBeenCalledWith(WORKSPACE_ID, KEY);
  });

  it("applies Intake's website and email rules (§7.1)", async () => {
    const cases: [Partial<ReturnType<typeof validPitchForm>>, string][] = [
      [
        { website: "http://localhost:3000" },
        "Website host is not a domain name.",
      ],
      [
        { website: "http://127.0.0.1/" },
        "Website host is an IP address, not a domain.",
      ],
      [
        { website: "http://[::1]/" },
        "Website host is an IP address, not a domain.",
      ],
      [
        { website: "https://ana:secret@acme.com" },
        "Website is not a valid http(s) address.",
      ],
      [
        // Zod's email check takes a label ending in "-"; Intake's doesn't.
        { founderEmail: "omar@ledgerline-.example" },
        "Founder email is not a valid address.",
      ],
    ];
    for (const [change, error] of cases) {
      const response = await submit(
        post(submitBody({ form: { ...validPitchForm(), ...change } })),
        ctx(),
      );
      expect(response.status, JSON.stringify(change)).toBe(400);
      expect(await json(response)).toEqual({ error, reupload: false });
    }
    expect(db.getPendingUpload).not.toHaveBeenCalled();
  });

  it("keeps the upload when storage itself fails", async () => {
    storage.verifyDeckUpload.mockRejectedValue(
      new IntegrationError({
        provider: "r2",
        status: 503,
        message: "R2 HeadObject failed",
        code: null,
        requestId: null,
      }),
    );

    await expect(submit(post(submitBody()), ctx())).rejects.toThrow(
      "R2 HeadObject failed",
    );
    expect(storage.deleteDeck).not.toHaveBeenCalled();
    expect(db.deletePendingUpload).not.toHaveBeenCalled();
  });

  it("refuses an upload confirmed or expired since it was read", async () => {
    vi.mocked(db.submitPitchForm).mockRejectedValue(
      new db.UploadNotConfirmableError(),
    );

    const response = await submit(post(submitBody()), ctx());

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({
      error: "Your deck upload expired or was already used. Upload it again.",
      reupload: true,
    });
  });

  it("refuses a filled honeypot", async () => {
    const response = await submit(post(submitBody({ fax: "555" })), ctx());

    expect(response.status).toBe(400);
    expect(db.getPendingUpload).not.toHaveBeenCalled();
  });

  it("shows the form's own message for an invalid field", async () => {
    const response = await submit(
      post(submitBody({ form: { ...validPitchForm(), website: "acme.com" } })),
      ctx(),
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({
      error: "Website must be a full address, like https://acme.com",
      reupload: false,
    });
    expect(db.getPendingUpload).not.toHaveBeenCalled();
  });
});
