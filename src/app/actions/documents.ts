"use server";

import { currentUser } from "@clerk/nextjs/server";
import { getApplicationDocumentRequirements, getApplicationDocuments } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

/**
 * Server action to get document requirements for an application
 */
export async function getDocumentRequirements(applicationId: string) {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Verify the application belongs to the user
    // Use admin client to ensure we can always find the application
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();
    const { data: application, error } = await (supabase
      .from("applications") as any)
      .select("user_id, id, form_data")
      .eq("id", applicationId)
      .single();

    if (error) {
      console.error("Error fetching application in getDocumentRequirements:", error);
      console.error("Application ID:", applicationId);
      console.error("User ID:", user.id);
      return { success: false, error: `Application not found: ${error.message}` };
    }

    if (!application) {
      console.error("Application not found for ID:", applicationId);
      return { success: false, error: "Application not found" };
    }

    if (application.user_id !== user.id) {
      console.error("Unauthorized access attempt:", {
        applicationUserId: application.user_id,
        currentUserId: user.id,
        applicationId,
      });
      return { success: false, error: "Unauthorized" };
    }

    // Get document requirements
    // This will return default requirements even if form_data is empty (for draft applications)
    const requirements = await getApplicationDocumentRequirements(applicationId);
    
    if (!requirements) {
      // This should rarely happen now, but handle it gracefully
      return { success: false, error: "Could not determine document requirements" };
    }

    return { success: true, requirements };
  } catch (error: any) {
    console.error("Error getting document requirements:", error);
    return { success: false, error: error.message || "Failed to get requirements" };
  }
}

/**
 * Get uploaded documents for an application
 */
export async function getUploadedDocuments(applicationId: string) {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Verify the application belongs to the user
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();
    const { data: application, error } = await (supabase
      .from("applications") as any)
      .select("user_id")
      .eq("id", applicationId)
      .single();

    if (error || !application) {
      return { success: false, error: "Application not found" };
    }

    if (application.user_id !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Get uploaded documents
    const documents = await getApplicationDocuments(applicationId);

    return { success: true, documents };
  } catch (error: any) {
    console.error("Error getting uploaded documents:", error);
    return { success: false, error: error.message || "Failed to get documents" };
  }
}

/**
 * Delete a document
 */
export async function deleteDocument(documentId: string) {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();

    // Verify document belongs to user
    const { data: document, error: docError } = await (supabase
      .from("documents") as any)
      .select("user_id, file_url, application_id")
      .eq("id", documentId)
      .single();

    if (docError || !document) {
      return { success: false, error: "Document not found" };
    }

    if (document.user_id !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Delete file from storage
    if (document.file_url) {
      try {
        // Extract file path from URL
        const urlMatch = document.file_url.match(/\/storage\/v1\/object\/public\/documents\/(.+)/);
        if (urlMatch) {
          const filePath = urlMatch[1];
          await supabase.storage.from("documents").remove([filePath]);
        }
      } catch (storageError) {
        console.error("Error deleting file from storage:", storageError);
        // Continue with database deletion even if storage deletion fails
      }
    }

    // Delete document record
    const { error: deleteError } = await (supabase
      .from("documents") as any)
      .delete()
      .eq("id", documentId);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error deleting document:", error);
    return { success: false, error: error.message || "Failed to delete document" };
  }
}

/**
 * Get all files for an application with full file URLs
 */
export async function getApplicationFiles(applicationId: string) {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Verify the application belongs to the user
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();
    
    const { data: application, error: appError } = await (supabase
      .from("applications") as any)
      .select("user_id")
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return { success: false, error: "Application not found" };
    }

    if (application.user_id !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Get all documents for the application
    const { data: documents, error: docsError } = await (supabase
      .from("documents") as any)
      .select("*")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false });

    if (docsError) {
      console.error("Error fetching documents:", docsError);
      return { success: false, error: docsError.message || "Failed to fetch documents" };
    }

    // Map documents to files with URLs
    // file_url is already a public URL from Supabase Storage
    const filesWithUrls = (documents || []).map((doc: any) => ({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      mime_type: doc.mime_type,
      file_url: doc.file_url, // Already a public URL from getPublicUrl()
      file_size: doc.file_size,
      created_at: doc.created_at,
      status: doc.status,
    }));

    return { success: true, files: filesWithUrls };
  } catch (error: any) {
    console.error("Error getting application files:", error);
    return { success: false, error: error.message || "Failed to get files" };
  }
}

/**
 * Get all user applications with document requirements
 */
export async function getUserApplicationsAction() {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const { getUserApplications, getApplicationDocumentRequirements } = await import("@/lib/supabase/helpers");
    const { getDocumentSummary } = await import("@/lib/document-requirements");
    
    const applications = await getUserApplications(user.id);

    // Get document requirements for each application
    const applicationsWithRequirements = await Promise.all(
      applications.map(async (app) => {
        try {
          const requirements = await getApplicationDocumentRequirements(app.id);
          const summary = requirements
            ? getDocumentSummary(requirements)
            : null;
          return {
            ...app,
            totalDocuments: summary?.total || 0,
          };
        } catch {
          return {
            ...app,
            totalDocuments: 0,
          };
        }
      })
    );

    return { success: true, applications: applicationsWithRequirements };
  } catch (error: any) {
    console.error("Error getting user applications:", error);
    return { success: false, error: error.message || "Failed to get applications" };
  }
}

/**
 * Get all files from all user applications in a single optimized query
 * This is more efficient than calling getApplicationFiles multiple times
 */
export async function getAllUserFilesAction() {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();

    // First, get all applications for the user
    const { data: applications, error: appsError } = await (supabase
      .from("applications") as any)
      .select("id, visa_type, country, case_id, user_id")
      .eq("user_id", user.id);

    if (appsError) {
      console.error("Error fetching applications:", appsError);
      return { success: false, error: appsError.message || "Failed to fetch applications" };
    }

    if (!applications || applications.length === 0) {
      return { success: true, files: [], applications: [] };
    }

    // Get all application IDs
    const applicationIds = applications.map((app: any) => app.id);

    // Get all documents for all user applications in a single query
    const { data: documents, error: docsError } = await (supabase
      .from("documents") as any)
      .select("*")
      .in("application_id", applicationIds)
      .order("created_at", { ascending: false });

    if (docsError) {
      console.error("Error fetching documents:", docsError);
      return { success: false, error: docsError.message || "Failed to fetch documents" };
    }

    // Map documents to files with application_id and ensure all have it
    const filesWithAppId = (documents || []).map((doc: any) => ({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      mime_type: doc.mime_type,
      file_url: doc.file_url,
      file_size: doc.file_size,
      created_at: doc.created_at,
      status: doc.status,
      application_id: doc.application_id || null, // Ensure application_id is present
    }));

    // Filter out any files without application_id (shouldn't happen, but safety check)
    const validFiles = filesWithAppId.filter((file: any) => file.application_id);

    // Map applications to simpler format
    const appsFormatted = applications.map((app: any) => ({
      id: app.id,
      visa_type: app.visa_type,
      country: app.country,
      case_id: app.case_id,
    }));

    return {
      success: true,
      files: validFiles,
      applications: appsFormatted,
    };
  } catch (error: any) {
    console.error("Error getting all user files:", error);
    return { success: false, error: error.message || "Failed to get files" };
  }
}
