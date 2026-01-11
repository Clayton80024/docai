/**
 * Document Requirements Helper
 * 
 * This module determines which documents are required based on
 * the application form data submitted by the user.
 */

export type DocumentCategory = 
  | "applicant_required"
  | "ties_to_country"
  | "dependents"
  | "financial_self"
  | "financial_sponsor"
  | "financial_scholarship"
  | "financial_other";

export interface RequiredDocument {
  id: string;
  category: DocumentCategory;
  type: string;
  label: string;
  description?: string;
  required: boolean;
  quantity?: number; // For dependents, this indicates how many are needed
}

export interface DocumentRequirements {
  documents: RequiredDocument[];
  totalRequired: number;
  byCategory: Record<DocumentCategory, RequiredDocument[]>;
}

interface FormData {
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

/**
 * Determines required documents based on application form data
 */
export function getRequiredDocuments(formData: FormData): DocumentRequirements {
  const documents: RequiredDocument[] = [];

  // Always required documents for all applicants
  documents.push({
    id: "applicant_passport",
    category: "applicant_required",
    type: "passport",
    label: "Passaporte do Aplicante",
    description: "Passaporte válido do aplicante",
    required: true,
  });

  documents.push({
    id: "applicant_i94",
    category: "applicant_required",
    type: "i94",
    label: "I-94 do Aplicante",
    description: "Registro de entrada/saída I-94",
    required: true,
  });

  documents.push({
    id: "applicant_i20",
    category: "applicant_required",
    type: "i20",
    label: "I-20 do Aplicante",
    description: "Formulário I-20 (Certificado de Elegibilidade para Status de Estudante Não Imigrante)",
    required: true,
  });

  // Step 2: Ties to Country - Always show as optional documents
  // User uploads if applicable, AI will determine whether to mention in cover letter
  documents.push({
    id: "ties_supporting_documents",
    category: "ties_to_country",
    type: "supporting_documents",
    label: "Documentos de Vínculos com o País",
    description: "Envie documentos que comprovam vínculos com o país de origem (escrituras, cartas de emprego, etc.) - Opcional, mas recomendado para fortalecer a aplicação",
    required: false,
  });

  // Step 3: Dependents - Always show as optional documents
  // User uploads if applicable, AI will determine whether to mention in cover letter
  documents.push({
    id: "dependent_passports",
    category: "dependents",
    type: "dependent_passport",
    label: "Passaporte(s) de Dependente(s)",
    description: "Envie o passaporte de cada dependente (cônjuge/filhos) - Pule se não tiver dependentes",
    required: false,
  });

  documents.push({
    id: "dependent_i94s",
    category: "dependents",
    type: "dependent_i94",
    label: "Registro(s) I-94 de Dependente(s)",
    description: "Envie o registro I-94 de entrada/saída de cada dependente - Pule se não tiver dependentes",
    required: false,
  });

  documents.push({
    id: "dependent_i20s",
    category: "dependents",
    type: "dependent_i20",
    label: "I-20 F-2 de Dependente(s)",
    description: "Envie o Formulário I-20 F-2 de cada dependente - Pule se não tiver dependentes",
    required: false,
  });

  // Step 7: Financial Support - Always show financial documents
  // Show all financial document options, user can upload based on their funding source
  // If formData has fundingSource, mark appropriate ones as required
  
  const fundingSource = formData.financialSupport?.fundingSource;

  // Always show self-funded documents (most common case)
  documents.push({
    id: "applicant_bank_statements",
    category: "financial_self",
    type: "bank_statement",
    label: "Extratos Bancários do Aplicante",
    description: fundingSource === "self" 
      ? "Extratos bancários mostrando fundos suficientes para os estudos (Obrigatório)"
      : "Extratos bancários mostrando fundos suficientes para os estudos (se aplicável)",
    required: fundingSource === "self",
  });

  documents.push({
    id: "applicant_assets",
    category: "financial_self",
    type: "assets",
    label: "Documentos de Bens do Aplicante",
    description: fundingSource === "self"
      ? "Documentos que comprovam propriedade de bens (Obrigatório)"
      : "Documentos que comprovam propriedade de bens (se aplicável)",
    required: fundingSource === "self",
  });

  // Always show sponsor documents (common case)
  documents.push({
    id: "sponsor_bank_statements",
    category: "financial_sponsor",
    type: "sponsor_bank_statement",
    label: "Extratos Bancários do Patrocinador",
    description: fundingSource === "sponsor"
      ? "Extratos bancários do patrocinador mostrando fundos suficientes (Obrigatório)"
      : "Extratos bancários do patrocinador mostrando fundos suficientes (se aplicável)",
    required: fundingSource === "sponsor",
  });

  documents.push({
    id: "sponsor_assets",
    category: "financial_sponsor",
    type: "sponsor_assets",
    label: "Documentos de Bens do Patrocinador",
    description: fundingSource === "sponsor"
      ? "Documentos que comprovam bens do patrocinador (Obrigatório)"
      : "Documentos que comprovam bens do patrocinador (se aplicável)",
    required: fundingSource === "sponsor",
  });

  // Show scholarship document if applicable
  documents.push({
    id: "scholarship_award_letter",
    category: "financial_scholarship",
    type: "scholarship_document",
    label: "Carta de Concessão de Bolsa",
    description: fundingSource === "scholarship"
      ? "Documentação oficial de bolsa ou auxílio concedido (Obrigatório)"
      : "Documentação oficial de bolsa ou auxílio concedido (se aplicável)",
    required: fundingSource === "scholarship",
  });

  // Show other funding document if applicable
  documents.push({
    id: "other_funding_documents",
    category: "financial_other",
    type: "other_funding",
    label: "Documentação de Outra Fonte de Financiamento",
    description: fundingSource === "other"
      ? "Documentação que comprova a fonte alternativa de financiamento (Obrigatório)"
      : "Documentação que comprova a fonte alternativa de financiamento (se aplicável)",
    required: fundingSource === "other",
  });

  // Organize by category
  const byCategory: Record<DocumentCategory, RequiredDocument[]> = {
    applicant_required: [],
    ties_to_country: [],
    dependents: [],
    financial_self: [],
    financial_sponsor: [],
    financial_scholarship: [],
    financial_other: [],
  };

  documents.forEach((doc) => {
    byCategory[doc.category].push(doc);
  });

  return {
    documents,
    totalRequired: documents.length,
    byCategory,
  };
}

/**
 * Get a summary of required documents for display
 */
export function getDocumentSummary(requirements: DocumentRequirements): {
  total: number;
  byCategory: {
    category: string;
    count: number;
    documents: RequiredDocument[];
  }[];
} {
  const categoryLabels: Record<DocumentCategory, string> = {
    applicant_required: "Documentos Obrigatórios",
    ties_to_country: "Vínculos com o País (Opcional)",
    dependents: "Dependentes (Opcional)",
    financial_self: "Recursos Financeiros do Aplicante",
    financial_sponsor: "Recursos Financeiros do Patrocinador",
    financial_scholarship: "Recursos Financeiros (Bolsa)",
    financial_other: "Recursos Financeiros (Outro)",
  };

  // Define explicit order to ensure consistent display
  const categoryOrder: DocumentCategory[] = [
    "applicant_required",
    "ties_to_country",
    "dependents",
    "financial_self",
    "financial_sponsor",
    "financial_scholarship",
    "financial_other",
  ];

  const byCategory = categoryOrder
    .filter((category) => requirements.byCategory[category] && requirements.byCategory[category].length > 0)
    .map((category) => ({
      category: categoryLabels[category],
      count: requirements.byCategory[category].length,
      documents: requirements.byCategory[category],
    }));

  return {
    total: requirements.totalRequired,
    byCategory,
  };
}

