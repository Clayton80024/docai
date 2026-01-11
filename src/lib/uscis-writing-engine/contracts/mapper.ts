import { AggregatedApplicationData } from "@/lib/application-data-aggregator";
import { I539SchemaData } from "./types";
import { sanitizeNationality } from "@/lib/utils/sanitize-nationality";

/**
 * Format date to "Month Day, Year" format (e.g., "December 18, 2025")
 */
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "";
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format monetary value to "USD $X,XXX" format
 */
function formatCurrency(amount: string | undefined): string {
  if (!amount) return "USD $0";
  
  // Remove any existing currency symbols and spaces
  const cleaned = amount.replace(/[^\d.,]/g, "");
  const numValue = parseFloat(cleaned.replace(/,/g, ""));
  
  if (isNaN(numValue)) return `USD ${amount}`;
  
  return `USD $${numValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Get USCIS filing address based on state
 */
function getUSCISAddress(state?: string): { line1: string; line2: string; line3: string } {
  // Default USCIS address for Form I-539
  return {
    line1: "U.S. Citizenship and Immigration Services",
    line2: "P.O. Box 805887",
    line3: "Chicago, IL 60680-4120",
  };
}

/**
 * Map AggregatedApplicationData to I539SchemaData
 */
export function mapToI539Schema(
  data: AggregatedApplicationData
): I539SchemaData {
  const address = data.application.currentAddress;
  
  // Format applicant address
  const applicantAddressLine1 = address?.street || "";
  const applicantAddressLine2 = ""; // Optional second line
  const applicantCityStateZip = [
    address?.city,
    address?.state,
    address?.zipCode,
  ]
    .filter(Boolean)
    .join(", ");

  // Format current date
  const currentDate = formatDate(new Date().toISOString());

  // Get USCIS address
  const uscisAddress = getUSCISAddress(address?.state);

  // Extract entry date
  const entryDate = formatDate(data.documents.i94?.dateOfAdmission);

  // Get current status (normalize to B-2 if B1/B2/WB/WT)
  const classOfAdmission = data.documents.i94?.classOfAdmission?.toUpperCase() || "";
  let currentStatus = "B-2";
  if (classOfAdmission === "B1" || classOfAdmission === "WB") {
    currentStatus = "B-1";
  } else if (classOfAdmission === "B2" || classOfAdmission === "WT") {
    currentStatus = "B-2";
  } else if (classOfAdmission) {
    currentStatus = classOfAdmission;
  }

  // Requested status is always F-1 for this application type
  const requestedStatus = "F-1";

  // Get home country (sanitize nationality)
  const rawNationality = data.documents.passport?.nationality || data.application.country || "";
  const homeCountry = sanitizeNationality(rawNationality) || rawNationality;

  // Legal references
  const inaSection = "248";
  const cfrSection = "8 C.F.R. § 248.1";
  const maintenanceCfrReference = "8 C.F.R. § 248.1";
  const intentCfrReference = "8 C.F.R. § 214.2(f)(10)";
  const financialCfrReference = "8 C.F.R. § 214.2(f)(1)(i)(B)";

  // Format financial information
  const savingsAmount = data.formData.financialSupport?.savingsAmount || "";
  const personalFundsUsd = formatCurrency(savingsAmount);

  // Sponsor information
  const sponsorName = data.formData.financialSupport?.sponsorName || "";

  // Tuition coverage period (default to first 12 months)
  const tuitionCoveragePeriod = "first 12 months";

  // Get signatory name (from passport, I-94, or I-20)
  const signatoryName =
    data.documents.passport?.name ||
    data.documents.i94?.name ||
    data.documents.i20?.studentName ||
    data.user.fullName ||
    "Applicant";

  // Optional fields
  const signatoryTitle = ""; // Usually empty for self-filed applications
  const organizationName = ""; // Usually empty for self-filed applications

  // Introduction section fields
  const applicantFullName = signatoryName;
  const applicantFullNameUppercase = applicantFullName.toUpperCase();
  
  // Determine title (Mr./Mrs./Ms.) - simple heuristic based on name or default to Mr.
  let applicantTitle = "Mr.";
  // Could be enhanced with gender detection if available, but defaulting to Mr. for now
  
  // Status descriptions
  const statusDescriptions: Record<string, string> = {
    "B-1": "Business Visitor",
    "B-2": "Visitor",
    "B1": "Business Visitor",
    "B2": "Visitor",
    "WB": "Business Visitor",
    "WT": "Visitor",
  };
  const currentStatusDescription = statusDescriptions[classOfAdmission] || statusDescriptions[currentStatus] || "Visitor";
  const requestedStatusDescription = "Academic Student";
  
  // Build dependent introduction if dependents exist
  let dependentIntroduction = "";
  if (data.formData.dependents?.hasDependents && data.formData.dependents.dependents.length > 0) {
    const dependents = data.formData.dependents.dependents;
    const spouse = dependents.find(d => d.relationship.toLowerCase().includes("spouse") || d.relationship.toLowerCase().includes("wife") || d.relationship.toLowerCase().includes("husband"));
    
    if (spouse) {
      const spouseName = spouse.fullName.toUpperCase();
      const spouseTitle = spouse.relationship.toLowerCase().includes("wife") ? "Mrs." : "Mr.";
      dependentIntroduction = ` His spouse, ${spouseName}, the Dependent, concurrently requests a change of status to F-2 (Dependent Spouse of Student).`;
    } else if (dependents.length > 0) {
      // Handle other dependents
      const firstDependent = dependents[0];
      const dependentName = firstDependent.fullName.toUpperCase();
      dependentIntroduction = ` The Dependent, ${dependentName}, concurrently requests a change of status to F-2.`;
    }
  }

  return {
    applicant_address_line1: applicantAddressLine1,
    applicant_address_line2: applicantAddressLine2,
    applicant_city_state_zip: applicantCityStateZip,
    date: currentDate,
    uscis_address_line1: uscisAddress.line1,
    uscis_address_line2: uscisAddress.line2,
    uscis_address_line3: uscisAddress.line3,
    // Introduction section
    applicant_title: applicantTitle,
    applicant_full_name: applicantFullName,
    applicant_full_name_uppercase: applicantFullNameUppercase,
    current_status_description: currentStatusDescription,
    requested_status_description: requestedStatusDescription,
    dependent_introduction: dependentIntroduction,
    // Case background and other sections
    entry_date: entryDate,
    current_status: currentStatus,
    requested_status: requestedStatus,
    home_country: homeCountry,
    ina_section: inaSection,
    cfr_section: cfrSection,
    maintenance_cfr_reference: maintenanceCfrReference,
    intent_cfr_reference: intentCfrReference,
    financial_cfr_reference: financialCfrReference,
    personal_funds_usd: personalFundsUsd,
    sponsor_name: sponsorName,
    tuition_coverage_period: tuitionCoveragePeriod,
    signatory_name: signatoryName,
    signatory_title: signatoryTitle,
    organization_name: organizationName,
  };
}

