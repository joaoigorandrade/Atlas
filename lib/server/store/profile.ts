// The learner's own row: streak, daily target, reminders.
//
// It used to be copied into every topic's snapshot — so two maps disagreed
// about how many days in a row someone had shown up — and kept a third time in
// the iOS UserDefaults, which agreed with neither.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdherenceState } from "@/lib/curriculum";
import type { Language } from "@/lib/i18n";
import type { Profile, ProfilePatch } from "@/lib/persistence";
import { fail } from "@/lib/server/store/shared";

const PROFILE_COLUMNS =
  "daily_target, language, streak, best, freezes, last_day, met_today, usual_time, reminder_on, history";

type ProfileRow = {
  daily_target: number;
  language: string | null;
  streak: number;
  best: number;
  freezes: number;
  last_day: string;
  met_today: boolean;
  usual_time: string;
  reminder_on: boolean;
  history: AdherenceState["history"];
};

const toProfile = (row: ProfileRow | null): Profile => ({
  dailyTarget: row?.daily_target ?? 15,
  language: (row?.language as Language | null) ?? null,
  adherence: {
    streak: row?.streak ?? 0,
    best: row?.best ?? 0,
    freezes: row?.freezes ?? 0,
    lastDay: row?.last_day ?? "",
    metToday: row?.met_today ?? false,
    usualTime: row?.usual_time ?? "",
    reminderOn: row?.reminder_on ?? false,
    history: row?.history ?? [],
  },
});

export async function getProfile(db: SupabaseClient, userId: string): Promise<Profile> {
  const { data, error } = await db.from("profiles").select(PROFILE_COLUMNS).maybeSingle();
  if (error) fail("getProfile", error);
  // A learner with no row yet is not an error — it is a learner who has never
  // finished a day. The defaults are the answer.
  void userId;
  return toProfile(data as ProfileRow | null);
}

export async function patchProfile(
  db: SupabaseClient,
  userId: string,
  patch: ProfilePatch,
): Promise<Profile> {
  const a = patch.adherence ?? {};
  const row = {
    user_id: userId,
    ...(patch.dailyTarget !== undefined ? { daily_target: patch.dailyTarget } : null),
    ...(patch.language !== undefined ? { language: patch.language } : null),
    ...(a.streak !== undefined ? { streak: a.streak } : null),
    ...(a.best !== undefined ? { best: a.best } : null),
    ...(a.freezes !== undefined ? { freezes: a.freezes } : null),
    ...(a.lastDay !== undefined ? { last_day: a.lastDay } : null),
    ...(a.metToday !== undefined ? { met_today: a.metToday } : null),
    ...(a.usualTime !== undefined ? { usual_time: a.usualTime } : null),
    ...(a.reminderOn !== undefined ? { reminder_on: a.reminderOn } : null),
    ...(a.history !== undefined ? { history: a.history } : null),
  };
  const { data, error } = await db
    .from("profiles")
    .upsert(row, { onConflict: "user_id" })
    .select(PROFILE_COLUMNS)
    .single();
  if (error) fail("patchProfile", error);
  return toProfile(data as ProfileRow);
}
