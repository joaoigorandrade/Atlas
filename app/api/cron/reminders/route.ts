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
import { createClient } from "@supabase/supabase-js";
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
  const { data, error } = await admin.from("run_states").select("user_id, snapshot");
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
    const snapshot = row.snapshot as {
      adherence?: AdherenceState;
      language?: Language;
    } | null;
    const adherence = snapshot?.adherence;
    if (!adherence?.reminderOn) continue;
    const metToday = adherence.lastDay === today && adherence.metToday;
    if (metToday) continue;

    const { data: u } = await admin.auth.admin.getUserById(row.user_id);
    const email = u?.user?.email;
    if (!email) continue;
    // The reminder speaks the language the learner's own map is written in.
    const outcome = await sendReminder(email, adherence, maySend, snapshot?.language);
    if (outcome === "sent") sent += 1;
    else if (outcome === "failed") failed += 1;
    else noop += 1;
  }
  logEvent("reminders_run", {
    candidates: data?.length ?? 0,
    sent,
    failed,
    noop,
    req: requestId,
  });
  return withRequestId(NextResponse.json({ ok: true, sent, failed, noop }), requestId);
}
