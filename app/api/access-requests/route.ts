import { db } from "@/lib/index";
import { accessRequests } from "@/lib/schema";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const { photoId, requesterName, requesterEmail, message } =
      await request.json();

    if (!photoId || !requesterName || !requesterEmail) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if this email already has a pending request for this photo
    const existingRequest = await db
      .select()
      .from(accessRequests)
      .where(
        (ar) =>
          ar.scopeId === photoId &&
          ar.requesterEmail === requesterEmail &&
          ar.status === "pending"
      );

    if (existingRequest.length > 0) {
      return NextResponse.json(
        { error: "You already have a pending request for this photo" },
        { status: 400 }
      );
    }

    // Create access request
    const result = await db
      .insert(accessRequests)
      .values({
        scopeType: "photo",
        scopeId: photoId,
        requesterEmail,
        requesterName,
        message: message || null,
        status: "pending",
      })
      .returning();

    // Send email to admin
    try {
      await resend.emails.send({
        from: "noreply@photos.example.com",
        to: process.env.ADMIN_EMAIL || "",
        subject: `New access request from ${requesterName}`,
        html: `
          <h2>New Photo Access Request</h2>
          <p><strong>From:</strong> ${requesterName} (${requesterEmail})</p>
          <p><strong>Photo ID:</strong> ${photoId}</p>
          ${message ? `<p><strong>Message:</strong> ${message}</p>` : ""}
          <p>
            <a href="${process.env.NEXTAUTH_URL}/admin/requests">
              Review request in admin panel
            </a>
          </p>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send admin email:", emailError);
      // Don't fail the request if email fails
    }

    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    console.error("Error creating access request:", error);
    return NextResponse.json(
      { error: "Failed to create access request" },
      { status: 500 }
    );
  }
}
