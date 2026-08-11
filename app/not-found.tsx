"use client";

// A real 404 in the app's voice. Renders inside the root layout, so it reads
// its copy the normal way.

import { ErrorState } from "@/components/ErrorState";
import { ERROR_STRINGS } from "@/lib/errorCopy";
import { useT } from "@/lib/i18n";
import { color } from "@/lib/theme";

export default function NotFound() {
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
        kicker={t.notFoundKicker}
        message={t.notFoundTitle}
        body={t.notFoundBody}
        retryLabel={t.backHome}
        onRetry={() => window.location.assign("/")}
      />
    </div>
  );
}
