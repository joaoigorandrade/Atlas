// Fixture-mode persistence: in-memory tables instead of Postgres
// (docs/PLAN-QUALITY.md §1.2).
//
// This used to be a parallel run store the browser reached through
// `/api/test/seed`, which meant fixture mode exercised a *different*
// persistence path than production — the one place a bug is least likely to be
// caught. Now `lib/server/store/` runs unchanged against these tables, and a
// test seeds by writing rows the same way the app does.
//
// Only the operators `store/` actually issues are implemented. That is not a
// mini-PostgREST and must not become one: it is a closed set because there is
// exactly one caller.

import { FIXTURE_USER_ID } from "@/lib/server/fixtures";

/**
 * Fixture-mode persistence: in-memory tables instead of Postgres.
 *
 * This used to be a parallel run store the browser reached through
 * `/api/test/seed`, which meant fixture mode exercised a *different*
 * persistence path than production — the one place a bug is least likely to be
 * caught. Now `lib/server/store.ts` runs unchanged against these tables, and a
 * test seeds by writing rows the same way the app does.
 *
 * Only the operators `store.ts` actually issues are implemented. That is not a
 * mini-PostgREST and must not become one: it is a closed set because there is
 * exactly one caller.
 */
type Row = Record<string, unknown>;

/**
 * Pinned to the process, not to this module.
 *
 * Next compiles each route into its own bundle in dev, so module-level state is
 * per-route: a topic created through `/api/v1/topics` was invisible to
 * `/api/v1/bootstrap` a moment later. The old seed store never hit this because
 * every read and write went through the one `/api/test/seed` route.
 */
const GLOBAL = globalThis as typeof globalThis & {
  __atlasFixtureTables?: Map<string, Row[]>;
};
export const seededTables: Map<string, Row[]> = (GLOBAL.__atlasFixtureTables ??= new Map<
  string,
  Row[]
>());

const rowsOf = (table: string): Row[] => {
  const rows = seededTables.get(table);
  if (rows) return rows;
  const fresh: Row[] = [];
  seededTables.set(table, fresh);
  return fresh;
};

/** Drop every table. What a spec runs between cases. */
export function resetTables(): void {
  seededTables.clear();
}

/** Seed rows directly — the "land on Crucible, node 7" shortcut. */
export function seedTable(table: string, rows: Row[]): void {
  rowsOf(table).push(...rows.map((r) => ({ user_id: FIXTURE_USER_ID, ...r })));
}

type Filter = (row: Row) => boolean;

interface Result {
  data: unknown;
  error: { message: string } | null;
}

/** The keys a table is upserted on, mirroring each table's real constraint. */
const CONFLICT_KEYS: Record<string, string[]> = {
  profiles: ["user_id"],
  topics: ["user_id", "subject"],
  nodes: ["topic_id", "id"],
  edges: ["topic_id", "from_id", "to_id"],
  cards: ["topic_id", "id"],
  node_content: ["topic_id", "node_id", "kind", "variant"],
};

export function fixtureTable(name: string) {
  const filters: Filter[] = [];
  let sort: { column: string; ascending: boolean } | null = null;
  let pending: Result = { data: null, error: null };
  let mode: "select" | "delete" | "write" = "select";

  const matching = () => {
    let rows = rowsOf(name).filter((row) => filters.every((f) => f(row)));
    if (sort) {
      const { column, ascending } = sort;
      rows = [...rows].sort((a, b) => {
        const l = String(a[column] ?? "");
        const r = String(b[column] ?? "");
        return (l < r ? -1 : l > r ? 1 : 0) * (ascending ? 1 : -1);
      });
    }
    return rows;
  };

  const resolve = (): Result => {
    if (mode === "delete") {
      const doomed = new Set(matching());
      const rows = rowsOf(name);
      const kept = rows.filter((row) => !doomed.has(row));
      seededTables.set(name, kept);
      // The cascade Postgres gives us for free. Fixture mode has to do it by
      // hand, and a test that deletes a topic must see the same emptiness a
      // learner does — that is the behaviour worth checking here at all.
      if (name === "topics")
        for (const child of ["nodes", "edges", "cards", "node_content"]) {
          const ids = new Set([...doomed].map((row) => row.id));
          seededTables.set(
            child,
            rowsOf(child).filter((row) => !ids.has(row.topic_id)),
          );
        }
      return { data: [...doomed], error: null };
    }
    if (mode === "write") return pending;
    return { data: matching(), error: null };
  };

  const api = {
    select: () => api,
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return api;
    },
    in: (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]));
      return api;
    },
    lt: (column: string, value: string) => {
      filters.push((row) => String(row[column] ?? "") < value);
      return api;
    },
    order: (column: string, opts?: { ascending?: boolean }) => {
      sort = { column, ascending: opts?.ascending !== false };
      return api;
    },
    limit: () => api,
    delete: () => {
      mode = "delete";
      return api;
    },
    insert: async (rows: Row | Row[]) => {
      for (const row of [rows].flat())
        rowsOf(name).push({ user_id: FIXTURE_USER_ID, ...row });
      return { data: null, error: null };
    },
    update: (patch: Row) => {
      mode = "write";
      const applied = () => {
        for (const row of matching()) Object.assign(row, patch);
        pending = { data: null, error: null };
      };
      // The filters arrive after `update()`, so the work waits for the await.
      return {
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          applied();
          return api;
        },
      };
    },
    upsert: (
      rows: Row | Row[],
      opts?: { onConflict?: string; ignoreDuplicates?: boolean },
    ) => {
      mode = "write";
      const keys = opts?.onConflict?.split(",").map((k) => k.trim()) ??
        CONFLICT_KEYS[name] ?? ["id"];
      const written: Row[] = [];
      for (const incoming of [rows].flat()) {
        const row: Row = { user_id: FIXTURE_USER_ID, ...incoming };
        const existing = rowsOf(name).find((r) => keys.every((k) => r[k] === row[k]));
        if (existing) {
          if (!opts?.ignoreDuplicates) Object.assign(existing, row);
          written.push(existing);
        } else {
          if (!row.id && name === "topics") row.id = crypto.randomUUID();
          if (!row.updated_at) row.updated_at = new Date().toISOString();
          rowsOf(name).push(row);
          written.push(row);
        }
      }
      pending = { data: written, error: null };
      return api;
    },
    maybeSingle: async () => {
      const result = resolve();
      const rows = (result.data as Row[] | null) ?? [];
      return { data: rows[0] ?? null, error: result.error };
    },
    single: async () => {
      const result = resolve();
      const rows = (result.data as Row[] | null) ?? [];
      return rows.length
        ? { data: rows[0], error: null }
        : { data: null, error: { message: "no rows" } };
    },
    then: (resolve_: (v: Result) => unknown) => resolve_(resolve()),
  };
  return api;
}
