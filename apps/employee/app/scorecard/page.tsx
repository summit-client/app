"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** My Scorecard lives inside the Clinic Scoreboard now. */
export default function ScorecardRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/scoreboard"); }, [router]);
  return <p className="sub">Opening the scoreboard…</p>;
}
