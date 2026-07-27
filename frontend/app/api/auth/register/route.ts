import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  authCookieOptions,
  backendUrl,
  readJson,
} from "../../_lib/backend";

export async function POST(request: NextRequest) {
  const backendResponse = await fetch(backendUrl("/auth/register"), {
    method: "POST",
    headers: {
      "Content-Type": request.headers.get("content-type") || "application/json",
    },
    body: await request.text(),
    cache: "no-store",
  });

  const data = await readJson(backendResponse);
  const body =
    backendResponse.ok && data?.user
      ? { user: data.user, accessToken: "cookie" }
      : data;

  const response = NextResponse.json(body, { status: backendResponse.status });
  if (backendResponse.ok && data?.accessToken) {
    response.cookies.set(AUTH_COOKIE, data.accessToken, authCookieOptions());
  }
  return response;
}
