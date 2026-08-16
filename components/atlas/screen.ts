// The screens the app can be on, and which of them render as a full-screen
// sheet over the map. Its own module because both AtlasApp and the spiral
// navigate, and neither should have to import the other to say where to go.

export type Screen =
  | "welcome"
  | "building"
  | "diagnostic"
  | "dashboard"
  | "profile"
  | "settings"
  | "map"
  | "consume"
  | "socratic"
  | "feynman"
  | "connect"
  | "crucible"
  | "review"
  | "calibration";

/** Screens that render as a full-screen `Sheet` over the map. */
export const SHEET_SCREENS = new Set<Screen>([
  "consume",
  "socratic",
  "feynman",
  "connect",
  "crucible",
  "review",
  "calibration",
  "settings",
]);
