"use server";

import { currentUser } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { createDocument } from "@/lib/supabase/helpers";

const BUCKET_NAME = "documents";

/**
 * Upload a file to Supabase Storage and create a document record
 */
export async function uploadDocument(
  applicationId: string,
  documentType: string,
  documentLabel: string,
  file: File
) {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Verify the application belongs to the user
    // Use admin client to ensure we can always find the application
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("user_id")
      .eq("id", applicationId)
      .single();

    if (appError) {
      console.error("Error fetching application in uploadDocument:", appError);
      console.error("Application ID:", applicationId);
      console.error("User ID:", user.id);
      return { success: false, error: `Application not found: ${appError.message}` };
    }

    if (!application) {
      console.error("Application not found for ID:", applicationId);
      return { success: false, error: "Application not found" };
    }

    const app = application as { id: string; user_id: string };
    if (app.user_id !== user.id) {
      console.error("Unauthorized upload attempt:", {
        applicationUserId: app.user_id,
        currentUserId: user.id,
        applicationId,
      });
      return { success: false, error: "Unauthorized" };
    }

    // Generate a unique file path
    const fileExt = file.name.split(".").pop();
    const fileName = `${user.id}/${applicationId}/${documentType}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    // Read file as ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload file to Supabase Storage
    // Note: Storage operations work with both admin and regular clients
    // But we need to use a client that has storage permissions
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, uint8Array, {
        contentType: file.type,
        upsert: false, // Don't overwrite existing files
      });

    if (uploadError) {
      console.error("Error uploading file:", uploadError);
      return { success: false, error: uploadError.message || "Failed to upload file" };
    }

    // Get the public URL of the uploaded file
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    if (!urlData?.publicUrl) {
      return { success: false, error: "Failed to get file URL" };
    }

    // Create document record in database
    const document = await createDocument(
      user.id,
      applicationId,
      documentLabel,
      documentType,
      urlData.publicUrl,
      file.size,
      file.type
    );

    // Automatically process documents with Google Document AI
    // Process in background - don't wait for completion
    const processableTypes = [
      "passport",
      "dependent_passport",
      "i94",
      "dependent_i94",
      "i20",
      "dependent_i20",
      "bank_statement",
      "sponsor_bank_statement",
      "supporting_documents", // Ties to Country documents
      "assets", // Assets Documents
      "sponsor_assets", // Sponsor Assets Documents
      "scholarship_document", // Scholarship award letters
      "other_funding", // Other funding source documents
    ];
    if (processableTypes.includes(documentType)) {
      console.log(`Triggering AI processing for document ${document.id} (type: ${documentType})`);
      // Trigger processing asynchronously (fire and forget)
      import("@/app/actions/document-ai")
        .then(({ processDocumentWithAI }) => {
          console.log(`Starting AI processing for document ${document.id}...`);
          processDocumentWithAI(document.id, urlData.publicUrl, documentType)
            .then((result) => {
              if (result.success) {
                console.log(`Document ${document.id} processed successfully`);
              } else {
                console.error(`Document ${document.id} processing failed:`, result.error);
              }
            })
            .catch((error) => {
              console.error(`Error processing document ${document.id} with AI:`, error);
              // Error is already handled in processDocumentWithAI, but log it here too
            });
        })
        .catch((error) => {
          console.error("Error importing document-ai module:", error);
        });
    } else {
      console.log(`Document type ${documentType} is not processable, skipping AI processing`);
    }

    return {
      success: true,
      document,
      fileUrl: urlData.publicUrl,
    };
  } catch (error: any) {
    console.error("Error uploading document:", error);
    return { success: false, error: error.message || "Failed to upload document" };
  }
}

/**
 * Get signed URL for file upload (for client-side uploads)
 */
export async function getUploadUrl(applicationId: string, fileName: string) {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Use admin client to ensure we can always find the application
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();
    
    // Verify the application belongs to the user
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("user_id")
      .eq("id", applicationId)
      .single();

    if (appError) {
      console.error("Error fetching application in getUploadUrl:", appError);
      return { success: false, error: `Application not found: ${appError.message}` };
    }

    if (!application) {
      return { success: false, error: "Application not found" };
    }

    const app = application as { id: string; user_id: string };
    if (app.user_id !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Generate file path
    const fileExt = fileName.split(".").pop();
    const filePath = `${user.id}/${applicationId}/${Date.now()}.${fileExt}`;

    // Get signed upload URL (valid for 1 hour)
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(filePath);

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      path: filePath,
      token: data.token,
      signedUrl: data.signedUrl,
    };
  } catch (error: any) {
    console.error("Error getting upload URL:", error);
    return { success: false, error: error.message || "Failed to get upload URL" };
  }
}

