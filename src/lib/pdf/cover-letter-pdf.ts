import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type CoverLetterSections = {
  headerAddressLines: string[]; // ex: ["705 Powers Ferry Road Southeast", "Marietta, Georgia 30067"]
  dateLine: string;             // ex: "December 18, 2025"
  uscisAddressLines: string[];  // ex: ["U.S. Citizenship and Immigration Services", "P.O. Box ...", "..."]
  reLine: string;               // ex: "Re: Form I-539 – Application to Extend/Change Nonimmigrant Status"

  bodyParagraphs: string[];     // parágrafos do corpo (já "sized")
  closingLine?: string;         // ex: "Respectfully submitted,"
  signatureName: string;        // ex: "Joao Antonio Pereira"
};

type PdfLayout = {
  pageSize?: "LETTER"; // expandível
  marginIn?: number;   // default 1 inch
  fontSize?: number;   // default 12
  lineHeight?: number; // default 14
};

const LETTER = { width: 612, height: 792 }; // points (8.5*72, 11*72)

/**
 * Sanitize text to ASCII-compatible characters for WinAnsi encoding
 * Converts Unicode characters to their closest ASCII equivalents
 */
function sanitizeForWinAnsi(text: string): string {
  // Common Unicode character mappings to ASCII
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
      if (ascii.charCodeAt(0) < 128) {
        return ascii;
      }
    } catch (e) {
      // If normalization fails, skip the character
    }
    // If all else fails, replace with '?' or remove
    return '?';
  }).join('');
}

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function splitIntoWords(text: string) {
  return normalizeSpaces(text).split(" ");
}

function wrapTextToLines(
  text: string,
  font: any,
  fontSize: number,
  maxWidth: number
): string[] {
  // Sanitize text first to handle Unicode characters
  const sanitizedText = sanitizeForWinAnsi(text);
  const words = splitIntoWords(sanitizedText);
  const lines: string[] = [];
  let current = "";

  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    const testWidth = font.widthOfTextAtSize(test, fontSize);

    if (testWidth <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      // word longer than line: hard cut (rare)
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

function ensureSpaceOrNewPage(opts: {
  pdfDoc: PDFDocument;
  pages: any[];
  currentPageIndex: number;
  y: number;
  needed: number;
  margin: number;
  lineHeight: number;
}) {
  const { pages, currentPageIndex, y, needed, margin } = opts;
  const page = pages[currentPageIndex];
  const bottomY = margin;

  if (y - needed >= bottomY) {
    return { pageIndex: currentPageIndex, y };
  }

  const newPage = opts.pdfDoc.addPage([LETTER.width, LETTER.height]);
  pages.push(newPage);
  const newY = LETTER.height - margin;
  return { pageIndex: currentPageIndex + 1, y: newY };
}

export async function generateCoverLetterPdf(
  input: CoverLetterSections,
  layout: PdfLayout = {}
): Promise<Uint8Array> {
  const marginIn = layout.marginIn ?? 1;
  const margin = marginIn * 72;

  const fontSize = layout.fontSize ?? 12;
  const lineHeight = layout.lineHeight ?? 14;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  const pages: any[] = [];
  pages.push(pdfDoc.addPage([LETTER.width, LETTER.height]));
  let pageIndex = 0;
  let y = LETTER.height - margin;

  const maxWidth = LETTER.width - margin * 2;

  const drawLine = (text: string, bold = false) => {
    const page = pages[pageIndex];
    // Sanitize text to handle Unicode characters
    const sanitizedText = sanitizeForWinAnsi(text);
    page.drawText(sanitizedText, {
      x: margin,
      y,
      size: fontSize,
      font: bold ? fontBold : font,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight;
  };

  const drawBlankLine = () => {
    y -= lineHeight;
  };

  const drawParagraph = (paragraph: string) => {
    const lines = wrapTextToLines(paragraph, font, fontSize, maxWidth);
    // check page space
    const needed = lines.length * lineHeight + lineHeight; // +1 blank line after
    const checked = ensureSpaceOrNewPage({
      pdfDoc,
      pages,
      currentPageIndex: pageIndex,
      y,
      needed,
      margin,
      lineHeight,
    });
    pageIndex = checked.pageIndex;
    y = checked.y;

    for (const ln of lines) drawLine(ln);
    drawBlankLine();
  };

  // ===== HEADER =====
  for (const l of input.headerAddressLines) drawLine(l);
  drawBlankLine();
  drawLine(input.dateLine);
  drawBlankLine();

  for (const l of input.uscisAddressLines) drawLine(l);
  drawBlankLine();

  drawLine(input.reLine, true);
  drawBlankLine();

  // Greeting
  drawLine("Dear Sir or Madam,");
  drawBlankLine();

  // ===== BODY =====
  for (const p of input.bodyParagraphs) drawParagraph(p);

  // ===== CLOSING + SIGNATURE =====
  const closing = input.closingLine ?? "Respectfully submitted,";
  // ensure room for closing + signature + optional enclosed
  const closingNeeded = lineHeight * 4;
  let checked = ensureSpaceOrNewPage({
    pdfDoc,
    pages,
    currentPageIndex: pageIndex,
    y,
    needed: closingNeeded,
    margin,
    lineHeight,
  });
  pageIndex = checked.pageIndex;
  y = checked.y;

  drawLine(closing);
  drawBlankLine();
  drawLine("_____________________________");
  drawLine(input.signatureName);
  drawBlankLine();

  return await pdfDoc.save();
}

