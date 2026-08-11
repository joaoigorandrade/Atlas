import { redirect } from "next/navigation";
import LoginScreen from "@/components/auth/LoginScreen";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  // No outage branch here on purpose: failing to confirm a session on the login
  // screen just means showing the login screen, which is already the right
  // answer. The asymmetry with `app/page.tsx` is the point.
  if (data?.claims) redirect("/");
  const { error } = await searchParams;
  return <LoginScreen notice={error} />;
}
