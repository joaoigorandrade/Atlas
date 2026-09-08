// What every file in this layer needs and nothing else does.
//
// `lib/server/store/` is one data layer split by what it addresses — topics,
// nodes, cards, content — behind the barrel in `index.ts`. It was one file
// until it outgrew the line ceiling, which is the ratchet doing its job:
// four things that are read and written independently are four files.

import type { SupabaseClient } from "@supabase/supabase-js";
import { AtlasError } from "@/lib/errors";

/** Every Postgres failure in this layer, classified once. The `op` is kept for
 *  the log line; what reaches a screen is chosen from the code. */
export function fail(op: string, error: { message: string } | null): never {
  throw new AtlasError("upstream", `${op}: ${error?.message ?? "unknown"}`);
}

export type Db = SupabaseClient;
