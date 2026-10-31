"use client";
import { useEffect } from "react";

// Enregistre une consultation (alimente le classement « les plus recherchées »).
export function TrackView({ game, cardId }: { game: string; cardId: string }) {
  useEffect(() => {
    const key = `tv:${game}:${cardId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    navigator.sendBeacon?.("/api/track", JSON.stringify({ game, cardId, kind: "view" }));
  }, [game, cardId]);
  return null;
}
