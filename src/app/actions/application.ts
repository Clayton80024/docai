"use server";

import { currentUser } from "@clerk/nextjs/server";
import { 
  createApplication, 
  updateApplication,
  getApplicationQuestionsByStep,
  getApplicationAnswers,
  saveApplicationAnswers,
  getFollowUpQuestions as getFollowUpQuestionsHelper
} from "@/lib/supabase/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { Database } from "@/lib/supabase/types";

type Application = Database["public"]["Tables"]["applications"]["Row"];
type ApplicationUpdate = Database["public"]["Tables"]["applications"]["Update"];

type CreateApplicationResult =
  | { success: true; application: Application }
  | { success: false; error: string };

type UpdateApplicationResult =
  | { success: true; application: Application }
  | { success: false; error: string };

export async function createNewApplication(data: {
  country: string;
  visaType: string;
  currentAddress?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  tiesToCountry?: {
    question1: string;
    question2: string;
    question3: string;
  };
  dependents?: {
    hasDependents: boolean;
    dependents: Array<{
      id: string;
      fullName: string;
      relationship: string;
      dateOfBirth: string;
      countryOfBirth: string;
    }>;
  };
  financialSupport?: {
    fundingSource: string;
    sponsorName?: string;
    sponsorRelationship?: string;
    sponsorAddress?: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
      country: string;
    };
    annualIncome?: string;
    savingsAmount?: string;
    scholarshipName?: string;
    otherSource?: string;
  };
}): Promise<CreateApplicationResult> {
  try {
    const user = await currentUser();

    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Create the application in Supabase with all form data
    const application = await createApplication(
      user.id,
      data.country,
      data.visaType,
      {
        currentAddress: data.currentAddress,
        tiesToCountry: data.tiesToCountry,
        dependents: data.dependents,
        financialSupport: data.financialSupport,
      },
      user.firstName, // First name for case_id generation
      user.lastName // Last name for case_id generation
    );

    revalidatePath("/dashboard");
    revalidatePath("/applications");

    return { success: true as const, application };
  } catch (error: any) {
    console.error("Error creating application:", error);
    return { success: false as const, error: error.message || "Failed to create application" };
  }
}

/**
 * Create a draft application immediately when user starts a new application
 * Includes protection against duplicate simultaneous creations
 */
export async function createDraftApplication(): Promise<CreateApplicationResult> {
  try {
    console.log("[createDraftApplication] Starting...");
    const user = await currentUser();
    console.log("[createDraftApplication] User:", user ? { id: user.id, firstName: user.firstName, lastName: user.lastName } : "null");

    if (!user) {
      console.error("[createDraftApplication] No user authenticated");
      return { success: false, error: "Not authenticated" };
    }

    // Check for recent draft applications to prevent duplicates
    // Use a longer time window (30 seconds) to catch rapid successive calls
    const { getUserApplications } = await import("@/lib/supabase/helpers");
    const applications = await getUserApplications(user.id);
    
    // Find the most recent draft application created in the last 30 seconds
    const now = new Date();
    const thirtySecondsAgo = new Date(now.getTime() - 30000);
    
    const recentDraft = applications
      .filter((app) => app.status === "draft")
      .filter((app) => new Date(app.created_at) > thirtySecondsAgo)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    if (recentDraft) {
      console.log("[createDraftApplication] Found recent draft (within 30s), returning existing:", recentDraft.id);
      return { 
        success: true, 
        application: recentDraft
      };
    }

    console.log("[createDraftApplication] Creating application with case_id...");
    
    // Initialize form_data with default structure
    const initialFormData = {
      dependents: {
        hasDependents: false,
        dependents: [],
      },
      tiesToCountry: {
        question1: '',
        question2: '',
        question3: '',
      },
      financialSupport: {
        fundingSource: '',
        sponsorName: '',
        sponsorRelationship: '',
        sponsorAddress: {
          street: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
        },
        annualIncome: '',
        savingsAmount: '',
        scholarshipName: '',
        otherSource: '',
      },
    };
    
    // Create a minimal draft application with case_id and initial form_data
    const application = await createApplication(
      user.id,
      "USA", // Default country
      "Student Visa", // Default visa type
      initialFormData, // Initialize form_data with default structure
      user.firstName, // First name for case_id generation
      user.lastName // Last name for case_id generation
    );

    console.log("[createDraftApplication] Application created:", application);

    revalidatePath("/dashboard");
    revalidatePath("/applications");

    return { success: true, application };
  } catch (error: any) {
    console.error("[createDraftApplication] Error:", error);
    return { success: false, error: error.message || "Failed to create draft application" };
  }
}

/**
 * Update an existing application with form data
 */
/**
 * Get the most recent draft application for the current user
 */
export async function getLatestDraftApplication(): Promise<{
  success: boolean;
  application?: { id: string; status: string; created_at: string };
  error?: string;
}> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const { getUserApplications } = await import("@/lib/supabase/helpers");
    const applications = await getUserApplications(user.id);
    
    // Find the most recent draft application
    const draftApp = applications
      .filter((app) => app.status === "draft")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    if (draftApp) {
      return {
        success: true,
        application: {
          id: draftApp.id,
          status: draftApp.status,
          created_at: draftApp.created_at,
        },
      };
    }

    return { success: false, error: "No draft application found" };
  } catch (error: any) {
    console.error("Error getting latest draft application:", error);
    return { success: false, error: error.message || "Failed to get draft application" };
  }
}

/**
 * Update an existing application with form data
 */
export async function updateApplicationData(
  applicationId: string,
  data: {
    country?: string;
    visaType?: string;
    currentAddress?: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
    };
    tiesToCountry?: {
      question1: string;
      question2: string;
      question3: string;
    };
    dependents?: {
      hasDependents: boolean;
      dependents: Array<{
        id: string;
        fullName: string;
        relationship: string;
        dateOfBirth: string;
        countryOfBirth: string;
      }>;
    };
    financialSupport?: {
      fundingSource: string;
      sponsorName?: string;
      sponsorRelationship?: string;
      sponsorAddress?: {
        street: string;
        city: string;
        state: string;
        zipCode: string;
        country: string;
      };
      annualIncome?: string;
      savingsAmount?: string;
      scholarshipName?: string;
      otherSource?: string;
    };
  }
): Promise<UpdateApplicationResult> {
  try {
    const user = await currentUser();

    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Update the application with form data
    const application = await updateApplication(applicationId, {
      currentAddress: data.currentAddress,
      tiesToCountry: data.tiesToCountry,
      dependents: data.dependents,
      financialSupport: data.financialSupport,
    });

    // Update country and visa type if provided
    if (data.country || data.visaType) {
      const supabase = createAdminClient();
      const updates: { [K in 'country' | 'visa_type']?: string } = {};
      if (data.country) updates.country = data.country;
      if (data.visaType) updates.visa_type = data.visaType;
      
      const { error: updateError } = await supabase
        .from("applications")
        // @ts-expect-error - Supabase type inference issue with update()
        .update(updates)
        .eq("id", applicationId);
      
      if (updateError) {
        console.error("Error updating application fields:", updateError);
      }
    }

    revalidatePath("/dashboard");
    revalidatePath("/applications");

    return { success: true, application };
  } catch (error: any) {
    console.error("Error updating application:", error);
    return { success: false, error: error.message || "Failed to update application" };
  }
}

/**
 * Get case_id for an application
 */
export async function getApplicationCaseId(applicationId: string): Promise<{
  success: boolean;
  case_id?: string | null;
  error?: string;
}> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("applications")
      .select("case_id, user_id")
      .eq("id", applicationId)
      .single<{ case_id: string | null; user_id: string }>();

    if (error || !data) {
      return { success: false, error: "Application not found" };
    }

    // Verify ownership
    if (data.user_id !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    return { success: true, case_id: data.case_id };
  } catch (error: any) {
    console.error("Error getting application case_id:", error);
    return { success: false, error: error.message || "Failed to get case_id" };
  }
}

/**
 * Get application questions for a specific step
 */
export async function getQuestionsByStep(stepNumber: number): Promise<{ success: boolean; questions?: any[]; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const { getApplicationQuestionsByStep } = await import("@/lib/supabase/helpers");
    const questions = await getApplicationQuestionsByStep(stepNumber);

    return { success: true, questions };
  } catch (error: any) {
    console.error("Error in getQuestionsByStep:", error);
    return { success: false, error: error.message || "Failed to get questions" };
  }
}

/**
 * Get follow-up questions for a parent question and selected option
 */
export async function getFollowUpQuestions(
  parentQuestionId: string,
  selectedOption: string
): Promise<{ success: boolean; questions?: any[]; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const { getFollowUpQuestions } = await import("@/lib/supabase/helpers");
    const questions = await getFollowUpQuestions(parentQuestionId, selectedOption);

    return { success: true, questions };
  } catch (error: any) {
    console.error("Error in getFollowUpQuestions:", error);
    return { success: false, error: error.message || "Failed to get follow-up questions" };
  }
}

/**
 * Save answers to application questions
 */
export async function saveQuestionAnswers(
  applicationId: string,
  answers: Array<{
    questionId: string;
    selectedOption: string;
    answerText: string;
  }>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate inputs
    if (!applicationId || typeof applicationId !== 'string' || applicationId.trim() === '') {
      console.error("[saveQuestionAnswers] Invalid applicationId:", applicationId);
      return { success: false, error: "Application ID is required" };
    }

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      console.error("[saveQuestionAnswers] Invalid answers:", answers);
      return { success: false, error: "Answers are required" };
    }

    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Verify the application belongs to the user
    const supabase = createAdminClient();
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("id, user_id, status")
      .eq("id", applicationId)
      .single<{ id: string; user_id: string; status: string }>();

    if (appError) {
      console.error("[saveQuestionAnswers] Database error:", appError);
      // Check if it's a "not found" error
      if (appError.code === 'PGRST116' || appError.message?.includes('No rows')) {
        return { success: false, error: "Application not found" };
      }
      return { success: false, error: `Database error: ${appError.message}` };
    }

    if (!application) {
      console.error("[saveQuestionAnswers] Application not found:", applicationId);
      return { success: false, error: "Application not found" };
    }

    if (application.user_id !== user.id) {
      console.error("[saveQuestionAnswers] Unauthorized access attempt:", { 
        applicationUserId: application.user_id, 
        currentUserId: user.id 
      });
      return { success: false, error: "Unauthorized" };
    }

    const { saveApplicationAnswers } = await import("@/lib/supabase/helpers");
    await saveApplicationAnswers(applicationId, answers);

    // Extract structured form data from answers and save to form_data
    await extractAndSaveFormData(applicationId, answers);

    revalidatePath(`/applications/${applicationId}`);
    return { success: true };
  } catch (error: any) {
    console.error("[saveQuestionAnswers] Unexpected error:", error);
    return { success: false, error: error.message || "Failed to save answers" };
  }
}

/**
 * Extract structured form data from question answers and save to form_data
 */
async function extractAndSaveFormData(
  applicationId: string,
  answers: Array<{
    questionId: string;
    selectedOption: string;
    answerText: string;
  }>
) {
  try {
    // Get all questions to map answers to questions
    const { getApplicationQuestionsByStep } = await import("@/lib/supabase/helpers");
    const allQuestions: any[] = [];
    
    // Get questions from all steps
    for (let step = 1; step <= 7; step++) {
      const result = await getApplicationQuestionsByStep(step);
      if (result && result.length > 0) {
        allQuestions.push(...result);
      }
    }

    // Get follow-up questions
    const { getFollowUpQuestions } = await import("@/lib/supabase/helpers");
    for (const question of allQuestions) {
      if (question.options && Array.isArray(question.options)) {
        for (const option of question.options) {
          try {
            const followUps = await getFollowUpQuestions(question.id, option.label);
            if (followUps && followUps.length > 0) {
              allQuestions.push(...followUps);
            }
          } catch (err) {
            // Ignore errors for follow-up questions
          }
        }
      }
    }

    // Create a map of questionId -> question for quick lookup
    const questionMap = new Map(allQuestions.map(q => [q.id, q]));

    // Initialize formData with default values (matching the structure in database)
    const formData: {
      dependents: {
        hasDependents: boolean;
        dependents: Array<{
          id: string;
          fullName: string;
          relationship: string;
          dateOfBirth: string;
          countryOfBirth: string;
        }>;
      };
      financialSupport: {
        fundingSource: string;
        sponsorName: string;
        sponsorRelationship: string;
        sponsorAddress: {
          street: string;
          city: string;
          state: string;
          zipCode: string;
          country: string;
        };
        annualIncome: string;
        savingsAmount: string;
        scholarshipName: string;
        otherSource: string;
      };
      tiesToCountry: {
        question1: string;
        question2: string;
        question3: string;
      };
    } = {
      dependents: {
        hasDependents: false,
        dependents: [],
      },
      financialSupport: {
        fundingSource: '',
        sponsorName: '',
        sponsorRelationship: '',
        sponsorAddress: {
          street: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
        },
        annualIncome: '',
        savingsAmount: '',
        scholarshipName: '',
        otherSource: '',
      },
      tiesToCountry: {
        question1: '',
        question2: '',
        question3: '',
      },
    };

    // Process each answer to extract structured data
    for (const answer of answers) {
      const question = questionMap.get(answer.questionId);
      if (!question) {
        console.log(`[extractAndSaveFormData] Question not found for answer.questionId: ${answer.questionId}`);
        continue;
      }

      // Extract based on question category or theme
      const category = question.category?.toLowerCase() || '';
      const theme = question.theme?.toLowerCase() || '';
      const questionText = question.question_text?.toLowerCase() || '';
      const stepNumber = question.step_number || 0;
      const orderIndex = question.order_index || 0;
      const hasParent = !!question.parent_question_id;

      console.log(`[extractAndSaveFormData] Processing answer:`, {
        stepNumber,
        orderIndex,
        hasParent,
        category,
        theme,
        questionText: questionText.substring(0, 50),
        answerText: answer.answerText.substring(0, 50),
      });

      // Note: Step 6 questions are about "planning" not "ties to country"
      // Ties to country information is not captured in the current question structure
      // These fields will remain empty unless there are specific questions added later

      // Extract Financial Support from Step 7
      if (stepNumber === 7) {
        // Main financial support question (order_index 1, no parent)
        if (question.order_index === 1 && !question.parent_question_id) {
          const answerLower = answer.answerText.toLowerCase();
          if (answerLower.includes('patrocinador') || answerLower.includes('sponsor') || 
              answerLower.includes('suporte financeiro comprovado') || answer.selectedOption === 'B') {
            formData.financialSupport.fundingSource = 'sponsor';
          } else if (answerLower.includes('próprio') || answerLower.includes('self') || 
                     answerLower.includes('reservas financeiras') || answer.selectedOption === 'A') {
            formData.financialSupport.fundingSource = 'self';
          } else if (answerLower.includes('bolsa') || answerLower.includes('scholarship') || 
                     answer.selectedOption === 'C') {
            formData.financialSupport.fundingSource = 'scholarship';
          } else {
            formData.financialSupport.fundingSource = 'other';
          }
        }

        // Extract sponsor information from follow-up questions
        if (category.includes('financial_support_combination') || 
            category.includes('financial_support_sponsor') ||
            answer.answerText.toLowerCase().includes('patrocinador') ||
            answer.answerText.toLowerCase().includes('sponsor')) {
          
          // Try to extract sponsor name
          const sponsorNameMatch = answer.answerText.match(/(?:nome|patrocinador|sponsor)[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
          if (sponsorNameMatch && sponsorNameMatch[1]) {
            formData.financialSupport.sponsorName = sponsorNameMatch[1];
          } else if (answer.answerText.length > 10 && 
                     !answer.answerText.match(/^(A|B|C|D|E|A1|A2|A3|B1|B2|B3|C1|C2|C3)$/i)) {
            // Try to extract name from text
            const words = answer.answerText.split(/\s+/);
            if (words.length >= 2 && words[0].length > 2 && /^[A-Z]/.test(words[0])) {
              formData.financialSupport.sponsorName = words.slice(0, 2).join(' ');
            }
          }
        }

        // Extract savings amount from follow-up questions
        // Category: financial_support_savings (follow-up for option A)
        if (category.includes('financial_support_savings') || 
            category.includes('financial_support_accumulated')) {
          // These are follow-up questions about savings, but they don't contain numeric values
          // They are multiple choice options. We can't extract specific amounts from them.
          // The savingsAmount should come from bank statements or be entered separately
          console.log(`[extractAndSaveFormData] Found savings question but no numeric value in answer: ${answer.answerText.substring(0, 100)}`);
        }

        // Extract annual income
        // Note: Annual income is not captured in the current question structure
        // This field will remain empty unless there are specific questions added later

        // Extract scholarship name
        if (category.includes('scholarship') || questionText.includes('bolsa') || 
            questionText.includes('scholarship')) {
          if (answer.answerText && !answer.answerText.match(/^(A|B|C|D|E)$/i)) {
            formData.financialSupport.scholarshipName = answer.answerText;
          }
        }

        // Extract other source
        if (category.includes('other') || questionText.includes('outro') || 
            questionText.includes('other')) {
          formData.financialSupport.otherSource = answer.answerText;
        }
      }

      // Dependents (if there are specific questions about dependents)
      if (category.includes('dependent') || theme.includes('dependent') || questionText.includes('dependent')) {
        formData.dependents.hasDependents = answer.selectedOption?.toLowerCase().includes('sim') || 
                                            answer.selectedOption?.toLowerCase().includes('yes') || 
                                            false;
        // If answer contains dependent information, parse it
        // This would need to be customized based on your question structure
      }
    }

    // Always save form_data (even with default/empty values)
    // This ensures the structure is always present in the database
    console.log("[extractAndSaveFormData] Extracted form data:", JSON.stringify(formData, null, 2));
    const { updateApplication } = await import("@/lib/supabase/helpers");
    await updateApplication(applicationId, formData);
    console.log("[extractAndSaveFormData] Form data saved successfully");
  } catch (error: any) {
    console.error("[extractAndSaveFormData] Error extracting form data:", error);
    // Don't throw - this is a best-effort operation
  }
}

/**
 * Get answers for an application
 */
export async function getApplicationQuestionAnswers(applicationId: string): Promise<{ success: boolean; answers?: any[]; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Verify the application belongs to the user
    const supabase = createAdminClient();
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("user_id")
      .eq("id", applicationId)
      .single<{ user_id: string }>();

    if (appError || !application) {
      return { success: false, error: "Application not found" };
    }

    if (application.user_id !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    const { getApplicationAnswers } = await import("@/lib/supabase/helpers");
    const answers = await getApplicationAnswers(applicationId);

    return { success: true, answers };
  } catch (error: any) {
    console.error("Error in getApplicationQuestionAnswers:", error);
    return { success: false, error: error.message || "Failed to get answers" };
  }
}

/**
 * Reprocess all documents and update form_data
 * This is useful when documents were processed before the updateFormDataFromExtractedDocuments function was available
 */
export async function reprocessFormDataFromDocuments(
  applicationId: string
): Promise<{ success: boolean; error?: string }> {
  return updateFormDataFromExtractedDocuments(applicationId);
}

/**
 * Update form_data with extracted data from documents
 * This function extracts:
 * - savingsAmount from bank statements (sum of closing balances)
 * - sponsorName from sponsor documents (sponsor_bank_statement, sponsor_assets)
 * - dependents from dependent documents (dependent_passport, dependent_i94, dependent_i20)
 * - tiesToCountry.question1/2/3 from ties documents (rawText or structured fields)
 */
export async function updateFormDataFromExtractedDocuments(
  applicationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Verify the application belongs to the user
    const supabase = createAdminClient();
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("id, user_id, form_data")
      .eq("id", applicationId)
      .single<{ id: string; user_id: string; form_data: any }>();

    if (appError || !application) {
      return { success: false, error: "Application not found" };
    }

    if (application.user_id !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Get all processed documents for this application
    const { data: documents, error: docsError } = await supabase
      .from("documents")
      .select("id, type, name, status, extracted_data")
      .eq("application_id", applicationId)
      .eq("status", "completed")
      .order("created_at", { ascending: true });

    if (docsError) {
      console.error("[updateFormDataFromExtractedDocuments] Error fetching documents:", docsError);
      return { success: false, error: "Failed to fetch documents" };
    }

    // Type assertion to help TypeScript understand the document structure
    type DocumentWithData = {
      id: string;
      type: string;
      name: string;
      status: string;
      extracted_data: any;
    };
    const typedDocuments = (documents || []) as DocumentWithData[];

    // Get existing form_data or initialize with defaults
    const existingFormData = (application.form_data as any) || {};
    const formData: any = {
      dependents: existingFormData.dependents || {
        hasDependents: false,
        dependents: [],
      },
      tiesToCountry: existingFormData.tiesToCountry || {
        question1: '',
        question2: '',
        question3: '',
      },
      financialSupport: existingFormData.financialSupport || {
        fundingSource: '',
        sponsorName: '',
        sponsorRelationship: '',
        sponsorAddress: {
          street: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
        },
        annualIncome: '',
        savingsAmount: '',
        scholarshipName: '',
        otherSource: '',
      },
      currentAddress: existingFormData.currentAddress,
    };

    // Extract savingsAmount from bank statements, sponsor info, and dependents
    if (typedDocuments && typedDocuments.length > 0) {
      let totalSavings = 0;
      const tiesTexts: string[] = [];
      let sponsorName = '';
      const dependentsList: Array<{
        id: string;
        fullName: string;
        relationship: string;
        dateOfBirth: string;
        countryOfBirth: string;
      }> = [];

      for (const doc of typedDocuments) {
        const extractedData = doc.extracted_data as any;
        if (!extractedData) {
          console.log(`[updateFormDataFromExtractedDocuments] Document ${doc.name} (${doc.type}) has no extracted_data`);
          continue;
        }

        console.log(`[updateFormDataFromExtractedDocuments] Processing document ${doc.name} (${doc.type})`);

        // Process bank statements (applicant's own, not sponsor's)
        if (doc.type === "bank_statement") {
          console.log(`[updateFormDataFromExtractedDocuments] Found bank statement, checking for balance...`);
          console.log(`[updateFormDataFromExtractedDocuments] Available fields:`, Object.keys(extractedData).slice(0, 20));
          // Try multiple field names for closing balance
          const closingBalance = extractedData.closingBalance || 
                                 extractedData.closing_balance || 
                                 extractedData.endingBalance || 
                                 extractedData.ending_balance || 
                                 extractedData.totalBalance || 
                                 extractedData.total_balance ||
                                 extractedData.balance;
          
          if (closingBalance) {
            const balance = parseFloat(
              String(closingBalance).replace(/,/g, '').replace(/[^0-9.-]/g, '')
            );
            if (!isNaN(balance) && balance > 0) {
              totalSavings += balance;
              console.log(`[updateFormDataFromExtractedDocuments] Found balance ${balance} from ${doc.name}`);
            }
          } else if (extractedData.rawText) {
            // Try to extract from rawText if structured field is missing
            const rawText = extractedData.rawText;
            const balancePatterns = [
              /(?:Ending|Closing|Total)\s+balance[:\s]*\$?([\d,]+\.?\d*)/i,
              /Total\s+balance[:\s]*\$?([\d,]+\.?\d*)/i,
              /\$([\d,]+\.?\d*)\s*(?:Total|Ending|Closing)/i,
            ];
            
            for (const pattern of balancePatterns) {
              const match = rawText.match(pattern);
              if (match && match[1]) {
                const balance = parseFloat(match[1].replace(/,/g, ''));
                if (!isNaN(balance) && balance > 0) {
                  totalSavings += balance;
                  console.log(`[updateFormDataFromExtractedDocuments] Extracted balance ${balance} from rawText of ${doc.name}`);
                  break;
                }
              }
            }
          }
        }

        // Process ties to country documents
        if (doc.type === "supporting_documents" || doc.type === "ties_supporting_documents") {
          // Try to extract structured information
          const tiesInfo: string[] = [];

          // Family ties (question1)
          if (extractedData.familyMemberName || extractedData.relationshipType) {
            const familyInfo = `Family member: ${extractedData.familyMemberName || 'N/A'}, Relationship: ${extractedData.relationshipType || 'N/A'}`;
            tiesInfo.push(familyInfo);
          }

          // Property/assets (question2)
          if (extractedData.propertyAddress || extractedData.propertyValue) {
            const propertyInfo = `Property: ${extractedData.propertyAddress || 'N/A'}, Value: ${extractedData.propertyValue || 'N/A'}`;
            tiesInfo.push(propertyInfo);
          }

          // Employment (question3)
          if (extractedData.employmentCompany || extractedData.employmentPosition) {
            const employmentInfo = `Employment: ${extractedData.employmentCompany || 'N/A'}, Position: ${extractedData.employmentPosition || 'N/A'}`;
            tiesInfo.push(employmentInfo);
          }

          // If we have rawText but no structured data, use rawText
          if (tiesInfo.length === 0 && extractedData.rawText) {
            tiesTexts.push(extractedData.rawText);
          } else if (tiesInfo.length > 0) {
            tiesTexts.push(tiesInfo.join('. '));
          }
        }

        // Process sponsor documents to extract sponsor name
        if (doc.type === "sponsor_bank_statement" || doc.type === "sponsor_assets") {
          console.log(`[updateFormDataFromExtractedDocuments] Found sponsor document: ${doc.name}`);
          
          // Try to extract sponsor name from account holder or owner name
          let sponsorNameFromDoc = extractedData.accountHolderName || 
                                   extractedData.account_holder_name || 
                                   extractedData.ownerName || 
                                   extractedData.owner_name;
          
          // If not found in structured data, try to extract from rawText
          if (!sponsorNameFromDoc && extractedData.rawText) {
            const rawText = extractedData.rawText;
            // Look for name patterns in rawText (usually appears early in bank statements)
            // Pattern: "Miguel Pereira" or "Customer service information\nMiguel Pereira"
            const namePatterns = [
              /(?:Customer service information|Account Holder|Name)[:\s]*\n?([A-Z][a-z]+\s+[A-Z][a-z]+)/,
              /^([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/m,
              /([A-Z][a-z]+\s+(?:PEREIRA|SOUZA|SILVA|SANTOS|OLIVEIRA|COSTA|RODRIGUES|ALMEIDA|NASCIMENTO|LIMA|ARAUJO|FERREIRA|BARBOSA|RIBEIRO|CARVALHO|ALVES|MOREIRA|FERNANDES|GOMES|MARTINS))/,
            ];
            
            for (const pattern of namePatterns) {
              const match = rawText.match(pattern);
              if (match && match[1]) {
                sponsorNameFromDoc = match[1].trim();
                console.log(`[updateFormDataFromExtractedDocuments] Extracted sponsor name from rawText: ${sponsorNameFromDoc}`);
                break;
              }
            }
          }
          
          if (sponsorNameFromDoc && !sponsorName) {
            sponsorName = sponsorNameFromDoc;
            console.log(`[updateFormDataFromExtractedDocuments] Updated sponsorName: ${sponsorName}`);
          }
        }

        // Process dependent documents to extract dependent information
        if (doc.type === "dependent_passport" || doc.type === "dependent_i94" || doc.type === "dependent_i20") {
          console.log(`[updateFormDataFromExtractedDocuments] Found dependent document: ${doc.name}`);
          
          // Extract dependent name from passport, I-94, or I-20
          const dependentName = extractedData.name || 
                               extractedData.first_name && extractedData.last_name 
                                 ? `${extractedData.first_name} ${extractedData.last_name}`
                                 : extractedData.studentName || 
                                 extractedData.fullName;
          
          const dateOfBirth = extractedData.dateOfBirth || 
                             extractedData.birthDate || 
                             extractedData.birth_date ||
                             extractedData.date_of_birth;
          
          const countryOfBirth = extractedData.placeOfBirth || 
                                extractedData.place_of_birth ||
                                extractedData.countryOfBirth ||
                                extractedData.country_of_birth;
          
          if (dependentName) {
            // Check if this dependent already exists
            const existingDependent = dependentsList.find(d => 
              d.fullName.toLowerCase() === dependentName.toLowerCase()
            );
            
            if (!existingDependent) {
              dependentsList.push({
                id: `dep_${dependentsList.length + 1}`,
                fullName: dependentName,
                relationship: extractedData.relationship || extractedData.relationshipType || 'Spouse/Child',
                dateOfBirth: dateOfBirth || '',
                countryOfBirth: countryOfBirth || '',
              });
              console.log(`[updateFormDataFromExtractedDocuments] Added dependent: ${dependentName}`);
            } else {
              // Update existing dependent with additional info
              if (dateOfBirth && !existingDependent.dateOfBirth) {
                existingDependent.dateOfBirth = dateOfBirth;
              }
              if (countryOfBirth && !existingDependent.countryOfBirth) {
                existingDependent.countryOfBirth = countryOfBirth;
              }
            }
          }
        }
      }

      // Update sponsor name if found
      if (sponsorName) {
        formData.financialSupport.sponsorName = sponsorName;
        console.log(`[updateFormDataFromExtractedDocuments] Updated sponsorName: ${sponsorName}`);
      }

      // Update dependents if found
      if (dependentsList.length > 0) {
        formData.dependents.hasDependents = true;
        formData.dependents.dependents = dependentsList;
        console.log(`[updateFormDataFromExtractedDocuments] Updated dependents: ${dependentsList.length} dependent(s)`);
      }

      // Update savingsAmount if we found bank statements
      if (totalSavings > 0) {
        formData.financialSupport.savingsAmount = totalSavings.toFixed(2);
        console.log(`[updateFormDataFromExtractedDocuments] Updated savingsAmount: ${formData.financialSupport.savingsAmount}`);
      } else {
        console.log(`[updateFormDataFromExtractedDocuments] No savings amount found. Total savings: ${totalSavings}`);
        console.log(`[updateFormDataFromExtractedDocuments] Bank statements found: ${typedDocuments.filter(d => d.type === "bank_statement").length}`);
      }

      // Update tiesToCountry if we found ties documents
      if (tiesTexts.length > 0) {
        // Combine all ties texts
        const combinedText = tiesTexts.join('\n\n');
        
        // Try to intelligently split into question1, question2, question3
        // If we have structured data, use it; otherwise, split the text
        if (tiesTexts.length >= 3) {
          formData.tiesToCountry.question1 = tiesTexts[0] || '';
          formData.tiesToCountry.question2 = tiesTexts[1] || '';
          formData.tiesToCountry.question3 = tiesTexts[2] || '';
        } else if (tiesTexts.length === 2) {
          formData.tiesToCountry.question1 = tiesTexts[0] || '';
          formData.tiesToCountry.question2 = tiesTexts[1] || '';
        } else if (tiesTexts.length === 1) {
          // Split single text into 3 parts if it's long enough
          const text = tiesTexts[0];
          const parts = text.split(/\.\s+/);
          if (parts.length >= 3) {
            formData.tiesToCountry.question1 = parts.slice(0, Math.ceil(parts.length / 3)).join('. ');
            formData.tiesToCountry.question2 = parts.slice(Math.ceil(parts.length / 3), Math.ceil(parts.length * 2 / 3)).join('. ');
            formData.tiesToCountry.question3 = parts.slice(Math.ceil(parts.length * 2 / 3)).join('. ');
          } else {
            formData.tiesToCountry.question1 = text;
          }
        }
        
        console.log(`[updateFormDataFromExtractedDocuments] Updated tiesToCountry with ${tiesTexts.length} document(s)`);
      }
    }

    // Update form_data in database
    const { updateApplication } = await import("@/lib/supabase/helpers");
    await updateApplication(applicationId, formData);
    
    console.log("[updateFormDataFromExtractedDocuments] Form data updated successfully");
    return { success: true };
  } catch (error: any) {
    console.error("[updateFormDataFromExtractedDocuments] Error:", error);
    return { success: false, error: error.message || "Failed to update form data" };
  }
}

/**
 * Delete an application and optionally its associated documents
 */
export async function deleteApplicationAction(
  applicationId: string,
  deleteDocuments: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await currentUser();

    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const supabase = createAdminClient();

    // Verify application belongs to user
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("user_id")
      .eq("id", applicationId)
      .single<{ user_id: string }>();

    if (appError || !application) {
      return { success: false, error: "Application not found" };
    }

    if (application.user_id !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // If deleteDocuments is true, delete all associated documents from storage and database
    if (deleteDocuments) {
      const { data: documents } = await supabase
        .from("documents")
        .select("id, file_url")
        .eq("application_id", applicationId);
      
      const typedDocuments = (documents || []) as Array<{ id: string; file_url: string | null }>;

      if (typedDocuments && typedDocuments.length > 0) {
        // Delete files from storage
        for (const doc of typedDocuments) {
          if (doc.file_url) {
            try {
              const urlMatch = doc.file_url.match(
                /\/storage\/v1\/object\/public\/documents\/(.+)/
              );
              if (urlMatch) {
                const filePath = urlMatch[1];
                await supabase.storage.from("documents").remove([filePath]);
              }
            } catch (storageError) {
              console.error("Error deleting file from storage:", storageError);
            }
          }
        }

        // Delete document records
        await supabase
          .from("documents")
          .delete()
          .eq("application_id", applicationId);
      }
    } else {
      // Set application_id to null for associated documents
      await supabase
        .from("documents")
        // @ts-expect-error - Supabase type inference issue with update()
        .update({ application_id: null })
        .eq("application_id", applicationId);
    }

    // Delete the application (generated_documents will be deleted automatically via CASCADE)
    const { error: deleteError } = await supabase
      .from("applications")
      .delete()
      .eq("id", applicationId);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    revalidatePath("/dashboard");
    revalidatePath("/applications");

    return { success: true };
  } catch (error: any) {
    console.error("Error deleting application:", error);
    return {
      success: false,
      error: error.message || "Failed to delete application",
    };
  }
}
