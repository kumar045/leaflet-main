'use client';

import { useState } from 'react';

export default function FileUploader() {
  const [isLoading, setIsLoading] = useState(false);
  const [simplifiedContent, setSimplifiedContent] = useState('');
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('pdf')) {
      setError('Please upload a PDF file');
      return;
    }

    setIsLoading(true);
    setError('');
    setSimplifiedContent('');
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/assistants/files', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error processing PDF');
      }

      setSimplifiedContent(data.simplifiedContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error uploading file');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <div className="mb-6">
        <label className="relative inline-flex items-center justify-center w-full">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            className="hidden"
            disabled={isLoading}
          />
          <span className={`
            inline-flex items-center justify-center px-6 py-3 
            bg-blue-600 text-white rounded-lg cursor-pointer
            hover:bg-blue-700 transition-colors
            ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
          `}>
            {isLoading ? 'Processing...' : 'Upload PDF to Simplify'}
          </span>
        </label>
      </div>

      {fileName && (
        <div className="mb-4 text-sm text-gray-600">
          Processing: {fileName}
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 text-red-700 bg-red-100 rounded-lg">
          {error}
        </div>
      )}

      {simplifiedContent && (
        <div className="p-6 bg-white rounded-lg shadow-lg">
          <h3 className="text-lg font-semibold mb-4">Simplified Version:</h3>
          <div className="prose max-w-none">
            <div className="whitespace-pre-wrap">{simplifiedContent}</div>
          </div>
        </div>
      )}
    </div>
  );
} 