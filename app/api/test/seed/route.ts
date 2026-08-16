// The seed route (docs/PLAN-QUALITY.md §1.2) — how a test lands on "Crucible,
// node 7, two gaps open" without replaying onboarding for the fortieth time.
//
// It refuses to exist outside fixture mode: without ATLAS_FIXTURES=1 every
// method 404s, so a production deploy has no writable run state here even if
// the file ships.
//
// In fixture mode it is also the app's whole persistence layer — the browser's
// `run_states` reads and writes come here instead of Postgres (lib/persistence.ts).

import { NextResponse } from "next/server";
import { FIXTURES, seedRun, seededList, seededRuns } from "@/lib/server/fixtures";

const gone = () => new NextResponse(null, { status: 404 });

interface SeedBody {
  subject?: string;
  snapshot?: unknown;
  caches?: unknown;
}

/** `?subject=` for one run, otherwise every run, newest first. */
export async function GET(request: Request) {
  if (!FIXTURES) return gone();
  const subject = new URL(request.url).searchParams.get("subject");
  const runs = seededList();
  return NextResponse.json({
    runs: subject ? runs.filter((r) => r.subject === subject) : runs,
  });
}

export async function POST(request: Request) {
  if (!FIXTURES) return gone();
  let body: SeedBody;
  try {
    body = (await request.json()) as SeedBody;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  if (!subject) return NextResponse.json({ error: "subject required" }, { status: 400 });
  seedRun(subject, {
    ...(body.snapshot === undefined ? null : { snapshot: body.snapshot }),
    ...(body.caches === undefined ? null : { caches: body.caches }),
  });
  return NextResponse.json({ ok: true, subject });
}

/** `?subject=` drops one run; no parameter wipes the store between specs. */
export async function DELETE(request: Request) {
  if (!FIXTURES) return gone();
  const subject = new URL(request.url).searchParams.get("subject");
  if (subject) seededRuns.delete(subject);
  else seededRuns.clear();
  return NextResponse.json({ ok: true });
}
