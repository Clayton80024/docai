"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  FileText,
  File,
  Download,
  Eye,
  Search,
  X,
  User,
  GraduationCap,
  DollarSign,
  Building,
  FileCheck,
  FolderOpen,
} from "lucide-react";
import { getApplicationFiles } from "@/app/actions/documents";
import { getApplicationCaseId } from "@/app/actions/application";
import { buildUrlWithCaseId } from "@/lib/utils";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FileItemSkeleton, Skeleton } from "@/components/Skeleton";

interface ApplicationFile {
  id: string;
  name: string;
  type: string;
  mime_type: string;
  file_url: string;
  file_size: number;
  created_at: string;
  status: string;
}

export default function ApplicationFilesPage() {
  const params = useParams();
  const applicationId = params.id as string;

  const [files, setFiles] = useState<ApplicationFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState<ApplicationFile | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [caseId, setCaseId] = useState<string | null>(null);

  useEffect(() => {
    async function loadFiles() {
      try {
        setLoading(true);
        const [filesResult, caseIdResult] = await Promise.all([
          getApplicationFiles(applicationId),
          getApplicationCaseId(applicationId),
        ]);

        if (filesResult.success && filesResult.files) {
          setFiles(filesResult.files);
        } else {
          setError(filesResult.error || "Falha ao carregar arquivos");
        }
        
        if (caseIdResult.success && caseIdResult.case_id) {
          setCaseId(caseIdResult.case_id);
        }
      } catch (err: any) {
        console.error("Error loading files:", err);
        setError(err.message || "Falha ao carregar arquivos");
      } finally {
        setLoading(false);
      }
    }

    if (applicationId) {
      loadFiles();
    }
  }, [applicationId]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isImage = (mimeType: string): boolean => {
    return mimeType.startsWith("image/");
  };

  const isPDF = (mimeType: string): boolean => {
    return mimeType === "application/pdf";
  };

  // Get icon based on document type
  const getDocumentTypeIcon = (documentType: string) => {
    const type = documentType.toLowerCase();
    
    if (type.includes("passport")) {
      return <User className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
    }
    if (type.includes("i94") || type.includes("i-94")) {
      return <FileCheck className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
    }
    if (type.includes("i20") || type.includes("i-20")) {
      return <GraduationCap className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
    }
    if (type.includes("bank") || type.includes("statement")) {
      return <DollarSign className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
    }
    if (type.includes("asset")) {
      return <Building className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
    }
    if (type.includes("supporting") || type.includes("ties")) {
      return <FolderOpen className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
    }
    
    return <FileText className="h-5 w-5 text-gray-400 dark:text-gray-500" />;
  };

  // Get document type label
  const getDocumentTypeLabel = (documentType: string, fileName: string): string => {
    const type = documentType.toLowerCase();
    
    if (type.includes("passport")) {
      return type.includes("dependent") ? "Passaporte de Dependente" : "Passaporte";
    }
    if (type.includes("i94") || type.includes("i-94")) {
      return type.includes("dependent") ? "I-94 de Dependente" : "I-94";
    }
    if (type.includes("i20") || type.includes("i-20")) {
      return type.includes("dependent") ? "I-20 F-2 de Dependente" : "I-20";
    }
    if (type.includes("bank") || type.includes("statement")) {
      return type.includes("sponsor") ? "Extrato Bancário do Patrocinador" : "Extrato Bancário";
    }
    if (type.includes("asset")) {
      return type.includes("sponsor") ? "Bens do Patrocinador" : "Bens";
    }
    if (type.includes("supporting") || type.includes("ties")) {
      return "Documentos de Vínculos";
    }
    
    return documentType || fileName;
  };

  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleFileClick = (file: ApplicationFile) => {
    if (isImage(file.mime_type)) {
      setSelectedFile(file);
      setPreviewOpen(true);
    } else if (isPDF(file.mime_type)) {
      const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(file.file_url)}&embedded=true`;
      window.open(viewerUrl, "_blank");
    } else {
      window.open(file.file_url, "_blank");
    }
  };

  const handleDownload = (file: ApplicationFile, e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(file.file_url, "_blank");
  };

  if (loading) {
    return (
      <div>
        <Breadcrumbs
          items={[
            { label: "Aplicações", href: "/applications" },
            { label: "Arquivos", href: `#` },
          ]}
        />
        
        {/* Header Skeleton */}
        <div className="mb-8">
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>

        {/* Files Grid Skeleton */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <FileItemSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <Link
            href={buildUrlWithCaseId(`/applications/${applicationId}/documents`, caseId)}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            Voltar para documentos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: "Aplicações", href: "/applications" },
          { label: "Documentos Necessários", href: buildUrlWithCaseId(`/applications/${applicationId}/documents`, caseId) },
          { label: "Ver Arquivos", href: buildUrlWithCaseId(`/applications/${applicationId}/files`, caseId) },
        ]}
      />

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link
                href={buildUrlWithCaseId(`/applications/${applicationId}/documents`, caseId)}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                Todos os Arquivos
              </h1>
            </div>
            {caseId && (
              <p className="ml-8 text-lg font-semibold text-gray-700 font-mono dark:text-gray-300">
                Case ID: {caseId}
              </p>
            )}
            <p className="ml-8 text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{filteredFiles.length}</span> arquivo{filteredFiles.length !== 1 ? "s" : ""} 
              {searchQuery && ` encontrado${filteredFiles.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
            <input
              type="text"
              placeholder="Buscar arquivos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      {filteredFiles.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
          <File className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            {searchQuery ? "Nenhum arquivo corresponde à busca" : "Nenhum arquivo enviado ainda"}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          {filteredFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center p-4 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-200 dark:border-gray-800 last:border-b-0 cursor-pointer transition-colors"
              onClick={() => handleFileClick(file)}
            >
              {/* Document Type Icon */}
              <div className="flex-shrink-0 w-14 h-14 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                {getDocumentTypeIcon(file.type)}
              </div>
              
              {/* File Info */}
              <div className="ml-4 flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {getDocumentTypeLabel(file.type, file.name)}
                  </p>
                  {file.name !== getDocumentTypeLabel(file.type, file.name) && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                      ({file.name})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatFileSize(file.file_size)}
                  </p>
                  <span className="text-xs text-gray-400 dark:text-gray-600">•</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(file.created_at)}
                  </p>
                  <span className="text-xs text-gray-400 dark:text-gray-600">•</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {file.type}
                  </p>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFileClick(file);
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  title="Ver arquivo"
                >
                  <Eye className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </button>
                <button
                  onClick={(e) => handleDownload(file, e)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  title="Baixar arquivo"
                >
                  <Download className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image Preview Modal */}
      {previewOpen && selectedFile && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewOpen(false)}
        >
          <div className="relative max-w-7xl max-h-full">
            <button
              onClick={() => setPreviewOpen(false)}
              className="absolute top-4 right-4 z-10 p-2 bg-white dark:bg-gray-900 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 transition-colors"
            >
              <X className="h-6 w-6 text-gray-900 dark:text-gray-100" />
            </button>
            <div className="bg-white dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
              <div className="relative max-h-[80vh] max-w-[90vw]">
                <Image
                  src={selectedFile.file_url}
                  alt={selectedFile.name}
                  width={1200}
                  height={1200}
                  className="object-contain max-h-[80vh] max-w-[90vw]"
                />
              </div>
              <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedFile.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {formatFileSize(selectedFile.file_size)} • {formatDate(selectedFile.created_at)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
