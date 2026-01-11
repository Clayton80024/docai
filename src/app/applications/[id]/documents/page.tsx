"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  FileText,
  CheckCircle2,
  Circle,
  AlertCircle,
  DollarSign,
  Users,
  Globe,
  FileCheck,
  Sparkles,
  FolderOpen,
  X,
  Plus,
  Target,
} from "lucide-react";
import { HelpTooltip } from "@/components/HelpTooltip";
import {
  type DocumentRequirements,
  getDocumentSummary,
  type RequiredDocument,
} from "@/lib/document-requirements";
import { getDocumentRequirements, getUploadedDocuments, deleteDocument } from "@/app/actions/documents";
import { uploadDocument } from "@/app/actions/upload";
import { getApplicationCaseId } from "@/app/actions/application";
import { buildUrlWithCaseId } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Skeleton } from "@/components/Skeleton";

const categoryIcons: Record<string, React.ReactNode> = {
  "Documentos Obrigatórios": <FileCheck className="h-5 w-5 text-gray-600 dark:text-gray-400" />,
  "Vínculos com o País": <Globe className="h-5 w-5 text-gray-600 dark:text-gray-400" />,
  "Vínculos com o País (Opcional)": <Globe className="h-5 w-5 text-gray-600 dark:text-gray-400" />,
  "Dependentes": <Users className="h-5 w-5 text-gray-600 dark:text-gray-400" />,
  "Dependentes (Opcional)": <Users className="h-5 w-5 text-gray-600 dark:text-gray-400" />,
  "Recursos Financeiros do Aplicante": <DollarSign className="h-5 w-5 text-gray-600 dark:text-gray-400" />,
  "Recursos Financeiros do Patrocinador": <DollarSign className="h-5 w-5 text-gray-600 dark:text-gray-400" />,
  "Recursos Financeiros (Bolsa)": <DollarSign className="h-5 w-5 text-gray-600 dark:text-gray-400" />,
  "Recursos Financeiros (Outro)": <DollarSign className="h-5 w-5 text-gray-600 dark:text-gray-400" />,
  // Keep old labels for backward compatibility
  "Suporte Financeiro (Auto-financiado)": <DollarSign className="h-5 w-5 text-gray-600 dark:text-gray-400" />,
  "Suporte Financeiro (Patrocinador)": <DollarSign className="h-5 w-5 text-gray-600 dark:text-gray-400" />,
  "Suporte Financeiro (Bolsa)": <DollarSign className="h-5 w-5 text-gray-600 dark:text-gray-400" />,
  "Suporte Financeiro (Outro)": <DollarSign className="h-5 w-5 text-gray-600 dark:text-gray-400" />,
};

interface UploadedDocument {
  id: string;
  type: string;
  name: string;
  file_size?: number;
}

export default function ApplicationDocumentsPage() {
  const params = useParams();
  const applicationId = params.id as string;

  const [requirements, setRequirements] =
    useState<DocumentRequirements | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadedDocuments, setUploadedDocuments] = useState<
    Record<string, boolean>
  >({});
  const [uploadedDocumentsList, setUploadedDocumentsList] = useState<
    UploadedDocument[]
  >([]);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadError, setUploadError] = useState<Record<string, string>>({});
  const [caseId, setCaseId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        
        const [requirementsResult, documentsResult, caseIdResult] = await Promise.all([
          getDocumentRequirements(applicationId),
          getUploadedDocuments(applicationId),
          getApplicationCaseId(applicationId),
        ]);
        
        if (caseIdResult.success && caseIdResult.case_id) {
          setCaseId(caseIdResult.case_id);
        }

        if (requirementsResult.success && requirementsResult.requirements) {
          setRequirements(requirementsResult.requirements);
        } else {
          setError(requirementsResult.error || "Aplicação não encontrada ou dados do formulário ausentes");
        }

        if (documentsResult.success && documentsResult.documents) {
          const uploaded = documentsResult.documents.reduce(
            (acc, doc) => {
              acc[doc.type] = true;
              return acc;
            },
            {} as Record<string, boolean>
          );
          setUploadedDocuments(uploaded);
          setUploadedDocumentsList(
            documentsResult.documents.map((doc) => ({
              id: doc.id,
              type: doc.type,
              name: doc.name,
              file_size: doc.file_size,
            }))
          );
        }
      } catch (err: any) {
        console.error("Error loading data:", err);
        setError(err.message || "Falha ao carregar requisitos de documentos");
      } finally {
        setLoading(false);
      }
    }

    if (applicationId) {
      loadData();
    }
  }, [applicationId]);

  const handleDelete = async (documentId: string, documentType: string) => {
    setDeleting((prev) => ({ ...prev, [documentId]: true }));
    try {
      const result = await deleteDocument(documentId);
      if (result.success) {
        setUploadedDocumentsList((prev) => prev.filter((doc) => doc.id !== documentId));
        
        // Check if there are any other documents of this type
        const hasOtherDocumentsOfType = uploadedDocumentsList.some(
          (doc) => doc.type === documentType && doc.id !== documentId
        );
        
        if (!hasOtherDocumentsOfType) {
          setUploadedDocuments((prev) => {
            const newState = { ...prev };
            delete newState[documentType];
            return newState;
          });
        }
      } else {
        setUploadError((prev) => ({
          ...prev,
          [documentId]: result.error || "Falha ao deletar documento",
        }));
      }
    } catch (err: any) {
      setUploadError((prev) => ({
        ...prev,
        [documentId]: err.message || "Falha ao deletar documento",
      }));
    } finally {
      setDeleting((prev) => {
        const newState = { ...prev };
        delete newState[documentId];
        return newState;
      });
    }
  };

  const handleFileUpload = async (
    doc: RequiredDocument,
    files: FileList | null
  ) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);

    for (const file of fileArray) {
      setUploading((prev) => ({ ...prev, [`${doc.id}-${file.name}`]: true }));
      setUploadError((prev) => {
        const newErrors = { ...prev };
        delete newErrors[`${doc.id}-${file.name}`];
        return newErrors;
      });

      try {
        const result = await uploadDocument(
          applicationId,
          doc.type,
          `${doc.label} - ${file.name}`,
          file
        );

        if (result.success && result.document) {
          setUploadedDocuments((prev) => ({
            ...prev,
            [doc.type]: true,
          }));
          setUploadedDocumentsList((prev) => [
            ...prev,
            {
              id: result.document.id,
              type: doc.type,
              name: result.document.name,
              file_size: result.document.file_size,
            },
          ]);
        } else {
          setUploadError((prev) => ({
            ...prev,
            [`${doc.id}-${file.name}`]: result.error || "Falha no upload",
          }));
        }
      } catch (err: any) {
        setUploadError((prev) => ({
          ...prev,
          [`${doc.id}-${file.name}`]: err.message || "Falha no upload",
        }));
      } finally {
        setUploading((prev) => {
          const newState = { ...prev };
          delete newState[`${doc.id}-${file.name}`];
          return newState;
        });
      }
    }
  };

  if (loading) {
    return (
      <div>
        <Breadcrumbs
          items={[
            { label: "Aplicações", href: "/applications" },
            { label: "Documentos Necessários", href: `#` },
          ]}
        />
        
        {/* Header Skeleton */}
        <div className="mb-8">
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>

        {/* Document Categories Skeleton */}
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
              <Skeleton className="h-6 w-48 mb-4" />
              <div className="space-y-3">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-5 w-5 rounded-full" />
                      <Skeleton className="h-5 w-64" />
                    </div>
                    <Skeleton className="h-9 w-32" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !requirements) {
    return (
      <div>
        <div className="mx-auto max-w-2xl">
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-gray-900 p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-4 h-16 w-16 text-red-600 dark:text-red-400" />
            <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
              Erro ao Carregar Requisitos
            </h2>
            <p className="mb-6 text-gray-600 dark:text-gray-400">{error || "Aplicação não encontrada"}</p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-3 text-sm font-semibold transition-all hover:bg-gray-800 dark:hover:bg-gray-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const summary = getDocumentSummary(requirements);
  const totalUploaded = Object.values(uploadedDocuments).filter(Boolean).length;
  const progress = requirements.totalRequired > 0 
    ? (totalUploaded / requirements.totalRequired) * 100 
    : 0;

  // Traduzir categorias
  const translatedCategories: Record<string, string> = {
    "Required Documents": "Documentos Obrigatórios",
    "Ties to Country": "Vínculos com o País (Opcional)",
    "Vínculos com o País (Opcional)": "Vínculos com o País (Opcional)",
    "Dependents": "Dependentes",
    "Dependents (Optional)": "Dependentes (Opcional)",
    "Recursos Financeiros do Aplicante": "Recursos Financeiros do Aplicante",
    "Recursos Financeiros do Patrocinador": "Recursos Financeiros do Patrocinador",
    "Recursos Financeiros (Bolsa)": "Recursos Financeiros (Bolsa)",
    "Recursos Financeiros (Outro)": "Recursos Financeiros (Outro)",
    // Keep old labels for backward compatibility
    "Financial Support (Self-funded)": "Recursos Financeiros do Aplicante",
    "Financial Support (Sponsor)": "Recursos Financeiros do Patrocinador",
    "Financial Support (Scholarship)": "Recursos Financeiros (Bolsa)",
    "Financial Support (Other)": "Recursos Financeiros (Outro)",
    "Suporte Financeiro (Auto-financiado)": "Recursos Financeiros do Aplicante",
    "Suporte Financeiro (Patrocinador)": "Recursos Financeiros do Patrocinador",
    "Suporte Financeiro (Bolsa)": "Recursos Financeiros (Bolsa)",
    "Suporte Financeiro (Outro)": "Recursos Financeiros (Outro)",
  };

  return (
    <div>
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: "Aplicações", href: "/applications" },
          { label: "Documentos Necessários", href: buildUrlWithCaseId(`/applications/${applicationId}/documents`, caseId) },
        ]}
      />

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Documentos Necessários
            </h1>
            {caseId && (
              <p className="mt-2 text-lg font-semibold text-gray-700 font-mono dark:text-gray-300">
                Case ID: {caseId}
              </p>
            )}
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Faça upload dos seguintes documentos com base nas informações da sua aplicação
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildUrlWithCaseId(`/applications/${applicationId}/files`, caseId)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-all hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <FolderOpen className="h-4 w-4" />
              Ver Arquivos
            </Link>
            <Link
              href={buildUrlWithCaseId(`/applications/${applicationId}/documents/generate`, caseId)}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 text-sm font-semibold transition-all hover:bg-gray-800 dark:hover:bg-gray-100"
            >
              <Sparkles className="h-4 w-4" />
              Gerar Documentos
            </Link>
            <Link
              href={buildUrlWithCaseId(`/applications/${applicationId}/review`, caseId)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-all hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <FileCheck className="h-4 w-4" />
              Revisar
            </Link>
          </div>
        </div>
      </div>

      {/* Progress Summary - Minimalista */}
      <div className="mb-8 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <Target className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Progresso do Upload
            </h2>
          </div>
          <span className="rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
            {totalUploaded} de {requirements.totalRequired} documentos
          </span>
        </div>
        <div className="mb-2 h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full bg-gray-900 dark:bg-white transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {progress.toFixed(0)}% completo
        </p>
      </div>

      {/* Document Categories */}
      <div className="space-y-6">
        {summary.byCategory.map((category) => {
          const categoryName = translatedCategories[category.category] || category.category;
          
          return (
            <div
              key={category.category}
              className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  {categoryIcons[categoryName] || (
                    <FileText className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {categoryName}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {category.count} documento{category.count !== 1 ? "s" : ""} necessário{category.count !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {category.documents.map((doc) => {
                  const documentsOfThisType = uploadedDocumentsList.filter(
                    (uploaded) => uploaded.type === doc.type
                  );
                  const isUploaded = documentsOfThisType.length > 0;
                  const needsMultiple = doc.quantity && doc.quantity > 1;
                  const isDependentCategory = doc.category === "dependents";
                  const isTiesToCountryCategory = doc.category === "ties_to_country";
                  const isFinancialCategory = 
                    doc.category === "financial_self" || 
                    doc.category === "financial_sponsor" || 
                    doc.category === "financial_scholarship" || 
                    doc.category === "financial_other";
                  const allowsMultipleUploads = isDependentCategory || isTiesToCountryCategory || isFinancialCategory;

                  return (
                    <div
                      key={doc.id}
                      className={`rounded-lg border p-4 transition-all ${
                        isUploaded
                          ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
                          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="mb-2 flex items-center gap-2">
                            {isUploaded ? (
                              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                            ) : (
                              <Circle className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                            )}
                            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                              {doc.label}
                              {needsMultiple && (
                                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                                  ({doc.quantity} necessário{doc.quantity !== 1 ? "s" : ""})
                                </span>
                              )}
                              {isDependentCategory && (
                                <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                                  Opcional - Pule se não tiver dependentes
                                </span>
                              )}
                              {isTiesToCountryCategory && (
                                <span className="ml-2 inline-flex items-center rounded-full bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-300">
                                  Opcional - Mas recomendado para fortalecer a aplicação
                                </span>
                              )}
                              {isFinancialCategory && !doc.required && (
                                <span className="ml-2 inline-flex items-center rounded-full bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-2.5 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-300">
                                  {doc.required ? "Obrigatório" : "Opcional - Se aplicável"}
                                </span>
                              )}
                            </h4>
                          </div>
                          {doc.description && (
                            <p className="ml-8 text-sm text-gray-600 dark:text-gray-400">
                              {doc.description}
                            </p>
                          )}

                          {/* Lista de arquivos enviados */}
                          {documentsOfThisType.length > 0 && (
                            <div className="ml-8 mt-3 space-y-2">
                              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                Arquivos enviados ({documentsOfThisType.length}):
                              </p>
                              {documentsOfThisType.map((uploadedDoc) => (
                                <div
                                  key={uploadedDoc.id}
                                  className="flex items-center justify-between rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2"
                                >
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                      {uploadedDoc.name}
                                    </span>
                                    {uploadedDoc.file_size && (
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        ({(uploadedDoc.file_size / 1024 / 1024).toFixed(2)} MB)
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => handleDelete(uploadedDoc.id, uploadedDoc.type)}
                                    disabled={deleting[uploadedDoc.id]}
                                    className="rounded-lg p-1 text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                                  >
                                    {deleting[uploadedDoc.id] ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <X className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <input
                            type="file"
                            id={`file-${doc.id}`}
                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                            multiple={allowsMultipleUploads}
                            className="hidden"
                            onChange={(e) => {
                              handleFileUpload(doc, e.target.files);
                              e.target.value = "";
                            }}
                            disabled={uploading[doc.id]}
                          />
                          <label
                            htmlFor={`file-${doc.id}`}
                            className={`cursor-pointer rounded-lg px-5 py-2.5 text-sm font-semibold transition-all ${
                              isUploaded
                                ? "border-2 border-gray-900 dark:border-white bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
                                : uploading[doc.id]
                                ? "bg-gray-300 text-gray-600 cursor-wait dark:bg-gray-700 dark:text-gray-400"
                                : "border-2 border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100"
                            }`}
                          >
                            {uploading[doc.id] ? (
                              <span className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Enviando...
                              </span>
                            ) : isUploaded ? (
                              <span className="flex items-center gap-2">
                                <Plus className="h-4 w-4" />
                                {allowsMultipleUploads ? "Adicionar Mais" : "Substituir"}
                              </span>
                            ) : (
                              <span className="flex items-center gap-2">
                                <Upload className="h-4 w-4" />
                                {allowsMultipleUploads ? "Enviar Arquivos" : "Enviar Arquivo"}
                              </span>
                            )}
                          </label>
                          {uploadError[doc.id] && (
                            <p className="text-xs text-red-600 dark:text-red-400">
                              {uploadError[doc.id]}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info Box - Minimalista */}
      <div className="mt-8 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <AlertCircle className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </div>
          <div>
            <h3 className="mb-2 text-lg font-bold text-gray-900 dark:text-gray-100">
              Diretrizes de Upload de Documentos
            </h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-600 dark:bg-gray-400" />
                <span>Faça upload de scans ou fotos claras e de alta qualidade dos documentos</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-600 dark:bg-gray-400" />
                <span>Certifique-se de que todo o texto está legível e os documentos não estão expirados</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-600 dark:bg-gray-400" />
                <span>Para dependentes, você pode enviar múltiplos arquivos de uma vez ou adicionar um por vez</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-600 dark:bg-gray-400" />
                <span>Os documentos serão processados automaticamente usando IA para extrair informações</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
