import { auth } from "@/lib/auth";
import { generatePresignedPutUrl } from "@/lib/r2";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    console.log("Session:", session?.user?.email);
    console.log("Admin email:", process.env.ADMIN_EMAIL);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (session.user.email !== process.env.ADMIN_EMAIL) {
      return NextResponse.json({ error: "Not admin" }, { status: 403 });
    }

    const { filename, contentType } = await request.json();

    if (!filename) {
      return NextResponse.json(
        { error: "Filename is required" },
        { status: 400 }
      );
    }

    const key = `uploads/${Date.now()}_${filename}`;
    const presignedUrl = await generatePresignedPutUrl(
      key,
      contentType || "application/octet-stream"
    );

    return NextResponse.json({
      s3Key: key,
      presignedUrl,
    });
  } catch (error) {
    console.error("Presign error:", error);
    return NextResponse.json(
      { error: "Failed to generate presigned URL", details: String(error) },
      { status: 500 }
    );
  }
}
