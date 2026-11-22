// Where a hydrated run opens: the dashboard on arrival, the map on a reload.
//
// A learner signing in, or opening Atlas in a new tab, is arriving — they land
// on the dashboard, which is home. A reload is not an arrival: it puts them
// back on the map they were working on. The tab remembers which it is in
// `sessionStorage`, and signing in forgets it so a sign-in in the same tab
// still lands home.

const KEY = "atlas.inApp";

/** True the first time this tab hydrates the app (and marks it). */
export function arrivingInTab(): boolean {
  try {
    if (sessionStorage.getItem(KEY)) return false;
    sessionStorage.setItem(KEY, "1");
  } catch {
    // Storage blocked: every load is an arrival.
  }
  return true;
}

/** Called on sign-in, so the app it navigates to lands on the dashboard. */
export function forgetTab(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to forget
  }
}
