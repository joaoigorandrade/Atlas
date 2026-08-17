"use client";

// Getting around outside a session, and the two account actions.
//
// Everything here changes which screen is up (or, for exclude/delete, which
// runs exist at all) — none of it touches the map, the spiral or the content
// layer, which is why it sits apart from them.

import { useCallback } from "react";
import { deleteRun } from "@/lib/persistence";
import { emptyGraph } from "@/lib/curriculum";
import { AtlasError, codeForStatus, isErrorCode } from "@/lib/errors";
import { logWarning } from "@/lib/log";
import { useLanguage } from "@/lib/i18n";
import { TOAST_STRINGS } from "@/lib/toastCopy";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Screen } from "@/components/atlas/screen";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { createWarmQueue } from "@/lib/warm";

export function useNavigation(deps: {
  run: RunState;
  sessions: SessionState;
  toast: ToastChannel;
  warm: ReturnType<typeof createWarmQueue>;
  supabase: SupabaseClient;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  /** Flips the moment the learner confirms an exclusion, so the pending save
   *  debounces are cleared and no write can re-create the row between the
   *  delete landing and the local run being cleared. */
  setExcluding: (v: boolean) => void;
  /** Selection, queued gaps, the momentum replay and onboarding's own state —
   *  an excluded live map leaves all of it behind too. */
  resetTransient: () => void;
}) {
  const {
    run,
    sessions,
    toast,
    warm,
    supabase,
    setScreen,
    setExcluding,
    resetTransient,
  } = deps;
  const { showToast, showError } = toast;
  const { language } = useLanguage();
  const tc = () => TOAST_STRINGS[language];
  const {
    maps,
    setMaps,
    runSubject,
    refreshMaps,
    setForm,
    setGraph,
    setStates,
    setPositions,
    setSpawnedIds,
    clearRun,
  } = run;
  const { reset: resetSessions } = sessions;

  const signOut = () => {
    // Navigate either way: a failed sign-out still means the learner asked to
    // leave, and /login clears the client session on arrival. The unhandled
    // rejection this used to throw left them sitting on the map instead.
    supabase.auth
      .signOut()
      .catch((err: unknown) => logWarning("sign_out_failed", err))
      .finally(() => {
        window.location.href = "/login";
      });
  };

  /** Delete account + all data (#33). Confirm, then the server wipes the rows. */
  const deleteAccount = () => {
    if (
      !window.confirm(tc().deleteAccount)
    )
      return;
    fetch("/api/account/delete", { method: "POST" })
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => null)) as {
            code?: string;
          } | null;
          throw new AtlasError(
            isErrorCode(body?.code) ? body.code : codeForStatus(r.status),
            `account delete failed (${r.status})`,
            {
              status: r.status,
              requestId: r.headers.get("x-atlas-request-id") ?? undefined,
            },
          );
        }
        window.location.href = "/login";
      })
      .catch((err: unknown) => showError(err, { context: "account" }));
  };

  // ---- Home (dashboard) + profile navigation ---------------------------

  const enterDashboard = () => {
    setScreen("dashboard");
    refreshMaps();
  };
  const enterProfile = () => setScreen("profile");
  const openMap = useCallback(() => setScreen("map"), [setScreen]);
  /** "+ New map" — onboarding builds a new run alongside whatever's saved. */
  const newMap = useCallback(() => setScreen("welcome"), [setScreen]);

  /**
   * "Exclude this topic" on a dashboard map card (confirmed there first): the
   * saved run is deleted outright. Excluding the live map also clears it from
   * memory — graph, mastery states, cards, calibration, every generated cache
   * — and returns to the dashboard with whatever maps remain; onboarding only
   * shows up if that was the learner's last map. Excluding any other map just
   * drops its row and refreshes the grid.
   *
   * `excluding` gates `runActive`, so the debounced writers are already off by
   * the time the delete lands; nothing can re-upsert the row behind it.
   * Adherence is deliberately untouched: the streak is the learner's habit,
   * not the topic's, and fabricating a reset would be the dishonest read.
   */
  const excludeTopic = (subject: string) => {
    setExcluding(true);
    deleteRun(supabase, subject)
      .then(() => {
        if (subject !== runSubject) {
          refreshMaps();
          showToast(tc().excluded(subject));
          return;
        }
        // Every warmed key belongs to node ids that no longer exist.
        warm.clear();
        setGraph(emptyGraph());
        setStates({});
        setPositions({});
        setSpawnedIds(new Set());
        // `clearRun` + the two resets cover the progress, the caches, the
        // sessions and the onboarding state — spelling them out here is how
        // the unfinished teach-backs of an excluded map used to survive into
        // the next run's snapshot.
        resetSessions();
        resetTransient();
        clearRun();
        setForm((prev) => ({ ...prev, topic: "" }));
        const others = maps.filter((m) => m.subject !== subject);
        if (others.length) {
          setMaps(others);
          setScreen("dashboard");
          showToast(tc().excluded(subject));
        } else {
          setScreen("welcome");
          showToast(tc().nameTopicNext, tc().excluded(subject));
        }
      })
      .catch((err: unknown) => showError(err, { context: "exclude" }))
      .finally(() => setExcluding(false));
  };
  const enterSettings = useCallback(() => setScreen("settings"), [setScreen]);
  const exitSettings = useCallback(() => setScreen("map"), [setScreen]);

  return {
    signOut,
    deleteAccount,
    enterDashboard,
    enterProfile,
    openMap,
    newMap,
    excludeTopic,
    enterSettings,
    exitSettings,
  };
}
