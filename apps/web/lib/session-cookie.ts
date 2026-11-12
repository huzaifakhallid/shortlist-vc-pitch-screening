// The Auth.js session cookie, named here so the Auth.js config, the demo
// login and the proxy all use the same one. Secure (and "__Secure-" prefixed)
// whenever the app is served over HTTPS.
export function sessionCookie(appUrl: string) {
  const secure = new URL(appUrl).protocol === "https:";
  return {
    name: `${secure ? "__Secure-" : ""}authjs.session-token`,
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      secure,
    },
  };
}

// Database sessions last 30 days (the Auth.js default, stated once here).
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
