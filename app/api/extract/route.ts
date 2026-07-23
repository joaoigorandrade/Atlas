// Syllabus/outline extraction (#30): accepts one PDF or plain-text file,
// returns its text to ground the curriculum prompt. Auth-gated like
// /api/generate; size- and type-capped server-side.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_CHARS = 20_000; // matches the generate route's outline cap

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub)
    return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "attach a file" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json(
      { error: "That file is over 10 MB — trim it to the outline pages and try again." },
      { status: 400 },
    );

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
      return NextResponse.json(
        { error: "PDF or plain text only — or just paste the outline as your topic." },
        { status: 400 },
      );
    }
    const trimmed = text.replace(/\s+\n/g, "\n").trim().slice(0, MAX_CHARS);
    if (trimmed.length < 40)
      return NextResponse.json(
        { error: "Couldn't read text from that file (scanned/image-only PDF?) — the typed topic still works." },
        { status: 422 },
      );
    return NextResponse.json({ text: trimmed });
  } catch (err) {
    console.error(
      JSON.stringify({
        evt: "extract_failed",
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      }),
    );
    return NextResponse.json(
      { error: "Couldn't read that file — the typed topic still works." },
      { status: 422 },
    );
  }
}
