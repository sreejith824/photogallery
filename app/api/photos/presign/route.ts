import { auth } from "@/lib/auth";
import { generatePresignedPutUrl } from "@/lib/r2";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email || session.user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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
    console.error("Error generating presigned URL:", error);
    return NextResponse.json(
      { error: "Failed to generate presigned URL" },
      { status: 500 }
    );
  }
}
