// The normalized run store — the data layer behind /api/v1.
//
// One topic is a row in `topics`, one concept a row in `nodes`, one card a row
// in `cards`, one generated payload a row in `node_content`. Everything hangs
// off `topics.id` with `on delete cascade`, so deleting a topic is one
// statement and cannot leave anything behind — that guarantee is the schema's,
// not this module's, which is the point of moving it there.
//
// What travels to a client is still the shape the screens already render: a
// graph, a StateMap, a positions map, a card array. The rows are how it is
// *stored*, not how it is drawn. That is what keeps a node drag one UPDATE
// while `useSpiral` and the iOS map keep reading what they always read.
//
// Every function here takes the caller's Supabase client, so RLS is what scopes
// the rows. No service-role client reaches this module.

export * from "./profile";
export * from "./topics";
export * from "./nodes";
export * from "./cards";
export * from "./content";
