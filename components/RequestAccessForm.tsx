"use client";

import { useState } from "react";

interface RequestAccessFormProps {
  photoId: string;
}

export default function RequestAccessForm({ photoId }: RequestAccessFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoId,
          requesterName: name,
          requesterEmail: email,
          message,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit request");
      }

      setSuccess(true);
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="border-l-2 border-accent pl-5 py-2">
        <p className="font-display text-3xl italic">Request sent.</p>
        <p className="mt-2 text-foreground/70">
          The owner will review it and respond via email.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      <div>
        <label className="block font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          Your name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-2 w-full border-b border-foreground/25 bg-transparent py-2 text-lg outline-none transition-colors placeholder:text-foreground/30 focus:border-foreground"
          placeholder="John Doe"
        />
      </div>

      <div>
        <label className="block font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          Your email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-2 w-full border-b border-foreground/25 bg-transparent py-2 text-lg outline-none transition-colors placeholder:text-foreground/30 focus:border-foreground"
          placeholder="john@example.com"
        />
      </div>

      <div>
        <label className="block font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          Message (optional)
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="mt-2 w-full border-b border-foreground/25 bg-transparent py-2 text-lg outline-none transition-colors placeholder:text-foreground/30 focus:border-foreground"
          placeholder="Tell us why you'd like to see this photo..."
        />
      </div>

      {error && <p className="text-accent text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="group flex w-full items-center justify-between bg-foreground px-5 py-4 font-mono text-[11px] uppercase tracking-[0.2em] text-background transition-colors hover:bg-accent disabled:opacity-50"
      >
        {loading ? "Sending…" : "Request access"}
        <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
      </button>
    </form>
  );
}
