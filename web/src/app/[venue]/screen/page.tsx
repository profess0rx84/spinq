import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScreenView } from "./ScreenView";

export const dynamic = "force-dynamic";

export default async function ScreenPage({
  params,
}: {
  params: Promise<{ venue: string }>;
}) {
  const { venue } = await params;
  const supabase = await createClient();
  const { data: session } = await supabase.rpc("get_open_session", { p_venue_slug: venue });

  if (!session) notFound();

  return <ScreenView venueSlug={venue} initialSession={session} />;
}
