import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BoothApp } from "./BoothApp";

export const dynamic = "force-dynamic";

export default async function BoothPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/booth/login");

  const { data: profile } = await supabase.from("dj_profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/booth/login");

  let { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("dj_id", user.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) {
    const { data: newId } = await supabase.rpc("start_first_session", {
      p_venue_slug: profile.venue_slug,
      p_venue_name: "My Venue",
    });
    if (!newId) redirect("/booth/login");
    const { data: fresh } = await supabase.from("sessions").select("*").eq("id", newId).single();
    session = fresh;
  }

  return <BoothApp profile={profile} initialSession={session!} />;
}
