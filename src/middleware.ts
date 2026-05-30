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
  "/api/extension/",   // Chrome Extension — auth via licenseKey Bearer token
  "/api/v1/",          // External API (scraper/sync) — auth via licenseKey Bearer token
  "/join/",            // public campaign join pages
  "/submit-video/",    // affiliate video submission
  "/api/submit-video",
  "/favicon.ico",
  "/_next",
];

/**
 * Page routes that require OWNER or ADMIN role.
 * Middleware redirects non-admin users to / with ?denied=1.
 * Note: The definitive enforcement happens at the API layer (requirePermission).
 * This middleware check is a UX guard that prevents non-admins from even loading
 * the admin page components.
 */
const ADMIN_ONLY_ROUTES = [
  "/master",
  "/admin",
  "/automation",
  "/branding",
  "/google-integration",
];

const ADMIN_ROLES = new Set(["OWNER", "ADMIN"]);

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
}

function isAdminOnly(pathname: string): boolean {
  return ADMIN_ONLY_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  );
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

  // ── Admin-only route guard ─────────────────────────────────────────────────
  // We only have the globalRole in the JWT (workspace role is in the DB).
  // If the user's globalRole explicitly marks them as non-admin, redirect.
  // Workspace-level role enforcement is handled by PermissionGate on the page.
  if (isAdminOnly(pathname)) {
    const globalRole = (req.auth as { user?: { globalRole?: string } })?.user?.globalRole ?? "";
    // If globalRole is explicitly a non-admin global role, redirect.
    // Empty globalRole or "MEMBER" → let PermissionGate handle it (workspace role unknown).
    if (globalRole && !ADMIN_ROLES.has(globalRole.toUpperCase()) && globalRole !== "MEMBER") {
      const deniedUrl = new URL("/", req.url);
      deniedUrl.searchParams.set("denied", "1");
      return NextResponse.redirect(deniedUrl);
    }
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
