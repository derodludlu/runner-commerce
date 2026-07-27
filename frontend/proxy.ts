// proxy.ts — Next.js server-side route protection

import { NextRequest, NextResponse } from "next/server";
import { getRequiredRoles, isPublicRoute } from "@/lib/rbac";
import type { UserRole } from "@/lib/rbac";

const VALID_ROLES: UserRole[] = [
  "ADMIN",
  "CUSTOMER",
  "RUNNER",
  "SHOP_OWNER",
  "WAREHOUSE",
  "SUPERUSER",
];

function asUserRole(value: string | undefined): UserRole | null {
  return VALID_ROLES.includes(value as UserRole) ? (value as UserRole) : null;
}

function decodeJWTRole(token: string): UserRole | null {
  try {
    const payloadB64 = token.split(".")[1];
    if (!payloadB64) return null;
    const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const json = atob(padded);
    const payload = JSON.parse(json);
    return asUserRole(payload.role);
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") || isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get("auth_token")?.value;

  if (!token) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role =
    decodeJWTRole(token) ?? asUserRole(request.cookies.get("user_role")?.value);
  const requiredRoles = getRequiredRoles(pathname);

  if (requiredRoles && requiredRoles.length > 0) {
    if (!role || !requiredRoles.includes(role)) {
      const unauthorizedUrl = request.nextUrl.clone();
      unauthorizedUrl.pathname = "/unauthorized";
      unauthorizedUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(unauthorizedUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|sw.js|icons/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff|woff2)$).*)",
  ],
};
