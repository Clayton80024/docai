/**
 * Sanitize text for PDF rendering (React-PDF and similar).
 * Converts Unicode to ASCII-safe to prevent garbled characters (e.g. •¤•Ÿ•TMŸ in names).
 */

const UNICODE_MAP: Record<string, string> = {
  "À": "A", "Á": "A", "Â": "A", "Ã": "A", "Ä": "A", "Å": "A",
  "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a",
  "È": "E", "É": "E", "Ê": "E", "Ë": "E",
  "è": "e", "é": "e", "ê": "e", "ë": "e",
  "Ì": "I", "Í": "I", "Î": "I", "Ï": "I",
  "ì": "i", "í": "i", "î": "i", "ï": "i",
  "Ò": "O", "Ó": "O", "Ô": "O", "Õ": "O", "Ö": "O",
  "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o",
  "Ù": "U", "Ú": "U", "Û": "U", "Ü": "U",
  "ù": "u", "ú": "u", "û": "u", "ü": "u",
  "Ç": "C", "ç": "c",
  "Ñ": "N", "ñ": "n",
  "Ý": "Y", "ý": "y", "ÿ": "y",
  "\u2013": "-", "\u2014": "-",
  "\u201C": '"', "\u201D": '"',
  "\u2018": "'", "\u2019": "'",
  "\u2026": "...",
  "\u00A0": " ", "\u202F": " ",
  "\u00A7": "S", "\u00A9": "(c)", "\u00AE": "(R)", "\u2122": "(TM)",
  "\u2022": "", "\u00A4": "", "\u0178": "Y",
};

export function sanitizeForPdf(text: string): string {
  if (!text || typeof text !== "string") return "";
  let out = "";
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 128) {
      out += char;
      continue;
    }
    if (UNICODE_MAP[char]) {
      out += UNICODE_MAP[char];
      continue;
    }
    try {
      const n = char.normalize("NFD");
      const ascii = n.replace(/[\u0300-\u036f]/g, "");
      if (ascii.length > 0 && ascii.charCodeAt(0) < 128) {
        out += ascii;
        continue;
      }
    } catch {
      // ignore
    }
    out += "";
  }
  return out.replace(/[ \t]+/g, " ").trim();
}
