import { getAdminSession } from "@/lib/auth";
import { generatePresignedPutUrl } from "@/lib/r2";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    if (!(await getAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
