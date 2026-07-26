// proxy.ts — Next.js server-side route protection

import { NextRequest, NextResponse } from "next/server";
import { getRequiredRoles, isPublicRoute } from "@/lib/rbac";
import type { UserRole } from "@/lib/rbac";

function decodeJWTRole(token: string): UserRole | null {
  try {
    const payloadB64 = token.split(".")[1];
    if (!payloadB64) return null;
    const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    return (payload.role as UserRole) ?? null;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) return NextResponse.next();

  const token = request.cookies.get("auth_token")?.value;

  if (!token) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role: UserRole | null = decodeJWTRole(token);
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
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|sw.js|icons/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff|woff2)$).*)",
  ],
};
