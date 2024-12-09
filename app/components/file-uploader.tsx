'use client';

import { useState } from 'react';
import { FiUploadCloud, FiFileText, FiCheck, FiDownload } from 'react-icons/fi';

export default function FileUploader() {
  const [isLoading, setIsLoading] = useState(false);
  const [simplifiedContent, setSimplifiedContent] = useState('');
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('pdf')) {
      setError('Please upload a PDF file');
      return;
    }

    setError('');
    setSimplifiedContent('');
    setFileName(file.name);
    setSelectedFile(file);
  };

  const handleSimplify = async () => {
    if (!selectedFile) return;

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

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
    <div className="w-full">
      {/* Upload Area */}
      <div className="mb-8">
        <div 
          className={`
            relative group
            border-2 border-dashed rounded-xl p-8
            ${selectedFile 
              ? 'border-green-500 bg-green-50/50 dark:bg-green-900/10' 
              : 'border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400'}
            transition-all duration-300 ease-in-out
            hover:shadow-lg
          `}
        >
          <label className="flex flex-col items-center cursor-pointer">
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isLoading}
            />
            {selectedFile ? (
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                  <FiCheck className="w-8 h-8 text-green-500" />
                </div>
                <p className="text-base text-gray-600 dark:text-gray-300 mb-2">Selected file:</p>
                <p className="font-medium text-gray-900 dark:text-white">{fileName}</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4 group-hover:scale-110 transition-transform">
                  <FiUploadCloud className="w-8 h-8 text-blue-500" />
                </div>
                <p className="text-base text-gray-600 dark:text-gray-300 mb-2">
                  Drag and drop your PDF here or
                </p>
                <p className="text-blue-500 dark:text-blue-400 font-medium">
                  Browse files
                </p>
              </div>
            )}
          </label>
        </div>
      </div>

      {/* Action Button */}
      {selectedFile && !isLoading && !simplifiedContent && (
        <div className="flex justify-center mb-8">
          <button
            onClick={handleSimplify}
            className="
              inline-flex items-center px-6 py-3 rounded-lg
              bg-gradient-to-r from-blue-600 to-indigo-600
              text-white font-medium
              hover:from-blue-700 hover:to-indigo-700
              transform hover:scale-105
              transition-all duration-200
              shadow-lg hover:shadow-xl
              gap-2
            "
          >
            <FiFileText className="w-5 h-5" />
            Simplify Document
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-blue-200 dark:border-blue-900 rounded-full animate-spin">
              <div className="absolute top-0 right-0 w-12 h-12 border-4 border-blue-500 rounded-full animate-pulse"></div>
            </div>
          </div>
          <p className="text-gray-600 dark:text-gray-300">
            Processing your document...
          </p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-700 dark:text-red-400 text-center">
            {error}
          </p>
        </div>
      )}

      {/* Results */}
      {simplifiedContent && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Simplified Version
            </h3>
            <button className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              <FiDownload className="w-4 h-4" />
              Download
            </button>
          </div>
          <div className="prose dark:prose-invert max-w-none">
            <div className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
              {simplifiedContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 