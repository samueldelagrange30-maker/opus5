import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { CompareTray } from "@/components/compare";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  metadataBase: new URL(config.siteUrl),
  title: { default: "TCG Vault — Cartes Pokémon & One Piece, prix en direct", template: "%s · TCG Vault" },
  description: "Toutes les cartes et extensions Pokémon TCG et One Piece Card Game : images HD, fiches détaillées, prix en euros actualisés (Cardmarket, TCGplayer, eBay), historique et tendances du marché.",
  openGraph: { type: "website", locale: "fr_FR", siteName: "TCG Vault" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = { themeColor: "#07080c", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body className="min-h-screen font-sans">
        <Header />
        <main className="min-h-[60vh]">{children}</main>
        <Footer />
        <CompareTray />
      </body>
    </html>
  );
}
