'use client';

import FileUploader from "@/app/components/file-uploader";

export default function FileSearchPage() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0">
        <div className="blob bg-blue-300 top-0 left-0 w-72 h-72" />
        <div className="blob bg-indigo-300 bottom-0 right-0 w-72 h-72 animation-delay-2000" />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="py-12 text-center">
          <h1 className="text-5xl font-bold mb-4">
            <span className="gradient-text">Medical Document</span>
            <br />
            <span className="text-gray-800">Simplifier</span>
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto px-4">
            Transform complex medical documents into clear, easy-to-understand language
          </p>
        </header>

        {/* Main Content */}
        <main className="flex-1 container mx-auto px-4 py-8">
          <div className="glass-card max-w-4xl mx-auto p-8">
            <FileUploader />
          </div>
        </main>

        {/* Footer */}
        <footer className="py-6 bg-white/50 backdrop-blur-sm">
          <p className="text-center text-gray-600">
            © 2024 Medical Document Simplifier. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
} 