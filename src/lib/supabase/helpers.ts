import { createClient } from "./server";
import { createAdminClient } from "./admin";
import type { Database } from "./types";
import { getRequiredDocuments, type DocumentRequirements } from "../document-requirements";

/**
 * Generate a unique case ID in format: ABC123-FIRSTNAME-LASTNAME
 */
export function generateCaseId(firstName: string | null | undefined, lastName: string | null | undefined): string {
  // Generate random 3 letters + 3 numbers
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  
  const randomLetters = Array.from({ length: 3 }, () => 
    letters[Math.floor(Math.random() * letters.length)]
  ).join("");
  
  const randomNumbers = Array.from({ length: 3 }, () => 
    numbers[Math.floor(Math.random() * numbers.length)]
  ).join("");
  
  const code = `${randomLetters}${randomNumbers}`;
  
  // Get name parts, default to empty if not provided
  const first = (firstName || "").toUpperCase().replace(/[^A-Z]/g, "") || "USER";
  const last = (lastName || "").toUpperCase().replace(/[^A-Z]/g, "") || "CASE";
  
  return `${code}-${first}-${last}`;
}

// Use admin client for profile operations to bypass any potential RLS issues
function getSupabaseClient() {
  try {
    // Try to use admin client if service role key is available
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return createAdminClient();
    }
    // Fallback to regular client
    return createClient();
  } catch {
    // If admin client fails, use regular client
    return createClient();
  }
}

type Application = Database["public"]["Tables"]["applications"]["Row"];
type Document = Database["public"]["Tables"]["documents"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export async function getUserApplications(userId: string) {
  // Use admin client to ensure we can always fetch applications
  // even if RLS is enabled or there are permission issues
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    supabaseUrl &&
    supabaseUrl !== "your_supabase_project_url" &&
    serviceRoleKey &&
    serviceRoleKey !== "your_service_role_key_here"
  ) {
    // Use admin client for reliable access
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching applications (admin client):", error);
      return [];
    }

    return (data || []) as Application[];
  }

  // Fallback to regular client if admin not available
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching applications:", error);
    return [];
  }

  return (data || []) as Application[];
}

export async function getUserDocuments(userId: string, limit = 10) {
  // Use admin client to ensure we can always fetch documents
  // even if RLS is enabled or there are permission issues
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    supabaseUrl &&
    supabaseUrl !== "your_supabase_project_url" &&
    serviceRoleKey &&
    serviceRoleKey !== "your_service_role_key_here"
  ) {
    // Use admin client for reliable access
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching documents (admin client):", error);
      return [];
    }

    return (data || []) as Document[];
  }

  // Fallback to regular client if admin not available
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching documents:", error);
    return [];
  }

  return (data || []) as Document[];
}

/**
 * Get documents for a specific application
 */
export async function getApplicationDocuments(applicationId: string) {
  // Use admin client to ensure we can always fetch documents
  // even if RLS is enabled or there are permission issues
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    supabaseUrl &&
    supabaseUrl !== "your_supabase_project_url" &&
    serviceRoleKey &&
    serviceRoleKey !== "your_service_role_key_here"
  ) {
    // Use admin client for reliable access
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching application documents (admin client):", error);
      return [];
    }

    return (data || []) as Document[];
  }

  // Fallback to regular client if admin not available
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching application documents:", error);
    return [];
  }

  return (data || []) as Document[];
}

export async function getApplicationStats(userId: string) {
  const supabase = await createClient();
  
  const { data: applications, error } = await supabase
    .from("applications")
    .select("status")
    .eq("user_id", userId);

  if (error) {
    console.error("Error fetching stats:", error);
    return {
      totalApplications: 0,
      inProgress: 0,
      completed: 0,
      pending: 0,
    };
  }

  const stats = {
    totalApplications: applications?.length || 0,
    inProgress: applications?.filter((app) => app.status === "in_progress").length || 0,
    completed: applications?.filter((app) => app.status === "completed").length || 0,
    pending: applications?.filter((app) => app.status === "draft").length || 0,
  };

  return stats;
}

export async function createApplication(
  userId: string,
  country: string,
  visaType: string,
  formData?: {
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
  },
  firstName?: string | null,
  lastName?: string | null
) {
  console.log("[createApplication] Called with:", { userId, country, visaType, firstName, lastName });
  
  // Check if Supabase is configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    supabaseUrl === "your_supabase_project_url" ||
    !serviceRoleKey ||
    serviceRoleKey === "your_service_role_key_here"
  ) {
    console.error("[createApplication] Supabase not configured");
    throw new Error("Supabase is not configured");
  }

  try {
    const supabase = createAdminClient();
    
    // Generate unique case_id
    let caseId = generateCaseId(firstName, lastName);
    console.log("[createApplication] Generated case_id:", caseId);
    
    // Ensure uniqueness by checking if case_id already exists
    let attempts = 0;
    while (attempts < 10) {
      const { data: existing } = await supabase
        .from("applications")
        .select("id")
        .eq("case_id", caseId)
        .single();
      
      if (!existing) {
        break; // case_id is unique
      }
      
      // Regenerate if exists
      caseId = generateCaseId(firstName, lastName);
      attempts++;
    }
    
    console.log("[createApplication] Inserting into database...");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("applications") as any)
      .insert({
        user_id: userId,
        country,
        visa_type: visaType,
        case_id: caseId,
        status: "draft",
        form_data: formData || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[createApplication] Database error:", error);
      throw error;
    }

    console.log("[createApplication] Success:", data);
    return data;
  } catch (error: any) {
    console.error("[createApplication] Error:", error);
    throw error;
  }
}

/**
 * Update an existing application with form data
 */
export async function updateApplication(
  applicationId: string,
  formData?: {
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
) {
  // Check if Supabase is configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    supabaseUrl === "your_supabase_project_url" ||
    !serviceRoleKey ||
    serviceRoleKey === "your_service_role_key_here"
  ) {
    throw new Error("Supabase is not configured");
  }

  try {
    const supabase = createAdminClient();
    
    // Get existing form_data and merge with new data
    const { data: existingApp } = await supabase
      .from("applications")
      .select("form_data")
      .eq("id", applicationId)
      .single();

    const existingFormData = ((existingApp as any)?.form_data) || {};
    const mergedFormData = {
      ...existingFormData,
      ...(formData?.currentAddress && { currentAddress: formData.currentAddress }),
      ...(formData?.tiesToCountry && { tiesToCountry: formData.tiesToCountry }),
      ...(formData?.dependents && { dependents: formData.dependents }),
      ...(formData?.financialSupport && { financialSupport: formData.financialSupport }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("applications") as any)
      .update({
        form_data: mergedFormData,
        status: "draft",
      })
      .eq("id", applicationId)
      .select()
      .single();

    if (error) {
      console.error("Error updating application:", error);
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error("Error in updateApplication:", error);
    throw error;
  }
}

export async function createDocument(
  userId: string,
  applicationId: string | null,
  name: string,
  type: string,
  fileUrl: string,
  fileSize: number,
  mimeType: string
) {
  // Use admin client to bypass RLS policies
  // This ensures documents can always be created regardless of RLS settings
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    supabaseUrl &&
    supabaseUrl !== "your_supabase_project_url" &&
    serviceRoleKey &&
    serviceRoleKey !== "your_service_role_key_here"
  ) {
    // Use admin client for reliable access
    const supabase = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("documents") as any)
      .insert({
        user_id: userId,
        application_id: applicationId,
        name,
        type,
        file_url: fileUrl,
        file_size: fileSize,
        mime_type: mimeType,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating document (admin client):", error);
      throw error;
    }

    return data;
  }

  // Fallback to regular client if admin not available
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("documents") as any)
    .insert({
      user_id: userId,
      application_id: applicationId,
      name,
      type,
      file_url: fileUrl,
      file_size: fileSize,
      mime_type: mimeType,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating document:", error);
    throw error;
  }

  return data;
}

// Profile helper functions
export async function getUserProfile(userId: string) {
  // Check if Supabase is configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    supabaseUrl === "your_supabase_project_url" ||
    !serviceRoleKey ||
    serviceRoleKey === "your_service_role_key_here"
  ) {
    return null;
  }

  try {
    // Use admin client for consistency with create/update operations
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      // Profile doesn't exist yet, return null
      if (error.code === "PGRST116") {
        return null;
      }
      console.error("Error fetching profile:", error);
      throw error;
    }

    return data as Profile;
  } catch (error) {
    console.error("Error in getUserProfile:", error);
    throw error;
  }
}

export async function createOrUpdateProfile(
  userId: string,
  profileData: {
    email?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    date_of_birth?: string;
    nationality?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
    avatar_url?: string;
    metadata?: Record<string, unknown>;
  }
) {
  // Check if Supabase is configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    supabaseUrl === "your_supabase_project_url" ||
    !serviceRoleKey ||
    serviceRoleKey === "your_service_role_key_here"
  ) {
    throw new Error("Supabase is not configured");
  }

  try {
    // Use admin client for profile operations to bypass RLS
    const supabase = createAdminClient();
    
    console.log("Creating/updating profile for user:", userId);
    console.log("Profile data:", profileData);

    // Prepare the data object
    const profileInsert = {
      user_id: userId,
      email: profileData.email || null,
      first_name: profileData.first_name || null,
      last_name: profileData.last_name || null,
      phone: profileData.phone || null,
      date_of_birth: profileData.date_of_birth || null,
      nationality: profileData.nationality || null,
      address: profileData.address || null,
      city: profileData.city || null,
      state: profileData.state || null,
      country: profileData.country || null,
      postal_code: profileData.postal_code || null,
      avatar_url: profileData.avatar_url || null,
      metadata: (profileData.metadata as any) || null,
    };

    const { data, error } = await supabase
      .from("profiles")
      .upsert(profileInsert as any, {
        onConflict: "user_id",
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase error creating/updating profile:", error);
      console.error("Error details:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }

    console.log("Profile created/updated successfully:", data);
    return data as Profile;
  } catch (error: any) {
    console.error("Error in createOrUpdateProfile:", error);
    throw error;
  }
}

export async function updateProfile(
  userId: string,
  updates: Partial<Database["public"]["Tables"]["profiles"]["Update"]>
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("Error updating profile:", error);
    throw error;
  }

  return data as Profile;
}

/**
 * Sync Clerk user data to Supabase profile
 * Call this when a user signs up or updates their Clerk profile
 * 
 * Returns null if Supabase is not configured (graceful degradation)
 */
export async function syncClerkUserToProfile(
  userId: string,
  clerkUser: {
    emailAddresses?: Array<{ emailAddress: string }>;
    firstName?: string | null;
    lastName?: string | null;
    phoneNumbers?: Array<{ phoneNumber: string }>;
    imageUrl?: string;
  }
) {
  // Check if Supabase is configured before attempting to sync
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    supabaseUrl === "your_supabase_project_url" ||
    !serviceRoleKey ||
    serviceRoleKey === "your_service_role_key_here"
  ) {
    // Supabase not configured - gracefully skip profile sync
    console.warn(
      "Supabase not configured. Profile sync skipped. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local to enable profile syncing."
    );
    return null;
  }

  try {
    const email =
      clerkUser.emailAddresses?.[0]?.emailAddress || undefined;
    const phone = clerkUser.phoneNumbers?.[0]?.phoneNumber || undefined;

    return await createOrUpdateProfile(userId, {
      email,
      first_name: clerkUser.firstName || undefined,
      last_name: clerkUser.lastName || undefined,
      phone,
      avatar_url: clerkUser.imageUrl || undefined,
    });
  } catch (error) {
    // Log error but don't throw - allow app to continue functioning
    console.error("Error syncing profile to Supabase:", error);
    return null;
  }
}

/**
 * Get all active application questions for a specific step
 * Returns only main questions (not follow-ups)
 */
export async function getApplicationQuestionsByStep(stepNumber: number) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    supabaseUrl === "your_supabase_project_url" ||
    !serviceRoleKey ||
    serviceRoleKey === "your_service_role_key_here"
  ) {
    return [];
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("application_questions")
      .select("*")
      .eq("step_number", stepNumber)
      .eq("is_active", true)
      .is("parent_question_id", null) // Only main questions, not follow-ups
      .order("order_index", { ascending: true });

    if (error) {
      console.error("Error fetching application questions:", error);
      return [];
    }

    return (data || []) as Array<{
      id: string;
      step_number: number;
      theme: string;
      question_text: string;
      question_type: string;
      options: Array<{ label: string; text: string }>;
      order_index: number;
      is_required: boolean;
      category: string | null;
      ai_prompt_context: string;
      help_text: string | null;
      is_active: boolean;
      parent_question_id: string | null;
      trigger_option: string | null;
    }>;
  } catch (error) {
    console.error("Error in getApplicationQuestionsByStep:", error);
    return [];
  }
}

/**
 * Get follow-up questions for a specific parent question and selected option
 */
export async function getFollowUpQuestions(
  parentQuestionId: string,
  selectedOption: string
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    supabaseUrl === "your_supabase_project_url" ||
    !serviceRoleKey ||
    serviceRoleKey === "your_service_role_key_here"
  ) {
    return [];
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("application_questions")
      .select("*")
      .eq("parent_question_id", parentQuestionId)
      .eq("trigger_option", selectedOption)
      .eq("is_active", true)
      .order("order_index", { ascending: true });

    if (error) {
      console.error("Error fetching follow-up questions:", error);
      return [];
    }

    return (data || []) as Array<{
      id: string;
      step_number: number;
      theme: string;
      question_text: string;
      question_type: string;
      options: Array<{ label: string; text: string }>;
      order_index: number;
      is_required: boolean;
      category: string | null;
      ai_prompt_context: string;
      help_text: string | null;
      is_active: boolean;
      parent_question_id: string | null;
      trigger_option: string | null;
    }>;
  } catch (error) {
    console.error("Error in getFollowUpQuestions:", error);
    return [];
  }
}

/**
 * Get all questions for all steps (1-7)
 */
export async function getAllApplicationQuestions() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    supabaseUrl === "your_supabase_project_url" ||
    !serviceRoleKey ||
    serviceRoleKey === "your_service_role_key_here"
  ) {
    return [];
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("application_questions")
      .select("*")
      .eq("is_active", true)
      .order("step_number", { ascending: true })
      .order("order_index", { ascending: true });

    if (error) {
      console.error("Error fetching all application questions:", error);
      return [];
    }

    return (data || []) as Array<{
      id: string;
      step_number: number;
      theme: string;
      question_text: string;
      question_type: string;
      options: Array<{ label: string; text: string }>;
      order_index: number;
      is_required: boolean;
      category: string | null;
      ai_prompt_context: string;
      help_text: string | null;
      is_active: boolean;
    }>;
  } catch (error) {
    console.error("Error in getAllApplicationQuestions:", error);
    return [];
  }
}

/**
 * Get answers for a specific application
 */
export async function getApplicationAnswers(applicationId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    supabaseUrl === "your_supabase_project_url" ||
    !serviceRoleKey ||
    serviceRoleKey === "your_service_role_key_here"
  ) {
    return [];
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("application_question_answers")
      .select(`
        *,
        application_questions (
          id,
          step_number,
          theme,
          question_text,
          category,
          ai_prompt_context
        )
      `)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching application answers:", error);
      return [];
    }

    return (data || []) as Array<{
      id: string;
      application_id: string;
      question_id: string;
      selected_option: string;
      answer_text: string;
      application_questions: {
        id: string;
        step_number: number;
        theme: string;
        question_text: string;
        category: string | null;
        ai_prompt_context: string;
      } | null;
    }>;
  } catch (error) {
    console.error("Error in getApplicationAnswers:", error);
    return [];
  }
}

/**
 * Save or update an answer to a question
 */
export async function saveApplicationAnswer(
  applicationId: string,
  questionId: string,
  selectedOption: string,
  answerText: string
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    supabaseUrl === "your_supabase_project_url" ||
    !serviceRoleKey ||
    serviceRoleKey === "your_service_role_key_here"
  ) {
    throw new Error("Supabase is not configured");
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await (supabase.from("application_question_answers") as any).upsert(
        {
          application_id: applicationId,
          question_id: questionId,
          selected_option: selectedOption,
          answer_text: answerText,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "application_id,question_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error saving application answer:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("Error in saveApplicationAnswer:", error);
    throw error;
  }
}

/**
 * Save multiple answers at once
 */
export async function saveApplicationAnswers(
  applicationId: string,
  answers: Array<{
    questionId: string;
    selectedOption: string;
    answerText: string;
  }>
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    supabaseUrl === "your_supabase_project_url" ||
    !serviceRoleKey ||
    serviceRoleKey === "your_service_role_key_here"
  ) {
    throw new Error("Supabase is not configured");
  }

  try {
    const supabase = createAdminClient();
    const answersToInsert = answers.map((answer) => ({
      application_id: applicationId,
      question_id: answer.questionId,
      selected_option: answer.selectedOption,
      answer_text: answer.answerText,
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await (supabase.from("application_question_answers") as any).upsert(answersToInsert, {
        onConflict: "application_id,question_id",
      })
      .select();

    if (error) {
      console.error("Error saving application answers:", error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error("Error in saveApplicationAnswers:", error);
    throw error;
  }
}

/**
 * Get required documents for an application based on its form data
 * Returns default requirements if form_data is empty (for draft applications)
 * Uses admin client to bypass any RLS issues
 */
export async function getApplicationDocumentRequirements(
  applicationId: string
): Promise<DocumentRequirements | null> {
  try {
    // Use admin client to ensure we can always fetch the application
    // even if RLS is enabled or there are permission issues
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (
      !supabaseUrl ||
      supabaseUrl === "your_supabase_project_url" ||
      !serviceRoleKey ||
      serviceRoleKey === "your_service_role_key_here"
    ) {
      // Fallback to regular client if admin not available
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("applications")
        .select("form_data")
        .eq("id", applicationId)
        .single();

      if (error || !data) {
        console.error("Error fetching application (regular client):", error);
        return null;
      }

      const formData = data.form_data as any;
      if (!formData || Object.keys(formData).length === 0) {
        return getRequiredDocuments({});
      }
      return getRequiredDocuments(formData);
    }

    // Use admin client for reliable access
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("applications")
      .select("form_data")
      .eq("id", applicationId)
      .single();

    if (error) {
      console.error("Error fetching application:", error);
      console.error("Application ID:", applicationId);
      console.error("Error details:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return null;
    }

    if (!data) {
      console.error("Application not found for ID:", applicationId);
      return null;
    }

    const appData = data as { form_data: any };
    const formData = appData.form_data as any;
    
    // If form_data is null or empty, return default requirements (always required documents)
    // This allows users to see required documents even before filling out the form
    if (!formData || Object.keys(formData).length === 0) {
      return getRequiredDocuments({});
    }

    return getRequiredDocuments(formData);
  } catch (error: any) {
    console.error("Unexpected error in getApplicationDocumentRequirements:", error);
    return null;
  }
}

