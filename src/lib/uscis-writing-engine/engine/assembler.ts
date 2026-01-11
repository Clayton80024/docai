import fs from "fs/promises";
import path from "path";
import { renderTemplate } from "./renderTemplate";
import { I539SchemaData } from "../contracts/types";

/**
 * Template file order (must be loaded in this exact sequence)
 */
const TEMPLATE_ORDER = [
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

/**
 * Assemble cover letter from templates
 * 
 * Reads templates in numeric order, renders each with provided data,
 * and concatenates them into final cover letter text.
 * 
 * @param data - I539SchemaData object with all required variables
 * @returns Complete cover letter text
 */
export async function assemble(data: I539SchemaData): Promise<string> {
  // Get template directory path
  // Use process.cwd() which works in both dev and production
  // In Next.js, this points to the project root
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

  const sections: string[] = [];

  // Load and render each template in order
  for (const filename of TEMPLATE_ORDER) {
    const filePath = path.join(templateDir, filename);
    
    try {
      const template = await fs.readFile(filePath, "utf-8");
      const rendered = renderTemplate(template, data as unknown as Record<string, string | undefined>);
      sections.push(rendered);
    } catch (error: any) {
      console.error(`Error loading template ${filename}:`, error);
      throw new Error(`Failed to load template ${filename}: ${error.message}`);
    }
  }

  // Join sections with double newline for proper spacing
  return sections.join("\n\n").trim();
}

