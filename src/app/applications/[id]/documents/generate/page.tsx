"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Sparkles,
  Loader2,
  CheckCircle2,
  Edit,
  Download,
  AlertCircle,
  Save,
} from "lucide-react";
import {
  generateCoverLetter,
  generatePersonalStatement,
  generateExhibitList,
  getGeneratedDocuments,
  generateCombinedPdf,
  updateGeneratedDocumentContent,
} from "@/app/actions/generate-documents";
import { fillI539FormAction, getI539FillGuideAction } from "@/app/actions/fill-i539";
import { getApplicationCaseId } from "@/app/actions/application";
import { buildUrlWithCaseId } from "@/lib/utils";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { TiptapEditor } from "@/components/TiptapEditor";

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

function GenerateDocumentsContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [generatingI539, setGeneratingI539] = useState(false);
  const [generatingI539Guide, setGeneratingI539Guide] = useState(false);
  const [i539Feedback, setI539Feedback] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generationStep, setGenerationStep] = useState<DocumentType | null>(null);
  const [editedDraft, setEditedDraft] = useState<Record<DocumentType, string | null>>({
    cover_letter: null,
    personal_statement: null,
    exhibit_list: null,
  });
  const [savingDoc, setSavingDoc] = useState<DocumentType | null>(null);
  const [editorRefreshKey, setEditorRefreshKey] = useState<Record<DocumentType, number>>({
    cover_letter: 0,
    personal_statement: 0,
    exhibit_list: 0,
  });

  useEffect(() => {
    loadGeneratedDocuments();
    loadCaseId();
  }, [applicationId]);

  // Open editor when arriving with ?edit=cover_letter|personal_statement|exhibit_list
  useEffect(() => {
    if (loading) return;
    const edit = searchParams.get("edit") as DocumentType | null;
    if (edit && ["cover_letter", "personal_statement", "exhibit_list"].includes(edit) && generatedDocuments[edit]) {
      setViewing(edit);
    }
  }, [loading, searchParams, generatedDocuments]);
  
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

  async function handleSaveDocument(documentType: DocumentType) {
    const value = editedDraft[documentType] ?? generatedDocuments[documentType]?.content ?? "";
    setSavingDoc(documentType);
    try {
      const result = await updateGeneratedDocumentContent(applicationId, documentType, value);
      if (result.success) {
        await loadGeneratedDocuments();
        setEditedDraft((prev) => ({ ...prev, [documentType]: null }));
        setEditorRefreshKey((prev) => ({ ...prev, [documentType]: (prev[documentType] ?? 0) + 1 }));
      } else {
        alert(result.error || "Falha ao salvar");
      }
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar");
    } finally {
      setSavingDoc(null);
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

  async function handleDownloadI539() {
    try {
      setGeneratingI539(true);
      setI539Feedback(null);
      const result = await fillI539FormAction(applicationId);
      if (result.success && result.pdfBytes) {
        const blob = new Blob([result.pdfBytes as any], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "i-539.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (result.filled === false) {
          setI539Feedback("I-539 em branco. Use o guia de preenchimento para preencher à mão.");
          alert("O I-539 não pôde ser preenchido automaticamente. Baixe o guia de preenchimento e use os valores para preencher o formulário em uscis.gov/i-539.");
        } else {
          setI539Feedback("I-539 preenchido e baixado com sucesso.");
          setTimeout(() => setI539Feedback(null), 4000);
        }
      } else {
        setI539Feedback(null);
        alert(result.error || "Falha ao gerar I-539.");
      }
    } catch (e: any) {
      setI539Feedback(null);
      alert(e?.message || "Erro ao gerar I-539.");
    } finally {
      setGeneratingI539(false);
    }
  }

  async function handleDownloadI539Guide() {
    try {
      setGeneratingI539Guide(true);
      const result = await getI539FillGuideAction(applicationId);
      if (result.success && result.html) {
        const blob = new Blob([result.html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "i-539-guia.html";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert(result.error || "Falha ao gerar o guia.");
      }
    } catch (e: any) {
      alert(e?.message || "Erro ao gerar o guia.");
    } finally {
      setGeneratingI539Guide(false);
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

      {/* Formulário I-539 - sempre visível */}
      <div className="mb-8 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Formulário I-539
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Formulário em PDF (pode vir em branco) e guia com os valores para preencher à mão em uscis.gov/i-539
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleDownloadI539}
              disabled={generatingI539}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2.5 text-sm font-semibold transition-all hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50"
            >
              {generatingI539 ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</>
              ) : (
                <><Download className="h-4 w-4" /> Baixar I-539</>
              )}
            </button>
            <button
              onClick={handleDownloadI539Guide}
              disabled={generatingI539Guide}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-4 py-2.5 text-sm font-medium transition-all hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              {generatingI539Guide ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</>
              ) : (
                <><FileText className="h-4 w-4" /> Guia de preenchimento</>
              )}
            </button>
          </div>
        </div>
        {i539Feedback && (
          <p className={`mt-2 text-sm ${i539Feedback.startsWith("I-539 em branco") ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}`}>
            {i539Feedback}
          </p>
        )}
      </div>

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
                      <button
                        onClick={() => setViewing(viewing === docInfo.type ? null : docInfo.type)}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <Edit className="h-4 w-4" />
                        {viewing === docInfo.type ? "Fechar editor" : "Editar"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Document editor (Tiptap) */}
                {viewing === docInfo.type && generatedDocuments[docInfo.type] && (
                  <div className="mt-4 space-y-3">
                    <TiptapEditor
                      key={`${docInfo.type}-${editorRefreshKey[docInfo.type] ?? 0}`}
                      content={editedDraft[docInfo.type] ?? generatedDocuments[docInfo.type]?.content ?? ""}
                      onChange={(plain) => setEditedDraft((prev) => ({ ...prev, [docInfo.type]: plain }))}
                      minHeight={280}
                      applicationId={applicationId}
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleSaveDocument(docInfo.type)}
                        disabled={savingDoc === docInfo.type}
                        className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 text-sm font-semibold transition-all hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50"
                      >
                        {savingDoc === docInfo.type ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Salvando...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            Salvar alterações
                          </>
                        )}
                      </button>
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

export default function GenerateDocumentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white dark:bg-gray-900">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-900 dark:text-white mx-auto" />
            <p className="mt-4 text-gray-600 dark:text-gray-400">Carregando...</p>
          </div>
        </div>
      }
    >
      <GenerateDocumentsContent />
    </Suspense>
  );
}
