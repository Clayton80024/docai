"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCheck,
  ArrowRight,
  Search,
  Filter,
  FolderOpen,
  Trash2,
} from "lucide-react";
import { getUserApplicationsAction } from "@/app/actions/documents";
import { deleteApplicationAction } from "@/app/actions/application";
import { buildUrlWithCaseId } from "@/lib/utils";
import { ApplicationCardSkeleton, Skeleton } from "@/components/Skeleton";

interface ApplicationWithRequirements {
  id: string;
  case_id: string | null;
  visa_type: string;
  country: string;
  status: string;
  created_at: string;
  totalDocuments: number;
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<ApplicationWithRequirements[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [applicationToDelete, setApplicationToDelete] = useState<string | null>(null);

  useEffect(() => {
    async function loadApplications() {
      try {
        setLoading(true);
        const result = await getUserApplicationsAction();
        
        if (result.success && result.applications) {
          setApplications(result.applications as ApplicationWithRequirements[]);
        }
      } catch (error) {
        console.error("Error loading applications:", error);
      } finally {
        setLoading(false);
      }
    }

    loadApplications();
  }, []);

  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      draft: "Rascunho",
      in_progress: "Em Andamento",
      completed: "Concluída",
      submitted: "Enviada",
    };
    return labels[status] || status.replace("_", " ");
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-gray-600 dark:text-gray-400" />;
      case "in_progress":
        return <Clock className="h-4 w-4 text-gray-600 dark:text-gray-400" />;
      case "submitted":
        return <CheckCircle2 className="h-4 w-4 text-gray-600 dark:text-gray-400" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600 dark:text-gray-400" />;
    }
  };

  const handleDeleteClick = (appId: string) => {
    setApplicationToDelete(appId);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!applicationToDelete) return;

    setDeletingId(applicationToDelete);
    const result = await deleteApplicationAction(applicationToDelete, true);

    if (result.success) {
      setApplications((prev) => prev.filter((app) => app.id !== applicationToDelete));
      setShowDeleteModal(false);
      setApplicationToDelete(null);
    } else {
      alert(`Erro ao deletar: ${result.error}`);
    }

    setDeletingId(null);
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setApplicationToDelete(null);
  };

  // Filter applications
  const filteredApplications = applications.filter((app) => {
    const matchesSearch = 
      (app.case_id?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
      app.visa_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.country.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || app.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div>
        {/* Header Skeleton */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <Skeleton className="h-9 w-64 mb-2" />
              <Skeleton className="h-5 w-48" />
            </div>
            <Skeleton className="h-11 w-40" />
          </div>
        </div>

        {/* Filters Skeleton */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-40" />
        </div>

        {/* Applications List Skeleton */}
        <div className="space-y-4">
          <ApplicationCardSkeleton />
          <ApplicationCardSkeleton />
          <ApplicationCardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Minhas Aplicações
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{filteredApplications.length}</span> aplicação{filteredApplications.length !== 1 ? "ões" : ""}
              {statusFilter !== "all" && ` • ${getStatusLabel(statusFilter)}`}
            </p>
          </div>
          <Link
            href="/applications/new"
            className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-5 py-2.5 font-semibold transition-all hover:bg-gray-800 dark:hover:bg-gray-100 hover:scale-105 self-start sm:self-auto"
          >
            <Plus className="h-5 w-5" />
            Nova Aplicação
          </Link>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-10 pr-8 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-medium text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors appearance-none cursor-pointer"
            >
              <option value="all">Todos os Status</option>
              <option value="draft">Rascunho</option>
              <option value="in_progress">Em Andamento</option>
              <option value="completed">Concluída</option>
              <option value="submitted">Enviada</option>
            </select>
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400 pointer-events-none" />
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por Case ID, tipo de visto ou país..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>
        </div>
      </div>

      {/* Applications List */}
      {applications.length === 0 ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <FileText className="h-8 w-8 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Nenhuma aplicação ainda
          </h3>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            Comece criando sua primeira aplicação de visto
          </p>
          <Link
            href="/applications/new"
            className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-3 font-semibold transition-all hover:bg-gray-800 dark:hover:bg-gray-100 hover:scale-105"
          >
            <Plus className="h-5 w-5" />
            Criar Aplicação
          </Link>
        </div>
      ) : filteredApplications.length === 0 ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <Search className="h-8 w-8 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Nenhuma aplicação encontrada
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            {searchQuery || statusFilter !== "all"
              ? "Tente ajustar os filtros de busca"
              : "Nenhuma aplicação corresponde aos critérios"}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          {filteredApplications.map((app) => (
            <div
              key={app.id}
              className="flex items-center p-4 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-200 dark:border-gray-800 last:border-b-0 transition-colors"
            >
              {/* Application Icon */}
              <Link
                href={buildUrlWithCaseId(`/applications/${app.id}/documents`, app.case_id)}
                className="flex-shrink-0 w-14 h-14 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <FileText className="h-6 w-6 text-gray-600 dark:text-gray-400" />
              </Link>
              
              {/* Application Info */}
              <Link
                href={buildUrlWithCaseId(`/applications/${app.id}/documents`, app.case_id)}
                className="ml-4 flex-1 min-w-0 cursor-pointer"
              >
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate font-mono">
                    {app.case_id || `${app.visa_type} - ${app.country}`}
                  </p>
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                    {getStatusIcon(app.status)}
                    {getStatusLabel(app.status)}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Criado: {new Date(app.created_at).toLocaleDateString("pt-BR", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  {app.totalDocuments > 0 && (
                    <>
                      <span className="text-xs text-gray-400 dark:text-gray-600">•</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {app.totalDocuments} documento{app.totalDocuments !== 1 ? "s" : ""} necessário{app.totalDocuments !== 1 ? "s" : ""}
                      </p>
                    </>
                  )}
                </div>
              </Link>
              
              {/* Actions */}
              <div className="flex items-center gap-2 ml-4">
                <Link
                  href={buildUrlWithCaseId(`/applications/${app.id}/review`, app.case_id)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  title="Revisar aplicação"
                >
                  <FileCheck className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </Link>
                <Link
                  href={buildUrlWithCaseId(`/applications/${app.id}/files`, app.case_id)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  title="Ver arquivos"
                >
                  <FolderOpen className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleDeleteClick(app.id);
                  }}
                  disabled={deletingId === app.id}
                  className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                  title="Deletar aplicação"
                >
                  {deletingId === app.id ? (
                    <div className="animate-spin h-5 w-5 border-2 border-red-500 border-t-transparent rounded-full" />
                  ) : (
                    <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Deletar Aplicação?
              </h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Tem certeza que deseja deletar esta aplicação? Esta ação não pode ser desfeita.
              Todos os documentos gerados serão deletados permanentemente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteCancel}
                disabled={deletingId !== null}
                className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deletingId !== null}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deletingId ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Deletando...
                  </>
                ) : (
                  "Deletar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
