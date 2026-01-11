"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Sparkles,
  Loader2,
  CheckCircle2,
  Edit,
  Download,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import {
  generateCoverLetter,
  generatePersonalStatement,
  generateExhibitList,
  getGeneratedDocuments,
  generateCoverLetterPdfAction,
  generateCombinedPdf,
} from "@/app/actions/generate-documents";
import { getApplicationCaseId } from "@/app/actions/application";
import { buildUrlWithCaseId } from "@/lib/utils";
import { Breadcrumbs } from "@/components/Breadcrumbs";

type DocumentType = 
  | "cover_letter"
  | "personal_statement"
  | "exhibit_list";

interface DocumentInfo {
  type: DocumentType;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const mainDocumentTypes: DocumentInfo[] = [
  {
    type: "cover_letter",
    title: "Carta de Apresentação",
    description: "Carta formal de introdução para sua aplicação de visto",
    icon: <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />,
  },
  {
    type: "personal_statement",
    title: "Declaração Pessoal",
    description: "Sua história pessoal, objetivos e motivação",
    icon: <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />,
  },
  {
    type: "exhibit_list",
    title: "Lista de Exibições",
    description: "Lista organizada de todos os documentos enviados com sua aplicação",
    icon: <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />,
  },
];

const generationFunctions: Record<DocumentType, (id: string) => Promise<any>> = {
  cover_letter: generateCoverLetter,
  personal_statement: generatePersonalStatement,
  exhibit_list: generateExhibitList,
};

export default function GenerateDocumentsPage() {
  const params = useParams();
  const router = useRouter();
  const applicationId = params.id as string;

  const [generatedDocuments, setGeneratedDocuments] = useState<
    Record<DocumentType, { content: string; version: number; id: string } | null>
  >({
    cover_letter: null,
    personal_statement: null,
    exhibit_list: null,
  });
  const [generating, setGenerating] = useState<Record<DocumentType, boolean>>({
    cover_letter: false,
    personal_statement: false,
    exhibit_list: false,
  });
  const [errors, setErrors] = useState<Record<DocumentType, string | null>>({
    cover_letter: null,
    personal_statement: null,
    exhibit_list: null,
  });
  const [viewing, setViewing] = useState<DocumentType | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingCombinedPdf, setGeneratingCombinedPdf] = useState(false);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generationStep, setGenerationStep] = useState<DocumentType | null>(null);

  useEffect(() => {
    loadGeneratedDocuments();
    loadCaseId();
  }, [applicationId]);
  
  async function loadCaseId() {
    const result = await getApplicationCaseId(applicationId);
    if (result.success && result.case_id) {
      setCaseId(result.case_id);
    }
  }

  async function loadGeneratedDocuments() {
    try {
      setLoading(true);
      const result = await getGeneratedDocuments(applicationId);
      if (result.success && result.documents) {
        const docs: typeof generatedDocuments = {
          cover_letter: null,
          personal_statement: null,
          exhibit_list: null,
        };
        result.documents.forEach((doc: any) => {
          if (doc.document_type === "cover_letter" || doc.document_type === "personal_statement" || doc.document_type === "exhibit_list") {
            docs[doc.document_type as DocumentType] = {
              content: doc.content,
              version: doc.version,
              id: doc.id,
            };
          }
        });
        setGeneratedDocuments(docs);
      }
    } catch (error) {
      console.error("Error loading generated documents:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate(documentType: DocumentType) {
    setGenerating((prev) => ({ ...prev, [documentType]: true }));
    setErrors((prev) => ({ ...prev, [documentType]: null }));

    try {
      const generateFn = generationFunctions[documentType];
      const result = await generateFn(applicationId);

      if (result.success && result.content) {
        await loadGeneratedDocuments();
        setViewing(documentType);
      } else {
        setErrors((prev) => ({ ...prev, [documentType]: result.error || "Falha ao gerar documento" }));
      }
    } catch (error: any) {
      setErrors((prev) => ({ ...prev, [documentType]: error.message || "Ocorreu um erro" }));
    } finally {
      setGenerating((prev) => ({ ...prev, [documentType]: false }));
    }
  }

  async function handleGenerateAll() {
    setGeneratingAll(true);
    setErrors({
      cover_letter: null,
      personal_statement: null,
      exhibit_list: null,
    });

    const documentsToGenerate: DocumentType[] = ["cover_letter", "personal_statement", "exhibit_list"];

    for (const docType of documentsToGenerate) {
      // Skip if already generated
      if (generatedDocuments[docType]) {
        continue;
      }

      setGenerationStep(docType);
      setGenerating((prev) => ({ ...prev, [docType]: true }));

      try {
        const generateFn = generationFunctions[docType];
        const result = await generateFn(applicationId);

        if (result.success && result.content) {
          await loadGeneratedDocuments();
        } else {
          setErrors((prev) => ({ ...prev, [docType]: result.error || "Falha ao gerar documento" }));
        }
      } catch (error: any) {
        setErrors((prev) => ({ ...prev, [docType]: error.message || "Ocorreu um erro" }));
      } finally {
        setGenerating((prev) => ({ ...prev, [docType]: false }));
      }
    }

    setGenerationStep(null);
    setGeneratingAll(false);
  }

  function handleDownload(documentType: DocumentType) {
    const doc = generatedDocuments[documentType];
    if (!doc) return;

    const blob = new Blob([doc.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${mainDocumentTypes.find((d) => d.type === documentType)?.title || documentType}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleDownloadPdf() {
    try {
      const result = await generateCoverLetterPdfAction(applicationId);
      
      if (result.success && result.pdfBytes) {
        const blob = new Blob([result.pdfBytes as any], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cover-letter.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert(result.error || "Falha ao gerar PDF");
      }
    } catch (error: any) {
      alert(error.message || "Ocorreu um erro ao gerar PDF");
    }
  }

  async function handleDownloadCombinedPdf() {
    try {
      setGeneratingCombinedPdf(true);
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Tempo de espera esgotado. A geração do PDF está demorando muito. Tente novamente.")), 60000);
      });
      
      const result = await Promise.race([
        generateCombinedPdf(applicationId),
        timeoutPromise
      ]) as any;
      
      if (result.success && result.pdfBytes) {
        if (!(result.pdfBytes instanceof Uint8Array)) {
          throw new Error("Dados de PDF inválidos recebidos");
        }
        
        const blob = new Blob([result.pdfBytes as any], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cover-letter-and-personal-statement.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert(result.error || "Falha ao gerar PDF combinado");
      }
    } catch (error: any) {
      console.error("Error generating combined PDF:", error);
      const errorMessage = error.message || "Ocorreu um erro ao gerar PDF combinado";
      alert(errorMessage);
    } finally {
      setGeneratingCombinedPdf(false);
    }
  }

  const allDocumentsGenerated = 
    generatedDocuments.cover_letter && 
    generatedDocuments.personal_statement && 
    generatedDocuments.exhibit_list;

  const hasAnyDocumentNotGenerated = 
    !generatedDocuments.cover_letter || 
    !generatedDocuments.personal_statement || 
    !generatedDocuments.exhibit_list;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-900 dark:text-white mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Carregando documentos...</p>
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
          { label: "Gerar Documentos", href: buildUrlWithCaseId(`/applications/${applicationId}/documents/generate`, caseId) },
        ]}
      />

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Link
            href={buildUrlWithCaseId(`/applications/${applicationId}/documents`, caseId)}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <Sparkles className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Gerar Documentos
          </h1>
        </div>
        {caseId && (
          <p className="ml-8 text-lg font-semibold text-gray-700 font-mono dark:text-gray-300">
            Case ID: {caseId}
          </p>
        )}
        <p className="ml-8 text-gray-600 dark:text-gray-400">
          Use IA para gerar documentos profissionais para sua aplicação de visto
        </p>
      </div>

      {/* Generate All Button */}
      {hasAnyDocumentNotGenerated && (
        <div className="mb-8 rounded-lg border-2 border-gray-900 dark:border-white bg-white dark:bg-gray-900 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Gerar Todos os Documentos
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Gere automaticamente a Carta de Apresentação, Declaração Pessoal e Lista de Exibições em sequência
              </p>
              {generatingAll && generationStep && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    {generationStep === "cover_letter" && (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                        <span>Gerando Carta de Apresentação...</span>
                      </>
                    )}
                    {generationStep === "personal_statement" && (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                        <span>Gerando Declaração Pessoal...</span>
                      </>
                    )}
                    {generationStep === "exhibit_list" && (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                        <span>Gerando Lista de Exibições...</span>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {mainDocumentTypes.map((doc) => {
                      const isCompleted = generatedDocuments[doc.type] !== null;
                      const isCurrent = generationStep === doc.type;
                      return (
                        <div
                          key={doc.type}
                          className={`flex items-center gap-2 text-xs ${
                            isCompleted
                              ? "text-green-600 dark:text-green-400"
                              : isCurrent
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-gray-400 dark:text-gray-500"
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : isCurrent ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <div className="h-3 w-3 rounded-full border-2 border-gray-300 dark:border-gray-600" />
                          )}
                          <span>{doc.title}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handleGenerateAll}
              disabled={generatingAll}
              className="ml-4 inline-flex items-center gap-2 rounded-lg border-2 border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-3 text-sm font-semibold transition-all hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingAll ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  Gerar Todos os Documentos
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Combined PDF Section - Only show when all 3 are generated */}
      {allDocumentsGenerated && (
        <div className="mb-8 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Documento PDF Combinado
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Baixe a Carta de Apresentação e a Declaração Pessoal juntas em um único arquivo PDF
              </p>
            </div>
            <button
              onClick={handleDownloadCombinedPdf}
              disabled={generatingCombinedPdf}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-3 text-sm font-semibold transition-all hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50"
            >
              {generatingCombinedPdf ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Gerando PDF...
                </>
              ) : (
                <>
                  <Download className="h-5 w-5" />
                  Baixar PDF Combinado
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Document List - Only show after all documents are generated */}
      {allDocumentsGenerated && (
        <div className="space-y-4">
          {mainDocumentTypes.map((docInfo) => {
            const isGenerated = generatedDocuments[docInfo.type] !== null;
            const isGenerating = generating[docInfo.type];
            const error = errors[docInfo.type];

            return (
              <div
                key={docInfo.type}
                className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                      {docInfo.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {docInfo.title}
                      </h3>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {docInfo.description}
                      </p>
                      {error && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                          <AlertCircle className="h-4 w-4" />
                          {error}
                        </div>
                      )}
                      {isGenerated && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                          Gerado (Versão {generatedDocuments[docInfo.type]?.version})
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {isGenerated && (
                      <>
                        <button
                          onClick={() => setViewing(viewing === docInfo.type ? null : docInfo.type)}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <Edit className="h-4 w-4" />
                          {viewing === docInfo.type ? "Ocultar" : "Ver"}
                        </button>
                        {docInfo.type === "cover_letter" ? (
                          <>
                            <button
                              onClick={handleDownloadPdf}
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                              <Download className="h-4 w-4" />
                              Baixar PDF
                            </button>
                            <button
                              onClick={() => handleDownload(docInfo.type)}
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                              <Download className="h-4 w-4" />
                              Baixar TXT
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleDownload(docInfo.type)}
                            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            <Download className="h-4 w-4" />
                            Baixar
                          </button>
                        )}
                      </>
                    )}
                    <button
                      onClick={() => handleGenerate(docInfo.type)}
                      disabled={isGenerating || generatingAll}
                      className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 text-sm font-semibold transition-all hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Gerando...
                        </>
                      ) : isGenerated ? (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          Regenerar
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Gerar
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Document Preview */}
                {viewing === docInfo.type && generatedDocuments[docInfo.type] && (
                  <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
                    <div className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">
                      {generatedDocuments[docInfo.type]?.content}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Info Box */}
      <div className="mt-8 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <AlertCircle className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </div>
          <div>
            <h3 className="mb-2 font-semibold text-gray-900 dark:text-gray-100">
              Sobre Documentos Gerados por IA
            </h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-600 dark:bg-gray-400" />
                <span>Todos os documentos são gerados usando IA com base nos dados da sua aplicação</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-600 dark:bg-gray-400" />
                <span>Você pode regenerar qualquer documento para criar uma nova versão</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-600 dark:bg-gray-400" />
                <span>Revise e edite os documentos antes de enviar sua aplicação</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-600 dark:bg-gray-400" />
                <span>Os documentos são salvos automaticamente e podem ser baixados</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
