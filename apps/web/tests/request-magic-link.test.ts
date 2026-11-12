import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signIn } from "@/auth";
import { requestMagicLink } from "@/lib/auth-actions";

vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

function form(email: string): FormData {
  const data = new FormData();
  data.set("email", email);
  return data;
}

describe("requestMagicLink", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses outside development before Auth.js runs", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(
      requestMagicLink(form("sana.mirza@kestrel.example")),
    ).rejects.toThrow(/Postmark sending arrives in milestone 4/);
    expect(signIn).not.toHaveBeenCalled();
  });

  it("asks Auth.js for a link in development", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await requestMagicLink(form("sana.mirza@kestrel.example"));

    expect(signIn).toHaveBeenCalledWith("email", {
      email: "sana.mirza@kestrel.example",
      redirectTo: "/deals",
    });
  });
});
