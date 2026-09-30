// Topic-level axes are stamped by the server (W0.4).
//
// A per-node prompt input has to reach four places on two clients or it keys
// silently to the wrong cache row (see `withNeighbours`, which proved the
// cure). Anything that belongs to the *topic* — the continent's neighbours,
// the target language, the locale, the lens, the target, the shape — is read
// from the `topics` row here and stamped onto the body before a job is
// resolved, and any copy a client sent is discarded. Neither client carries
// one. Each is omitted when unset, so a topic without it keys to the row it
// always did.

import { asMapMeta, type MapMeta, type TopicAxes } from "@/lib/curriculum";
import type { GenerateBody } from "@/lib/server/jobInput";
import { neighboursOf } from "@/lib/server/store/continents";
import { fail, type Db } from "@/lib/server/store/shared";

/** `topics` column → body field, for every stamped axis but the neighbours
 *  (which are read off sibling maps, not a column). A wave that adds an axis
 *  adds its column here and to `topicAxes` in `jobInput.ts`. */
export const TOPIC_AXIS_COLUMNS = {
  target_language: "targetLanguage",
  locale: "locale",
  lens: "readingLens",
  shape: "shape",
  target: "target",
} as const satisfies Record<string, keyof GenerateBody>;

type Axes = Partial<Pick<GenerateBody, "neighbours">> & Record<string, unknown>;

async function axesOf(db: Db, topicId: string): Promise<Axes> {
  const columns = Object.keys(TOPIC_AXIS_COLUMNS);
  const [neighbours, row] = await Promise.all([
    neighboursOf(db, topicId),
    columns.length
      ? db
          .from("topics")
          .select(columns.join(", "))
          .eq("id", topicId)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) fail("topicAxes", error);
            return (data ?? {}) as Record<string, unknown>;
          })
      : Promise.resolve({} as Record<string, unknown>),
  ]);
  const out: Axes = neighbours.length ? { neighbours } : {};
  for (const [column, field] of Object.entries(TOPIC_AXIS_COLUMNS) as [
    string,
    string,
  ][]) {
    const v = row[column];
    // `hierarchy` is what every map was before shapes: it keys to the old row.
    if (v != null && v !== "" && !(field === "shape" && v === "hierarchy"))
      out[field] = v;
  }
  return out;
}

/** Strip every topic axis a client sent, then stamp the stored ones. One read
 *  per topic however many items share it (`memo`). */
export async function withTopicAxes<T extends GenerateBody>(
  db: Db,
  body: T,
  memo?: Map<string, Promise<Axes>>,
): Promise<T> {
  const rest = { ...body } as unknown as Record<string, unknown>;
  delete rest.neighbours;
  for (const field of Object.values(TOPIC_AXIS_COLUMNS) as string[]) delete rest[field];
  if (!body.topicId) return rest as unknown as T;
  let pending = memo?.get(body.topicId);
  if (!pending) {
    pending = axesOf(db, body.topicId);
    memo?.set(body.topicId, pending);
  }
  return { ...rest, ...(await pending) } as unknown as T;
}

/** The axes as bootstrap returns them, from the topic's own row. */
export const AXIS_COLUMNS =
  "target_language, jurisdictional, locale, lenses, lens, shape, target";

export function axesFromRow(row: Record<string, unknown>): TopicAxes {
  const meta = asMapMeta({ ...row, targetLanguage: row.target_language });
  return {
    targetLanguage: meta.targetLanguage,
    jurisdictional: row.jurisdictional === true,
    locale: typeof row.locale === "string" ? row.locale : null,
    lenses: meta.lenses,
    lens: typeof row.lens === "string" && row.lens ? row.lens : null,
    shape: meta.shape,
    target: (row.target as TopicAxes["target"]) ?? null,
  };
}

/**
 * Stamp what a map says about itself onto its topic — the server's half of
 * the header (W1.1, W2.3, W2.5, W2.6, W9.1). Awaited before the build's
 * response closes, so the client's reload after it reads the stamped row.
 *
 * The locale is the learner's country, and only for a jurisdictional topic:
 * linear algebra keeps its shared cache row whoever studies it.
 */
export async function stampTopicMeta(
  db: Db,
  userId: string,
  topicId: string,
  meta: MapMeta,
): Promise<void> {
  let locale: string | null = null;
  if (meta.jurisdictional) {
    const [{ data }, { data: topic }] = await Promise.all([
      db.from("profiles").select("country").eq("user_id", userId).maybeSingle(),
      db.from("topics").select("language").eq("id", topicId).maybeSingle(),
    ]);
    // A learner whose device never told us falls back to the country the
    // run's language implies, where one does — pt-BR is Brazil's.
    locale =
      (data as { country?: string } | null)?.country ??
      ((topic as { language?: string } | null)?.language === "pt-BR" ? "BR" : null);
  }
  const { error } = await db
    .from("topics")
    .update({
      map_domain: meta.domain,
      target_language: meta.targetLanguage,
      jurisdictional: meta.jurisdictional,
      locale,
      lenses: meta.lenses,
      shape: meta.shape,
    })
    .eq("id", topicId);
  if (error) fail("stampTopicMeta", error);
}
