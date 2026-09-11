"use client";

// Creating the topic a build is about to fill, and undoing it when the build
// produces nothing.

import { createTopic, deleteTopic, type NewTopic } from "@/lib/persistence";
import { logWarning } from "@/lib/log";
import type { Language } from "@/lib/i18n";
import type { OnboardingForm } from "@/lib/curriculum";

/**
 * Create the topic *before* the map is generated.
 *
 * The server warms the new map's frontier the moment it lands — while the
 * learner is still answering placement questions — and it needs a topic to file
 * what it writes under. Every exit that produces no map calls `abandon`; an
 * empty topic must never reach the dashboard.
 *
 * `abandon` undoes *this call*, and nothing else. Creating a topic is an upsert
 * on `(user_id, subject)`, so re-running onboarding on a subject the learner
 * already has hands back their existing topic — and a build that then failed,
 * or came back too broad to map, used to answer that by deleting it. The
 * cascade took the map, the mastery states, the card deck and every generated
 * payload with it. Only a topic the server reports as `created` may be undone.
 *
 * A failure here is not fatal, only unwarmed: the map still builds and draws,
 * and the first phase generates on the click the way it used to.
 */
export async function openTopic(
  form: OnboardingForm,
  language: Language | undefined,
  setTopicId: (id: string | null) => void,
): Promise<{ id: string | null; abandon: () => void }> {
  let id: string | null = null;
  let mine = false;
  try {
    const body: NewTopic = {
      subject: form.topic,
      goal: form.goal,
      interests: form.interests,
      paretoPct: form.paretoPct,
      examDate: form.examDate,
      ...(language ? { language } : null),
    };
    const topic = await createTopic(body);
    id = topic.id;
    mine = topic.created === true;
    setTopicId(id);
  } catch (err) {
    logWarning("create_topic_failed", err);
  }
  return {
    id,
    abandon: () => {
      if (!id) return;
      const doomed = id;
      id = null;
      setTopicId(null);
      // Adopted, not created: the learner's own map of this subject, which
      // this build has no standing to delete. Leaving it is the whole point.
      if (!mine) return;
      deleteTopic(doomed).catch((e: unknown) => logWarning("abandon_topic_failed", e));
    },
  };
}
