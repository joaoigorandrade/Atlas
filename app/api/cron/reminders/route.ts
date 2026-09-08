// Right-moment reminders (#31), scaffold. Vercel Cron hits this hourly; for
// each learner whose reminder is armed and whose target is still unmet today,
// at roughly their usual hour, it sends one nudge. Delivery is gated on
// RESEND_API_KEY — without it the reminder is logged, not sent (no-op scaffold).
//
// Needs SUPABASE_SECRET_KEY to read across users (RLS is per-user by design).
// Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
//
// ponytail: runs once daily (Vercel Hobby caps crons at 1/day) and sends to
// every armed+unmet learner — not the learner's exact "usual hour". Upgrade to
// Pro for an hourly schedule and gate on the stored usualTime for right-moment.

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logError, logEvent } from "@/lib/log";
import { apiError, newRequestId, withRequestId } from "@/lib/server/apiError";
import { supabaseUrl } from "@/lib/supabase/config";
import { localDay, type AdherenceState } from "@/lib/curriculum";
import type { Language } from "@/lib/i18n";

export const maxDuration = 60;

/** What actually happened to one reminder. The caller counts these separately:
 *  a run that reports `sent: 40` while Resend was down is a lie that looks like
 *  a healthy cron. */
type SendOutcome = "sent" | "noop" | "failed";

const REMINDER_STRINGS = {
  en: {
    subject: "Your Atlas queue is ready",
    streak: (n: number) => `A few minutes keeps your ${n}-day streak alive.`,
    start: "A few minutes today starts the streak.",
    open: "Open Atlas",
  },
  "pt-BR": {
    subject: "Sua fila do Atlas está pronta",
    streak: (n: number) =>
      `Alguns minutos mantêm viva sua sequência de ${n} dia${n === 1 ? "" : "s"}.`,
    start: "Alguns minutos hoje começam a sequência.",
    open: "Abrir o Atlas",
  },
} as const;

async function sendReminder(
  email: string,
  adherence: AdherenceState,
  maySend: boolean,
  lang: Language = "en",
): Promise<SendOutcome> {
  const t = REMINDER_STRINGS[lang];
  const streak = adherence.streak;
  const line = streak > 0 ? t.streak(streak) : t.start;
  const key = process.env.RESEND_API_KEY;
  if (!key || !maySend) {
    logEvent("reminder_noop", { email, line, maySend });
    return "noop";
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.REMINDER_FROM || "Atlas <onboarding@resend.dev>",
        to: email,
        subject: t.subject,
        text: `${line}\n\n${t.open}: ${process.env.APP_URL || "https://atlas.local"}`,
      }),
    });
    // A 4xx from Resend is a failure that never throws — counting it as sent is
    // exactly the bug this branch exists to close.
    if (!res.ok) {
      logError("reminder_send_failed", new Error(`resend ${res.status}`), {
        email,
      });
      return "failed";
    }
    return "sent";
  } catch (err) {
    logError("reminder_send_failed", err, { email });
    return "failed";
  }
}

export async function GET(request: Request) {
  const requestId = newRequestId();
  const secret = process.env.CRON_SECRET;
  const authed = !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
  if (secret && !authed) return apiError("auth", { requestId });

  // Fail-safe: never send real email on an unauthenticated hit. Without
  // CRON_SECRET the endpoint is open (Vercel Hobby cron can't send the header
  // reliably), so an unauthed run is allowed to compute but is forced to no-op
  // its sends — set CRON_SECRET before RESEND_API_KEY to enable real delivery.
  const maySend = authed;

  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!serviceKey) {
    logEvent("reminders_skipped", { reason: "no service key", req: requestId });
    return withRequestId(
      NextResponse.json({ ok: true, sent: 0, skipped: "no service key" }),
      requestId,
    );
  }

  const admin = createClient(supabaseUrl(), serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Adherence is the learner's, not a topic's — one row each, instead of the
  // old scan over every run_states row looking for the freshest copy.
  const { data, error } = await admin
    .from("profiles")
    .select("user_id, language, streak, best, freezes, last_day, met_today, usual_time, reminder_on, history")
    .eq("reminder_on", true);
  // Log the database's account of itself; don't publish it.
  if (error) {
    logError("reminders_read_failed", error, { req: requestId });
    return apiError("unknown", { requestId });
  }

  const today = localDay();
  let sent = 0;
  let failed = 0;
  let noop = 0;
  for (const row of data ?? []) {
    const adherence: AdherenceState = {
      streak: row.streak,
      best: row.best,
      freezes: row.freezes,
      lastDay: row.last_day,
      metToday: row.met_today,
      usualTime: row.usual_time,
      reminderOn: row.reminder_on,
      history: row.history ?? [],
    };
    const metToday = adherence.lastDay === today && adherence.metToday;
    if (metToday) continue;

    const { data: u } = await admin.auth.admin.getUserById(row.user_id);
    const email = u?.user?.email;
    if (!email) continue;
    // The reminder speaks the language the learner's own map is written in.
    const outcome = await sendReminder(
      email,
      adherence,
      maySend,
      (row.language as Language | null) ?? undefined,
    );
    if (outcome === "sent") sent += 1;
    else if (outcome === "failed") failed += 1;
    else noop += 1;
  }
  // The shared caches have never had a lifecycle: rows abandoned by a
  // CONTENT_CACHE_VERSION bump are simply never addressed again, and nothing
  // ever removed them. This is the only daily cron the plan allows, so the
  // prune rides along at the tail of it, after the sends that people notice.
  const pruned = await prune(admin, requestId);

  logEvent("reminders_run", {
    candidates: data?.length ?? 0,
    sent,
    failed,
    noop,
    pruned,
    req: requestId,
  });
  return withRequestId(
    NextResponse.json({ ok: true, sent, failed, noop, pruned }),
    requestId,
  );
}

/** Days a cached payload may go unread before it is dropped. Long enough that
 *  a learner returning after a season still opens warm; short enough that a
 *  prompt version nobody addresses any more stops being paid for in storage. */
const CACHE_TTL_DAYS = Number(process.env.CONTENT_CACHE_TTL_DAYS || 90);

/** Drop shared cache rows nothing has read in a season. Best-effort: a failed
 *  prune costs storage, never content. */
async function prune(
  admin: SupabaseClient,
  requestId: string,
): Promise<number> {
  if (CACHE_TTL_DAYS <= 0) return 0;
  const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 86_400_000).toISOString();
  let dropped = 0;
  for (const table of ["content_cache", "speech_cache"] as const) {
    const { data, error } = await admin
      .from(table)
      .delete()
      .lt("last_hit_at", cutoff)
      .select("key");
    if (error) logError("cache_prune_failed", error, { table, req: requestId });
    else dropped += data?.length ?? 0;
  }
  return dropped;
}
