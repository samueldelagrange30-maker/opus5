import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
export const metadata: Metadata = { title: "Inscription", robots: { index: false } };
export default function SignupPage() {
  return (
    <div className="container-x flex justify-center pt-16">
      <div className="panel w-full max-w-md p-8">
        <h1 className="mb-2 font-display text-2xl font-black text-white">Créer un compte</h1>
        <p className="mb-6 text-sm text-ink-300">Suivez la valeur de vos collections, créez des listes de souhaits et recevez des alertes de prix.</p>
        <AuthForm mode="signup" />
      </div>
    </div>
  );
}
