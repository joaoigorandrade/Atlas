// What a map says about itself as a whole — written once, before its concepts,
// in the map's "about" object, and stamped onto the topic by the server
// (`stampTopicMeta`). Every later generation reads it back through
// `withTopicAxes`; neither client carries it into a generation body.

import { asDomain, type Domain } from "./domains";

/** How a topic is best walked (W9.1). `hierarchy` is every map before it. */
export const TOPIC_SHAPES = ["hierarchy", "timeline", "scenarios", "plan"] as const;
export type TopicShape = (typeof TOPIC_SHAPES)[number];

export interface MapMeta {
  /** The topic's own domain — nodes inherit it (W2.3). */
  domain: Domain;
  /** BCP-47 with region, only for a topic that is learning a language (W1.1). */
  targetLanguage: string | null;
  /** What is correct depends on the learner's country (W2.5). */
  jurisdictional: boolean;
  /** Two readings a confessional or contested subject can be studied through (W2.6). */
  lenses: string[];
  shape: TopicShape;
}

/** W5.1: what the learner will be able to do, and how it will be known. */
export interface TopicTarget {
  kind: "exam" | "conversation" | "teach" | "behaviour" | "build";
  text: string;
  /** ISO date, when the target has one. */
  date?: string;
}

/** Every topic-level axis, as bootstrap returns it — the stamped ones and the
 *  ones the learner chose. The client reads them; it never sends them in a
 *  generation body (`withTopicAxes` owns that). */
export interface TopicAxes {
  targetLanguage: string | null;
  jurisdictional: boolean;
  locale: string | null;
  lenses: string[];
  lens: string | null;
  shape: TopicShape;
  target: TopicTarget | null;
}

/** A BCP-47 tag with a region, normalised (`es-es` → `es-ES`), or null. */
export function asLanguageTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = /^([a-zA-Z]{2,3})[-_]([a-zA-Z]{2}|\d{3})$/.exec(raw.trim());
  return m ? `${m[1].toLowerCase()}-${m[2].toUpperCase()}` : null;
}

/** Lenient in every field: a missing or garbled header costs the map its
 *  axes, never the map. */
export function asMapMeta(raw: unknown): MapMeta {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const lenses = Array.isArray(r.lenses)
    ? r.lenses
        .filter((l): l is string => typeof l === "string" && !!l.trim())
        .map((l) => l.trim().slice(0, 80))
    : [];
  return {
    domain: asDomain(r.domain),
    targetLanguage: asLanguageTag(r.targetLanguage),
    jurisdictional: r.jurisdictional === true,
    lenses: lenses.length === 2 ? lenses : [],
    shape: (TOPIC_SHAPES as readonly string[]).includes(r.shape as string)
      ? (r.shape as TopicShape)
      : "hierarchy",
  };
}
