// The seed route (docs/PLAN-QUALITY.md §1.2) — how a test lands on "Crucible,
// node 7, two gaps open" without replaying onboarding for the fortieth time.
//
// It refuses to exist outside fixture mode: without ATLAS_FIXTURES=1 every
// method 404s, so a production deploy has no writable state here even if the
// file ships.
//
// It is no longer a parallel persistence layer. Fixture mode stores real rows
// in real tables (lib/server/fixtures.ts) and the app reads them through the
// same `/api/v1` routes it uses in production; this route only puts rows there
// and takes them away again.

import { NextResponse } from "next/server";
import { FIXTURES, resetTables, seedTable, seededTables } from "@/lib/server/fixtures";

const gone = () => new NextResponse(null, { status: 404 });

interface SeedBody {
  /** Table name → rows to insert. */
  tables?: Record<string, Array<Record<string, unknown>>>;
}

/** `?table=` for one table, otherwise every seeded table. */
export async function GET(request: Request) {
  if (!FIXTURES) return gone();
  const table = new URL(request.url).searchParams.get("table");
  if (table) return NextResponse.json({ rows: seededTables.get(table) ?? [] });
  return NextResponse.json({ tables: Object.fromEntries(seededTables) });
}

export async function POST(request: Request) {
  if (!FIXTURES) return gone();
  let body: SeedBody;
  try {
    body = (await request.json()) as SeedBody;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const tables = body.tables;
  if (!tables || typeof tables !== "object")
    return NextResponse.json({ error: "tables required" }, { status: 400 });
  for (const [table, rows] of Object.entries(tables))
    if (Array.isArray(rows)) seedTable(table, rows);
  return NextResponse.json({ ok: true, tables: Object.keys(tables) });
}

/** Wipes the store between specs. */
export async function DELETE() {
  if (!FIXTURES) return gone();
  resetTables();
  return NextResponse.json({ ok: true });
}
