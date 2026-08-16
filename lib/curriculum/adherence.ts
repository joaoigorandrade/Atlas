// ---- Adherence (§13) — the wrapper that decides whether any of this fires ---
// Spacing is worthless unopened and the spiral only spins on return, so this is
// a first-class system, not polish. The #1 quit trigger is breaking a streak and
// feeling it's ruined — so the streak is *forgiving*: one missed day is absorbed
// by a banked freeze instead of resetting to zero. The queue is always framed in
// minutes against the daily target (never a wall of cards), momentum is the map
// lighting up over weeks (the replay on the Map), and the daily loop is short,
// winnable, and ends on a lit node — a good feeling to return to. Content ships a
// sample streak history so the flame → popover → forgiving-freeze story reads as
// designed; in the final product these aggregate the learner's real active days.
import { RetainContent } from "./retain";
import { Language } from "@/lib/i18n";

/** How one day sits in the streak: target met, absorbed by a freeze, missed, or today's pending day. */
export type StreakDayStatus = "hit" | "freeze" | "miss" | "today";

/** The flame + freeze palette — the streak borrows the design's amber, the freeze a cool slate, a miss the ghost ink. */
export const STREAK_COLOR = {
  flame: "#c99a2e",
  freeze: "#6f8fa6",
  miss: "rgba(44,40,35,0.16)",
} as const;

/** One day in the recent streak strip, oldest → newest, ending on today. */
export interface StreakDay {
  /** Single-letter weekday label (M T W T F S S). */
  label: string;
  status: StreakDayStatus;
}

/**
 * The live adherence state — held by AtlasApp, read by the flame, the streak
 * popover, and the done-for-today surface. `streak` already counts today once
 * `metToday` flips; a `freeze` day in `history` is a missed day the streak
 * survived, which is the whole forgiving mechanic made visible.
 */
export interface AdherenceState {
  /** Current streak length in days — a freeze-absorbed day keeps it unbroken. */
  streak: number;
  /** Longest streak on record — the flame popover's high-water mark. */
  best: number;
  /** Freezes banked — each absorbs one missed day before the streak resets. */
  freezes: number;
  /** True once today's target is met — the flame reads lit, the queue reads clear. */
  metToday: boolean;
  /** When the learner usually shows up — tunes the reminder to their rhythm, not midnight. */
  usualTime: string;
  /** Whether the right-moment reminder is armed. */
  reminderOn: boolean;
  /** The last two weeks, oldest → newest, ending on today — the popover strip. */
  history: StreakDay[];
  /** The local calendar day (YYYY-MM-DD) the trailing "today" square refers to —
   *  what makes rollover real instead of resetting per page load (#22). */
  lastDay: string;
}

/** Single-letter weekday label for a date (M T W T F S S). */
function weekdayLetter(d: Date): string {
  return ["S", "M", "T", "W", "T", "F", "S"][d.getDay()];
}

/** The local calendar day as YYYY-MM-DD — all rollover math keys off this. */
export function localDay(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA");
}

/** A freeze is earned every this-many consecutive days (documented mechanic). */
export const FREEZE_EVERY = 7;
/** Freezes bank up to this many — forgiveness, not immunity. */
export const MAX_FREEZES = 3;

/**
 * A fresh learner's adherence state: no fabricated streak — the strip holds
 * only today's pending square, one freeze comes banked (the forgiving
 * mechanic is armed from day one), and the reminder defaults on at a sane
 * evening hour until real usage tunes it.
 */
export function freshAdherence(now: Date = new Date()): AdherenceState {
  return {
    streak: 0,
    best: 0,
    freezes: 1,
    metToday: false,
    usualTime: "7:30pm",
    reminderOn: true,
    history: [{ label: weekdayLetter(now), status: "today" }],
    lastDay: localDay(now),
  };
}

/**
 * Day rollover (#22), pure: called on load and whenever the calendar day may
 * have turned. For every day that passed since `lastDay`:
 * met → the streak already counted it; unmet with a freeze banked → the freeze
 * absorbs it (history shows "freeze", streak holds); unmet with none → the
 * streak resets. Ends with a fresh pending "today" square. Idempotent within
 * the same calendar day.
 */
export function rolloverAdherence(
  state: AdherenceState,
  now: Date = new Date(),
): AdherenceState {
  const today = localDay(now);
  // Older saved runs predate lastDay — adopt today without judging the past.
  const last = state.lastDay || today;
  if (last === today) return state.lastDay ? state : { ...state, lastDay: today };
  const elapsed = Math.max(
    1,
    Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000),
  );
  let { streak, freezes } = state;
  const history = [...state.history];
  const [ly, lm, ld] = last.split("-").map(Number);
  // Judge each passed day: `last` first (its square is the trailing one),
  // then any fully skipped days in between.
  for (let i = 0; i < elapsed; i++) {
    const dayMet = i === 0 && state.metToday;
    if (i > 0)
      history.push({
        label: weekdayLetter(new Date(ly, lm - 1, ld + i)),
        status: "miss",
      });
    if (dayMet) continue; // already counted by markTodayMet
    const idx = history.length - 1;
    if (freezes > 0) {
      freezes -= 1;
      history[idx] = { ...history[idx], status: "freeze" };
    } else {
      streak = 0;
      history[idx] = { ...history[idx], status: "miss" };
    }
  }
  history.push({ label: weekdayLetter(now), status: "today" });
  return {
    ...state,
    streak,
    freezes,
    metToday: false,
    history: history.slice(-14),
    lastDay: today,
  };
}

/** The daily queue, framed honestly — minutes against the target, never a card wall. */
export interface DailyQueue {
  minutes: number;
  cards: number;
}

/** The honest top-bar queue: minutes budget + cards due now, read off the FSRS forecast. */
export function dailyQueue(
  content: RetainContent | null,
  fallbackMinutes: number,
): DailyQueue {
  if (!content) return { minutes: fallbackMinutes, cards: 0 };
  const due = content.forecast?.find((f) => f.tone === "due");
  const cards = due
    ? parseInt(due.count, 10) || content.cards.length
    : content.cards.length;
  return { minutes: content.budgetMin, cards };
}

/**
 * Meeting today's target: light the pending day, advance the streak, mark met.
 * Pure and idempotent — calling it again once the day is in changes nothing, so
 * mastering a node and later clearing the queue both land the same single day.
 */
export function markTodayMet(state: AdherenceState): AdherenceState {
  if (state.metToday) return state;
  const streak = state.streak + 1;
  return {
    ...state,
    metToday: true,
    streak,
    best: Math.max(state.best, streak),
    // Every FREEZE_EVERY consecutive days banks one freeze (capped).
    freezes:
      streak > 0 && streak % FREEZE_EVERY === 0
        ? Math.min(MAX_FREEZES, state.freezes + 1)
        : state.freezes,
    history: state.history.map((d) =>
      d.status === "today" ? { ...d, status: "hit" } : d,
    ),
  };
}

/** Toggle the right-moment reminder on or off. */
export function toggleReminder(state: AdherenceState): AdherenceState {
  return { ...state, reminderOn: !state.reminderOn };
}

/**
 * The flame's one-line status: today's already in and safe, or how a banked
 * freeze protects the streak if today goes unopened — the reassurance that keeps
 * a missed day from feeling like ruin.
 */
export function streakStatus(state: AdherenceState, lang: Language = "en"): string {
  if (lang === "pt-BR") {
    if (state.metToday)
      return `Hoje já contou — a sequência de ${state.streak} dias se mantém. Até logo, por volta das ${state.usualTime}.`;
    if (state.freezes > 0)
      return `Perca hoje e um congelamento absorve — a sequência de ${state.streak} dias sobrevive, sem reiniciar.`;
    return `Nenhum congelamento disponível — limpe a fila de hoje para manter viva a sequência de ${state.streak} dias.`;
  }
  if (state.metToday)
    return `Today's in — the ${state.streak}-day streak holds. See you around ${state.usualTime}.`;
  if (state.freezes > 0)
    return `Miss today and a freeze absorbs it — the ${state.streak}-day streak survives, no reset.`;
  return `No freezes banked — clear today's queue to keep the ${state.streak}-day streak alive.`;
}

/** The reminder nudge copy — tuned to when the learner actually shows up, not dumped at midnight. */
export function reminderCopy(state: AdherenceState, lang: Language = "en"): string {
  if (lang === "pt-BR") {
    return state.reminderOn
      ? `Lembrete marcado para ~${state.usualTime} — quando você costuma aparecer, não à meia-noite.`
      : `Lembretes desativados — avisaríamos por volta das ${state.usualTime}, seu horário de costume.`;
  }
  return state.reminderOn
    ? `Nudge set for ~${state.usualTime} — when you usually show up, not midnight.`
    : `Reminders off — we'd nudge around ${state.usualTime}, your usual time.`;
}
