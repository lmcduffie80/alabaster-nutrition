import { clerkClient, clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { IDLE_COOKIE, IDLE_LIMIT_MS, requestCountsAsUse, serverIdleDecision } from "@/lib/domain/idle";

const unchecked = ["/sign-in", "/sign-up"];

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;
  if (unchecked.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return;
  const { sessionId } = await auth();
  if (!sessionId) return;

  const decision = serverIdleDecision(
    request.cookies.get(IDLE_COOKIE)?.value,
    sessionId,
    Date.now(),
    requestCountsAsUse(request.method, pathname, request.headers),
  );
  if (decision.kind === "expired") {
    try {
      await (await clerkClient()).sessions.revokeSession(sessionId);
    } catch (error) {
      console.error("Couldn't revoke an idle session", error);
    }
    const page = request.method === "GET" && request.headers.get("sec-fetch-mode") === "navigate";
    return page
      ? NextResponse.redirect(new URL("/sign-in?reason=idle", request.url))
      : NextResponse.json({ error: "Signed out after 20 minutes of inactivity." }, { status: 401 });
  }
  if (decision.cookie) {
    const response = NextResponse.next();
    response.cookies.set(IDLE_COOKIE, decision.cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: (2 * IDLE_LIMIT_MS) / 1000 + 24 * 3600,
    });
    return response;
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
