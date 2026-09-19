import { db } from "@/lib/index";
import { accessGrants } from "@/lib/schema";
import { eq, gt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    // Hash the token
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Find the grant
    const grants = await db
      .select()
      .from(accessGrants)
      .where(
        (ag) =>
          ag.tokenHash === tokenHash &&
          (ag.expiresAt === null || ag.expiresAt > new Date()) &&
          ag.revokedAt === null
      )
      .limit(1);

    if (!grants || grants.length === 0) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 403 }
      );
    }

    const grant = grants[0];

    // Create response with the photo ID
    const response = NextResponse.json({
      photoId: grant.scopeId,
    });

    // Set secure httpOnly cookie
    response.cookies.set({
      name: `access_${grant.scopeId}`,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 86400 * 30, // 30 days
    });

    return response;
  } catch (error) {
    console.error("Error validating share token:", error);
    return NextResponse.json(
      { error: "Failed to validate token" },
      { status: 500 }
    );
  }
}
