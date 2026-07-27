import { NextRequest, NextResponse } from "next/server";
import { bearerHeaders, backendUrl, readJson } from "../../_lib/backend";

export async function GET(request: NextRequest) {
  const authHeaders = bearerHeaders(request);
  if (!authHeaders.Authorization) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  const backendResponse = await fetch(backendUrl("/auth/me"), {
    method: "GET",
    headers: authHeaders,
    cache: "no-store",
  });

  return NextResponse.json(await readJson(backendResponse), {
    status: backendResponse.status,
  });
}
