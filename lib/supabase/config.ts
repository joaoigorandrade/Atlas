// Reads Supabase connection settings. `.env.local` uses the unprefixed names
// (SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY); `next.config.ts` mirrors them into
// NEXT_PUBLIC_* so the browser bundle gets them too. Both values are safe to
// expose — the publishable key is designed for client use and RLS is the
// actual access control. The secret key must never be read outside lib/server.

export function supabaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) throw new Error("Missing SUPABASE_URL — see .env.example");
  return url;
}

export function supabasePublishableKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key)
    throw new Error("Missing SUPABASE_PUBLISHABLE_KEY — see .env.example");
  return key;
}
