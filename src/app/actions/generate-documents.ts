"use server";

import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { aggregateApplicationData, AggregatedApplicationData } from "@/lib/application-data-aggregator";
import { LEGAL_CITATIONS } from "@/lib/constants/legal-citations";
import { mergeShortParagraphs } from "@/lib/sizing/merge-short-paragraphs";
import { sanitizeNationality, getCountryName, getCitizenshipAdjective } from "@/lib/utils/sanitize-nationality";
import { extractFinancialData } from "@/lib/pdf/extractFinancialData";
import { sanitizeForPdf } from "@/lib/pdf/sanitizeForPdf";
import { renderCombinedPdfToBuffer } from "@/lib/pdf-templates/renderCombinedPdf";

type DocumentType = 
  | "cover_letter"
  | "personal_statement"
  | "program_justification"
  | "ties_to_country"
  | "sponsor_letter"
  | "exhibit_list";

interface GenerateDocumentResult {
  success: boolean;
  content?: string;
  error?: string;
}

// Section-specific word limits
const SECTION_LIMITS = {
  introduction: { min: 40, max: 70 },
  legal_basis: { min: 35, max: 60 },
  lawful_entry_and_status: { min: 40, max: 70 },
  change_of_intent_explanation: { min: 60, max: 90 },
  purpose_of_study: { min: 50, max: 80 },
  financial_ability_and_non_employment: { min: 60, max: 90 },
  nonimmigrant_intent_and_return_obligation: { min: 60, max: 90 },
  conclusion: { min: 30, max: 50 }
};

// Global document limits
const GLOBAL_LIMITS = {
  maxWordsTotal: 550,
  maxParagraphs: 8,
  minParagraphs: 6
};

// Layout validation rules
const LAYOUT_RULES = {
  maxPages: 1.5,
  maxWordsPerPage: 500,
  maxWordsTotal: 750,
  minParagraphs: 6,
  maxParagraphs: 8,
  minLinesPerParagraph: 3,
  maxLinesPerParagraph: 7,
  maxWordsPerParagraph: 120
};

// Function-Calling System Type Definitions
interface CoverLetterSections {
  introduction: string;
  legal_basis: string;
  lawful_entry_and_status?: string;
  change_of_intent_explanation: string;
  purpose_of_study?: string;
  financial_ability_and_non_employment: string;
  nonimmigrant_intent_and_return_obligation: string;
  conclusion: string;
}

interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  dateConflicts: string[];
}

interface RuleCheckResult {
  passed: boolean;
  warnings: string[];
  errors: string[];
}

interface LayoutValidationResult {
  isValid: boolean;
  estimatedPages: number;
  totalWords: number;
  paragraphCount: number;
  issues: Array<{
    type: string;
    section?: string;
    lines?: number;
    words?: number;
    estimatedPages?: number;
    paragraphCount?: number;
  }>;
}

// Multi-Agent System Type Definitions (kept for reference, may be deprecated)
interface LegalFrameworkOutput {
  legal_sections: {
    introduction: string;
    eligibility: string;
    legal_basis: string;
    financial_overview: string;
    conclusion: string;
  };
}

interface FactsConsistencyOutput {
  facts_sections: {
    case_background: string;
    timeline: string;
    status_compliance: string;
    exhibit_summary: string;
  };
  warnings: string[];
}

interface NarrativeIntentOutput {
  narrative_sections: {
    change_of_intent: string;
    purpose_of_study: string;
    ties_to_home_country: string;
  };
}

/**
 * Helper function to call OpenAI API
 */
async function callOpenAI(
  systemPrompt: string,
  userPrompt: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: "AI service not configured. Please add OPENAI_API_KEY to .env.local",
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("OpenAI API error:", error);
      return {
        success: false,
        error: error.error?.message || "Failed to generate document",
      };
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return {
        success: false,
        error: "Invalid response from AI service",
      };
    }

    return {
      success: true,
      content: data.choices[0].message.content,
    };
  } catch (error: any) {
    console.error("Error calling OpenAI:", error);
    return {
      success: false,
      error: error.message || "Failed to generate document",
    };
  }
}

/**
 * Helper function to call OpenAI API with JSON response parsing
 */
async function callOpenAIWithJSONResponse<T>(
  systemPrompt: string,
  userPrompt: string
): Promise<{ success: boolean; content?: string; json?: T; error?: string }> {
  const result = await callOpenAI(systemPrompt, userPrompt);
  
  if (!result.success || !result.content) {
    return result;
  }

  try {
    // Try to extract JSON from the response (may be wrapped in markdown code blocks)
    let jsonString = result.content.trim();
    
    // Remove markdown code blocks if present
    if (jsonString.startsWith("```json")) {
      jsonString = jsonString.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonString.startsWith("```")) {
      jsonString = jsonString.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }
    
    const parsed = JSON.parse(jsonString) as T;
    return {
      success: true,
      content: result.content,
      json: parsed,
    };
  } catch (error: any) {
    console.error("Error parsing JSON from OpenAI response:", error);
    return {
      success: false,
      error: `Failed to parse JSON response: ${error.message}. Raw content: ${result.content.substring(0, 200)}...`,
    };
  }
}

/**
 * Parse and validate agent JSON response
 */
function parseAgentJSON<T>(
  response: string,
  expectedStructure: string
): T {
  try {
    // Try to extract JSON from the response
    let jsonString = response.trim();
    
    // Remove markdown code blocks if present
    if (jsonString.startsWith("```json")) {
      jsonString = jsonString.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonString.startsWith("```")) {
      jsonString = jsonString.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }
    
    const parsed = JSON.parse(jsonString) as T;
    return parsed;
  } catch (error: any) {
    throw new Error(
      `Failed to parse JSON response. Expected structure: ${expectedStructure}. Error: ${error.message}`
    );
  }
}

/**
 * Function schema for generate_cos_cover_letter (Third Person - Legacy)
 */
const generateCosCoverLetterFunction = {
  name: "generate_cos_cover_letter",
  description: "Generate a structured USCIS cover letter for Change of Status (B-2 to F-1)",
  parameters: {
    type: "object",
    properties: {
      introduction: {
        type: "string"
      },
      legal_basis: {
        type: "string"
      },
      lawful_entry_and_status: {
        type: "string"
      },
      change_of_intent_explanation: {
        type: "string"
      },
      purpose_of_study: {
        type: "string"
      },
      financial_ability_and_non_employment: {
        type: "string"
      },
      nonimmigrant_intent_and_return_obligation: {
        type: "string"
      },
      conclusion: {
        type: "string"
      }
    },
    required: [
      "introduction",
      "legal_basis",
      "change_of_intent_explanation",
      "financial_ability_and_non_employment",
      "nonimmigrant_intent_and_return_obligation",
      "conclusion"
    ]
  }
};

/**
 * Function schema for generate_first_person_cos_cover_letter (First Person with Exhibits)
 */
const generateFirstPersonCosCoverLetterFunction = {
  name: "generate_first_person_cos_cover_letter",
  description: "Generate a third-person USCIS cover letter for Form I-539 with exhibit-based evidence citations (NOTE: Despite function name, write in THIRD PERSON)",
  parameters: {
    type: "object",
    properties: {
      introduction_and_request: {
        type: "string",
        description: "Third-person introduction and request for change of status with legal basis and exhibit citation (use 'the applicant' not 'I')"
      },
      lawful_entry_and_status: {
        type: "string",
        description: "Description of lawful entry and current status with I-94 evidence citation"
      },
      change_of_intent_after_entry: {
        type: "string",
        description: "Explanation that the decision to study arose after entry, with exhibit citation"
      },
      purpose_of_study: {
        type: "string",
        description: "Explanation of academic goals and program relevance with I-20 or admission exhibit citation"
      },
      financial_ability_and_compliance: {
        type: "string",
        description: "Statement of financial ability and acknowledgment of F-1 work restrictions with financial exhibit citation"
      },
      nonimmigrant_intent_and_ties: {
        type: "string",
        description: "Explanation of ties to home country and intent to depart the U.S. with supporting exhibits"
      },
      conclusion_and_request: {
        type: "string",
        description: "Respectful conclusion requesting discretionary approval with exhibit reference if applicable"
      }
    },
    required: [
      "introduction_and_request",
      "lawful_entry_and_status",
      "change_of_intent_after_entry",
      "purpose_of_study",
      "financial_ability_and_compliance",
      "nonimmigrant_intent_and_ties",
      "conclusion_and_request"
    ]
  }
};

/**
 * Helper function to call OpenAI API with function calling
 */
async function callOpenAIWithFunctionCalling(
  systemPrompt: string,
  userPrompt: string,
  functionSchema: any
): Promise<{ success: boolean; functionArguments?: any; error?: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: "AI service not configured. Please add OPENAI_API_KEY to .env.local",
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        tools: [
          {
            type: "function",
            function: functionSchema,
          },
        ],
        tool_choice: { type: "function", function: { name: functionSchema.name } },
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("OpenAI API error:", error);
      return {
        success: false,
        error: error.error?.message || "Failed to generate document",
      };
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return {
        success: false,
        error: "Invalid response from AI service",
      };
    }

    const message = data.choices[0].message;

    // Check if function was called
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return {
        success: false,
        error: "AI did not call the required function. Response: " + (message.content || "No content"),
      };
    }

    const functionCall = message.tool_calls[0];
    if (functionCall.function.name !== functionSchema.name) {
      return {
        success: false,
        error: `Unexpected function called: ${functionCall.function.name}`,
      };
    }

    // Parse function arguments
    try {
      const functionArguments = JSON.parse(functionCall.function.arguments);
      return {
        success: true,
        functionArguments,
      };
    } catch (parseError: any) {
      return {
        success: false,
        error: `Failed to parse function arguments: ${parseError.message}`,
      };
    }
  } catch (error: any) {
    console.error("Error calling OpenAI:", error);
    return {
      success: false,
      error: error.message || "Failed to generate document",
    };
  }
}

/**
 * Validate required data before starting agent pipeline
 */
function validateRequiredData(
  data: AggregatedApplicationData
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!data.documents.passport) {
    missing.push("Passport document");
  }

  if (!data.documents.i94) {
    missing.push("I-94 document");
  }

  if (!data.documents.i20) {
    missing.push("I-20 document");
  }

  if (!data.application.currentAddress) {
    missing.push("Current U.S. address");
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Validate document data and check for date conflicts
 */
function validateDocumentDataAndCheckConflicts(
  data: AggregatedApplicationData
): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const dateConflicts: string[] = [];

  // Check required documents
  if (!data.documents.passport) {
    errors.push("Passport document is required");
  }
  if (!data.documents.i94) {
    errors.push("I-94 document is required");
  }
  if (!data.documents.i20) {
    errors.push("I-20 document is required");
  }

  // If critical documents missing, return early
  if (errors.length > 0) {
    return {
      valid: false,
      warnings,
      errors,
      dateConflicts,
    };
  }

  const i94 = data.documents.i94!;
  const i20 = data.documents.i20!;

  // Parse dates for comparison
  const parseDate = (dateStr: string | undefined): Date | null => {
    if (!dateStr) return null;
    // Handle various date formats
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  };

  const entryDate = parseDate(i94.dateOfAdmission);
  const i94Expiration = parseDate(i94.admitUntilDate);
  const programStartDate = parseDate(i20.startDate);
  const filingDate = new Date(); // Current date

  // Check date consistency
  if (entryDate && i94Expiration) {
    if (entryDate >= i94Expiration) {
      dateConflicts.push("Entry date is not before I-94 expiration date");
      errors.push("Invalid I-94 dates: entry date must be before expiration");
    }
  }

  // Check filing date vs I-94 expiration
  if (i94Expiration) {
    if (filingDate > i94Expiration) {
      dateConflicts.push("Filing date is after I-94 expiration (potential overstay)");
      errors.push("Cannot file after I-94 expiration date");
    } else if (filingDate.getTime() > i94Expiration.getTime() - 30 * 24 * 60 * 60 * 1000) {
      // Within 30 days of expiration
      warnings.push("Filing date is close to I-94 expiration date");
    }
  }

  // Check program start date vs filing date
  if (programStartDate) {
    if (programStartDate < filingDate) {
      warnings.push("Program start date is before filing date");
    }
  }

  // Check I-20 start date vs entry date (critical rule)
  if (programStartDate && entryDate) {
    if (programStartDate < entryDate) {
      dateConflicts.push("I-20 start date is before U.S. entry date - DO NOT mention program dates");
      warnings.push("I-20 start date conflicts with entry date - program dates should not be mentioned");
    }
  }

  // Check status compliance
  if (i94.classOfAdmission) {
    const validClasses = ["B1", "B2", "WB", "WT"];
    if (!validClasses.includes(i94.classOfAdmission.toUpperCase())) {
      warnings.push(`Class of admission ${i94.classOfAdmission} may not be eligible for change of status to F-1`);
    }
  }

  // Check for missing critical dates
  if (!i94.dateOfAdmission) {
    warnings.push("I-94 entry date is missing");
  }
  if (!i94.admitUntilDate) {
    warnings.push("I-94 expiration date is missing");
  }
  if (!i20.startDate) {
    warnings.push("I-20 program start date is missing");
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    dateConflicts,
  };
}

/**
 * Save generated document to database
 */
async function saveGeneratedDocument(
  applicationId: string,
  userId: string,
  documentType: DocumentType,
  content: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createAdminClient();

    // Mark previous versions as not current
    await (supabase
      .from("generated_documents") as any)
      .update({ is_current: false })
      .eq("application_id", applicationId)
      .eq("document_type", documentType)
      .eq("is_current", true);

    // Get the next version number
    const { data: previousVersions } = await (supabase
      .from("generated_documents") as any)
      .select("version")
      .eq("application_id", applicationId)
      .eq("document_type", documentType)
      .order("version", { ascending: false })
      .limit(1);

    const nextVersion = previousVersions && previousVersions.length > 0
      ? previousVersions[0].version + 1
      : 1;

    // Insert new document
    const { error } = await (supabase
      .from("generated_documents") as any)
      .insert({
        application_id: applicationId,
        user_id: userId,
        document_type: documentType,
        content,
        version: nextVersion,
        is_current: true,
      });

    if (error) {
      console.error("Error saving generated document:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error saving generated document:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Load canonical templates as reference structure for AI
 */
async function loadTemplatesAsReference(): Promise<Record<string, string>> {
  const fs = await import("fs/promises");
  const path = await import("path");
  
  const templateDir = path.join(
    process.cwd(),
    "src",
    "lib",
    "uscis-writing-engine",
    "templates",
    "uscis",
    "i539",
    "cover_letter"
  );
  
  const templates: Record<string, string> = {};
  const order = [
    "00_header_re.md",
    "05_introduction.md",
    "10_case_background.md",
    "20_legal_basis.md",
    "30_maintenance_of_status.md",
    "40_nonimmigrant_intent.md",
    "50_strong_ties_home_country.md",
    "60_financial_capacity.md",
    "90_conclusion_request_for_approval.md",
    "99_signature_block.md",
  ];
  
  for (const filename of order) {
    try {
      const content = await fs.readFile(path.join(templateDir, filename), "utf-8");
      const sectionName = filename.replace(".md", "").replace(/^\d+_/, "");
      templates[sectionName] = content;
    } catch (error: any) {
      console.error(`Error loading template ${filename}:`, error);
      // Continue with other templates even if one fails
    }
  }
  
  return templates;
}

/**
 * Parse I-20 financial support from extracted data or string
 * PRIORITY: Use structured extracted data first, then fallback to string parsing
 */
function parseI20FinancialSupport(
  financialSupport: string | undefined,
  extractedData?: any
): {
  tuition?: number;
  living?: number;
  totalRequired?: number;
} {
  const result: { tuition?: number; living?: number; totalRequired?: number } = {};

  // PRIORITY 1: Use structured extracted data from document (most reliable)
  if (extractedData) {
    // Try structured fields first (from Google Document AI extraction)
    if (extractedData.annual_tuition_amount) {
      const tuition = parseFloat(String(extractedData.annual_tuition_amount).replace(/[,$]/g, ""));
      if (!isNaN(tuition) && tuition > 0) {
        result.tuition = tuition;
      }
    }
    
    if (extractedData.annual_living_expenses) {
      const living = parseFloat(String(extractedData.annual_living_expenses).replace(/[,$]/g, ""));
      if (!isNaN(living) && living > 0) {
        result.living = living;
      }
    }
    
    // CRITICAL: Calculate totalRequired correctly
    // Priority: If we have both tuition and living, use their sum (USCIS requirement)
    // Only use total_annual_cost if tuition + living are not available
    if (result.tuition && result.living) {
      // USCIS requires: TUITION + LIVING EXPENSES
      result.totalRequired = result.tuition + result.living;
      
      // If total_annual_cost exists and is different, note it may include additional costs
      // But we use tuition + living as the official requirement
      if (extractedData.total_annual_cost) {
        const totalAnnualCost = parseFloat(String(extractedData.total_annual_cost).replace(/[,$]/g, ""));
        if (!isNaN(totalAnnualCost) && totalAnnualCost > 0) {
          // total_annual_cost may include fees, books, insurance, etc.
          // But for USCIS purposes, we demonstrate tuition + living
          // Store both for reference
          (result as any).totalAnnualCost = totalAnnualCost;
        }
      }
    } else if (extractedData.total_annual_cost) {
      // Fallback: Use total_annual_cost only if tuition + living not available
      const total = parseFloat(String(extractedData.total_annual_cost).replace(/[,$]/g, ""));
      if (!isNaN(total) && total > 0) {
        result.totalRequired = total;
      }
    }
    
    // If we have any structured data, return it (more reliable than string parsing)
    if (result.tuition || result.living || result.totalRequired) {
      return result;
    }
  }

  // PRIORITY 2: Fallback to string parsing (if no structured data available)
  if (!financialSupport) return result;

  // Try to extract numbers with currency symbols or labels
  // Patterns: "Tuition: $10,000", "Living: $7,000", "Total: $17,000"
  const tuitionMatch = financialSupport.match(/(?:tuition|tuition fees?)[:\s]*\$?([\d,]+)/i);
  const livingMatch = financialSupport.match(/(?:living|living expenses?|room and board|housing)[:\s]*\$?([\d,]+)/i);
  const totalMatch = financialSupport.match(/(?:total|total required|total cost|total amount)[:\s]*\$?([\d,]+)/i);

  if (tuitionMatch && !result.tuition) {
    result.tuition = parseFloat(tuitionMatch[1].replace(/,/g, ""));
  }
  if (livingMatch && !result.living) {
    result.living = parseFloat(livingMatch[1].replace(/,/g, ""));
  }
  if (totalMatch && !result.totalRequired) {
    result.totalRequired = parseFloat(totalMatch[1].replace(/,/g, ""));
  }

  // If we have tuition and living but no total, calculate it
  if (result.tuition && result.living && !result.totalRequired) {
    result.totalRequired = result.tuition + result.living;
  }

  return result;
}

/**
 * Parse currency amount from string, handling both US format (1,234.56) and Brazilian format (1.234,56)
 * @param amountStr - String like "$1,234.56" or "1.234,56" or "1,234.56"
 * @returns Parsed number or 0 if invalid
 */
function parseCurrencyAmount(amountStr: string | undefined): number {
  if (!amountStr) return 0;
  
  // Remove currency symbols and whitespace
  let cleaned = amountStr.replace(/[^\d.,]/g, "").trim();
  if (!cleaned) return 0;
  
  // Detect format: Brazilian (1.234,56) vs US (1,234.56)
  // Brazilian: last comma is decimal, dots are thousands
  // US: last dot is decimal, commas are thousands
  
  const lastCommaIndex = cleaned.lastIndexOf(",");
  const lastDotIndex = cleaned.lastIndexOf(".");
  
  if (lastCommaIndex > lastDotIndex) {
    // Brazilian format: "1.234,56" or "32.028,03"
    // Remove dots (thousands separator), replace comma with dot (decimal)
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDotIndex > lastCommaIndex) {
    // US format: "1,234.56" or "180.62"
    // Remove commas (thousands separator), keep dot as decimal
    cleaned = cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) {
    // Only comma, assume it's decimal (Brazilian style without thousands)
    cleaned = cleaned.replace(",", ".");
  }
  // If no comma or dot, it's already a number string
  
  const numValue = parseFloat(cleaned);
  return isNaN(numValue) ? 0 : numValue;
}

/**
 * Calculate total available funds from personal savings and sponsor
 * Attempts to extract sponsor amount from documents or estimates based on funding source
 * CRITICAL: Now includes bank statement closing balances in calculation
 * Supports both US format (1,234.56) and Brazilian format (1.234,56)
 */
function calculateTotalAvailable(
  data: AggregatedApplicationData
): { totalAvailable: number; personalFunds: number; sponsorAmount: number; bankStatementTotal?: number } {
  let personalFunds = 0;
  let sponsorAmount = 0;
  let bankStatementTotal = 0;

  // PRIORITY 1: Extract personal funds from application form
  if (data.formData.financialSupport?.savingsAmount) {
    personalFunds = parseCurrencyAmount(data.formData.financialSupport.savingsAmount);
  }

  // PRIORITY 2: Extract funds from bank statements (CRITICAL - use extracted closing balances)
  if (data.documents.bankStatements && data.documents.bankStatements.length > 0) {
    const sponsorName = data.formData.financialSupport?.sponsorName?.toLowerCase() || "";
    
    // Debug: Log sponsor name for matching
    if (sponsorName) {
      console.log("[calculateTotalAvailable] Looking for sponsor:", sponsorName);
    }
    
    data.documents.bankStatements.forEach((stmt: any) => {
      const accountHolder = stmt.accountHolderName?.toLowerCase() || "";
      
      // Enhanced sponsor matching: check if document type is sponsor_bank_statement OR name matches
      const isSponsorByType = (stmt as any)?.type === "sponsor_bank_statement";
      
      // Check if account holder matches sponsor name (partial match for flexibility)
      const isSponsorByName = sponsorName && (
        accountHolder.includes(sponsorName) || 
        sponsorName.split(" ").some(namePart => namePart.length > 2 && accountHolder.includes(namePart)) ||
        accountHolder.includes(sponsorName.split(" ")[0]) // Match first name
      );
      
      const isSponsorStatement = isSponsorByType || isSponsorByName;
      
      // Debug: Log matching results
      if (sponsorName && accountHolder) {
        console.log(`[calculateTotalAvailable] Account Holder: "${accountHolder}", Sponsor: "${sponsorName}", Match: ${isSponsorStatement}`);
      }
      
      // Extract closing balance
      if (stmt.closingBalance) {
        const numValue = parseCurrencyAmount(stmt.closingBalance);
        
        if (numValue > 0) {
          if (isSponsorStatement) {
            // Sponsor bank statement - use the highest balance
            if (numValue > sponsorAmount) {
              sponsorAmount = numValue;
            }
          } else {
            // Applicant bank statement - sum all balances
            bankStatementTotal += numValue;
          }
        }
      }
      
      // Also check for "total balance" in extracted data (some statements show combined total)
      const extractedData = (stmt as any)?.extractedData;
      if (extractedData) {
        // Look for total balance, combined balance, or ending balance fields
        const totalBalanceFields = ['totalBalance', 'total_balance', 'combinedBalance', 'combined_balance', 'endingBalance', 'ending_balance'];
        for (const field of totalBalanceFields) {
          if (extractedData[field]) {
            const numValue = parseCurrencyAmount(String(extractedData[field]));
            if (numValue > 0) {
              if (isSponsorStatement) {
                // For sponsor, use total balance if it's higher
                if (numValue > sponsorAmount) {
                  sponsorAmount = numValue;
                }
              } else {
                // For applicant, use total balance if it represents sum of all accounts
                // If we already have individual closing balances summed, prefer the total if it's higher
                if (numValue > bankStatementTotal) {
                  bankStatementTotal = numValue;
                }
              }
            }
          }
        }
      }
    });
  }

  // Use bank statement total if it's higher than form savings amount, or if form amount is 0
  if (bankStatementTotal > 0) {
    if (personalFunds === 0 || bankStatementTotal > personalFunds) {
      // Use bank statement total as it's more accurate (extracted from actual documents)
      personalFunds = bankStatementTotal;
    } else {
      // Use the higher of the two, or sum them if they represent different accounts
      // For now, use the higher value to avoid double counting
      personalFunds = Math.max(personalFunds, bankStatementTotal);
    }
  }

  // If funding source is "sponsor" and we don't have sponsor amount, 
  // we'll need to rely on I-20 total required (handled in validation)
  const totalAvailable = personalFunds + sponsorAmount;

  return { totalAvailable, personalFunds, sponsorAmount, bankStatementTotal };
}

/**
 * Clean markdown formatting and symbols from document text
 * Removes: ** (bold), - (bullet points), emojis, and other markdown
 */
function cleanMarkdownFormatting(text: string): string {
  if (!text) return "";
  
  let cleaned = text;
  
  // Remove markdown bold (**text**)
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, "$1");
  cleaned = cleaned.replace(/\*\*/g, "");
  
  // Remove markdown italic (*text* or _text_)
  cleaned = cleaned.replace(/\*(.+?)\*/g, "$1");
  cleaned = cleaned.replace(/_(.+?)_/g, "$1");
  
  // Remove bullet points at start of lines (- item or * item)
  cleaned = cleaned.replace(/^[\s]*[-*]\s+/gm, "");
  
  // Remove emojis (✅, ❌, 🚨, etc.)
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}]/gu, "");
  cleaned = cleaned.replace(/[\u{2600}-\u{26FF}]/gu, "");
  cleaned = cleaned.replace(/[\u{2700}-\u{27BF}]/gu, "");
  
  // Remove markdown headers (# Header)
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, "");
  
  // Remove markdown code block fences but keep inner content (avoids wiping e.g. cover letter)
  cleaned = cleaned.replace(/```(?:\w*\n)?([\s\S]*?)```/g, "$1");
  cleaned = cleaned.replace(/`([^`]+)`/g, "$1");
  
  // IMPORTANTE: Preservar quebras de linha, apenas limitar excesso
  // Limitar a 3 quebras consecutivas (permite espaçamento entre seções)
  cleaned = cleaned.replace(/\n{4,}/g, "\n\n\n");
  
  return cleaned.trim();
}

/**
 * Remove signature from cover letter (signature should only appear in Personal Statement)
 */
function removeSignatureFromCoverLetter(text: string): string {
  if (!text) return "";
  
  const lines = text.split("\n");
  const signaturePattern = /^(Respectfully submitted|Sincerely|Yours truly),?$/i;
  
  // Find signature closing line (search from end)
  let signatureIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (signaturePattern.test(lines[i].trim())) {
      signatureIndex = i;
      break;
    }
  }
  
  if (signatureIndex >= 0) {
    let endIndex = signatureIndex;
    while (endIndex > 0 && lines[endIndex - 1].trim() === "") {
      endIndex--;
    }
    const kept = lines.slice(0, endIndex).join("\n").trim();
    // Do not strip if it would remove the entire cover letter
    if (kept.length > 0) return kept;
  }
  
  return text;
}

/**
 * Ensure paragraph breaks exist in text
 * Adds line breaks after sentences if text doesn't have proper paragraph structure
 */
function ensureParagraphBreaks(text: string): string {
  if (!text) return "";
  
  // Se já tem quebras de linha adequadas (múltiplas linhas vazias ou quebras duplas), preservar
  if (text.includes("\n\n")) {
    return text;
  }
  
  // Adicionar quebra de linha após pontos finais seguidos de espaço e maiúscula
  // Isso cria parágrafos onde não existem
  let formatted = text.replace(/\.\s+([A-Z])/g, ".\n\n$1");
  
  // Adicionar quebra após dois pontos seguidos de espaço e maiúscula (para "Dear Sir:")
  formatted = formatted.replace(/:\s+([A-Z][a-z])/g, ":\n\n$1");
  
  // Adicionar quebra após pontos de exclamação ou interrogação seguidos de maiúscula
  formatted = formatted.replace(/[!?]\s+([A-Z])/g, "$0\n\n$1");
  
  // Limpar múltiplas quebras de linha (máximo 3)
  formatted = formatted.replace(/\n{4,}/g, "\n\n\n");
  
  return formatted;
}

/**
 * Format cover letter paragraphs while preserving the header block.
 * Keeps existing paragraph structure but ensures clean double-newline separation.
 */
function formatCoverLetterParagraphs(text: string): string {
  if (!text) return "";

  const lines = text.split("\n");
  const dearIndex = lines.findIndex((line) => /^dear\b/i.test(line.trim()));
  if (dearIndex === -1) {
    // No "Dear" line found, preserve original structure with paragraph breaks
    return text;
  }

  // Keep header lines intact (everything up to and including "Dear Immigration Officer,")
  const headerLines = lines.slice(0, dearIndex + 1).map((line) => line.trimEnd());
  const bodyLines = lines.slice(dearIndex + 1);

  // Simply ensure consistent paragraph breaks in the body (preserve AI-generated structure)
  // Split by existing blank lines, trim each paragraph, then rejoin with double newlines
  const bodyText = bodyLines.join("\n");
  const paragraphs = bodyText
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const formattedBody = paragraphs.join("\n\n");

  return `${headerLines.join("\n")}\n\n${formattedBody}`.trim();
}

/**
 * Build data context for AI prompt with ALL required information
 */
function buildDataContext(
  data: AggregatedApplicationData,
  schemaData: any
): string {
  const context: string[] = [];
  
  // HEADER INFORMATION (for template variables)
  context.push("=== HEADER INFORMATION ===");
  if (data.application.currentAddress) {
    const addr = data.application.currentAddress;
    context.push(`Applicant Address Line 1: ${addr.street}`);
    context.push(`Applicant Address Line 2: (leave empty if not applicable)`);
    context.push(`Applicant City, State, ZIP: ${addr.city}, ${addr.state} ${addr.zipCode}`);
  }
  
  // Format current date
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  context.push(`Date: ${currentDate}`);
  
  context.push(`USCIS Address Line 1: U.S. Citizenship and Immigration Services`);
  context.push(`USCIS Address Line 2: P.O. Box 805887`);
  context.push(`USCIS Address Line 3: Chicago, IL 60680-4120`);
  
  // SIGNATURE INFORMATION
  context.push("\n=== SIGNATURE INFORMATION ===");
  const signatoryName = data.documents.passport?.name 
    || data.documents.i94?.name 
    || data.documents.i20?.studentName 
    || data.user.fullName 
    || "Applicant";
  context.push(`Signatory Name: ${signatoryName}`);
  context.push(`Signatory Title: (leave empty for self-filed applications)`);
  context.push(`Organization Name: (leave empty for self-filed applications)`);
  
  // APPLICANT INFORMATION
  context.push("\n=== APPLICANT INFORMATION ===");
  const applicantFullName = data.documents.passport?.name 
    || data.documents.i94?.name 
    || data.documents.i20?.studentName 
    || data.user.fullName 
    || "Applicant";
  context.push(`Applicant Full Name: ${applicantFullName}`);
  context.push(`Applicant Full Name (Uppercase): ${applicantFullName.toUpperCase()}`);
  context.push(`Applicant Title: Mr. (or Mrs./Ms. if applicable)`);
  
  if (data.documents.passport?.name) {
    context.push(`Applicant Name (from Passport): ${data.documents.passport.name} (from Passport, Exhibit A)`);
  }
  if (data.documents.passport?.passportNumber) {
    context.push(`Passport Number: ${data.documents.passport.passportNumber} (from Passport, Exhibit A)`);
  }
  if (data.documents.passport?.dateOfBirth) {
    context.push(`Date of Birth: ${data.documents.passport.dateOfBirth} (from Passport, Exhibit A)`);
  }
  if (data.documents.passport?.placeOfBirth) {
    context.push(`Place of Birth: ${data.documents.passport.placeOfBirth} (from Passport, Exhibit A)`);
  }
  if (data.documents.passport?.nationality) {
    const countryName = getCountryName(data.documents.passport.nationality);
    const citizenship = getCitizenshipAdjective(countryName);
    context.push(`Nationality: ${countryName} (from Passport, Exhibit A)`);
    context.push(`Citizenship: ${citizenship} (from Passport, Exhibit A)`);
    context.push(`Country: ${countryName}`);
  }
  if (data.documents.passport?.gender) {
    context.push(`Gender: ${data.documents.passport.gender} (from Passport, Exhibit A)`);
  }
  if (data.documents.passport?.issueDate) {
    context.push(`Passport Issue Date: ${data.documents.passport.issueDate} (from Passport, Exhibit A)`);
  }
  if (data.documents.passport?.expiryDate) {
    context.push(`Passport Expiry Date: ${data.documents.passport.expiryDate} (from Passport, Exhibit A)`);
  }
  
  // DEPENDENTS INFORMATION
  context.push("\n=== DEPENDENTS INFORMATION ===");
  if (data.formData.dependents?.hasDependents && data.formData.dependents.dependents.length > 0) {
    const dependents = data.formData.dependents.dependents;
    const spouse = dependents.find(d => 
      d.relationship.toLowerCase().includes("spouse") || 
      d.relationship.toLowerCase().includes("wife") || 
      d.relationship.toLowerCase().includes("husband")
    );
    
    if (spouse) {
      context.push(`Has Dependent Spouse: Yes`);
      context.push(`Spouse Name: ${spouse.fullName.toUpperCase()}`);
      context.push(`Spouse Relationship: ${spouse.relationship}`);
      context.push(`Dependent Introduction: "His spouse, ${spouse.fullName.toUpperCase()}, the Dependent, concurrently requests a change of status to F-2 (Dependent Spouse of Student)."`);
    } else {
      context.push(`Has Dependents: Yes (${dependents.length} dependent(s))`);
      dependents.forEach((dep, idx) => {
        context.push(`Dependent ${idx + 1}: ${dep.fullName.toUpperCase()} (${dep.relationship})`);
      });
    }
  } else {
    context.push(`Has Dependents: No`);
    context.push(`Dependent Introduction: (leave empty - no dependents)`);
  }
  
  // ENTRY AND STATUS
  context.push("\n=== ENTRY AND STATUS ===");
  if (data.documents.i94?.dateOfAdmission) {
    // Format entry date
    const entryDate = new Date(data.documents.i94.dateOfAdmission).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    context.push(`Entry Date: ${entryDate} (from I-94, Exhibit A)`);
    context.push(`Entry Date (for template): ${entryDate}`);
  }
  if (data.documents.i94?.classOfAdmission) {
    const status = data.documents.i94.classOfAdmission.toUpperCase();
    const normalizedStatus = status === "B2" || status === "WT" ? "B-2" : 
                             status === "B1" || status === "WB" ? "B-1" : status;
    context.push(`Current Status: ${normalizedStatus} (from I-94, Exhibit A)`);
    
    // Status descriptions
    const statusDescriptions: Record<string, string> = {
      "B-1": "Business Visitor",
      "B-2": "Visitor",
      "B1": "Business Visitor",
      "B2": "Visitor",
      "WB": "Business Visitor",
      "WT": "Visitor",
    };
    const currentStatusDesc = statusDescriptions[status] || statusDescriptions[normalizedStatus] || "Visitor";
    context.push(`Current Status Description: ${currentStatusDesc}`);
    context.push(`Requested Status Description: Academic Student`);
  }
  if (data.documents.i94?.admitUntilDate) {
    context.push(`I-94 Expiration: ${data.documents.i94.admitUntilDate} (from I-94, Exhibit A)`);
  }
  
  // I-20 INFORMATION
  context.push("\n=== I-20 / PROGRAM INFORMATION ===");
  if (data.documents.i20?.studentName) {
    context.push(`Student Name: ${data.documents.i20.studentName} (from I-20, Exhibit B)`);
  }
  if (data.documents.i20?.sevisId) {
    context.push(`SEVIS ID: ${data.documents.i20.sevisId} (from I-20, Exhibit B)`);
  }
  if (data.documents.i20?.schoolName) {
    context.push(`School: ${data.documents.i20.schoolName} (from I-20, Exhibit B)`);
  }
  if (data.documents.i20?.programOfStudy) {
    context.push(`Program: ${data.documents.i20.programOfStudy} (from I-20, Exhibit B)`);
  }
  if (data.documents.i20?.programLevel) {
    context.push(`Program Level: ${data.documents.i20.programLevel} (from I-20, Exhibit B)`);
  }
  if (data.documents.i20?.majorField) {
    context.push(`Major Field: ${data.documents.i20.majorField} (from I-20, Exhibit B)`);
  }
  if (data.documents.i20?.startDate) {
    context.push(`Program Start Date: ${data.documents.i20.startDate} (from I-20, Exhibit B)`);
  }
  if (data.documents.i20?.endDate) {
    context.push(`Program End Date: ${data.documents.i20.endDate} (from I-20, Exhibit B)`);
  }
  if (data.documents.i20?.dateOfBirth) {
    context.push(`I-20 Date of Birth: ${data.documents.i20.dateOfBirth} (from I-20, Exhibit B)`);
  }
  if (data.documents.i20?.countryOfBirth) {
    context.push(`I-20 Country of Birth: ${data.documents.i20.countryOfBirth} (from I-20, Exhibit B)`);
  }
  if (data.documents.i20?.countryOfCitizenship) {
    context.push(`I-20 Country of Citizenship: ${data.documents.i20.countryOfCitizenship} (from I-20, Exhibit B)`);
  }
  
  // FINANCIAL INFORMATION
  context.push("\n=== FINANCIAL INFORMATION ===");
  
  // Get extracted data from I-20 document (structured fields like annual_tuition_amount, annual_living_expenses, total_annual_cost)
  const i20ExtractedData = (data.documents.i20 as any)?.extractedData || 
    (data.documents.i20 as any)?._extractedData;
  
  // Parse I-20 Financial Information (CRITICAL: USCIS requires tuition + living expenses)
  // PRIORITY: Use structured extracted data first (annual_tuition_amount, annual_living_expenses, total_annual_cost)
  // Then fallback to string parsing if structured data not available
  const i20Financial = parseI20FinancialSupport(
    data.documents.i20?.financialSupport,
    i20ExtractedData
  );
  const financialCalc = calculateTotalAvailable(data);
  
  // I-20 Financial Information (from extracted structured data or string)
  if (i20ExtractedData) {
    context.push(`I-20 Financial Data Source: Structured extracted data from I-20 document (Exhibit B)`);
    if (i20ExtractedData.annual_tuition_amount) {
      context.push(`I-20 Annual Tuition Amount (extracted): ${i20ExtractedData.annual_tuition_amount} (from I-20 document, Exhibit B)`);
    }
    if (i20ExtractedData.annual_living_expenses) {
      context.push(`I-20 Annual Living Expenses (extracted): ${i20ExtractedData.annual_living_expenses} (from I-20 document, Exhibit B)`);
    }
    if (i20ExtractedData.total_annual_cost) {
      context.push(`I-20 Total Annual Cost (extracted): ${i20ExtractedData.total_annual_cost} (from I-20 document, Exhibit B)`);
      context.push(`CRITICAL: total_annual_cost is the official I-20 value and may include additional costs beyond tuition + living (fees, books, insurance, etc.)`);
    }
  }
  
  if (data.documents.i20?.financialSupport) {
    context.push(`I-20 Financial Support Information (text): ${data.documents.i20.financialSupport} (from I-20 document, Exhibit B)`);
  }
  
  // Use parsed values (from structured data if available, otherwise from string parsing)
  if (i20Financial.tuition) {
    context.push(`I-20 Tuition: USD $${i20Financial.tuition.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (from I-20 extracted data, Exhibit B)`);
  }
  if (i20Financial.living) {
    context.push(`I-20 Living Expenses: USD $${i20Financial.living.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (from I-20 extracted data, Exhibit B)`);
  }
  if (i20Financial.totalRequired) {
    // Calculate what the total should be (tuition + living) for USCIS requirement
    const calculatedTotal = (i20Financial.tuition || 0) + (i20Financial.living || 0);
    
    if (i20Financial.tuition && i20Financial.living && calculatedTotal > 0) {
      // USCIS requires: TUITION + LIVING EXPENSES
      // Use calculated total (tuition + living) as the official requirement
      context.push(`I-20 Tuition: USD $${i20Financial.tuition.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (from I-20, Exhibit B)`);
      context.push(`I-20 Living Expenses: USD $${i20Financial.living.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (from I-20, Exhibit B)`);
      context.push(`I-20 Total Required (Tuition + Living): USD $${calculatedTotal.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (from I-20 extracted data, Exhibit B)`);
      
      // Update totalRequired to use calculated value for consistency
      i20Financial.totalRequired = calculatedTotal;
      
      if (i20ExtractedData?.total_annual_cost) {
        const totalAnnualCost = parseFloat(String(i20ExtractedData.total_annual_cost).replace(/[,$]/g, ""));
        if (!isNaN(totalAnnualCost) && totalAnnualCost !== calculatedTotal) {
          context.push(`NOTE: I-20 total_annual_cost ($${totalAnnualCost.toLocaleString()}) includes additional costs beyond tuition + living (fees, books, insurance, etc.). For USCIS purposes, demonstrate funds cover tuition + living ($${calculatedTotal.toLocaleString()}).`);
        }
      }
    } else {
      // Fallback: Use totalRequired as provided
      context.push(`I-20 Total Required: USD $${i20Financial.totalRequired.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (from I-20 extracted data, Exhibit B)`);
    }
  }
  context.push(`CRITICAL: The I-20 shows financial support requirements. USCIS requires demonstration of sufficient funds to cover tuition and living expenses.`);
  
  // Personal Funds
  const formattedSavings = financialCalc.personalFunds > 0
    ? `USD $${financialCalc.personalFunds.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : "Not provided";
  if (financialCalc.personalFunds > 0) {
    if (financialCalc.bankStatementTotal && financialCalc.bankStatementTotal > 0) {
      context.push(`Personal Funds: ${formattedSavings} (from bank statements, Exhibit D - sum of closing balances: $${financialCalc.bankStatementTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`);
    } else {
      context.push(`Personal Funds: ${formattedSavings} (from application form)`);
    }
  } else if (financialCalc.bankStatementTotal && financialCalc.bankStatementTotal > 0) {
    // If no form savings but we have bank statement balances, use those
    context.push(`Personal Funds: USD $${financialCalc.bankStatementTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (from bank statements, Exhibit D - sum of closing balances)`);
  }
  
  // Sponsor Information
  if (data.formData.financialSupport?.sponsorName) {
    context.push(`Sponsor Name: ${data.formData.financialSupport.sponsorName} (from application form)`);
    if (financialCalc.sponsorAmount > 0) {
      context.push(`Sponsor Amount Available: USD $${financialCalc.sponsorAmount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (from sponsor bank statements, Exhibit D)`);
    } else {
      context.push(`Sponsor Amount: To be determined from sponsor letter and bank statements (Exhibit D)`);
    }
    context.push(`CRITICAL: If sponsor exists, state what they cover (tuition, living expenses, or both). Reference sponsor letter in Exhibit D.`);
  }
  
  // Total Available Calculation
  context.push(`Total Available: USD $${financialCalc.totalAvailable.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (Personal Funds: $${financialCalc.personalFunds.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}${financialCalc.sponsorAmount > 0 ? ` + Sponsor Support: $${financialCalc.sponsorAmount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : ""})`);
  
  // Financial Requirements Summary with Mathematical Validation
  context.push(`CRITICAL FINANCIAL REQUIREMENTS FOR F-1 STATUS:`);
  context.push(`PDF FORMAT: When outputting the financial summary block, use EXACTLY these labels, one per line: "Financial Requirements:", "Tuition:", "Living Expenses:", "Total Required:", "Available Financial Resources:", "Personal funds:" (or "Personal Financial funds:"), "Financial sponsorship by [Name]:" if sponsor, "Total Available:". After the colon put ONLY "USD $X" on the same line. Do NOT put parentheticals like "(from I-20, Exhibit B)" on the same line as the value.`);
  context.push(`- USCIS requires demonstration of: TUITION + LIVING EXPENSES`);
  context.push(`- The I-20 (Exhibit B) shows the total financial support required`);
  if (i20Financial.totalRequired) {
    context.push(`- Total Required (from I-20): USD $${i20Financial.totalRequired.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`);
    context.push(`- Total Available: USD $${financialCalc.totalAvailable.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`);
    const buffer = financialCalc.totalAvailable - i20Financial.totalRequired;
    if (buffer >= 0) {
      context.push(`- Financial Buffer: USD $${buffer.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (funds exceed total required)`);
      context.push(`✅ MATHEMATICAL VALIDATION: Total Available ($${financialCalc.totalAvailable.toLocaleString()}) >= Total Required ($${i20Financial.totalRequired.toLocaleString()})`);
    } else {
      context.push(`🚨 CRITICAL MATHEMATICAL CONTRADICTION: Total Available ($${financialCalc.totalAvailable.toLocaleString()}) < Total Required ($${i20Financial.totalRequired.toLocaleString()})`);
      context.push(`🚨 DO NOT generate document stating "adequate financial resources" if Total Available < Total Required`);
      context.push(`🚨 If sponsor amount is not fully documented, you MUST state that sponsor will cover the difference`);
    }
  }
  context.push(`- Financial capacity must cover BOTH tuition AND living expenses`);
  context.push(`- NEVER say funds "cover tuition" without also mentioning living expenses`);
  context.push(`- NEVER create mathematical contradiction (e.g., "Total Required: $X, Total Available: $Y" where Y < X)`);
  
  // TIES TO COUNTRY
  context.push("\n=== TIES TO HOME COUNTRY ===");
  if (data.formData.tiesToCountry?.question1) {
    context.push(`Family Ties: ${data.formData.tiesToCountry.question1} (from application form, Exhibit C)`);
  }
  if (data.formData.tiesToCountry?.question2) {
    context.push(`Assets: ${data.formData.tiesToCountry.question2} (from application form, Exhibit C)`);
  }
  if (data.formData.tiesToCountry?.question3) {
    context.push(`Employment: ${data.formData.tiesToCountry.question3} (from application form, Exhibit C)`);
  }
  
  // HOME COUNTRY
  const rawNationality = data.documents.passport?.nationality || data.application.country || "";
  const homeCountry = getCountryName(rawNationality);
  if (homeCountry) {
    const citizenship = getCitizenshipAdjective(homeCountry);
    context.push(`Home Country: ${homeCountry}`);
    context.push(`Country Name: ${homeCountry}`);
    context.push(`Citizenship: ${citizenship}`);
    context.push(`CRITICAL: Always use "${homeCountry}" for country name and "${citizenship}" for citizenship. NEVER use Portuguese terms like "BRASILEIRO(A)", "brasileiro", or "Brasil".`);
  }
  
  return context.join("\n");
}

/**
 * Build AI prompt with templates as reference + real data
 */
function buildAIPromptWithTemplates(
  templates: Record<string, string>,
  data: AggregatedApplicationData,
  schemaData: any
): string {
  const availableExhibits = getAvailableExhibits(data);
  const exhibitList = availableExhibits.map(e => `${e.letter}: ${e.description} - ${e.citation}`).join("\n");
  
  const dataContext = buildDataContext(data, schemaData);
  
  // Build explicit data summary for AI to use
  const explicitDataSummary: string[] = [];
  
  // Dependents
  if (data.formData.dependents?.hasDependents && data.formData.dependents.dependents.length > 0) {
    explicitDataSummary.push(`\n🔴 MANDATORY: DEPENDENTS EXIST - You MUST include them in the introduction paragraph:`);
    data.formData.dependents.dependents.forEach((dep, idx) => {
      explicitDataSummary.push(`  - Dependent ${idx + 1}: ${dep.fullName.toUpperCase()} (${dep.relationship}), DOB: ${dep.dateOfBirth}, Country of Birth: ${dep.countryOfBirth}`);
    });
    explicitDataSummary.push(`  REQUIRED TEXT: "The applicant respectfully submits this cover letter in support of [APPLICANT NAME], the Principal Applicant, and ${data.formData.dependents.dependents.map(d => d.fullName.toUpperCase()).join(", ")}, the Dependent(s), who are requesting a Change of Status (COS) from B-2 (Visitor) to F-1 (Academic Student) and F-2 (Dependent Spouse/Child of Student) nonimmigrant status."`);
  }
  
  // Sponsor - CRITICAL: Always include if sponsor exists, even if amount not calculated
  if (data.formData.financialSupport?.sponsorName) {
    const financialCalc = calculateTotalAvailable(data);
    explicitDataSummary.push(`\n🔴🔴🔴 CRITICAL: SPONSOR EXISTS - YOU MUST INCLUDE THIS IN THE FINANCIAL SECTION - THIS IS MANDATORY 🔴🔴🔴`);
    explicitDataSummary.push(`  - Sponsor Name: ${data.formData.financialSupport.sponsorName.toUpperCase()}`);
    if (data.formData.financialSupport.sponsorRelationship) {
      explicitDataSummary.push(`  - Sponsor Relationship: ${data.formData.financialSupport.sponsorRelationship}`);
    }
    
    // Check if sponsor bank statements exist
    const sponsorBankStatements = data.documents.bankStatements?.filter((stmt: any) => {
      const accountHolder = stmt.accountHolderName?.toLowerCase() || "";
      const sponsorName = data.formData.financialSupport?.sponsorName?.toLowerCase() || "";
      return (stmt as any)?.type === "sponsor_bank_statement" || 
             (sponsorName && (
               accountHolder.includes(sponsorName) || 
               sponsorName.split(" ").some(namePart => namePart.length > 2 && accountHolder.includes(namePart))
             ));
    }) || [];
    
    if (financialCalc.sponsorAmount > 0) {
      explicitDataSummary.push(`  - Sponsor Amount Available: USD $${financialCalc.sponsorAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (from sponsor bank statements, Exhibit D)`);
      explicitDataSummary.push(`  REQUIRED TEXT IN FINANCIAL SECTION: "The sponsor, ${data.formData.financialSupport.sponsorName}, has available funds of USD $${financialCalc.sponsorAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} as evidenced by bank statements (Exhibit D)."`);
    } else if (sponsorBankStatements.length > 0) {
      explicitDataSummary.push(`  - Sponsor Bank Statements Found: ${sponsorBankStatements.length} statement(s) (Exhibit D)`);
      explicitDataSummary.push(`  - Sponsor Amount: Being processed from bank statements (Exhibit D)`);
      explicitDataSummary.push(`  REQUIRED TEXT IN FINANCIAL SECTION: "The sponsor, ${data.formData.financialSupport.sponsorName}, has provided bank statements demonstrating financial capacity (Exhibit D). The sponsor will provide financial support to cover the total required amount of USD $[TOTAL_REQUIRED]."`);
    } else {
      explicitDataSummary.push(`  - Sponsor Amount: To be determined from sponsor letter and bank statements (Exhibit D)`);
      explicitDataSummary.push(`  REQUIRED TEXT IN FINANCIAL SECTION: "The sponsor, ${data.formData.financialSupport.sponsorName}${data.formData.financialSupport.sponsorRelationship ? ` (${data.formData.financialSupport.sponsorRelationship})` : ""}, will provide financial support to cover the total required amount of USD $[TOTAL_REQUIRED] (Exhibit D)."`);
    }
    explicitDataSummary.push(`  ❌ FORBIDDEN: DO NOT say "will seek financial sponsorship" or "must secure financial support" - state that sponsor WILL provide support`);
  }
  
  // Bank Statements
  const financialCalc = calculateTotalAvailable(data);
  if (data.documents.bankStatements && data.documents.bankStatements.length > 0) {
    explicitDataSummary.push(`\n🔴 MANDATORY: BANK STATEMENTS EXIST - You MUST state the amounts:`);
    explicitDataSummary.push(`  - Number of Bank Statements: ${data.documents.bankStatements.length}`);
    if (financialCalc.bankStatementTotal && financialCalc.bankStatementTotal > 0) {
      explicitDataSummary.push(`  - TOTAL BANK BALANCE (sum of all applicant accounts): USD $${financialCalc.bankStatementTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      explicitDataSummary.push(`  - Personal Funds: USD $${financialCalc.personalFunds.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      explicitDataSummary.push(`  REQUIRED TEXT: "Personal funds: USD $${financialCalc.personalFunds.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (from bank statements, Exhibit D)."`);
      explicitDataSummary.push(`  ❌ FORBIDDEN: DO NOT say "Personal funds: $0" - the actual amount is $${financialCalc.personalFunds.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }
  } else if (financialCalc.personalFunds > 0) {
    explicitDataSummary.push(`\n🔴 MANDATORY: PERSONAL FUNDS EXIST - You MUST state the amount:`);
    explicitDataSummary.push(`  - Personal Funds: USD $${financialCalc.personalFunds.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    explicitDataSummary.push(`  REQUIRED TEXT: "Personal funds: USD $${financialCalc.personalFunds.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}."`);
  }
  
  // Ties to Country
  if (data.formData.tiesToCountry) {
    explicitDataSummary.push(`\n🔴 MANDATORY: TIES TO COUNTRY INFORMATION EXISTS - You MUST use EXACT details, NOT generic statements:`);
    if (data.formData.tiesToCountry.question1) {
      explicitDataSummary.push(`  - Family Ties: ${data.formData.tiesToCountry.question1}`);
    }
    if (data.formData.tiesToCountry.question2) {
      explicitDataSummary.push(`  - Assets: ${data.formData.tiesToCountry.question2}`);
    }
    if (data.formData.tiesToCountry.question3) {
      explicitDataSummary.push(`  - Employment: ${data.formData.tiesToCountry.question3}`);
    }
    explicitDataSummary.push(`  ❌ FORBIDDEN: DO NOT use generic statements like "substantial familial, professional, and property ties"`);
    explicitDataSummary.push(`  ✅ REQUIRED: Use the EXACT information provided above (specific family members, specific assets, specific employment details)`);
  }
  
  return `Generate a THIRD-PERSON USCIS cover letter for Form I-539 that must connect the facts, justify why the applicant desired to study in the United States after landing in USA, NOT before entry. the proposition of the application, what are the changes circumstances that the applicant is requesting, what is the relevancy to related 
of academic development and career goals, and what is the relevancy to related to the applicant's ties to home country. This cover letter must be technical, concise, and to the point, persuasive, and legal, professional not emotional, and concise between 2 to 3 pages, without repeating the same information or facts (Change of Status B-1/B-2 → F-1).

=====================================
🔴 CRITICAL: MANDATORY DATA TO INCLUDE (YOU MUST USE THESE)
=====================================
${explicitDataSummary.length > 0 ? explicitDataSummary.join("\n") : "No mandatory data to include."}

IF ANY ITEM ABOVE IS MARKED WITH 🔴, YOU MUST INCLUDE IT IN THE COVER LETTER. THIS IS NOT OPTIONAL.

=====================================
CANONICAL TEMPLATE STRUCTURE (USE AS REFERENCE)
=====================================

The following templates show the CANONICAL structure and legal language. Use them as a blueprint, but adapt the content to match the REAL APPLICATION DATA provided below.

⚠️ CRITICAL: The templates contain placeholder variables like {{applicant_address_line1}}, {{date}}, {{signatory_name}}, {{uscis_address_line1}}, etc. 

YOU MUST REPLACE ALL {{variables}} WITH ACTUAL VALUES FROM THE REAL APPLICATION DATA BELOW.

DO NOT output any {{variable}} placeholders in your response. Every single {{var}} must be replaced with real data.

${Object.entries(templates).map(([name, content]) => {
    const sectionTitle = name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    return `\n## ${sectionTitle}\n${content}`;
  }).join("\n\n")}

=====================================
REAL APPLICATION DATA (USE THESE FACTS - REPLACE ALL {{variables}})
=====================================

${dataContext}

Available Exhibits:
${exhibitList}

=====================================
CRITICAL DATA VALIDATION CHECKLIST
=====================================

BEFORE GENERATING, VERIFY YOU ARE USING:
${data.formData.dependents?.hasDependents && data.formData.dependents.dependents.length > 0 ? `✅ DEPENDENTS: ${data.formData.dependents.dependents.map(d => d.fullName).join(", ")} - MUST include in introduction` : "❌ NO DEPENDENTS"}
${data.formData.financialSupport?.sponsorName ? `✅ SPONSOR: ${data.formData.financialSupport.sponsorName} - MUST include in financial section` : "❌ NO SPONSOR"}
${data.documents.bankStatements && data.documents.bankStatements.length > 0 ? `✅ BANK STATEMENTS: ${data.documents.bankStatements.length} statement(s) with closing balances - MUST state amounts` : "❌ NO BANK STATEMENTS"}
${data.formData.tiesToCountry ? `✅ TIES TO COUNTRY: Specific information provided - MUST use exact details, not generic statements` : "❌ NO TIES INFORMATION"}

=====================================
INSTRUCTIONS
=====================================

1. Follow the CANONICAL TEMPLATE STRUCTURE above as your blueprint
2. Use ONLY the REAL APPLICATION DATA provided above
3. Adapt the template language to match the specific facts
4. Maintain the same legal structure and references (INA Section 248, CFR references)
5. Write in THIRD PERSON ("the applicant", "he/she") - NEVER use first person ("I", "my")
6. Include exhibit citations in parentheses: (Exhibit A), (Exhibit B), etc.
7. Keep formal USCIS tone throughout
8. Explicitly state that decision to study was made AFTER entry
9. Explicitly state there was NO intent to study prior to entry
10. CRITICAL: Check the VALIDATION CHECKLIST above - if items are marked ✅, you MUST include them in the cover letter

CRITICAL RULES:
- Every paragraph MUST include at least one exhibit citation
- Do NOT invent facts not in the data above
- Do NOT use emotional language
- Do NOT claim eligibility or guarantee approval
- Preserve legal references exactly (Section 248, 8 C.F.R. references - use 8 C.F.R. Section 248.1 and 8 C.F.R. Section 214.2(f), NEVER use 8 CFR § 214.1)
- REPLACE ALL template variables {{var}} with actual data from REAL APPLICATION DATA above
- Do NOT leave any {{variable}} placeholders in the output
- Use the exact values from REAL APPLICATION DATA section above

MANDATORY DATA USAGE (YOU MUST CHECK AND USE):
${data.formData.dependents?.hasDependents && data.formData.dependents.dependents.length > 0 ? `
- DEPENDENTS: You MUST include dependents in the introduction. Check "DEPENDENTS INFORMATION" section above for names and details. Use format: "The applicant respectfully submits this cover letter in support of [APPLICANT NAME], the Principal Applicant, and [DEPENDENT NAMES], the Dependent(s)..."
` : "- NO DEPENDENTS: Do not mention dependents"}
${data.formData.financialSupport?.sponsorName ? `
- SPONSOR: You MUST include sponsor in the financial section. Check "FINANCIAL INFORMATION" section above for sponsor name (${data.formData.financialSupport.sponsorName}) and amount. State: "The sponsor, ${data.formData.financialSupport.sponsorName}, [will provide/has available] financial support..."
` : "- NO SPONSOR: Do not mention sponsor"}
${data.documents.bankStatements && data.documents.bankStatements.length > 0 ? `
- BANK STATEMENTS: You MUST state the closing balances from bank statements. Check "FINANCIAL INFORMATION" section above for "Personal Funds" amount. DO NOT say "$0" if bank statements show balances.
` : "- NO BANK STATEMENTS: Use form savings amount if available"}
${data.formData.tiesToCountry ? `
- TIES TO COUNTRY: You MUST use the EXACT information from "TIES TO HOME COUNTRY" section above. DO NOT use generic statements like "substantial ties" - use the specific details provided (family members, assets, employment).
` : "- NO TIES INFORMATION: Use generic statement if no information provided"}

CRITICAL LANGUAGE RULES (MANDATORY):
- NEVER use Portuguese terms like "BRASILEIRO(A)", "brasileiro", "Brasil", "brasileira" in the document
- ALWAYS use English: "Brazil" for the country name, "Brazilian" for citizenship
- Use format: "I am a national of Brazil" or "I am from Brazil" or "I am Brazilian"
- NEVER write: "citizen of BRASILEIRO(A)" or "ties to BRASILEIRO(A)" or "national of BRASILEIRO(A)"
- If nationality data contains non-English text, convert it to proper English format
- Use the "Country Name" and "Citizenship" values from REAL APPLICATION DATA section above
- Example: If data says "Home Country: Brazil", use "Brazil" - NEVER use "BRASILEIRO(A)"

TEMPLATE VARIABLES TO REPLACE:
- {{applicant_address_line1}} → Use "Applicant Address Line 1" from REAL APPLICATION DATA
- {{applicant_address_line2}} → Leave empty or use if provided
- {{applicant_city_state_zip}} → Use "Applicant City, State, ZIP" from REAL APPLICATION DATA
- {{date}} → Use "Date" from REAL APPLICATION DATA
- {{uscis_address_line1}} → Use "USCIS Address Line 1" from REAL APPLICATION DATA
- {{uscis_address_line2}} → Use "USCIS Address Line 2" from REAL APPLICATION DATA
- {{uscis_address_line3}} → Use "USCIS Address Line 3" from REAL APPLICATION DATA
- {{applicant_title}} → Use "Applicant Title" from REAL APPLICATION DATA (Mr./Mrs./Ms.)
- {{applicant_full_name}} → Use "Applicant Full Name" from REAL APPLICATION DATA
- {{applicant_full_name_uppercase}} → Use "Applicant Full Name (Uppercase)" from REAL APPLICATION DATA
- {{current_status_description}} → Use status description (e.g., "Visitor" for B-2, "Business Visitor" for B-1)
- {{requested_status_description}} → Use "Academic Student" for F-1
- {{dependent_introduction}} → Use "Dependent Introduction" from REAL APPLICATION DATA (or leave empty if no dependents)
- {{signatory_name}} → Use "Signatory Name" from REAL APPLICATION DATA
- {{signatory_title}} → Leave empty if not provided
- {{organization_name}} → Leave empty if not provided
- {{entry_date}} → Use "Entry Date (for template)" from REAL APPLICATION DATA
- {{current_status}} → Use "Current Status" from REAL APPLICATION DATA
- {{home_country}} → Use "Home Country" from REAL APPLICATION DATA
- {{personal_funds_usd}} → Use "Personal Funds" from REAL APPLICATION DATA
- {{sponsor_name}} → Use "Sponsor Name" if provided, otherwise leave empty
- All other {{variables}} → Replace with corresponding data from REAL APPLICATION DATA

=====================================
FINAL VALIDATION BEFORE GENERATION
=====================================

BEFORE YOU GENERATE THE COVER LETTER, VERIFY:

1. INTRODUCTION SECTION:
   ${data.formData.dependents?.hasDependents && data.formData.dependents.dependents.length > 0 ? 
     `✅ DEPENDENTS EXIST: You MUST include "${data.formData.dependents.dependents.map(d => d.fullName.toUpperCase()).join(" and ")}" in the introduction. Use: "The applicant respectfully submits this cover letter in support of [APPLICANT NAME], the Principal Applicant, and ${data.formData.dependents.dependents.map(d => d.fullName.toUpperCase()).join(", ")}, the Dependent(s)..."` 
     : "❌ NO DEPENDENTS: Use standard introduction without mentioning dependents"}

2. FINANCIAL SECTION:
   ${data.formData.financialSupport?.sponsorName ? 
     `✅ SPONSOR EXISTS: You MUST include "${data.formData.financialSupport.sponsorName}" in the financial section. Check "FINANCIAL INFORMATION" above for sponsor amount. State: "The sponsor, ${data.formData.financialSupport.sponsorName}, [will provide/has available] financial support..."` 
     : "❌ NO SPONSOR: Do not mention sponsor"}
   ${data.documents.bankStatements && data.documents.bankStatements.length > 0 ? 
     `✅ BANK STATEMENTS EXIST: Check "FINANCIAL INFORMATION" above for "Personal Funds" amount. DO NOT say "$0" if bank statements show balances. Use the EXACT amount shown.` 
     : "❌ NO BANK STATEMENTS: Use form savings amount if available"}

3. TIES TO COUNTRY SECTION:
   ${data.formData.tiesToCountry ? 
     `✅ TIES INFORMATION EXISTS: Check "TIES TO HOME COUNTRY" section above. Use the EXACT information provided (Family Ties, Assets, Employment). DO NOT use generic statements.` 
     : "❌ NO TIES INFORMATION: Use generic statement if no information provided"}

Generate the complete cover letter following the template structure but using real data. Return the full letter text with ALL template variables replaced with actual data. Do NOT include any {{variable}} placeholders in your output.

=====================================
🔴 FINAL VALIDATION CHECKLIST (BEFORE GENERATING)
=====================================

YOU MUST VERIFY THE FOLLOWING BEFORE GENERATING THE COVER LETTER:

${data.formData.dependents?.hasDependents && data.formData.dependents.dependents.length > 0 ? `
✅ DEPENDENTS CHECK:
  - Did you include dependents in the introduction paragraph?
  - Did you mention their names: ${data.formData.dependents.dependents.map(d => d.fullName.toUpperCase()).join(", ")}?
  - Did you change the status request to include "F-2 (Dependent Spouse/Child of Student)"?
` : "❌ NO DEPENDENTS - Skip this check"}

${data.formData.financialSupport?.sponsorName ? `
✅ SPONSOR CHECK:
  - Did you include the sponsor name "${data.formData.financialSupport.sponsorName}" in the financial section?
  ${data.formData.financialSupport.sponsorRelationship ? `- Did you mention the sponsor relationship "${data.formData.financialSupport.sponsorRelationship}"?` : ""}
  - Did you state that the sponsor will provide financial support?
  - Did you reference Exhibit D for sponsor documents?
` : "❌ NO SPONSOR - Skip this check"}

${data.documents.bankStatements && data.documents.bankStatements.length > 0 ? `
✅ BANK STATEMENTS CHECK:
  - Did you check the "FINANCIAL INFORMATION" section above for Personal Funds amount?
  - Did you state the EXACT amount from bank statements (NOT "$0")?
  - Did you reference Exhibit D for bank statements?
` : "❌ NO BANK STATEMENTS - Skip this check"}

${data.formData.tiesToCountry ? `
✅ TIES TO COUNTRY CHECK:
  - Did you use the EXACT information from "TIES TO HOME COUNTRY" section above?
  - Did you avoid generic statements like "substantial familial, professional, and property ties"?
  - Did you include specific details about family members, assets, and employment?
` : "❌ NO TIES INFORMATION - Skip this check"}

CRITICAL: If items above are marked ✅, you MUST include them in the cover letter. This is MANDATORY, not optional.

IF YOU SEE "Personal funds: $0" IN YOUR OUTPUT BUT BANK STATEMENTS EXIST ABOVE, YOU HAVE FAILED THIS TASK.
IF YOU SEE A SPONSOR NAME ABOVE BUT IT'S NOT MENTIONED IN THE FINANCIAL SECTION, YOU HAVE FAILED THIS TASK.
IF YOU SEE DEPENDENTS ABOVE BUT THEY'RE NOT IN THE INTRODUCTION, YOU HAVE FAILED THIS TASK.
IF YOU SEE SPECIFIC TIES INFORMATION ABOVE BUT YOU USED GENERIC STATEMENTS, YOU HAVE FAILED THIS TASK.

=====================================
🔴 FINAL MANDATORY CHECK - READ THIS BEFORE GENERATING
=====================================

${data.formData.financialSupport?.sponsorName ? `
⚠️⚠️⚠️ CRITICAL: A SPONSOR EXISTS WITH NAME "${data.formData.financialSupport.sponsorName.toUpperCase()}" ⚠️⚠️⚠️

YOU MUST INCLUDE THE FOLLOWING IN THE FINANCIAL SECTION OF YOUR COVER LETTER:

"The sponsor, ${data.formData.financialSupport.sponsorName}${data.formData.financialSupport.sponsorRelationship ? ` (${data.formData.financialSupport.sponsorRelationship})` : ""}, will provide financial support to cover the total required amount of USD $[TOTAL_REQUIRED] (Exhibit D)."

OR if sponsor bank statements are documented:

"The sponsor, ${data.formData.financialSupport.sponsorName}${data.formData.financialSupport.sponsorRelationship ? ` (${data.formData.financialSupport.sponsorRelationship})` : ""}, has provided bank statements demonstrating financial capacity (Exhibit D). The sponsor will provide financial support to cover the total required amount of USD $[TOTAL_REQUIRED]."

DO NOT SAY:
- "will seek financial sponsorship"
- "must secure financial support"
- "is actively seeking financial support"

YOU MUST SAY:
- "The sponsor WILL provide financial support"
- "The sponsor HAS provided bank statements"

THIS IS NOT OPTIONAL. IF YOU DO NOT INCLUDE THE SPONSOR IN THE FINANCIAL SECTION, YOUR OUTPUT IS INCORRECT.
` : ""}

${data.documents.bankStatements && data.documents.bankStatements.length > 0 ? `
⚠️⚠️⚠️ CRITICAL: BANK STATEMENTS EXIST (${data.documents.bankStatements.length} statement(s)) ⚠️⚠️⚠️

YOU MUST CHECK THE "FINANCIAL INFORMATION" SECTION ABOVE FOR THE EXACT "Personal Funds" AMOUNT.

DO NOT SAY "Personal funds: $0" IF BANK STATEMENTS SHOW BALANCES.

YOU MUST USE THE EXACT AMOUNT FROM THE "Personal Funds" FIELD IN THE "FINANCIAL INFORMATION" SECTION ABOVE.
` : ""}

NOW GENERATE THE COVER LETTER WITH ALL MANDATORY INFORMATION INCLUDED.`;
}

/**
 * Replace any remaining {{variables}} in content with actual data
 */
function replaceRemainingVariables(content: string, schemaData: any): string {
  // Map of template variables to schema data fields
  const variableMap: Record<string, string> = {
    "applicant_address_line1": schemaData.applicant_address_line1 || "",
    "applicant_address_line2": schemaData.applicant_address_line2 || "",
    "applicant_city_state_zip": schemaData.applicant_city_state_zip || "",
    "date": schemaData.date || "",
    "uscis_address_line1": schemaData.uscis_address_line1 || "",
    "uscis_address_line2": schemaData.uscis_address_line2 || "",
    "uscis_address_line3": schemaData.uscis_address_line3 || "",
    // Introduction section
    "applicant_title": schemaData.applicant_title || "Mr.",
    "applicant_full_name": schemaData.applicant_full_name || "",
    "applicant_full_name_uppercase": schemaData.applicant_full_name_uppercase || "",
    "current_status_description": schemaData.current_status_description || "",
    "requested_status_description": schemaData.requested_status_description || "",
    "dependent_introduction": schemaData.dependent_introduction || "",
    // Signature and other fields
    "signatory_name": schemaData.signatory_name || "",
    "signatory_title": schemaData.signatory_title || "",
    "organization_name": schemaData.organization_name || "",
    "entry_date": schemaData.entry_date || "",
    "current_status": schemaData.current_status || "",
    "requested_status": schemaData.requested_status || "",
    "home_country": schemaData.home_country || "",
    "personal_funds_usd": schemaData.personal_funds_usd || "",
    "sponsor_name": schemaData.sponsor_name || "",
    "tuition_coverage_period": schemaData.tuition_coverage_period || "",
  };
  
  // Replace all {{variable}} patterns
  let processed = content;
  for (const [varName, value] of Object.entries(variableMap)) {
    const pattern = new RegExp(`\\{\\{${varName}\\}\\}`, "gi");
    processed = processed.replace(pattern, value);
  }
  
  // Replace any remaining {{...}} patterns with empty string or generic placeholder
  processed = processed.replace(/\{\{[^}]+\}\}/g, "");
  
  return processed;
}

/**
 * Generate cover letter using AI with templates as reference
 */
async function generateCoverLetterWithAIUsingTemplates(
  data: AggregatedApplicationData,
  schemaData: any
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    // Load templates as reference
    const templates = await loadTemplatesAsReference();
    
    // Build prompt with templates + real data
    const userPrompt = buildAIPromptWithTemplates(templates, data, schemaData);
    
    const systemPrompt = `You are a paralegal assistant for law firm specializing in immigration law.

Your task is to generate a THIRD-PERSON cover letter for Form I-539 that must connect the facts, justify why the applicant desired to study in the United States after landing in USA, NOT before entry. the proposition of the application, what are the changes circumstances that the applicant is requesting, what is the relevancy to related 
of academic development and career goals, and what is the relevancy to related to the applicant's ties to home country. This cover letter must be technical, concise, and to the point, persuasive, and legal, professional not emotional, and concise between 2 to 3 pages, without repeating the same information or facts. (Change of Status B-1/B-2 → F-1).

IMPORTANT LEGAL BOUNDARIES:
- You do NOT provide legal advice.
- You assist with document preparation only.


MANDATORY WRITING RULES:
- Write STRICTLY in THIRD PERSON ("the applicant", "he/she")
- Do NOT use first person ("I", "my", "me")
- Use formal legal language: "The applicant respectfully submits..." NOT "I respectfully submit..."
- Use: "The applicant entered the United States..." NOT "I entered..."
- Follow the CANONICAL TEMPLATE STRUCTURE provided as your blueprint
- Use ONLY facts from the REAL APPLICATION DATA provided
- Adapt template language to match specific facts
- Maintain legal structure and references exactly
- Include exhibit citations in every paragraph
- Keep formal USCIS tone
- CRITICAL: Replace ALL template variables {{var}} with actual data from REAL APPLICATION DATA
- Do NOT output any {{variable}} placeholders - they must ALL be replaced with real values
- Use the exact format and values provided in REAL APPLICATION DATA section

You MUST:
- Follow the template structure provided
- Use only documented facts
- Preserve legal references (INA Section 248, 8 C.F.R. references - use 8 C.F.R. Section 248.1 and 8 C.F.R. Section 214.2(f), NEVER use 8 CFR § 214.1)
- Write in third person ("the applicant", "he/she")
- Include exhibit citations

You MUST NOT:
- Invent facts not in the data
- Use first person ("I", "my", "me")
- Add emotional language
- Guarantee approval
- Deviate from legal structure`;

    // Call AI with lower temperature for more deterministic output
    const result = await callOpenAI(systemPrompt, userPrompt);
    
    if (!result.success || !result.content) {
      return {
        success: false,
        error: result.error || "Failed to generate cover letter",
      };
    }
    
    // Clean up any markdown formatting
    let content = result.content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/^```[a-z]*\s*/, "").replace(/\s*```$/, "");
    }
    
    // Post-process: Replace any remaining {{variables}} with actual data from schemaData
    content = replaceRemainingVariables(content, schemaData);
    
    return { success: true, content };
  } catch (error: any) {
    console.error("Error generating cover letter with AI using templates:", error);
    return {
      success: false,
      error: error.message || "Failed to generate cover letter",
    };
  }
}

/**
 * Helper function to get available exhibits for citation
 * Standardized exhibit categories:
 * - Exhibit A: Identification and Status Documents (Passports, B-1 visa, I-94, Marriage certificate, Birth certificate)
 * - Exhibit B: SEVIS and School Documents (SEVIS I-901, I-20 (F-1), I-20 (F-2), Official letter of acceptance)
 * - Exhibit C: Purpose of Study and Nonimmigrant Intent / Ties to Home Country
 * - Exhibit D: Proof of Financial Ability (Bank statements, Tax income, Investments, Sponsor letter, etc.)
 */
function getAvailableExhibits(data: any): Array<{ letter: string; description: string; citation: string }> {
  const exhibits: Array<{ letter: string; description: string; citation: string }> = [];
  
  // Exhibit A: Identification and Status Documents
  // Includes: Passports, Valid B-1 visa, I-94 Arrival/Departure, Marriage certificate, Birth certificate
  // Both applicants and dependents
  const hasIdDocs = 
    data.documents.passport || 
    data.documentList?.some((d: any) => d.type === "passport" || d.type === "dependent_passport") ||
    data.documents.i94 || 
    data.documentList?.some((d: any) => d.type === "i94" || d.type === "dependent_i94") ||
    data.documentList?.some((d: any) => d.type === "marriage_certificate" || d.type === "birth_certificate" || d.type === "visa" || d.type === "b1_visa");
  
  if (hasIdDocs) {
    exhibits.push({ 
      letter: "A", 
      description: "Identification and Status Documents", 
      citation: "See Exhibit A: Identification and Status Documents" 
    });
  }
  
  // Exhibit B: SEVIS and School Documents
  // Includes: SEVIS I-901 fee payment receipt, Forms I-20 (F-1), I-20 (F-2), Official letter of acceptance
  const hasSchoolDocs = 
    data.documents.i20 || 
    data.documentList?.some((d: any) => d.type === "i20" || d.type === "dependent_i20" || d.type === "sevis_receipt" || d.type === "acceptance_letter" || d.type === "i20_f2");
  
  if (hasSchoolDocs) {
    exhibits.push({ 
      letter: "B", 
      description: "SEVIS and School Documents", 
      citation: "See Exhibit B: SEVIS and School Documents" 
    });
  }
  
  // Exhibit C: Purpose of Study and Nonimmigrant Intent / Ties to Home Country
  const hasTiesDocs = 
    (data.documents.tiesDocuments && data.documents.tiesDocuments.length > 0) ||
     data.formData.tiesToCountry ||
     data.documentList?.some((d: any) => d.type === "supporting_documents" || d.type === "ties_documents" || d.type === "purpose_of_study");
  
  if (hasTiesDocs) {
    exhibits.push({ 
      letter: "C", 
      description: "Purpose of Study and Nonimmigrant Intent / Ties to Home Country", 
      citation: "See Exhibit C: Purpose of Study and Nonimmigrant Intent / Ties to Home Country" 
    });
  }
  
  // Exhibit D: Proof of Financial Ability
  // Includes: Bank statements, Tax income, Investments, Sponsor letter, Scholarship documents, etc.
  const hasFinancialDocs = 
    data.formData.financialSupport ||
    (data.documents.bankStatements && data.documents.bankStatements.length > 0) ||
    (data.documents.assets && data.documents.assets.length > 0) ||
    (data.documents.scholarshipDocuments && data.documents.scholarshipDocuments.length > 0) ||
    (data.documents.otherFundingDocuments && data.documents.otherFundingDocuments.length > 0) ||
    data.documentList?.some((d: any) => 
      d.type === "bank_statement" || 
      d.type === "sponsor_bank_statement" || 
      d.type === "assets" || 
      d.type === "sponsor_assets" ||
      d.type === "scholarship_document" ||
      d.type === "other_funding" ||
      d.type === "tax_return" ||
      d.type === "sponsor_letter" ||
      d.type === "investment"
    );
  
  if (hasFinancialDocs) {
    exhibits.push({ 
      letter: "D", 
      description: "Proof of Financial Ability", 
      citation: "See Exhibit D: Proof of Financial Ability" 
    });
  }
  
  return exhibits;
}

/**
 * Enhanced Cover Letter Agent using Function Calling
 */
async function runEnhancedCoverLetterAgent(
  data: AggregatedApplicationData,
  validationResult: ValidationResult
): Promise<{ success: boolean; sections?: CoverLetterSections; error?: string }> {
  const systemPrompt = `You are an AI-assisted immigration document drafting system.

Your task is to generate a THIRD-PERSON cover letter
to support Form I-539 (Application to Extend/Change Nonimmigrant Status)
following formal USCIS legal document standards.

IMPORTANT LEGAL BOUNDARIES:
- You are NOT an attorney.
- You do NOT provide legal advice.
- You assist with document preparation only.

MANDATORY WRITING RULES:
- Write STRICTLY in THIRD PERSON ("the applicant", "he/she").
- Do NOT use first person ("I", "my", "me").
- Use formal legal language: "The applicant respectfully submits..." NOT "I respectfully submit..."
- Do NOT use emotional or persuasive language.
- Do NOT claim eligibility or guarantee approval.
- Do NOT introduce facts not present in provided data.

EVIDENCE RULES:
- EVERY paragraph must include at least ONE exhibit citation.
- Exhibits must be sequential (Exhibit A, Exhibit B, etc.).
- Each exhibit must correspond to an uploaded document.
- If no exhibit supports a claim, REMOVE the claim.
- Use APA-like internal citations adapted for USCIS (e.g., "(Exhibit A)")

INTENT RULES (CRITICAL):
- Explicitly state that the decision to study was made AFTER entry.
- Explicitly state there was NO intent to study prior to entry.
- NEVER suggest preconceived intent.

STYLE:
- Formal USCIS tone
- Declarative, factual
- Clear, concise paragraphs (4–6 lines)
- APA-like internal citations adapted for USCIS (e.g., "(Exhibit A)")

DATE RULES:
- If I-20 start date < U.S. entry date → DO NOT mention program dates
- If filing date > I-94 expiry → DO NOT mention any dates
- Never expose date conflicts in text

STATUS RULES:
- Do NOT state conclusions such as:
  "maintained status", "eligible", "meets all requirements"
- Only describe facts reflected on documents

FINANCIAL RULES (CRITICAL - USCIS REQUIREMENTS FOR F-1):
- For F-1 status, USCIS requires demonstration of: TUITION + LIVING EXPENSES
- ALWAYS mention BOTH:
  * Tuition amount (from I-20, Exhibit B)
  * Living expenses (from I-20, Exhibit B)
  * Total required = tuition + living expenses
- If sponsor exists:
  * State sponsor name and what they cover (tuition, living expenses, or both)
  * Reference sponsor letter (Exhibit D)
- If personal funds:
  * State total personal funds available
  * Demonstrate that funds cover: tuition + living expenses
  * If funds exceed total, mention buffer (e.g., "funds exceed total required by $X")
- NEVER say "$X covers tuition" without mentioning living expenses
- NEVER omit living expenses from financial demonstration
- NEVER interpret bank statements
- NEVER describe transactions (Zelle, deposits, withdrawals)
- If income is listed but location is unclear → EXCLUDE income
- Do NOT suggest need or intention to work

EMPLOYMENT RULES:
- Do NOT state current employment while in the U.S.
- Past employment may be referenced only as "professional background"

TIES TO HOME COUNTRY RULES (CRITICAL - USCIS EVALUATES OBJECTIVE TIES ONLY):
- USCIS does NOT evaluate emotion, subjective feelings, or value judgments - they evaluate: contracts, property, formal obligations, financial dependency, objective ties
- Use ONLY factual, objective language about verifiable ties
- FORBIDDEN emotional/subjective phrases:
  ❌ "they are very important to me"
  ❌ "I feel it is my duty"
  ❌ "family is very important in our culture"
  ❌ "I miss", "I love", "I care deeply"
  ❌ "I promise to return", "I will definitely return"
  ❌ "are significant to him" (subjective value judgment)
  ❌ "instilled important values" (subjective/emotional)
  ❌ "sense of purpose" (subjective feeling)
  ❌ "meaningful", "deep connection", "cherish", "treasure" (subjective/emotional)
- REQUIRED objective phrasing:
  ✅ "immediate family members reside in the home country" (factual)
  ✅ "personal financial assets are maintained abroad" (verifiable)
  ✅ "employment contract requires return" (contractual obligation)
  ✅ "property ownership documents" (objective evidence)
  ✅ "financial dependency of family members" (objective fact)
- Focus on: contracts, property ownership, formal obligations, financial dependency, objective verifiable ties
- Do NOT include: emotional statements, cultural references, subjective feelings, value judgments

OTHER LANGUAGE RULES:
- Use "F-1 status" NOT "student visa"
- No guarantees, no emotional appeals
- USCIS-style formal tone throughout

=====================================
FUNCTION CALLING (MANDATORY)
=====================================

You MUST call the function:

generate_first_person_cos_cover_letter()

You must populate each section carefully.
If data is missing, write the section in neutral, generic language.
If critical data is missing, STOP and return:

ERROR: Insufficient documented data to generate cover letter.

=====================================
REQUIRED COVER LETTER SECTIONS
=====================================

STRUCTURE (ONE PARAGRAPH EACH):

1. introduction_and_request
   - Third-person introduction and request for change of status (use "The applicant respectfully submits..." NOT "I respectfully submit...")
   - Include legal basis: Section 248 of the Immigration and Nationality Act, 8 C.F.R. Section 248.1, and 8 C.F.R. Section 214.2(f)
   - CRITICAL: NEVER use "8 CFR § 214.1" - this is generic and does not help
   - MUST include at least one exhibit citation
   - Use: "The applicant requests..." NOT "I request..."
   - CRITICAL: If DEPENDENTS INFORMATION is provided above, you MUST include them in this section. Example: "The applicant respectfully submits this cover letter in support of [APPLICANT NAME], the Principal Applicant, and [DEPENDENT NAMES], the Dependent(s), who are requesting a Change of Status (COS) from B-2 (Visitor) to F-1 (Academic Student) and F-2 (Dependent Spouse/Child of Student) nonimmigrant status."
   - If no dependents are listed above, use standard introduction without mentioning dependents

2. lawful_entry_and_status
   - Description of lawful entry and current status (use "The applicant entered..." NOT "I entered...")
   - MUST cite I-94 evidence (Exhibit A)

3. change_of_intent_after_entry
   - Explanation that the decision to study arose AFTER entry (use "The applicant's decision..." NOT "My decision...")
   - Explicitly state there was NO intent to study prior to entry
   - MUST include exhibit citation

4. purpose_of_study
   - Explanation of academic goals and program relevance (use "The applicant seeks..." NOT "I seek...")
   - MUST cite I-20 or admission exhibit (Exhibit B)
   - Do NOT include risky dates if conflicts exist

5. financial_ability_and_compliance
   - Statement of financial ability covering BOTH tuition AND living expenses (use "The applicant has..." NOT "I have...")
   - Reference I-20 financial support requirements (Exhibit B) showing tuition + living expenses
   - State total required: tuition + living expenses (from I-20, Exhibit B)
   - CRITICAL: Use the EXACT values from DOCUMENT-EXTRACTED FACTS above. If bank statements show closing balances, you MUST state those amounts. DO NOT say "no personal funds" if bank statements show balances.
   - State available funds: personal savings + sponsor support (if applicable)
   - CRITICAL: If SPONSOR INFORMATION is provided above, you MUST include it in this section. State sponsor name, relationship, and what they cover. Reference sponsor bank statements (Exhibit D) if amount is documented.
   - If sponsor amount is documented, state the specific amount: "The sponsor, [NAME], has available funds of USD $[AMOUNT] as evidenced by bank statements (Exhibit D)."
   - If sponsor exists but amount not fully documented, state: "The sponsor, [NAME], will cover the difference between the total required and the applicant's personal funds."
   - Demonstrate that funds ≥ total required (mention buffer if funds exceed total)
   - If sponsor exists, state what they cover (tuition, living, or both) and reference sponsor letter (Exhibit D)
   - Acknowledge F-1 work restrictions
   - MUST cite financial exhibit (Exhibit D)

6. nonimmigrant_intent_and_ties
   - Explanation of ties to home country (use "The applicant's family..." NOT "My family...")
   - CRITICAL: Use the EXACT information from "Ties to Home Country (from application form)" section above. DO NOT use generic statements like "substantial familial, professional, and property ties" if specific information is provided.
   - If Family Ties information is provided, use those specific details (e.g., "The applicant's [specific family members] reside in [country]...")
   - If Assets information is provided, use those specific details (e.g., "The applicant owns [specific property type] in [location]...")
   - If Employment information is provided, use those specific details (e.g., "The applicant maintains [specific employment/contract]...")
   - Intent to depart the U.S. after studies
   - MUST include supporting exhibit citations (Exhibit C)

7. conclusion_and_request
   - Respectful conclusion requesting discretionary approval (use "The applicant respectfully requests..." NOT "I respectfully request...")
   - Exhibit reference if applicable

=====================================
OUTPUT REQUIREMENTS
=====================================

- Respond ONLY via function call
- One paragraph per section
- No headers inside paragraphs
- No bullet points
- Plain text values
- No markdown (NO **, NO -, NO #, NO backticks)
- No emojis (NO checkmarks, X marks, warning symbols, etc.)
- No commentary outside the function call
- CRITICAL: Output MUST be plain text only - remove all markdown formatting

=====================================
EXECUTION
=====================================

Generate a FULL, SAFE, USCIS-READY cover letter structure
that can be assembled into a final PDF.

The Rules Engine overrides creativity.
Safety overrides completeness.
Documentation overrides assumptions.`;

  // Get applicant name from passport (document source), not user profile
  const applicantName = data.documents.passport?.name 
    || data.documents.i94?.name 
    || data.documents.i20?.studentName 
    || "the applicant";

  // Calculate financial information early so it can be used in documentFacts
  const financialCalc = calculateTotalAvailable(data);

  // Build document-only facts
  const documentFacts: string[] = [];
  
  documentFacts.push("=== EXHIBIT A: IDENTIFICATION AND STATUS DOCUMENTS ===");
  
  // Passport information - include ALL extracted data
  if (data.documents.passport) {
    documentFacts.push("Passport Information (ALL EXTRACTED DATA):");
    if (data.documents.passport.name) {
      documentFacts.push(`  - Full Name: ${data.documents.passport.name}`);
    }
    if (data.documents.passport.passportNumber) {
      documentFacts.push(`  - Passport Number: ${data.documents.passport.passportNumber}`);
    }
    if (data.documents.passport.dateOfBirth) {
      documentFacts.push(`  - Date of Birth: ${data.documents.passport.dateOfBirth}`);
    }
    if (data.documents.passport.placeOfBirth) {
      documentFacts.push(`  - Place of Birth: ${data.documents.passport.placeOfBirth}`);
    }
    if (data.documents.passport.nationality) {
      const countryName = getCountryName(data.documents.passport.nationality);
      documentFacts.push(`  - Nationality: ${countryName}`);
    }
    if (data.documents.passport.gender) {
      documentFacts.push(`  - Gender: ${data.documents.passport.gender}`);
    }
    if (data.documents.passport.issueDate) {
      documentFacts.push(`  - Issue Date: ${data.documents.passport.issueDate}`);
    }
    if (data.documents.passport.expiryDate) {
      documentFacts.push(`  - Expiry Date: ${data.documents.passport.expiryDate}`);
    }
    // Include any additional extracted data from passport
    const passportExtractedData = (data.documents.passport as any)?.extractedData;
    if (passportExtractedData) {
      Object.keys(passportExtractedData).forEach((key) => {
        if (!['name', 'passportNumber', 'dateOfBirth', 'placeOfBirth', 'nationality', 'gender', 'issueDate', 'expiryDate'].includes(key) && passportExtractedData[key]) {
          documentFacts.push(`  - ${key}: ${passportExtractedData[key]}`);
        }
      });
    }
    documentFacts.push("  - Source: Passport document (Exhibit A)");
  }

  // I-94 information - include ALL extracted data
  if (data.documents.i94) {
    documentFacts.push("\nI-94 Arrival/Departure Record Information (ALL EXTRACTED DATA):");
    if (data.documents.i94.name) {
      documentFacts.push(`  - Name: ${data.documents.i94.name}`);
    }
    if (data.documents.i94.dateOfAdmission) {
      documentFacts.push(`  - Entry Date: ${data.documents.i94.dateOfAdmission}`);
    }
    if (data.documents.i94.admitUntilDate) {
      documentFacts.push(`  - I-94 Expiration Date: ${data.documents.i94.admitUntilDate}`);
    }
    if (data.documents.i94.classOfAdmission) {
      const status = data.documents.i94.classOfAdmission.toUpperCase();
      const normalizedStatus = status === "B2" || status === "WT" ? "B-2" : 
                               status === "B1" || status === "WB" ? "B-1" : status;
      documentFacts.push(`  - Current Status: ${normalizedStatus}`);
    }
    if (data.documents.i94.admissionNumber) {
      documentFacts.push(`  - Admission Number: ${data.documents.i94.admissionNumber}`);
    }
    if (data.documents.i94.passportNumber) {
      documentFacts.push(`  - Passport Number: ${data.documents.i94.passportNumber}`);
    }
    // Include any additional extracted data from I-94
    const i94ExtractedData = (data.documents.i94 as any)?.extractedData;
    if (i94ExtractedData) {
      Object.keys(i94ExtractedData).forEach((key) => {
        if (!['name', 'dateOfAdmission', 'admitUntilDate', 'classOfAdmission', 'admissionNumber', 'passportNumber'].includes(key) && i94ExtractedData[key]) {
          documentFacts.push(`  - ${key}: ${i94ExtractedData[key]}`);
        }
      });
    }
    documentFacts.push("  - Source: I-94 document (Exhibit A)");
  }

  documentFacts.push("\n=== EXHIBIT B: SEVIS AND SCHOOL DOCUMENTS ===");
  
  // I-20 information - include ALL extracted data
  if (data.documents.i20) {
    documentFacts.push("I-20 Form Information (ALL EXTRACTED DATA):");
    if (data.documents.i20.studentName) {
      documentFacts.push(`  - Student Name: ${data.documents.i20.studentName}`);
    }
    if (data.documents.i20.sevisId) {
      documentFacts.push(`  - SEVIS ID: ${data.documents.i20.sevisId}`);
    }
    if (data.documents.i20.schoolName) {
      documentFacts.push(`  - School Name: ${data.documents.i20.schoolName}`);
    }
    if (data.documents.i20.programOfStudy) {
      documentFacts.push(`  - Program of Study: ${data.documents.i20.programOfStudy}`);
    }
    if (data.documents.i20.programLevel) {
      documentFacts.push(`  - Program Level: ${data.documents.i20.programLevel}`);
    }
    if (data.documents.i20.majorField) {
      documentFacts.push(`  - Major Field: ${data.documents.i20.majorField}`);
    }
    if (data.documents.i20.startDate) {
      documentFacts.push(`  - Program Start Date: ${data.documents.i20.startDate}`);
    }
    if (data.documents.i20.endDate) {
      documentFacts.push(`  - Program End Date: ${data.documents.i20.endDate}`);
    }
    if (data.documents.i20.dateOfBirth) {
      documentFacts.push(`  - Date of Birth: ${data.documents.i20.dateOfBirth}`);
    }
    if (data.documents.i20.countryOfBirth) {
      documentFacts.push(`  - Country of Birth: ${data.documents.i20.countryOfBirth}`);
    }
    if (data.documents.i20.countryOfCitizenship) {
      documentFacts.push(`  - Country of Citizenship: ${data.documents.i20.countryOfCitizenship}`);
    }
    if (data.documents.i20.financialSupport) {
      documentFacts.push(`  - Financial Support Information: ${data.documents.i20.financialSupport}`);
    }
    // Include ALL extracted structured data from I-20
    const i20ExtractedData = (data.documents.i20 as any)?.extractedData;
    if (i20ExtractedData) {
      documentFacts.push("  - Additional Extracted Data from I-20:");
      Object.keys(i20ExtractedData).forEach((key) => {
        if (!['studentName', 'sevisId', 'schoolName', 'programOfStudy', 'programLevel', 'majorField', 'startDate', 'endDate', 'dateOfBirth', 'countryOfBirth', 'countryOfCitizenship', 'financialSupport'].includes(key) && i20ExtractedData[key]) {
          documentFacts.push(`    * ${key}: ${i20ExtractedData[key]}`);
        }
      });
    }
    documentFacts.push("  - Source: I-20 document (Exhibit B)");
  }

  documentFacts.push("\n=== EXHIBIT C: PURPOSE OF STUDY AND NONIMMIGRANT INTENT / TIES TO HOME COUNTRY ===");
  
  // Ties to country (from form data) - include FULL text, not truncated
  if (data.formData.tiesToCountry) {
    if (data.formData.tiesToCountry.question1) {
      documentFacts.push(`Family Ties: ${data.formData.tiesToCountry.question1} (from application form, Exhibit C)`);
    }
    if (data.formData.tiesToCountry.question2) {
      documentFacts.push(`Assets: ${data.formData.tiesToCountry.question2} (from application form, Exhibit C)`);
    }
    if (data.formData.tiesToCountry.question3) {
      documentFacts.push(`Employment: ${data.formData.tiesToCountry.question3} (from application form, Exhibit C)`);
    }
  }
  
  // Ties documents (from uploaded documents)
  if (data.documents.tiesDocuments && data.documents.tiesDocuments.length > 0) {
    documentFacts.push("\nTies to Country Documents:");
    data.documents.tiesDocuments.forEach((doc, idx) => {
      documentFacts.push(`  Document ${idx + 1}:`);
      if (doc.documentType) documentFacts.push(`    - Type: ${doc.documentType}`);
      if (doc.ownerName) documentFacts.push(`    - Owner: ${doc.ownerName}`);
      if (doc.propertyAddress) documentFacts.push(`    - Property Address: ${doc.propertyAddress}`);
      if (doc.propertyValue) documentFacts.push(`    - Property Value: ${doc.propertyValue}`);
      if (doc.employmentCompany) documentFacts.push(`    - Employment Company: ${doc.employmentCompany}`);
      if (doc.employmentPosition) documentFacts.push(`    - Employment Position: ${doc.employmentPosition}`);
      documentFacts.push(`    - Source: Ties to Country document (Exhibit C)`);
    });
  }

  documentFacts.push("\n=== EXHIBIT D: PROOF OF FINANCIAL ABILITY ===");
  
  // Financial information from application form
  if (data.formData.financialSupport) {
    const financial = data.formData.financialSupport;
    documentFacts.push("Financial Information (from application form and extracted documents):");
    if (financial.fundingSource) {
      documentFacts.push(`  - Funding Source: ${financial.fundingSource}`);
    }
    if (financialCalc.personalFunds > 0) {
      if (financialCalc.bankStatementTotal && financialCalc.bankStatementTotal > 0) {
        documentFacts.push(`  - Personal Funds: USD $${financialCalc.personalFunds.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (from bank statements, Exhibit D - sum of closing balances: $${financialCalc.bankStatementTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`);
      } else {
        documentFacts.push(`  - Personal Funds: USD $${financialCalc.personalFunds.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (from application form)`);
      }
    } else if (financialCalc.bankStatementTotal && financialCalc.bankStatementTotal > 0) {
      documentFacts.push(`  - Personal Funds: USD $${financialCalc.bankStatementTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (from bank statements, Exhibit D - sum of closing balances)`);
    } else if (financial.savingsAmount) {
      documentFacts.push(`  - Personal Savings (from form): ${financial.savingsAmount}`);
    }
    if (financial.sponsorName) {
      documentFacts.push(`  - Sponsor Name: ${financial.sponsorName}`);
      if (financial.sponsorRelationship) {
        documentFacts.push(`  - Sponsor Relationship: ${financial.sponsorRelationship}`);
      }
      if (financialCalc.sponsorAmount > 0) {
        documentFacts.push(`  - Sponsor Amount Available: USD $${financialCalc.sponsorAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (from sponsor bank statements, Exhibit D)`);
      } else {
        documentFacts.push(`  - Sponsor Amount: To be determined from sponsor letter and bank statements (Exhibit D)`);
      }
    }
    documentFacts.push(`  - Total Available: USD $${financialCalc.totalAvailable.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Personal Funds: $${financialCalc.personalFunds.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${financialCalc.sponsorAmount > 0 ? ` + Sponsor Support: $${financialCalc.sponsorAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""})`);
  }
  
  // Bank statements - include ALL extracted data and calculate total
  if (data.documents.bankStatements && data.documents.bankStatements.length > 0) {
    documentFacts.push("\nBank Statements (ALL EXTRACTED DATA):");
    let totalBankBalance = 0;
    data.documents.bankStatements.forEach((stmt, idx) => {
      documentFacts.push(`  Statement ${idx + 1}:`);
      if (stmt.accountHolderName) documentFacts.push(`    - Account Holder: ${stmt.accountHolderName}`);
      if (stmt.accountNumber) documentFacts.push(`    - Account Number: ${stmt.accountNumber}`);
      if (stmt.bankName) documentFacts.push(`    - Bank Name: ${stmt.bankName}`);
      if (stmt.closingBalance) {
        documentFacts.push(`    - Closing Balance: ${stmt.closingBalance}`);
        // Calculate total for applicant statements (not sponsor)
        const numValue = parseCurrencyAmount(stmt.closingBalance);
        if (numValue > 0) {
          // Only sum if it's not a sponsor statement
          const sponsorName = data.formData.financialSupport?.sponsorName?.toLowerCase() || "";
          const accountHolder = stmt.accountHolderName?.toLowerCase() || "";
          const isSponsorStatement = sponsorName && (
            accountHolder.includes(sponsorName) || 
            sponsorName.split(" ").some(namePart => namePart.length > 2 && accountHolder.includes(namePart))
          );
          if (!isSponsorStatement) {
            totalBankBalance += numValue;
          }
        }
      }
      if ((stmt as any)?.openingBalance) documentFacts.push(`    - Opening Balance: ${(stmt as any).openingBalance}`);
      if ((stmt as any)?.totalDeposits) documentFacts.push(`    - Total Deposits: ${(stmt as any).totalDeposits}`);
      if ((stmt as any)?.totalWithdrawals) documentFacts.push(`    - Total Withdrawals: ${(stmt as any).totalWithdrawals}`);
      if (stmt.currency) documentFacts.push(`    - Currency: ${stmt.currency}`);
      if (stmt.statementPeriod) documentFacts.push(`    - Statement Period: ${stmt.statementPeriod}`);
      // Include any additional extracted data
      const stmtExtractedData = (stmt as any)?.extractedData;
      if (stmtExtractedData) {
        if (stmtExtractedData.totalBalance) {
          documentFacts.push(`    - Total Balance (from document): ${stmtExtractedData.totalBalance}`);
        }
        if (stmtExtractedData.endingBalances && Array.isArray(stmtExtractedData.endingBalances)) {
          documentFacts.push(`    - Individual Account Balances: ${stmtExtractedData.endingBalances.join(", ")}`);
        }
        Object.keys(stmtExtractedData).forEach((key) => {
          if (!['accountHolderName', 'accountNumber', 'bankName', 'closingBalance', 'openingBalance', 'totalDeposits', 'totalWithdrawals', 'currency', 'statementPeriod', 'totalBalance', 'endingBalances'].includes(key) && stmtExtractedData[key]) {
            documentFacts.push(`    - ${key}: ${stmtExtractedData[key]}`);
          }
        });
      }
      documentFacts.push(`    - Source: Bank Statement (Exhibit D)`);
    });
    if (totalBankBalance > 0) {
      documentFacts.push(`  - TOTAL BANK BALANCE (sum of all applicant accounts): $${totalBankBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }
  }
  
  // Assets documents - include ALL extracted data
  if (data.documents.assets && data.documents.assets.length > 0) {
    documentFacts.push("\nAssets Documents (ALL EXTRACTED DATA):");
    data.documents.assets.forEach((asset, idx) => {
      documentFacts.push(`  Asset ${idx + 1}:`);
      if (asset.assetType) documentFacts.push(`    - Asset Type: ${asset.assetType}`);
      if (asset.ownerName) documentFacts.push(`    - Owner Name: ${asset.ownerName}`);
      if (asset.assetValue) documentFacts.push(`    - Asset Value: ${asset.assetValue}`);
      if (asset.assetDescription) documentFacts.push(`    - Description: ${asset.assetDescription}`);
      // Include any additional extracted data
      const assetExtractedData = (asset as any)?.extractedData;
      if (assetExtractedData) {
        Object.keys(assetExtractedData).forEach((key) => {
          if (!['assetType', 'ownerName', 'assetValue', 'assetDescription'].includes(key) && assetExtractedData[key]) {
            documentFacts.push(`    - ${key}: ${assetExtractedData[key]}`);
          }
        });
      }
      documentFacts.push(`    - Source: Assets document (Exhibit D)`);
    });
  }
  
  // Scholarship documents
  if (data.documents.scholarshipDocuments && data.documents.scholarshipDocuments.length > 0) {
    documentFacts.push("\nScholarship Documents:");
    data.documents.scholarshipDocuments.forEach((doc, idx) => {
      documentFacts.push(`  Scholarship Document ${idx + 1}:`);
      if (doc.scholarshipName) documentFacts.push(`    - Scholarship Name: ${doc.scholarshipName}`);
      if (doc.awardAmount) documentFacts.push(`    - Award Amount: ${doc.awardAmount}`);
      if (doc.institutionName) documentFacts.push(`    - Institution: ${doc.institutionName}`);
      documentFacts.push(`    - Source: Scholarship document (Exhibit D)`);
    });
  }
  
  // Other funding documents
  if (data.documents.otherFundingDocuments && data.documents.otherFundingDocuments.length > 0) {
    documentFacts.push("\nOther Funding Documents:");
    data.documents.otherFundingDocuments.forEach((doc, idx) => {
      documentFacts.push(`  Funding Document ${idx + 1}:`);
      if (doc.fundingSource) documentFacts.push(`    - Funding Source: ${doc.fundingSource}`);
      if (doc.amount) documentFacts.push(`    - Amount: ${doc.amount}`);
      if (doc.institutionName) documentFacts.push(`    - Institution: ${doc.institutionName}`);
      documentFacts.push(`    - Source: Other funding document (Exhibit D)`);
    });
  }

  // Ties to country - DO NOT TRUNCATE - include FULL text
  const tiesInfo: string[] = [];
  if (data.formData.tiesToCountry?.question1) {
    tiesInfo.push(`Family Ties: ${data.formData.tiesToCountry.question1} (from application form, Exhibit C)`);
  }
  if (data.formData.tiesToCountry?.question2) {
    tiesInfo.push(`Assets: ${data.formData.tiesToCountry.question2} (from application form, Exhibit C)`);
  }
  if (data.formData.tiesToCountry?.question3) {
    tiesInfo.push(`Employment: ${data.formData.tiesToCountry.question3} (from application form, Exhibit C)`);
  }

  // CRITICAL: Mathematical validation before generating document
  const i20ExtractedData = (data.documents.i20 as any)?.extractedData || 
    (data.documents.i20 as any)?._extractedData;
  const i20Financial = parseI20FinancialSupport(
    data.documents.i20?.financialSupport,
    i20ExtractedData
  );
  // financialCalc already calculated above at line 1859
  
  // CRITICAL: Validate financial requirements
  if (i20Financial.totalRequired) {
    // If totalAvailable is 0 or undefined, check if sponsor exists
    if (financialCalc.totalAvailable === 0 || !financialCalc.totalAvailable) {
      if (data.formData.financialSupport?.sponsorName) {
        // Sponsor exists but amount not extracted - allow with critical warning
        console.warn(`CRITICAL: Total Available is $0 but sponsor exists. Sponsor amount must be documented in sponsor letter (Exhibit D).`);
      } else {
        // No sponsor and no funds - this is fatal
        return {
          success: false,
          error: `CRITICAL: No financial resources documented. Total Available is $0 but Total Required is $${i20Financial.totalRequired.toLocaleString()} from I-20. Cannot generate document without financial support. Please upload bank statements, assets documents, or sponsor letter (Exhibit D).`
        };
      }
    } else if (financialCalc.totalAvailable < i20Financial.totalRequired) {
      // If sponsor exists but amount not fully documented, allow generation with warning
      if (data.formData.financialSupport?.sponsorName && financialCalc.sponsorAmount === 0) {
        // Sponsor exists but amount not extracted - allow with critical warning
        console.warn(`CRITICAL: Total Available ($${financialCalc.totalAvailable.toLocaleString()}) < Total Required ($${i20Financial.totalRequired.toLocaleString()}). Sponsor exists but amount not fully documented.`);
      } else if (!data.formData.financialSupport?.sponsorName) {
        // No sponsor and insufficient funds - this is fatal
        return {
          success: false,
          error: `CRITICAL MATHEMATICAL CONTRADICTION: Total Available ($${financialCalc.totalAvailable.toLocaleString()}) is less than Total Required ($${i20Financial.totalRequired.toLocaleString()}) from I-20. Cannot generate document with mathematical contradiction. Please ensure sufficient funds or sponsor support is documented.`
        };
      }
    }
  }

  // Get available exhibits
  const availableExhibits = getAvailableExhibits(data);
  const exhibitList = availableExhibits.map(e => `Exhibit ${e.letter}: ${e.description}`).join(", ");

  // Build date rule warnings for rules engine
  const dateRuleWarnings: string[] = [];
  const parseDateForRules = (dateStr: string | undefined): Date | null => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  };

  const entryDateForRules = parseDateForRules(data.documents.i94?.dateOfAdmission);
  const i94ExpirationForRules = parseDateForRules(data.documents.i94?.admitUntilDate);
  const programStartDateForRules = parseDateForRules(data.documents.i20?.startDate);
  const filingDateForRules = new Date();

  // DATE RULE: If I-20 start date < U.S. entry date → DO NOT mention program dates
  if (programStartDateForRules && entryDateForRules && programStartDateForRules < entryDateForRules) {
    dateRuleWarnings.push("CRITICAL DATE RULE: I-20 start date is before U.S. entry date. DO NOT mention program dates in purpose_of_study section.");
  }

  // DATE RULE: If filing date > I-94 expiry → DO NOT mention any dates
  if (i94ExpirationForRules && filingDateForRules > i94ExpirationForRules) {
    dateRuleWarnings.push("CRITICAL DATE RULE: Filing date is after I-94 expiry. DO NOT mention any dates in the letter.");
  }

  // Get nationality for sanitization
  const applicantNationality = data.documents.passport?.nationality || "";
  const nationalityPhrase = sanitizeNationality(applicantNationality);

  // Format question answers for AI prompt with improved mapping by category and clear instructions
  const formatQuestionAnswersForPrompt = (
    questionAnswers?: AggregatedApplicationData["questionAnswers"],
    data?: AggregatedApplicationData
  ): string => {
    if (!questionAnswers || questionAnswers.length === 0) {
      return "";
    }

    // Map category to Cover Letter sections
    const categoryToSectionMap: Record<string, string[]> = {
      'original_intent': ['change_of_intent_after_entry'],
      'decision_evolution': ['change_of_intent_after_entry', 'purpose_of_study'],
      'academic_interest': ['change_of_intent_after_entry', 'purpose_of_study'],
      'institution_selection': ['purpose_of_study'],
      'professional_coherence': ['purpose_of_study'],
      'planning': ['nonimmigrant_intent_and_ties'],
      'financial_support': ['financial_ability_and_compliance'],
      'financial_support_savings': ['financial_ability_and_compliance'],
      'financial_support_combination': ['financial_ability_and_compliance'],
      'financial_support_accumulated': ['financial_ability_and_compliance'],
    };

    // Group by step, category, and map to sections
    const byStep: Record<number, Array<typeof questionAnswers[0]>> = {};
    const byCategory: Record<string, Array<typeof questionAnswers[0]>> = {};
    
    questionAnswers.forEach((qa) => {
      // Group by step
      if (!byStep[qa.stepNumber]) {
        byStep[qa.stepNumber] = [];
      }
      byStep[qa.stepNumber].push(qa);
      
      // Group by category
      if (qa.category) {
        if (!byCategory[qa.category]) {
          byCategory[qa.category] = [];
        }
        byCategory[qa.category].push(qa);
      }
    });

    const sections: string[] = [];
    sections.push("\n=====================================");
    sections.push("APPLICANT QUESTIONNAIRE RESPONSES");
    sections.push("=====================================");
    sections.push("\nCRITICAL INSTRUCTIONS:");
    sections.push("- Use these responses to enrich the narrative in the specified Cover Letter sections");
    sections.push("- The AI Context tells you WHERE and HOW to use each answer");
    sections.push("- Connect responses with document-extracted facts when relevant");
    sections.push("- Maintain third-person perspective when incorporating into Cover Letter");
    sections.push("- Do NOT repeat information already stated in document facts");
    
    // Step 1: Original Intent
    if (byStep[1]) {
      const targetSections = categoryToSectionMap['original_intent'] || ['change_of_intent_after_entry'];
      sections.push(`\n=== STEP 1: ORIGINAL INTENT (Category: original_intent)`);
      sections.push(`TARGET SECTIONS: ${targetSections.join(', ')}`);
      sections.push(`PURPOSE: Demonstrate that entry was for tourism/recreation, NOT for study`);
      sections.push(`CONNECT WITH: I-94 entry date and class of admission (Exhibit A) to show lawful entry as visitor`);
      byStep[1].forEach((qa) => {
        sections.push(`\nQuestion: ${qa.questionText}`);
        sections.push(`Selected Option: ${qa.selectedOption}`);
        sections.push(`Answer: ${qa.answerText}`);
        sections.push(`AI Context: ${qa.aiPromptContext}`);
        sections.push(`HOW TO USE: ${qa.aiPromptContext.includes('change_of_intent_after_entry') ? 
          'Use in change_of_intent_after_entry section to explain original tourist intent. Emphasize NO prior study intent.' : 
          'Follow AI Context instructions above'}`);
      });
    }

    // Step 2: Decision Evolution
    if (byStep[2]) {
      const targetSections = categoryToSectionMap['decision_evolution'] || ['change_of_intent_after_entry'];
      sections.push(`\n=== STEP 2: DECISION EVOLUTION (Category: decision_evolution)`);
      sections.push(`TARGET SECTIONS: ${targetSections.join(', ')}`);
      sections.push(`PURPOSE: Show how decision to study arose ORGANICALLY during stay, not before entry`);
      sections.push(`CONNECT WITH: Timeline showing decision made AFTER entry date (from I-94, Exhibit A)`);
      byStep[2].forEach((qa) => {
        sections.push(`\nQuestion: ${qa.questionText}`);
        sections.push(`Selected Option: ${qa.selectedOption}`);
        sections.push(`Answer: ${qa.answerText}`);
        sections.push(`AI Context: ${qa.aiPromptContext}`);
        sections.push(`HOW TO USE: Use to explain the NATURAL evolution of the decision during the stay. Emphasize it was a discovery, not a plan.`);
      });
    }

    // Step 3: Academic Interest
    if (byStep[3]) {
      const targetSections = categoryToSectionMap['academic_interest'] || ['change_of_intent_after_entry', 'purpose_of_study'];
      sections.push(`\n=== STEP 3: ACADEMIC INTEREST (Category: academic_interest)`);
      sections.push(`TARGET SECTIONS: ${targetSections.join(', ')}`);
      sections.push(`PURPOSE: Explain what triggered academic interest during stay`);
      sections.push(`CONNECT WITH: I-20 program details (Exhibit B) - align interest with program offered`);
      byStep[3].forEach((qa) => {
        sections.push(`\nQuestion: ${qa.questionText}`);
        sections.push(`Selected Option: ${qa.selectedOption}`);
        sections.push(`Answer: ${qa.answerText}`);
        sections.push(`AI Context: ${qa.aiPromptContext}`);
        sections.push(`HOW TO USE: Connect the trigger (infrastructure, market demand, language immersion) with the specific program in I-20 (Exhibit B)`);
      });
    }

    // Step 4: Institution Selection
    if (byStep[4]) {
      const targetSections = categoryToSectionMap['institution_selection'] || ['purpose_of_study'];
      sections.push(`\n=== STEP 4: INSTITUTION SELECTION (Category: institution_selection)`);
      sections.push(`TARGET SECTIONS: ${targetSections.join(', ')}`);
      sections.push(`PURPOSE: Show criteria used to select institution and program`);
      sections.push(`CONNECT WITH: I-20 school name and program (Exhibit B) - validate selection criteria match`);
      byStep[4].forEach((qa) => {
        sections.push(`\nQuestion: ${qa.questionText}`);
        sections.push(`Selected Option: ${qa.selectedOption}`);
        sections.push(`Answer: ${qa.answerText}`);
        sections.push(`AI Context: ${qa.aiPromptContext}`);
        sections.push(`HOW TO USE: Reference specific institution name from I-20 (Exhibit B) and explain how selection criteria led to this choice`);
      });
    }

    // Step 5: Professional Coherence
    if (byStep[5]) {
      const targetSections = categoryToSectionMap['professional_coherence'] || ['purpose_of_study'];
      sections.push(`\n=== STEP 5: PROFESSIONAL COHERENCE (Category: professional_coherence)`);
      sections.push(`TARGET SECTIONS: ${targetSections.join(', ')}`);
      sections.push(`PURPOSE: Show how program aligns with professional trajectory`);
      sections.push(`CONNECT WITH: I-20 program of study and major field (Exhibit B)`);
      byStep[5].forEach((qa) => {
        sections.push(`\nQuestion: ${qa.questionText}`);
        sections.push(`Selected Option: ${qa.selectedOption}`);
        sections.push(`Answer: ${qa.answerText}`);
        sections.push(`AI Context: ${qa.aiPromptContext}`);
        sections.push(`HOW TO USE: Connect professional background/plans with the specific program in I-20 (Exhibit B)`);
      });
    }

    // Step 6: Planning
    if (byStep[6]) {
      const targetSections = categoryToSectionMap['planning'] || ['nonimmigrant_intent_and_ties'];
      sections.push(`\n=== STEP 6: PLANNING (Category: planning)`);
      sections.push(`TARGET SECTIONS: ${targetSections.join(', ')}`);
      sections.push(`PURPOSE: Show maturity and preparation for studies`);
      sections.push(`CONNECT WITH: Overall narrative of responsible planning`);
      byStep[6].forEach((qa) => {
        sections.push(`\nQuestion: ${qa.questionText}`);
        sections.push(`Selected Option: ${qa.selectedOption}`);
        sections.push(`Answer: ${qa.answerText}`);
        sections.push(`AI Context: ${qa.aiPromptContext}`);
        sections.push(`HOW TO USE: Use to demonstrate thoughtful planning and preparation, supporting nonimmigrant intent`);
      });
    }

    // Step 7: Financial Support
    if (byStep[7]) {
      const targetSections = categoryToSectionMap['financial_support'] || ['financial_ability_and_compliance'];
      sections.push(`\n=== STEP 7: FINANCIAL SUPPORT (Category: financial_support)`);
      sections.push(`TARGET SECTIONS: ${targetSections.join(', ')}`);
      sections.push(`PURPOSE: Explain financial planning and ability to cover costs`);
      sections.push(`CONNECT WITH: Bank statements (Exhibit D), I-20 financial requirements (Exhibit B), Assets documents (Exhibit D)`);
      byStep[7].forEach((qa) => {
        sections.push(`\nQuestion: ${qa.questionText}`);
        sections.push(`Selected Option: ${qa.selectedOption}`);
        sections.push(`Answer: ${qa.answerText}`);
        sections.push(`AI Context: ${qa.aiPromptContext}`);
        sections.push(`HOW TO USE: Reference specific financial documents (Exhibit D) and I-20 requirements (Exhibit B). Emphasize funds cover TUITION + LIVING EXPENSES`);
      });
    }

    // Add category-based summary for quick reference
    sections.push(`\n=== QUICK REFERENCE: CATEGORY TO SECTION MAPPING ===`);
    Object.entries(categoryToSectionMap).forEach(([category, targetSections]) => {
      if (byCategory[category] && byCategory[category].length > 0) {
        sections.push(`${category} → ${targetSections.join(', ')} (${byCategory[category].length} answer(s))`);
      }
    });

    return sections.join("\n");
  };

  const questionAnswersSection = formatQuestionAnswersForPrompt(data.questionAnswers, data);

  const userPrompt = `Generate a structured USCIS cover letter for Change of Status (B-2 to F-1).

LEGAL CITATIONS (MUST USE EXACTLY AS SHOWN - ASCII ONLY, NO UNICODE SYMBOLS):
- INA Section 248: "${LEGAL_CITATIONS.INA_248}"
- 8 C.F.R. Section 248.1: "${LEGAL_CITATIONS.CFR_248_1}"
- 8 C.F.R. Section 214.2(f): "${LEGAL_CITATIONS.CFR_214_2_F}"

CRITICAL LEGAL CITATION RULES:
- For Change of Status (B-1/B-2 → F-1), ALWAYS use:
  * 8 C.F.R. Section 248.1 (for maintenance of status)
  * 8 C.F.R. Section 214.2(f) (for F-1 student status)
- NEVER use "8 CFR § 214.1" - this is generic and does not help
- Use format: "8 C.F.R. Section 248.1" with periods in C.F.R. and "Section" (not §)
- Use "Section 248 of the Immigration and Nationality Act" (not "INA §248")
- When citing legal regulations in the legal_basis section, use ONLY the ASCII format shown above. Do NOT use Unicode symbols like §.

NATIONALITY FORMAT (MUST USE EXACTLY AS SHOWN):
${nationalityPhrase ? `When mentioning nationality in the introduction section, use: "${nationalityPhrase}"` : "Nationality information not available."}

DOCUMENT-EXTRACTED FACTS (USE ALL OF THESE - DO NOT OMIT ANY INFORMATION):
${documentFacts.length > 0 ? documentFacts.join("\n") : "No document facts available."}

CRITICAL INSTRUCTIONS FOR USING EXTRACTED DATA:
1. The above document facts contain ALL extracted data from uploaded documents processed by Google Document AI
2. You MUST use this information throughout the cover letter to provide specific, verifiable details
3. DO NOT use generic statements when specific extracted data is available
4. Include as many specific details as possible to strengthen the application

SPECIFIC REQUIREMENTS:
- Passport: Reference name, passport number, date of birth, place of birth, nationality, gender, issue date, expiry date, and any other extracted fields
- I-94: Reference entry date, expiration date, admission number, status, passport number, and any other extracted fields
- I-20: Reference student name, SEVIS ID, school name, program of study, program level, major field, start date, end date, date of birth, country of birth, country of citizenship, financial support, and ALL additional extracted data
- Bank Statements: Reference account holder, account number, bank name, closing balance, currency, statement period, and any other extracted fields
- Assets Documents: Reference asset type, owner name, asset value, description, and any other extracted fields
- Ties Documents: Reference document type, owner name, property address, property value, employment company, employment position, and any other extracted fields

EXAMPLES OF PROPER USAGE:
- Instead of: "The applicant entered the United States"
- Use: "The applicant entered the United States on [specific entry date from I-94] under [specific status from I-94] nonimmigrant status, as evidenced by Form I-94, Admission Number [specific number] (Exhibit A)"

- Instead of: "The applicant seeks to study"
- Use: "The applicant seeks to pursue [specific program of study] at [specific school name], as evidenced by Form I-20, SEVIS ID [specific ID] (Exhibit B). The program is a [specific program level] in [specific major field]"

- Instead of: "The applicant has financial resources"
- Use: "The applicant has financial resources as evidenced by bank statements from [specific bank name], Account Number [specific number], showing a closing balance of [specific amount] in [specific currency] (Exhibit D)"

${tiesInfo.length > 0 ? `
Ties to Home Country (from application form):
${tiesInfo.join("\n")}
` : ""}

${data.formData.dependents?.hasDependents && data.formData.dependents.dependents.length > 0 ? `
DEPENDENTS INFORMATION (MUST INCLUDE IN COVER LETTER):
${data.formData.dependents.dependents.map((dep, i) => {
  return `Dependent ${i + 1}: ${dep.fullName.toUpperCase()} (${dep.relationship}), Date of Birth: ${dep.dateOfBirth}, Country of Birth: ${dep.countryOfBirth}`;
}).join("\n")}

CRITICAL: If dependents exist, you MUST:
1. Include them in the introduction section: "The applicant respectfully submits this cover letter in support of [APPLICANT NAME], the Principal Applicant, and [DEPENDENT NAMES], the Dependent(s), who are requesting a Change of Status (COS) from B-2 (Visitor) to F-1 (Academic Student) and F-2 (Dependent Spouse/Child of Student) nonimmigrant status."
2. Reference dependent documents in Exhibit A (dependent passports, I-94s) and Exhibit B (dependent I-20s)
3. Include dependent information in the financial section if applicable
` : ""}

${data.formData.financialSupport?.sponsorName ? `
SPONSOR INFORMATION (MUST INCLUDE IN FINANCIAL SECTION):
- Sponsor Name: ${data.formData.financialSupport.sponsorName}
${data.formData.financialSupport.sponsorRelationship ? `- Sponsor Relationship: ${data.formData.financialSupport.sponsorRelationship}` : ""}
${financialCalc.sponsorAmount > 0 ? `- Sponsor Amount Available: USD $${financialCalc.sponsorAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (from sponsor bank statements, Exhibit D)` : `- Sponsor Amount: To be determined from sponsor letter and bank statements (Exhibit D)`}
${data.formData.financialSupport.fundingSource ? `- Funding Source: ${data.formData.financialSupport.fundingSource}` : ""}

CRITICAL: If sponsor exists, you MUST:
1. State sponsor name and relationship in the financial section
2. State what the sponsor covers (tuition, living expenses, or both)
3. Reference sponsor bank statements (Exhibit D) showing available funds
4. Reference sponsor letter (Exhibit D) confirming commitment
5. If sponsor amount is documented, state the specific amount available
6. If sponsor amount is not fully documented, state that sponsor will cover the difference between total required and personal funds
` : ""}

${questionAnswersSection ? `
${questionAnswersSection}

CRITICAL INSTRUCTIONS FOR USING QUESTIONNAIRE RESPONSES:
1. TARGET SECTIONS: Each response has a "TARGET SECTIONS" field - use the answer ONLY in those sections
2. CONNECT WITH DOCUMENTS: The "CONNECT WITH" field tells you which documents to reference when using the answer
3. HOW TO USE: Follow the specific "HOW TO USE" instructions for each answer
4. THIRD PERSON: Convert all answers to third person when incorporating ("The applicant..." NOT "I...")
5. NO REPETITION: Do NOT repeat information already stated in DOCUMENT-EXTRACTED FACTS above
6. ENRICH NARRATIVE: Use answers to add depth and context, not to state new facts
7. EXHIBIT CITATIONS: Always include exhibit citations when referencing connected documents
8. CONSISTENCY: Ensure answers align with document facts - if there's a conflict, use document facts as primary source

EXAMPLE OF PROPER USAGE:
- Document Fact: "Entry Date: January 15, 2024 (from I-94, Exhibit A)"
- Questionnaire Answer: "My objective was exclusively touristic..."
- How to Use: "The applicant entered the United States on January 15, 2024, with the objective of engaging in exclusively touristic activities (Exhibit A). During the applicant's stay, the applicant's decision to pursue studies arose organically..."

` : ""}

AVAILABLE EXHIBITS (MUST CITE IN EVERY PARAGRAPH):
${availableExhibits.length > 0 ? availableExhibits.map(e => `${e.letter}: ${e.description} - ${e.citation}`).join("\n") : "No exhibits available."}

CRITICAL: Every paragraph you write MUST include at least one exhibit citation using the format "(Exhibit X)" where X is the letter shown above. If you cannot support a claim with an exhibit, do NOT include that claim.

${dateRuleWarnings.length > 0 ? `
CRITICAL DATE RULES (MUST FOLLOW):
${dateRuleWarnings.join("\n")}
` : ""}

${validationResult.warnings.length > 0 ? `
VALIDATION WARNINGS:
${validationResult.warnings.join("\n")}
` : ""}

${validationResult.dateConflicts.length > 0 ? `
DATE CONFLICTS:
${validationResult.dateConflicts.join("\n")}
` : ""}

CRITICAL RULES ENGINE REQUIREMENTS:

LANGUAGE RULES (MANDATORY - ABSOLUTE REQUIREMENT):
- Use THIRD PERSON ONLY - NO EXCEPTIONS - EVERY SENTENCE MUST USE THIRD PERSON
  ✅ CORRECT EXAMPLES:
  - "The applicant respectfully submits this cover letter in support of..."
  - "The applicant was lawfully admitted to the United States..."
  - "The applicant entered the United States..."
  - "The applicant intends to return to the home country..."
  - "The applicant has sufficient personal savings to cover tuition and living expenses..."
  - "The applicant's family members reside in the home country..."
  - "The applicant seeks to change status..."
  
  ❌ FORBIDDEN - NEVER USE THESE WORDS:
  - "I", "my", "me" (first person)
  - "I request...", "I entered...", "I was admitted...", "My family..."
  
  CRITICAL: Every single sentence must use "the applicant" or "he/she" - NEVER use first person. This is a third-person cover letter following formal USCIS legal document standards.

EVIDENCE RULES (MANDATORY):
- EVERY paragraph MUST include at least ONE exhibit citation
- Use format: "(Exhibit A)", "(Exhibit B)", etc.
- If a claim cannot be supported by an exhibit, REMOVE the claim
- Exhibits must be sequential and correspond to uploaded documents

INTENT RULES (CRITICAL):
- Explicitly state: "The applicant's decision to pursue studies was made AFTER the applicant's entry into the United States"
- Explicitly state: "The applicant had NO intent to study prior to entry"
- NEVER suggest preconceived intent
- Use third person: "The applicant's decision..." NOT "My decision..."

STATUS RULES:
- Do NOT state conclusions like "maintained status", "eligible", "meets all requirements"
- Do NOT state "demonstrated full compliance" if financial resources are insufficient
- Only describe facts reflected on documents
- If Total Available < Total Required, DO NOT conclude with "demonstrated full compliance"

FINANCIAL RULES (CRITICAL - USCIS REQUIREMENTS FOR F-1):
- For F-1 status, USCIS requires demonstration of: TUITION + LIVING EXPENSES
- ALWAYS mention BOTH:
  * Tuition amount (from I-20, Exhibit B)
  * Living expenses (from I-20, Exhibit B)
  * Total required = tuition + living expenses
- If sponsor exists:
  * State sponsor name and what they cover (tuition, living expenses, or both)
  * Reference sponsor letter (Exhibit D)
- If personal funds:
  * State total personal funds available
  * Demonstrate that funds cover: tuition + living expenses
  * If funds exceed total, mention buffer (e.g., "funds exceed total required by $X")
- NEVER say "$X covers tuition" without mentioning living expenses
- NEVER omit living expenses from financial demonstration
- Do NOT interpret bank statements or mention transactions (Zelle, deposits, withdrawals)
- Do NOT suggest need or intention to work

CRITICAL MATHEMATICAL VALIDATION RULES (FATAL IF VIOLATED):
${i20Financial.totalRequired ? `- Total Required (from I-20, Exhibit B): USD $${i20Financial.totalRequired.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
` : "- Total Required: See I-20 financial support information (Exhibit B)"}
${financialCalc.totalAvailable > 0 ? `- Total Available: USD $${financialCalc.totalAvailable.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (Personal Funds: $${financialCalc.personalFunds.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}${financialCalc.sponsorAmount > 0 ? ` + Sponsor Support: $${financialCalc.sponsorAmount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : data.formData.financialSupport?.sponsorName ? " + Sponsor Support (amount from sponsor letter, Exhibit D)" : ""})
` : "- Total Available: See personal funds and sponsor information above"}
${i20Financial.totalRequired ? (financialCalc.totalAvailable >= i20Financial.totalRequired ? `✅ MATHEMATICAL VALIDATION: Total Available ($${financialCalc.totalAvailable.toLocaleString()}) >= Total Required ($${i20Financial.totalRequired.toLocaleString()})
- Financial Buffer: USD $${(financialCalc.totalAvailable - i20Financial.totalRequired).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (funds exceed total required)
- You MAY state that the applicant possesses adequate financial resources
` : financialCalc.totalAvailable === 0 ? `🚨 CRITICAL: Total Available is $0
${data.formData.financialSupport?.sponsorName ? `- Sponsor exists: ${data.formData.financialSupport.sponsorName}
- You MUST state that the sponsor will cover ALL costs ($${i20Financial.totalRequired.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })})
- Reference sponsor letter (Exhibit D) for sponsor's commitment
- DO NOT state "adequate financial resources" or "demonstrated full compliance" without explicitly stating sponsor coverage
- DO NOT say "the applicant has demonstrated full compliance" - state that sponsor will provide financial support
- DO NOT conclude with "demonstrated full compliance" - instead state "the applicant respectfully requests approval based on sponsor support"
- CRITICAL: Check DOCUMENT-EXTRACTED FACTS above for bank statements. If sponsor bank statements show closing balances, you MUST state those amounts. DO NOT say "must secure financial sponsorship" - state that sponsor WILL provide support.
` : `- NO FUNDS DOCUMENTED: Total Available is $0
- DO NOT generate this document - this is a fatal error
- DO NOT state "adequate financial resources" or "demonstrated full compliance"
- This would create a fatal contradiction that will result in denial
`}` : `🚨 CRITICAL MATHEMATICAL VALIDATION: Total Available ($${financialCalc.totalAvailable.toLocaleString()}) < Total Required ($${i20Financial.totalRequired.toLocaleString()})
${data.formData.financialSupport?.sponsorName ? `- Sponsor exists but amount may not be fully documented
- You MUST state that the sponsor will cover the difference ($${(i20Financial.totalRequired - financialCalc.totalAvailable).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })})
- Reference sponsor letter (Exhibit D) for sponsor's commitment
- DO NOT state "adequate financial resources" or "demonstrated full compliance" without mentioning sponsor coverage
- DO NOT conclude with "demonstrated full compliance" - instead state "the applicant respectfully requests approval based on sponsor support"
` : `- DO NOT generate this document - mathematical contradiction is fatal
- DO NOT state "adequate financial resources" or "sufficient funds" or "demonstrated full compliance" if Total Available < Total Required
- This would create a fatal contradiction that will result in denial
`}`) : ""}
- CRITICAL: NEVER write "Total Required: $X, Total Available: $Y" where Y < X
- CRITICAL: NEVER state "adequate financial resources" or "demonstrated full compliance" if Total Available < Total Required
- CRITICAL: NEVER state "demonstrated full compliance" if Total Available = $0
- CRITICAL: If Total Available < Total Required and no sponsor, DO NOT generate the document
- CRITICAL: If Total Available = $0, you MUST explicitly state sponsor coverage or DO NOT generate

EMPLOYMENT RULES:
- Do NOT state current employment while in the U.S.
- Past employment may be referenced only as "professional background"

TIES RULES (CRITICAL - OBJECTIVE TIES ONLY - USE EXACT INFORMATION FROM DOCUMENT-EXTRACTED FACTS):
- CRITICAL: Check "Ties to Home Country (from application form)" section above. Use the EXACT information provided there.
- DO NOT use generic statements like "substantial familial, professional, and property ties" if specific information is provided above.
- If Family Ties information is provided, use those specific details (e.g., "The applicant's [specific family members] reside in [country]...")
- If Assets information is provided, use those specific details (e.g., "The applicant owns [specific property type] in [location]...")
- If Employment information is provided, use those specific details (e.g., "The applicant maintains [specific employment/contract]...")
- USCIS evaluates OBJECTIVE TIES: contracts, property, formal obligations, financial dependency
- NEVER use emotional or subjective language:
  ❌ "they are very important to me"
  ❌ "I feel it is my duty"
  ❌ "family is very important in our culture"
  ❌ "I miss my family", "I love my country"
  ❌ "are significant to him" (subjective value judgment)
  ❌ "instilled important values" (subjective/emotional)
  ❌ "sense of purpose" (subjective feeling)
  ❌ "meaningful connection", "deep ties", "cherish", "treasure" (subjective/emotional)
- Use ONLY factual, objective language:
  ✅ "The applicant's immediate family members reside in [country]" (factual)
  ✅ "The applicant maintains property ownership in [country]" (verifiable)
  ✅ "The applicant has employment obligations requiring return" (contractual)
  ✅ "The applicant has financial assets maintained abroad" (objective)
- Convert emotional/subjective language to neutral legal phrasing
- Use third person: "The applicant's family..." NOT "My family..."
- Focus on verifiable, objective ties that USCIS can evaluate
- Do NOT include value judgments, subjective feelings, or emotional appeals

OTHER LANGUAGE RULES:
- Use "F-1 status" NOT "student visa"
- No guarantees, no emotional appeals
- USCIS-style formal tone throughout

CRITICAL: Only use information explicitly listed above. Do NOT infer, assume, or add any facts not present in the documents.

FINAL VALIDATION CHECKLIST BEFORE FUNCTION CALL:
1. DEPENDENTS: If "DEPENDENTS INFORMATION" section exists above, did you include them in the introduction section? Check your introduction_and_request section.
2. SPONSOR: If "SPONSOR INFORMATION" section exists above, did you include sponsor name and amount in the financial_ability_and_compliance section? Check your financial section.
3. BANK STATEMENTS: Did you check "Bank Statements" in DOCUMENT-EXTRACTED FACTS? If closing balances are shown, did you state those amounts? DO NOT say "$0" if bank statements show balances.
4. TIES TO COUNTRY: Did you use the EXACT information from "Ties to Home Country (from application form)" section? DO NOT use generic statements if specific information is provided.
5. FINANCIAL VALUES: Did you use the EXACT values from DOCUMENT-EXTRACTED FACTS (Personal Funds, Sponsor Amount, Total Available)? DO NOT use "$0" if values are shown above.

FINAL REMINDER BEFORE FUNCTION CALL:
- EVERY section must use THIRD PERSON ONLY ("the applicant", "he/she")
- EVERY paragraph must include at least ONE exhibit citation
- Review each section to ensure exhibit citations are present
- Explicitly state change of intent occurred AFTER entry
- NEVER use first person ("I", "my", "me") - this is a formal legal document
- CRITICAL: Use EXACT values and information from DOCUMENT-EXTRACTED FACTS above - DO NOT use generic statements or "$0" when actual values are provided

You MUST call the generate_first_person_cos_cover_letter function with all required sections, but write in THIRD PERSON despite the function name.`;

  const result = await callOpenAIWithFunctionCalling(
    systemPrompt,
    userPrompt,
    generateFirstPersonCosCoverLetterFunction
  );

  if (!result.success || !result.functionArguments) {
    return {
      success: false,
      error: result.error || "Failed to generate cover letter sections",
    };
  }

  // Map third-person sections to CoverLetterSections format
  const firstPersonSections = result.functionArguments as {
    introduction_and_request: string;
    lawful_entry_and_status: string;
    change_of_intent_after_entry: string;
    purpose_of_study: string;
    financial_ability_and_compliance: string;
    nonimmigrant_intent_and_ties: string;
    conclusion_and_request: string;
  };

  // Convert to CoverLetterSections format
  // Note: introduction_and_request already includes both introduction and legal basis in third-person format
  // We split it for compatibility with existing CoverLetterSections structure
  const introAndRequest = firstPersonSections.introduction_and_request;
  const introParts = introAndRequest.split(/[.!?]/).filter(p => p.trim().length > 0);
  
  let sections: CoverLetterSections = {
    introduction: introParts[0]?.trim() || introAndRequest.substring(0, Math.min(100, introAndRequest.length)),
    legal_basis: introAndRequest.includes("Section 248") || introAndRequest.includes("8 C.F.R.") || introAndRequest.includes("8 CFR")
      ? introAndRequest 
      : `The applicant requests a change of status under Section 248 of the Immigration and Nationality Act, 8 C.F.R. Section 248.1, and 8 C.F.R. Section 214.2(f).`,
    lawful_entry_and_status: firstPersonSections.lawful_entry_and_status,
    change_of_intent_explanation: firstPersonSections.change_of_intent_after_entry,
    purpose_of_study: firstPersonSections.purpose_of_study,
    financial_ability_and_non_employment: firstPersonSections.financial_ability_and_compliance,
    nonimmigrant_intent_and_return_obligation: firstPersonSections.nonimmigrant_intent_and_ties,
    conclusion: firstPersonSections.conclusion_and_request,
  };
  
  // Sanitize nationality in introduction section
  if (sections.introduction && data.documents.passport?.nationality) {
    const countryName = getCountryName(data.documents.passport.nationality);
    const citizenship = getCitizenshipAdjective(countryName);
    // Replace nationality references in introduction with sanitized version
    const rawNationality = data.documents.passport.nationality;
    // Try to find and replace common nationality patterns (third person: "The applicant is a national of", "The applicant is from", etc.)
    const patterns = [
      new RegExp(`(The applicant is a national of|The applicant is national of|The applicant is a citizen of|The applicant is from|The applicant is)\\s+${rawNationality.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'),
      new RegExp(`(I am a national of|I am national of|I am a citizen of|I am from|I am)\\s+${rawNationality.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'),
      new RegExp(`(The applicant is a national of|The applicant is national of|The applicant is a citizen of|The applicant is from|The applicant is)\\s+${rawNationality.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'),
      new RegExp(`(I am a national of|I am national of|I am a citizen of|I am from|I am)\\s+${rawNationality.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'),
    ];
    
    for (const pattern of patterns) {
      if (pattern.test(sections.introduction)) {
        sections.introduction = sections.introduction.replace(pattern, (match) => {
          // Replace with third person format
          if (match.toLowerCase().includes('i am')) {
            return match.replace(/I am/i, 'The applicant is').replace(rawNationality, `a national of ${countryName}`);
          }
          return match.replace(rawNationality, countryName);
        });
        break;
      }
    }
    
    // Also replace any first person references with third person
    sections.introduction = sections.introduction.replace(/\bI\s+(am|was|entered|request|have)/gi, (match) => {
      return match.replace(/^I/i, 'The applicant');
    });
    sections.introduction = sections.introduction.replace(/\bmy\s+/gi, "the applicant's ");
  }
  
  const required = [
    "introduction",
    "legal_basis",
    "change_of_intent_explanation",
    "financial_ability_and_non_employment",
    "nonimmigrant_intent_and_return_obligation",
    "conclusion",
  ];

  const missing = required.filter((key) => !sections[key as keyof CoverLetterSections]);
  if (missing.length > 0) {
    return {
      success: false,
      error: `Missing required sections: ${missing.join(", ")}`,
    };
  }

  return { success: true, sections };
}

/**
 * Rule Check Engine - Verify cover letter compliance with strict rules
 */
function checkCoverLetterRules(
  sections: CoverLetterSections,
  data: AggregatedApplicationData
): RuleCheckResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const allText = Object.values(sections).join(" ").toLowerCase();

  // ==================== DATE RULES ====================
  const parseDate = (dateStr: string | undefined): Date | null => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  };

  const entryDate = parseDate(data.documents.i94?.dateOfAdmission);
  const i94Expiration = parseDate(data.documents.i94?.admitUntilDate);
  const programStartDate = parseDate(data.documents.i20?.startDate);
  const filingDate = new Date();

  // Rule: If I-20 start date < U.S. entry date → DO NOT mention program dates
  if (programStartDate && entryDate && programStartDate < entryDate) {
    if (sections.purpose_of_study && (
      allText.includes(data.documents.i20?.startDate?.substring(0, 10) || "") ||
      allText.includes("start date") ||
      allText.includes("program begins")
    )) {
      errors.push("DATE RULE VIOLATION: Program dates mentioned when I-20 start date < entry date");
    }
  }

  // Rule: If filing date > I-94 expiry → DO NOT mention any dates
  if (i94Expiration && filingDate > i94Expiration) {
    const datePatterns = [
      /\d{4}[-/]\d{2}[-/]\d{2}/, // YYYY-MM-DD or YYYY/MM/DD
      /\d{1,2}\/\d{1,2}\/\d{4}/, // MM/DD/YYYY
      /\w+ \d{1,2}, \d{4}/, // Month DD, YYYY
    ];
    const hasDates = datePatterns.some(pattern => pattern.test(allText));
    if (hasDates) {
      errors.push("DATE RULE VIOLATION: Dates mentioned when filing date > I-94 expiry");
    }
  }

  // ==================== STATUS RULES ====================
  const forbiddenStatusConclusions = [
    "maintained status",
    "eligible",
    "meets all requirements",
    "complies with all",
    "satisfies all",
  ];
  
  forbiddenStatusConclusions.forEach((term) => {
    if (allText.includes(term)) {
      errors.push(`STATUS RULE VIOLATION: Forbidden conclusion "${term}" - only describe facts, not conclusions`);
    }
  });

  // ==================== FINANCIAL RULES ====================
  // Rule: NEVER interpret bank statements or describe transactions
  const forbiddenFinancialTerms = [
    "zelle",
    "deposit",
    "withdrawal",
    "transaction",
    "transfer",
    "payment",
  ];

  forbiddenFinancialTerms.forEach((term) => {
    if (sections.financial_ability_and_non_employment.toLowerCase().includes(term)) {
      errors.push(`FINANCIAL RULE VIOLATION: Transaction details mentioned ("${term}") - only mention financial capacity covering tuition + living expenses`);
    }
  });

  // Check if income is mentioned when location unclear
  if (sections.financial_ability_and_non_employment.toLowerCase().includes("income") &&
      !sections.financial_ability_and_non_employment.toLowerCase().includes("savings")) {
    warnings.push("FINANCIAL RULE WARNING: Income mentioned - ensure location is clear or exclude");
  }

  // ==================== FINANCIAL CAPACITY VALIDATION (CRITICAL FOR F-1) ====================
  // Rule: Must mention BOTH tuition AND living expenses
  if (sections.financial_ability_and_non_employment) {
    const financialText = sections.financial_ability_and_non_employment.toLowerCase();
    const hasTuition = financialText.includes("tuition");
    const hasLiving = financialText.includes("living") || financialText.includes("living expenses");
    const hasTotal = financialText.includes("total required") || financialText.includes("total needed");
    
    if (hasTuition && !hasLiving) {
      errors.push("FINANCIAL RULE VIOLATION: Only tuition mentioned - MUST also mention living expenses. USCIS requires: tuition + living expenses");
    }
    if (!hasTuition && !hasLiving && financialText.length > 50) {
      warnings.push("FINANCIAL RULE WARNING: Neither tuition nor living expenses explicitly mentioned - USCIS requires both for F-1 status");
    }
    if (hasTuition && hasLiving && !hasTotal) {
      warnings.push("FINANCIAL RULE WARNING: Tuition and living expenses mentioned but total required not explicitly stated - consider adding 'total required = tuition + living expenses'");
    }
    
    // Check for problematic phrasing
    if (financialText.includes("covers tuition") && !hasLiving) {
      errors.push("FINANCIAL RULE VIOLATION: Found 'covers tuition' without mentioning living expenses - this is insufficient for F-1");
    }
    if (financialText.includes("sufficient") && !hasTuition && !hasLiving) {
      warnings.push("FINANCIAL RULE WARNING: Generic 'sufficient funds' mentioned without specifying tuition + living expenses breakdown");
    }
    
    // CRITICAL: Detect mathematical contradiction (Total Required vs Total Available)
    const requiredMatch = financialText.match(/total required[:\s]*\$?([\d,]+)/i);
    const availableMatch = financialText.match(/total available[:\s]*\$?([\d,]+)/i);
    
    if (requiredMatch && availableMatch) {
      const required = parseFloat(requiredMatch[1].replace(/,/g, ""));
      const available = parseFloat(availableMatch[1].replace(/,/g, ""));
      if (!isNaN(required) && !isNaN(available) && available < required) {
        errors.push(`CRITICAL MATHEMATICAL CONTRADICTION: Total Available ($${available.toLocaleString()}) < Total Required ($${required.toLocaleString()}). This is FATAL for the application and will result in denial. DO NOT state "adequate financial resources" if available < required.`);
      }
    }
    
    // Also check for patterns like "Total Required: $X" and "Total Available: $Y" in different formats
    const requiredPatterns = [
      /required[:\s]*\$?([\d,]+)/i,
      /i-20.*\$?([\d,]+)/i,
    ];
    const availablePatterns = [
      /available[:\s]*\$?([\d,]+)/i,
      /funds[:\s]*\$?([\d,]+)/i,
      /possesses[:\s]*\$?([\d,]+)/i,
    ];
    
    // Try to find any numerical contradiction
    for (const reqPattern of requiredPatterns) {
      for (const availPattern of availablePatterns) {
        const reqMatch = financialText.match(reqPattern);
        const availMatch = financialText.match(availPattern);
        if (reqMatch && availMatch && reqMatch.index !== undefined && availMatch.index !== undefined) {
          // Only compare if they appear in the same context (within 200 chars)
          const distance = Math.abs((reqMatch.index || 0) - (availMatch.index || 0));
          if (distance < 200) {
            const req = parseFloat(reqMatch[1].replace(/,/g, ""));
            const avail = parseFloat(availMatch[1].replace(/,/g, ""));
            if (!isNaN(req) && !isNaN(avail) && avail < req && req > 1000 && avail > 1000) {
              // Only flag if both are reasonable amounts (not dates or other numbers)
              warnings.push(`POTENTIAL MATHEMATICAL CONTRADICTION: Found amounts where available ($${avail.toLocaleString()}) may be less than required ($${req.toLocaleString()}). Verify this is not a contradiction.`);
            }
          }
        }
      }
    }
  }

  // ==================== EMPLOYMENT RULES ====================
  const employmentTerms = [
    "currently employed",
    "working in the united states",
    "working in the u.s.",
    "current job",
    "present employment",
  ];

  employmentTerms.forEach((term) => {
    if (allText.includes(term)) {
      errors.push(`EMPLOYMENT RULE VIOLATION: Current U.S. employment mentioned - only past employment as "professional background"`);
    }
  });

  // ==================== TIES TO HOME COUNTRY RULES ====================
  const emotionalTerms = [
    "miss",
    "love",
    "care deeply",
    "cannot wait",
    "excited to return",
    "promise to return",
    "will definitely return",
    // CRITICAL: USCIS evaluates objective ties only, not emotion
    "very important to me",
    "important to me",
    "I feel it is my duty",
    "it is my duty",
    "feel it is my duty",
    "family is very important",
    "very important in our culture",
    "important in our culture",
    "important in my culture",
    "our culture",
    "my culture",
    "duty to",
    "responsibility to",
    "I must",
    "I need to",
    "I have to",
    "I want to",
    "I hope to",
    "I plan to",
    "I will definitely",
    "I promise",
    // CRITICAL: Subjective/value judgment language (weakens argument)
    "significant to",
    "are significant",
    "significant",
    "instilled",
    "instilled values",
    "important values",
    "values",
    "sense of purpose",
    "purpose",
    "meaningful",
    "meaning",
    "deep connection",
    "strong connection",
    "close relationship",
    "cherish",
    "treasure",
    "hold dear",
  ];

  emotionalTerms.forEach((term) => {
    if (sections.nonimmigrant_intent_and_return_obligation.toLowerCase().includes(term)) {
      warnings.push(`TIES RULE WARNING: Emotional/subjective language detected ("${term}") - convert to neutral legal phrasing`);
    }
  });

  // Check for subjective/value judgment language (weakens argument)
  const subjectiveTerms = [
    "significant to",
    "are significant",
    "instilled",
    "instilled values",
    "important values",
    "sense of purpose",
    "meaningful",
    "deep connection",
    "strong connection",
    "cherish",
    "treasure",
  ];

  subjectiveTerms.forEach((term) => {
    if (sections.nonimmigrant_intent_and_return_obligation.toLowerCase().includes(term)) {
      warnings.push(`TIES RULE WARNING: Subjective/value judgment language detected ("${term}") - USCIS evaluates objective ties only, convert to neutral factual phrasing`);
    }
  });

  // Check for proper neutral phrasing (objective ties only)
  const properTiesPhrases = [
    "immediate family members reside",
    "personal financial assets are maintained",
    "family members reside in",
    "assets are maintained abroad",
    "property ownership",
    "employment obligations",
    "contractual obligations",
    "financial dependency",
    "maintains property",
    "owns property",
    "employment contract",
    "business obligations",
  ];

  const hasProperTiesPhrasing = properTiesPhrases.some(phrase => 
    sections.nonimmigrant_intent_and_return_obligation.toLowerCase().includes(phrase)
  );

  if (!hasProperTiesPhrasing && sections.nonimmigrant_intent_and_return_obligation.length > 0) {
    warnings.push("TIES RULE WARNING: May not use neutral legal phrasing for ties to home country");
  }

  // ==================== LANGUAGE RULES ====================
  // Check for "student visa" term
  if (allText.includes("student visa")) {
    errors.push('LANGUAGE RULE VIOLATION: "student visa" found - must use "F-1 status" only');
  }

  // Check for third person usage (FORBIDDEN - must use first person)
  const thirdPersonTerms = [
    " the applicant ", " the applicant.", " the applicant,", " the applicant'",
    " the individual ", " the individual.", " the individual,", " the individual'",
    " applicant ", " applicant.", " applicant,", " applicant'",
    " individual ", " individual.", " individual,", " individual'",
  ];
  
  // Also check for common third person patterns
  const thirdPersonPatterns = [
    /\bthe applicant\s+(requests|was|is|has|intends|would|will|seeks|applies)/i,
    /\bthe individual\s+(requests|was|is|has|intends|would|will|seeks|applies)/i,
    /\bapplicant\s+(requests|was|is|has|intends|would|will|seeks|applies)/i,
  ];
  
  thirdPersonTerms.forEach((term) => {
    if (allText.includes(term)) {
      errors.push(`LANGUAGE RULE VIOLATION: Third person usage detected ("${term.trim()}") - must use FIRST PERSON ONLY. Replace with "I" or "my".`);
    }
  });
  
  thirdPersonPatterns.forEach((pattern) => {
    if (pattern.test(allText)) {
      errors.push(`LANGUAGE RULE VIOLATION: Third person pattern detected - must use FIRST PERSON ONLY. Use "I" or "my" instead of third person references.`);
    }
  });

  // Check for first person usage (REQUIRED - should be present)
  const firstPersonTerms = [
    " i ", " i.", " i,", " i'", " i\n", // "I" as standalone word
    " my ", " my.", " my,", " my'", " my\n",
  ];
  
  // Also check for common first person patterns at start of sentences
  const firstPersonPatterns = [
    /\bi\s+(request|was|am|have|intend|would|will|seek|apply)/i,
    /\bmy\s+(application|intent|family|savings|employment|name|status)/i,
  ];
  
  // Check if third person is present (should be)
  const hasThirdPerson = thirdPersonTerms.some(term => allText.toLowerCase().includes(term.toLowerCase())) ||
    thirdPersonPatterns.some(pattern => pattern.test(allText));
  
  if (!hasThirdPerson) {
    warnings.push("LANGUAGE RULE WARNING: Third person usage not detected - this should be a third-person cover letter. Use 'the applicant' and 'he/she' throughout.");
  }

  // Check for exhibit citations (REQUIRED in every paragraph)
  const exhibitPattern = /\(exhibit\s+[a-j]\)/gi;
  const exhibitMatches = allText.match(exhibitPattern);
  const paragraphCount = Object.values(sections).filter(s => s && s.length > 0).length;
  
  if (!exhibitMatches || exhibitMatches.length < paragraphCount) {
    warnings.push(`EVIDENCE RULE WARNING: Not all paragraphs include exhibit citations. Expected at least ${paragraphCount} citations, found ${exhibitMatches ? exhibitMatches.length : 0}.`);
  }

  // Check for guarantees
  const guaranteeTerms = [
    "will be approved",
    "guaranteed",
    "certain",
    "definitely",
    "assured",
  ];

  guaranteeTerms.forEach((term) => {
    if (allText.includes(term)) {
      errors.push(`LANGUAGE RULE VIOLATION: Guarantee language found ("${term}") - not allowed`);
    }
  });

  // Check for emotional language
  const emotionalLanguage = [
    "desperate",
    "urgent",
    "please help",
    "beg",
    "hope you understand",
    "really need",
    // CRITICAL: USCIS evaluates objective ties only, not emotion
    "very important to me",
    "important to me",
    "I feel it is my duty",
    "it is my duty",
    "family is very important",
    "very important in our culture",
    "important in our culture",
    "I miss",
    "I love",
    "I care deeply",
  ];

  emotionalLanguage.forEach((term) => {
    if (allText.includes(term)) {
      warnings.push(`LANGUAGE RULE WARNING: Emotional language detected ("${term}")`);
    }
  });

  // ==================== REQUIRED ELEMENTS CHECK ====================
  if (!sections.change_of_intent_explanation || sections.change_of_intent_explanation.length < 50) {
    warnings.push("REQUIRED ELEMENT: Change of intent explanation may be insufficient");
  }

  if (!sections.financial_ability_and_non_employment.toLowerCase().includes("employment restriction") &&
      !sections.financial_ability_and_non_employment.toLowerCase().includes("f-1 work restriction")) {
    warnings.push("REQUIRED ELEMENT: F-1 employment restrictions may not be explicitly acknowledged");
  }

  if (!sections.nonimmigrant_intent_and_return_obligation || sections.nonimmigrant_intent_and_return_obligation.length < 50) {
    warnings.push("REQUIRED ELEMENT: Return intent explanation may be insufficient");
  }

  return {
    passed: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Sizing Engine for Cover Letter Sections
 */

function wordCount(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function compressText(text: string, targetWords: number): string {
  if (!text || text.trim().length === 0) return text;
  
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const output: string[] = [];
  let count = 0;

  for (const sentence of sentences) {
    const sentenceWords = wordCount(sentence);
    if (count + sentenceWords <= targetWords) {
      output.push(sentence.trim());
      count += sentenceWords;
    } else {
      break;
    }
  }

  if (output.length === 0) {
    // If we can't fit even one sentence, return first sentence truncated
    return sentences[0] ? sentences[0].trim() + '.' : text;
  }

  return output.join('. ') + (output.length > 0 ? '.' : '');
}

interface SizeSectionResult {
  text: string;
  action: "COMPRESSED" | "OK_UNDER_MIN" | "OK";
}

function sizeSection(
  sectionName: keyof typeof SECTION_LIMITS,
  text: string
): SizeSectionResult {
  if (!text) {
    return { text: '', action: "OK" };
  }

  const limits = SECTION_LIMITS[sectionName];
  const words = wordCount(text);

  if (words > limits.max) {
    return {
      text: compressText(text, limits.max),
      action: "COMPRESSED"
    };
  }

  if (words < limits.min) {
    return {
      text,
      action: "OK_UNDER_MIN"
    };
  }

  return {
    text,
    action: "OK"
  };
}

interface SizingEngineResult {
  sizedSections: Record<string, string>;
  totalWords: number;
  actions: Array<{ section: string; action: string }>;
}

function applySizingEngine(sections: Record<string, string>): SizingEngineResult {
  let totalWords = 0;
  const result: Record<string, string> = {};
  const actions: Array<{ section: string; action: string }> = [];

  // Size each section according to its limits
  for (const section in sections) {
    if (section in SECTION_LIMITS) {
      const sized = sizeSection(section as keyof typeof SECTION_LIMITS, sections[section]);
      result[section] = sized.text;
      totalWords += wordCount(sized.text);

      if (sized.action !== "OK") {
        actions.push({
          section,
          action: sized.action
        });
      }
    } else {
      // For sections not in SECTION_LIMITS, keep as-is
      result[section] = sections[section];
      totalWords += wordCount(sections[section]);
    }
  }

  // Global hard cap - reduce lowest-risk sections if total exceeds limit
  if (totalWords > GLOBAL_LIMITS.maxWordsTotal) {
    let overflow = totalWords - GLOBAL_LIMITS.maxWordsTotal;

    // Reduce lowest-risk sections first
    const reducibleSections: Array<keyof typeof SECTION_LIMITS> = [
      "legal_basis",
      "introduction",
      "conclusion"
    ];

    for (const section of reducibleSections) {
      if (overflow <= 0) break;
      if (!result[section]) continue;

      const current = result[section];
      const currentWords = wordCount(current);
      const targetWords = Math.max(
        SECTION_LIMITS[section].min,
        currentWords - Math.ceil(overflow / reducibleSections.length)
      );

      if (targetWords < currentWords) {
        const reduced = compressText(current, targetWords);
        result[section] = reduced;
        
        const savedWords = currentWords - wordCount(reduced);
        totalWords -= savedWords;
        overflow -= savedWords;

        actions.push({
          section,
          action: "GLOBAL_COMPRESSED"
        });
      }
    }
  }

  return {
    sizedSections: result,
    totalWords,
    actions
  };
}

/**
 * Layout Validator - Utility Functions
 */
function estimateLines(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;
  const avgWordsPerLine = 11;
  return Math.ceil(words / avgWordsPerLine);
}

function estimatePages(totalWords: number): number {
  return totalWords / LAYOUT_RULES.maxWordsPerPage;
}

/**
 * Layout Validator - Main Validation Function
 */
export async function validateLayout(sections: Record<string, string>): Promise<LayoutValidationResult> {
  const issues: LayoutValidationResult['issues'] = [];
  let totalWords = 0;
  let paragraphCount = 0;

  for (const section in sections) {
    const text = sections[section];
    if (!text || text.trim().length === 0) continue;

    const words = wordCount(text);
    const lines = estimateLines(text);

    totalWords += words;
    paragraphCount++;

    if (lines < LAYOUT_RULES.minLinesPerParagraph) {
      issues.push({
        type: "PARAGRAPH_TOO_SHORT",
        section,
        lines
      });
    }

    if (lines > LAYOUT_RULES.maxLinesPerParagraph) {
      issues.push({
        type: "PARAGRAPH_TOO_LONG",
        section,
        lines
      });
    }

    if (words > LAYOUT_RULES.maxWordsPerParagraph) {
      issues.push({
        type: "PARAGRAPH_TOO_DENSE",
        section,
        words
      });
    }
  }

  const estimatedPages = estimatePages(totalWords);

  if (estimatedPages > LAYOUT_RULES.maxPages) {
    issues.push({
      type: "PAGE_OVERFLOW",
      estimatedPages
    });
  }

  if (paragraphCount < LAYOUT_RULES.minParagraphs) {
    issues.push({
      type: "TOO_FEW_PARAGRAPHS",
      paragraphCount
    });
  }

  if (paragraphCount > LAYOUT_RULES.maxParagraphs) {
    issues.push({
      type: "TOO_MANY_PARAGRAPHS",
      paragraphCount
    });
  }

  return {
    isValid: issues.length === 0,
    estimatedPages,
    totalWords,
    paragraphCount,
    issues
  };
}

/**
 * Layout Fixer - Automatically fix layout issues
 */
function fixLayoutIssues(
  sections: Record<string, string>,
  issues: LayoutValidationResult['issues']
): Record<string, string> {
  const fixed = { ...sections };

  for (const issue of issues) {
    if (!issue.section || !fixed[issue.section]) continue;

    const sectionText = fixed[issue.section];
    if (!sectionText) continue;

    switch (issue.type) {
      case "PARAGRAPH_TOO_LONG": {
        // Compress to maxLinesPerParagraph
        const targetWords = LAYOUT_RULES.maxLinesPerParagraph * 11; // 11 words per line
        fixed[issue.section] = compressText(sectionText, targetWords);
        break;
      }

      case "PARAGRAPH_TOO_DENSE": {
        // Compress to maxWordsPerParagraph
        fixed[issue.section] = compressText(sectionText, LAYOUT_RULES.maxWordsPerParagraph);
        break;
      }

      case "PAGE_OVERFLOW": {
        // Apply additional compression to lowest-risk sections
        const reducibleSections: Array<keyof typeof SECTION_LIMITS> = [
          "legal_basis",
          "introduction",
          "conclusion"
        ];

        const currentTotalWords = Object.values(fixed).reduce((sum, text) => {
          return sum + wordCount(text || '');
        }, 0);

        const overflow = currentTotalWords - LAYOUT_RULES.maxWordsTotal;
        if (overflow > 0) {
          for (const section of reducibleSections) {
            if (overflow <= 0) break;
            if (!fixed[section]) continue;

            const current = fixed[section];
            const currentWords = wordCount(current);
            const targetWords = Math.max(
              SECTION_LIMITS[section].min,
              currentWords - Math.ceil(overflow / reducibleSections.length)
            );

            if (targetWords < currentWords) {
              fixed[section] = compressText(current, targetWords);
            }
          }
        }
        break;
      }

      case "TOO_MANY_PARAGRAPHS": {
        // Compress optional sections
        const optionalSections = ["lawful_entry_and_status", "purpose_of_study"];
        for (const section of optionalSections) {
          if (fixed[section]) {
            const current = fixed[section];
            const targetWords = Math.max(30, wordCount(current) - 20);
            fixed[section] = compressText(current, targetWords);
          }
        }
        break;
      }
    }
  }

  return fixed;
}

/**
 * Build PDF payload from cover letter sections and data
 */
function buildCoverLetterPdfPayload(
  sections: CoverLetterSections,
  data: AggregatedApplicationData
) {
  // Extract address lines
  const headerAddressLines: string[] = [];
  if (data.application.currentAddress) {
    if (data.application.currentAddress.street) {
      headerAddressLines.push(data.application.currentAddress.street);
    }
    const cityStateZip = [
      data.application.currentAddress.city,
      data.application.currentAddress.state,
      data.application.currentAddress.zipCode
    ].filter(Boolean).join(", ");
    if (cityStateZip) {
      headerAddressLines.push(cityStateZip);
    }
  }

  // Format date
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Build USCIS address
  const getUSCISAddress = (state?: string) => {
    return [
      "U.S. Citizenship and Immigration Services",
      "P.O. Box 805887",
      "Chicago, IL 60680-4120"
    ];
  };
  const uscisAddressLines = getUSCISAddress(data.application.currentAddress?.state);

  // Get applicant name from passport
  const applicantName = data.documents.passport?.name 
    || data.documents.i94?.name 
    || data.documents.i20?.studentName 
    || "Applicant";

  // Build body paragraphs from sections (filter empty)
  const rawParagraphs = [
    sections.introduction,
    sections.legal_basis,
    sections.lawful_entry_and_status,
    sections.change_of_intent_explanation,
    sections.purpose_of_study,
    sections.financial_ability_and_non_employment,
    sections.nonimmigrant_intent_and_return_obligation,
    sections.conclusion
  ]
    .map((p) => p?.trim())
    .filter(Boolean) as string[];

  // Merge short paragraphs to improve layout
  const {
    mergedParagraphs: bodyParagraphs,
    actions: mergeActions
  } = mergeShortParagraphs(rawParagraphs);

  // Log merge actions for audit (optional)
  if (mergeActions.length > 0) {
    console.log("Paragraph merge actions:", mergeActions);
  }

  return {
    headerAddressLines: headerAddressLines.length > 0 ? headerAddressLines : ["Address not provided"],
    dateLine: currentDate,
    uscisAddressLines,
    reLine: "Re: Form I-539 – Application to Extend/Change Nonimmigrant Status",
    bodyParagraphs,
    closingLine: "Respectfully submitted,",
    signatureName: applicantName,
  };
}

/**
 * Assemble Cover Letter from sections
 */
async function assembleCoverLetter(
  sections: CoverLetterSections,
  data: AggregatedApplicationData,
  ruleCheckResult: RuleCheckResult
): Promise<string> {
  // Get applicant address
  const applicantAddress = data.application.currentAddress
    ? `${data.application.currentAddress.street}\n${data.application.currentAddress.city}, ${data.application.currentAddress.state} ${data.application.currentAddress.zipCode}`
    : "";

  // Get USCIS filing address
  const getUSCISAddress = (state?: string) => {
    const defaultAddress = `USCIS
P.O. Box 805887
Chicago, IL 60680-4120`;
    return defaultAddress;
  };

  const uscisAddress = getUSCISAddress(data.application.currentAddress?.state);
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Get applicant name from passport
  const applicantName = data.documents.passport?.name 
    || data.documents.i94?.name 
    || data.documents.i20?.studentName 
    || "Applicant";

  // Get available exhibits
  const availableExhibits = getAvailableExhibits(data);
  const exhibitList = availableExhibits.map(e => `Exhibit ${e.letter}: ${e.description}`).join(", ");

  // Apply sizing engine to all sections
  // Convert CoverLetterSections to Record for sizing engine, then back
  const sectionsRecord: Record<string, string> = {};
  Object.keys(sections).forEach((key) => {
    const value = sections[key as keyof CoverLetterSections];
    if (value) {
      sectionsRecord[key] = value;
    }
  });
  
  const sizingResult = applySizingEngine(sectionsRecord);
  
  // Convert back to CoverLetterSections
  let processedSections: CoverLetterSections = {
    introduction: sizingResult.sizedSections.introduction || sections.introduction,
    legal_basis: sizingResult.sizedSections.legal_basis || sections.legal_basis,
    lawful_entry_and_status: sizingResult.sizedSections.lawful_entry_and_status || sections.lawful_entry_and_status,
    change_of_intent_explanation: sizingResult.sizedSections.change_of_intent_explanation || sections.change_of_intent_explanation,
    purpose_of_study: sizingResult.sizedSections.purpose_of_study || sections.purpose_of_study,
    financial_ability_and_non_employment: sizingResult.sizedSections.financial_ability_and_non_employment || sections.financial_ability_and_non_employment,
    nonimmigrant_intent_and_return_obligation: sizingResult.sizedSections.nonimmigrant_intent_and_return_obligation || sections.nonimmigrant_intent_and_return_obligation,
    conclusion: sizingResult.sizedSections.conclusion || sections.conclusion,
  };

  // Apply layout validation and fix issues if needed
  const processedSectionsRecord: Record<string, string> = {};
  Object.keys(processedSections).forEach((key) => {
    const value = processedSections[key as keyof CoverLetterSections];
    if (value) {
      processedSectionsRecord[key] = value;
    }
  });

  const layoutValidation = await validateLayout(processedSectionsRecord);

  if (!layoutValidation.isValid) {
    // Attempt to fix layout issues
    const fixedSections = fixLayoutIssues(processedSectionsRecord, layoutValidation.issues);
    
    // Re-validate to check if fixes resolved issues
    const revalidation = await validateLayout(fixedSections);
    
    // Use fixed sections if revalidation shows improvement or is valid
    if (revalidation.isValid || revalidation.issues.length < layoutValidation.issues.length) {
      // Convert back to CoverLetterSections
      processedSections = {
        introduction: fixedSections.introduction || processedSections.introduction,
        legal_basis: fixedSections.legal_basis || processedSections.legal_basis,
        lawful_entry_and_status: fixedSections.lawful_entry_and_status || processedSections.lawful_entry_and_status,
        change_of_intent_explanation: fixedSections.change_of_intent_explanation || processedSections.change_of_intent_explanation,
        purpose_of_study: fixedSections.purpose_of_study || processedSections.purpose_of_study,
        financial_ability_and_non_employment: fixedSections.financial_ability_and_non_employment || processedSections.financial_ability_and_non_employment,
        nonimmigrant_intent_and_return_obligation: fixedSections.nonimmigrant_intent_and_return_obligation || processedSections.nonimmigrant_intent_and_return_obligation,
        conclusion: fixedSections.conclusion || processedSections.conclusion,
      };
    }
  }

  // Build the letter
  let letter = "";

  // Header with applicant address (top right)
  if (applicantAddress) {
    letter += applicantAddress.split("\n").map(line => line.trim()).join("\n");
    letter += "\n\n";
  }

  // Date
  letter += currentDate + "\n\n";

  // USCIS address (left side)
  letter += uscisAddress + "\n\n";

  // Subject line
  letter += "Re: Form I-539 Application to Extend/Change Nonimmigrant Status\n\n";

  // Salutation
  letter += "U.S. Citizenship and Immigration Services\n\n";

  // Body sections (using processed sections after compression)
  letter += processedSections.introduction + "\n\n";
  
  letter += processedSections.legal_basis + "\n\n";
  
  if (processedSections.lawful_entry_and_status) {
    letter += processedSections.lawful_entry_and_status + "\n\n";
  }
  
  letter += processedSections.change_of_intent_explanation + "\n\n";
  
  if (processedSections.purpose_of_study) {
    letter += processedSections.purpose_of_study + "\n\n";
  }
  
  letter += processedSections.financial_ability_and_non_employment + "\n\n";
  
  letter += processedSections.nonimmigrant_intent_and_return_obligation + "\n\n";
  
  letter += processedSections.conclusion + "\n\n";

  // Closing
  letter += "Respectfully submitted,\n\n";
  letter += applicantName + "\n";

  // Add exhibit list reference if needed
  if (availableExhibits.length > 0) {
    letter += "\n\nEnclosed Documents:\n";
    letter += exhibitList;
  }

  // Clean markdown formatting before returning
  return cleanMarkdownFormatting(letter);
}

/**
 * Agent 1: Legal Framework Agent
 * Drafts the legal backbone of the cover letter with USCIS regulations
 */
async function runLegalFrameworkAgent(
  data: AggregatedApplicationData
): Promise<{ success: boolean; output?: LegalFrameworkOutput; error?: string }> {
  const systemPrompt = `You are a STRICT DOCUMENT-ONLY USCIS drafting agent.

Your role is to MODIFY your existing behavior so that you ONLY use information explicitly present in uploaded documents and structured extraction outputs.

ABSOLUTE RULE:
You must NOT infer, assume, enrich, guess, or complete missing information.
If a fact is not present in the documents, it MUST NOT appear in the output.

========================
SOURCE OF TRUTH
========================

You will receive structured data objects extracted from documents (e.g., I-94, Passport, I-20, Bank Statements).

Each field may include:
- value
- source_document
- confidence

You may ONLY use fields where:
- value is present
- source_document is explicitly identified

If source_document is missing or null → DO NOT USE THE INFORMATION.

========================
PROHIBITED ACTIONS
========================

❌ Do NOT:
- Guess profession, intent, school, program, or ties
- Invent timelines
- Assume compliance
- Add narrative elements not stated in documents
- Fill gaps with generic immigration language that implies facts

Examples of FORBIDDEN text:
- "He intends to return to Brazil"
- "His professional goals"
- "His academic background"
- "His family ties"
(unless explicitly documented)

========================
ALLOWED ACTIONS
========================

✅ You MAY:
- Restate document facts verbatim or neutrally
- Reference dates exactly as shown
- Reference document numbers
- Use neutral placeholders such as:
  - "the applicant"
  - "the requested change of status"
  - "supporting documentation has been provided"
- Cite applicable regulations: Section 248 of the Immigration and Nationality Act, 8 C.F.R. Section 248.1, 8 C.F.R. Section 214.2(f). NEVER use "8 CFR § 214.1" - this is generic and does not help.

========================
LANGUAGE STYLE
========================

- Formal
- Neutral
- USCIS-style
- No emotional or persuasive language
- No speculation
- No conclusions beyond documented facts

========================
OUTPUT REQUIREMENTS
========================

When generating legal framework sections:

1. Cite only verifiable facts from documents
2. If required information is missing:
   - Omit the section OR
   - Use a neutral generic sentence without factual claims

3. NEVER mention:
   - "missing data"
   - "uncertainty"
   - "not provided"

If critical required data is missing (e.g., entry date, status type):
- STOP
- Return the following error exactly:

ERROR: Required document data missing. Unable to generate document-safe output.

You MUST return a valid JSON object with the following structure:
{
  "legal_sections": {
    "introduction": "...",
    "eligibility": "...",
    "legal_basis": "...",
    "financial_overview": "...",
    "conclusion": "..."
  }
}

Use ONLY the provided document-extracted data. Do NOT rely on prior context or general knowledge. Generate output that is 100% defensible against document audit.`;

  // Build document-only data presentation
  const documentFacts: string[] = [];
  
  if (data.documents.i94?.classOfAdmission) {
    documentFacts.push(`Current Status: ${data.documents.i94.classOfAdmission} (from I-94 document)`);
  }
  if (data.documents.i20?.sevisId) {
    documentFacts.push(`Requested Status: F-1 (from I-20 document, SEVIS ID: ${data.documents.i20.sevisId})`);
  }
  if (data.documents.i94?.dateOfAdmission) {
    documentFacts.push(`Entry Date: ${data.documents.i94.dateOfAdmission} (from I-94 document)`);
  }
  if (data.documents.i94?.admitUntilDate) {
    documentFacts.push(`Authorized Stay Until: ${data.documents.i94.admitUntilDate} (from I-94 document)`);
  }

  const userPrompt = `Generate the legal framework sections for a change of status application.

DOCUMENT-EXTRACTED FACTS (USE ONLY THESE):
${documentFacts.length > 0 ? documentFacts.join("\n") : "No document facts available."}

${data.documents.passport?.passportNumber ? `Passport Number: ${data.documents.passport.passportNumber} (from Passport document)` : ""}
${data.documents.i20?.schoolName ? `School: ${data.documents.i20.schoolName} (from I-20 document)` : ""}
${data.documents.i20?.programOfStudy ? `Program: ${data.documents.i20.programOfStudy} (from I-20 document)` : ""}

${data.formData.dependents?.hasDependents && data.formData.dependents.dependents.length > 0 ? `
Dependents (from application form):
${data.formData.dependents.dependents.map((dep, i) => `- ${dep.fullName} (${dep.relationship})`).join("\n")}
` : ""}

CRITICAL: Only use information explicitly listed above. Do NOT infer, assume, or add any facts not present in the documents.

Generate the following legal sections:

1. **introduction**: Formal USCIS introduction addressing the change of status request. Use only documented facts.
2. **eligibility**: Section explaining eligibility for change of status under Section 248 of the Immigration and Nationality Act and maintenance of status. Reference only documented dates and status information.
3. **legal_basis**: Section citing 8 C.F.R. Section 248.1 and 8 C.F.R. Section 214.2(f) as legal basis for the change. NEVER use "8 CFR § 214.1" - this is generic and does not help. No factual claims beyond regulations.
4. **financial_overview**: High-level statement about financial ability (reference exhibits only, do not include specific amounts unless documented).
5. **conclusion**: Formal conclusion requesting approval. No factual claims.

If any critical required data is missing (entry date, status type, etc.), return an error instead of generating sections.

Return ONLY a valid JSON object with these sections. Use formal, neutral language. Do NOT include any facts not explicitly documented above.`;

  const result = await callOpenAIWithJSONResponse<LegalFrameworkOutput>(
    systemPrompt,
    userPrompt
  );

  if (!result.success || !result.json) {
    return {
      success: false,
      error: result.error || "Failed to generate legal framework",
    };
  }

  // Validate structure
  if (
    !result.json.legal_sections ||
    !result.json.legal_sections.introduction ||
    !result.json.legal_sections.eligibility ||
    !result.json.legal_sections.legal_basis ||
    !result.json.legal_sections.financial_overview ||
    !result.json.legal_sections.conclusion
  ) {
    return {
      success: false,
      error: "Invalid legal framework structure: missing required sections",
    };
  }

  return { success: true, output: result.json };
}

/**
 * Agent 2: Facts & Consistency Agent
 * Ensures factual accuracy, timeline coherence, and USCIS compliance
 */
async function runFactsConsistencyAgent(
  data: AggregatedApplicationData
): Promise<{ success: boolean; output?: FactsConsistencyOutput; error?: string }> {
  const systemPrompt = `You are a STRICT DOCUMENT-ONLY USCIS drafting agent.

Your role is to MODIFY your existing behavior so that you ONLY use information explicitly present in uploaded documents and structured extraction outputs.

ABSOLUTE RULE:
You must NOT infer, assume, enrich, guess, or complete missing information.
If a fact is not present in the documents, it MUST NOT appear in the output.

========================
SOURCE OF TRUTH
========================

You will receive structured data objects extracted from documents (e.g., I-94, Passport, I-20, Bank Statements).

Each field may include:
- value
- source_document
- confidence

You may ONLY use fields where:
- value is present
- source_document is explicitly identified

If source_document is missing or null → DO NOT USE THE INFORMATION.

========================
PROHIBITED ACTIONS
========================

❌ Do NOT:
- Guess profession, intent, school, program, or ties
- Invent timelines
- Assume compliance
- Add narrative elements not stated in documents
- Fill gaps with generic immigration language that implies facts
- Suggest intent at entry
- Speculate about status violations or overstays
- Confirm compliance without documented evidence

Examples of FORBIDDEN text:
- "He intends to return to Brazil"
- "His professional goals"
- "No status violation" (unless explicitly documented)
- "SEVIS fee paid" (unless explicitly documented)

========================
ALLOWED ACTIONS
========================

✅ You MAY:
- Restate document facts verbatim or neutrally
- Reference dates exactly as shown in documents
- Reference document numbers exactly as shown
- Use neutral placeholders such as:
  - "the applicant"
  - "the requested change of status"
  - "supporting documentation has been provided"
- Flag timing risks WITHOUT legal conclusions (only if dates are documented)

========================
LANGUAGE STYLE
========================

- Formal
- Neutral
- USCIS-style
- No emotional or persuasive language
- No speculation
- No conclusions beyond documented facts

========================
OUTPUT REQUIREMENTS
========================

When generating facts sections:

1. Cite only verifiable facts from documents
2. If required information is missing:
   - Omit the section OR
   - Use a neutral generic sentence without factual claims

3. NEVER mention:
   - "missing data"
   - "uncertainty"
   - "not provided"
   - Compliance claims without documentation

If critical required data is missing (e.g., entry date, I-94 expiration):
- STOP
- Return the following error exactly:

ERROR: Required document data missing. Unable to generate document-safe output.

You MUST return a valid JSON object with the following structure:
{
  "facts_sections": {
    "case_background": "...",
    "timeline": "...",
    "status_compliance": "...",
    "exhibit_summary": "..."
  },
  "warnings": []
}

Use ONLY the provided document-extracted data. Do NOT rely on prior context or general knowledge. Generate output that is 100% defensible against document audit.`;

  // Build document-only facts - only include if present
  const documentFacts: string[] = [];
  const warnings: string[] = [];

  if (!data.documents.i94?.dateOfAdmission) {
    warnings.push("Missing entry date from I-94 document");
  } else {
    documentFacts.push(`Entry Date: ${data.documents.i94.dateOfAdmission} (from I-94 document, See Exhibit A)`);
  }

  if (!data.documents.i94?.admitUntilDate) {
    warnings.push("Missing I-94 expiration date");
  } else {
    documentFacts.push(`I-94 Expiration Date: ${data.documents.i94.admitUntilDate} (from I-94 document, See Exhibit A)`);
  }

  const filingDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  documentFacts.push(`Filing Date: ${filingDate} (current date)`);

  if (data.documents.i20?.startDate) {
    documentFacts.push(`Program Start Date: ${data.documents.i20.startDate} (from I-20 document, See Exhibit B)`);
  }

  if (data.documents.passport?.passportNumber) {
    documentFacts.push(`Passport Number: ${data.documents.passport.passportNumber} (from Passport document, See Exhibit A)`);
  }

  if (data.documents.i20?.sevisId) {
    documentFacts.push(`SEVIS ID: ${data.documents.i20.sevisId} (from I-20 document, See Exhibit B)`);
  }

  if (data.documents.i94?.admissionNumber) {
    documentFacts.push(`Admission Number: ${data.documents.i94.admissionNumber} (from I-94 document, See Exhibit A)`);
  }

  if (data.documents.i94?.classOfAdmission) {
    documentFacts.push(`Class of Admission: ${data.documents.i94.classOfAdmission} (from I-94 document, See Exhibit A)`);
  }

  const availableExhibits = getAvailableExhibits(data);
  const exhibitCitations = availableExhibits.map(e => `Exhibit ${e.letter}: ${e.description}`).join(", ");

  // Check for critical missing data
  const missingData: string[] = [];
  if (!data.documents.i94?.dateOfAdmission) {
    missingData.push("I-94 entry date (dateOfAdmission)");
  }
  if (!data.documents.i94?.admitUntilDate) {
    missingData.push("I-94 expiration date (admitUntilDate)");
  }
  
  // Development test mode: bypass validation
  const isTestMode = process.env.DOCUMENT_AI_TEST_MODE === "true";
  
  if (missingData.length > 0) {
    if (isTestMode) {
      // Use placeholder data for development
      console.warn(`[TEST MODE] Missing I-94 data: ${missingData.join(", ")}. Using placeholder values.`);
      if (!data.documents.i94) {
        data.documents.i94 = {};
      }
      if (!data.documents.i94.dateOfAdmission) {
        data.documents.i94.dateOfAdmission = "2024-01-15";
      }
      if (!data.documents.i94.admitUntilDate) {
        data.documents.i94.admitUntilDate = "2024-07-15";
      }
      if (!data.documents.i94.classOfAdmission) {
        data.documents.i94.classOfAdmission = "B2";
      }
      if (!data.documents.i94.admissionNumber) {
        data.documents.i94.admissionNumber = "TEST123456789";
      }
    } else {
      return {
        success: false,
        error: `ERROR: Required document data missing. Unable to generate document-safe output. Missing: ${missingData.join(", ")}. Please ensure your I-94 document has been uploaded and processed correctly.`,
      };
    }
  }

  const userPrompt = `Generate factual sections for a change of status application.

DOCUMENT-EXTRACTED FACTS (USE ONLY THESE):
${documentFacts.length > 0 ? documentFacts.join("\n") : "No document facts available."}

AVAILABLE EXHIBITS:
${exhibitCitations}

CRITICAL: Only use information explicitly listed above. Do NOT infer, assume, or add any facts not present in the documents.

Generate the following factual sections:

1. **case_background**: Brief factual background using ONLY documented entry date, status, and requested change. No assumptions.
2. **timeline**: Chronological timeline using ONLY documented dates. Do NOT infer or assume any dates.
3. **status_compliance**: Statement about status using ONLY documented dates. Do NOT claim compliance without documented evidence. Do NOT mention "no overstay" unless explicitly documented.
4. **exhibit_summary**: Summary of attached exhibits with proper citations. Reference only exhibits that are actually listed above.

**warnings**: Array of any timing risks based ONLY on documented dates (e.g., "Filing date is close to I-94 expiration" if dates show this). Leave empty if no concerns or if dates are missing.

Return ONLY a valid JSON object. Use neutral, factual language. Do NOT imply prior intent, make legal conclusions, or add any facts not explicitly documented above.`;

  const result = await callOpenAIWithJSONResponse<FactsConsistencyOutput>(
    systemPrompt,
    userPrompt
  );

  if (!result.success || !result.json) {
    return {
      success: false,
      error: result.error || "Failed to generate facts and consistency sections",
    };
  }

  // Validate structure
  if (
    !result.json.facts_sections ||
    !result.json.facts_sections.case_background ||
    !result.json.facts_sections.timeline ||
    !result.json.facts_sections.status_compliance ||
    !result.json.facts_sections.exhibit_summary
  ) {
    return {
      success: false,
      error: "Invalid facts structure: missing required sections",
    };
  }

  if (!Array.isArray(result.json.warnings)) {
    result.json.warnings = [];
  }

  return { success: true, output: result.json };
}

/**
 * Agent 3: Narrative & Intent Agent
 * Drafts the human narrative in a USCIS-safe manner
 */
async function runNarrativeIntentAgent(
  data: AggregatedApplicationData
): Promise<{ success: boolean; output?: NarrativeIntentOutput; error?: string }> {
  const systemPrompt = `You are a STRICT DOCUMENT-ONLY USCIS drafting agent.

Your role is to MODIFY your existing behavior so that you ONLY use information explicitly present in uploaded documents and structured extraction outputs.

ABSOLUTE RULE:
You must NOT infer, assume, enrich, guess, or complete missing information.
If a fact is not present in the documents, it MUST NOT appear in the output.

========================
SOURCE OF TRUTH
========================

You will receive structured data objects extracted from documents (e.g., I-94, Passport, I-20, Bank Statements).

Each field may include:
- value
- source_document
- confidence

You may ONLY use fields where:
- value is present
- source_document is explicitly identified

If source_document is missing or null → DO NOT USE THE INFORMATION.

========================
PROHIBITED ACTIONS
========================

❌ Do NOT:
- Guess profession, intent, school, program, or ties
- Invent timelines
- Assume compliance
- Add narrative elements not stated in documents
- Fill gaps with generic immigration language that implies facts
- Imply prior intent to study at entry
- Exaggerate hardship
- Include immigration opinions
- Invent change of intent narratives

Examples of FORBIDDEN text:
- "He intends to return to Brazil" (unless explicitly documented)
- "His professional goals" (unless explicitly documented)
- "His academic background" (unless explicitly documented)
- "His family ties" (unless explicitly documented)
- "Circumstances changed after entry" (unless explicitly documented)

========================
ALLOWED ACTIONS
========================

✅ You MAY:
- Restate document facts verbatim or neutrally
- Reference dates exactly as shown
- Reference document numbers
- Use neutral placeholders such as:
  - "the applicant"
  - "the requested change of status"
  - "supporting documentation has been provided"
- Reference I-20 program details if explicitly present in I-20 document

========================
LANGUAGE STYLE
========================

- Formal
- Neutral
- USCIS-style
- No emotional or persuasive language
- No speculation
- No conclusions beyond documented facts

========================
OUTPUT REQUIREMENTS
========================

When generating narrative sections:

1. Cite only verifiable facts from documents
2. If required information is missing:
   - Omit the section OR
   - Use a neutral generic sentence without factual claims

3. NEVER mention:
   - "missing data"
   - "uncertainty"
   - "not provided"
   - Change of intent unless explicitly documented

If critical required data is missing (e.g., I-20 program details, ties information):
- STOP
- Return the following error exactly:

ERROR: Required document data missing. Unable to generate document-safe output.

You MUST return a valid JSON object with the following structure:
{
  "narrative_sections": {
    "change_of_intent": "...",
    "purpose_of_study": "...",
    "ties_to_home_country": "..."
  }
}

Use ONLY the provided document-extracted data. Do NOT rely on prior context or general knowledge. Generate output that is 100% defensible against document audit.`;

  // Build document-only facts
  const documentFacts: string[] = [];
  
  if (data.documents.passport?.nationality) {
    documentFacts.push(`Nationality: ${data.documents.passport.nationality} (from Passport document, See Exhibit A)`);
  }

  if (data.documents.i20?.schoolName) {
    documentFacts.push(`School: ${data.documents.i20.schoolName} (from I-20 document, See Exhibit B)`);
  }
  if (data.documents.i20?.programOfStudy) {
    documentFacts.push(`Program: ${data.documents.i20.programOfStudy} (from I-20 document, See Exhibit B)`);
  }
  if (data.documents.i20?.programLevel) {
    documentFacts.push(`Level: ${data.documents.i20.programLevel} (from I-20 document, See Exhibit B)`);
  }
  if (data.documents.i20?.majorField) {
    documentFacts.push(`Major: ${data.documents.i20.majorField} (from I-20 document, See Exhibit B)`);
  }
  if (data.documents.i20?.startDate) {
    documentFacts.push(`Start Date: ${data.documents.i20.startDate} (from I-20 document, See Exhibit B)`);
  }

  const tiesInfo: string[] = [];
  if (data.formData.tiesToCountry?.question1) {
    tiesInfo.push(`Family Ties: ${data.formData.tiesToCountry.question1.substring(0, 300)} (from application form)`);
  }
  if (data.formData.tiesToCountry?.question2) {
    tiesInfo.push(`Assets: ${data.formData.tiesToCountry.question2.substring(0, 300)} (from application form)`);
  }
  if (data.formData.tiesToCountry?.question3) {
    tiesInfo.push(`Employment: ${data.formData.tiesToCountry.question3.substring(0, 300)} (from application form)`);
  }

  // Check for critical missing data
  const missingData: string[] = [];
  if (!data.documents.i20?.schoolName) {
    missingData.push("I-20 school name");
  }
  if (!data.documents.i20?.programOfStudy) {
    missingData.push("I-20 program of study");
  }
  
  // Development test mode: bypass validation
  const isTestMode = process.env.DOCUMENT_AI_TEST_MODE === "true";
  
  if (missingData.length > 0) {
    if (isTestMode) {
      // Use placeholder data for development
      console.warn(`[TEST MODE] Missing I-20 data: ${missingData.join(", ")}. Using placeholder values.`);
      if (!data.documents.i20) {
        data.documents.i20 = {};
      }
      if (!data.documents.i20.schoolName) {
        data.documents.i20.schoolName = "Test University";
      }
      if (!data.documents.i20.programOfStudy) {
        data.documents.i20.programOfStudy = "Computer Science";
      }
      if (!data.documents.i20.sevisId) {
        data.documents.i20.sevisId = "N0123456789";
      }
      if (!data.documents.i20.startDate) {
        data.documents.i20.startDate = "2024-08-15";
      }
      if (!data.documents.i20.programLevel) {
        data.documents.i20.programLevel = "Master's";
      }
      if (!data.documents.i20.majorField) {
        data.documents.i20.majorField = "Computer Science";
      }
    } else {
      return {
        success: false,
        error: `ERROR: Required document data missing. Unable to generate document-safe output. Missing: ${missingData.join(", ")}. Please ensure your I-20 document has been uploaded and processed correctly.`,
      };
    }
  }

  // Get applicant name from passport (document source), not user profile
  const applicantName = data.documents.passport?.name 
    || data.documents.i94?.name 
    || data.documents.i20?.studentName 
    || "the applicant";

  const userPrompt = `Generate narrative sections for a change of status application.

DOCUMENT-EXTRACTED FACTS (USE ONLY THESE):
${documentFacts.length > 0 ? documentFacts.join("\n") : "No document facts available."}

Applicant Name: ${applicantName}${data.documents.passport?.name ? " (from Passport document, See Exhibit A)" : data.documents.i94?.name ? " (from I-94 document, See Exhibit A)" : data.documents.i20?.studentName ? " (from I-20 document, See Exhibit B)" : ""}

${tiesInfo.length > 0 ? `
Ties to Home Country (from application form):
${tiesInfo.join("\n")}
` : ""}

CRITICAL: Only use information explicitly listed above. Do NOT infer, assume, or add any facts not present in the documents.

Generate the following narrative sections:

1. **change_of_intent**: ONLY if explicitly documented in application form or documents. Do NOT invent change of intent narratives. If not documented, use a neutral placeholder like "The applicant requests a change of status."

2. **purpose_of_study**: Describe the purpose using ONLY I-20 document details listed above. Do NOT infer professional background alignment unless explicitly documented. Reference only documented program information.

3. **ties_to_home_country**: Use ONLY the ties information listed above from the application form. If no ties information is provided, use a neutral statement like "Supporting documentation regarding ties to home country has been provided" without making factual claims.

Return ONLY a valid JSON object. Use professional, neutral language. Do NOT use emotional language, immigration opinions, or any facts not explicitly documented above.`;

  const result = await callOpenAIWithJSONResponse<NarrativeIntentOutput>(
    systemPrompt,
    userPrompt
  );

  if (!result.success || !result.json) {
    return {
      success: false,
      error: result.error || "Failed to generate narrative sections",
    };
  }

  // Validate structure
  if (
    !result.json.narrative_sections ||
    !result.json.narrative_sections.change_of_intent ||
    !result.json.narrative_sections.purpose_of_study ||
    !result.json.narrative_sections.ties_to_home_country
  ) {
    return {
      success: false,
      error: "Invalid narrative structure: missing required sections",
    };
  }

  return { success: true, output: result.json };
}

/**
 * Agent 4: Cover Letter Assembler
 * Assembles final USCIS-ready cover letter from all agent outputs
 */
async function runCoverLetterAssembler(
  legalOutput: LegalFrameworkOutput,
  factsOutput: FactsConsistencyOutput,
  narrativeOutput: NarrativeIntentOutput,
  data: AggregatedApplicationData
): Promise<{ success: boolean; content?: string; error?: string }> {
  const systemPrompt = `You are a STRICT DOCUMENT-ONLY USCIS drafting agent.

Your role is to MODIFY your existing behavior so that you ONLY use information explicitly present in uploaded documents and structured extraction outputs.

ABSOLUTE RULE:
You must NOT infer, assume, enrich, guess, or complete missing information.
If a fact is not present in the documents, it MUST NOT appear in the output.

========================
SOURCE OF TRUTH
========================

You will receive structured data objects extracted from documents (e.g., I-94, Passport, I-20, Bank Statements).

Each field may include:
- value
- source_document
- confidence

You may ONLY use fields where:
- value is present
- source_document is explicitly identified

If source_document is missing or null → DO NOT USE THE INFORMATION.

========================
PROHIBITED ACTIONS
========================

❌ Do NOT:
- Guess profession, intent, school, program, or ties
- Invent timelines
- Assume compliance
- Add narrative elements not stated in documents
- Fill gaps with generic immigration language that implies facts

Examples of FORBIDDEN text:
- "He intends to return to Brazil"
- "His professional goals"
- "His academic background"
- "His family ties"
(unless explicitly documented)

========================
ALLOWED ACTIONS
========================

✅ You MAY:
- Restate document facts verbatim or neutrally
- Reference dates exactly as shown
- Reference document numbers
- Use neutral placeholders such as:
  - "the applicant"
  - "the requested change of status"
  - "supporting documentation has been provided"

========================
LANGUAGE STYLE
========================

- Formal
- Neutral
- USCIS-style
- No emotional or persuasive language
- No speculation
- No conclusions beyond documented facts

========================
OUTPUT REQUIREMENTS
========================

When assembling the cover letter:

1. Cite only verifiable facts from provided sections
2. If required information is missing:
   - Omit the section OR
   - Use a neutral generic sentence without factual claims

3. NEVER mention:
   - "missing data"
   - "uncertainty"
   - "not provided"

CRITICAL FORMATTING REQUIREMENTS:
- USCIS-style business letter format
- Plain text output (NO markdown)
- NO markdown symbols: NO **, NO -, NO #, NO backticks, NO bullet points
- No emojis (NO checkmarks, X marks, warning symbols, etc.)
- No bullet points unless USCIS-appropriate
- Proper headings (plain text, not markdown)
- Natural exhibit references
- Formal closing and signature block
- Ready for PDF generation
- CRITICAL: Remove all markdown formatting from output

The letter must:
- Use applicant's U.S. address in top right corner (if provided)
- Include date below address
- Include USCIS filing address on left side below date
- Have proper subject line: "Re: Form I-539 Application to Extend/Change Nonimmigrant Status"
- Address to "U.S. Citizenship and Immigration Services" or "USCIS"
- Merge all provided sections naturally
- Include exhibit references where appropriate
- End with formal closing and signature line

Use ONLY the provided sections. Do NOT add any facts not present in the provided sections. Generate output that is 100% defensible against document audit.`;

  const applicantAddress = data.application.currentAddress
    ? `${data.application.currentAddress.street}\n${data.application.currentAddress.city}, ${data.application.currentAddress.state} ${data.application.currentAddress.zipCode}`
    : "Address not provided";

  const getUSCISAddress = (state?: string) => {
    const defaultAddress = `USCIS
P.O. Box 805887
Chicago, IL 60680-4120`;
    return defaultAddress;
  };

  const uscisAddress = getUSCISAddress(data.application.currentAddress?.state);
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const availableExhibits = getAvailableExhibits(data);
  const exhibitList = availableExhibits.map(e => `Exhibit ${e.letter}: ${e.description}`).join("\n");

  // Build document-only facts for assembler
  const documentFacts: string[] = [];
  // Use passport name (document source) instead of user profile name
  if (data.documents.passport?.name) {
    documentFacts.push(`Name: ${data.documents.passport.name} (from Passport document, See Exhibit A)`);
  } else if (data.documents.i94?.name) {
    documentFacts.push(`Name: ${data.documents.i94.name} (from I-94 document, See Exhibit A)`);
  } else if (data.documents.i20?.studentName) {
    documentFacts.push(`Name: ${data.documents.i20.studentName} (from I-20 document, See Exhibit B)`);
  }
  if (data.application.currentAddress) {
    documentFacts.push(`Address: ${applicantAddress} (from application form)`);
  }

  const userPrompt = `Assemble a complete USCIS cover letter from the following sections.

DOCUMENT-EXTRACTED FACTS (USE ONLY THESE):
${documentFacts.length > 0 ? documentFacts.join("\n") : "No document facts available."}
- Date: ${currentDate} (current date)

USCIS FILING ADDRESS:
${uscisAddress}

AVAILABLE EXHIBITS:
${exhibitList}

LEGAL FRAMEWORK SECTIONS (use as provided, do not add facts):
${JSON.stringify(legalOutput.legal_sections, null, 2)}

FACTS & CONSISTENCY SECTIONS (use as provided, do not add facts):
${JSON.stringify(factsOutput.facts_sections, null, 2)}

${factsOutput.warnings.length > 0 ? `WARNINGS:\n${factsOutput.warnings.join("\n")}\n` : ""}

NARRATIVE SECTIONS (use as provided, do not add facts):
${JSON.stringify(narrativeOutput.narrative_sections, null, 2)}

${data.formData.dependents?.hasDependents && data.formData.dependents.dependents.length > 0 ? `
DEPENDENTS (from application form) - MUST INCLUDE IN COVER LETTER:
${data.formData.dependents.dependents.map((dep, i) => `- Dependent ${i + 1}: ${dep.fullName.toUpperCase()} (${dep.relationship}), Date of Birth: ${dep.dateOfBirth}, Country of Birth: ${dep.countryOfBirth}`).join("\n")}

CRITICAL INSTRUCTIONS FOR DEPENDENTS:
1. You MUST include dependents in the introduction section of the cover letter
2. Use this exact format: "The applicant respectfully submits this cover letter in support of [APPLICANT NAME], the Principal Applicant, and [DEPENDENT NAMES], the Dependent(s), who are requesting a Change of Status (COS) from B-2 (Visitor) to F-1 (Academic Student) and F-2 (Dependent Spouse/Child of Student) nonimmigrant status."
3. Reference dependent documents in Exhibit A (dependent passports, I-94s) and Exhibit B (dependent I-20s)
` : ""}

${data.formData.financialSupport?.sponsorName ? `
SPONSOR INFORMATION (MUST INCLUDE IN FINANCIAL SECTION):
- Sponsor Name: ${data.formData.financialSupport.sponsorName}
${data.formData.financialSupport.sponsorRelationship ? `- Sponsor Relationship: ${data.formData.financialSupport.sponsorRelationship}` : ""}
${data.formData.financialSupport.fundingSource ? `- Funding Source: ${data.formData.financialSupport.fundingSource}` : ""}

CRITICAL INSTRUCTIONS FOR SPONSOR:
1. You MUST include sponsor information in the financial section
2. State sponsor name and relationship
3. If sponsor bank statements are in DOCUMENT-EXTRACTED FACTS above, state the sponsor amount available
4. If sponsor amount is documented, use: "The sponsor, ${data.formData.financialSupport.sponsorName}, has available funds of USD $[AMOUNT] as evidenced by bank statements (Exhibit D)."
5. If sponsor amount is not fully documented, use: "The sponsor, ${data.formData.financialSupport.sponsorName}, will provide financial support to cover the total required amount of USD $[TOTAL_REQUIRED] (Exhibit D)."
6. DO NOT say "must secure financial sponsorship" - state that sponsor WILL provide support
` : ""}

CRITICAL: Only use information explicitly listed above. Do NOT infer, assume, or add any facts not present in the provided sections or document facts.

Assemble a complete, formatted cover letter that:
1. Uses proper business letter format with addresses and date (only if address is provided above)
2. Has subject line: "Re: Form I-539 Application to Extend/Change Nonimmigrant Status"
3. Addresses to "U.S. Citizenship and Immigration Services"
4. Naturally merges all provided sections WITHOUT adding any new facts
5. Includes exhibit references where appropriate (only for exhibits listed above)
6. Confirms all required documents are attached (reference only exhibits listed above)
7. Ends with formal closing and signature line

Return ONLY the complete cover letter text in plain text format (no markdown, no code blocks). Do NOT add any facts not explicitly present in the provided sections.`;

  const result = await callOpenAI(systemPrompt, userPrompt);

  if (!result.success || !result.content) {
    return {
      success: false,
      error: result.error || "Failed to assemble cover letter",
    };
  }

  // Clean up any markdown formatting that might have been added
  let content = result.content.trim();
  if (content.startsWith("```")) {
    content = content.replace(/^```[a-z]*\s*/, "").replace(/\s*```$/, "");
  }

  return { success: true, content };
}

/**
 * Generate Cover Letter using Template-Based System
 */
export async function generateCoverLetter(
  applicationId: string
): Promise<GenerateDocumentResult> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Aggregate application data
    const { success, data, error } = await aggregateApplicationData(applicationId);
    if (!success || !data) {
      return { success: false, error: error || "Failed to aggregate application data" };
    }

    // Validate required data
    const validation = validateRequiredData(data);
    const isTestMode = process.env.DOCUMENT_AI_TEST_MODE === "true";
    
    if (!validation.valid) {
      if (isTestMode) {
        // In test mode, add placeholder data for missing documents
        console.warn(`[TEST MODE] Missing required data: ${validation.missing.join(", ")}. Using placeholder values.`);
        
        if (!data.documents.passport) {
          data.documents.passport = {
            passportNumber: "TEST123456",
            nationality: "Test Country",
            dateOfBirth: "1990-01-01",
            placeOfBirth: "Test City",
            name: "Test Applicant",
          };
        }
        if (!data.documents.i94) {
          data.documents.i94 = {
            dateOfAdmission: "2024-01-15",
            admitUntilDate: "2024-07-15",
            classOfAdmission: "B2",
            admissionNumber: "TEST123456789",
          };
        }
        if (!data.documents.i20) {
          data.documents.i20 = {
            schoolName: "Test University",
            programOfStudy: "Computer Science",
            sevisId: "N0123456789",
            startDate: "2024-08-15",
            programLevel: "Master's",
            majorField: "Computer Science",
            studentName: "Test Applicant",
          };
        }
        if (!data.application.currentAddress) {
          data.application.currentAddress = {
            street: "123 Test Street",
            city: "Test City",
            state: "CA",
            zipCode: "12345",
          };
        }
      } else {
        return {
          success: false,
          error: `Missing required data: ${validation.missing.join(", ")}. Please ensure all required documents are uploaded.`,
        };
      }
    }

    // Import mapper to get schema data
    const { mapToI539Schema } = await import("@/lib/uscis-writing-engine/contracts/mapper");
    const { validateI539Data } = await import("@/lib/uscis-writing-engine/engine/rules");

    // Map aggregated data to I539 schema
    const schemaData = mapToI539Schema(data);

    // Validate schema data
    const validationResult = validateI539Data(schemaData);
    if (!validationResult.valid) {
      return {
        success: false,
        error: `Validation failed: ${validationResult.errors.join(", ")}. ${validationResult.warnings.length > 0 ? "Warnings: " + validationResult.warnings.join(", ") : ""}`,
      };
    }

    // Log warnings if any
    if (validationResult.warnings.length > 0) {
      console.warn("Template validation warnings:", validationResult.warnings);
    }

    // Debug: Log critical data to verify it's being passed correctly
    console.log("[generateCoverLetter] Dependents:", data.formData.dependents);
    console.log("[generateCoverLetter] Sponsor:", data.formData.financialSupport?.sponsorName);
    console.log("[generateCoverLetter] Bank Statements:", data.documents.bankStatements?.length || 0);
    if (data.documents.bankStatements && data.documents.bankStatements.length > 0) {
      console.log("[generateCoverLetter] Bank Statement Details:", data.documents.bankStatements.map((s: any) => ({
        accountHolder: s.accountHolderName,
        closingBalance: s.closingBalance,
        bankName: s.bankName
      })));
    }
    const financialCalc = calculateTotalAvailable(data);
    console.log("[generateCoverLetter] Financial Calc:", {
      personalFunds: financialCalc.personalFunds,
      sponsorAmount: financialCalc.sponsorAmount,
      totalAvailable: financialCalc.totalAvailable,
      bankStatementTotal: financialCalc.bankStatementTotal
    });
    console.log("[generateCoverLetter] Ties to Country:", data.formData.tiesToCountry);

    // Generate cover letter using AI with templates as reference
    const aiResult = await generateCoverLetterWithAIUsingTemplates(data, schemaData);
    
    if (!aiResult.success || !aiResult.content) {
      return {
        success: false,
        error: aiResult.error || "Failed to generate cover letter",
      };
    }

    const finalLetter = aiResult.content;

    // Save to database
    const saveResult = await saveGeneratedDocument(
      applicationId,
      user.id,
      "cover_letter",
      finalLetter
    );

    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true, content: finalLetter };
  } catch (error: any) {
    console.error("Error generating cover letter:", error);
    return { success: false, error: error.message || "Failed to generate cover letter" };
  }
}

/**
 * Generate Personal Statement
 * Now uses the same extracted data as Cover Letter and creates connections between documents
 */
export async function generatePersonalStatement(
  applicationId: string
): Promise<GenerateDocumentResult> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const { success, data, error } = await aggregateApplicationData(applicationId);
    if (!success || !data) {
      return { success: false, error: error || "Failed to aggregate application data" };
    }

    // Get available exhibits for citation (same as Cover Letter)
    const availableExhibits = getAvailableExhibits(data);
    const exhibitCitations = availableExhibits.map(e => `- ${e.citation}`).join("\n");
    const exhibitList = availableExhibits.map(e => `${e.letter}: ${e.description} - ${e.citation}`).join("\n");

    // Use the SAME data context function as Cover Letter for consistency
    const schemaData = {}; // Will be populated if needed
    const dataContext = buildDataContext(data, schemaData);

    // Check if Cover Letter has been generated to reference it
    let coverLetterReference = "";
    try {
      const coverLetterDoc = await getGeneratedDocument(applicationId, "cover_letter");
      if (coverLetterDoc.success && coverLetterDoc.document) {
        const doc = coverLetterDoc.document as any;
        if (doc && doc.content) {
          // Extract key points from cover letter for connection
          const coverLetterContent = doc.content;
          coverLetterReference = `

=====================================
COVER LETTER REFERENCE (FOR CONSISTENCY)
=====================================

A cover letter has already been generated for this application. The Personal Statement MUST:
1. Use the SAME facts and data as the Cover Letter
2. Reference the SAME exhibits with the SAME citations
3. Maintain narrative consistency (same entry date, same school, same program, same financial information)
4. Support and complement the Cover Letter's legal arguments with personal narrative
5. Do NOT contradict any facts stated in the Cover Letter

Key facts from Cover Letter that must be consistent:
${coverLetterContent.substring(0, 1000)}...

CRITICAL: The Personal Statement should expand on the personal motivations and background that SUPPORT the legal arguments made in the Cover Letter, while using the EXACT SAME factual data.`;
        }
      }
    } catch (err) {
      // Cover letter not found or error - continue without reference
      console.log("Cover letter not found, generating standalone personal statement");
    }

    const systemPrompt = `You are a professional visa application assistant. Generate a personal statement for a Form I-539 Change of Status application (B-1/B-2 → F-1).

The Personal Statement serves as a PERSONAL NARRATIVE that complements the formal Cover Letter. It should:
- Be personal, authentic, and compelling
- Use clear, simple English that is easy to understand
- Write in FIRST PERSON ("I", "my")
- Connect with and support the facts presented in the Cover Letter
- Use the EXACT SAME extracted data from documents as the Cover Letter

CRITICAL CONSISTENCY RULES:
1. Use ONLY the data provided in "EXTRACTED APPLICATION DATA" section below
2. Reference the SAME exhibits with the SAME citations as the Cover Letter
3. Maintain consistency with Cover Letter facts (entry date, school, program, financial info, ties)
4. Do NOT contradict any information that may be in the Cover Letter
5. Expand on personal motivations and background that support the legal case

CRITICAL: When you mention any specific information (school name, program details, passport details, financial information, ties to country, entry date, etc.), you MUST cite the corresponding exhibit where the officer can verify this information. Use the format: "(See Exhibit [Letter]: [Description])" immediately after mentioning the information.

CRITICAL LANGUAGE RULES (MANDATORY - NO EXCEPTIONS):
- NEVER use Portuguese terms like "BRASILEIRO(A)", "brasileiro", "Brasil", "brasileira" in the document
- ALWAYS use English: "Brazil" for the country name, "Brazilian" for citizenship
- Use format: "I am a national of Brazil" or "I am from Brazil" or "I am Brazilian"
- NEVER write: "citizen of BRASILEIRO(A)" or "ties to BRASILEIRO(A)" or "national of BRASILEIRO(A)"
- If nationality data contains non-English text, convert it to proper English format
- Use the "Country Name" and "Citizenship" values from EXTRACTED APPLICATION DATA section below
- Example: If data says "Home Country: Brazil", use "Brazil" - NEVER use "BRASILEIRO(A)"

CRITICAL TIES TO HOME COUNTRY RULES (USCIS EVALUATES OBJECTIVE TIES ONLY):
- USCIS does NOT evaluate emotion, subjective feelings, or value judgments - they evaluate: contracts, property, formal obligations, financial dependency, objective ties
- NEVER use emotional or subjective language in ties section:
  ❌ "they are very important to me"
  ❌ "I feel it is my duty"
  ❌ "family is very important in our culture"
  ❌ "I miss", "I love", "I care deeply"
  ❌ "are significant to me" (subjective value judgment)
  ❌ "instilled important values" (subjective/emotional)
  ❌ "sense of purpose" (subjective feeling)
  ❌ "meaningful connection", "deep ties", "cherish", "treasure" (subjective/emotional)
- Use ONLY factual, objective language:
  ✅ "My immediate family members reside in [country]" (factual)
  ✅ "I maintain property ownership in [country]" (verifiable)
  ✅ "I have employment obligations requiring return" (contractual)
  ✅ "I have financial assets in [country]" (objective)
- Focus on verifiable ties that USCIS can objectively evaluate
- Do NOT use: emotional appeals, cultural references, subjective feelings, value judgments`;

    // Build comprehensive user prompt with same data structure as Cover Letter
    const applicantName = data.documents.passport?.name 
      || data.documents.i94?.name 
      || data.documents.i20?.studentName 
      || data.user.fullName 
      || "Applicant";

    const entryDate = data.documents.i94?.dateOfAdmission 
      ? new Date(data.documents.i94.dateOfAdmission).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "Not provided";

    const currentStatus = data.documents.i94?.classOfAdmission 
      ? (data.documents.i94.classOfAdmission.toUpperCase() === "B2" || data.documents.i94.classOfAdmission.toUpperCase() === "WT" ? "B-2" : 
         data.documents.i94.classOfAdmission.toUpperCase() === "B1" || data.documents.i94.classOfAdmission.toUpperCase() === "WB" ? "B-1" : data.documents.i94.classOfAdmission)
      : "Not provided";

    // Sanitize home country to ensure English format
    const rawNationality = data.documents.passport?.nationality || data.application.country || "";
    const homeCountry = getCountryName(rawNationality);
    const citizenship = getCitizenshipAdjective(homeCountry);

    // Format financial information (same as Cover Letter)
    let formattedSavings = "Not provided";
    if (data.formData.financialSupport?.savingsAmount) {
      const savings = data.formData.financialSupport.savingsAmount;
      const cleaned = savings.replace(/[^\d.,]/g, "");
      const numValue = parseFloat(cleaned.replace(/,/g, ""));
      formattedSavings = isNaN(numValue) 
        ? savings 
        : `USD $${numValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }

    // Format question answers for Personal Statement with improved narrative guidance
    const formatQuestionAnswersForPersonalStatement = (
      questionAnswers?: AggregatedApplicationData["questionAnswers"],
      data?: AggregatedApplicationData
    ): string => {
      if (!questionAnswers || questionAnswers.length === 0) {
        return "";
      }

      // Map to Personal Statement sections
      const stepToPersonalStatementSection: Record<number, string> = {
        1: 'Entry and Change of Circumstances',
        2: 'Entry and Change of Circumstances',
        3: 'Educational and Career Goals',
        4: 'Educational and Career Goals',
        5: 'Educational and Career Goals',
        6: 'Future Plans and Return Intent',
        7: 'Financial Ability',
      };

      // Group by step
      const byStep: Record<number, Array<typeof questionAnswers[0]>> = {};
      questionAnswers.forEach((qa) => {
        if (!byStep[qa.stepNumber]) {
          byStep[qa.stepNumber] = [];
        }
        byStep[qa.stepNumber].push(qa);
      });

      const sections: string[] = [];
      sections.push("\n=====================================");
      sections.push("APPLICANT QUESTIONNAIRE RESPONSES FOR PERSONAL STATEMENT");
      sections.push("=====================================");
      sections.push("\nCRITICAL INSTRUCTIONS:");
      sections.push("- Use these responses to create a compelling, authentic PERSONAL narrative");
      sections.push("- Write in FIRST PERSON (\"I\", \"my\", \"me\") - this is a personal statement");
      sections.push("- Use answers to tell YOUR story, not just repeat facts");
      sections.push("- Connect your personal journey with the legal facts in the Cover Letter");
      sections.push("- Be specific, authentic, and personal while maintaining professionalism");
      
      // Step 1: Original Intent
      if (byStep[1]) {
        sections.push(`\n=== STEP 1: ORIGINAL INTENT (USE IN: Entry and Change of Circumstances) ===`);
        sections.push(`NARRATIVE PURPOSE: Explain your genuine original intent when entering the U.S.`);
        sections.push(`TONE: Personal, authentic, showing the contrast between original intent and current decision`);
        byStep[1].forEach((qa) => {
          sections.push(`\nQuestion: ${qa.questionText}`);
          sections.push(`Selected Option: ${qa.selectedOption}`);
          sections.push(`Your Answer: ${qa.answerText}`);
          sections.push(`Context: ${qa.aiPromptContext}`);
          sections.push(`HOW TO USE: Write in first person about your original tourist/recreational intent.`);
          sections.push(`Example: "When I entered the United States on [entry date], my objective was exclusively touristic..."`);
        });
      }

      // Step 2: Decision Evolution
      if (byStep[2]) {
        sections.push(`\n=== STEP 2: DECISION EVOLUTION (USE IN: Entry and Change of Circumstances) ===`);
        sections.push(`NARRATIVE PURPOSE: Tell the story of how your decision to study arose naturally during your stay`);
        sections.push(`TONE: Reflective, showing the organic evolution of your thinking`);
        byStep[2].forEach((qa) => {
          sections.push(`\nQuestion: ${qa.questionText}`);
          sections.push(`Selected Option: ${qa.selectedOption}`);
          sections.push(`Your Answer: ${qa.answerText}`);
          sections.push(`Context: ${qa.aiPromptContext}`);
          sections.push(`HOW TO USE: Describe the moment or experience that sparked your interest. Make it personal and specific.`);
          sections.push(`Example: "During my stay, I had the opportunity to [specific experience]. This experience made me realize..."`);
        });
      }

      // Step 3: Academic Interest
      if (byStep[3]) {
        sections.push(`\n=== STEP 3: ACADEMIC INTEREST (USE IN: Educational and Career Goals) ===`);
        sections.push(`NARRATIVE PURPOSE: Explain what specifically triggered your academic interest`);
        sections.push(`TONE: Enthusiastic but professional, showing genuine interest`);
        byStep[3].forEach((qa) => {
          sections.push(`\nQuestion: ${qa.questionText}`);
          sections.push(`Selected Option: ${qa.selectedOption}`);
          sections.push(`Your Answer: ${qa.answerText}`);
          sections.push(`Context: ${qa.aiPromptContext}`);
          sections.push(`HOW TO USE: Connect your interest with the specific program. Reference the institution and program from I-20 (Exhibit B).`);
          sections.push(`Example: "I was particularly impressed by [specific aspect]. This led me to research programs, and I found that [School Name] offers..."`);
        });
      }

      // Step 4: Institution Selection
      if (byStep[4]) {
        sections.push(`\n=== STEP 4: INSTITUTION SELECTION (USE IN: Educational and Career Goals) ===`);
        sections.push(`NARRATIVE PURPOSE: Explain why you chose this specific institution and program`);
        sections.push(`TONE: Thoughtful, showing careful consideration`);
        byStep[4].forEach((qa) => {
          sections.push(`\nQuestion: ${qa.questionText}`);
          sections.push(`Selected Option: ${qa.selectedOption}`);
          sections.push(`Your Answer: ${qa.answerText}`);
          sections.push(`Context: ${qa.aiPromptContext}`);
          sections.push(`HOW TO USE: Reference the specific institution name and program from I-20 (Exhibit B). Explain your selection criteria.`);
          sections.push(`Example: "After careful research, I selected [School Name] because [your criteria]. The [program name] program aligns perfectly with..."`);
        });
      }

      // Step 5: Professional Coherence
      if (byStep[5]) {
        sections.push(`\n=== STEP 5: PROFESSIONAL COHERENCE (USE IN: Educational and Career Goals) ===`);
        sections.push(`NARRATIVE PURPOSE: Show how the program fits your professional trajectory`);
        sections.push(`TONE: Professional, forward-looking`);
        byStep[5].forEach((qa) => {
          sections.push(`\nQuestion: ${qa.questionText}`);
          sections.push(`Selected Option: ${qa.selectedOption}`);
          sections.push(`Your Answer: ${qa.answerText}`);
          sections.push(`Context: ${qa.aiPromptContext}`);
          sections.push(`HOW TO USE: Connect your professional background/plans with the program. Show the logical progression.`);
          sections.push(`Example: "My professional experience in [field] has prepared me for this program. Upon completion, I plan to..."`);
        });
      }

      // Step 6: Planning
      if (byStep[6]) {
        sections.push(`\n=== STEP 6: PLANNING (USE IN: Future Plans and Return Intent) ===`);
        sections.push(`NARRATIVE PURPOSE: Show maturity, preparation, and clear plans for return`);
        sections.push(`TONE: Responsible, showing thoughtful planning`);
        byStep[6].forEach((qa) => {
          sections.push(`\nQuestion: ${qa.questionText}`);
          sections.push(`Selected Option: ${qa.selectedOption}`);
          sections.push(`Your Answer: ${qa.answerText}`);
          sections.push(`Context: ${qa.aiPromptContext}`);
          sections.push(`HOW TO USE: Demonstrate your planning and preparation. Connect with your return intent and ties to home country.`);
          sections.push(`Example: "I have carefully planned my studies, ensuring I have [resources/plans]. After completing my program, I will return to [country] to..."`);
        });
      }

      // Step 7: Financial Support
      if (byStep[7]) {
        sections.push(`\n=== STEP 7: FINANCIAL SUPPORT (USE IN: Financial Ability) ===`);
        sections.push(`NARRATIVE PURPOSE: Explain your financial planning and ability`);
        sections.push(`TONE: Responsible, showing financial preparedness`);
        byStep[7].forEach((qa) => {
          sections.push(`\nQuestion: ${qa.questionText}`);
          sections.push(`Selected Option: ${qa.selectedOption}`);
          sections.push(`Your Answer: ${qa.answerText}`);
          sections.push(`Context: ${qa.aiPromptContext}`);
          sections.push(`HOW TO USE: Reference your financial documents (Exhibit D) and explain your financial planning.`);
          sections.push(`Example: "I have carefully planned my finances to cover all costs. My bank statements (Exhibit D) show..."`);
        });
      }

      sections.push(`\n=== PERSONAL STATEMENT WRITING TIPS ===`);
      sections.push(`1. Use FIRST PERSON throughout (\"I\", \"my\", \"me\")`);
      sections.push(`2. Be specific with dates, names, and experiences`);
      sections.push(`3. Tell a story that connects your personal journey with the legal facts`);
      sections.push(`4. Show authenticity and genuine interest`);
      sections.push(`5. Maintain professional tone while being personal`);
      sections.push(`6. Reference exhibits when mentioning documents`);
      sections.push(`7. Connect your narrative with the Cover Letter's legal arguments`);

      return sections.join("\n");
    };

    const questionAnswersSection = formatQuestionAnswersForPersonalStatement(data.questionAnswers, data);

    const userPrompt = `Generate a personal statement for a Form I-539 Change of Status application (${currentStatus} → F-1).

${coverLetterReference}

=====================================
EXTRACTED APPLICATION DATA (USE THESE EXACT FACTS - SAME AS COVER LETTER)
=====================================

${dataContext}

Available Exhibits:
${exhibitList}

${questionAnswersSection ? `
${questionAnswersSection}

CRITICAL INSTRUCTIONS FOR USING QUESTIONNAIRE RESPONSES IN PERSONAL STATEMENT:
1. FIRST PERSON NARRATIVE: Convert all answers to first person (\"I\", \"my\", \"me\") - this is YOUR personal story
2. TARGET SECTIONS: Each response has a \"USE IN\" field - use the answer in that specific section of the Personal Statement
3. NARRATIVE PURPOSE: The \"NARRATIVE PURPOSE\" tells you what story to tell with this answer
4. TONE: Follow the \"TONE\" guidance for each section to maintain appropriate style
5. HOW TO USE: Follow the specific \"HOW TO USE\" instructions and examples for each answer
6. BE SPECIFIC: Use specific dates, names, and experiences from your answers
7. CONNECT WITH DOCUMENTS: Reference exhibits when mentioning documents (e.g., \"As shown in my I-20 (See Exhibit B: SEVIS and School Documents)...\")
8. AUTHENTICITY: Make it personal and authentic - tell YOUR story, not just repeat facts
9. CONSISTENCY: Ensure your personal narrative aligns with the Cover Letter's legal facts
10. NO REPETITION: Do NOT simply repeat what's in the Cover Letter - expand on personal motivations and background

EXAMPLE OF PROPER USAGE:
- Document Fact: "Entry Date: January 15, 2024 (from I-94, Exhibit A)"
- Questionnaire Answer: "My objective was exclusively touristic..."
- Personal Statement Usage: "When I entered the United States on January 15, 2024 (See Exhibit A: Identification and Status Documents), my objective was exclusively touristic. I had planned to explore historical sites and experience the local culture during my vacation period. However, during my stay, something unexpected happened..."

` : ""}

=====================================
PERSONAL STATEMENT REQUIREMENTS
=====================================

Generate a personal statement (500-800 words) that:

1. **Introduction and Background**
   - Introduce yourself using your name: ${applicantName}
   ${data.formData.dependents?.hasDependents && data.formData.dependents.dependents.length > 0 ? `
   - CRITICAL: You MUST mention your dependents in the introduction
   - Dependents: ${data.formData.dependents.dependents.map(d => d.fullName).join(", ")}
   - Use format: "My name is ${applicantName}, and I am a national of ${homeCountry}. ${data.formData.dependents.dependents.length === 1 ? 'My dependent' : 'My dependents'}, ${data.formData.dependents.dependents.map(d => d.fullName).join(" and ")}, ${data.formData.dependents.dependents.length === 1 ? 'is' : 'are'} also included in this application (See Exhibit A: Identification and Status Documents for dependent documents)."
   ` : ""}
   - Mention your nationality: ${homeCountry} (See Exhibit A: Identification and Status Documents)
   - Use format: "I am a national of ${homeCountry}" or "I am ${citizenship}" or "I am from ${homeCountry}"
   - CRITICAL: NEVER use Portuguese terms like "BRASILEIRO(A)" - ALWAYS use "${homeCountry}" or "${citizenship}"
   - Provide brief personal background

2. **Entry and Change of Circumstances**
   - Explain that you entered the United States on ${entryDate} (See Exhibit A: Identification and Status Documents)
   - State your current status: ${currentStatus} (See Exhibit A: Identification and Status Documents)
   - Describe how your decision to pursue studies arose AFTER your entry
   - Explain the change in circumstances that led to this decision
   - This should align with the Cover Letter's explanation of post-entry intent

3. **Educational and Career Goals**
   ${data.documents.i20 ? `
   - Explain your interest in studying at ${data.documents.i20.schoolName} (See Exhibit B: SEVIS and School Documents)
   - Describe the program: ${data.documents.i20.programOfStudy} (See Exhibit B: SEVIS and School Documents)
   - Explain how this ${data.documents.i20.programLevel || "program"} aligns with your career goals
   - Describe how this education will benefit your future in your home country
   ` : "- Explain your educational and career goals"}

4. **Financial Ability**
   CRITICAL: USCIS requires demonstration of TUITION + LIVING EXPENSES for F-1 status
   ${data.documents.i20?.financialSupport ? `
   - Reference I-20 financial support requirements: ${data.documents.i20.financialSupport} (See Exhibit B: SEVIS and School Documents)
   - The I-20 shows total required: tuition + living expenses
   ` : `
   - Reference I-20 financial support requirements (See Exhibit B: SEVIS and School Documents)
   - The I-20 shows total required: tuition + living expenses
   `}
   ${formattedSavings !== "Not provided" ? `
   - Mention your personal financial resources: ${formattedSavings} (from bank statements, See Exhibit D: Proof of Financial Ability)
   - Demonstrate that your funds cover: tuition + living expenses (from I-20, Exhibit B)
   ` : "- Explain your financial ability to cover tuition + living expenses"}
   ${data.formData.financialSupport?.sponsorName ? `
   - CRITICAL: You MUST mention your sponsor by name in the financial section
   - Sponsor Name: ${data.formData.financialSupport.sponsorName}
   ${data.formData.financialSupport.sponsorRelationship ? `- Sponsor Relationship: ${data.formData.financialSupport.sponsorRelationship}` : ""}
   - Use format: "I have additional financial support from my sponsor, ${data.formData.financialSupport.sponsorName}${data.formData.financialSupport.sponsorRelationship ? ` (${data.formData.financialSupport.sponsorRelationship})` : ""}, who has committed to covering [tuition/living expenses/both] (See Exhibit D: Proof of Financial Ability)."
   - State what the sponsor covers (tuition, living expenses, or both) (See Exhibit D: Proof of Financial Ability)
   ` : ""}
   - If your funds exceed the total required, mention the buffer

5. **Ties to Home Country and Return Intent**
   CRITICAL: USCIS evaluates OBJECTIVE TIES only (contracts, property, formal obligations, financial dependency)
   - NEVER use emotional or subjective language:
     ❌ "they are very important to me"
     ❌ "I feel it is my duty"
     ❌ "family is very important in our culture"
     ❌ "I miss", "I love", "I care deeply"
     ❌ "are significant to me" (subjective value judgment)
     ❌ "instilled important values" (subjective/emotional)
     ❌ "sense of purpose" (subjective feeling)
     ❌ "meaningful connection", "deep ties", "cherish", "treasure" (subjective/emotional)
   - Use ONLY factual, objective language:
     ✅ "My immediate family members reside in [country]" (factual statement)
     ✅ "I maintain property ownership in [country]" (verifiable)
     ✅ "I have employment obligations requiring my return" (contractual)
     ✅ "I have financial assets maintained in [country]" (objective)
   - Do NOT include value judgments, subjective feelings, or emotional appeals
   ${data.formData.tiesToCountry?.question1 ? `
   - Family ties: Convert emotional language to factual statements. Use: "My [family members] reside in [location]" NOT "they are very important to me"
   - Reference: ${data.formData.tiesToCountry.question1.substring(0, 300)} (See Exhibit C: Purpose of Study and Nonimmigrant Intent / Ties to Home Country)
   ` : ""}
   ${data.formData.tiesToCountry?.question2 ? `
   - Assets/property: State ownership facts. Use: "I own [property type] in [location]" NOT "I feel it is my duty"
   - Reference: ${data.formData.tiesToCountry.question2.substring(0, 300)} (See Exhibit C: Purpose of Study and Nonimmigrant Intent / Ties to Home Country)
   ` : ""}
   ${data.formData.tiesToCountry?.question3 ? `
   - Employment/professional ties: State contractual obligations. Use: "I have employment obligations" NOT emotional statements
   - Reference: ${data.formData.tiesToCountry.question3.substring(0, 300)} (See Exhibit C: Purpose of Study and Nonimmigrant Intent / Ties to Home Country)
   ` : ""}
   - State objective return intent based on verifiable ties (contracts, property, obligations)
   - CRITICAL: When mentioning your home country, ALWAYS use "${homeCountry}" - NEVER use Portuguese terms like "BRASILEIRO(A)"
   - Explain how your studies will benefit your career in ${homeCountry}

6. **Conclusion**
   - Summarize your commitment to maintaining F-1 status (this is acceptable as it refers to legal compliance)
   - State objective return intent based on verifiable ties (contracts, property, obligations) - NOT emotional statements
   - Express gratitude for consideration

=====================================
CRITICAL CITATION RULES (MUST MATCH COVER LETTER)
=====================================

- When you mention the school name, program, or any I-20 details → Cite: (See Exhibit B: SEVIS and School Documents)
- When you mention passport information, nationality, place of birth, I-94, entry date, or current status → Cite: (See Exhibit A: Identification and Status Documents)
- When you mention financial support, funding, bank statements, tax returns, investments, or sponsor letters → Cite: (See Exhibit D: Proof of Financial Ability)
- When you mention ties to country, family, property, employment, or purpose of study → Cite: (See Exhibit C: Purpose of Study and Nonimmigrant Intent / Ties to Home Country)
- Always place the citation immediately after the mentioned information, in parentheses

=====================================
WRITING STYLE
=====================================

- Write in FIRST PERSON (\"I\", \"my\", \"me\") - NEVER use third person
- Use clear, simple English
- Be personal and authentic
- Be specific with dates, names, and facts from the extracted data
- Maintain formal but personal tone
- Connect your personal story to the legal facts in the Cover Letter
- Do NOT use emotional language or make guarantees
- Do NOT claim eligibility or guarantee approval

CRITICAL FORMATTING RULES:
- Output MUST be plain text only
- NO markdown formatting (NO **, NO -, NO #, NO backticks)
- NO bullet points
- NO emojis (NO checkmarks, X marks, warning symbols, etc.)
- Use regular paragraphs only
- Use proper spacing between paragraphs

CRITICAL TIES TO HOME COUNTRY RULES:
- USCIS evaluates OBJECTIVE TIES only: contracts, property, formal obligations, financial dependency
- NEVER use emotional or subjective language in ties section:
  ❌ "they are very important to me"
  ❌ "I feel it is my duty"
  ❌ "family is very important in our culture"
  ❌ "I miss", "I love", "I care deeply"
  ❌ "are significant to me" (subjective value judgment)
  ❌ "instilled important values" (subjective/emotional)
  ❌ "sense of purpose" (subjective feeling)
  ❌ "meaningful connection", "deep ties", "cherish", "treasure" (subjective/emotional)
- Use ONLY factual, objective language:
  ✅ "My immediate family members reside in [country]" (factual)
  ✅ "I maintain property ownership in [country]" (verifiable)
  ✅ "I have employment obligations requiring return" (contractual)
  ✅ "I have financial assets in [country]" (objective)
- Focus on verifiable ties that USCIS can objectively evaluate
- Do NOT use: emotional appeals, cultural references, subjective feelings, value judgments

CRITICAL LANGUAGE RULES (MANDATORY):
- NEVER use Portuguese terms like "BRASILEIRO(A)", "brasileiro", "Brasil", "brasileira" in the document
- ALWAYS use English: "${homeCountry}" for the country name, "${citizenship}" for citizenship
- Use format: "I am a national of ${homeCountry}" or "I am from ${homeCountry}" or "I am ${citizenship}"
- NEVER write: "citizen of BRASILEIRO(A)" or "ties to BRASILEIRO(A)" or "national of BRASILEIRO(A)"
- If you see any non-English country name in the data, convert it to "${homeCountry}"

Generate the complete personal statement now.`;

    const result = await callOpenAI(systemPrompt, userPrompt);
    if (!result.success || !result.content) {
      return result;
    }

    // Clean markdown formatting
    let content = result.content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/^```[a-z]*\s*/, "").replace(/\s*```$/, "");
    }
    content = cleanMarkdownFormatting(content);

    const saveResult = await saveGeneratedDocument(
      applicationId,
      user.id,
      "personal_statement",
      content
    );

    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true, content };
  } catch (error: any) {
    console.error("Error generating personal statement:", error);
    return { success: false, error: error.message || "Failed to generate personal statement" };
  }
}

/**
 * Generate Program Justification
 */
export async function generateProgramJustification(
  applicationId: string
): Promise<GenerateDocumentResult> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const { success, data, error } = await aggregateApplicationData(applicationId);
    if (!success || !data) {
      return { success: false, error: error || "Failed to aggregate application data" };
    }

    if (!data.documents.i20) {
      return { success: false, error: "I-20 document is required to generate program justification" };
    }

    const systemPrompt = `You are a professional visa application assistant. Generate a program justification letter that explains why the applicant chose this specific program and how it aligns with their career goals.`;

    const userPrompt = `Generate a program justification letter for a ${data.application.visaType} application.

Program Information:
- School: ${data.documents.i20.schoolName || "Not provided"}
- Program: ${data.documents.i20.programOfStudy || "Not provided"}
- Level: ${data.documents.i20.programLevel || "Not provided"}
- Major Field: ${data.documents.i20.majorField || "Not provided"}
- Start Date: ${data.documents.i20.startDate || "Not provided"}
- End Date: ${data.documents.i20.endDate || "Not provided"}

Applicant Information:
- Name: ${data.user.fullName || data.user.firstName || "Applicant"}
${data.documents.passport ? `- Nationality: ${data.documents.passport.nationality || "Not provided"}` : ""}

Generate a program justification letter (400-600 words) that:
1. Explains why this specific program was chosen
2. Describes how the program aligns with the applicant's career goals
3. Explains what the applicant hopes to learn and achieve
4. Describes how this education will benefit their future career
5. Explains why this program is better than similar programs in their home country
6. Shows the applicant's commitment and preparation for this program

Write in first person, use clear and professional English.`;

    const result = await callOpenAI(systemPrompt, userPrompt);
    if (!result.success || !result.content) {
      return result;
    }

    const saveResult = await saveGeneratedDocument(
      applicationId,
      user.id,
      "program_justification",
      result.content
    );

    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true, content: result.content };
  } catch (error: any) {
    console.error("Error generating program justification:", error);
    return { success: false, error: error.message || "Failed to generate program justification" };
  }
}

/**
 * Generate Ties to Home Country Document
 */
export async function generateTiesToCountry(
  applicationId: string
): Promise<GenerateDocumentResult> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const { success, data, error } = await aggregateApplicationData(applicationId);
    if (!success || !data) {
      return { success: false, error: error || "Failed to aggregate application data" };
    }

    if (!data.formData.tiesToCountry) {
      return { success: false, error: "Ties to Country information is required" };
    }

    const systemPrompt = `You are a professional visa application assistant. Generate a comprehensive document explaining the applicant's ties to their home country. This is a critical document for visa approval.`;

    const userPrompt = `Generate a comprehensive "Ties to Home Country" document for a ${data.application.visaType} application.

Applicant Information:
- Name: ${data.user.fullName || data.user.firstName || "Applicant"}
${data.documents.passport ? `- Nationality: ${data.documents.passport.nationality || "Not provided"}` : ""}
${data.documents.passport ? `- Place of Birth: ${data.documents.passport.placeOfBirth || "Not provided"}` : ""}

Ties to Home Country (from application):
${data.formData.tiesToCountry.question1 ? `Family Ties:
${data.formData.tiesToCountry.question1}` : ""}

${data.formData.tiesToCountry.question2 ? `Property and Assets:
${data.formData.tiesToCountry.question2}` : ""}

${data.formData.tiesToCountry.question3 ? `Employment and Business Commitments:
${data.formData.tiesToCountry.question3}` : ""}

${data.documents.tiesDocuments && data.documents.tiesDocuments.length > 0 ? `
Supporting Documents:
${data.documents.tiesDocuments.map((doc, i) => `
Document ${i + 1}:
- Type: ${doc.documentType || "Not specified"}
${doc.propertyAddress ? `- Property Address: ${doc.propertyAddress}` : ""}
${doc.propertyValue ? `- Property Value: ${doc.propertyValue}` : ""}
${doc.employmentCompany ? `- Employer: ${doc.employmentCompany}` : ""}
${doc.employmentPosition ? `- Position: ${doc.employmentPosition}` : ""}
`).join("\n")}` : ""}

${data.documents.assets && data.documents.assets.length > 0 ? `
Assets:
${data.documents.assets.map((asset, i) => `
Asset ${i + 1}:
- Type: ${asset.assetType || "Not specified"}
${asset.assetDescription ? `- Description: ${asset.assetDescription}` : ""}
${asset.assetValue ? `- Value: ${asset.assetValue}` : ""}
`).join("\n")}` : ""}

Generate a comprehensive document (600-1000 words) that:
1. Introduces the applicant and their background
2. Details their family ties to their home country
3. Describes their property and financial assets
4. Explains their employment and business commitments
5. Demonstrates their intention to return after completing their studies/work
6. Provides a strong case for their ties to their home country

Write in first person, use clear and professional English. This document is critical for visa approval.`;

    const result = await callOpenAI(systemPrompt, userPrompt);
    if (!result.success || !result.content) {
      return result;
    }

    const saveResult = await saveGeneratedDocument(
      applicationId,
      user.id,
      "ties_to_country",
      result.content
    );

    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true, content: result.content };
  } catch (error: any) {
    console.error("Error generating ties to country document:", error);
    return { success: false, error: error.message || "Failed to generate ties to country document" };
  }
}

/**
 * Generate Sponsor Letter
 */
export async function generateSponsorLetter(
  applicationId: string
): Promise<GenerateDocumentResult> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const { success, data, error } = await aggregateApplicationData(applicationId);
    if (!success || !data) {
      return { success: false, error: error || "Failed to aggregate application data" };
    }

    if (!data.formData.financialSupport || data.formData.financialSupport.fundingSource !== "sponsor") {
      return { success: false, error: "Sponsor information is required to generate sponsor letter" };
    }

    const sponsor = data.formData.financialSupport;

    const systemPrompt = `You are a professional visa application assistant. Generate a formal sponsor letter for a visa application. The letter should be from the sponsor's perspective and demonstrate their commitment to supporting the applicant.`;

    const userPrompt = `Generate a sponsor letter for a ${data.application.visaType} application.

Sponsor Information:
- Name: ${sponsor.sponsorName || "Not provided"}
- Relationship to Applicant: ${sponsor.sponsorRelationship || "Not provided"}
${sponsor.sponsorAddress ? `- Address: ${sponsor.sponsorAddress.street}, ${sponsor.sponsorAddress.city}, ${sponsor.sponsorAddress.state} ${sponsor.sponsorAddress.zipCode}, ${sponsor.sponsorAddress.country}` : ""}
${sponsor.annualIncome ? `- Annual Income: ${sponsor.annualIncome}` : ""}
${sponsor.savingsAmount ? `- Savings: ${sponsor.savingsAmount}` : ""}

Applicant Information:
- Name: ${data.user.fullName || data.user.firstName || "Applicant"}
${data.documents.i20 ? `- Program: ${data.documents.i20.programOfStudy || "Not provided"} at ${data.documents.i20.schoolName || "Not provided"}` : ""}
${data.documents.i20 ? `- Duration: ${data.documents.i20.startDate || "Not provided"} to ${data.documents.i20.endDate || "Not provided"}` : ""}

${data.documents.bankStatements && data.documents.bankStatements.length > 0 ? `
Sponsor's Financial Information:
${data.documents.bankStatements.map((stmt, i) => `
Bank Statement ${i + 1}:
- Bank: ${stmt.bankName || "Not provided"}
- Account Holder: ${stmt.accountHolderName || "Not provided"}
- Balance: ${stmt.closingBalance || "Not provided"} ${stmt.currency || ""}
`).join("\n")}` : ""}

Generate a formal sponsor letter (400-600 words) that:
1. Is written from the sponsor's perspective (first person: "I")
2. Introduces the sponsor and their relationship to the applicant
3. Expresses the sponsor's commitment to financially support the applicant
4. Details the sponsor's financial capacity to provide support
5. Explains why the sponsor is willing to support the applicant
6. Confirms that the sponsor will cover all expenses during the applicant's stay
7. Provides sponsor's contact information
8. Includes a formal closing with space for signature

Format as a formal business letter. The letter should be professional and demonstrate the sponsor's genuine commitment.`;

    const result = await callOpenAI(systemPrompt, userPrompt);
    if (!result.success || !result.content) {
      return result;
    }

    const saveResult = await saveGeneratedDocument(
      applicationId,
      user.id,
      "sponsor_letter",
      result.content
    );

    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true, content: result.content };
  } catch (error: any) {
    console.error("Error generating sponsor letter:", error);
    return { success: false, error: error.message || "Failed to generate sponsor letter" };
  }
}

/**
 * Helper function to extract exhibit letters mentioned in a document
 * Finds all references to "Exhibit [Letter]" in various formats:
 * - "Exhibit A"
 * - "(Exhibit A)"
 * - "See Exhibit A"
 * - "Exhibit A:", "Exhibit A.", "Exhibit A,"
 * - "Exhibit A and B" (matches A; B matched if "Exhibit B" appears)
 * - Letters A–Z (not only A–J)
 */
function extractExhibitsFromText(text: string): Set<string> {
  // Match "Exhibit" + letter (a–z) with optional trailing punctuation or " and "
  const exhibitPattern = /exhibit\s+([a-z])(?:\s*[.,:\)\]]|\s+and\s|$)/gi;
  const matches = text.matchAll(exhibitPattern);
  const exhibits = new Set<string>();
  for (const match of matches) {
    exhibits.add(match[1].toUpperCase());
  }
  // Also catch "Exhibit X and Y" for Y: e.g. "Exhibit A and B" -> need B
  const andPattern = /exhibit\s+[a-z]\s+and\s+([a-z])(?:\s*[.,:\)\]]|$)/gi;
  for (const m of text.matchAll(andPattern)) {
    exhibits.add(m[1].toUpperCase());
  }
  return exhibits;
}

/**
 * Standardized exhibit descriptions mapping
 */
const EXHIBIT_DESCRIPTIONS: Record<string, string> = {
  A: "Identification and Status Documents",
  B: "SEVIS and School Documents",
  C: "Purpose of Study and Nonimmigrant Intent / Ties to Home Country",
  D: "Proof of Financial Ability",
  E: "Additional Supporting Documents",
  F: "Additional Supporting Documents",
  G: "Additional Supporting Documents",
  H: "Additional Supporting Documents",
  I: "Additional Supporting Documents",
  J: "Additional Supporting Documents",
};

/**
 * Generate Exhibit List
 * Now generates based on exhibits mentioned in Cover Letter and Personal Statement
 * Standardized exhibit categories:
 * - Exhibit A: Identification and Status Documents (Passports, B-1 visa, I-94, Marriage certificate, Birth certificate)
 * - Exhibit B: SEVIS and School Documents (SEVIS I-901, I-20 (F-1), I-20 (F-2), Official letter of acceptance)
 * - Exhibit C: Purpose of Study and Nonimmigrant Intent / Ties to Home Country
 * - Exhibit D: Proof of Financial Ability (Bank statements, Tax income, Investments, Sponsor letter, etc.)
 */
export async function generateExhibitList(
  applicationId: string
): Promise<GenerateDocumentResult> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const supabase = createAdminClient();
    
    // Get Cover Letter and Personal Statement content
    const [coverLetterDoc, personalStatementDoc] = await Promise.all([
      getGeneratedDocument(applicationId, "cover_letter"),
      getGeneratedDocument(applicationId, "personal_statement"),
    ]);

    const mentionedExhibits = new Set<string>();

    // Extract exhibits from Cover Letter
    if (coverLetterDoc.success && coverLetterDoc.document) {
      const coverLetterContent = (coverLetterDoc.document as any).content || "";
      const coverLetterExhibits = extractExhibitsFromText(coverLetterContent);
      coverLetterExhibits.forEach(letter => mentionedExhibits.add(letter));
    }

    // Extract exhibits from Personal Statement
    if (personalStatementDoc.success && personalStatementDoc.document) {
      const personalStatementContent = (personalStatementDoc.document as any).content || "";
      const personalStatementExhibits = extractExhibitsFromText(personalStatementContent);
      personalStatementExhibits.forEach(letter => mentionedExhibits.add(letter));
    }

    // If no exhibits found in documents, fall back to checking available documents
    if (mentionedExhibits.size === 0) {
      const { success, data, error } = await aggregateApplicationData(applicationId);
      if (!success || !data) {
        return { success: false, error: error || "Failed to aggregate application data" };
      }

      // Fallback: Check for documents and add corresponding exhibits
      // Exhibit A: Identification and Status Documents
      const hasIdDocs = 
        data.documents.passport || 
        data.documentList?.some((d: any) => d.type === "passport" || d.type === "dependent_passport") ||
        data.documents.i94 || 
        data.documentList?.some((d: any) => d.type === "i94" || d.type === "dependent_i94") ||
        data.documentList?.some((d: any) => d.type === "marriage_certificate" || d.type === "birth_certificate" || d.type === "visa" || d.type === "b1_visa");
      
      if (hasIdDocs) {
        mentionedExhibits.add("A");
      }

      // Exhibit B: SEVIS and School Documents
      const hasSchoolDocs = 
        data.documents.i20 || 
        data.documentList?.some((d: any) => d.type === "i20" || d.type === "dependent_i20" || d.type === "sevis_receipt" || d.type === "acceptance_letter" || d.type === "i20_f2");
      
      if (hasSchoolDocs) {
        mentionedExhibits.add("B");
      }

      // Exhibit C: Purpose of Study and Nonimmigrant Intent / Ties to Home Country
      const hasTiesDocs = 
        (data.documents.tiesDocuments && data.documents.tiesDocuments.length > 0) ||
         data.formData.tiesToCountry ||
         data.documentList?.some((d: any) => d.type === "supporting_documents" || d.type === "ties_documents" || d.type === "purpose_of_study");
      
      if (hasTiesDocs) {
        mentionedExhibits.add("C");
      }

      // Exhibit D: Proof of Financial Ability
      const hasFinancialDocs = 
        data.formData.financialSupport ||
        (data.documents.bankStatements && data.documents.bankStatements.length > 0) ||
        (data.documents.assets && data.documents.assets.length > 0) ||
        data.documentList?.some((d: any) => 
          d.type === "bank_statement" || 
          d.type === "sponsor_bank_statement" || 
          d.type === "assets" || 
          d.type === "sponsor_assets" ||
          d.type === "scholarship_document" ||
          d.type === "other_funding" ||
          d.type === "tax_return" ||
          d.type === "sponsor_letter" ||
          d.type === "investment"
        );
      
      if (hasFinancialDocs) {
        mentionedExhibits.add("D");
      }
    }

    // Build exhibit list from mentioned exhibits (sorted alphabetically)
    const exhibits: Array<{ letter: string; description: string }> = [];
    const sortedLetters = Array.from(mentionedExhibits).sort();
    
    for (const letter of sortedLetters) {
      const description = EXHIBIT_DESCRIPTIONS[letter] || "Additional Supporting Documents";
      exhibits.push({ letter, description });
    }

    // If no exhibits found at all, return error
    if (exhibits.length === 0) {
      return { 
        success: false, 
        error: "No exhibits found in Cover Letter or Personal Statement. Please generate these documents first, or ensure they reference exhibits." 
      };
    }

    // Generate the formatted exhibit list
    const currentDate = new Date().toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });

    const exhibitListContent = `EXHIBIT LIST

${exhibits.map((exhibit) => `Exhibit ${exhibit.letter}: ${exhibit.description}`).join("\n")}

Generated: ${currentDate}`;

    const saveResult = await saveGeneratedDocument(
      applicationId,
      user.id,
      "exhibit_list",
      exhibitListContent
    );

    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true, content: exhibitListContent };
  } catch (error: any) {
    console.error("Error generating exhibit list:", error);
    return { success: false, error: error.message || "Failed to generate exhibit list" };
  }
}

/**
 * Get all generated documents for an application
 */
export async function getGeneratedDocuments(applicationId: string) {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const supabase = createAdminClient();

    // Verify application belongs to user
    const { data: application, error: appError } = await (supabase
      .from("applications") as any)
      .select("user_id")
      .eq("id", applicationId)
      .single();

    if (appError || !application || application.user_id !== user.id) {
      return { success: false, error: "Application not found or unauthorized" };
    }

    // Get current versions of all generated documents
    const { data: documents, error: docsError } = await (supabase
      .from("generated_documents") as any)
      .select("*")
      .eq("application_id", applicationId)
      .eq("is_current", true)
      .order("document_type", { ascending: true });

    if (docsError) {
      console.error("Error fetching generated documents:", docsError);
      return { success: false, error: docsError.message };
    }

    return { success: true, documents: documents || [] };
  } catch (error: any) {
    console.error("Error getting generated documents:", error);
    return { success: false, error: error.message || "Failed to get generated documents" };
  }
}

/**
 * Update the content of a generated document (e.g. after user edits in Tiptap).
 * Updates the current version in place; does not create a new version.
 */
export async function updateGeneratedDocumentContent(
  applicationId: string,
  documentType: "cover_letter" | "personal_statement" | "exhibit_list",
  content: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const supabase = createAdminClient();

    const { data: application, error: appError } = await (supabase
      .from("applications") as any)
      .select("user_id")
      .eq("id", applicationId)
      .single();

    if (appError || !application || application.user_id !== user.id) {
      return { success: false, error: "Application not found or unauthorized" };
    }

    const { error: updateError } = await (supabase
      .from("generated_documents") as any)
      .update({ content })
      .eq("application_id", applicationId)
      .eq("document_type", documentType)
      .eq("is_current", true);

    if (updateError) {
      console.error("Error updating generated document:", updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error updating generated document content:", error);
    return { success: false, error: error.message || "Failed to update document" };
  }
}

/**
 * Generate PDF for cover letter using template-based system
 */
export async function generateCoverLetterPdfAction(
  applicationId: string
): Promise<{ success: boolean; pdfBytes?: Uint8Array; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Aggregate application data
    const { success, data, error } = await aggregateApplicationData(applicationId);
    if (!success || !data) {
      return { success: false, error: error || "Failed to aggregate application data" };
    }

    // Validate required data
    const requiredDataCheck = validateRequiredData(data);
    const isTestMode = process.env.DOCUMENT_AI_TEST_MODE === "true";
    
    if (!requiredDataCheck.valid && !isTestMode) {
      return { success: false, error: `Missing required data: ${requiredDataCheck.missing.join(", ")}` };
    }

    // Import mapper and validation
    const { mapToI539Schema } = await import("@/lib/uscis-writing-engine/contracts/mapper");
    const { validateI539Data } = await import("@/lib/uscis-writing-engine/engine/rules");
    const { generateUSCISPdf } = await import("@/lib/uscis-writing-engine/pdf/generateUSCISPdf");

    // Map aggregated data to I539 schema
    const schemaData = mapToI539Schema(data);

    // Validate schema data
    const validationResult = validateI539Data(schemaData);
    if (!validationResult.valid) {
      return {
        success: false,
        error: `Validation failed: ${validationResult.errors.join(", ")}`,
      };
    }

    // Use the same hybrid system (AI + templates) as generateCoverLetter
    const aiResult = await generateCoverLetterWithAIUsingTemplates(data, schemaData);
    
    if (!aiResult.success || !aiResult.content) {
      return {
        success: false,
        error: aiResult.error || "Failed to generate cover letter for PDF",
      };
    }

    const coverLetterText = aiResult.content;

    // Generate PDF from the AI-generated content
    const pdfBytes = await generateUSCISPdf(coverLetterText);

    return { success: true, pdfBytes };
  } catch (error: any) {
    console.error("Error generating PDF:", error);
    return { success: false, error: error.message || "Failed to generate PDF" };
  }
}

/**
 * Get a specific generated document
 */
export async function getGeneratedDocument(
  applicationId: string,
  documentType: DocumentType
): Promise<{ success: boolean; document?: any; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const supabase = createAdminClient();

    // Verify application belongs to user
    const { data: application, error: appError } = await (supabase
      .from("applications") as any)
      .select("user_id")
      .eq("id", applicationId)
      .single();

    if (appError || !application || application.user_id !== user.id) {
      return { success: false, error: "Application not found or unauthorized" };
    }

    // Get current version of the document
    const { data: document, error: docError } = await (supabase
      .from("generated_documents") as any)
      .select("*")
      .eq("application_id", applicationId)
      .eq("document_type", documentType)
      .eq("is_current", true)
      .single();

    if (docError) {
      if (docError.code === "PGRST116") {
        return { success: false, error: "Document not found" };
      }
      console.error("Error fetching generated document:", docError);
      return { success: false, error: docError.message };
    }

    return { success: true, document };
  } catch (error: any) {
    console.error("Error getting generated document:", error);
    return { success: false, error: error.message || "Failed to get generated document" };
  }
}

/**
 * Align Cover Letter and Personal Statement for consistency
 * Ensures both documents use the same facts, exhibits, and terminology
 * Cleans markdown formatting from both documents
 */
export async function alignCoverLetterAndPersonalStatement(
  applicationId: string
): Promise<{ success: boolean; coverLetter?: string; personalStatement?: string; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Get both documents
    const coverLetterDoc = await getGeneratedDocument(applicationId, "cover_letter");
    const personalStatementDoc = await getGeneratedDocument(applicationId, "personal_statement");
    
    if (!coverLetterDoc.success || !coverLetterDoc.document) {
      return { success: false, error: "Cover letter not found" };
    }
    
    if (!personalStatementDoc.success || !personalStatementDoc.document) {
      return { success: false, error: "Personal statement not found" };
    }
    
    const rawCoverLetter = (coverLetterDoc.document as any).content || "";
    const rawPersonalStatement = (personalStatementDoc.document as any).content || "";
    let coverLetter = rawCoverLetter;
    let personalStatement = rawPersonalStatement;
    
    // Clean both documents (remove markdown, emojis, etc.)
    coverLetter = cleanMarkdownFormatting(coverLetter);
    personalStatement = cleanMarkdownFormatting(personalStatement);
    
    // Save cleaned versions back to database
    const coverLetterSave = await saveGeneratedDocument(
      applicationId,
      user.id,
      "cover_letter",
      coverLetter
    );
    
    const personalStatementSave = await saveGeneratedDocument(
      applicationId,
      user.id,
      "personal_statement",
      personalStatement
    );
    
    if (!coverLetterSave.success) {
      return { success: false, error: coverLetterSave.error || "Failed to save cleaned cover letter" };
    }
    
    if (!personalStatementSave.success) {
      return { success: false, error: personalStatementSave.error || "Failed to save cleaned personal statement" };
    }
    
    return {
      success: true,
      coverLetter,
      personalStatement
    };
  } catch (error: any) {
    console.error("Error aligning cover letter and personal statement:", error);
    return { success: false, error: error.message || "Failed to align documents" };
  }
}

/**
 * Remove problematic symbols from text (***, !!!, %&, ???, etc.)
 * Removes decorative symbols that shouldn't appear in formal USCIS documents
 */
function removeProblematicSymbols(text: string): string {
  if (!text) return "";
  
  let cleaned = text;
  
  // Remove sequences of asterisks (***, **, *) - but keep single * if it's part of a word or citation
  cleaned = cleaned.replace(/\*{2,}/g, ""); // Remove ** or more, but keep single * for citations like (Exhibit A*)
  
  // Remove sequences of exclamation marks (!!!, !!, !) - but keep single ! if it's part of proper text
  cleaned = cleaned.replace(/!{2,}/g, ""); // Remove !! or more
  
  // Remove sequences of question marks (???, ??, ?) - but keep single ? if it's part of proper text
  cleaned = cleaned.replace(/\?{2,}/g, ""); // Remove ?? or more
  
  // Remove sequences of percent and ampersand (%&, &%, %%, &&, etc.)
  cleaned = cleaned.replace(/[%&]{2,}/g, ""); // Remove sequences of % or &
  cleaned = cleaned.replace(/%&/g, ""); // Remove %& combination
  cleaned = cleaned.replace(/&%/g, ""); // Remove &% combination
  
  // Remove sequences of hash (#, ##, ###) - but keep single # if it's part of a reference
  cleaned = cleaned.replace(/#{2,}/g, ""); // Remove ## or more
  
  // Remove sequences of tildes (~, ~~, ~~~)
  cleaned = cleaned.replace(/~{2,}/g, ""); // Remove ~~ or more
  
  // Remove sequences of underscores (___, __, _) - but keep single _ as it might be in text
  cleaned = cleaned.replace(/_{2,}/g, ""); // Remove __ or more
  
  // Remove sequences of equals (===, ==) - but keep single = as it might be in text
  cleaned = cleaned.replace(/={2,}/g, ""); // Remove == or more
  
  // Remove sequences of dashes (---, --) - but keep single - as it might be in text
  cleaned = cleaned.replace(/-{2,}/g, ""); // Remove -- or more
  
  // Remove combinations of problematic symbols
  cleaned = cleaned.replace(/[*!?#]{2,}/g, ""); // Remove any combination of 2+ of these symbols
  
  // Clean up extra whitespace
  cleaned = cleaned.replace(/\s+/g, " ");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  
  return cleaned.trim();
}

/**
 * Map document types to exhibit letters
 */
function getExhibitForDocumentType(documentType: string): string | null {
  const exhibitMap: Record<string, string> = {
    // Exhibit A: Identification and Status Documents
    passport: "A",
    dependent_passport: "A",
    i94: "A",
    dependent_i94: "A",
    marriage_certificate: "A",
    birth_certificate: "A",
    visa: "A",
    b1_visa: "A",
    
    // Exhibit B: SEVIS and School Documents
    i20: "B",
    dependent_i20: "B",
    sevis_receipt: "B",
    acceptance_letter: "B",
    i20_f2: "B",
    
    // Exhibit C: Purpose of Study and Nonimmigrant Intent / Ties to Home Country
    supporting_documents: "C",
    ties_documents: "C",
    purpose_of_study: "C",
    
    // Exhibit D: Proof of Financial Ability
    bank_statement: "D",
    sponsor_bank_statement: "D",
    assets: "D",
    sponsor_assets: "D",
    scholarship_document: "D",
    other_funding: "D",
    tax_return: "D",
    sponsor_letter: "D",
    investment: "D",
  };
  
  return exhibitMap[documentType] || null;
}

/**
 * Get human-readable description for document type
 */
function getDocumentTypeDescription(documentType: string): string {
  const descriptions: Record<string, string> = {
    // Exhibit A
    passport: "Passport (Applicant)",
    dependent_passport: "Passport (Dependent)",
    i94: "I-94 Arrival/Departure Record (Applicant)",
    dependent_i94: "I-94 Arrival/Departure Record (Dependent)",
    marriage_certificate: "Marriage Certificate",
    birth_certificate: "Birth Certificate",
    visa: "Visa",
    b1_visa: "B-1 Visa",
    
    // Exhibit B
    i20: "Form I-20 (F-1 - Applicant)",
    dependent_i20: "Form I-20 (F-2 - Dependent)",
    sevis_receipt: "SEVIS I-901 Fee Payment Receipt",
    acceptance_letter: "Official Letter of Acceptance",
    i20_f2: "Form I-20 (F-2)",
    
    // Exhibit C
    supporting_documents: "Supporting Documents",
    ties_documents: "Ties to Home Country Documents",
    purpose_of_study: "Purpose of Study Documents",
    
    // Exhibit D
    bank_statement: "Bank Statement (Applicant)",
    sponsor_bank_statement: "Bank Statement (Sponsor)",
    assets: "Assets Documents (Applicant)",
    sponsor_assets: "Assets Documents (Sponsor)",
    scholarship_document: "Scholarship Award Letter",
    other_funding: "Other Funding Source Documents",
    tax_return: "Tax Return",
    sponsor_letter: "Sponsor Letter",
    investment: "Investment Documents",
  };
  
  return descriptions[documentType] || documentType;
}

/**
 * Generate description of contents for an exhibit
 * Returns a list of what documents are included in this exhibit
 */
function getExhibitContentsDescription(
  documents: Array<{ type: string; name: string }>
): string[] {
  // Group documents by type and count them
  const documentsByType: Record<string, number> = {};
  
  for (const doc of documents) {
    if (!documentsByType[doc.type]) {
      documentsByType[doc.type] = 0;
    }
    documentsByType[doc.type]++;
  }
  
  // Build description list
  const descriptions: string[] = [];
  
  for (const [type, count] of Object.entries(documentsByType)) {
    const typeDescription = getDocumentTypeDescription(type);
    
    if (count === 1) {
      descriptions.push(`• ${typeDescription}`);
    } else {
      descriptions.push(`• ${typeDescription} (${count} documents)`);
    }
  }
  
  // Sort alphabetically for consistency
  return descriptions.sort();
}

/**
 * Add blue footer with exhibit name to a page
 */
function addExhibitFooter(
  page: any,
  exhibitLetter: string,
  fontBold: any,
  lightBlue: any,
  rgb: any
): void {
  const footerHeight = 40; // Height of footer area
  const footerY = 0; // Bottom of page
  
  // Draw blue background for footer
  page.drawRectangle({
    x: 0,
    y: footerY,
    width: 612,
    height: footerHeight,
    color: lightBlue,
  });
  
  // Draw exhibit name in footer (centered); shorten if too long to avoid overflow
  const fullTitle = `Exhibit ${exhibitLetter}: ${EXHIBIT_DESCRIPTIONS[exhibitLetter] || "Additional Supporting Documents"}`;
  const maxFooterWidth = 612 - 60;
  let exhibitTitle = fullTitle;
  let textWidth = fontBold.widthOfTextAtSize(exhibitTitle, 10);
  if (textWidth > maxFooterWidth) {
    exhibitTitle = `Exhibit ${exhibitLetter}`;
    textWidth = fontBold.widthOfTextAtSize(exhibitTitle, 10);
  }
  const centerX = Math.max(0, (612 - textWidth) / 2);
  
  page.drawText(exhibitTitle, {
    x: centerX,
    y: footerY + 15, // Center vertically in footer
    size: 10,
    font: fontBold,
    color: rgb(0, 0, 0), // Black text
  });
}

/**
 * Download file from URL and return as Uint8Array
 */
async function downloadFileAsBytes(fileUrl: string): Promise<Uint8Array> {
  try {
    // Try Supabase Storage download first (more reliable)
    const urlMatch = fileUrl.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/);
    
    if (urlMatch) {
      const [, bucket, filePath] = urlMatch;
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const supabase = createAdminClient();
      
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(filePath);
      
      if (!error && data) {
        const arrayBuffer = await data.arrayBuffer();
        return new Uint8Array(arrayBuffer);
      }
    }
    
    // Fallback to public URL fetch
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.error(`Error downloading file from ${fileUrl}:`, error);
    throw error;
  }
}

/**
 * Wrap text to fit max width using font measurement. Returns array of lines.
 */
function wrapTextForPdf(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  fontSize: number,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(w, fontSize) > maxWidth) {
        let chunk = "";
        for (const c of w) {
          const t = chunk + c;
          if (font.widthOfTextAtSize(t, fontSize) <= maxWidth) chunk = t;
          else {
            if (chunk) lines.push(chunk);
            chunk = c;
          }
        }
        current = chunk;
      } else {
        current = w;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Add documents to PDF grouped by exhibit
 */
async function addDocumentsToPdf(
  pdfDoc: Awaited<ReturnType<typeof import("pdf-lib").PDFDocument.load>>,
  applicationId: string,
  mentionedExhibits: Set<string>
): Promise<void> {
  try {
    const { StandardFonts, rgb: rgbColor, PDFDocument } = await import("pdf-lib");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();
    
    // Get all documents for the application
    const { data: documents, error } = await supabase
      .from("documents")
      .select("id, type, name, file_url, mime_type")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: true });
    
    if (error || !documents) {
      console.error("Error fetching documents:", error);
      return;
    }
    
    // Build included exhibits: start from mentioned, add E when we have unmapped doc types
    const includedExhibits = new Set(mentionedExhibits);
    for (const doc of documents) {
      if (!getExhibitForDocumentType((doc as any).type)) includedExhibits.add("E");
    }
    
    // Group documents by exhibit (unmapped types go to Exhibit E)
    const documentsByExhibit: Record<string, Array<{ id: string; type: string; name: string; file_url: string; mime_type: string }>> = {};
    for (const doc of documents) {
      const docType = (doc as any).type;
      const exhibitLetter = getExhibitForDocumentType(docType) || "E";
      if (!includedExhibits.has(exhibitLetter)) continue;
      if (!documentsByExhibit[exhibitLetter]) documentsByExhibit[exhibitLetter] = [];
      documentsByExhibit[exhibitLetter].push(doc);
    }
    
    const sortedExhibits = Object.keys(documentsByExhibit).sort();
    
    if (sortedExhibits.length === 0) {
      console.log("[addDocumentsToPdf] No documents found for mentioned exhibits");
      return;
    }
    
    // Get fonts
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    
    // Light blue color for backgrounds (good for printing)
    const lightBlue = rgbColor(0.85, 0.92, 1.0);
    
    // Add documents for each exhibit
    for (const exhibitLetter of sortedExhibits) {
      const docs = documentsByExhibit[exhibitLetter];
      if (docs.length === 0) continue;
      
      console.log(`[addDocumentsToPdf] Adding ${docs.length} documents for Exhibit ${exhibitLetter}`);
      
      // Add exhibit header page(s) - track all header pages to add footer later
      const headerPages: any[] = [];
      let exhibitPage = pdfDoc.addPage([612, 792]);
      headerPages.push(exhibitPage);
      const exhibitTitle = `Exhibit ${exhibitLetter}: ${EXHIBIT_DESCRIPTIONS[exhibitLetter]}`;
      
      // Draw light blue background for the entire page (good for printing)
      // Using a light blue that's visible but won't consume too much ink
      exhibitPage.drawRectangle({
        x: 0,
        y: 0,
        width: 612,
        height: 792,
        color: lightBlue,
      });
      
      // Draw title (black text on light blue background)
      exhibitPage.drawText(exhibitTitle, {
        x: 72,
        y: 720,
        size: 16,
        font: fontBold,
        color: rgbColor(0, 0, 0), // Black text for good contrast
      });
      
      // Generate and draw contents description
      const contentsDescription = getExhibitContentsDescription(docs);
      let yPosition = 680; // Start below title
      
      if (contentsDescription.length > 0) {
        // Add subtitle
        exhibitPage.drawText("This exhibit contains:", {
          x: 72,
          y: yPosition,
          size: 12,
          font: fontBold,
          color: rgbColor(0, 0, 0), // Black text
        });
        
        yPosition -= 20; // Space after subtitle
        
        const listMaxWidth = 612 - 90 - 72; // page - left indent - right margin
        // Draw each item in the list (wrap long lines to avoid overflow)
        for (const item of contentsDescription) {
          const itemLines = wrapTextForPdf(item, fontRegular, 11, listMaxWidth);
          for (const line of itemLines) {
            if (yPosition < 100) {
              exhibitPage = pdfDoc.addPage([612, 792]);
              headerPages.push(exhibitPage);
              exhibitPage.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: lightBlue });
              yPosition = 720;
            }
            exhibitPage.drawText(line, {
              x: 90,
              y: yPosition,
              size: 11,
              font: fontRegular,
              color: rgbColor(0, 0, 0),
            });
            yPosition -= 16;
          }
        }
      }
      
      // Add footer to all header pages
      for (const headerPage of headerPages) {
        addExhibitFooter(headerPage, exhibitLetter, fontBold, lightBlue, rgbColor);
      }
      
      // Process each document
      for (const doc of docs) {
        try {
          console.log(`[addDocumentsToPdf] Processing document: ${doc.name} (${doc.type})`);
          const fileBytes = await downloadFileAsBytes(doc.file_url);
          
          if (doc.mime_type === "application/pdf") {
            // For PDFs: copy all pages
            const sourcePdf = await PDFDocument.load(fileBytes);
            const pageCount = sourcePdf.getPageCount();
            
            console.log(`[addDocumentsToPdf] Copying ${pageCount} pages from PDF: ${doc.name}`);
            
            for (let i = 0; i < pageCount; i++) {
              const [copiedPage] = await pdfDoc.copyPages(sourcePdf, [i]);
              const newPage = pdfDoc.addPage(copiedPage);
              
              // Add exhibit footer to each copied page
              addExhibitFooter(newPage, exhibitLetter, fontBold, lightBlue, rgbColor);
            }
          } else if (doc.mime_type.startsWith("image/")) {
            // For images: embed as page
            let image;
            if (doc.mime_type === "image/png") {
              image = await pdfDoc.embedPng(fileBytes);
            } else if (doc.mime_type === "image/jpeg" || doc.mime_type === "image/jpg") {
              image = await pdfDoc.embedJpg(fileBytes);
            } else {
              console.warn(`[addDocumentsToPdf] Unsupported image type: ${doc.mime_type} for ${doc.name}`);
              continue;
            }
            
            // Create new page for image
            const imagePage = pdfDoc.addPage([612, 792]);
            const { width, height } = image.scale(1);
            
            // Calculate scaling to fit page with margins
            const maxWidth = 612 - 144; // Page width - 2 inch margins
            const maxHeight = 792 - 144; // Page height - 2 inch margins
            const scaleX = maxWidth / width;
            const scaleY = maxHeight / height;
            const scale = Math.min(scaleX, scaleY, 1); // Don't upscale
            
            const scaledWidth = width * scale;
            const scaledHeight = height * scale;
            
            // Center image on page
            const x = (612 - scaledWidth) / 2;
            const y = (792 - scaledHeight) / 2;
            
            imagePage.drawImage(image, {
              x,
              y,
              width: scaledWidth,
              height: scaledHeight,
            });
            
            // Add document name below image (but above footer)
            imagePage.drawText(doc.name, {
              x: 72,
              y: Math.max(60, y - 20), // Leave space for footer (40px) + margin
              size: 10,
              font: fontRegular,
              color: rgbColor(0, 0, 0),
            });
            
            // Add exhibit footer to image page
            addExhibitFooter(imagePage, exhibitLetter, fontBold, lightBlue, rgbColor);
            
            console.log(`[addDocumentsToPdf] Added image: ${doc.name}`);
          } else {
            console.warn(`[addDocumentsToPdf] Unsupported file type: ${doc.mime_type} for ${doc.name}`);
          }
        } catch (error) {
          console.error(`[addDocumentsToPdf] Error processing document ${doc.name}:`, error);
          // Continue with next document even if one fails
        }
      }
    }
    
    console.log(`[addDocumentsToPdf] Successfully added documents for ${sortedExhibits.length} exhibits`);
  } catch (error) {
    console.error("[addDocumentsToPdf] Error adding documents to PDF:", error);
    // Don't throw - allow PDF generation to continue even if documents fail
  }
}

/**
 * Generate combined PDF with Cover Letter and Personal Statement
 * Removes problematic symbols (***, !!!, %&, ???) and combines both documents
 * Now includes uploaded documents grouped by exhibit
 */
export async function generateCombinedPdf(
  applicationId: string
): Promise<{ success: boolean; pdfBytes?: Uint8Array; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Get all three documents
    const coverLetterDoc = await getGeneratedDocument(applicationId, "cover_letter");
    const personalStatementDoc = await getGeneratedDocument(applicationId, "personal_statement");
    const exhibitListDoc = await getGeneratedDocument(applicationId, "exhibit_list");
    
    if (!coverLetterDoc.success || !coverLetterDoc.document) {
      return { success: false, error: "Cover letter not found" };
    }
    
    if (!personalStatementDoc.success || !personalStatementDoc.document) {
      return { success: false, error: "Personal statement not found" };
    }
    
    // Exhibit list is optional but recommended
    let exhibitList = "";
    if (exhibitListDoc.success && exhibitListDoc.document) {
      exhibitList = (exhibitListDoc.document as any).content || "";
    }
    
    // Get applicant data to extract name for signature
    const { success: dataSuccess, data: appData } = await aggregateApplicationData(applicationId);
    if (!dataSuccess || !appData) {
      return { success: false, error: "Failed to load application data" };
    }
    
    // Get applicant name from documents (priority: passport > i94 > i20 > user)
    const applicantName = appData.documents.passport?.name 
      || appData.documents.i94?.name 
      || appData.documents.i20?.studentName 
      || appData.user.fullName 
      || "Applicant";
    
    let coverLetter = (coverLetterDoc.document as any).content || "";
    let personalStatement = (personalStatementDoc.document as any).content || "";
    
    // Store raw cover letter for fallback
    const rawCoverLetter = coverLetter;
    
    // Clean markdown formatting (preserva quebras de linha)
    coverLetter = cleanMarkdownFormatting(coverLetter);
    personalStatement = cleanMarkdownFormatting(personalStatement);
    if (exhibitList) {
      exhibitList = cleanMarkdownFormatting(exhibitList);
    }
    
    // CRITICAL: Remove signature from cover letter (signature should only appear at the end of PDF)
    coverLetter = removeSignatureFromCoverLetter(coverLetter);
    
    // IMPORTANTE: Garantir que há quebras de linha entre parágrafos
    // Se o texto não tem quebras de linha adequadas, adicionar após pontos finais
    coverLetter = formatCoverLetterParagraphs(coverLetter);
    personalStatement = ensureParagraphBreaks(personalStatement);
    if (exhibitList) {
      exhibitList = ensureParagraphBreaks(exhibitList);
    }

    // Fallback: if cleaning stripped the cover letter entirely, keep the raw content
    if (!coverLetter.trim() && rawCoverLetter.trim()) {
      coverLetter = ensureParagraphBreaks(
        removeSignatureFromCoverLetter(rawCoverLetter.trim())
      );
    }
    
    // Parse for React-PDF template (letterhead, cover, personal, exhibit, signature)
    let c = coverLetter.trim();
    if (/^COVER\s*LETTER\s*\n/i.test(c)) {
      c = c.replace(/^COVER\s*LETTER\s*\n*/i, "").trim();
    }
    const lines = c.split("\n");
    const dearIdx = lines.findIndex((l: string) => /^dear\b/i.test(l.trim()));
    let coverHeader = "";
    const coverBodyParagraphs: string[] = [];
    let financial: { financialRequirements?: { tuition?: string; livingExpenses?: string; totalRequired?: string }; availableResources?: { personalFunds?: string; sponsorName?: string; sponsorAmount?: string; totalAvailable?: string } } | undefined;
    if (dearIdx >= 0) {
      coverHeader = lines.slice(0, dearIdx + 1).join("\n").trim();
      const bodyText = lines.slice(dearIdx + 1).join("\n");
      const paras = bodyText.split(/\n\n+/).map((p: string) => p.trim()).filter(Boolean);
      for (const p of paras) {
        const ext = extractFinancialData(p);
        if (ext.isFinancialSection && (ext.financialRequirements || ext.availableResources)) {
          financial = { financialRequirements: ext.financialRequirements, availableResources: ext.availableResources };
        } else {
          coverBodyParagraphs.push(p);
        }
      }
    } else {
      coverHeader = c;
    }
    const personalParagraphs = personalStatement.split(/\n\n+/).map((s: string) => s.trim()).filter(Boolean);
    let cleanedExhibitList = exhibitList.replace(/^EXHIBIT LIST\s*\n*/i, "").trim();
    cleanedExhibitList = cleanedExhibitList.replace(/\n*Generated:.*$/i, "").trim();
    const exhibitLines = cleanedExhibitList.split("\n").filter((l: string) => l.trim());
    const exhibitItems: string[] = [];
    for (const line of exhibitLines) {
      const t = line.trim();
      if (/^Exhibit\s+[A-Z]:/.test(t) || (t.length > 0 && !/^Generated:/i.test(t))) {
        exhibitItems.push(t);
      }
    }
    // Sanitize all text for PDF to avoid garbled chars (•¤•Ÿ, etc.) from Unicode
    const financialSanitized = financial
      ? {
          ...financial,
          availableResources: financial.availableResources
            ? {
                ...financial.availableResources,
                sponsorName: financial.availableResources.sponsorName
                  ? sanitizeForPdf(financial.availableResources.sponsorName)
                  : financial.availableResources.sponsorName,
              }
            : financial.availableResources,
        }
      : undefined;
    const parsed = {
      coverHeader: sanitizeForPdf(coverHeader),
      coverBodyParagraphs: coverBodyParagraphs.map((p: string) => sanitizeForPdf(p)),
      financial: financialSanitized,
      personalParagraphs: personalParagraphs.map((p: string) => sanitizeForPdf(p)),
      applicantName: sanitizeForPdf(applicantName),
      exhibitItems: exhibitItems.map((i: string) => sanitizeForPdf(i)),
    };

    const { PDFDocument } = await import("pdf-lib");
    console.log("[generateCombinedPdf] Starting PDF generation (React-PDF)...");
    const initialPdfBytes = await renderCombinedPdfToBuffer(parsed);
    console.log("[generateCombinedPdf] Initial PDF generated successfully, size:", initialPdfBytes.length, "bytes");
    
    if (!initialPdfBytes || initialPdfBytes.length === 0) {
      return { success: false, error: "Generated PDF is empty" };
    }
    
    // Load the initial PDF
    const pdfDoc = await PDFDocument.load(initialPdfBytes);
    
    // Get mentioned exhibits from cover letter and personal statement
    const mentionedExhibits = new Set<string>();
    if (coverLetterDoc.success && coverLetterDoc.document) {
      const coverLetterContent = (coverLetterDoc.document as any).content || "";
      extractExhibitsFromText(coverLetterContent).forEach(letter => mentionedExhibits.add(letter));
    }
    if (personalStatementDoc.success && personalStatementDoc.document) {
      const personalStatementContent = (personalStatementDoc.document as any).content || "";
      extractExhibitsFromText(personalStatementContent).forEach(letter => mentionedExhibits.add(letter));
    }
    // Include exhibits from Exhibit List so docs are attached when only listed there
    if (exhibitList) {
      extractExhibitsFromText(exhibitList).forEach(letter => mentionedExhibits.add(letter));
    }
    
    console.log("[generateCombinedPdf] Mentioned exhibits:", Array.from(mentionedExhibits).sort());
    
    // Add documents grouped by exhibit (includes E for unmapped types when present)
    console.log("[generateCombinedPdf] Adding documents to PDF...");
    await addDocumentsToPdf(pdfDoc, applicationId, mentionedExhibits);
    
    // Save final PDF
    const finalPdfBytes = await pdfDoc.save();
    console.log("[generateCombinedPdf] Final PDF generated successfully, size:", finalPdfBytes.length, "bytes");
    
    return { success: true, pdfBytes: finalPdfBytes };
  } catch (error: any) {
    console.error("[generateCombinedPdf] Error generating combined PDF:", error);
    console.error("[generateCombinedPdf] Error stack:", error.stack);
    return { success: false, error: error.message || "Failed to generate combined PDF" };
  }
}

