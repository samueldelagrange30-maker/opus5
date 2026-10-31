"use client";
import { useEffect } from "react";

export function TrackSearch({ q, game }: { q: string; game?: string }) {
  useEffect(() => {
    navigator.sendBeacon?.("/api/track", JSON.stringify({ q, game, kind: "search" }));
  }, [q, game]);
  return null;
}
