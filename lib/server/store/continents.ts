// Continents: maps that belong together.
//
// A continent is a name, the scope offers a too-broad build came back with,
// and the topics that point at it (`topics.continent_id`, `on delete set
// null`, so dissolving one never takes a map with it). It is read inside each
// topic (`TOPIC_COLUMNS` embeds it); this module holds the writes, and the one
// read that generation needs: what the neighbouring maps teach.

import type { ScopeOffer } from "@/lib/api";
import type { Continent } from "@/lib/continents";
import { fail, type Db } from "@/lib/server/store/shared";

export async function createContinent(
  db: Db,
  userId: string,
  body: { name: string; scopes: ScopeOffer[]; topicIds: string[] },
): Promise<Continent> {
  const { data, error } = await db
    .from("continents")
    .insert({ user_id: userId, name: body.name, scopes: body.scopes })
    .select("id, name, scopes")
    .single();
  if (error) fail("createContinent", error);
  const continent = data as Continent;
  if (body.topicIds.length) {
    const { error: moveError } = await db
      .from("topics")
      .update({ continent_id: continent.id })
      .in("id", body.topicIds);
    if (moveError) fail("createContinent/topics", moveError);
  }
  return continent;
}

export async function renameContinent(db: Db, id: string, name: string) {
  const { error } = await db.from("continents").update({ name }).eq("id", id);
  if (error) fail("renameContinent", error);
}

export async function deleteContinent(db: Db, id: string) {
  const { error } = await db.from("continents").delete().eq("id", id);
  if (error) fail("deleteContinent", error);
}

/** Does this continent belong to the caller? A foreign key check ignores RLS,
 *  so a topic could otherwise be pointed at somebody else's continent. */
export async function ownsContinent(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db
    .from("continents")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) fail("ownsContinent", error);
  return !!data;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * What the other maps of this topic's continent teach, one line per sibling,
 * sorted — the prompt reads it as a fence (`boundaryNote`, the map prompt).
 *
 * A charted sibling is its concepts in stage order; an uncharted scope is its
 * offer's note, since its concepts don't exist yet. Gap nodes are left out for
 * the same reason `conceptBoundary` leaves them out: they are per learner.
 * `[]` for a topic outside a continent, which keys to the row it always did.
 *
 * ponytail: every label goes in; cap per sibling if continents get large.
 */
export async function neighboursOf(db: Db, topicId: string): Promise<string[]> {
  const { data: self, error } = await db
    .from("topics")
    .select("subject, continent_id, continent:continents(scopes)")
    .eq("id", topicId)
    .maybeSingle();
  if (error) fail("neighboursOf", error);
  const me = self as {
    subject: string;
    continent_id: string | null;
    continent: { scopes: ScopeOffer[] } | null;
  } | null;
  if (!me?.continent_id) return [];

  const { data: siblings, error: sibError } = await db
    .from("topics")
    .select("id, subject")
    .eq("continent_id", me.continent_id)
    .neq("id", topicId);
  if (sibError) fail("neighboursOf/topics", sibError);
  const members = (siblings ?? []) as { id: string; subject: string }[];
  const { data: nodes, error: nodeError } = members.length
    ? await db
        .from("nodes")
        .select("topic_id, label, is_gap")
        .in(
          "topic_id",
          members.map((m) => m.id),
        )
        .order("g")
        .order("id")
    : { data: [], error: null };
  if (nodeError) fail("neighboursOf/nodes", nodeError);
  return neighbourLines(
    me.subject,
    members,
    ((nodes ?? []) as { topic_id: string; label: string; is_gap?: boolean }[]).filter(
      (n) => !n.is_gap,
    ),
    me.continent?.scopes ?? [],
  );
}

/** The pure half of `neighboursOf` — split out so its format is testable. */
export function neighbourLines(
  subject: string,
  members: { id: string; subject: string }[],
  nodes: { topic_id: string; label: string }[],
  scopes: ScopeOffer[],
): string[] {
  const lines = members.map((m) => {
    const labels = nodes.filter((n) => n.topic_id === m.id).map((n) => n.label);
    const scope = scopes.find((s) => same(s.label, m.subject));
    if (labels.length) return `${m.subject}: ${labels.join(", ")}`;
    return scope ? `${m.subject}: ${scope.note}` : m.subject;
  });
  for (const s of scopes)
    if (!same(s.label, subject) && !members.some((m) => same(m.subject, s.label)))
      lines.push(`${s.label} (not charted yet): ${s.note}`);
  return lines.sort();
}

