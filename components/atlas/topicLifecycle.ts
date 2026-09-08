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
 * A failure here is not fatal, only unwarmed: the map still builds and draws,
 * and the first phase generates on the click the way it used to.
 */
export async function openTopic(
  form: OnboardingForm,
  language: Language | undefined,
  setTopicId: (id: string | null) => void,
): Promise<{ id: string | null; abandon: () => void }> {
  let id: string | null = null;
  try {
    const body: NewTopic = {
      subject: form.topic,
      goal: form.goal,
      interests: form.interests,
      paretoPct: form.paretoPct,
      examDate: form.examDate,
      ...(language ? { language } : null),
    };
    id = (await createTopic(body)).id;
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
      deleteTopic(doomed).catch((e: unknown) => logWarning("abandon_topic_failed", e));
    },
  };
}
