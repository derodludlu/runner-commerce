import { NextRequest, NextResponse } from "next/server";
import { bearerHeaders, backendUrl } from "../../_lib/backend";

type RouteContext = { params: Promise<{ path: string[] }> };

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

async function proxyBackend(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const pathname = "/" + (params.path || []).join("/");
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    if (
      !HOP_BY_HOP_HEADERS.has(key.toLowerCase()) &&
      key.toLowerCase() !== "cookie"
    ) {
      headers.set(key, value);
    }
  });

  const authHeaders = bearerHeaders(request);
  if (authHeaders.Authorization) {
    headers.set("Authorization", authHeaders.Authorization);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const backendResponse = await fetch(
    backendUrl(pathname, request.nextUrl.search),
    init,
  );
  const responseHeaders = new Headers(backendResponse.headers);
  responseHeaders.delete("set-cookie");
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

  return new NextResponse(backendResponse.body, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxyBackend;
export const POST = proxyBackend;
export const PUT = proxyBackend;
export const PATCH = proxyBackend;
export const DELETE = proxyBackend;
export const OPTIONS = proxyBackend;
