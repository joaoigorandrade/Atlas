// What every file in this layer needs and nothing else does.
//
// `lib/server/store/` is one data layer split by what it addresses — topics,
// nodes, cards, content — behind the barrel in `index.ts`. It was one file
// until it outgrew the line ceiling, which is the ratchet doing its job:
// four things that are read and written independently are four files.

import type { SupabaseClient } from "@supabase/supabase-js";
import { AtlasError } from "@/lib/errors";

/** Every Postgres failure in this layer, classified once. The `op` is kept for
 *  the log line; what reaches a screen is chosen from the code.
 *
 *  PostgREST rejects the session itself with `PGRST301` — an expired token, or
 *  one whose `iat` is a second ahead of the database's clock. `getClaims()`
 *  checks only `exp` and the signature, so auth passes and the very next query
 *  is the thing that fails. Classed as `upstream` it reached the learner as
 *  "the model didn't answer", with a retry that could never succeed; as `auth`
 *  the client refreshes the session, which is the one thing that fixes it. */
export function fail(
  op: string,
  error: { message: string; code?: string } | null,
): never {
  const message = `${op}: ${error?.message ?? "unknown"}`;
  if (error?.code === "PGRST301" || /\bJWT\b/.test(error?.message ?? ""))
    throw new AtlasError("auth", message);
  throw new AtlasError("upstream", message);
}

export type Db = SupabaseClient;

type Page<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string; code?: string } | null;
}>;

/**
 * Every row, however many pages that takes.
 *
 * PostgREST caps a response at the project's `db-max-rows` — 1000 by default,
 * measured — and says nothing when it truncates. A read that assumes it got
 * everything then assembles a confident lie: `loadLibrary` seeds an empty array
 * per topic and fills what arrived, so the topics past the cut render as blank
 * maps with no error anywhere. Paging until a short page arrives is the only
 * thing that actually fixes it; a bigger `.limit()` cannot exceed the cap.
 */
export async function readAll<T>(
  page: (from: number, to: number) => Page<T>,
  op: string,
) {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) fail(op, error);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) return out;
  }
}
