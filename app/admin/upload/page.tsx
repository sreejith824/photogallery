"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function UploadPage() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploads, setUploads] = useState<{ name: string; status: "pending" | "success" | "error" }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadFile = async (file: File) => {
    const fileName = file.name;
    setUploads((prev) => [...prev, { name: fileName, status: "pending" }]);
    setUploadProgress((prev) => ({ ...prev, [fileName]: 0 }));

    try {
      // Step 1: Get presigned URL
      const presignResponse = await fetch("/api/photos/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: fileName,
          contentType: file.type,
        }),
      });

      if (!presignResponse.ok) throw new Error("Failed to get presigned URL");
      const { s3Key, presignedUrl } = await presignResponse.json();

      // Step 2: Upload directly to R2
      const uploadResponse = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadResponse.ok) throw new Error("Failed to upload to R2");

      setUploadProgress((prev) => ({ ...prev, [fileName]: 100 }));

      // Step 3: Notify backend
      const notifyResponse = await fetch("/api/photos/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          s3Key,
          filename: fileName,
        }),
      });

      if (!notifyResponse.ok) throw new Error("Failed to notify backend");

      setUploads((prev) =>
        prev.map((u) =>
          u.name === fileName ? { ...u, status: "success" } : u
        )
      );
    } catch (error) {
      console.error("Upload error:", error);
      setUploads((prev) =>
        prev.map((u) =>
          u.name === fileName ? { ...u, status: "error" } : u
        )
      );
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach((file) => {
      if (file.type.startsWith("image/")) {
        handleUploadFile(file);
      }
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      if (file.type.startsWith("image/")) {
        handleUploadFile(file);
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Upload Photos</h1>

        {/* Upload Area */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          className={`border-2 border-dashed rounded-lg p-12 text-center transition ${
            isDragging
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 bg-gray-100"
          }`}
        >
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20a4 4 0 004 4h24a4 4 0 004-4V20m-6-12l-4-4m0 0l-4 4m4-4v12"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="mt-2 text-sm font-medium text-gray-900">
            Drag and drop photos here, or click to select
          </p>
          <p className="mt-1 text-xs text-gray-500">
            PNG, JPG, GIF up to 50MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 inline-block bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Select Files
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 ml-2 inline-block bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 md:hidden"
          >
            📷 Take Photo
          </button>
        </div>

        {/* Upload List */}
        {uploads.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Uploads
            </h2>
            <div className="space-y-2">
              {uploads.map((upload) => (
                <div
                  key={upload.name}
                  className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200"
                >
                  <span className="text-sm text-gray-700 truncate">
                    {upload.name}
                  </span>
                  {upload.status === "pending" && (
                    <span className="text-sm text-yellow-600">⏳ Uploading...</span>
                  )}
                  {upload.status === "success" && (
                    <span className="text-sm text-green-600">✓ Done</span>
                  )}
                  {upload.status === "error" && (
                    <span className="text-sm text-red-600">✗ Error</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Back Link */}
        <div className="mt-8">
          <button
            onClick={() => router.push("/admin")}
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            ← Back to admin
          </button>
        </div>
      </div>
    </div>
  );
}
