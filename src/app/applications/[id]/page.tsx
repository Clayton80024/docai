import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  FolderOpen,
  FileCheck,
  Sparkles,
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApplicationDocumentRequirements } from "@/lib/supabase/helpers";
import { getDocumentSummary } from "@/lib/document-requirements";
import { getUploadedDocuments } from "@/app/actions/documents";
import { buildUrlWithCaseId } from "@/lib/utils";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ApplicationPage({ params }: PageProps) {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const applicationId = id;
  const supabase = createAdminClient();

  // Get application details
  const { data: application, error: appError } = await (supabase
    .from("applications") as any)
    .select("*")
    .eq("id", applicationId)
    .single();

  if (appError || !application) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Not Found</h2>
          <p className="text-gray-600 mb-4">The application you're looking for doesn't exist.</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Verify ownership
  if (application.user_id !== user.id) {
    redirect("/dashboard");
  }

  // Get document requirements and uploaded documents
  const [requirements, documentsResult] = await Promise.all([
    getApplicationDocumentRequirements(applicationId),
    getUploadedDocuments(applicationId),
  ]);

  const summary = requirements ? getDocumentSummary(requirements) : null;
  const uploadedDocs = documentsResult.success ? documentsResult.documents || [] : [];
  const uploadedCount = uploadedDocs.length;
  const totalRequired = summary?.total || 0;
  const progress = totalRequired > 0 ? (uploadedCount / totalRequired) * 100 : 0;

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { label: "Draft", icon: Clock },
      in_progress: { label: "In Progress", icon: Clock },
      completed: { label: "Completed", icon: CheckCircle2 },
      submitted: { label: "Submitted", icon: CheckCircle2 },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-muted text-foreground border border-border">
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Link>
              <div className="flex items-center gap-4">
                <h1 className="text-3xl font-bold text-foreground">Application</h1>
                {getStatusBadge(application.status)}
              </div>
              {application.case_id && (
                <p className="mt-2 text-lg font-semibold text-foreground font-mono">
                  Case ID: {application.case_id}
                </p>
              )}
              {!application.case_id && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {application.visa_type} • {application.country}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Card */}
        <div className="bg-card rounded-lg shadow-sm border border-border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Document Progress</h2>
            <span className="text-sm text-muted-foreground">
              {uploadedCount} / {totalRequired} uploaded
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-3 mb-2">
            <div
              className="bg-foreground h-3 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {progress.toFixed(0)}% complete
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Upload Documents */}
          <Link
            href={buildUrlWithCaseId(`/applications/${applicationId}/documents`, application.case_id)}
            className="bg-card rounded-lg shadow-sm border border-border p-6 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-muted rounded-lg group-hover:bg-accent transition-colors">
                <Upload className="h-6 w-6 text-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground group-hover:text-muted-foreground transition-colors">
                  Upload Documents
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload required documents
                </p>
              </div>
            </div>
          </Link>

          {/* View All Files */}
          <Link
            href={buildUrlWithCaseId(`/applications/${applicationId}/files`, application.case_id)}
            className="bg-card rounded-lg shadow-sm border border-border p-6 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-muted rounded-lg group-hover:bg-accent transition-colors">
                <FolderOpen className="h-6 w-6 text-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground group-hover:text-muted-foreground transition-colors">
                  View All Files
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Browse all uploaded files
                </p>
              </div>
            </div>
          </Link>

          {/* Generate Documents */}
          <Link
            href={buildUrlWithCaseId(`/applications/${applicationId}/documents/generate`, application.case_id)}
            className="bg-card rounded-lg shadow-sm border border-border p-6 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-muted rounded-lg group-hover:bg-accent transition-colors">
                <Sparkles className="h-6 w-6 text-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground group-hover:text-muted-foreground transition-colors">
                  Generate Documents
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  AI-generated documents
                </p>
              </div>
            </div>
          </Link>

          {/* Review Application */}
          <Link
            href={buildUrlWithCaseId(`/applications/${applicationId}/review`, application.case_id)}
            className="bg-card rounded-lg shadow-sm border border-border p-6 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-muted rounded-lg group-hover:bg-accent transition-colors">
                <FileCheck className="h-6 w-6 text-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground group-hover:text-muted-foreground transition-colors">
                  Review Application
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Review and validate
                </p>
              </div>
            </div>
          </Link>
        </div>

        {/* Recent Documents */}
        {uploadedDocs.length > 0 && (
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Recent Documents</h2>
            <div className="space-y-3">
              {uploadedDocs.slice(0, 5).map((doc: any) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                >
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">{doc.type}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
              {uploadedDocs.length > 5 && (
                <Link
                  href={buildUrlWithCaseId(`/applications/${applicationId}/files`, application.case_id)}
                  className="block text-center text-sm text-foreground hover:text-muted-foreground py-2 transition-colors"
                >
                  View all {uploadedDocs.length} files →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

