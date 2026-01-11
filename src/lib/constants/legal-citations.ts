/**
 * Legal citations in ASCII format for PDF compatibility
 * All citations use plain ASCII characters (no Unicode symbols like §)
 * 
 * CRITICAL: For Change of Status (B-1/B-2 → F-1), use:
 * - 8 C.F.R. Section 248.1 (for maintenance of status)
 * - 8 C.F.R. Section 214.2(f) (for F-1 student status)
 * 
 * NEVER use "8 CFR § 214.1" - this is generic and does not help
 */
export const LEGAL_CITATIONS = {
  INA_248: "Section 248 of the Immigration and Nationality Act",
  CFR_248_1: "8 C.F.R. Section 248.1",
  CFR_214_2_F: "8 C.F.R. Section 214.2(f)",
} as const;

/**
 * Helper to format legal basis section with all citations
 */
export function formatLegalBasis(): string {
  return `The request is submitted pursuant to ${LEGAL_CITATIONS.INA_248}, ${LEGAL_CITATIONS.CFR_248_1}, and ${LEGAL_CITATIONS.CFR_214_2_F}.`;
}


