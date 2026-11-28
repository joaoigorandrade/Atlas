// W0.4 / W1.1 / W2.3: topic-level axes come from the map's header, are stamped
// by the server, and never move a cache key while they are unset.
import { beforeEach, describe, expect, it } from "vitest";
import { asLanguageTag, asMapMeta } from "@/lib/curriculum";
import { inherit } from "@/lib/server/generate/mapConcept";
import { resolveJob } from "@/lib/server/job";
import { fixtureSupabase } from "@/lib/server/fixtures";
import { resetTables, seedTable } from "@/lib/server/fixtureTables";
import { withTopicAxes } from "@/lib/server/store/topicAxes";
import { topicNote } from "@/lib/server/generate/topicNote";

const consume = {
  kind: "consume",
  topic: "Espanhol para viagem",
  nodeLabel: "Pedir comida",
  prereqLabels: [],
  interests: "",
  language: "pt-BR",
} as const;

describe("the map's header", () => {
  it("reads leniently and normalises the language tag", () => {
    expect(asLanguageTag("es-es")).toBe("es-ES");
    expect(asLanguageTag("es")).toBeNull();
    const meta = asMapMeta({
      domain: "performative",
      targetLanguage: "es_mx",
      lenses: ["a"],
    });
    expect(meta).toMatchObject({
      domain: "performative",
      targetLanguage: "es-MX",
      lenses: [],
    });
    expect(asMapMeta(undefined).shape).toBe("hierarchy");
  });

  it("nodes inherit the topic's domain unless they say why not", () => {
    expect(inherit({ domain: "executable" }, "general").domain).toBe("general");
    const why = { domain: "formal", domainWhy: "the gradient is derived, not run" };
    expect(inherit(why, "executable").domain).toBe("formal");
  });
});

describe("withTopicAxes", () => {
  const db = fixtureSupabase() as never;
  beforeEach(() => {
    resetTables();
    seedTable("topics", [
      { id: "t", subject: "S", target_language: "es-ES", shape: "scenarios", lens: null },
      { id: "u", subject: "U", shape: "hierarchy" },
      { id: "g", subject: "G", goal: "glance" },
      { id: "e", subject: "E", goal: "exam" },
    ]);
  });

  it("stamps the stored axes and discards a client's forged copy", async () => {
    const out = await withTopicAxes(db, {
      ...consume,
      topicId: "t",
      targetLanguage: "fr-FR",
      locale: "US",
    } as never);
    expect(out).toMatchObject({ targetLanguage: "es-ES", shape: "scenarios" });
    expect((out as { locale?: string }).locale).toBeUndefined();
  });

  it("an unset axis keys to the pre-change row", async () => {
    const plain = resolveJob(consume as never).key;
    const stamped = await withTopicAxes(db, { ...consume, topicId: "u" } as never);
    // Only the one-flow stamp (`quickLook`) is on it; nothing else re-keys it.
    expect(resolveJob(stamped).key).toBe(
      resolveJob({ ...consume, quickLook: true } as never).key,
    );
    const spanish = await withTopicAxes(db, { ...consume, topicId: "t" } as never);
    expect(resolveJob(spanish).key).not.toBe(plain);
  });

  it("every topic is the one flow: stamped as a quick look, whatever its row says", async () => {
    const plain = resolveJob(consume as never).key;
    for (const id of ["e", "g"]) {
      const quick = await withTopicAxes(db, { ...consume, topicId: id } as never);
      expect((quick as { quickLook?: boolean }).quickLook).toBe(true);
      expect(resolveJob(quick).key).not.toBe(plain);
      expect(topicNote(quick as never)).toContain("QUICK LOOK");
    }
  });
});
