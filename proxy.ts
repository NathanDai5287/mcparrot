import { clerkMiddleware } from "@clerk/nextjs/server";
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

export default clerkMiddleware((_auth, request) => {
  const isWrite = request.method !== "GET" && request.method !== "HEAD";
  if (request.nextUrl.pathname.startsWith("/api/") && isWrite && isCrossSite(request)) {
    return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  }
}, { signInUrl: "/sign-in" });

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/api/(.*)"],
};
