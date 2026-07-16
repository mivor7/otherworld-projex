// Lot image uploads — client uploads go directly to Vercel Blob; this route
// only signs the upload token, gated by a wallet session and limited to
// small images. Requires a Blob store connected to the Vercel project
// (BLOB_READ_WRITE_TOKEN is injected automatically).
import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireSession, ApiError } from "@/lib/api";

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        await requireSession();
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
          maximumSizeInBytes: 4 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // URL is returned to the client and stored with the consignment.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 400 }
    );
  }
}
