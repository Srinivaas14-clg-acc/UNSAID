"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

type Stage = "checking" | "signed_out" | "signed_in";

/**
 * Organiser landing screen — the entry point before auth. Signed-out
 * visitors see the framing copy + sign-in trigger; a signed-in organiser is
 * redirected straight to /dashboard. data-state="private" per the brief
 * (this is the pre-commitment moment, ember context).
 */
export default function Home() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getSupabaseBrowserClient } = await import(
          "@/lib/supabase/browser"
        );
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        if (data.user) {
          router.replace("/dashboard");
          setStage("signed_in");
        } else {
          setStage("signed_out");
        }
      } catch {
        // Supabase not configured — fall back to the signed-out landing
        // screen rather than throwing; the sign-in button itself will show
        // its own "not configured" state if actually clicked.
        if (!cancelled) setStage("signed_out");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (stage === "checking" || stage === "signed_in") {
    return (
      <main
        data-state="private"
        className="flex flex-1 flex-col items-center justify-center px-6 py-24"
      >
        <p className="text-text-secondary">Loading…</p>
      </main>
    );
  }

  return (
    <main
      data-state="private"
      className="flex flex-1 flex-col items-center justify-center px-6 py-24"
    >
      <div className="flex w-full max-w-xl flex-col items-center gap-10 text-center">
        <div className="flex flex-col gap-3">
          <h1>Unsaid</h1>
          <p className="max-w-[55ch] text-body text-text-secondary">
            The truth a group already has, returned to everyone at once.
            Write the question. Everyone answers privately.
          </p>
        </div>
        <GoogleSignInButton />
        <p className="max-w-[45ch] text-xs text-text-tertiary">
          Sign in to create and manage sessions. Participants never need an
          account.
        </p>
      </div>
    </main>
  );
}
