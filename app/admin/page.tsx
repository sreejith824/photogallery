"use client";

import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Upload Card */}
        <Link href="/admin/upload">
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Upload Photos
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                  Add new photos to your gallery
                </p>
              </div>
              <span className="text-3xl">📸</span>
            </div>
          </div>
        </Link>

        {/* Gallery Card */}
        <Link href="/">
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  View Gallery
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                  See your published photos
                </p>
              </div>
              <span className="text-3xl">🖼️</span>
            </div>
          </div>
        </Link>

        {/* Requests Card */}
        <Link href="/admin/requests">
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Access Requests
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                  Review photo access requests
                </p>
              </div>
              <span className="text-3xl">📋</span>
            </div>
          </div>
        </Link>

        {/* Manage Photos Card */}
        <Link href="/admin/photos">
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Manage Photos
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                  Edit, delete, and organize photos
                </p>
              </div>
              <span className="text-3xl">🗑️</span>
            </div>
          </div>
        </Link>

        {/* Grants Card */}
        <Link href="/admin/grants">
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Active Grants
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                  Manage shared access links
                </p>
              </div>
              <span className="text-3xl">🔐</span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
