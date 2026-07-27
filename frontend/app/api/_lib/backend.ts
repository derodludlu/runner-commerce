import { NextRequest } from "next/server";

export const AUTH_COOKIE = "auth_token";

export function backendUrl(pathname: string, search = "") {
  const base =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3001";
  const url = new URL(pathname, base.endsWith("/") ? base : base + "/");
  url.search = search;
  return url;
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  };
}

export function bearerHeaders(request: NextRequest): Record<string, string> {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  return token ? { Authorization: "Bearer " + token } : {};
}

export async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
