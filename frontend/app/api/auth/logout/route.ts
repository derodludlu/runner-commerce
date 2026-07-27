import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  authCookieOptions,
  bearerHeaders,
  backendUrl,
} from "../../_lib/backend";

export async function POST(request: NextRequest) {
  try {
    await fetch(backendUrl("/auth/logout"), {
      method: "POST",
      headers: bearerHeaders(request),
      cache: "no-store",
    });
  } catch {
    // The local Vercel session still needs to be cleared if the backend is unavailable.
  }

  const response = NextResponse.json({ message: "Logged out" });
  response.cookies.set(AUTH_COOKIE, "", { ...authCookieOptions(), maxAge: 0 });
  return response;
}
