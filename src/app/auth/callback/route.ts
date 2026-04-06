import { NextResponse, type NextRequest } from "next/server";

// This route is no longer used — Supabase Auth has been replaced with NextAuth.
// Kept as a fallback redirect to avoid broken links in old emails.
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/login", request.url));
}
