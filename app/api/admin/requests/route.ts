import { db } from "@/lib/index";
import { accessRequests, accessGrants } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(request: NextRequest) {
  try {
    // Get all pending requests
    const requests = await db
      .select()
      .from(accessRequests)
      .where((ar) => ar.status === "pending");

    return NextResponse.json(requests);
  } catch (error) {
    console.error("Error fetching requests:", error);
    return NextResponse.json(
      { error: "Failed to fetch requests" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { requestId, action } = await request.json();

    if (!requestId || !["approve", "deny"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      );
    }

    // Get the request
    const req = await db
      .select()
      .from(accessRequests)
      .where((ar) => ar.id === requestId)
      .limit(1);

    if (!req || req.length === 0) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const accessRequest = req[0];

    if (action === "deny") {
      // Update status to denied
      await db
        .update(accessRequests)
        .set({
          status: "denied",
          decidedAt: new Date(),
        })
        .where((ar) => ar.id === requestId);

      // Send denial email
      try {
        await resend.emails.send({
          from: "noreply@photos.example.com",
          to: accessRequest.requesterEmail,
          subject: "Access Request Denied",
          html: `
            <h2>Access Request Status</h2>
            <p>Your request to view a photo has been declined by the owner.</p>
          `,
        });
      } catch (emailError) {
        console.error("Failed to send denial email:", emailError);
      }

      return NextResponse.json({ status: "denied" });
    }

    // Approve: create access grant with magic link
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30-day grant

    const grantResult = await db
      .insert(accessGrants)
      .values({
        email: accessRequest.requesterEmail,
        scopeType: accessRequest.scopeType,
        scopeId: accessRequest.scopeId,
        tokenHash,
        expiresAt,
      })
      .returning();

    // Update request status to approved
    await db
      .update(accessRequests)
      .set({
        status: "approved",
        decidedAt: new Date(),
      })
      .where((ar) => ar.id === requestId);

    // Send approval email with magic link
    const magicLink = `${process.env.NEXTAUTH_URL}/share/${token}`;
    try {
      await resend.emails.send({
        from: "noreply@photos.example.com",
        to: accessRequest.requesterEmail,
        subject: "Your Photo Access Request Approved",
        html: `
          <h2>Access Approved</h2>
          <p>Your request to view a photo has been approved!</p>
          <p>
            <a href="${magicLink}" style="display: inline-block; padding: 10px 20px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 5px;">
              View Photo
            </a>
          </p>
          <p style="color: #666; font-size: 12px;">
            This link expires in 30 days.
          </p>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send approval email:", emailError);
    }

    return NextResponse.json({ status: "approved", token });
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
