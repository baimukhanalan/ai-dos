import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { requirePlatformAdmin, requireUser } from "@/lib/dal/auth";
import { readSession } from "@/lib/session";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage() {
  const session = await readSession();
  if (session?.scope === "platform") {
    const validPlatformSession = await requirePlatformAdmin().then(() => true).catch(() => false);
    if (validPlatformSession) redirect("/platform");
  } else if (session) {
    const validTenantSession = await requireUser().then(() => true).catch(() => false);
    if (validTenantSession) redirect("/portal");
  }
  return (
    <AuthShell>
      <AuthForm mode="login" />
    </AuthShell>
  );
}
