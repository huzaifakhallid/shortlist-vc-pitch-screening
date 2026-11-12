import { NextResponse, type NextRequest } from "next/server";
import { webEnv } from "@/lib/env";
import { sessionCookie } from "@/lib/session-cookie";

// An optimistic check so a signed-out visitor gets a plain redirect before
// rendering starts. It only looks for the cookie; requireSession() checks the
// session itself in every dashboard page.
export function proxy(request: NextRequest): NextResponse {
  const { name } = sessionCookie(webEnv().APP_URL);
  if (request.cookies.has(name)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/signin", request.url));
}

// The dashboard routes. Add each new dashboard route here.
export const config = {
  matcher: ["/", "/deals/:path*"],
};
