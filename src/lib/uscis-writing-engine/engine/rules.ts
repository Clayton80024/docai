import { I539SchemaData } from "../contracts/types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate I539SchemaData according to business rules
 */
export function validateI539Data(data: I539SchemaData): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields validation
  if (!data.entry_date || data.entry_date.trim() === "") {
    errors.push("entry_date is required");
  }

  if (!data.current_status || data.current_status.trim() === "") {
    errors.push("current_status is required");
  }

  if (!data.requested_status || data.requested_status.trim() === "") {
    errors.push("requested_status is required");
  }

  if (!data.home_country || data.home_country.trim() === "") {
    errors.push("home_country is required");
  }

  if (!data.signatory_name || data.signatory_name.trim() === "") {
    errors.push("signatory_name is required");
  }

  if (!data.applicant_address_line1 || data.applicant_address_line1.trim() === "") {
    errors.push("applicant_address_line1 is required");
  }

  if (!data.applicant_city_state_zip || data.applicant_city_state_zip.trim() === "") {
    errors.push("applicant_city_state_zip is required");
  }

  // Date validation
  if (data.entry_date) {
    const entryDate = new Date(data.entry_date);
    if (isNaN(entryDate.getTime())) {
      errors.push(`Invalid entry_date format: ${data.entry_date}`);
    } else {
      const today = new Date();
      if (entryDate > today) {
        errors.push("entry_date cannot be in the future");
      }
    }
  }

  // Status validation
  const validCurrentStatuses = ["B-1", "B-2", "WB", "WT"];
  if (data.current_status && !validCurrentStatuses.includes(data.current_status)) {
    warnings.push(
      `current_status '${data.current_status}' may not be eligible for change of status to F-1`
    );
  }

  if (data.requested_status !== "F-1") {
    warnings.push(
      `requested_status '${data.requested_status}' is not F-1 - ensure this is correct`
    );
  }

  // Legal references validation
  if (data.ina_section !== "248") {
    warnings.push(`ina_section should be '248' for Form I-539, found '${data.ina_section}'`);
  }

  // Financial validation
  if (data.personal_funds_usd) {
    const fundsMatch = data.personal_funds_usd.match(/\$?([\d,]+)/);
    if (fundsMatch) {
      const amount = parseFloat(fundsMatch[1].replace(/,/g, ""));
      if (amount < 0) {
        errors.push("personal_funds_usd cannot be negative");
      } else if (amount < 1000) {
        warnings.push("personal_funds_usd seems low for F-1 status requirements");
      }
    }
  }

  // Sponsor validation
  if (data.sponsor_name && data.sponsor_name.trim() !== "") {
    if (!data.personal_funds_usd || data.personal_funds_usd === "USD $0") {
      warnings.push(
        "sponsor_name provided but no personal_funds_usd - ensure financial capacity is documented"
      );
    }
  }

  // Address validation
  if (data.applicant_address_line1 && data.applicant_address_line1.length < 5) {
    warnings.push("applicant_address_line1 seems too short");
  }

  if (
    data.applicant_city_state_zip &&
    !data.applicant_city_state_zip.includes(",")
  ) {
    warnings.push(
      "applicant_city_state_zip should include city, state, and ZIP separated by commas"
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

