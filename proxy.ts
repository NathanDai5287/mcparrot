import { NextResponse, type NextRequest } from "next/server";

function isCrossSite(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const hosts = [request.headers.get("host"), request.headers.get("x-forwarded-host"), request.nextUrl.host];
  try {
    return !hosts.includes(new URL(origin).host);
  } catch {
    return true;
  }
}

export function proxy(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD" && isCrossSite(request)) {
    return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
