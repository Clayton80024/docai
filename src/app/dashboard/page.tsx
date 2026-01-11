import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  ArrowRight,
  FolderOpen,
  Target,
} from "lucide-react";
import {
  getApplicationStats,
  getUserApplications,
  syncClerkUserToProfile,
} from "@/lib/supabase/helpers";
import { buildUrlWithCaseId } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await currentUser();

  if (!user) {
    return null;
  }

  // Get user ID from Clerk
  const userId = user.id;

  // Sync Clerk user data to Supabase profile
  const profile = await syncClerkUserToProfile(userId, {
    emailAddresses: user.emailAddresses,
    firstName: user.firstName,
    lastName: user.lastName,
    phoneNumbers: user.phoneNumbers,
    imageUrl: user.imageUrl,
  });

  if (profile) {
    console.log("Profile synced successfully:", profile);
  } else {
    console.warn("Profile sync skipped - Supabase not configured");
  }

  // Fetch real data from Supabase
  const stats = await getApplicationStats(userId);
  const applications = await getUserApplications(userId);

  // Calculate completion percentage
  const completionRate = stats.totalApplications > 0
    ? Math.round((stats.completed / stats.totalApplications) * 100)
    : 0;

  return (
    <div>
      {/* Stats Cards - Minimalista */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="group relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total de Aplicações
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
                {stats.totalApplications}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <FileText className="h-6 w-6 text-gray-600 dark:text-gray-400" />
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Em Andamento
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
                {stats.inProgress}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <Clock className="h-6 w-6 text-gray-600 dark:text-gray-400" />
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Concluídas
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
                {stats.completed}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <CheckCircle2 className="h-6 w-6 text-gray-600 dark:text-gray-400" />
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Aguardando
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
                {stats.pending}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <AlertCircle className="h-6 w-6 text-gray-600 dark:text-gray-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar - Minimalista */}
      {stats.totalApplications > 0 && (
        <div className="mb-8 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <Target className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Taxa de Conclusão
              </h2>
            </div>
            <span className="rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {completionRate}%
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className="h-full bg-gray-900 dark:bg-white transition-all duration-500 ease-out"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      )}

      {/* Quick Actions - Minimalista */}
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Ações Rápidas
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/applications/new"
            className="group relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 text-left shadow-sm transition-all hover:shadow-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 transition-colors group-hover:bg-gray-200 dark:group-hover:bg-gray-700">
                <Plus className="h-6 w-6 text-gray-600 dark:text-gray-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Nova Aplicação
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Iniciar uma nova aplicação de visto
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-gray-400 dark:text-gray-500 transition-all group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            href="/files"
            className="group relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 text-left shadow-sm transition-all hover:shadow-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 transition-colors group-hover:bg-gray-200 dark:group-hover:bg-gray-700">
                <FolderOpen className="h-6 w-6 text-gray-600 dark:text-gray-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Ver Todos os Arquivos
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Navegar por todos os documentos enviados
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-gray-400 dark:text-gray-500 transition-all group-hover:translate-x-1" />
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Applications - Minimalista */}
      {applications.length > 0 && (
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Aplicações Recentes
            </h2>
            <Link
              href="/applications"
              className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              Ver Todas →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {applications.slice(0, 6).map((app) => {
              const statusLabels: Record<string, string> = {
                draft: "Rascunho",
                in_progress: "Em Andamento",
                completed: "Concluída",
                submitted: "Enviada",
              };

              return (
                <Link
                  key={app.id}
                  href={buildUrlWithCaseId(`/applications/${app.id}/documents`, app.case_id)}
                  className="group relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm transition-all hover:shadow-md hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1 font-mono text-base">
                          {app.case_id || app.visa_type}
                        </h3>
                        {!app.case_id && (
                          <p className="text-sm text-gray-600 dark:text-gray-400">{app.country}</p>
                        )}
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                        {statusLabels[app.status] || app.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        {new Date(app.created_at).toLocaleDateString("pt-BR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Getting Started Guide - Minimalista */}
      {stats.totalApplications === 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Comece com o Installo
            </h2>
          </div>
          <p className="mb-6 text-gray-600 dark:text-gray-400 text-base">
            Siga estes passos simples para começar sua jornada de aplicação de visto:
          </p>
          <ol className="space-y-4 mb-8">
            <li className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-900 dark:text-gray-100">
                1
              </span>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  Crie Sua Aplicação
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Comece criando uma nova aplicação de visto e preencha suas informações básicas.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-900 dark:text-gray-100">
                2
              </span>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  Envie Seus Documentos
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Envie seu passaporte, I-94, I-20, extratos bancários e outros documentos. Nossa IA categorizará tudo automaticamente.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-900 dark:text-gray-100">
                3
              </span>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  Gere e Revise
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Deixe a IA gerar sua Cover Letter, Personal Statement e documentos, depois revise e baixe quando estiver pronto.
                </p>
              </div>
            </li>
          </ol>
          <Link
            href="/applications/new"
            className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-3 font-semibold transition-all hover:bg-gray-800 dark:hover:bg-gray-100"
          >
            <Plus className="h-5 w-5" />
            Criar Sua Primeira Aplicação
          </Link>
        </div>
      )}
    </div>
  );
}
