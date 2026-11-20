"use client";

// What `app/page.tsx` renders when it could not *ask* Supabase whether the
// learner is signed in — as opposed to being told they aren't.
//
// The distinction is the whole point of this file. Before, both cases redirected
// to /login, so a thirty-second Supabase blip looked exactly like being signed
// out: the map gone, the login form back. Nothing was actually lost, but there
// is no way for a learner to know that from a login screen.

import { ErrorState } from "@/components/ErrorState";
import { ERROR_STRINGS } from "@/lib/errorCopy";
import { useT } from "@/lib/i18n";
import { color } from "@/lib/theme";

export default function AuthUnavailable() {
  const t = useT(ERROR_STRINGS);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        background: color.paper,
      }}
    >
      <ErrorState
        kicker={t.context.load}
        message={t.code.upstream}
        body={t.crashBody}
        retryLabel={t.retry}
        onRetry={() => window.location.reload()}
      />
    </div>
  );
}
