/**
 * Extract financial data from a text paragraph (e.g. from cover letter).
 * Used by generateUSCISPdf and by the React-PDF combined document flow.
 */
export function extractFinancialData(paragraph: string): {
  isFinancialSection: boolean;
  financialRequirements?: {
    tuition?: string;
    livingExpenses?: string;
    totalRequired?: string;
  };
  availableResources?: {
    personalFunds?: string;
    sponsorName?: string;
    sponsorAmount?: string;
    totalAvailable?: string;
  };
} {
  const text = paragraph.toLowerCase();

  const hasFinancialKeywords =
    text.includes("financial requirements") ||
    text.includes("available financial resources");

  const hasStructuredData =
    text.includes("usd $") ||
    (text.includes("tuition:") && text.includes("living expenses:"));

  const financialLinePattern =
    /^(financial requirements:|available financial resources:|tuition:|living expenses:|total required:|personal funds:|personal\s+financial\s+funds:|financial\s+sponsorship\s+by|financial\s+sponsorship:|sponsor:|total available:)/i;
  const lines = paragraph
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const allLinesFinancial =
    lines.length > 0 &&
    lines.every((line) => {
      const normalized = line
        .replace(/\s*\([^)]*\)\s*$/, "")
        .replace(/^[-*]\s*/, "")
        .trim();
      return financialLinePattern.test(normalized);
    });

  const isFinancialSection =
    hasFinancialKeywords && hasStructuredData && allLinesFinancial;

  if (!isFinancialSection) {
    return { isFinancialSection: false };
  }

  const result: {
    isFinancialSection: boolean;
    financialRequirements?: {
      tuition?: string;
      livingExpenses?: string;
      totalRequired?: string;
    };
    availableResources?: {
      personalFunds?: string;
      sponsorName?: string;
      sponsorAmount?: string;
      totalAvailable?: string;
    };
  } = {
    isFinancialSection: true,
    financialRequirements: {},
    availableResources: {},
  };

  const tuitionMatch =
    paragraph.match(/tuition[:\s]*usd\s*\$?([\d,]+)/i) ||
    paragraph.match(/tuition[:\s]*\$?([\d,]+)/i);
  if (tuitionMatch) result.financialRequirements!.tuition = tuitionMatch[1];

  const livingMatch =
    paragraph.match(/living\s+expenses[:\s]*usd\s*\$?([\d,]+)/i) ||
    paragraph.match(/living\s+expenses[:\s]*\$?([\d,]+)/i);
  if (livingMatch)
    result.financialRequirements!.livingExpenses = livingMatch[1];

  const totalRequiredMatch =
    paragraph.match(/total\s+required[:\s]*usd\s*\$?([\d,]+)/i) ||
    paragraph.match(/total\s+required[:\s]*\$?([\d,]+)/i);
  if (totalRequiredMatch)
    result.financialRequirements!.totalRequired = totalRequiredMatch[1];

  const personalFundsMatch =
    paragraph.match(/personal\s+(?:financial\s+)?funds[:\s]*usd\s*\$?([\d,.]+)/i) ||
    paragraph.match(/personal\s+(?:financial\s+)?funds[:\s]*\$?([\d,.]+)/i);
  if (personalFundsMatch)
    result.availableResources!.personalFunds = personalFundsMatch[1];

  const sponsorMatch =
    paragraph.match(/financial\s+sponsorship\s+by\s+([^:]+):\s*usd\s*\$?([\d,.]+)/i) ||
    paragraph.match(
      /financial\s+sponsorship\s*:\s*([^:]+):\s*usd\s*\$?([\d,.]+)/i
    ) ||
    paragraph.match(/sponsor[:\s]*([^:]+)[:\s]*usd\s*\$?([\d,.]+)/i);
  if (sponsorMatch) {
    result.availableResources!.sponsorName = sponsorMatch[1].trim();
    result.availableResources!.sponsorAmount = sponsorMatch[2];
  }

  const totalAvailableMatch =
    paragraph.match(/total\s+available[:\s]*usd\s*\$?([\d,.]+)/i) ||
    paragraph.match(/total\s+available[:\s]*\$?([\d,.]+)/i);
  if (totalAvailableMatch)
    result.availableResources!.totalAvailable = totalAvailableMatch[1];

  return result;
}
