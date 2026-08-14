import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { readSession } from "@/lib/session";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage() {
  const session = await readSession();
  if (session) redirect(session.scope === "platform" ? "/platform" : "/portal");
  return (
    <AuthShell>
      <AuthForm mode="login" />
    </AuthShell>
  );
}
