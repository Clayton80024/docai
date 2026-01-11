"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { FileText, File } from "lucide-react";

// Configure pdf.js worker once at module level
if (typeof window !== "undefined") {
  // Set worker source when module loads
  import("pdfjs-dist").then((pdfjsLib) => {
    const workerUrl = `${window.location.origin}/pdfjs/pdf.worker.min.mjs`;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  }).catch(() => {
    // Silently fail if pdfjs-dist is not available
  });
}

interface FileThumbnailProps {
  fileUrl: string;
  mimeType: string;
  fileName: string;
  className?: string;
  documentId?: string; // Optional document ID for API thumbnail generation
}

export function FileThumbnail({
  fileUrl,
  mimeType,
  fileName,
  className = "",
  documentId,
}: FileThumbnailProps) {
  const [previewError, setPreviewError] = useState(false);
  const [pdfThumbnailUrl, setPdfThumbnailUrl] = useState<string | null>(null);
  const [isLoadingThumbnail, setIsLoadingThumbnail] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [clientRenderUrl, setClientRenderUrl] = useState<string | null>(null);

  const isImage = mimeType?.startsWith("image/") || false;
  // Check for PDF by mime type or file extension
  const isPDF = mimeType === "application/pdf" || fileName?.toLowerCase().endsWith(".pdf") || false;

  // Load PDF thumbnail from API
  useEffect(() => {
    if (!isPDF || previewError || pdfThumbnailUrl) return;

    let cancelled = false;

    const loadThumbnail = async () => {
      try {
        setIsLoadingThumbnail(true);
        
        // Build API URL
        const params = new URLSearchParams();
        if (documentId) {
          params.append("documentId", documentId);
        } else {
          params.append("fileUrl", fileUrl);
        }
        
        const apiUrl = `/api/files/thumbnail?${params.toString()}`;
        const response = await fetch(apiUrl);
        
        if (cancelled) return;
        
        if (response.ok) {
          const contentType = response.headers.get("content-type");
          
          // If it's an image (PNG), use it directly
          if (contentType?.startsWith("image/")) {
            const blob = await response.blob();
            if (cancelled) return;
            const url = URL.createObjectURL(blob);
            setPdfThumbnailUrl(url);
          } else {
            // If it's JSON, it means server-side rendering is not available
            // Try client-side rendering with pdf.js
            try {
              const data = await response.json();
              if (data.renderOnClient && data.fileUrl) {
                // Server-side rendering not available, try client-side rendering
                console.log("Server-side thumbnail rendering not available, attempting client-side rendering");
                await renderPdfOnClient(data.fileUrl);
              } else if (data.error) {
                console.error("Thumbnail API error:", data.error);
                setPreviewError(true);
              }
            } catch (jsonError) {
              // Response is not JSON, might be an error
              console.error("Failed to parse thumbnail response:", jsonError);
              setPreviewError(true);
            }
          }
        } else {
          // Response not OK - log the error but don't necessarily show error state
          const errorText = await response.text().catch(() => "Unknown error");
          console.error("Thumbnail API returned error:", response.status, errorText);
          setPreviewError(true);
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Error loading PDF thumbnail:", error);
        setPreviewError(true);
      } finally {
        if (!cancelled) {
          setIsLoadingThumbnail(false);
        }
      }
    };

    loadThumbnail();

    return () => {
      cancelled = true;
    };
  }, [isPDF, fileUrl, documentId]);

  // Clean up blob URLs when component unmounts
  useEffect(() => {
    return () => {
      if (pdfThumbnailUrl) {
        URL.revokeObjectURL(pdfThumbnailUrl);
      }
      if (clientRenderUrl) {
        URL.revokeObjectURL(clientRenderUrl);
      }
    };
  }, [pdfThumbnailUrl, clientRenderUrl]);

  // Client-side PDF rendering with pdf.js
  const renderPdfOnClient = async (pdfUrl: string) => {
    try {
      // Dynamically import pdfjs-dist
      const pdfjsLib = await import("pdfjs-dist");
      
      // Ensure worker is configured (should already be set at module level, but set again to be safe)
      if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
        const workerUrl = `${window.location.origin}/pdfjs/pdf.worker.min.mjs`;
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      } else if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        // Fallback for SSR or if not set
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      }

      // Load PDF with error handling
      const loadingTask = pdfjsLib.getDocument({
        url: pdfUrl,
        verbosity: 0, // Reduce console output
      });
      const pdf = await loadingTask.promise;

      // Get first page
      const page = await pdf.getPage(1);

      // Calculate viewport for thumbnail
      const viewport = page.getViewport({ scale: 1.0 });
      const scale = Math.min(400 / viewport.width, 2.0);
      const scaledViewport = page.getViewport({ scale });

      // Create canvas element
      const canvas = document.createElement("canvas");
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Failed to get canvas context");
      }

      // Set white background
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);

      // Render PDF page to canvas
      const renderContext = {
        canvasContext: context,
        viewport: scaledViewport,
      };

      await page.render(renderContext).promise;

      // Convert canvas to blob URL
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setClientRenderUrl(url);
          setPdfThumbnailUrl(url);
        } else {
          setPreviewError(true);
        }
      }, "image/png");
    } catch (error) {
      console.error("Error rendering PDF on client:", error);
      setPreviewError(true);
    }
  };

  // For images, use the URL directly with modern styling
  if (isImage) {
    return (
      <div className={`relative bg-gradient-to-br from-gray-50 to-gray-100 ${className} rounded-lg overflow-hidden`}>
        <Image
          src={fileUrl}
          alt={fileName}
          fill
          className="object-cover rounded-lg"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          onError={() => setPreviewError(true)}
        />
        {/* Subtle overlay for better visual */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent pointer-events-none"></div>
      </div>
    );
  }

  // For PDFs, show real thumbnail if available, otherwise styled preview
  if (isPDF) {
    // Show real PDF thumbnail if loaded (from server or client rendering)
    if (pdfThumbnailUrl && !previewError) {
      return (
        <div className={`relative ${className} overflow-hidden rounded-lg bg-white`}>
          <Image
            src={pdfThumbnailUrl}
            alt={`Preview of ${fileName}`}
            fill
            className="object-contain"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            onError={() => setPreviewError(true)}
          />
          {/* PDF badge overlay */}
          <div className="absolute bottom-2 right-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-full px-2.5 py-1 shadow-lg flex items-center gap-1.5 z-10">
            <FileText className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">PDF</span>
          </div>
        </div>
      );
    }

    // Show loading or styled preview fallback
    return (
      <div 
        className={`relative ${className} overflow-hidden rounded-lg`} 
        style={{ 
          background: 'linear-gradient(135deg, #fef2f2 0%, #ffffff 50%, #fef2f2 100%)',
          width: '100%', 
          height: '100%' 
        }}
      >
        <div 
          className="absolute inset-0 flex items-center justify-center p-3" 
          style={{ zIndex: 1 }}
        >
          {isLoadingThumbnail ? (
            // Loading state
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mb-2"></div>
              <p className="text-xs text-red-600">Loading preview...</p>
            </div>
          ) : (
            // Styled preview fallback
            <div className="w-full h-full flex flex-col justify-center items-center">
              {/* Modern PDF document preview */}
              <div className="relative w-full max-w-[85%] aspect-[8.5/11] flex-shrink-0">
                {/* Elegant shadow layers for depth */}
                <div className="absolute -bottom-1 -right-1 inset-0 bg-gradient-to-br from-red-200/40 to-red-100/20 rounded-md transform rotate-1 shadow-lg"></div>
                <div className="absolute -bottom-0.5 -right-0.5 inset-0 bg-red-100/30 rounded-md transform rotate-0.5"></div>
                
                {/* Main document with modern design */}
                <div 
                  className="relative bg-white rounded-md shadow-md p-3 h-full flex flex-col border border-red-200/50" 
                  style={{ backgroundColor: '#ffffff' }}
                >
                  {/* Document header with gradient */}
                  <div className="mb-2 pb-2 border-b-2 border-red-200/60">
                    <div className="h-2 bg-gradient-to-r from-red-500/60 to-red-400/40 rounded w-full mb-1.5"></div>
                    <div className="h-1 bg-gradient-to-r from-red-400/50 to-red-300/30 rounded w-4/5"></div>
                  </div>
                  
                  {/* Document content with varied line lengths */}
                  <div className="flex-1 space-y-1 pt-1.5">
                    <div className="h-1 bg-gray-500/35 rounded-full w-full"></div>
                    <div className="h-1 bg-gray-400/35 rounded-full w-[97%]"></div>
                    <div className="h-1 bg-gray-500/35 rounded-full w-[93%]"></div>
                    <div className="h-1 bg-gray-400/35 rounded-full w-full mt-1"></div>
                    <div className="h-1 bg-gray-500/35 rounded-full w-[90%]"></div>
                    <div className="h-1 bg-gray-400/35 rounded-full w-[95%]"></div>
                    <div className="h-1 bg-gray-500/35 rounded-full w-[88%] mt-1"></div>
                  </div>
                  
                  {/* Modern PDF icon badge */}
                  <div className="absolute top-2 right-2 bg-gradient-to-br from-red-600 to-red-700 rounded-full p-1.5 shadow-lg z-10">
                    <FileText className="h-3 w-3 text-white" />
                  </div>
                </div>
              </div>
              
              {/* Elegant PDF badge */}
              <div className="mt-2 flex-shrink-0 text-center">
                <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-full px-3 py-1 shadow-md">
                  <FileText className="h-3 w-3" />
                  <span className="text-xs font-bold">PDF</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // For other file types, show modern styled icon
  const fileExtension = fileName.split(".").pop()?.toUpperCase() || "FILE";
  const getFileColor = (ext: string) => {
    const colors: Record<string, { bg: string; icon: string }> = {
      DOC: { bg: "from-blue-50 to-blue-100", icon: "text-blue-600" },
      DOCX: { bg: "from-blue-50 to-blue-100", icon: "text-blue-600" },
      XLS: { bg: "from-green-50 to-green-100", icon: "text-green-600" },
      XLSX: { bg: "from-green-50 to-green-100", icon: "text-green-600" },
      PPT: { bg: "from-orange-50 to-orange-100", icon: "text-orange-600" },
      PPTX: { bg: "from-orange-50 to-orange-100", icon: "text-orange-600" },
      TXT: { bg: "from-gray-50 to-gray-100", icon: "text-gray-600" },
      ZIP: { bg: "from-purple-50 to-purple-100", icon: "text-purple-600" },
      RAR: { bg: "from-purple-50 to-purple-100", icon: "text-purple-600" },
    };
    return colors[ext] || { bg: "from-gray-50 to-gray-100", icon: "text-gray-600" };
  };

  const fileStyle = getFileColor(fileExtension);

  return (
    <div 
      className={`relative bg-gradient-to-br ${fileStyle.bg} ${className} flex items-center justify-center rounded-lg border border-gray-200/50`}
      style={{ width: '100%', height: '100%', zIndex: 1 }}
    >
      <div className="text-center p-4">
        <div className="relative mx-auto mb-3">
          {/* Modern shadow effect */}
          <div className="absolute inset-0 bg-white/40 rounded-xl transform rotate-3 blur-sm"></div>
          <div className="relative bg-white/90 backdrop-blur-sm border-2 border-gray-200/50 rounded-xl p-4 shadow-lg">
            <File className={`h-10 w-10 ${fileStyle.icon} mx-auto`} />
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/80 backdrop-blur-sm rounded-full shadow-sm border border-gray-200/50">
          <span className="text-xs font-bold text-gray-700">{fileExtension}</span>
        </div>
      </div>
    </div>
  );
}

