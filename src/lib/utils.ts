import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Builds a URL with case_id as a query parameter
 * @param basePath - The base path (e.g., "/applications/123/documents")
 * @param caseId - The case ID to include as a query parameter
 * @returns The URL with case_id query parameter
 */
export function buildUrlWithCaseId(basePath: string, caseId?: string | null): string {
  if (!caseId) {
    return basePath;
  }
  const separator = basePath.includes("?") ? "&" : "?";
  return `${basePath}${separator}case_id=${encodeURIComponent(caseId)}`;
}
