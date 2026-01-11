"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  Download,
  CheckCircle2,
  AlertCircle,
  Eye,
  Sparkles,
  Package,
  Printer,
  Circle,
  Loader2,
  User,
  GraduationCap,
  FileCheck,
  DollarSign,
  Building,
  FolderOpen,
} from "lucide-react";
import { getApplicationReview } from "@/app/actions/application-review";
import { exportApplicationAsDocx } from "@/app/actions/export-application";
import { getApplicationCaseId } from "@/app/actions/application";
import { buildUrlWithCaseId } from "@/lib/utils";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import {
  ApplicationInfoSkeleton,
  DocumentCardSkeleton,
  FileItemSkeleton,
  ChecklistSkeleton,
  Skeleton,
} from "@/components/Skeleton";

interface Document {
  id: string;
  type: string;
  name: string;
  file_url: string;
  status: string;
}

interface GeneratedDocument {
  id: string;
  document_type: string;
  content: string;
  version: number;
  created_at: string;
}

export default function ReviewApplicationPage() {
  const params = useParams();
  const applicationId = params.id as string;

  const [uploadedDocs, setUploadedDocs] = useState<Document[]>([]);
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDocument[]>([]);
  const [applicationData, setApplicationData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadAllData();
  }, [applicationId]);

  async function loadAllData() {
    try {
      setLoading(true);
      
      const [reviewResult, caseIdResult] = await Promise.all([
        getApplicationReview(applicationId),
        getApplicationCaseId(applicationId),
      ]);

      if (reviewResult.success) {
        setUploadedDocs((reviewResult.uploadedDocuments || []) as Document[]);
        setGeneratedDocs((reviewResult.generatedDocuments || []) as GeneratedDocument[]);
        setApplicationData(reviewResult.aggregatedData);
      } else {
        setError(reviewResult.error || "Falha ao carregar dados da aplicação");
      }
      
      if (caseIdResult.success && caseIdResult.case_id) {
        setCaseId(caseIdResult.case_id);
      }
    } catch (err: any) {
      console.error("Error loading data:", err);
      setError(err.message || "Falha ao carregar dados da aplicação");
    } finally {
      setLoading(false);
    }
  }

  function getDocumentTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      cover_letter: "Carta de Apresentação",
      personal_statement: "Declaração Pessoal",
      program_justification: "Justificativa do Programa",
      ties_to_country: "Vínculos com o País de Origem",
      sponsor_letter: "Carta do Patrocinador",
      exhibit_list: "Lista de Exibições",
      passport: "Passaporte",
      i94: "I-94",
      i20: "I-20",
      bank_statement: "Extrato Bancário",
      sponsor_bank_statement: "Extrato Bancário do Patrocinador",
      assets: "Documentos de Bens",
      sponsor_assets: "Bens do Patrocinador",
      scholarship_document: "Carta de Concessão de Bolsa",
      other_funding: "Documentação de Outra Fonte de Financiamento",
      supporting_documents: "Documentos de Apoio",
    };
    return labels[type] || type;
  }

  function getDocumentIcon(type: string) {
    const docType = type.toLowerCase();
    if (docType.includes("passport")) {
      return <User className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
    }
    if (docType.includes("i94") || docType.includes("i-94")) {
      return <FileCheck className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
    }
    if (docType.includes("i20") || docType.includes("i-20")) {
      return <GraduationCap className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
    }
    if (docType.includes("bank") || docType.includes("statement")) {
      return <DollarSign className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
    }
    if (docType.includes("asset")) {
      return <Building className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
    }
    if (docType.includes("supporting") || docType.includes("ties")) {
      return <FolderOpen className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
    }
    return <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
  }

  async function handleDownloadAll() {
    try {
      setDownloading(true);
      const result = await exportApplicationAsDocx(applicationId);

      if (result.success && result.data) {
        const binaryString = atob(result.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.fileName || `Application-Package-${applicationId.substring(0, 8)}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert(result.error || "Falha ao exportar aplicação");
      }
    } catch (error: any) {
      console.error("Error downloading:", error);
      alert("Falha ao baixar pacote da aplicação");
    } finally {
      setDownloading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div>
        <Breadcrumbs
          items={[
            { label: "Aplicações", href: "/applications" },
            { label: "Revisar Aplicação", href: `#` },
          ]}
        />
        
        {/* Header Skeleton */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-9 w-64" />
          </div>
          <Skeleton className="ml-8 h-6 w-48 mb-2" />
          <Skeleton className="ml-8 h-5 w-96" />
        </div>

        {/* Application Info Skeleton */}
        <div className="mb-8">
          <ApplicationInfoSkeleton />
        </div>

        {/* Generated Documents Skeleton */}
        <div className="mb-8">
          <Skeleton className="h-7 w-48 mb-4" />
          <div className="space-y-4">
            <DocumentCardSkeleton />
            <DocumentCardSkeleton />
            <DocumentCardSkeleton />
          </div>
        </div>

        {/* Uploaded Documents Skeleton */}
        <div className="mb-8">
          <Skeleton className="h-7 w-48 mb-4" />
          <div className="space-y-3">
            <FileItemSkeleton />
            <FileItemSkeleton />
            <FileItemSkeleton />
            <FileItemSkeleton />
          </div>
        </div>

        {/* Checklist Skeleton */}
        <ChecklistSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Breadcrumbs
          items={[
            { label: "Aplicações", href: "/applications" },
            { label: "Documentos Necessários", href: buildUrlWithCaseId(`/applications/${applicationId}/documents`, caseId) },
          ]}
        />
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-red-600 dark:text-red-400">
          {error}
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
          { label: "Revisar Aplicação", href: buildUrlWithCaseId(`/applications/${applicationId}/review`, caseId) },
        ]}
      />

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <Package className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                Revisar Aplicação
              </h1>
            </div>
            {caseId && (
              <p className="ml-8 text-lg font-semibold text-gray-700 font-mono dark:text-gray-300">
                Case ID: {caseId}
              </p>
            )}
            <p className="ml-8 text-gray-600 dark:text-gray-400">
              Visão completa do pacote da sua aplicação de visto
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDownloadAll}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 text-sm font-semibold transition-all hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50"
            >
              {downloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Baixar DOCX
                </>
              )}
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
          </div>
        </div>
      </div>

      {/* Application Summary */}
      {applicationData && (
        <div className="mb-8 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
            Informações do Aplicante
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Nome</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {applicationData.user?.fullName || applicationData.user?.firstName || "Não fornecido"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Email</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {applicationData.user?.email || "Não fornecido"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">País</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {applicationData.application?.country || "Não fornecido"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Tipo de Visto</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {applicationData.application?.visaType || "Não fornecido"}
              </p>
            </div>
            {applicationData.application?.currentAddress && (
              <div className="md:col-span-2">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Endereço</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {applicationData.application.currentAddress.street}, {applicationData.application.currentAddress.city}, {applicationData.application.currentAddress.state} {applicationData.application.currentAddress.zipCode}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Generated Documents Section */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Documentos Gerados
          </h2>
          <Link
            href={buildUrlWithCaseId(`/applications/${applicationId}/documents/generate`, caseId)}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Gerar Mais
          </Link>
        </div>
        {generatedDocs.length > 0 ? (
          <div className="space-y-4">
            {generatedDocs.map((doc) => (
              <div
                key={doc.id}
                className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                      <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {getDocumentTypeLabel(doc.document_type)}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Versão {doc.version} • Gerado em {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const blob = new Blob([doc.content], { type: "text/plain" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${getDocumentTypeLabel(doc.document_type)}.txt`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <Download className="h-4 w-4" />
                    Baixar
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
                  <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100 font-mono">
                    {doc.content}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 text-center shadow-sm">
            <FileText className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              Nenhum documento gerado ainda. Gere documentos para começar.
            </p>
            <Link
              href={buildUrlWithCaseId(`/applications/${applicationId}/documents/generate`, caseId)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border-2 border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 text-sm font-semibold transition-all hover:bg-gray-800 dark:hover:bg-gray-100"
            >
              <Sparkles className="h-4 w-4" />
              Gerar Documentos
            </Link>
          </div>
        )}
      </div>

      {/* Uploaded Documents Section */}
      <div className="mb-8">
        <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
          Documentos Enviados
        </h2>
        {uploadedDocs.length > 0 ? (
          <div className="space-y-3">
            {uploadedDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    {getDocumentIcon(doc.type)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{doc.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {getDocumentTypeLabel(doc.type)} • {doc.status}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {doc.status === "completed" && (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  )}
                  {doc.status === "processing" && (
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
                  )}
                  {doc.status === "error" && (
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  )}
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <Eye className="h-4 w-4" />
                    Ver
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 text-center shadow-sm">
            <FileText className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              Nenhum documento enviado ainda.
            </p>
            <Link
              href={buildUrlWithCaseId(`/applications/${applicationId}/documents`, caseId)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border-2 border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 text-sm font-semibold transition-all hover:bg-gray-800 dark:hover:bg-gray-100"
            >
              Enviar Documentos
            </Link>
          </div>
        )}
      </div>

      {/* Application Checklist */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
          Checklist da Aplicação
        </h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {generatedDocs.some((d) => d.document_type === "cover_letter") ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <Circle className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            )}
            <span className={generatedDocs.some((d) => d.document_type === "cover_letter") ? "text-gray-900 dark:text-gray-100 font-medium" : "text-gray-600 dark:text-gray-400"}>
              Carta de Apresentação
            </span>
          </div>
          <div className="flex items-center gap-3">
            {generatedDocs.some((d) => d.document_type === "personal_statement") ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <Circle className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            )}
            <span className={generatedDocs.some((d) => d.document_type === "personal_statement") ? "text-gray-900 dark:text-gray-100 font-medium" : "text-gray-600 dark:text-gray-400"}>
              Declaração Pessoal
            </span>
          </div>
          <div className="flex items-center gap-3">
            {generatedDocs.some((d) => d.document_type === "exhibit_list") ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <Circle className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            )}
            <span className={generatedDocs.some((d) => d.document_type === "exhibit_list") ? "text-gray-900 dark:text-gray-100 font-medium" : "text-gray-600 dark:text-gray-400"}>
              Lista de Exibições
            </span>
          </div>
          <div className="flex items-center gap-3">
            {uploadedDocs.some((d) => d.type === "passport") ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <Circle className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            )}
            <span className={uploadedDocs.some((d) => d.type === "passport") ? "text-gray-900 dark:text-gray-100 font-medium" : "text-gray-600 dark:text-gray-400"}>
              Passaporte
            </span>
          </div>
          <div className="flex items-center gap-3">
            {uploadedDocs.some((d) => d.type === "i20") ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <Circle className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            )}
            <span className={uploadedDocs.some((d) => d.type === "i20") ? "text-gray-900 dark:text-gray-100 font-medium" : "text-gray-600 dark:text-gray-400"}>
              Certificado I-20
            </span>
          </div>
          <div className="flex items-center gap-3">
            {uploadedDocs.some((d) => d.type === "i94") ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <Circle className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            )}
            <span className={uploadedDocs.some((d) => d.type === "i94") ? "text-gray-900 dark:text-gray-100 font-medium" : "text-gray-600 dark:text-gray-400"}>
              Registro I-94
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
