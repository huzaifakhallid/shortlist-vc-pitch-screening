import { describe, expect, it } from "vitest";
import {
  clientIp,
  InvalidClientIpError,
  rateLimitAddress,
} from "@/lib/pitch/client-ip";

describe("rateLimitAddress", () => {
  it("keeps an IPv4 address", () => {
    expect(rateLimitAddress("203.0.113.7")).toBe("203.0.113.7");
  });

  it("turns an IPv4-mapped IPv6 address into IPv4", () => {
    expect(rateLimitAddress("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(rateLimitAddress("::FFFF:cb00:7107")).toBe("203.0.113.7");
  });

  it("buckets IPv6 by its /64, in lowercase canonical form", () => {
    expect(rateLimitAddress("2001:DB8:0001:0002:aaaa:bbbb:cccc:dddd")).toBe(
      "2001:db8:1:2::/64",
    );
    expect(rateLimitAddress("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    expect(rateLimitAddress("::1")).toBe("0:0:0:0::/64");
  });

  it("refuses anything that isn't an IP address", () => {
    for (const value of ["unknown", "203.0.113", "1.2.3.4.5", "fe80::1%eth0"]) {
      expect(() => rateLimitAddress(value), value).toThrow(
        InvalidClientIpError,
      );
    }
  });
});

describe("clientIp", () => {
  it("takes the last X-Forwarded-For entry", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.1, ::ffff:203.0.113.7",
    });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });
});
