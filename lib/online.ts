"use client";

// Whether the browser thinks it has a network.
//
// This exists because "offline" is the one failure the app can see coming, and
// the only one where the honest thing to say is "nothing is wrong, wait". Every
// other error is a surprise; this one is a state, so it gets a banner rather
// than a toast, and it suspends the background warm queue instead of letting it
// grind through its retries against a dead socket.
//
// `navigator.onLine` is famously optimistic — it reports the *interface*, not
// reachability, so a captive portal reads as online. That's fine here: a false
// "online" just means the failure surfaces the ordinary way, through a
// classified fetch error. A false "offline" is the one that would be
// misleading, and browsers don't produce it.

import { useEffect, useState } from "react";

export function useOnline(): boolean {
  // Seeded true, never from `navigator` during render: the server has no
  // navigator, and disagreeing with it on the first client render is a
  // hydration mismatch. The effect below corrects it before paint.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const read = () => setOnline(navigator.onLine !== false);
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);

  return online;
}
