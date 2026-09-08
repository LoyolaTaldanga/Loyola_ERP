"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetches server data when the tab regains focus/visibility — enough to
 * surface a substitution assignment made elsewhere without needing a
 * Supabase Realtime subscription yet.
 */
export function RefreshOnFocus() {
  const router = useRouter();

  useEffect(() => {
    function refresh() {
      router.refresh();
    }
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return null;
}
