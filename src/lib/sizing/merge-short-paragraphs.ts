/**
 * Merge short paragraphs to improve layout
 * Prevents paragraphs with less than 35 words from appearing alone
 */

function countWords(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

function isShortParagraph(text: string): boolean {
  return countWords(text) < 35;
}

export function mergeShortParagraphs(
  paragraphs: string[]
): {
  mergedParagraphs: string[];
  actions: Array<{ type: string; index: number }>;
} {
  const merged: string[] = [];
  const actions: Array<{ type: string; index: number }> = [];

  let i = 0;

  while (i < paragraphs.length) {
    const current = paragraphs[i];

    // último parágrafo nunca fica sozinho
    if (i === paragraphs.length - 1) {
      merged.push(current);
      break;
    }

    if (isShortParagraph(current)) {
      const next = paragraphs[i + 1];

      // merge seguro
      merged.push(`${current} ${next}`);
      actions.push({
        type: "MERGED_SHORT_PARAGRAPH",
        index: i
      });

      i += 2; // pula o próximo (já foi usado)
    } else {
      merged.push(current);
      i += 1;
    }
  }

  return {
    mergedParagraphs: merged,
    actions
  };
}














