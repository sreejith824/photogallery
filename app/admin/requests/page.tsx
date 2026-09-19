"use client";

import { useState, useEffect } from "react";

interface AccessRequest {
  id: number;
  scopeType: string;
  scopeId: string;
  requesterEmail: string;
  requesterName: string;
  message: string | null;
  status: string;
  createdAt: string;
}

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const response = await fetch("/api/admin/requests");
        if (!response.ok) throw new Error("Failed to fetch requests");
        const data = await response.json();
        setRequests(data);
      } catch (error) {
        console.error("Failed to fetch requests:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, []);

  const handleApproveOrDeny = async (
    requestId: number,
    action: "approve" | "deny"
  ) => {
    setProcessing(requestId);
    try {
      const response = await fetch("/api/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });

      if (!response.ok) throw new Error("Failed to process request");

      // Remove from list
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to process request");
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading requests...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Access Requests</h1>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {requests.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg">
            <p className="text-gray-500">No pending requests</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <div
                key={request.id}
                className="bg-white rounded-lg shadow p-6"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {request.requesterName}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {request.requesterEmail}
                    </p>
                    {request.message && (
                      <p className="mt-2 text-sm text-gray-700">
                        <strong>Message:</strong> {request.message}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-gray-500">
                      Requested on{" "}
                      {new Date(request.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        handleApproveOrDeny(request.id, "approve")
                      }
                      disabled={processing === request.id}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                    >
                      {processing === request.id ? "..." : "✓ Approve"}
                    </button>
                    <button
                      onClick={() => handleApproveOrDeny(request.id, "deny")}
                      disabled={processing === request.id}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400"
                    >
                      {processing === request.id ? "..." : "✗ Deny"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
