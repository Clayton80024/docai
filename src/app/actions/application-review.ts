"use server";

import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { aggregateApplicationData } from "@/lib/application-data-aggregator";

/**
 * Get complete application review data (all documents + generated documents + application info)
 */
export async function getApplicationReview(applicationId: string) {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const supabase = createAdminClient();

    // Verify application belongs to user
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("id, user_id, country, visa_type, status, created_at, updated_at")
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return { success: false, error: "Application not found" };
    }

    // Type assertion: application is guaranteed to exist at this point
    const app = application as {
      id: string;
      user_id: string;
      country: string;
      visa_type: string;
      status: string;
      created_at: string;
      updated_at: string;
    };

    if (app.user_id !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Get all uploaded documents
    const { data: uploadedDocuments, error: docsError } = await supabase
      .from("documents")
      .select("*")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: true });

    if (docsError) {
      console.error("Error fetching documents:", docsError);
    }

    // Get all generated documents
    const { data: generatedDocuments, error: genError } = await supabase
      .from("generated_documents")
      .select("*")
      .eq("application_id", applicationId)
      .eq("is_current", true)
      .order("document_type", { ascending: true });

    if (genError) {
      console.error("Error fetching generated documents:", genError);
    }

    // Get aggregated application data
    const aggregatedData = await aggregateApplicationData(applicationId);

    return {
      success: true,
      application: {
        id: app.id,
        country: app.country,
        visaType: app.visa_type,
        status: app.status,
        createdAt: app.created_at,
        updatedAt: app.updated_at,
      },
      uploadedDocuments: uploadedDocuments || [],
      generatedDocuments: generatedDocuments || [],
      aggregatedData: aggregatedData.success ? aggregatedData.data : null,
    };
  } catch (error: any) {
    console.error("Error getting application review:", error);
    return { success: false, error: error.message || "Failed to get application review" };
  }
}

