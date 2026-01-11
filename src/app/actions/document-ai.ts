"use server";

import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

// Google Document AI Configuration
const PROJECT_ID = "684267792607";
const LOCATION = "us";

// Processor configuration map
const PROCESSOR_CONFIG: Record<string, { id: string; endpoint: string }> = {
  passport: {
    id: "634b89fd7307082e",
    endpoint: `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/634b89fd7307082e:process`,
  },
  dependent_passport: {
    id: "634b89fd7307082e", // Same processor as passport
    endpoint: `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/634b89fd7307082e:process`,
  },
  i94: {
    id: "620a6a45d473d87f",
    endpoint: `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/620a6a45d473d87f:process`,
  },
  dependent_i94: {
    id: "620a6a45d473d87f", // Same processor as I-94
    endpoint: `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/620a6a45d473d87f:process`,
  },
  dependent_i20: {
    id: "808078d27b2f653e", // Same processor as I-20 (F-2 format is similar)
    endpoint: `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/808078d27b2f653e:process`,
  },
  i20: {
    id: "808078d27b2f653e",
    endpoint: `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/808078d27b2f653e:process`,
  },
  bank_statement: {
    id: "72bcc1007ce8bf72",
    endpoint: `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/72bcc1007ce8bf72:process`,
  },
  sponsor_bank_statement: {
    id: "72bcc1007ce8bf72", // Same processor as bank statement
    endpoint: `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/72bcc1007ce8bf72:process`,
  },
  supporting_documents: {
    id: "a932705e7ae8a13d", // Temporarily using Assets processor - TODO: Replace with dedicated Ties to Country processor ID if available
    endpoint: `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/a932705e7ae8a13d:process`,
  },
  assets: {
    id: "a932705e7ae8a13d",
    endpoint: `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/a932705e7ae8a13d:process`,
  },
  sponsor_assets: {
    id: "a932705e7ae8a13d", // Same processor as assets
    endpoint: `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/a932705e7ae8a13d:process`,
  },
  scholarship_document: {
    id: "a932705e7ae8a13d", // Use assets processor for scholarship letters (generic document)
    endpoint: `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/a932705e7ae8a13d:process`,
  },
  other_funding: {
    id: "a932705e7ae8a13d", // Use assets processor for other funding documents (generic document)
    endpoint: `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/a932705e7ae8a13d:process`,
  },
};

interface ExtractedPassportData {
  name?: string;
  passportNumber?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  nationality?: string;
  gender?: string;
  issueDate?: string;
  expiryDate?: string;
  issuingAuthority?: string;
  [key: string]: any; // Allow for additional fields
}

interface ExtractedI94Data {
  name?: string;
  admissionNumber?: string;
  classOfAdmission?: string;
  dateOfAdmission?: string;
  admitUntilDate?: string;
  passportNumber?: string;
  countryOfIssuance?: string;
  birthDate?: string;
  [key: string]: any; // Allow for additional fields
}

interface ExtractedI20Data {
  studentName?: string;
  sevisId?: string;
  schoolName?: string;
  programOfStudy?: string;
  programLevel?: string;
  majorField?: string;
  startDate?: string;
  endDate?: string;
  dateOfBirth?: string;
  countryOfBirth?: string;
  countryOfCitizenship?: string;
  financialSupport?: string;
  [key: string]: any; // Allow for additional fields
}

interface ExtractedBankStatementData {
  accountHolderName?: string;
  accountNumber?: string;
  accountType?: string;
  bankName?: string;
  statementPeriod?: string;
  startDate?: string;
  endDate?: string;
  openingBalance?: string;
  closingBalance?: string;
  totalBalance?: string; // Total balance (sum of all accounts) - extracted from "Total balance" text
  endingBalances?: string[]; // Array of individual account ending balances
  totalDeposits?: string;
  totalWithdrawals?: string;
  currency?: string;
  [key: string]: any; // Allow for additional fields
}

interface ExtractedTiesToCountryData {
  documentType?: string; // e.g., "property_deed", "employment_letter", "family_relationship"
  ownerName?: string;
  propertyAddress?: string;
  propertyValue?: string;
  employmentCompany?: string;
  employmentPosition?: string;
  employmentStartDate?: string;
  relationshipType?: string;
  familyMemberName?: string;
  documentDate?: string;
  issuingAuthority?: string;
  [key: string]: any; // Allow for additional fields
}

interface ExtractedAssetsData {
  assetType?: string; // e.g., "real_estate", "vehicle", "investment", "savings_account"
  ownerName?: string;
  assetDescription?: string;
  assetValue?: string;
  assetLocation?: string;
  purchaseDate?: string;
  currentValue?: string;
  accountNumber?: string;
  institutionName?: string;
  documentDate?: string;
  [key: string]: any; // Allow for additional fields
}

type ExtractedDocumentData = 
  | ExtractedPassportData 
  | ExtractedI94Data 
  | ExtractedI20Data 
  | ExtractedBankStatementData
  | ExtractedTiesToCountryData
  | ExtractedAssetsData;

/**
 * Process a document using Google Document AI
 * Downloads the file from Supabase Storage, processes it, and stores extracted data
 */
export async function processDocumentWithAI(
  documentId: string,
  fileUrl: string,
  documentType: string
): Promise<{ success: boolean; error?: string; data?: ExtractedDocumentData }> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Check if Google Cloud credentials are configured
    const googleCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!googleCredentials) {
      console.warn("Google Application Credentials not configured. Skipping document processing.");
      // Update document status to error if credentials not configured
      const supabase = createAdminClient();
      // TypeScript has issues with Supabase update types - this is safe at runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("documents") as any)
        .update({
          status: "error",
          extracted_data: { error: "Google Document AI credentials not configured" },
        })
        .eq("id", documentId);
      return {
        success: false,
        error: "Google Document AI credentials not configured",
      };
    }

    // Update document status to processing
    const supabase = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: processingUpdateError } = await (supabase.from("documents") as any)
      .update({ status: "processing" })
      .eq("id", documentId);

    if (processingUpdateError) {
      console.error("Error updating document status to processing:", processingUpdateError);
    } else {
      console.log(`Document ${documentId} (type: ${documentType}) status updated to processing`);
    }

    // Download the file from Supabase Storage
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      throw new Error(`Failed to download file: ${fileResponse.statusText}`);
    }

    const fileBuffer = await fileResponse.arrayBuffer();
    const base64File = Buffer.from(fileBuffer).toString("base64");

    // Detect MIME type from file URL or default to PDF
    // You can enhance this by checking the actual file type
    let mimeType = "application/pdf";
    const urlLower = fileUrl.toLowerCase();
    if (urlLower.endsWith(".pdf")) {
      mimeType = "application/pdf";
    } else if (urlLower.match(/\.(jpg|jpeg)$/i)) {
      mimeType = "image/jpeg";
    } else if (urlLower.endsWith(".png")) {
      mimeType = "image/png";
    } else if (urlLower.endsWith(".gif")) {
      mimeType = "image/gif";
    }

    // Parse Google credentials
    let credentials;
    try {
      // Try to parse the credentials
      // Handle case where it might be a stringified JSON (double-encoded)
      let credentialsString = googleCredentials.trim();
      
      // Check if the string is suspiciously short (service account JSON should be > 1000 chars)
      if (credentialsString.length < 500) {
        console.warn("Google credentials string is suspiciously short:", credentialsString.length);
        console.warn("Full credentials string:", credentialsString);
        throw new Error(
          `Google credentials appear to be incomplete or truncated. Expected > 500 characters, got ${credentialsString.length}. Please check your GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable.`
        );
      }
      
      // Remove surrounding quotes if present
      if (
        (credentialsString.startsWith('"') && credentialsString.endsWith('"')) ||
        (credentialsString.startsWith("'") && credentialsString.endsWith("'"))
      ) {
        credentialsString = credentialsString.slice(1, -1);
        // Unescape escaped quotes
        credentialsString = credentialsString.replace(/\\"/g, '"').replace(/\\'/g, "'");
      }
      
      // Try parsing
      credentials = JSON.parse(credentialsString);
      
      // Validate required fields
      if (!credentials.client_email || !credentials.private_key) {
        throw new Error("Missing required fields: client_email or private_key");
      }
      
      console.log("Google credentials parsed successfully");
    } catch (e: any) {
      console.error("Error parsing Google credentials:", e);
      console.error("Credentials string length:", googleCredentials.length);
      console.error("First 200 chars:", googleCredentials.substring(0, 200));
      console.error("Last 200 chars:", googleCredentials.substring(Math.max(0, googleCredentials.length - 200)));
      
      // Check if it looks like a truncated JSON
      const isTruncated = googleCredentials.length < 500 || 
                         (!googleCredentials.includes('"private_key"') && !googleCredentials.includes("private_key"));
      
      const errorMessage = isTruncated
        ? "Google credentials appear to be incomplete or truncated. Please ensure your GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable contains the complete service account JSON (should be > 1000 characters)."
        : `Invalid Google credentials format: ${e.message || "JSON parsing failed"}`;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("documents") as any)
        .update({
          status: "error",
          extracted_data: {
            error: errorMessage,
            details: e.message || "JSON parsing failed",
            credentialsLength: googleCredentials.length,
          },
        })
        .eq("id", documentId);
      return {
        success: false,
        error: errorMessage,
      };
    }

    // Get processor configuration for this document type
    const processorConfig = PROCESSOR_CONFIG[documentType];
    if (!processorConfig) {
      // Document type doesn't have a processor configured, skip processing
      console.log(`No processor configured for document type: ${documentType}`);
      // Update document status to error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("documents") as any)
        .update({
          status: "error",
          extracted_data: { error: `No processor configured for document type: ${documentType}` },
        })
        .eq("id", documentId);
      return {
        success: false,
        error: `No processor configured for document type: ${documentType}`,
      };
    }

    // Check if processor ID is a placeholder (not configured yet)
    if (processorConfig.id.startsWith("PLACEHOLDER_")) {
      console.warn(`Processor ID for ${documentType} is still a placeholder. Skipping AI processing.`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("documents") as any)
        .update({
          status: "error",
          extracted_data: { 
            error: `Processor not configured yet. Please provide the Google Document AI processor ID for ${documentType} documents.`,
            documentType,
            needsConfiguration: true,
          },
        })
        .eq("id", documentId);
      return {
        success: false,
        error: `Processor ID for ${documentType} is not configured. Please update the processor ID in the code.`,
      };
    }

    console.log(`Processing document ${documentId} with processor ${processorConfig.id} for type ${documentType}`);

    // Get access token using service account credentials
    console.log("Getting access token...");
    let accessToken;
    try {
      accessToken = await getAccessToken(credentials);
      console.log("Access token obtained successfully");
    } catch (tokenError: any) {
      console.error("Error getting access token:", tokenError);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("documents") as any)
        .update({
          status: "error",
          extracted_data: { error: `Failed to get access token: ${tokenError.message}` },
        })
        .eq("id", documentId);
      return {
        success: false,
        error: `Failed to get access token: ${tokenError.message}`,
      };
    }

    // Call Google Document AI API
    console.log(`Calling Document AI API: ${processorConfig.endpoint}`);
    const response = await fetch(processorConfig.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rawDocument: {
          mimeType: mimeType,
          content: base64File,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google Document AI API error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        documentId,
        documentType,
        processorId: processorConfig.id,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("documents") as any)
        .update({
          status: "error",
          extracted_data: {
            error: `Document AI processing failed: ${response.statusText}`,
            details: errorText,
          },
        })
        .eq("id", documentId);
      throw new Error(`Document AI processing failed: ${response.statusText}`);
    }

    console.log("Document AI API call successful, parsing response...");
    const result = await response.json();
    console.log("Response parsed, extracting data...");

    // Extract information from the response based on document type
    let extractedData: ExtractedDocumentData;
    try {
      if (documentType === "i94" || documentType === "dependent_i94") {
        extractedData = extractI94Data(result);
      } else if (documentType === "i20" || documentType === "dependent_i20") {
        extractedData = extractI20Data(result);
      } else if (documentType === "passport" || documentType === "dependent_passport") {
        extractedData = extractPassportData(result);
      } else if (documentType === "bank_statement" || documentType === "sponsor_bank_statement") {
        extractedData = extractBankStatementData(result);
      } else if (documentType === "supporting_documents") {
        extractedData = extractTiesToCountryData(result);
      } else if (documentType === "assets" || documentType === "sponsor_assets") {
        extractedData = extractAssetsData(result);
      } else if (documentType === "scholarship_document" || documentType === "other_funding") {
        // For scholarship and other funding documents, extract as generic financial documents
        // Can use assets extraction or create a generic extraction
        extractedData = extractAssetsData(result); // Reuse assets extraction for now
      } else {
        extractedData = extractPassportData(result);
      }
      console.log(`Data extracted for ${documentType}:`, Object.keys(extractedData));
      
      // Debug: Log extracted data for bank statements
      if (documentType === "bank_statement" || documentType === "sponsor_bank_statement") {
        console.log(`[processDocumentWithAI] Extracted bank statement data:`, {
          accountHolderName: (extractedData as any).accountHolderName,
          closingBalance: (extractedData as any).closingBalance,
          bankName: (extractedData as any).bankName,
          totalBalance: (extractedData as any).totalBalance,
          rawText: (extractedData as any).rawText?.substring(0, 200),
        });
      }
    } catch (extractError: any) {
      console.error("Error extracting data:", extractError);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("documents") as any)
        .update({
          status: "error",
          extracted_data: {
            error: `Failed to extract data: ${extractError.message}`,
          },
        })
        .eq("id", documentId);
      throw extractError;
    }

    // Clean extracted data before saving (remove _rawResponse if present, as it can be too large)
    const cleanedData = { ...extractedData };
    if ('_rawResponse' in cleanedData) {
      // Store only essential parts of the raw response for debugging, not the entire object
      const rawResponse = (cleanedData as any)._rawResponse;
      delete (cleanedData as any)._rawResponse;
      
      // Optionally store a summary of the raw response instead
      if (rawResponse?.document) {
        (cleanedData as any)._responseSummary = {
          hasEntities: !!rawResponse.document.entities,
          entityCount: rawResponse.document.entities?.length || 0,
          hasText: !!rawResponse.document.text,
          textLength: rawResponse.document.text?.length || 0,
        };
      }
    }

    // Update document with extracted data and mark as completed
    console.log(`Updating document ${documentId} with extracted data...`);
    console.log(`Extracted data keys:`, Object.keys(cleanedData));
    console.log(`Extracted data size:`, JSON.stringify(cleanedData).length, 'bytes');
    
    // Debug: Log what we're about to save for bank statements
    if (documentType === "bank_statement" || documentType === "sponsor_bank_statement") {
      console.log(`[processDocumentWithAI] Saving bank statement data to database:`, {
        accountHolderName: (cleanedData as any).accountHolderName,
        closingBalance: (cleanedData as any).closingBalance,
        bankName: (cleanedData as any).bankName,
        totalBalance: (cleanedData as any).totalBalance,
        hasRawText: !!(cleanedData as any).rawText,
      });
    }
    
    // @ts-ignore - Supabase type inference issue, but this works at runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError, data: updatedDocument } = await (supabase.from("documents") as any)
      .update({
        status: "completed",
        extracted_data: cleanedData,
      })
      .eq("id", documentId)
      .select();
    
    // Debug: Verify what was saved
    if (documentType === "bank_statement" || documentType === "sponsor_bank_statement") {
      if (updateError) {
        console.error(`[processDocumentWithAI] Error saving bank statement data:`, updateError);
      } else {
        console.log(`[processDocumentWithAI] Successfully saved bank statement data to document ${documentId}`);
        // Verify by reading back
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: verifyDoc } = await (supabase.from("documents") as any)
          .select("extracted_data")
          .eq("id", documentId)
          .single();
        if (verifyDoc) {
          const extractedData = (verifyDoc as any).extracted_data;
          console.log(`[processDocumentWithAI] Verified saved data:`, {
            hasExtractedData: !!extractedData,
            accountHolderName: extractedData?.accountHolderName,
            closingBalance: extractedData?.closingBalance,
            bankName: extractedData?.bankName,
          });
        }
      }
    }

    if (updateError) {
      console.error("Error updating document:", updateError);
      console.error("Error details:", JSON.stringify(updateError, null, 2));
      console.error("Document ID:", documentId);
      console.error("Extracted data preview:", JSON.stringify(cleanedData).substring(0, 500));
      throw new Error(`Failed to save extracted data: ${updateError.message || updateError.code || 'Unknown error'}`);
    }
    
    console.log(`Document updated successfully. Rows affected:`, updatedDocument?.length || 0);

    // After successfully processing a document, update form_data with extracted data
    // This is especially important for:
    // - bank statements (savingsAmount)
    // - sponsor documents (sponsorName)
    // - dependent documents (dependents)
    // - ties documents (tiesToCountry)
    if (documentType === "bank_statement" || 
        documentType === "sponsor_bank_statement" ||
        documentType === "sponsor_assets" ||
        documentType === "dependent_passport" ||
        documentType === "dependent_i94" ||
        documentType === "dependent_i20" ||
        documentType === "supporting_documents" || 
        documentType === "ties_supporting_documents") {
      try {
        // Get application_id from the document
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: documentData } = await (supabase.from("documents") as any)
          .select("application_id")
          .eq("id", documentId)
          .single();
        
        const appId = (documentData as any)?.application_id;
        if (appId) {
          const { updateFormDataFromExtractedDocuments } = await import("../actions/application");
          await updateFormDataFromExtractedDocuments(appId);
          console.log(`[processDocumentWithAI] Updated form_data after processing ${documentType}`);
        }
      } catch (updateError) {
        // Don't fail the document processing if form_data update fails
        console.error(`[processDocumentWithAI] Failed to update form_data:`, updateError);
      }
    }

    console.log(`Document ${documentId} successfully processed and marked as completed`);
    return { success: true, data: extractedData };
  } catch (error: any) {
    console.error("Error processing document with AI:", error);

    // Update document status to error
    try {
      const supabase = createAdminClient();
      // @ts-ignore - Supabase type inference issue, but this works at runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("documents") as any)
        .update({
          status: "error",
          extracted_data: { error: error.message },
        })
        .eq("id", documentId);
    } catch (updateError) {
      console.error("Error updating document status to error:", updateError);
    }

    return { success: false, error: error.message || "Failed to process document" };
  }
}

/**
 * Get OAuth2 access token from service account credentials
 * Uses a simple JWT implementation without external dependencies
 */
async function getAccessToken(credentials: {
  client_email: string;
  private_key: string;
  project_id?: string;
}): Promise<string> {

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: credentials.client_email,
    sub: credentials.client_email,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, // Token expires in 1 hour
    iat: now,
    scope: "https://www.googleapis.com/auth/cloud-platform",
  };

  // Encode header and payload
  const base64UrlEncode = (str: string) => {
    return Buffer.from(str)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  // Create signature
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signatureInput);
  sign.end();
  
  // Format private key (ensure it has proper line breaks)
  const privateKey = credentials.private_key.replace(/\\n/g, "\n");
  const signature = sign.sign(privateKey, "base64");
  const encodedSignature = signature.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  // Create JWT
  const jwt = `${encodedHeader}.${encodedPayload}.${encodedSignature}`;

  // Exchange JWT for access token
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Extract passport data from Google Document AI response
 */
function extractPassportData(aiResponse: any): ExtractedPassportData {
  const extracted: ExtractedPassportData = {};

  try {
    // Google Document AI returns entities in the document.entities array
    // The structure depends on your custom extractor configuration
    if (aiResponse.document?.entities) {
      for (const entity of aiResponse.document.entities) {
        const fieldName = entity.type?.toLowerCase().replace(/\s+/g, "");
        const value = entity.mentionText || entity.normalizedValue?.text || entity.textAnchor?.content;

        if (fieldName && value) {
          // Map common field names
          switch (fieldName) {
            case "name":
            case "fullname":
            case "full_name":
              extracted.name = value;
              break;
            case "passportnumber":
            case "passport_number":
            case "passportno":
              extracted.passportNumber = value;
              break;
            case "dateofbirth":
            case "date_of_birth":
            case "dob":
              extracted.dateOfBirth = value;
              break;
            case "placeofbirth":
            case "place_of_birth":
            case "pob":
              extracted.placeOfBirth = value;
              break;
            case "nationality":
              extracted.nationality = value;
              break;
            case "gender":
            case "sex":
              extracted.gender = value;
              break;
            case "issuedate":
            case "issue_date":
            case "dateofissue":
              extracted.issueDate = value;
              break;
            case "expirydate":
            case "expiry_date":
            case "expirationdate":
            case "dateofexpiry":
              extracted.expiryDate = value;
              break;
            case "issuingauthority":
            case "issuing_authority":
            case "authority":
              extracted.issuingAuthority = value;
              break;
            default:
              // Store any other fields
              extracted[fieldName] = value;
          }
        }
      }
    }

    // Also check for properties in the document if entities aren't available
    if (Object.keys(extracted).length === 0 && aiResponse.document?.text) {
      // Fallback: try to extract from full text if structured entities aren't available
      // This is a basic fallback - you may want to enhance this based on your extractor
      const text = aiResponse.document.text;
      extracted.rawText = text;
    }

    // Note: _rawResponse is not stored here to avoid database size issues
    // A summary is created in the main processing function if needed
  } catch (error) {
    console.error("Error extracting passport data:", error);
    extracted._error = "Failed to parse extracted data";
  }

  return extracted;
}

/**
 * Extract I-94 data from Google Document AI response
 */
function extractI94Data(aiResponse: any): ExtractedI94Data {
  const extracted: ExtractedI94Data = {};

  try {
    // Google Document AI returns entities in the document.entities array
    // The structure depends on your custom extractor configuration
    if (aiResponse.document?.entities) {
      for (const entity of aiResponse.document.entities) {
        const fieldName = entity.type?.toLowerCase().replace(/\s+/g, "");
        const value = entity.mentionText || entity.normalizedValue?.text || entity.textAnchor?.content;

        if (fieldName && value) {
          // Map common I-94 field names
          switch (fieldName) {
            case "name":
            case "fullname":
            case "full_name":
              extracted.name = value;
              break;
            case "admissionnumber":
            case "admission_number":
            case "i94number":
            case "i94_number":
            case "admitnumber":
              extracted.admissionNumber = value;
              break;
            case "classofadmission":
            case "class_of_admission":
            case "admissionclass":
            case "admission_class":
              extracted.classOfAdmission = value;
              break;
            case "dateofadmission":
            case "date_of_admission":
            case "admissiondate":
            case "admission_date":
              extracted.dateOfAdmission = value;
              break;
            case "admituntildate":
            case "admit_until_date":
            case "admituntil":
            case "admit_until":
            case "expirationdate":
            case "expiration_date":
              extracted.admitUntilDate = value;
              break;
            case "passportnumber":
            case "passport_number":
            case "passportno":
              extracted.passportNumber = value;
              break;
            case "countryofissuance":
            case "country_of_issuance":
            case "issuancecountry":
            case "issuance_country":
              extracted.countryOfIssuance = value;
              break;
            case "birthdate":
            case "birth_date":
            case "dateofbirth":
            case "date_of_birth":
            case "dob":
              extracted.birthDate = value;
              break;
            default:
              // Store any other fields
              extracted[fieldName] = value;
          }
        }
      }
    }

    // Also check for properties in the document if entities aren't available
    if (Object.keys(extracted).length === 0 && aiResponse.document?.text) {
      // Fallback: try to extract from full text if structured entities aren't available
      const text = aiResponse.document.text;
      extracted.rawText = text;
    }

    // Note: _rawResponse is not stored here to avoid database size issues
    // A summary is created in the main processing function if needed
  } catch (error) {
    console.error("Error extracting I-94 data:", error);
    extracted._error = "Failed to parse extracted data";
  }

  return extracted;
}

/**
 * Extract I-20 data from Google Document AI response
 */
function extractI20Data(aiResponse: any): ExtractedI20Data {
  const extracted: ExtractedI20Data = {};

  try {
    // Google Document AI returns entities in the document.entities array
    // The structure depends on your custom extractor configuration
    if (aiResponse.document?.entities) {
      for (const entity of aiResponse.document.entities) {
        const fieldName = entity.type?.toLowerCase().replace(/\s+/g, "");
        const value = entity.mentionText || entity.normalizedValue?.text || entity.textAnchor?.content;

        if (fieldName && value) {
          // Map common I-20 field names
          switch (fieldName) {
            case "studentname":
            case "student_name":
            case "name":
            case "fullname":
            case "full_name":
              extracted.studentName = value;
              break;
            case "sevisid":
            case "sevis_id":
            case "sevisnumber":
            case "sevis_number":
              extracted.sevisId = value;
              break;
            case "schoolname":
            case "school_name":
            case "institutionname":
            case "institution_name":
            case "school":
              extracted.schoolName = value;
              break;
            case "programofstudy":
            case "program_of_study":
            case "program":
              extracted.programOfStudy = value;
              break;
            case "programlevel":
            case "program_level":
            case "level":
            case "degreelevel":
            case "degree_level":
              extracted.programLevel = value;
              break;
            case "majorfield":
            case "major_field":
            case "major":
            case "fieldofstudy":
            case "field_of_study":
              extracted.majorField = value;
              break;
            case "startdate":
            case "start_date":
            case "programstartdate":
            case "program_start_date":
            case "reportdate":
            case "report_date":
              extracted.startDate = value;
              break;
            case "enddate":
            case "end_date":
            case "programenddate":
            case "program_end_date":
            case "expectedcompletiondate":
            case "expected_completion_date":
              extracted.endDate = value;
              break;
            case "dateofbirth":
            case "date_of_birth":
            case "dob":
            case "birthdate":
            case "birth_date":
              extracted.dateOfBirth = value;
              break;
            case "countryofbirth":
            case "country_of_birth":
            case "birthcountry":
            case "birth_country":
              extracted.countryOfBirth = value;
              break;
            case "countryofcitizenship":
            case "country_of_citizenship":
            case "citizenship":
            case "nationality":
              extracted.countryOfCitizenship = value;
              break;
            case "financialsupport":
            case "financial_support":
            case "fundingsource":
            case "funding_source":
              extracted.financialSupport = value;
              break;
            default:
              // Store any other fields
              extracted[fieldName] = value;
          }
        }
      }
    }

    // Also check for properties in the document if entities aren't available
    if (Object.keys(extracted).length === 0 && aiResponse.document?.text) {
      // Fallback: try to extract from full text if structured entities aren't available
      const text = aiResponse.document.text;
      extracted.rawText = text;
    }

    // Note: _rawResponse is not stored here to avoid database size issues
    // A summary is created in the main processing function if needed
  } catch (error) {
    console.error("Error extracting I-20 data:", error);
    extracted._error = "Failed to parse extracted data";
  }

  return extracted;
}

/**
 * Extract bank statement data from Google Document AI response
 */
function extractBankStatementData(aiResponse: any): ExtractedBankStatementData {
  const extracted: ExtractedBankStatementData = {};

  try {
    // Google Document AI returns entities in the document.entities array
    // The structure depends on your custom extractor configuration
    if (aiResponse.document?.entities) {
      for (const entity of aiResponse.document.entities) {
        const fieldName = entity.type?.toLowerCase().replace(/\s+/g, "");
        const value = entity.mentionText || entity.normalizedValue?.text || entity.textAnchor?.content;

        if (fieldName && value) {
          // Map common bank statement field names
          switch (fieldName) {
            case "accountholdername":
            case "account_holder_name":
            case "holdername":
            case "holder_name":
            case "name":
            case "accountname":
            case "account_name":
              extracted.accountHolderName = value;
              break;
            case "accountnumber":
            case "account_number":
            case "accountno":
            case "account_no":
            case "acctnumber":
            case "acct_number":
              extracted.accountNumber = value;
              break;
            case "accounttype":
            case "account_type":
            case "type":
            case "accountcategory":
            case "account_category":
              extracted.accountType = value;
              break;
            case "bankname":
            case "bank_name":
            case "bank":
            case "institutionname":
            case "institution_name":
              extracted.bankName = value;
              break;
            case "statementperiod":
            case "statement_period":
            case "period":
            case "statementdate":
            case "statement_date":
              extracted.statementPeriod = value;
              break;
            case "startdate":
            case "start_date":
            case "periodstart":
            case "period_start":
            case "fromdate":
            case "from_date":
              extracted.startDate = value;
              break;
            case "enddate":
            case "end_date":
            case "periodend":
            case "period_end":
            case "todate":
            case "to_date":
              extracted.endDate = value;
              break;
            case "openingbalance":
            case "opening_balance":
            case "beginningbalance":
            case "beginning_balance":
            case "startingbalance":
            case "starting_balance":
              extracted.openingBalance = value;
              break;
            case "closingbalance":
            case "closing_balance":
            case "endingbalance":
            case "ending_balance":
            case "finalbalance":
            case "final_balance":
            case "balance":
              extracted.closingBalance = value;
              break;
            case "totaldeposits":
            case "total_deposits":
            case "deposits":
            case "totalcredits":
            case "total_credits":
            case "credits":
              extracted.totalDeposits = value;
              break;
            case "totalwithdrawals":
            case "total_withdrawals":
            case "withdrawals":
            case "totaldebits":
            case "total_debits":
            case "debits":
              extracted.totalWithdrawals = value;
              break;
            case "currency":
            case "currencycode":
            case "currency_code":
            case "currencytype":
            case "currency_type":
              extracted.currency = value;
              break;
            default:
              // Store any other fields
              extracted[fieldName] = value;
          }
        }
      }
    }

    // Also check for properties in the document if entities aren't available
    // AND extract additional balance information from text even if we have some entities
    if (aiResponse.document?.text) {
      const text = aiResponse.document.text;
      
      // If no entities extracted, store raw text
      if (Object.keys(extracted).length === 0) {
        extracted.rawText = text;
      }
      
      // CRITICAL: Extract "Total balance" from text (sum of all accounts)
      // Pattern: "Total balance" or "Combined balance" followed by amount
      const totalBalancePatterns = [
        /total\s+balance[:\s]*\$?([\d,]+\.?\d*)/i,
        /combined\s+balance[:\s]*\$?([\d,]+\.?\d*)/i,
        /total\s+ending\s+balance[:\s]*\$?([\d,]+\.?\d*)/i,
      ];
      
      for (const pattern of totalBalancePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          extracted.totalBalance = match[1];
          // If we don't have closingBalance, use totalBalance
          if (!extracted.closingBalance) {
            extracted.closingBalance = match[1];
          }
          break;
        }
      }
      
      // Extract individual account ending balances
      // Pattern: "Ending balance on [date]" or "Ending balance" followed by amount
      const endingBalancePatterns = [
        /ending\s+balance\s+on\s+[^$]*\$?([\d,]+\.?\d*)/i,
        /ending\s+balance[:\s]*\$?([\d,]+\.?\d*)/i,
      ];
      
      // Extract all ending balances (there may be multiple accounts)
      const endingBalances: string[] = [];
      for (const pattern of endingBalancePatterns) {
        const matches = text.matchAll(new RegExp(pattern.source, 'gi'));
        for (const match of matches) {
          if (match[1] && !endingBalances.includes(match[1])) {
            endingBalances.push(match[1]);
          }
        }
      }
      
      // If we have multiple ending balances, store them
      if (endingBalances.length > 0) {
        extracted.endingBalances = endingBalances;
        // Use the highest or sum them (will be handled in aggregation)
        if (!extracted.closingBalance && endingBalances.length === 1) {
          extracted.closingBalance = endingBalances[0];
        }
      }
    }

    // Note: _rawResponse is not stored here to avoid database size issues
    // A summary is created in the main processing function if needed
  } catch (error) {
    console.error("Error extracting bank statement data:", error);
    extracted._error = "Failed to parse extracted data";
  }

  return extracted;
}

/**
 * Extract Ties to Country data from Google Document AI response
 * This handles various document types that prove ties to home country
 */
function extractTiesToCountryData(aiResponse: any): ExtractedTiesToCountryData {
  const extracted: ExtractedTiesToCountryData = {};

  try {
    // Google Document AI returns entities in the document.entities array
    if (aiResponse.document?.entities) {
      for (const entity of aiResponse.document.entities) {
        const fieldName = entity.type?.toLowerCase().replace(/\s+/g, "");
        const value = entity.mentionText || entity.normalizedValue?.text || entity.textAnchor?.content;

        if (fieldName && value) {
          // Map common Ties to Country field names
          switch (fieldName) {
            case "documenttype":
            case "document_type":
            case "type":
            case "doctype":
              extracted.documentType = value;
              break;
            case "ownername":
            case "owner_name":
            case "name":
            case "fullname":
            case "full_name":
              extracted.ownerName = value;
              break;
            case "propertyaddress":
            case "property_address":
            case "address":
            case "propertylocation":
            case "property_location":
              extracted.propertyAddress = value;
              break;
            case "propertyvalue":
            case "property_value":
            case "value":
            case "estimatedvalue":
            case "estimated_value":
              extracted.propertyValue = value;
              break;
            case "employmentcompany":
            case "employment_company":
            case "company":
            case "employer":
            case "companyname":
            case "company_name":
              extracted.employmentCompany = value;
              break;
            case "employmentposition":
            case "employment_position":
            case "position":
            case "jobtitle":
            case "job_title":
            case "title":
              extracted.employmentPosition = value;
              break;
            case "employmentstartdate":
            case "employment_start_date":
            case "startdate":
            case "start_date":
            case "hiredate":
            case "hire_date":
              extracted.employmentStartDate = value;
              break;
            case "relationshiptype":
            case "relationship_type":
            case "relationship":
              extracted.relationshipType = value;
              break;
            case "familymembername":
            case "family_member_name":
            case "membername":
            case "member_name":
              extracted.familyMemberName = value;
              break;
            case "documentdate":
            case "document_date":
            case "date":
            case "issuedate":
            case "issue_date":
              extracted.documentDate = value;
              break;
            case "issuingauthority":
            case "issuing_authority":
            case "authority":
            case "issuer":
              extracted.issuingAuthority = value;
              break;
            default:
              // Store any other fields
              extracted[fieldName] = value;
          }
        }
      }
    }

    // Also check for properties in the document if entities aren't available
    if (Object.keys(extracted).length === 0 && aiResponse.document?.text) {
      // Fallback: try to extract from full text if structured entities aren't available
      const text = aiResponse.document.text;
      extracted.rawText = text;
    }

    // Note: _rawResponse is not stored here to avoid database size issues
    // A summary is created in the main processing function if needed
  } catch (error) {
    console.error("Error extracting Ties to Country data:", error);
    extracted._error = "Failed to parse extracted data";
  }

  return extracted;
}

/**
 * Extract Assets Documents data from Google Document AI response
 * This handles various asset documents (property deeds, vehicle titles, investment statements, etc.)
 */
function extractAssetsData(aiResponse: any): ExtractedAssetsData {
  const extracted: ExtractedAssetsData = {};

  try {
    // Google Document AI returns entities in the document.entities array
    if (aiResponse.document?.entities) {
      for (const entity of aiResponse.document.entities) {
        const fieldName = entity.type?.toLowerCase().replace(/\s+/g, "");
        const value = entity.mentionText || entity.normalizedValue?.text || entity.textAnchor?.content;

        if (fieldName && value) {
          // Map common Assets Documents field names
          switch (fieldName) {
            case "assettype":
            case "asset_type":
            case "type":
            case "category":
              extracted.assetType = value;
              break;
            case "ownername":
            case "owner_name":
            case "name":
            case "fullname":
            case "full_name":
            case "holdername":
            case "holder_name":
              extracted.ownerName = value;
              break;
            case "assetdescription":
            case "asset_description":
            case "description":
            case "details":
              extracted.assetDescription = value;
              break;
            case "assetvalue":
            case "asset_value":
            case "value":
            case "estimatedvalue":
            case "estimated_value":
            case "currentvalue":
            case "current_value":
              extracted.assetValue = value;
              break;
            case "assetlocation":
            case "asset_location":
            case "location":
            case "address":
            case "propertyaddress":
            case "property_address":
              extracted.assetLocation = value;
              break;
            case "purchasedate":
            case "purchase_date":
            case "dateofpurchase":
            case "date_of_purchase":
            case "acquisitiondate":
            case "acquisition_date":
              extracted.purchaseDate = value;
              break;
            case "currentvalue":
            case "current_value":
            case "marketvalue":
            case "market_value":
            case "appraisedvalue":
            case "appraised_value":
              extracted.currentValue = value;
              break;
            case "accountnumber":
            case "account_number":
            case "accountno":
            case "account_no":
            case "acctnumber":
            case "acct_number":
              extracted.accountNumber = value;
              break;
            case "institutionname":
            case "institution_name":
            case "institution":
            case "bankname":
            case "bank_name":
            case "companyname":
            case "company_name":
              extracted.institutionName = value;
              break;
            case "documentdate":
            case "document_date":
            case "date":
            case "issuedate":
            case "issue_date":
              extracted.documentDate = value;
              break;
            default:
              // Store any other fields
              extracted[fieldName] = value;
          }
        }
      }
    }

    // Also check for properties in the document if entities aren't available
    if (Object.keys(extracted).length === 0 && aiResponse.document?.text) {
      // Fallback: try to extract from full text if structured entities aren't available
      const text = aiResponse.document.text;
      extracted.rawText = text;
    }

    // Note: _rawResponse is not stored here to avoid database size issues
    // A summary is created in the main processing function if needed
  } catch (error) {
    console.error("Error extracting Assets data:", error);
    extracted._error = "Failed to parse extracted data";
  }

  return extracted;
}

