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
  if (data?.claims) redirect("/");
  const { error } = await searchParams;
  return <LoginScreen linkError={error === "link"} />;
}
