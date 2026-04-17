import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const session = req.auth;
  const path = req.nextUrl.pathname;

  // Standalone KYC fill page — no auth required (uses verification code)
  if (path.startsWith("/kyc/fill")) {
    return NextResponse.next();
  }

  const isClientRoute =
    path.startsWith("/dashboard") ||
    path.startsWith("/apply") ||
    path.startsWith("/applications") ||
    path.startsWith("/kyc");
  const isAdminRoute = path.startsWith("/admin");
  const isAuthRoute =
    path.startsWith("/login") || path.startsWith("/register");

  // Unauthenticated → login
  if (!session && (isClientRoute || isAdminRoute)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Authenticated on auth page → home
  if (session && isAuthRoute) {
    return NextResponse.redirect(
      new URL(
        session.user.role === "admin" ? "/admin/dashboard" : "/dashboard",
        req.url
      )
    );
  }

  // Non-admin trying to access admin routes → client dashboard
  if (session && isAdminRoute && session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Admin trying to access client routes → admin dashboard
  if (session && isClientRoute && session.user.role === "admin") {
    return NextResponse.redirect(new URL("/admin/dashboard", req.url));
  }

  // Non-primary client (no can_manage on any service): restrict to /kyc and /documents only
  if (
    session &&
    session.user.role === "client" &&
    session.user.is_primary === false
  ) {
    const allowedPaths = ["/kyc", "/documents"];
    const isAllowed = allowedPaths.some((p) => path.startsWith(p));
    if (!isAllowed && isClientRoute) {
      return NextResponse.redirect(new URL("/kyc", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
