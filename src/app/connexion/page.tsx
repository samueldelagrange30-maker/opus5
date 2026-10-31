import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
export const metadata: Metadata = { title: "Connexion", robots: { index: false } };
export default function LoginPage() {
  return (
    <div className="container-x flex justify-center pt-16">
      <div className="panel w-full max-w-md p-8"><h1 className="mb-6 font-display text-2xl font-black text-white">Connexion</h1><AuthForm mode="login" /></div>
    </div>
  );
}
