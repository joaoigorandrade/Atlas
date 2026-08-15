import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mirror the server-named Supabase vars into NEXT_PUBLIC_* so the browser
  // bundle can reach them (.env.local keeps the unprefixed names). Publishable
  // key + URL are safe in the client; RLS is the access control.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
    // Whether this deploy can speak. A bare boolean, never the key: the
    // browser needs to know not to render a read-aloud control it can't use,
    // and that is all it needs to know.
    NEXT_PUBLIC_TTS_ENABLED: process.env.SPEECHIFY_API_KEY ? "1" : "",
    // Fixture mode (docs/PLAN-QUALITY.md §1.1) — mirrored so the browser half
    // of the app knows it too. Never set in production.
    NEXT_PUBLIC_ATLAS_FIXTURES: process.env.ATLAS_FIXTURES === "1" ? "1" : "",
  },
};

export default nextConfig;
