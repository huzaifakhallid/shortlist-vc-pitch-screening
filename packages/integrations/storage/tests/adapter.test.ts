import { describe, expect, it } from "vitest";
import { IntegrationError } from "../../errors";
import {
  DeckChangedError,
  deckStorage,
  hasPdfMagic,
  InvalidUploadError,
  MAX_DECK_BYTES,
} from "../adapter";
import { newDeckKey } from "../keys";
import {
  fakeR2,
  pdfBytes,
  s3ErrorXml,
  TEST_ENV,
  type FixtureResponse,
} from "./fake-r2";

const WORKSPACE = "3f2b8c1e-5a4d-4e6f-9b0a-1c2d3e4f5a6b";
const OTHER_WORKSPACE = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const HOST =
  "shortlist-test.0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com";
const ETAG = '"5d41402abc4b2a76b9719d911017c592"';

function storageWith(...responses: (FixtureResponse | Error)[]) {
  const fake = fakeR2(responses);
  return {
    storage: deckStorage(fake.client, TEST_ENV.R2_BUCKET),
    sent: fake.sent,
  };
}

function preconditionFailed(): FixtureResponse {
  return {
    statusCode: 412,
    headers: { "content-type": "application/xml" },
    body: s3ErrorXml("PreconditionFailed", "At least one precondition failed."),
  };
}

describe("presignDeckUpload", () => {
  it("signs a 5-minute create-only PUT with the PDF type and the declared size, offline", async () => {
    const { storage, sent } = storageWith();
    const upload = await storage.presignDeckUpload(WORKSPACE, 1_234_567);

    expect(sent).toEqual([]);
    expect(upload.headers).toEqual({
      "Content-Type": "application/pdf",
      "If-None-Match": "*",
    });
    expect(upload.sizeBytes).toBe(1_234_567);
    expect(upload.key.startsWith(`workspaces/${WORKSPACE}/decks/`)).toBe(true);

    const url = new URL(upload.url);
    expect(url.protocol).toBe("https:");
    expect(url.host).toBe(HOST);
    expect(url.pathname).toBe(`/${upload.key}`);
    const query = url.searchParams;
    expect(query.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(query.get("X-Amz-Expires")).toBe("300");
    expect(query.get("X-Amz-Credential")).toMatch(
      /^test-access-key-id\/\d{8}\/auto\/s3\/aws4_request$/,
    );
    expect(query.get("X-Amz-SignedHeaders")).toBe(
      "content-length;content-type;host;if-none-match",
    );
    expect(query.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    // No checksum that the browser's upload would have to match.
    for (const name of query.keys()) {
      expect(name.toLowerCase()).not.toContain("checksum");
    }
    expect(upload.url).not.toContain("test-secret-access-key");
  });

  it("refuses an empty, fractional or oversized deck before signing", async () => {
    const { storage } = storageWith();
    for (const size of [0, -1, 1.5, Number.NaN, MAX_DECK_BYTES + 1]) {
      await expect(storage.presignDeckUpload(WORKSPACE, size)).rejects.toThrow(
        InvalidUploadError,
      );
    }
    await expect(
      storage.presignDeckUpload(WORKSPACE, MAX_DECK_BYTES),
    ).resolves.toMatchObject({ sizeBytes: MAX_DECK_BYTES });
  });

  it("refuses a workspace id that isn't a UUID", async () => {
    const { storage } = storageWith();
    await expect(storage.presignDeckUpload("kestrel", 10)).rejects.toThrow(
      "Storage: workspace id is not a lowercase UUID",
    );
  });
});

describe("verifyDeckUpload", () => {
  const size = pdfBytes().length;
  const head: FixtureResponse = {
    statusCode: 200,
    headers: {
      "content-length": String(size),
      "content-type": "application/pdf",
      etag: ETAG,
    },
  };
  const firstBytes: FixtureResponse = {
    statusCode: 206,
    headers: {
      "content-length": "5",
      "content-range": `bytes 0-4/${String(size)}`,
      etag: ETAG,
    },
    body: pdfBytes().slice(0, 5),
  };

  it("checks size and type, then the first bytes of the same ETag, and returns it", async () => {
    const key = newDeckKey(WORKSPACE);
    const { storage, sent } = storageWith(head, firstBytes);
    expect(await storage.verifyDeckUpload(WORKSPACE, key, size)).toBe(ETAG);

    expect(sent.map((r) => [r.method, r.path])).toEqual([
      ["HEAD", `/${key}`],
      ["GET", `/${key}`],
    ]);
    expect(sent[1]?.headers.range).toBe("bytes=0-4");
    expect(sent[1]?.headers["if-match"]).toBe(ETAG);
  });

  it("says no deck was uploaded when the object is missing", async () => {
    const { storage } = storageWith({ statusCode: 404 });
    const error: unknown = await storage
      .verifyDeckUpload(WORKSPACE, newDeckKey(WORKSPACE), size)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidUploadError);
    expect(error).toMatchObject({ message: "No deck was uploaded" });
  });

  it("rejects a size that differs from the declared one", async () => {
    const { storage, sent } = storageWith({
      statusCode: 200,
      headers: { ...head.headers, "content-length": String(size + 1) },
    });
    await expect(
      storage.verifyDeckUpload(WORKSPACE, newDeckKey(WORKSPACE), size),
    ).rejects.toThrow(
      "The uploaded deck's size doesn't match the declared size",
    );
    expect(sent).toHaveLength(1);
  });

  it("rejects another content type", async () => {
    const { storage } = storageWith({
      statusCode: 200,
      headers: { ...head.headers, "content-type": "text/html" },
    });
    await expect(
      storage.verifyDeckUpload(WORKSPACE, newDeckKey(WORKSPACE), size),
    ).rejects.toThrow("The uploaded deck isn't a PDF");
  });

  it("rejects a file that doesn't start with the PDF magic bytes", async () => {
    const { storage } = storageWith(head, {
      ...firstBytes,
      body: new TextEncoder().encode("<html"),
    });
    await expect(
      storage.verifyDeckUpload(WORKSPACE, newDeckKey(WORKSPACE), size),
    ).rejects.toThrow(InvalidUploadError);
  });

  it("fails when the object changes between the HEAD and the GET", async () => {
    const key = newDeckKey(WORKSPACE);
    const { storage } = storageWith(head, preconditionFailed());
    await expect(
      storage.verifyDeckUpload(WORKSPACE, key, size),
    ).rejects.toThrow(new DeckChangedError(key));
  });

  it("refuses a ranged response longer than asked for, before reading it", async () => {
    const { storage } = storageWith(head, {
      ...firstBytes,
      headers: { ...firstBytes.headers, "content-length": "6" },
      body: "%PDF-1",
    });
    await expect(
      storage.verifyDeckUpload(WORKSPACE, newDeckKey(WORKSPACE), size),
    ).rejects.toThrow("has no length or is larger than 5 bytes");
  });

  it("refuses another workspace's key without calling R2", async () => {
    const { storage, sent } = storageWith();
    await expect(
      storage.verifyDeckUpload(WORKSPACE, newDeckKey(OTHER_WORKSPACE), size),
    ).rejects.toThrow(
      "Storage: object key is not a deck key of this workspace",
    );
    expect(sent).toEqual([]);
  });

  it("maps other HEAD failures to IntegrationError", async () => {
    const { storage } = storageWith({ statusCode: 403 });
    const error: unknown = await storage
      .verifyDeckUpload(WORKSPACE, newDeckKey(WORKSPACE), size)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({ status: 403 });
    expect((error as Error).message).toMatch(
      /^R2 HeadObject failed: HTTP 403 /,
    );
  });
});

describe("readDeck", () => {
  const deck: FixtureResponse = {
    statusCode: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": String(pdfBytes().length),
      etag: ETAG,
    },
    body: pdfBytes(),
  };

  it("returns the bytes of the verified ETag", async () => {
    const key = newDeckKey(WORKSPACE);
    const { storage, sent } = storageWith(deck);
    expect(await storage.readDeck(WORKSPACE, key, ETAG)).toEqual(pdfBytes());
    expect(sent.map((r) => [r.method, r.hostname, r.path])).toEqual([
      ["GET", HOST, `/${key}`],
    ]);
    expect(sent[0]?.headers["if-match"]).toBe(ETAG);
    expect(sent[0]?.headers.range).toBeUndefined();
  });

  it("fails visibly when the deck changed after verification", async () => {
    const key = newDeckKey(WORKSPACE);
    const { storage } = storageWith(preconditionFailed());
    const error: unknown = await storage
      .readDeck(WORKSPACE, key, ETAG)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DeckChangedError);
    expect(error).toMatchObject({
      message: `Storage: ${key} changed after it was verified (ETag mismatch)`,
    });
  });

  it("refuses an object over the size limit or without a length, before reading it", async () => {
    const key = newDeckKey(WORKSPACE);
    const cases: Record<string, string>[] = [
      { ...deck.headers, "content-length": String(MAX_DECK_BYTES + 1) },
      { "content-type": "application/pdf", etag: ETAG },
    ];
    for (const headers of cases) {
      const { storage } = storageWith({ ...deck, headers });
      await expect(storage.readDeck(WORKSPACE, key, ETAG)).rejects.toThrow(
        `Storage: ${key} has no length or is larger than ${String(MAX_DECK_BYTES)} bytes`,
      );
    }
  });

  it("fails on bytes that aren't a PDF", async () => {
    const key = newDeckKey(WORKSPACE);
    const { storage } = storageWith({
      statusCode: 200,
      headers: { "content-length": "9" },
      body: "not a pdf",
    });
    await expect(storage.readDeck(WORKSPACE, key, ETAG)).rejects.toThrow(
      `Storage: ${key} is not a PDF`,
    );
  });

  it("maps an S3 error to IntegrationError with its code and request id, not its message", async () => {
    const { storage } = storageWith({
      statusCode: 404,
      headers: {
        "content-type": "application/xml",
        "x-amz-request-id": "req-123",
      },
      body: s3ErrorXml("NoSuchKey", "The specified key does not exist."),
    });
    const error: unknown = await storage
      .readDeck(WORKSPACE, newDeckKey(WORKSPACE), ETAG)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({
      provider: "r2",
      status: 404,
      code: "NoSuchKey",
      requestId: "req-123",
      message: "R2 GetObject failed: HTTP 404 NoSuchKey",
    });
    expect((error as Error).cause).toBeUndefined();
  });

  it("maps a 5xx to IntegrationError", async () => {
    const { storage } = storageWith({
      statusCode: 503,
      headers: { "content-type": "application/xml" },
      body: s3ErrorXml("ServiceUnavailable", "Please try again."),
    });
    await expect(
      storage.readDeck(WORKSPACE, newDeckKey(WORKSPACE), ETAG),
    ).rejects.toMatchObject({
      status: 503,
      message: "R2 GetObject failed: HTTP 503 ServiceUnavailable",
    });
  });

  it("maps a network failure to IntegrationError with no status", async () => {
    const reset = Object.assign(new Error("socket hang up"), {
      code: "ECONNREFUSED",
    });
    const { storage } = storageWith(reset);
    await expect(
      storage.readDeck(WORKSPACE, newDeckKey(WORKSPACE), ETAG),
    ).rejects.toMatchObject({
      name: "IntegrationError",
      status: null,
      code: null,
      message: "R2 GetObject failed: no response (ECONNREFUSED)",
    });
  });

  it("rethrows an error that isn't from R2 or the network unchanged", async () => {
    const bug = new TypeError("something is not a function");
    const { storage } = storageWith(bug);
    await expect(
      storage.readDeck(WORKSPACE, newDeckKey(WORKSPACE), ETAG),
    ).rejects.toBe(bug);
  });

  it("refuses another workspace's key without calling R2", async () => {
    const { storage, sent } = storageWith();
    await expect(
      storage.readDeck(WORKSPACE, newDeckKey(OTHER_WORKSPACE), ETAG),
    ).rejects.toThrow(
      "Storage: object key is not a deck key of this workspace",
    );
    expect(sent).toEqual([]);
  });
});

describe("deleteDeck", () => {
  it("deletes the workspace's deck", async () => {
    const key = newDeckKey(WORKSPACE);
    const { storage, sent } = storageWith({ statusCode: 204 });
    await storage.deleteDeck(WORKSPACE, key);
    expect(sent.map((r) => [r.method, r.path])).toEqual([
      ["DELETE", `/${key}`],
    ]);
  });

  it("refuses another workspace's key without calling R2", async () => {
    const { storage, sent } = storageWith();
    await expect(
      storage.deleteDeck(WORKSPACE, newDeckKey(OTHER_WORKSPACE)),
    ).rejects.toThrow(
      "Storage: object key is not a deck key of this workspace",
    );
    expect(sent).toEqual([]);
  });
});

describe("hasPdfMagic", () => {
  it("needs %PDF- at the start", () => {
    expect(hasPdfMagic(pdfBytes())).toBe(true);
    expect(hasPdfMagic(new TextEncoder().encode("%PDF"))).toBe(false);
    expect(hasPdfMagic(new TextEncoder().encode(" %PDF-1.7"))).toBe(false);
    expect(hasPdfMagic(new Uint8Array())).toBe(false);
  });
});
