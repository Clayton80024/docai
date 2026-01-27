import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { CombinedDocument, type PageContent, type FinancialData } from "./CombinedDocument";

const COVER_BODY_PARAS_PER_PAGE = 3;
const PERSONAL_PARAS_PER_PAGE = 4;
const EXHIBIT_ITEMS_PER_PAGE = 25;

export interface ParsedForPdf {
  coverHeader: string;
  coverBodyParagraphs: string[];
  financial?: FinancialData;
  personalParagraphs: string[];
  applicantName: string;
  exhibitItems: string[];
}

function buildPageContents(parsed: ParsedForPdf): PageContent[] {
  const pages: PageContent[] = [];
  const isFirst = () => pages.length === 0;
  const withFirst = (p: PageContent, letterheadTitle?: string): PageContent =>
    isFirst() ? { ...p, letterhead: true, letterheadTitle: letterheadTitle ?? "DocAI" } : p;

  // Cover: first page has letterhead "COVER LETTER", title, header, first chunk of body
  let coverChunks: string[][] = [];
  for (let i = 0; i < parsed.coverBodyParagraphs.length; i += COVER_BODY_PARAS_PER_PAGE) {
    coverChunks.push(
      parsed.coverBodyParagraphs.slice(i, i + COVER_BODY_PARAS_PER_PAGE)
    );
  }
  if (coverChunks.length === 0 && (parsed.coverHeader || parsed.financial)) {
    coverChunks.push([]);
  }
  // Evitar quebra de página com 1 parágrafo só (órfão/viúva)
  const maxCoverParas = 4;
  for (let i = coverChunks.length - 1; i >= 1; i--) {
    if (coverChunks[i].length === 1 && coverChunks[i - 1].length < maxCoverParas) {
      coverChunks[i - 1] = [...coverChunks[i - 1], ...coverChunks[i]];
      coverChunks.splice(i, 1);
    }
  }

  let coverFirst = true;
  for (const chunk of coverChunks) {
    pages.push(
      withFirst(
        {
          coverTitle: coverFirst,
          coverHeader: coverFirst ? parsed.coverHeader : undefined,
          coverBody: chunk.length > 0 ? chunk : undefined,
        },
        "COVER LETTER"
      )
    );
    coverFirst = false;
  }

  // Financial on its own page if present
  if (parsed.financial) {
    pages.push(withFirst({ financial: parsed.financial }));
  }

  // Personal statement
  const personalChunks: string[][] = [];
  for (let i = 0; i < parsed.personalParagraphs.length; i += PERSONAL_PARAS_PER_PAGE) {
    personalChunks.push(
      parsed.personalParagraphs.slice(i, i + PERSONAL_PARAS_PER_PAGE)
    );
  }
  if (personalChunks.length === 0) {
    personalChunks.push([]);
  }
  personalChunks.forEach((chunk, i) => {
    pages.push({
      ...(i === 0 ? { letterhead: true, letterheadTitle: "PERSONAL STATEMENT" } : {}),
      personalHeading: i === 0,
      personalParagraphs: chunk.length > 0 ? chunk : undefined,
    });
  });

  // Signature
  pages.push(withFirst({ signature: parsed.applicantName }));

  // Exhibit list
  const exhibitChunks: string[][] = [];
  for (let i = 0; i < parsed.exhibitItems.length; i += EXHIBIT_ITEMS_PER_PAGE) {
    exhibitChunks.push(
      parsed.exhibitItems.slice(i, i + EXHIBIT_ITEMS_PER_PAGE)
    );
  }
  if (exhibitChunks.length === 0) {
    exhibitChunks.push([]);
  }
  exhibitChunks.forEach((chunk, i) => {
    pages.push(
      withFirst({
        exhibitHeading: i === 0,
        exhibitItems: chunk.length > 0 ? chunk : undefined,
      })
    );
  });

  return pages;
}

/**
 * Renders the combined (cover + personal + exhibit list + signature) PDF to a buffer.
 * The result can be loaded with pdf-lib and then addDocumentsToPdf used to append exhibit files.
 */
export async function renderCombinedPdfToBuffer(
  parsed: ParsedForPdf
): Promise<Uint8Array> {
  const pages = buildPageContents(parsed);
  const doc = React.createElement(CombinedDocument, { pages });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- renderToBuffer expects DocumentProps; our CombinedDocument renders Document as root
  const buf = await renderToBuffer(doc as any);
  return new Uint8Array(buf);
}
