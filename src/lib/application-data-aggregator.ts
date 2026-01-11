/**
 * Application Data Aggregator
 * 
 * Collects and structures all application data (form data + extracted document data)
 * for use in AI document generation
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { currentUser } from "@clerk/nextjs/server";

export interface AggregatedApplicationData {
  // User Information
  user: {
    firstName?: string;
    lastName?: string;
    email?: string;
    fullName?: string;
  };
  
  // Application Information
  application: {
    id: string;
    country: string;
    visaType: string;
    currentAddress?: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
    };
  };
  
  // Form Data
  formData: {
    tiesToCountry?: {
      question1: string;
      question2: string;
      question3: string;
    };
    dependents?: {
      hasDependents: boolean;
      dependents: Array<{
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
  };
  
  // Extracted Document Data
  documents: {
    passport?: {
      name?: string;
      passportNumber?: string;
      dateOfBirth?: string;
      placeOfBirth?: string;
      nationality?: string;
      gender?: string;
      issueDate?: string;
      expiryDate?: string;
    };
    i94?: {
      name?: string;
      admissionNumber?: string;
      classOfAdmission?: string;
      dateOfAdmission?: string;
      admitUntilDate?: string;
      passportNumber?: string;
    };
    i20?: {
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
      // Extracted structured data from document (includes annual_tuition_amount, annual_living_expenses, total_annual_cost, etc.)
      extractedData?: any;
    };
    bankStatements?: Array<{
      accountHolderName?: string;
      accountNumber?: string;
      bankName?: string;
      closingBalance?: string;
      currency?: string;
      statementPeriod?: string;
    }>;
    assets?: Array<{
      assetType?: string;
      ownerName?: string;
      assetValue?: string;
      assetDescription?: string;
    }>;
    tiesDocuments?: Array<{
      documentType?: string;
      ownerName?: string;
      propertyAddress?: string;
      propertyValue?: string;
      employmentCompany?: string;
      employmentPosition?: string;
    }>;
    scholarshipDocuments?: Array<{
      documentType?: string;
      scholarshipName?: string;
      awardAmount?: string;
      institutionName?: string;
      documentDate?: string;
      [key: string]: any;
    }>;
    otherFundingDocuments?: Array<{
      documentType?: string;
      fundingSource?: string;
      amount?: string;
      institutionName?: string;
      documentDate?: string;
      [key: string]: any;
    }>;
  };
  
  // Document List (for Exhibit List)
  documentList: Array<{
    type: string;
    name: string;
    status: string;
  }>;
  
  // Question Answers (from new 7-step questionnaire)
  questionAnswers?: Array<{
    questionId: string;
    stepNumber: number;
    theme: string;
    questionText: string;
    selectedOption: string;
    answerText: string;
    category: string | null;
    aiPromptContext: string;
  }>;
}

/**
 * Aggregate all application data for AI document generation
 */
export async function aggregateApplicationData(
  applicationId: string
): Promise<{ success: boolean; data?: AggregatedApplicationData; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const supabase = createAdminClient();

    // Fetch application
    // @ts-ignore - Supabase type inference issue
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("id, user_id, country, visa_type, form_data")
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return { success: false, error: "Application not found" };
    }

    const app = application as any;
    if (app.user_id !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Fetch all documents for this application
    // @ts-ignore - Supabase type inference issue
    const { data: documents, error: docsError } = await supabase
      .from("documents")
      .select("id, type, name, status, extracted_data")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: true });

    if (docsError) {
      console.error("Error fetching documents:", docsError);
    }

    const formData = (app.form_data as any) || {};
    
    // Debug: Log formData to verify it's being retrieved correctly
    console.log(`[aggregateApplicationData] Form Data:`, {
      hasFormData: !!app.form_data,
      hasDependents: !!formData.dependents,
      hasFinancialSupport: !!formData.financialSupport,
      hasTiesToCountry: !!formData.tiesToCountry,
      sponsorName: formData.financialSupport?.sponsorName,
      dependentsCount: formData.dependents?.dependents?.length || 0,
      tiesToCountryQuestions: formData.tiesToCountry ? {
        hasQ1: !!formData.tiesToCountry.question1,
        hasQ2: !!formData.tiesToCountry.question2,
        hasQ3: !!formData.tiesToCountry.question3,
      } : null,
    });
    
    // Fetch question answers
    const { getApplicationAnswers } = await import("./supabase/helpers");
    const questionAnswersData = await getApplicationAnswers(applicationId);
    
    const questionAnswers = questionAnswersData.map((qa) => ({
      questionId: qa.question_id,
      stepNumber: qa.application_questions?.step_number || 0,
      theme: qa.application_questions?.theme || "",
      questionText: qa.application_questions?.question_text || "",
      selectedOption: qa.selected_option,
      answerText: qa.answer_text,
      category: qa.application_questions?.category || null,
      aiPromptContext: qa.application_questions?.ai_prompt_context || "",
    }));
    
    // Extract document data by type
    const extractedDocs: AggregatedApplicationData["documents"] = {
      passport: undefined,
      i94: undefined,
      i20: undefined,
      bankStatements: [],
      assets: [],
      tiesDocuments: [],
      scholarshipDocuments: [],
      otherFundingDocuments: [],
    };

    const documentList: AggregatedApplicationData["documentList"] = [];

    ((documents || []) as any[]).forEach((doc: any) => {
      documentList.push({
        type: doc.type,
        name: doc.name,
        status: doc.status,
      });

      // Debug: Log raw extracted_data
      if (doc.type === "bank_statement" || doc.type === "sponsor_bank_statement") {
        console.log(`[aggregateApplicationData] Document ${doc.name} (${doc.type}):`, {
          hasExtractedData: !!doc.extracted_data,
          extractedDataKeys: doc.extracted_data ? Object.keys(doc.extracted_data) : [],
          extractedDataSample: doc.extracted_data ? {
            // Show first 10 keys and their types/values (truncated)
            ...Object.fromEntries(
              Object.entries(doc.extracted_data as any).slice(0, 10).map(([k, v]) => [
                k,
                typeof v === 'string' && (v as string).length > 100 
                  ? (v as string).substring(0, 100) + '...' 
                  : v
              ])
            )
          } : null,
        });
      }

      const extractedData = doc.extracted_data as any;
      if (!extractedData) {
        if (doc.type === "bank_statement" || doc.type === "sponsor_bank_statement") {
          console.warn(`[aggregateApplicationData] No extracted_data for ${doc.type} document: ${doc.name}`);
        }
        return;
      }
      
      // Debug: Log what fields we're looking for
      if (doc.type === "bank_statement" || doc.type === "sponsor_bank_statement") {
        console.log(`[aggregateApplicationData] Looking for fields in extracted_data:`, {
          accountHolderName: extractedData.accountHolderName || extractedData.account_holder_name || extractedData.accountHolder || extractedData.account_holder,
          closingBalance: extractedData.closingBalance || extractedData.closing_balance || extractedData.endingBalance || extractedData.ending_balance || extractedData.totalBalance || extractedData.total_balance || extractedData.balance,
          bankName: extractedData.bankName || extractedData.bank_name || extractedData.bank || extractedData.institutionName || extractedData.institution_name,
          hasRawText: !!extractedData.rawText,
          rawTextLength: extractedData.rawText?.length || 0,
        });
      }

      switch (doc.type) {
        case "passport":
        case "dependent_passport":
          if (!extractedDocs.passport) {
            extractedDocs.passport = {
              name: extractedData.name || (extractedData.first_name && extractedData.last_name 
                ? `${extractedData.first_name} ${extractedData.last_name}` 
                : undefined),
              passportNumber: extractedData.passportNumber || extractedData.document_number,
              dateOfBirth: extractedData.dateOfBirth || extractedData.birthDate || extractedData.birth_date,
              placeOfBirth: extractedData.placeOfBirth || extractedData.place_of_birth,
              nationality: extractedData.nationality || extractedData.country_of_citizenship || extractedData.countryOfCitizenship,
              gender: extractedData.gender,
              issueDate: extractedData.issueDate || extractedData.issue_date,
              expiryDate: extractedData.expiryDate || extractedData.expiry_date || extractedData.expirationDate,
            };
          }
          break;
        case "i94":
        case "dependent_i94":
          if (!extractedDocs.i94) {
            extractedDocs.i94 = {
              name: extractedData.name || extractedData.first_name && extractedData.last_name 
                ? `${extractedData.first_name} ${extractedData.last_name}` 
                : undefined,
              admissionNumber: extractedData.admissionNumber || extractedData.i_94_number || extractedData.admitNumber,
              classOfAdmission: extractedData.classOfAdmission || extractedData.current_visa_type || extractedData.admissionClass,
              dateOfAdmission: extractedData.dateOfAdmission || extractedData.entry_date || extractedData.admissionDate,
              admitUntilDate: extractedData.admitUntilDate || extractedData.i_94_expiry_date || extractedData.admitUntil || extractedData.expirationDate,
              passportNumber: extractedData.passportNumber || extractedData.document_number,
            };
          }
          break;
        case "i20":
        case "dependent_i20":
          if (!extractedDocs.i20) {
          extractedDocs.i20 = {
              studentName: extractedData.studentName || extractedData.student_name,
              sevisId: extractedData.sevisId || extractedData.sevis_id,
              schoolName: extractedData.schoolName || extractedData.school_name,
              programOfStudy: extractedData.programOfStudy || extractedData.program_of_study,
              programLevel: extractedData.programLevel || extractedData.program_level,
              majorField: extractedData.majorField || extractedData.major_field,
              startDate: extractedData.startDate || extractedData.start_date,
              endDate: extractedData.endDate || extractedData.end_date,
              dateOfBirth: extractedData.dateOfBirth || extractedData.date_of_birth,
              countryOfBirth: extractedData.countryOfBirth || extractedData.country_of_birth,
              countryOfCitizenship: extractedData.countryOfCitizenship || extractedData.country_of_citizenship,
            financialSupport: extractedData.financialSupport,
            // CRITICAL: Preserve all extracted structured data for financial calculations
            // This includes annual_tuition_amount, annual_living_expenses, total_annual_cost
            extractedData: extractedData as any,
          };
          }
          break;
        case "bank_statement":
        case "sponsor_bank_statement":
          // Try multiple field name variations (camelCase, snake_case, etc.)
          let accountHolderName = extractedData.accountHolderName || extractedData.account_holder_name || extractedData.accountHolder || extractedData.account_holder;
          let closingBalance = extractedData.closingBalance || extractedData.closing_balance || extractedData.endingBalance || extractedData.ending_balance || extractedData.totalBalance || extractedData.total_balance || extractedData.balance;
          let bankName = extractedData.bankName || extractedData.bank_name || extractedData.bank || extractedData.institutionName || extractedData.institution_name;
          
          // If structured fields are missing but we have rawText, try to extract from text
          if ((!accountHolderName || !closingBalance || !bankName) && extractedData.rawText) {
            const rawText = extractedData.rawText;
            
            // Extract bank name (common patterns)
            if (!bankName) {
              const bankPatterns = [
                /(?:BANK OF AMERICA|CHASE|WELLS FARGO|CITIBANK|US BANK|PNC|TD BANK|CAPITAL ONE|SUNTRUST|REGIONS|BB&T|HUNTINGTON|KEYBANK|FIFTH THIRD|M&T BANK|BMO HARRIS)/i,
                /([A-Z][A-Z\s&]+(?:BANK|BANCO|BANCO DE|NATIONAL|FEDERAL|CREDIT UNION))/i,
              ];
              for (const pattern of bankPatterns) {
                const match = rawText.match(pattern);
                if (match && match[1]) {
                  bankName = match[1].trim();
                  break;
                }
              }
            }
            
            // Extract account holder name (usually at the top of statement)
            if (!accountHolderName) {
              // Look for patterns like "Your Adv Plus Banking\nCLAYTONMELODESOUZA" or "Miguel Pereira"
              const namePatterns = [
                /(?:Your|Account Holder|Name)[:\s]*\n?([A-Z][A-Z\s]+[A-Z])/,
                /^([A-Z][A-Z\s]+(?:PEREIRA|SOUZA|SILVA|SANTOS|OLIVEIRA|COSTA|RODRIGUES|ALMEIDA|NASCIMENTO|LIMA|ARAUJO|FERREIRA|BARBOSA|RIBEIRO|CARVALHO|ALVES|MOREIRA|FERNANDES|GOMES|MARTINS))/m,
              ];
              for (const pattern of namePatterns) {
                const match = rawText.match(pattern);
                if (match && match[1]) {
                  accountHolderName = match[1].trim();
                  break;
                }
              }
            }
            
            // Extract closing balance (look for "Ending balance", "Total balance", etc.)
            if (!closingBalance) {
              const balancePatterns = [
                /(?:Ending|Closing|Total)\s+balance[:\s]*\$?([\d,]+\.?\d*)/i,
                /Total\s+balance[:\s]*\$?([\d,]+\.?\d*)/i,
                /\$([\d,]+\.?\d*)\s*(?:Total|Ending|Closing)/i,
              ];
              for (const pattern of balancePatterns) {
                const match = rawText.match(pattern);
                if (match && match[1]) {
                  closingBalance = match[1].replace(/,/g, '');
                  break;
                }
              }
            }
          }
          
          const bankStatement = {
            accountHolderName,
            accountNumber: extractedData.accountNumber || extractedData.account_number || extractedData.accountNumber || extractedData.account_number,
            bankName,
            closingBalance,
            currency: extractedData.currency || extractedData.currency_code || "USD",
            statementPeriod: extractedData.statementPeriod || extractedData.statement_period || extractedData.statementDate || extractedData.statement_date || extractedData.period,
            openingBalance: extractedData.openingBalance || extractedData.opening_balance || extractedData.beginningBalance || extractedData.beginning_balance,
            totalDeposits: extractedData.totalDeposits || extractedData.total_deposits || extractedData.deposits,
            totalWithdrawals: extractedData.totalWithdrawals || extractedData.total_withdrawals || extractedData.withdrawals,
            // Preserve all extracted data for additional fields
            extractedData: extractedData as any,
            // Also preserve the document type for sponsor identification
            type: doc.type,
          };
          
          // Debug: Log what we extracted
          console.log(`[aggregateApplicationData] Extracted bank statement for ${doc.name}:`, {
            accountHolderName: bankStatement.accountHolderName,
            closingBalance: bankStatement.closingBalance,
            bankName: bankStatement.bankName,
            type: bankStatement.type,
            extractedFromRawText: !extractedData.accountHolderName && !!extractedData.rawText,
          });
          
          extractedDocs.bankStatements?.push(bankStatement);
          break;
        case "assets":
        case "sponsor_assets":
          extractedDocs.assets?.push({
            assetType: extractedData.assetType,
            ownerName: extractedData.ownerName,
            assetValue: extractedData.assetValue,
            assetDescription: extractedData.assetDescription,
          });
          break;
        case "supporting_documents":
          extractedDocs.tiesDocuments?.push({
            documentType: extractedData.documentType,
            ownerName: extractedData.ownerName,
            propertyAddress: extractedData.propertyAddress,
            propertyValue: extractedData.propertyValue,
            employmentCompany: extractedData.employmentCompany,
            employmentPosition: extractedData.employmentPosition,
          });
          break;
        case "scholarship_document":
          extractedDocs.scholarshipDocuments?.push({
            documentType: extractedData.documentType || "scholarship_award_letter",
            scholarshipName: extractedData.scholarshipName || extractedData.institutionName,
            awardAmount: extractedData.awardAmount || extractedData.assetValue,
            institutionName: extractedData.institutionName || extractedData.bankName,
            documentDate: extractedData.documentDate,
            ...extractedData, // Include all extracted fields
          });
          break;
        case "other_funding":
          extractedDocs.otherFundingDocuments?.push({
            documentType: extractedData.documentType || "other_funding",
            fundingSource: extractedData.fundingSource || extractedData.assetDescription,
            amount: extractedData.amount || extractedData.assetValue,
            institutionName: extractedData.institutionName || extractedData.bankName,
            documentDate: extractedData.documentDate,
            ...extractedData, // Include all extracted fields
          });
          break;
      }
    });

    // Get user name from Clerk
    const fullName = user.firstName && user.lastName 
      ? `${user.firstName} ${user.lastName}`
      : user.firstName || user.lastName || undefined;

    const aggregatedData: AggregatedApplicationData = {
      user: {
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        email: user.emailAddresses[0]?.emailAddress || undefined,
        fullName,
      },
      application: {
        id: app.id,
        country: app.country,
        visaType: app.visa_type,
        currentAddress: formData.currentAddress,
      },
      formData: {
        tiesToCountry: formData.tiesToCountry,
        dependents: formData.dependents,
        financialSupport: formData.financialSupport,
      },
      documents: extractedDocs,
      documentList,
      questionAnswers: questionAnswers.length > 0 ? questionAnswers : undefined,
    };

    return { success: true, data: aggregatedData };
  } catch (error: any) {
    console.error("Error aggregating application data:", error);
    return { success: false, error: error.message || "Failed to aggregate data" };
  }
}

