import { NextResponse } from "next/server";
import { generateCoverLetterPdf } from "@/lib/pdf/cover-letter-pdf";

export async function POST(req: Request) {
  const payload = await req.json();

  // payload deve vir do seu Assembler (após Rules + Sizing + Validator)
  const pdfBytes = await generateCoverLetterPdf(payload);

  return new NextResponse(pdfBytes as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cover-letter.pdf"`,
    },
  });
}

