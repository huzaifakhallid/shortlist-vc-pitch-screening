import { isIP } from "node:net";

// The visitor's IP for per-IP rate limits (§15.5): the last X-Forwarded-For
// entry, which the nearest proxy wrote. Deployments run behind Caddy, which
// replaces a client-sent X-Forwarded-For; `next dev` and `next start` set it
// from the socket only when the request has none, so without a proxy a
// client can choose its own.

// The entry isn't an IP address: the request is refused.
export class InvalidClientIpError extends Error {
  constructor() {
    super("X-Forwarded-For does not end in a valid IP address");
    this.name = "InvalidClientIpError";
  }
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  if (last === undefined || last === "") {
    throw new Error(
      "Request has no X-Forwarded-For header: the per-IP rate limit needs the client IP",
    );
  }
  return rateLimitAddress(last);
}

// The address a rate limit counts: an IPv4 address as is (an IPv4-mapped
// IPv6 address becomes its IPv4 address), an IPv6 address as its /64 prefix,
// since one subscriber usually holds a whole /64.
export function rateLimitAddress(ip: string): string {
  const version = isIP(ip);
  if (version === 4) {
    return ip;
  }
  // A zone id ("fe80::1%eth0") names a local interface, never a visitor.
  if (version !== 6 || ip.includes("%")) {
    throw new InvalidClientIpError();
  }
  const groups = ipv6Groups(ip);
  const mapped =
    groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
  if (mapped) {
    const [high = 0, low = 0] = groups.slice(6);
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::/64`;
}

// The eight 16-bit groups of a valid IPv6 address, from the URL parser's
// canonical form (lowercase, "::" compressed, embedded IPv4 as hex).
function ipv6Groups(ip: string): number[] {
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [head = "", tail] = canonical.split("::");
  const parse = (part: string) =>
    part === "" ? [] : part.split(":").map((g) => Number.parseInt(g, 16));
  const left = parse(head);
  const right = tail === undefined ? [] : parse(tail);
  const zeros = new Array<number>(8 - left.length - right.length).fill(0);
  return [...left, ...zeros, ...right];
}
