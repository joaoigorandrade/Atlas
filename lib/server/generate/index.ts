// The content engine: one module per content kind. Each builds a prompt, asks
// OpenRouter for JSON (generateJson validates + retries once), then
// post-processes into the exact shapes the client renders — layout, ids, and
// gap offsets are computed here, never trusted from the model.

export * from "./map";
export * from "./summary";
export * from "./consume";
export * from "./model";
export * from "./passage";
export * from "./socratic";
export * from "./feynman";
export * from "./connect";
export * from "./crucible";
export * from "./retain";
export * from "./judge";
export * from "./choice";
export * from "./common";
