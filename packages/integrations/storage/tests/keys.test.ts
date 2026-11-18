import { describe, expect, it } from "vitest";
import { assertDeckKey, newDeckKey } from "../keys";

const WORKSPACE = "3f2b8c1e-5a4d-4e6f-9b0a-1c2d3e4f5a6b";
const OTHER_WORKSPACE = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

describe("deck keys", () => {
  it("puts a server-generated id under the workspace's decks prefix", () => {
    const key = newDeckKey(WORKSPACE);
    expect(key).toMatch(
      /^workspaces\/3f2b8c1e-5a4d-4e6f-9b0a-1c2d3e4f5a6b\/decks\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/,
    );
    expect(newDeckKey(WORKSPACE)).not.toBe(key);
    expect(() => {
      assertDeckKey(WORKSPACE, key);
    }).not.toThrow();
  });

  it("refuses a workspace id that isn't a lowercase UUID", () => {
    for (const id of [
      "",
      "kestrel",
      "../x",
      WORKSPACE.toUpperCase(),
      `${WORKSPACE}/..`,
    ]) {
      expect(() => newDeckKey(id)).toThrow(
        "Storage: workspace id is not a lowercase UUID",
      );
    }
  });

  it("refuses another workspace's key and anything that isn't a deck key", () => {
    const key = newDeckKey(OTHER_WORKSPACE);
    const fileName = key.split("/")[3] ?? "";
    for (const candidate of [
      key,
      `workspaces/${WORKSPACE}/decks/../../${OTHER_WORKSPACE}/decks/${fileName}`,
      `workspaces/${WORKSPACE}/decks/pitch-deck.pdf`,
      `workspaces/${WORKSPACE}/raw-email/${fileName}`,
      `workspaces/${WORKSPACE}/decks/${fileName}.html`,
      `workspaces/${WORKSPACE}/decks/${fileName.replace(".pdf", "xpdf")}`,
      `workspaces/${WORKSPACE}/decks/${fileName.toUpperCase()}`,
      `/workspaces/${WORKSPACE}/decks/${fileName}`,
    ]) {
      expect(() => {
        assertDeckKey(WORKSPACE, candidate);
      }).toThrow("Storage: object key is not a deck key of this workspace");
    }
  });
});
