// The one place that answers "is this a fixture run?" (docs/PLAN-QUALITY.md §1.1).
//
// `next.config.ts` mirrors ATLAS_FIXTURES into NEXT_PUBLIC_ATLAS_FIXTURES, so
// server and browser read the same flag and can never disagree: a browser that
// thought it was live while the server served fixtures would write fixture
// content into a real Supabase row.
export const FIXTURES = process.env.NEXT_PUBLIC_ATLAS_FIXTURES === "1";
