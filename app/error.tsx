"use client";

// The boundary for `app/page.tsx`. A throw that escapes `AtlasApp`'s own
// per-sheet boundaries lands here rather than on Next's default error page.
//
// This still renders inside the root layout, so `LanguageProvider` is above it
// and the copy can be chosen the normal way. `app/global-error.tsx` is the one
// that can't assume that.

import { useEffect } from "react";
import { ErrorState } from "@/components/ErrorState";
import { ERROR_STRINGS } from "@/lib/errorCopy";
import { logError } from "@/lib/log";
import { useT } from "@/lib/i18n";
import { color } from "@/lib/theme";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT(ERROR_STRINGS);

  useEffect(() => {
    logError("app_error_boundary", error, { digest: error.digest });
  }, [error]);

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
        kicker={t.context.crash}
        message={t.code.unknown}
        body={t.crashBody}
        retryLabel={t.retry}
        onRetry={reset}
        secondary={{
          label: t.reload,
          onClick: () => window.location.reload(),
        }}
      />
    </div>
  );
}
