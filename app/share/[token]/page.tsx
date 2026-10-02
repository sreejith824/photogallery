"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function SharePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const validateAndRedirect = async () => {
      try {
        // Validate the token with the backend
        const response = await fetch("/api/share/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!response.ok) {
          throw new Error("Invalid or expired link");
        }

        const { photoId } = await response.json();

        // Token is valid and cookie has been set by the backend
        // Redirect to the photo
        router.push(`/photo/${photoId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setLoading(false);
      }
    };

    validateAndRedirect();
  }, [token, router]);

  if (loading) {
    return (
      <div className="grain min-h-screen bg-background flex items-center justify-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted animate-pulse">
          Checking your access…
        </p>
      </div>
    );
  }

  return (
    <div className="grain min-h-screen bg-background flex items-center justify-center px-6">
      <div className="text-center">
        <p className="font-display text-5xl italic mb-4">{error}</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          The link may be invalid or expired.
        </p>
      </div>
    </div>
  );
}
