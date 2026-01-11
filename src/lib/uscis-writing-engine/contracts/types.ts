/**
 * TypeScript interface for I-539 Cover Letter Schema
 * Generated from i539.schema.json
 */
export interface I539SchemaData {
  applicant_address_line1: string;
  applicant_address_line2?: string;
  applicant_city_state_zip: string;
  date: string;
  uscis_address_line1: string;
  uscis_address_line2: string;
  uscis_address_line3: string;
  // Introduction section
  applicant_title?: string;
  applicant_full_name: string;
  applicant_full_name_uppercase: string;
  current_status_description: string;
  requested_status_description: string;
  dependent_introduction?: string;
  // Case background and other sections
  entry_date: string;
  current_status: string;
  requested_status: string;
  home_country: string;
  ina_section: string;
  cfr_section: string;
  maintenance_cfr_reference: string;
  intent_cfr_reference: string;
  financial_cfr_reference: string;
  personal_funds_usd: string;
  sponsor_name?: string;
  tuition_coverage_period?: string;
  signatory_name: string;
  signatory_title?: string;
  organization_name?: string;
}

