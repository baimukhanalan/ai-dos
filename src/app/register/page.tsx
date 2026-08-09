import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { readSession } from "@/lib/session";

export const metadata: Metadata = { title: "Создать клинику" };

export default async function RegisterPage() {
  if (await readSession()) redirect("/portal");
  return (
    <AuthShell>
      <AuthForm mode="register" />
    </AuthShell>
  );
}
