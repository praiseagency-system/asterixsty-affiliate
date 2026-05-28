import { auth } from "@/auth";
import { NextResponse } from "next/server";

// ── Custom domain ─────────────────────────────────────────────────────────────
const CUSTOM_DOMAIN  = "app.praiseagency.id";
// Any *.railway.app hostname is considered legacy and gets a permanent redirect
const LEGACY_PATTERN = /\.railway\.app$/;

// ── Routes that never require authentication ──────────────────────────────────
const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/join/",          // public campaign join pages
  "/submit-video/",  // affiliate video submission
  "/api/submit-video",
  "/favicon.ico",
  "/_next",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
}

export default auth((req) => {
  const host = req.headers.get("host") ?? "";

  // ── Redirect legacy Railway domain → custom domain (301 permanent) ────────
  if (LEGACY_PATTERN.test(host)) {
    const dest = req.nextUrl.clone();
    dest.protocol = "https:";
    dest.host     = CUSTOM_DOMAIN;
    dest.port     = "";
    return NextResponse.redirect(dest, 301);
  }

  const { pathname } = req.nextUrl;

  // Always allow public paths
  if (isPublic(pathname)) return NextResponse.next();

  // Skip auth check if Google credentials are not configured (dev/preview fallback)
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.next();
  }

  // Require session for everything else
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
