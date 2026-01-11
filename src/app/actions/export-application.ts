"use server";

import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { aggregateApplicationData } from "@/lib/application-data-aggregator";
import { Document, Packer, Paragraph, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, ImageRun } from "docx";

/**
 * Export complete application package as DOCX
 */
export async function exportApplicationAsDocx(applicationId: string) {
  try {
    const user = await currentUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const supabase = createAdminClient();

    // Verify application belongs to user
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("id, user_id, country, visa_type, status, created_at")
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return { success: false, error: "Application not found or unauthorized" };
    }

    // Type assertion: application is guaranteed to exist at this point
    const app = application as {
      id: string;
      user_id: string;
      country: string;
      visa_type: string;
      status: string;
      created_at: string;
      updated_at: string;
    };

    if (app.user_id !== user.id) {
      return { success: false, error: "Application not found or unauthorized" };
    }

    // Get all uploaded documents
    const { data: uploadedDocuments } = await supabase
      .from("documents")
      .select("*")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: true });

    // Get all generated documents
    const { data: generatedDocuments } = await supabase
      .from("generated_documents")
      .select("*")
      .eq("application_id", applicationId)
      .eq("is_current", true)
      .order("document_type", { ascending: true });

    // Get aggregated application data
    const aggregatedData = await aggregateApplicationData(applicationId);

    // Build document sections
    const children: (Paragraph | Table)[] = [];

    // Title Page
    children.push(
      new Paragraph({
        text: "VISA APPLICATION PACKAGE",
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
      new Paragraph({
        text: `Application ID: ${applicationId.substring(0, 8)}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        text: `Visa Type: ${app.visa_type}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        text: `Country: ${app.country}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        text: `Date: ${new Date().toLocaleDateString()}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
      }),
      new Paragraph({
        text: "",
        spacing: { after: 400 },
      })
    );

    // Applicant Information
    if (aggregatedData.success && aggregatedData.data) {
      children.push(
        new Paragraph({
          text: "APPLICANT INFORMATION",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        })
      );

      const appData = aggregatedData.data;
      const infoRows = [
        ["Name", appData.user.fullName || appData.user.firstName || "Not provided"],
        ["Email", appData.user.email || "Not provided"],
        ["Country", appData.application.country],
        ["Visa Type", appData.application.visaType],
      ];

      if (appData.application.currentAddress) {
        infoRows.push([
          "Address",
          `${appData.application.currentAddress.street}, ${appData.application.currentAddress.city}, ${appData.application.currentAddress.state} ${appData.application.currentAddress.zipCode}`,
        ]);
      }

      const infoTable = new Table({
        rows: infoRows.map(
          ([label, value]) =>
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph(label)],
                  width: { size: 30, type: WidthType.PERCENTAGE },
                }),
                new TableCell({
                  children: [new Paragraph(value)],
                  width: { size: 70, type: WidthType.PERCENTAGE },
                }),
              ],
            })
        ),
        width: { size: 100, type: WidthType.PERCENTAGE },
      });

      children.push(infoTable);
      children.push(new Paragraph({ text: "", spacing: { after: 400 } }));
    }

    // Generated Documents Section
    if (generatedDocuments && generatedDocuments.length > 0) {
      children.push(
        new Paragraph({
          text: "GENERATED DOCUMENTS",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        })
      );

      for (const doc of generatedDocuments) {
        const docTypeLabels: Record<string, string> = {
          cover_letter: "Cover Letter",
          personal_statement: "Personal Statement",
          program_justification: "Program Justification",
          ties_to_country: "Ties to Home Country",
          sponsor_letter: "Sponsor Letter",
          exhibit_list: "Exhibit List",
        };

        children.push(
          new Paragraph({
            text: docTypeLabels[(doc as any).document_type] || (doc as any).document_type,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          }),
          new Paragraph({
            text: `Version ${(doc as any).version} • Generated ${new Date((doc as any).created_at).toLocaleDateString()}`,
            spacing: { after: 200 },
          })
        );

        // Split content into paragraphs
        const contentParagraphs = (doc as any).content.split("\n\n").filter((p: string) => p.trim());
        for (const para of contentParagraphs) {
          children.push(
            new Paragraph({
              text: para.trim(),
              spacing: { after: 200 },
            })
          );
        }

        children.push(new Paragraph({ text: "", spacing: { after: 400 } }));
      }
    }

    // Uploaded Documents Section
    if (uploadedDocuments && uploadedDocuments.length > 0) {
      children.push(
        new Paragraph({
          text: "UPLOADED DOCUMENTS",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        })
      );

      const docTypeLabels: Record<string, string> = {
        passport: "Passport",
        i94: "I-94",
        i20: "I-20",
        bank_statement: "Bank Statement",
        sponsor_bank_statement: "Sponsor Bank Statement",
        assets: "Assets Documents",
        sponsor_assets: "Sponsor Assets",
        scholarship_document: "Scholarship Award Letter",
        other_funding: "Other Funding Source Documents",
        supporting_documents: "Supporting Documents",
      };

      for (const doc of uploadedDocuments) {
        children.push(
          new Paragraph({
            text: `${(doc as any).name} (${docTypeLabels[(doc as any).type] || (doc as any).type})`,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          }),
          new Paragraph({
            text: `Status: ${(doc as any).status} • Uploaded: ${new Date((doc as any).created_at).toLocaleDateString()}`,
            spacing: { after: 200 },
          })
        );

        // Try to download and embed image if it's an image file
        const docAny = doc as any;
        if (docAny.file_url && (docAny.mime_type?.startsWith("image/") || docAny.name?.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i))) {
          try {
            const imageResponse = await fetch(docAny.file_url);
            if (imageResponse.ok) {
              const imageBuffer = await imageResponse.arrayBuffer();
              const imageData = Buffer.from(imageBuffer);

              // Create image run with proper dimensions
              // Note: docx library expects width/height in EMUs (English Metric Units)
              // 1 inch = 914400 EMUs, so 4 inches = 3657600 EMUs
              children.push(
                new Paragraph({
                  children: [
                    new ImageRun({
                      data: imageData,
                      transformation: {
                        width: 3657600, // 4 inches in EMUs
                        height: 3657600, // 4 inches in EMUs
                      },
                    } as any),
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 200 },
                })
              );
            }
          } catch (error) {
            console.error(`Error loading image ${docAny.name}:`, error);
            children.push(
              new Paragraph({
                text: `[Image could not be loaded: ${docAny.file_url}]`,
                spacing: { after: 200 },
              })
            );
          }
        } else {
          // For non-image files, just show the URL
          children.push(
            new Paragraph({
              text: `File URL: ${docAny.file_url}`,
              spacing: { after: 200 },
            })
          );
        }

        children.push(new Paragraph({ text: "", spacing: { after: 400 } }));
      }
    }

    // Create the document
    const doc = new Document({
      sections: [
        {
          children,
        },
      ],
    });

    // Generate the DOCX file
    const buffer = await Packer.toBuffer(doc);
    
    // Convert buffer to base64 string for serialization
    const base64 = Buffer.from(buffer).toString("base64");

    return {
      success: true,
      data: base64, // Base64 encoded string instead of buffer
      fileName: `Application-Package-${applicationId.substring(0, 8)}-${new Date().toISOString().split("T")[0]}.docx`,
    };
  } catch (error: any) {
    console.error("Error exporting application:", error);
    return { success: false, error: error.message || "Failed to export application" };
  }
}

