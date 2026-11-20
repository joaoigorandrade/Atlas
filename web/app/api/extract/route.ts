// Syllabus/outline extraction (#30): accepts one PDF or plain-text file,
// returns its text to ground the curriculum prompt. Auth-gated like
// /api/generate; size- and type-capped server-side.

import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { apiError, newRequestId, withRequestId } from "@/lib/server/apiError";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_CHARS = 20_000; // matches the generate route's outline cap

export async function POST(request: Request) {
  const requestId = newRequestId();

  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError) {
    logError("auth_unavailable", authError, { req: requestId, at: "extract" });
    return apiError("upstream", { requestId, status: 503 });
  }
  if (!claims?.claims?.sub) return apiError("auth", { requestId });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  // Every branch below is an `invalid` with a `reason`: the four distinctions
  // this route used to draw in English prose are real and worth keeping, so
  // they travel as sub-cases and get their sentence from `lib/errorCopy.ts`.
  if (!(file instanceof File))
    return apiError("invalid", { requestId, reason: "no_file" });
  if (file.size > MAX_BYTES)
    return apiError("invalid", { requestId, reason: "file_too_big" });

  const name = file.name.toLowerCase();
  try {
    let text: string;
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const extracted = await extractText(pdf, { mergePages: true });
      text = extracted.text;
    } else if (
      name.endsWith(".txt") ||
      name.endsWith(".md") ||
      file.type.startsWith("text/")
    ) {
      text = await file.text();
    } else {
      return apiError("invalid", { requestId, reason: "unsupported_type" });
    }
    const trimmed = text.replace(/\s+\n/g, "\n").trim().slice(0, MAX_CHARS);
    if (trimmed.length < 40)
      return apiError("invalid", {
        requestId,
        reason: "no_text",
        status: 422,
      });
    return withRequestId(NextResponse.json({ text: trimmed }), requestId);
  } catch (err) {
    logError("extract_failed", err, { req: requestId });
    return apiError("invalid", {
      requestId,
      reason: "unreadable",
      status: 422,
    });
  }
}
