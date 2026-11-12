import { afterEach, describe, expect, it, vi } from "vitest";
import { sendMagicLink } from "@/lib/magic-link";

const link = {
  identifier: "sana.mirza@kestrel.example",
  url: "http://localhost:3000/api/auth/callback/email?token=t&email=sana",
};
const appUrl = "http://localhost:3000";

describe("sendMagicLink", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints the link to the terminal in local development", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    sendMagicLink(link, { nodeEnv: "development", appUrl });

    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toContain(link.identifier);
    expect(log.mock.calls[0]?.[0]).toContain(link.url);
  });

  it("throws in production until Postmark sending exists", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    expect(() => {
      sendMagicLink(link, { nodeEnv: "production", appUrl });
    }).toThrow(/Postmark sending arrives in milestone 4/);
    expect(log).not.toHaveBeenCalled();
  });

  it("refuses a link built from a host other than APP_URL", () => {
    expect(() => {
      sendMagicLink(
        {
          ...link,
          url: "https://evil.example/api/auth/callback/email?token=t",
        },
        { nodeEnv: "development", appUrl },
      );
    }).toThrow(
      "Magic link origin https://evil.example does not match APP_URL http://localhost:3000",
    );
  });
});
