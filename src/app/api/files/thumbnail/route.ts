import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * API Route to generate PDF thumbnails
 * GET /api/files/thumbnail?fileUrl=... or ?documentId=...
 * 
 * This route validates access and returns the file URL for client-side rendering
 * or attempts server-side rendering if canvas is available
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const fileUrl = searchParams.get("fileUrl");
    const documentId = searchParams.get("documentId");

    if (!fileUrl && !documentId) {
      return NextResponse.json(
        { error: "fileUrl or documentId is required" },
        { status: 400 }
      );
    }

    let finalFileUrl = fileUrl;

    // If documentId is provided, fetch the file URL from database and validate access
    if (documentId && !fileUrl) {
      const supabase = createAdminClient();
      const { data: document, error: docError } = await (supabase
        .from("documents") as any)
        .select("file_url, application_id, user_id")
        .eq("id", documentId)
        .single();

      if (docError || !document) {
        return NextResponse.json(
          { error: "Document not found" },
          { status: 404 }
        );
      }

      // Verify user has access to this document
      if (document.user_id !== user.id) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 403 }
        );
      }

      finalFileUrl = document.file_url;
    }

    if (!finalFileUrl) {
      return NextResponse.json(
        { error: "File URL not found" },
        { status: 404 }
      );
    }

    // Check if it's a PDF
    if (!finalFileUrl.toLowerCase().endsWith(".pdf") && 
        !finalFileUrl.includes(".pdf")) {
      return NextResponse.json(
        { error: "File is not a PDF" },
        { status: 400 }
      );
    }

    // Try server-side rendering with canvas if available
    try {
      // Dynamic import to check if canvas is available
      // @ts-ignore - canvas may not be installed
      const canvasModule = await import("canvas").catch(() => null);
      
      if (canvasModule) {
        // @ts-ignore - canvas types may not be available
        const { createCanvas } = canvasModule;
        
        // Try to download PDF using Supabase client first (more reliable)
        let pdfBytes: Uint8Array;
        const supabase = createAdminClient();
        
        // Extract file path from Supabase Storage URL
        // URL format: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
        const urlMatch = finalFileUrl.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/);
        
        if (urlMatch) {
          const [, bucket, filePath] = urlMatch;
          try {
            // Download using Supabase Storage API (more reliable than public URL fetch)
            const { data, error: downloadError } = await supabase.storage
              .from(bucket)
              .download(filePath);
            
            if (downloadError || !data) {
              console.error("Failed to download from Supabase Storage:", downloadError);
              // Fall back to public URL fetch
              throw new Error("Supabase download failed");
            }
            
            const arrayBuffer = await data.arrayBuffer();
            pdfBytes = new Uint8Array(arrayBuffer);
          } catch (supabaseError) {
            // Fall back to public URL fetch
            console.log("Falling back to public URL fetch");
            const pdfResponse = await fetch(finalFileUrl, {
              headers: {
                "Accept": "application/pdf",
              },
            });

            if (!pdfResponse.ok) {
              console.error(`Failed to fetch PDF from ${finalFileUrl}:`, pdfResponse.status, pdfResponse.statusText);
              throw new Error(`Failed to fetch PDF: ${pdfResponse.status} ${pdfResponse.statusText}`);
            }

            const pdfBuffer = await pdfResponse.arrayBuffer();
            pdfBytes = new Uint8Array(pdfBuffer);
          }
        } else {
          // Not a Supabase Storage URL, use direct fetch
          const pdfResponse = await fetch(finalFileUrl, {
            headers: {
              "Accept": "application/pdf",
            },
          });

          if (!pdfResponse.ok) {
            console.error(`Failed to fetch PDF from ${finalFileUrl}:`, pdfResponse.status, pdfResponse.statusText);
            throw new Error(`Failed to fetch PDF: ${pdfResponse.status} ${pdfResponse.statusText}`);
          }

          const pdfBuffer = await pdfResponse.arrayBuffer();
          pdfBytes = new Uint8Array(pdfBuffer);
        }

        // Use pdfjs-dist to render first page
        const pdfjsLib = await import("pdfjs-dist");
        
        // Set worker for server-side rendering
        // Note: On server-side, we can disable the worker or use a local path
        // For server-side, we'll disable the worker since it's not needed in Node.js
        pdfjsLib.GlobalWorkerOptions.workerSrc = "";

        // Load PDF document
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
        const pdf = await loadingTask.promise;

        // Get first page
        const page = await pdf.getPage(1);

        // Calculate viewport for thumbnail (max 400px width for better quality)
        const viewport = page.getViewport({ scale: 1.0 });
        const scale = Math.min(400 / viewport.width, 2.0); // Cap at 2x
        const scaledViewport = page.getViewport({ scale });

        // Create canvas
        const canvas = createCanvas(scaledViewport.width, scaledViewport.height);
        const context = canvas.getContext("2d");

        // Set white background
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Render PDF page to canvas
        const renderContext = {
          canvasContext: context as any,
          viewport: scaledViewport,
        };

        await page.render(renderContext).promise;

        // Convert canvas to PNG buffer
        const imageBuffer = canvas.toBuffer("image/png");

        // Return image with caching headers
        // Convert Buffer to Uint8Array for NextResponse compatibility
        return new NextResponse(new Uint8Array(imageBuffer), {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=86400, s-maxage=86400", // Cache for 24 hours
          },
        });
      }
    } catch (serverRenderError) {
      // Canvas not available or server-side rendering failed
      // Fall through to return file URL for client-side rendering
      console.log("Server-side rendering not available, using client-side fallback:", serverRenderError);
    }

    // Fallback: Return file URL for client-side rendering
    // The client will use pdf.js to render the thumbnail
    return NextResponse.json(
      { 
        fileUrl: finalFileUrl,
        renderOnClient: true 
      },
      { 
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=3600",
        },
      }
    );
  } catch (error: any) {
    console.error("Error generating PDF thumbnail:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate thumbnail" },
      { status: 500 }
    );
  }
}

