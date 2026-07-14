import { createClient } from "@/lib/supabase/client";

// Every guest phone gets a stable anonymous Supabase auth user so RLS can
// tie votes/notifications/"my requests" to a real auth.uid() without ever
// asking for a name or login. supabase-js persists the session in
// localStorage, so the same browser keeps the same identity on reload.
export async function ensureGuestId(): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;

  const { data: signIn, error } = await supabase.auth.signInAnonymously();
  if (error || !signIn.user) throw error ?? new Error("Failed to start guest session");
  return signIn.user.id;
}
