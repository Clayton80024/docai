import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const LETTER = { width: 612, height: 792 }; // US Letter size in points (8.5*72, 11*72)
const MARGIN = 72; // 1 inch margin
const FONT_SIZE = 12;
const LINE_HEIGHT = 14;

/**
 * Remove problematic decorative symbols that shouldn't appear in formal documents
 * Removes sequences like ***, !!!, ???, %&, etc.
 */
function removeProblematicSymbols(text: string): string {
  if (!text) return "";
  
  let cleaned = text;
  
  // Remove sequences of asterisks (***, **) - but keep single * if it's part of a citation
  cleaned = cleaned.replace(/\*{2,}/g, "");
  
  // Remove sequences of exclamation marks (!!!, !!) - but keep single ! if it's part of proper text
  cleaned = cleaned.replace(/!{2,}/g, "");
  
  // Remove sequences of question marks (???, ??) - but keep single ? if it's part of proper text
  cleaned = cleaned.replace(/\?{2,}/g, "");
  
  // Remove sequences of percent and ampersand (%&, &%, %%, &&, etc.)
  cleaned = cleaned.replace(/[%&]{2,}/g, "");
  cleaned = cleaned.replace(/%&/g, "");
  cleaned = cleaned.replace(/&%/g, "");
  
  // Remove sequences of hash (##, ###) - but keep single # if it's part of a reference
  cleaned = cleaned.replace(/#{2,}/g, "");
  
  // Remove sequences of tildes (~~, ~~~)
  cleaned = cleaned.replace(/~{2,}/g, "");
  
  // Remove sequences of underscores (___, __) - but keep single _ as it might be in text
  cleaned = cleaned.replace(/_{2,}/g, "");
  
  // Remove sequences of equals (===, ==) - but keep single = as it might be in text
  // BUT: Don't remove if it's part of "PERSONAL STATEMENT" separator context
  cleaned = cleaned.replace(/={2,}/g, "");
  
  // Remove sequences of dashes (---, --) - but keep single - as it might be in text
  cleaned = cleaned.replace(/-{2,}/g, "");
  
  // Remove combinations of problematic symbols
  cleaned = cleaned.replace(/[*!?#]{2,}/g, "");
  
  return cleaned;
}

/**
 * Sanitize text to ASCII-compatible characters for WinAnsi encoding
 * Converts Unicode characters to their closest ASCII equivalents
 * Also removes problematic decorative symbols
 */
function sanitizeForWinAnsi(text: string): string {
  // First remove problematic symbols
  let cleaned = removeProblematicSymbols(text);
  
  // Comprehensive Unicode character mappings to ASCII
  const unicodeMap: Record<string, string> = {
    // Greek letters
    'Α': 'A', 'α': 'a',
    'Β': 'B', 'β': 'b',
    'Γ': 'G', 'γ': 'g',
    'Δ': 'D', 'δ': 'd',
    'Ε': 'E', 'ε': 'e',
    'Ζ': 'Z', 'ζ': 'z',
    'Η': 'H', 'η': 'h',
    'Θ': 'Th', 'θ': 'th',
    'Ι': 'I', 'ι': 'i',
    'Κ': 'K', 'κ': 'k',
    'Λ': 'L', 'λ': 'l',
    'Μ': 'M', 'μ': 'm',
    'Ν': 'N', 'ν': 'n',
    'Ξ': 'X', 'ξ': 'x',
    'Ο': 'O', 'ο': 'o',
    'Π': 'P', 'π': 'p',
    'Ρ': 'R', 'ρ': 'r',
    'Σ': 'S', 'σ': 's', 'ς': 's',
    'Τ': 'T', 'τ': 't',
    'Υ': 'Y', 'υ': 'y',
    'Φ': 'Ph', 'φ': 'ph',
    'Χ': 'Ch', 'χ': 'ch',
    'Ψ': 'Ps', 'ψ': 'ps',
    'Ω': 'O', 'ω': 'o',
    // Common accented characters
    'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A',
    'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
    'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
    'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
    'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I',
    'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
    'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O',
    'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
    'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U',
    'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
    'Ç': 'C', 'ç': 'c',
    'Ñ': 'N', 'ñ': 'n',
    'Ý': 'Y', 'ý': 'y', 'ÿ': 'y',
    // Special punctuation and symbols
    '\u2013': '-', '\u2014': '-',  // En dash and em dash
    '\u201C': '"', '\u201D': '"',  // Smart quotes (left/right double quotation mark)
    '\u2018': "'", '\u2019': "'",  // Smart apostrophes (left/right single quotation mark)
    '\u2026': '...',  // Ellipsis
    '\u00A7': 'S',  // Section symbol
    '\u00A9': '(c)', '\u00AE': '(R)', '\u2122': '(TM)',  // Copyright, Registered, Trademark
    '\u00B0': ' degrees',  // Degree symbol
    '\u20AC': 'EUR', '\u00A3': 'GBP', '\u00A5': 'YEN',  // Currency symbols
  };

  return text.split('').map(char => {
    // If character is in ASCII range (0-127), keep it
    if (char.charCodeAt(0) < 128) {
      return char;
    }
    // Try to find a mapping
    if (unicodeMap[char]) {
      return unicodeMap[char];
    }
    // If no mapping found, try to normalize (NFD) and remove diacritics
    try {
      const normalized = char.normalize('NFD');
      const ascii = normalized.replace(/[\u0300-\u036f]/g, '');
      // If normalization produced ASCII, use it
      if (ascii.charCodeAt(0) < 128 && ascii.length > 0) {
        return ascii;
      }
    } catch (e) {
      // If normalization fails, continue to next step
    }
    // If all else fails, try to get a reasonable replacement
    const code = char.charCodeAt(0);
    
    // Latin-1 Supplement (0x00A0-0x00FF) - most are printable in WinAnsi
    if (code >= 0x00A0 && code <= 0x00FF) {
      // Check if it's a printable character in WinAnsi
      if (code !== 0x00AD) { // Soft hyphen - remove it
        // Try to use the character directly (many Latin-1 chars work in WinAnsi)
        try {
          return String.fromCharCode(code);
        } catch {
          // If that fails, remove
          return '';
        }
      }
      return '';
    }
    
    // For other Unicode characters, try one more normalization pass
    try {
      // Try to decompose and recompose
      const decomposed = char.normalize('NFD');
      const base = decomposed.charAt(0);
      if (base.charCodeAt(0) < 128) {
        return base;
      }
    } catch {
      // Ignore normalization errors
    }
    
    // Last resort: remove the character (better than showing '?')
    return '';
  }).join('').replace(/[ \t]+/g, ' '); // Normalize multiple spaces but preserve newlines
}

/**
 * Wrap text to fit within max width
 */
function wrapTextToLines(
  text: string,
  font: any,
  fontSize: number,
  maxWidth: number
): string[] {
  const sanitizedText = sanitizeForWinAnsi(text);
  const words = sanitizedText.split(/\s+/).filter(w => w.length > 0);
  const lines: string[] = [];
  let current = "";

  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    const testWidth = font.widthOfTextAtSize(test, fontSize);

    if (testWidth <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      // Word longer than line: hard cut (rare)
      if (font.widthOfTextAtSize(w, fontSize) > maxWidth) {
        let chunk = "";
        for (const ch of w) {
          const t = chunk + ch;
          if (font.widthOfTextAtSize(t, fontSize) <= maxWidth) chunk = t;
          else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      } else {
        current = w;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Justify a line of text by adding spaces between words
 */
function justifyLine(
  line: string,
  font: any,
  fontSize: number,
  maxWidth: number
): string {
  const words = line.trim().split(/\s+/);
  if (words.length <= 1) {
    return line; // Can't justify single word or empty line
  }

  const wordsWidth = words.reduce((sum, word) => {
    return sum + font.widthOfTextAtSize(word, fontSize);
  }, 0);
  
  const spacesWidth = maxWidth - wordsWidth;
  const spaceCount = words.length - 1;
  if (spaceCount === 0) return line;
  
  const spaceWidth = spacesWidth / spaceCount;
  const baseSpaceWidth = font.widthOfTextAtSize(" ", fontSize);
  const extraSpacesPerGap = Math.floor(spaceWidth / baseSpaceWidth);
  
  // Build justified line with extra spaces
  let justified = words[0];
  for (let i = 1; i < words.length; i++) {
    const spaces = " " + " ".repeat(Math.max(0, extraSpacesPerGap));
    justified += spaces + words[i];
  }
  
  return justified;
}

/**
 * Extract financial data from text paragraph
 */
function extractFinancialData(paragraph: string): {
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
  
  // Check if this is a financial section with structured data
  // Must have both "financial" keywords AND structured currency/amount patterns
  const hasFinancialKeywords = 
    text.includes("financial requirements") || 
    text.includes("available financial resources");
  
  const hasStructuredData = 
    text.includes("usd $") || 
    (text.includes("tuition:") && text.includes("living expenses:"));
  
  const isFinancialSection = hasFinancialKeywords && hasStructuredData;
  
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
    availableResources: {}
  };
  
  // Extract Financial Requirements
  const tuitionMatch = paragraph.match(/tuition[:\s]*usd\s*\$?([\d,]+)/i) || 
                       paragraph.match(/tuition[:\s]*\$?([\d,]+)/i);
  if (tuitionMatch) {
    result.financialRequirements!.tuition = tuitionMatch[1];
  }
  
  const livingMatch = paragraph.match(/living\s+expenses[:\s]*usd\s*\$?([\d,]+)/i) ||
                      paragraph.match(/living\s+expenses[:\s]*\$?([\d,]+)/i);
  if (livingMatch) {
    result.financialRequirements!.livingExpenses = livingMatch[1];
  }
  
  const totalRequiredMatch = paragraph.match(/total\s+required[:\s]*usd\s*\$?([\d,]+)/i) ||
                              paragraph.match(/total\s+required[:\s]*\$?([\d,]+)/i);
  if (totalRequiredMatch) {
    result.financialRequirements!.totalRequired = totalRequiredMatch[1];
  }
  
  // Extract Available Resources
  const personalFundsMatch = paragraph.match(/personal\s+funds[:\s]*usd\s*\$?([\d,.]+)/i) ||
                             paragraph.match(/personal\s+funds[:\s]*\$?([\d,.]+)/i);
  if (personalFundsMatch) {
    result.availableResources!.personalFunds = personalFundsMatch[1];
  }
  
  const sponsorMatch = paragraph.match(/financial\s+sponsorship\s+by\s+([^:]+):\s*usd\s*\$?([\d,.]+)/i) ||
                       paragraph.match(/sponsor[:\s]*([^:]+)[:\s]*usd\s*\$?([\d,.]+)/i);
  if (sponsorMatch) {
    result.availableResources!.sponsorName = sponsorMatch[1].trim();
    result.availableResources!.sponsorAmount = sponsorMatch[2];
  }
  
  const totalAvailableMatch = paragraph.match(/total\s+available[:\s]*usd\s*\$?([\d,.]+)/i) ||
                              paragraph.match(/total\s+available[:\s]*\$?([\d,.]+)/i);
  if (totalAvailableMatch) {
    result.availableResources!.totalAvailable = totalAvailableMatch[1];
  }
  
  return result;
}

/**
 * Calculate the height of a financial section without drawing it
 */
function calculateFinancialSectionHeight(
  font: any,
  fontBold: any,
  fontSize: number,
  financialData: {
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
  }
): number {
  const lineHeight = fontSize + 4;
  let totalLines = 0;
  
  // Financial Requirements section
  if (financialData.financialRequirements) {
    totalLines += 2; // Header + blank line
    if (financialData.financialRequirements.tuition) totalLines++;
    if (financialData.financialRequirements.livingExpenses) totalLines++;
    if (financialData.financialRequirements.totalRequired) totalLines++;
    totalLines++; // Blank line after section
  }
  
  // Available Resources section
  if (financialData.availableResources) {
    totalLines += 2; // Header + blank line
    if (financialData.availableResources.personalFunds !== undefined) totalLines++;
    if (financialData.availableResources.sponsorName && financialData.availableResources.sponsorAmount) totalLines++;
    if (financialData.availableResources.totalAvailable) totalLines++;
    totalLines++; // Blank line after section
  }
  
  return totalLines * lineHeight;
}

/**
 * Draw a clean financial section without borders
 */
function drawFinancialSection(
  page: any,
  font: any,
  fontBold: any,
  fontSize: number,
  x: number,
  y: number,
  maxWidth: number,
  financialData: {
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
  }
): number {
  const lineHeight = fontSize + 4;
  const indent = 20; // Indentation for items
  let currentY = y;
  
  // Section 1: Financial Requirements
  if (financialData.financialRequirements) {
    // Header
    page.drawText("Financial Requirements:", {
      x: x,
      y: currentY,
      size: fontSize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    currentY -= lineHeight * 1.5;
    
    // Items
    if (financialData.financialRequirements.tuition) {
      const label = "Tuition:";
      // Sanitize and remove newlines from value
      const sanitizedTuition = sanitizeForWinAnsi(financialData.financialRequirements.tuition).replace(/\n/g, " ").trim();
      const value = `USD $${sanitizedTuition}`;
      
      page.drawText(label, {
        x: x + indent,
        y: currentY,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      const valueWidth = font.widthOfTextAtSize(value, fontSize);
      page.drawText(value, {
        x: x + maxWidth - valueWidth,
        y: currentY,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      currentY -= lineHeight;
    }
    
    if (financialData.financialRequirements.livingExpenses) {
      const label = "Living Expenses:";
      // Sanitize and remove newlines from value
      const sanitizedExpenses = sanitizeForWinAnsi(financialData.financialRequirements.livingExpenses).replace(/\n/g, " ").trim();
      const value = `USD $${sanitizedExpenses}`;
      
      page.drawText(label, {
        x: x + indent,
        y: currentY,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      const valueWidth = font.widthOfTextAtSize(value, fontSize);
      page.drawText(value, {
        x: x + maxWidth - valueWidth,
        y: currentY,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      currentY -= lineHeight;
    }
    
    if (financialData.financialRequirements.totalRequired) {
      const label = "Total Required:";
      // Sanitize and remove newlines from value
      const sanitizedTotal = sanitizeForWinAnsi(financialData.financialRequirements.totalRequired).replace(/\n/g, " ").trim();
      const value = `USD $${sanitizedTotal}`;
      
      page.drawText(label, {
        x: x + indent,
        y: currentY,
        size: fontSize,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      
      const valueWidth = fontBold.widthOfTextAtSize(value, fontSize);
      page.drawText(value, {
        x: x + maxWidth - valueWidth,
        y: currentY,
        size: fontSize,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      
      currentY -= lineHeight * 2; // Extra space after totals
    }
  }
  
  // Section 2: Available Financial Resources
  if (financialData.availableResources) {
    // Header
    page.drawText("Available Financial Resources:", {
      x: x,
      y: currentY,
      size: fontSize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    currentY -= lineHeight * 1.5;
    
    // Items
    if (financialData.availableResources.personalFunds !== undefined) {
      const label = "Personal funds:";
      // Sanitize and remove newlines from value
      const sanitizedPersonalFunds = sanitizeForWinAnsi(String(financialData.availableResources.personalFunds)).replace(/\n/g, " ").trim();
      const value = `USD $${sanitizedPersonalFunds}`;
      
      page.drawText(label, {
        x: x + indent,
        y: currentY,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      const valueWidth = font.widthOfTextAtSize(value, fontSize);
      page.drawText(value, {
        x: x + maxWidth - valueWidth,
        y: currentY,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      currentY -= lineHeight;
    }
    
    if (financialData.availableResources.sponsorName && financialData.availableResources.sponsorAmount) {
      // Sanitize sponsor name and amount to remove newlines and unsupported characters
      const sanitizedSponsorName = sanitizeForWinAnsi(financialData.availableResources.sponsorName).replace(/\n/g, " ").trim();
      const sanitizedSponsorAmount = sanitizeForWinAnsi(financialData.availableResources.sponsorAmount).replace(/\n/g, " ").trim();
      const label = `Financial sponsorship by ${sanitizedSponsorName}:`;
      const value = `USD $${sanitizedSponsorAmount}`;
      
      // Check if label is too long
      const labelWidth = font.widthOfTextAtSize(label, fontSize);
      const valueWidth = font.widthOfTextAtSize(value, fontSize);
      
      if (labelWidth + valueWidth + 20 > maxWidth) {
        // Split into two lines
        page.drawText(label, {
          x: x + indent,
          y: currentY,
          size: fontSize,
          font: font,
          color: rgb(0, 0, 0),
        });
        currentY -= lineHeight;
        
        page.drawText(value, {
          x: x + maxWidth - valueWidth,
          y: currentY,
          size: fontSize,
          font: font,
          color: rgb(0, 0, 0),
        });
      } else {
        // Same line
        page.drawText(label, {
          x: x + indent,
          y: currentY,
          size: fontSize,
          font: font,
          color: rgb(0, 0, 0),
        });
        
        page.drawText(value, {
          x: x + maxWidth - valueWidth,
          y: currentY,
          size: fontSize,
          font: font,
          color: rgb(0, 0, 0),
        });
      }
      
      currentY -= lineHeight;
    }
    
    if (financialData.availableResources.totalAvailable) {
      const label = "Total Available:";
      // Sanitize and remove newlines from value
      const sanitizedTotalAvailable = sanitizeForWinAnsi(financialData.availableResources.totalAvailable).replace(/\n/g, " ").trim();
      const value = `USD $${sanitizedTotalAvailable}`;
      
      page.drawText(label, {
        x: x + indent,
        y: currentY,
        size: fontSize,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      
      const valueWidth = fontBold.widthOfTextAtSize(value, fontSize);
      page.drawText(value, {
        x: x + maxWidth - valueWidth,
        y: currentY,
        size: fontSize,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      
      currentY -= lineHeight * 2; // Extra space after section
    }
  }
  
  return currentY;
}

/**
 * Generate USCIS-style PDF from cover letter text
 * 
 * @param text - Complete cover letter text (from assembled templates)
 * @param skipSignature - If true, skip adding signature line at the end (default: false)
 * @returns PDF bytes as Uint8Array
 */
export async function generateUSCISPdf(text: string, skipSignature: boolean = false): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  const pages: any[] = [];
  pages.push(pdfDoc.addPage([LETTER.width, LETTER.height]));
  let pageIndex = 0;
  let y = LETTER.height - MARGIN;

  const maxWidth = LETTER.width - MARGIN * 2;

  // Sanitize entire text first to handle all Unicode characters
  const sanitizedText = sanitizeForWinAnsi(text);
  
  // Split text into paragraphs (by double newlines) instead of single lines
  // This allows us to track paragraph length and apply spacing rules
  const paragraphs = sanitizedText.split(/\n\n+/).filter(p => p.trim());
  
  const MIN_LINES_PER_PARAGRAPH = 10; // Minimum lines before adding spacing between paragraphs

  // Helper function to detect if a paragraph is part of the header
  const isHeaderParagraph = (paragraph: string, paraIndex: number): boolean => {
    // Header is typically in the first few paragraphs
    if (paraIndex > 5) return false; // Header shouldn't be beyond 5th paragraph
    
    const text = paragraph.toLowerCase();
    // Check for header patterns
    const headerPatterns = [
      /^\d{1,2}\s+\w+\s+\d{4}/, // Date pattern (e.g., "January 3, 2026")
      /^re:\s*form/i, // "Re: Form..."
      /^dear\s+(sir|madam|officer)/i, // "Dear Sir or Madam"
      /u\.s\.\s+citizenship\s+and\s+immigration/i, // USCIS address
      /p\.o\.\s+box/i, // P.O. Box
      /chicago,\s+il/i, // Chicago address
      /\d{5}/, // ZIP code pattern
    ];
    
    // Check if paragraph contains header patterns
    for (const pattern of headerPatterns) {
      if (pattern.test(text)) {
        return true;
      }
    }
    
    // Check if it's a short line that looks like an address line
    const lines = paragraph.split("\n");
    if (lines.length <= 3 && lines.every(line => line.trim().length < 60)) {
      // Short lines are likely address lines
      return true;
    }
    
    return false;
  };

  for (let paraIndex = 0; paraIndex < paragraphs.length; paraIndex++) {
    const paragraph = paragraphs[paraIndex];
    
    // Check if this is a financial section that should be rendered as a table
    const financialData = extractFinancialData(paragraph);
    
    if (financialData.isFinancialSection && 
        (financialData.financialRequirements || financialData.availableResources)) {
      // Check if there are actual financial values to display
      const hasRequirements = financialData.financialRequirements && (
        financialData.financialRequirements.tuition ||
        financialData.financialRequirements.livingExpenses ||
        financialData.financialRequirements.totalRequired
      );
      
      const hasResources = financialData.availableResources && (
        financialData.availableResources.personalFunds !== undefined ||
        financialData.availableResources.sponsorName ||
        financialData.availableResources.totalAvailable
      );
      
      // Only use special formatting if there are actual financial values
      if (hasRequirements || hasResources) {
        // Calculate the exact section height
        const sectionHeight = calculateFinancialSectionHeight(
          font,
          fontBold,
          FONT_SIZE,
          financialData
        );
        
        // Check if section fits on current page, if not move to next page
        if (y - sectionHeight < MARGIN) {
          const newPage = pdfDoc.addPage([LETTER.width, LETTER.height]);
          pages.push(newPage);
          pageIndex++;
          y = LETTER.height - MARGIN;
        }
        
        // Draw the financial section (clean format without borders)
        y = drawFinancialSection(
          pages[pageIndex],
          font,
          fontBold,
          FONT_SIZE,
          MARGIN,
          y,
          maxWidth,
          financialData
        );
        
        // Check if we need a new page after section
        if (y < MARGIN) {
          const newPage = pdfDoc.addPage([LETTER.width, LETTER.height]);
          pages.push(newPage);
          pageIndex++;
          y = LETTER.height - MARGIN;
        }
        
        continue; // Skip normal paragraph processing
      }
      // If no actual values, fall through to process as normal paragraph
    }
    
    const lines = paragraph.split("\n");
    
    // Track if this is a heading paragraph
    let isHeadingParagraph = false;
    let isPersonalStatementHeading = false;
    let isExhibitListHeading = false;
    let isExhibitListItem = false;
    const isHeader = isHeaderParagraph(paragraph, paraIndex);
    
    // Check first line for heading indicators
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      isPersonalStatementHeading = firstLine === "PERSONAL STATEMENT";
      isExhibitListHeading = firstLine === "EXHIBIT LIST";
      isHeadingParagraph = firstLine.startsWith("##") || isPersonalStatementHeading || isExhibitListHeading;
      // Check if this paragraph is an exhibit list item (starts with "Exhibit X:")
      isExhibitListItem = /^Exhibit\s+[A-Z]:/i.test(firstLine);
    }
    
    // Process all lines in this paragraph and collect wrapped lines
    const allWrappedLines: Array<{ line: string; isHeading: boolean; isHeader: boolean }> = [];
    for (const line of lines) {
      if (line.trim() === "") continue;
      
      const isHeading = line.trim().startsWith("##") || 
                       line.trim() === "PERSONAL STATEMENT" || 
                       line.trim() === "EXHIBIT LIST";
      const currentFont = isHeading ? fontBold : font;
      const sanitizedLine = sanitizeForWinAnsi(line.trim());
      const wrappedLines = wrapTextToLines(sanitizedLine, currentFont, FONT_SIZE, maxWidth);
      
      // Store each wrapped line with its heading and header status
      for (const wrappedLine of wrappedLines) {
        allWrappedLines.push({ line: wrappedLine, isHeading, isHeader });
      }
    }
    
    // Count total lines for this paragraph
    const paragraphLineCount = allWrappedLines.length;
    
    // Special handling for "PERSONAL STATEMENT" or "EXHIBIT LIST" heading
    if (isPersonalStatementHeading || isExhibitListHeading) {
      const isAtTopOfPage = y >= LETTER.height - MARGIN - (LINE_HEIGHT * 2);
      if (!isAtTopOfPage) {
        const newPage = pdfDoc.addPage([LETTER.width, LETTER.height]);
        pages.push(newPage);
        pageIndex++;
        y = LETTER.height - MARGIN;
      } else {
        y = LETTER.height - MARGIN;
      }
    }
    
    // Draw all lines in this paragraph
    for (let lineIndex = 0; lineIndex < allWrappedLines.length; lineIndex++) {
      const { line: wrappedLine, isHeading, isHeader: lineIsHeader } = allWrappedLines[lineIndex];
      const currentFont = isHeading ? fontBold : font;
      
      // Check if we need a new page
      const needed = LINE_HEIGHT;
      if (y - needed < MARGIN) {
        const newPage = pdfDoc.addPage([LETTER.width, LETTER.height]);
        pages.push(newPage);
        pageIndex++;
        y = LETTER.height - MARGIN;
      }
      
      // Final sanitization
      let finalLine = sanitizeForWinAnsi(wrappedLine);
      finalLine = finalLine.split('').map(char => {
        const code = char.charCodeAt(0);
        // Only allow printable ASCII (32-126) and common whitespace (9, 10, 13)
        if ((code >= 32 && code <= 126) || code === 9 || code === 10 || code === 13) {
          return char;
        }
        return '';
      }).join('');
      
      if (finalLine.trim().length > 0) {
        try {
          // Justify text for non-heading, non-header paragraphs (except last line of paragraph)
          let textToDraw = finalLine;
          const isLastLineOfParagraph = lineIndex === allWrappedLines.length - 1;
          
          // Don't justify: headings, header lines, last line of paragraph, or exhibit list items
          if (!isHeading && !lineIsHeader && !isLastLineOfParagraph && !isExhibitListItem) {
            textToDraw = justifyLine(finalLine, currentFont, FONT_SIZE, maxWidth);
          }
          
          pages[pageIndex].drawText(textToDraw, {
            x: MARGIN,
            y,
            size: FONT_SIZE,
            font: currentFont,
            color: rgb(0, 0, 0),
          });
        } catch (error) {
          console.warn(`Failed to draw line in PDF: ${finalLine.substring(0, 50)}...`, error);
        }
      }
      y -= LINE_HEIGHT;
    }
    
    // Add spacing between paragraphs only if paragraph has minimum lines
    // But don't add extra spacing after header paragraphs
    if (paraIndex < paragraphs.length - 1) {
      if (paragraphLineCount >= MIN_LINES_PER_PARAGRAPH && !isHeader) {
        // Paragraph has enough lines and is not header, add spacing (2x LINE_HEIGHT) between paragraphs
        y -= LINE_HEIGHT * 2;
      } else {
        // Paragraph is too short or is header, add minimal spacing (1x LINE_HEIGHT)
        y -= LINE_HEIGHT;
      }
      
      // Check if we need a new page after spacing
      if (y < MARGIN) {
        const newPage = pdfDoc.addPage([LETTER.width, LETTER.height]);
        pages.push(newPage);
        pageIndex++;
        y = LETTER.height - MARGIN;
      }
    }
  }

  // Add signature line at the end (unless skipped)
  if (!skipSignature) {
    // Check if we need a new page for signature
    const signatureSpaceNeeded = LINE_HEIGHT * 5; // Space for blank lines + signature line
    if (y - signatureSpaceNeeded < MARGIN) {
      const newPage = pdfDoc.addPage([LETTER.width, LETTER.height]);
      pages.push(newPage);
      pageIndex++;
      y = LETTER.height - MARGIN;
    }
    
    // Add blank space before signature line
    y -= LINE_HEIGHT * 3;
    
    // Draw signature line (thin horizontal line)
    const signatureLineWidth = 200;
    const signatureLineX = MARGIN;
    pages[pageIndex].drawRectangle({
      x: signatureLineX,
      y: y - 2,
      width: signatureLineWidth,
      height: 0.5,
      color: rgb(0, 0, 0),
    });
    
    // Add space below the line
    y -= LINE_HEIGHT;
    
    // Draw "Signature" label below the line
    pages[pageIndex].drawText("Signature", {
      x: signatureLineX,
      y: y,
      size: FONT_SIZE - 1,
      font: font,
      color: rgb(0, 0, 0),
    });
  }

  return await pdfDoc.save();
}

