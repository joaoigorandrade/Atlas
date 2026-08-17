"use client";

// The toast channel and the one place a caught error becomes something a
// learner reads. Split out of AtlasApp (Phase 2.1): it owns its own timer and
// sequence counter, and needs nothing from the run beyond a Supabase client
// and the live UI language.

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSticky, type ToastData } from "@/components/Toast";
import { toAtlasError } from "@/lib/errors";
import { ERROR_STRINGS, errorLines, type ErrorContext } from "@/lib/errorCopy";
import { logWarning } from "@/lib/log";
import type { Language } from "@/lib/i18n";

export interface ToastChannel {
  toast: ToastData | null;
  dismissToast: () => void;
  postToast: (next: Omit<ToastData, "seq">) => number;
  showToast: (message: string, kicker?: string) => void;
  showError: (
    err: unknown,
    opts?: { context?: ErrorContext; retry?: () => void },
  ) => void;
}

export function useToast(
  supabase: SupabaseClient,
  languageRef: React.RefObject<Language>,
): ToastChannel {
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastSeq = useRef(0);

  useEffect(
    () => () => {
      if (toastRef.current) clearTimeout(toastRef.current);
    },
    [],
  );

  const dismissToast = useCallback(() => {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast(null);
  }, []);

  /** Post a toast. `tone` defaults to "info"; an error stays until it is
   *  dismissed or replaced by another error. */
  const postToast = useCallback((next: Omit<ToastData, "seq">) => {
    // `seq` keys the toast, so a second one replays its entrance instead of
    // swapping text inside an element that has already finished animating.
    toastSeq.current += 1;
    const toast: ToastData = { ...next, seq: toastSeq.current };
    setToast((current) => {
      // Priority: a live error is not clobbered by the ordinary chatter that
      // follows it. Half these toasts fire from effects the failure itself
      // set in motion — the screen falls back, the map re-plans — and the
      // learner would watch the one message that mattered get overwritten by
      // "Jumping ahead · …" before they had finished reading it.
      if (current && current.tone === "error" && next.tone !== "error") return current;
      return toast;
    });
    if (toastRef.current) clearTimeout(toastRef.current);
    if (!isSticky(toast))
      toastRef.current = setTimeout(
        () => setToast((c) => (c?.seq === toast.seq ? null : c)),
        next.kicker ? 3400 : 2400,
      );
    return toast.seq;
  }, []);

  const showToast = useCallback(
    (message: string, kicker?: string) => {
      postToast({ message, kicker });
    },
    [postToast],
  );

  /**
   * The one place a caught error becomes something a learner reads.
   *
   * Classify it, choose the sentence in their language, and — when the same
   * call could plausibly work a second time — hand them a button that runs it
   * again. The error's own `message` is upstream prose (an OpenRouter body, a
   * PostgREST complaint) and stays in the log line, next to the request id that
   * ties it to the server's account of the same failure.
   *
   * `declined` never surfaces: it is the warm queue's control flow, not a
   * failure, and a learner has no idea a prefetch was ever attempted.
   */
  const showError = useCallback(
    (err: unknown, opts: { context?: ErrorContext; retry?: () => void } = {}) => {
      const atlas = toAtlasError(err);
      if (atlas.code === "declined") return;
      logWarning("client_error", atlas, {
        context: opts.context,
        code: atlas.code,
        req: atlas.requestId,
      });
      const strings = ERROR_STRINGS[languageRef.current];
      const lines = errorLines(
        languageRef.current,
        atlas.code,
        opts.context,
        atlas.reason,
      );
      // An expired access token is usually recoverable without the learner
      // doing anything: the refresh token outlives it. Try once, silently, and
      // only ask them to sign in if that fails too — being bounced to a login
      // screen mid-session for a token that could have been renewed is the
      // most annoying possible way to be correct.
      if (atlas.code === "auth") {
        supabase.auth
          .refreshSession()
          .then(({ data, error }) => {
            if (error || !data.session) throw error ?? new Error("no session");
            // Recovered. Re-run what failed if we can; otherwise say the action
            // didn't complete — a silent no-op after a silent recovery leaves
            // the learner believing something happened that didn't.
            if (opts.retry) opts.retry();
            else
              postToast({
                ...lines,
                tone: "error",
                dismissLabel: strings.dismiss,
              });
          })
          .catch(() =>
            postToast({
              ...lines,
              tone: "error",
              dismissLabel: strings.dismiss,
              action: {
                label: strings.signIn,
                onClick: () => window.location.assign("/login"),
              },
            }),
          );
        return;
      }
      postToast({
        ...lines,
        tone: "error",
        dismissLabel: strings.dismiss,
        action:
          opts.retry && atlas.retryable
            ? { label: strings.retry, onClick: opts.retry }
            : undefined,
      });
    },
    [postToast, supabase, languageRef],
  );

  return { toast, dismissToast, postToast, showToast, showError };
}
