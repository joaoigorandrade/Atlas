import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mirror the server-named Supabase vars into NEXT_PUBLIC_* so the browser
  // bundle can reach them (.env.local keeps the unprefixed names). Publishable
  // key + URL are safe in the client; RLS is the access control.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
  },
};

export default nextConfig;
