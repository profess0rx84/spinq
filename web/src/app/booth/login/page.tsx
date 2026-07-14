"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { slugify, randomSuffix } from "@/lib/slug";

export default function BoothLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [venueName, setVenueName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function signIn() {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/booth");
    router.refresh();
  }

  async function signUp() {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    if (!data.session || !data.user) {
      setBusy(false);
      setNotice("Check your email to confirm your account, then sign in.");
      setMode("signin");
      return;
    }

    const slug = slugify(venueName || email.split("@")[0]) + "-" + randomSuffix();
    const { error: profileError } = await supabase
      .from("dj_profiles")
      .insert({ id: data.user.id, email, venue_slug: slug });
    if (profileError) {
      setBusy(false);
      setError(profileError.message);
      return;
    }
    await supabase.rpc("start_first_session", {
      p_venue_slug: slug,
      p_venue_name: venueName || "My Venue",
    });
    setBusy(false);
    router.push("/booth");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg text-text">
      <div className="flex w-[340px] flex-col gap-[22px]">
        <div className="flex flex-col gap-1.5">
          <div className="text-[24px] font-bold tracking-[.04em]">
            SPINQ <span className="font-normal text-text-3">Booth</span>
          </div>
          <div className="text-[13.5px] text-text-2">
            {mode === "signin" ? "Sign in to run requests for your night." : "Create a booth for your venue."}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {mode === "signup" && (
            <input
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              placeholder="Venue name"
              className="rounded-xl bg-surface px-3.5 py-[13px] text-[14px] text-text placeholder:text-text-3"
            />
          )}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            className="rounded-xl bg-surface px-3.5 py-[13px] text-[14px] text-text placeholder:text-text-3"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            className="rounded-xl bg-surface px-3.5 py-[13px] text-[14px] text-text placeholder:text-text-3"
          />
        </div>

        {error && <div className="text-[12.5px] text-red-400">{error}</div>}
        {notice && <div className="text-[12.5px] text-accent">{notice}</div>}

        <div
          onClick={() => (busy ? null : mode === "signin" ? signIn() : signUp())}
          className="cursor-pointer rounded-xl bg-accent py-3.5 text-center text-[15px] font-bold text-on-accent"
        >
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create booth"}
        </div>

        <div
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="cursor-pointer text-center text-[12.5px] text-text-3"
        >
          {mode === "signin" ? "New here? Create a booth" : "Already have a booth? Sign in"}
        </div>

        <div className="flex items-center gap-2.5 rounded-xl bg-surface px-3.5 py-3 text-[12.5px] text-text-2">
          <div className="h-[7px] w-[7px] rounded-full bg-white/30" />
          Requests stay offline until you go live.
        </div>
      </div>
    </div>
  );
}
