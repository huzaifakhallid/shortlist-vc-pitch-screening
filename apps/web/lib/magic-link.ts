// Delivers a magic sign-in link. Milestone 1 has one delivery path: in local
// development the link is printed to the terminal running `pnpm dev`. Email
// through Postmark arrives in milestone 4; until then every other environment
// has no email sign-in at all: the form isn't shown, the action refuses before
// Auth.js runs (so it can't reveal who is a member) and sending throws.

export function magicLinksAvailable(nodeEnv: string | undefined): boolean {
  return nodeEnv === "development";
}

export function assertMagicLinksAvailable(nodeEnv: string | undefined): void {
  if (!magicLinksAvailable(nodeEnv)) {
    throw new Error(
      "Magic-link email is not wired yet: Postmark sending arrives in milestone 4. Only `pnpm dev` can deliver sign-in links (printed to its terminal).",
    );
  }
}

export function sendMagicLink(
  link: { identifier: string; url: string },
  context: { nodeEnv: string | undefined; appUrl: string },
): void {
  // The link's origin comes from the request's Host header. Refuse one that
  // doesn't match APP_URL, so a forged Host can't put a token on another site.
  const linkOrigin = new URL(link.url).origin;
  const appOrigin = new URL(context.appUrl).origin;
  if (linkOrigin !== appOrigin) {
    throw new Error(
      `Magic link origin ${linkOrigin} does not match APP_URL ${appOrigin}`,
    );
  }
  assertMagicLinksAvailable(context.nodeEnv);
  console.log(`\nMagic sign-in link for ${link.identifier}:\n${link.url}\n`);
}
