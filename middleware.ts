import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function middleware(request: Request) {
  const { pathname } = new URL(request.url);

  // Protect /admin routes
  if (pathname.startsWith("/admin")) {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.redirect(new URL("/auth/signin", request.url));
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    if (session.user.email !== adminEmail) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
