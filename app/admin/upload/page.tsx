"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface UploadItem {
  id: string;
  file: File;
  previewUrl: string;
  caption: string;
  status: "staged" | "pending" | "success" | "error";
  // Set once the file is in R2, so a retry only re-runs processing
  s3Key?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Separate input with `capture`: on phones that attribute forces the camera,
  // so it must not be on the regular file picker
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // Processing runs one photo at a time: it keeps reverse geocoding within
  // Nominatim's 1 request/second policy and avoids piling up server work
  const processingQueue = useRef<Promise<unknown>>(Promise.resolve());

  // Release preview object URLs when the page unmounts
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(
    () => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.previewUrl)),
    []
  );

  const updateItem = (id: string, patch: Partial<UploadItem>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const stageFiles = (files: File[]) => {
    const staged = files
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        caption: "",
        status: "staged" as const,
      }));
    setItems((prev) => [...prev, ...staged]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  // Upload straight from the browser to R2 with a presigned URL. Sending the
  // file through a Vercel function would cap uploads at 4.5 MB.
  const uploadToR2 = async (file: File): Promise<string> => {
    const contentType = file.type || "application/octet-stream";
    const presignResponse = await fetch("/api/photos/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType }),
    });
    if (!presignResponse.ok) throw new Error("Failed to get upload URL");
    const { s3Key, presignedUrl } = await presignResponse.json();

    const putResponse = await fetch(presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    });
    if (!putResponse.ok) throw new Error("Failed to upload file to storage");
    return s3Key;
  };

  const processPhoto = async (item: UploadItem, s3Key: string) => {
    // Notify backend to process (EXIF, geocoding, tagging)
    const notifyResponse = await fetch("/api/photos/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        s3Key,
        filename: item.file.name,
        caption: item.caption,
      }),
    });
    if (!notifyResponse.ok) throw new Error("Failed to notify backend");
  };

  const handleUploadFile = async (item: UploadItem) => {
    updateItem(item.id, { status: "pending" });

    try {
      const s3Key = item.s3Key ?? (await uploadToR2(item.file));
      updateItem(item.id, { s3Key });

      const processed = processingQueue.current.then(() => processPhoto(item, s3Key));
      // Keep the queue going even if this photo fails
      processingQueue.current = processed.catch(() => {});
      await processed;

      updateItem(item.id, { status: "success" });
    } catch (error) {
      console.error("Upload error:", error);
      updateItem(item.id, { status: "error" });
    }
  };

  const uploadAll = () => {
    items
      .filter((i) => i.status === "staged" || i.status === "error")
      .forEach(handleUploadFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    stageFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    stageFiles(Array.from(e.target.files || []));
    // Allow selecting the same file again later
    e.target.value = "";
  };

  const readyCount = items.filter(
    (i) => i.status === "staged" || i.status === "error"
  ).length;
  const isUploading = items.some((i) => i.status === "pending");

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
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
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
            onClick={() => cameraInputRef.current?.click()}
            className="mt-2 ml-2 inline-block bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 md:hidden"
          >
            📷 Take Photo
          </button>
        </div>

        {/* Selected photos with captions */}
        {items.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Photos</h2>
              <button
                onClick={uploadAll}
                disabled={readyCount === 0 || isUploading}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                {isUploading
                  ? "Uploading..."
                  : `Upload ${readyCount || ""} photo${readyCount === 1 ? "" : "s"}`}
              </button>
            </div>
            <div className="space-y-3">
              {items.map((item) => {
                const editable = item.status === "staged" || item.status === "error";
                return (
                  <div
                    key={item.id}
                    className="flex gap-4 p-3 bg-white rounded-lg border border-gray-200"
                  >
                    <img
                      src={item.previewUrl}
                      alt=""
                      className="h-20 w-20 flex-none rounded object-cover bg-gray-100"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-500 truncate">
                          {item.file.name}
                        </span>
                        {item.status === "staged" && (
                          <button
                            onClick={() => removeItem(item.id)}
                            className="text-xs text-gray-400 hover:text-red-600"
                          >
                            Remove
                          </button>
                        )}
                        {item.status === "pending" && (
                          <span className="text-sm text-yellow-600">⏳ Uploading...</span>
                        )}
                        {item.status === "success" && (
                          <span className="text-sm text-green-600">✓ Done</span>
                        )}
                        {item.status === "error" && (
                          <span className="text-sm text-red-600">✗ Error, retry with Upload</span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={item.caption}
                        onChange={(e) => updateItem(item.id, { caption: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && uploadAll()}
                        disabled={!editable}
                        maxLength={500}
                        placeholder="Add a caption (optional)"
                        className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                      />
                    </div>
                  </div>
                );
              })}
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
