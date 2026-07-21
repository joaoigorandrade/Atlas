import { redirect } from "next/navigation";
import AtlasApp from "@/components/AtlasApp";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return <AtlasApp userEmail={(data.claims.email as string | undefined) ?? ""} />;
}
