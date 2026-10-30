"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { browserSupabase } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    const supabase = browserSupabase();
    if (!supabase) {
      setMessage("Supabase is not configured in this browser yet. Add the project URL and publishable key, then open the link again.");
      return;
    }
    const code = new URLSearchParams(window.location.search).get("code");
    const finish = async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setMessage(error.message);
          return;
        }
      }
      router.replace("/");
    };
    void finish();
  }, [router]);

  return (
    <main className="empty-library">
      <p className="kicker">Account</p>
      <h1>{message}</h1>
    </main>
  );
}
