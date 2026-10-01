import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const isLoggedIn = request.cookies.get("session")?.value === "valid";
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname.startsWith("/login") || pathname.startsWith("/api/login");

  if (isPublic) return NextResponse.next();

  if (!isLoggedIn) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
